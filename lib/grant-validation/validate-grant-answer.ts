/**
 * Deterministic validation of a model-generated grant answer against TRUSTED
 * records. Pure: no network, no database, no clock, no randomness.
 *
 * ── What this proves ──────────────────────────────────────────────────────
 *  - Every cited evidence item exists in the supplied trusted set and belongs
 *    to the current organization (and is not rejected).
 *  - Metric/quote claims carry the required structured references.
 *  - A metric reference matches the trusted computed value, unit, and period.
 *  - A quote reference points at a stored quote of this organization, linked to
 *    a cited evidence source, whose stored text matches `quotedText`, and which
 *    has `confirmed_with_evidence` consent plus non-empty consent evidence.
 *  - Model-supplied values never override trusted records: the trusted record is
 *    always the side of the comparison that is believed. Extra fields on the
 *    model output (an "excerpt", a "consent" assertion) are never read.
 *
 * ── What this does NOT prove (explicit limitations) ───────────────────────
 *  1. A valid citation does not mean a NARRATIVE claim is supported. We only
 *     check that the cited evidence exists and is in-tenant. Whether the
 *     excerpt actually supports the sentence needs a human (or a separate,
 *     clearly-labeled model check). Every narrative claim is therefore flagged
 *     `NARRATIVE_CLAIM_UNVERIFIED`; `requiresHumanReview` is then true.
 *  2. Correct structured metadata does not mean `draftText` says the same
 *     thing. The prose is arbitrary text. We run NARROW heuristics only:
 *       - every numeric token in a metric claim's `claimText` must equal the
 *         trusted value (blocking error). One correct number does not excuse
 *         another: "60 concerts for 600 residents" fails. Metric claims are
 *         atomic; other quantities need their own claims;
 *       - claim text, trusted metric values, and stored quote text should
 *         appear in `draftText`; numbers, double-quoted passages (any length),
 *         and prose not covered by any claim in `draftText` are reported as
 *         review flags only, because paraphrase and scare quotes cause false
 *         positives.
 *     Not detected: number words ("six hundred"), unit/period misstatements in
 *     prose, paraphrased or altered quotes, single-quoted quotations, negation,
 *     causal claims, anything semantic.
 *
 * ── Reading the result ────────────────────────────────────────────────────
 *  `valid: true` means ONLY "no blocking structured error". It can and often
 *  does coexist with `requiresHumanReview: true` (every narrative claim, any
 *  unbacked number or quote, uncovered prose). Even `requiresHumanReview: false`
 *  means only "no heuristic fired", never "verified true". UIs must not label
 *  either state as verified or approved.
 *  3. We cannot verify that a computed metric was derived from the cited
 *     evidence items; only that the stated value equals the trusted value.
 *  4. Consent: we check the repository's consent structure on the stored
 *     quote (`consent_status` + `consent_evidence`). We cannot judge whether
 *     the evidence text is adequate, only that it is present and non-blank.
 */
import type { EvidenceItem, QuoteRecord } from "../../types/database.ts";
import type {
    GeneratedClaim,
    GeneratedGrantAnswer,
    GrantAnswerValidationResult,
    GrantReviewFlag,
    GrantValidationContext,
    GrantValidationError,
    TrustedMetric,
} from "./types.ts";

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec =>
    typeof v === "object" && v !== null && !Array.isArray(v);
const isNonBlankString = (v: unknown): v is string =>
    typeof v === "string" && v.trim().length > 0;

/** Collapse whitespace and unify curly quotes; comparison stays case-sensitive. */
function normalizeText(s: string): string {
    return s
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/\s+/g, " ")
        .trim();
}

const normalizeLabel = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Numeric tokens in text. Period labels (e.g. "2025-Q1") are removed first, and
 * numbers that are part of a period label (e.g. the year 2025) are skipped. Other
 * year-like numbers are NOT skipped, so "2000 concerts" is still a quantity.
 */
function extractNumbers(text: string, periods: readonly string[] = []): number[] {
    let t = text;
    const periodNumbers: number[] = [];
    for (const p of periods) {
        if (!p) continue;
        t = t.split(p).join(" ");
        for (const m of p.match(NUMBER_RE) ?? []) periodNumbers.push(Number(m.replace(/,/g, "")));
    }
    t = t.replace(/\bQ[1-4]\b/gi, " ").replace(/\bFY\s?\d{2,4}\b/gi, " ");
    const out: number[] = [];
    for (const m of t.match(NUMBER_RE) ?? []) {
        const n = Number(m.replace(/,+$/, "").replace(/,/g, ""));
        if (!Number.isFinite(n)) continue;
        if (periodNumbers.some((pn) => pn === n)) continue;
        out.push(n);
    }
    return out;
}

const sameNumber = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

export function validateGrantAnswer(
    answer: GeneratedGrantAnswer,
    context: GrantValidationContext,
): GrantAnswerValidationResult {
    const errors: GrantValidationError[] = [];
    const flags: GrantReviewFlag[] = [];
    const err = (code: GrantValidationError["code"], message: string, claimIndex?: number) =>
        errors.push(claimIndex === undefined ? { code, message } : { code, message, claimIndex });
    const flag = (code: GrantReviewFlag["code"], message: string, claimIndex?: number) =>
        flags.push(claimIndex === undefined ? { code, message } : { code, message, claimIndex });

    const finish = (): GrantAnswerValidationResult => ({
        valid: errors.length === 0,
        errors,
        reviewFlags: flags,
        requiresHumanReview: flags.length > 0,
    });

    // Model output is untrusted at runtime regardless of its static type.
    const raw: unknown = answer;
    if (!isRecord(raw)) {
        err("MALFORMED_ANSWER", "Answer is not an object.");
        return finish();
    }
    if (!isNonBlankString(raw.requirementKey)) {
        err("MALFORMED_ANSWER", "requirementKey must be a non-empty string.");
    }
    if (!isNonBlankString(raw.draftText)) {
        err("MALFORMED_ANSWER", "draftText must be a non-empty string.");
    }
    if (!Array.isArray(raw.claims)) {
        err("MALFORMED_ANSWER", "claims must be an array.");
        return finish();
    }
    if (raw.claims.length === 0) {
        err("NO_CLAIMS", "Answer has no claims, so nothing in draftText is traceable to evidence.");
    }
    const draftText = typeof raw.draftText === "string" ? raw.draftText : "";
    const draftNorm = normalizeText(draftText);

    // Index trusted records by id/key. First match wins; callers should pass unique ids.
    const evidenceById = new Map<string, EvidenceItem>();
    for (const e of context.evidenceItems) if (!evidenceById.has(e.id)) evidenceById.set(e.id, e);
    const quoteById = new Map<string, QuoteRecord>();
    for (const q of context.quoteRecords) if (!quoteById.has(q.id)) quoteById.set(q.id, q);
    const metricByKey = new Map<string, TrustedMetric[]>();
    for (const m of context.metrics) metricByKey.set(m.metricKey, [...(metricByKey.get(m.metricKey) ?? []), m]);

    const backedNumbers: number[] = [];
    const ignoredNumberFragments: string[] = [];
    const backedQuoteTexts: string[] = [];

    raw.claims.forEach((rawClaim: unknown, i: number) => {
        if (
            !isRecord(rawClaim) ||
            !isNonBlankString(rawClaim.claimText) ||
            !["metric", "quote", "narrative"].includes(rawClaim.claimType as string)
        ) {
            err("MALFORMED_ANSWER", "Claim must have claimText and a claimType of metric, quote, or narrative.", i);
            return;
        }
        const claim = rawClaim as unknown as GeneratedClaim;

        // ── Evidence citations (all claim types) ──────────────────────────
        const validEvidence: EvidenceItem[] = [];
        const ids: unknown = rawClaim.evidenceItemIds;
        if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isNonBlankString)) {
            err("CLAIM_MISSING_EVIDENCE", "Claim must cite at least one evidence item id.", i);
        } else {
            for (const id of new Set(ids as string[])) {
                const item = evidenceById.get(id);
                if (!item) {
                    err("EVIDENCE_NOT_FOUND", `Cited evidence item "${id}" does not exist in the trusted evidence set.`, i);
                } else if (item.organization_id !== context.organizationId) {
                    err("EVIDENCE_WRONG_ORGANIZATION", `Cited evidence item "${id}" does not belong to this organization.`, i);
                } else if (item.verification_status === "rejected") {
                    err("EVIDENCE_REJECTED", `Cited evidence item "${id}" has been rejected and cannot support a claim.`, i);
                } else {
                    validEvidence.push(item);
                    if (item.verification_status === "pending") {
                        flag("EVIDENCE_PENDING_VERIFICATION", `Cited evidence item "${id}" is not yet verified.`, i);
                    }
                }
            }
        }

        // ── Claim-type specific checks ────────────────────────────────────
        if (claim.claimType === "narrative") {
            flag(
                "NARRATIVE_CLAIM_UNVERIFIED",
                "Narrative claim: citation existence does not establish that the evidence supports this statement. Human review required.",
                i,
            );
            if (draftNorm && !draftNorm.toLowerCase().includes(normalizeText(claim.claimText).toLowerCase())) {
                flag("CLAIM_TEXT_NOT_IN_DRAFT", "claimText was not found verbatim in draftText (may be paraphrased).", i);
            }
            return;
        }

        if (claim.claimType === "metric") {
            validateMetricClaim(claim, i);
        } else {
            validateQuoteClaim(claim, i, validEvidence);
        }

        if (draftNorm && !draftNorm.toLowerCase().includes(normalizeText(claim.claimText).toLowerCase())) {
            flag("CLAIM_TEXT_NOT_IN_DRAFT", "claimText was not found verbatim in draftText (may be paraphrased).", i);
        }
    });

    function validateMetricClaim(claim: GeneratedClaim, i: number): void {
        const ref: unknown = (claim as unknown as Rec).metricReference;
        if (
            !isRecord(ref) ||
            !isNonBlankString(ref.metricKey) ||
            typeof ref.statedValue !== "number" ||
            !Number.isFinite(ref.statedValue) ||
            !isNonBlankString(ref.unit) ||
            !isNonBlankString(ref.period)
        ) {
            err("METRIC_REFERENCE_MISSING", "Metric claim requires metricReference with metricKey, numeric statedValue, unit, and period.", i);
            return;
        }
        const candidates = metricByKey.get(ref.metricKey) ?? [];
        if (candidates.length === 0) {
            err("METRIC_NOT_FOUND", `Metric "${ref.metricKey}" does not exist in the trusted computed metrics.`, i);
            return;
        }
        // Prefer the candidate for this period within this organization.
        const inOrg = candidates.filter((m) => m.organizationId === context.organizationId);
        if (inOrg.length === 0) {
            err("METRIC_WRONG_ORGANIZATION", `Metric "${ref.metricKey}" does not belong to this organization.`, i);
            return;
        }
        const trusted =
            inOrg.find((m) => normalizeLabel(m.period) === normalizeLabel(ref.period as string)) ?? inOrg[0];

        // Trusted value/unit/period are the source of truth.
        if (!sameNumber(ref.statedValue, trusted.value)) {
            err("METRIC_VALUE_MISMATCH", `Stated value ${ref.statedValue} does not match trusted value ${trusted.value} for metric "${trusted.metricKey}".`, i);
        }
        if (normalizeLabel(ref.unit) !== normalizeLabel(trusted.unit)) {
            err("METRIC_UNIT_MISMATCH", `Stated unit "${ref.unit}" does not match trusted unit "${trusted.unit}" for metric "${trusted.metricKey}".`, i);
        }
        if (normalizeLabel(ref.period) !== normalizeLabel(trusted.period)) {
            err("METRIC_PERIOD_MISMATCH", `Stated period "${ref.period}" does not match trusted period "${trusted.period}" for metric "${trusted.metricKey}".`, i);
        }

        // Narrow prose check. A metric claim is atomic (one metric), so EVERY number in
        // claimText must equal the trusted value; one correct number does not excuse
        // another wrong one ("60 concerts for 600 residents" fails).
        ignoredNumberFragments.push(trusted.period, ref.period);
        const textNumbers = extractNumbers(claim.claimText, [trusted.period, ref.period]);
        const wrong = textNumbers.filter((n) => !sameNumber(n, trusted.value));
        if (wrong.length > 0) {
            err(
                "METRIC_CLAIM_TEXT_VALUE_MISMATCH",
                `claimText contains ${[...new Set(wrong)].join(", ")} but the only trusted value for metric "${trusted.metricKey}" is ${trusted.value}. Split other quantities into their own metric claims.`,
                i,
            );
        }
        backedNumbers.push(trusted.value);
        if (draftNorm && !extractNumbers(draftText, [trusted.period, ref.period]).some((n) => sameNumber(n, trusted.value))) {
            flag("METRIC_VALUE_NOT_IN_DRAFT", `Trusted value ${trusted.value} for metric "${trusted.metricKey}" does not appear in draftText.`, i);
        }
    }

    function validateQuoteClaim(claim: GeneratedClaim, i: number, validEvidence: EvidenceItem[]): void {
        const ref: unknown = (claim as unknown as Rec).quoteReference;
        if (!isRecord(ref) || !isNonBlankString(ref.quoteRecordId) || typeof ref.quotedText !== "string") {
            err("QUOTE_REFERENCE_MISSING", "Quote claim requires quoteReference with quoteRecordId and quotedText.", i);
            return;
        }
        const quote = quoteById.get(ref.quoteRecordId);
        if (!quote) {
            err("QUOTE_NOT_FOUND", `Quote record "${ref.quoteRecordId}" does not exist in the trusted quote set.`, i);
            return;
        }
        if (quote.organization_id !== context.organizationId) {
            err("QUOTE_WRONG_ORGANIZATION", `Quote record "${quote.id}" does not belong to this organization.`, i);
            return;
        }

        // Source link: a cited, in-tenant evidence item must come from the quote's reflection.
        if (!validEvidence.some((e) => e.source_volunteer_reflection_id === quote.reflection_id)) {
            err("QUOTE_SOURCE_NOT_CITED", `Quote record "${quote.id}" is not linked to any cited evidence item (expected source reflection "${quote.reflection_id}").`, i);
        }

        // Stored text is the source of truth; the model's copy is only compared against it.
        if (normalizeText(ref.quotedText) !== normalizeText(quote.text)) {
            err("QUOTE_TEXT_MISMATCH", `quotedText does not match the stored text of quote record "${quote.id}".`, i);
        }

        // Consent comes only from the stored record.
        if (quote.consent_status !== "confirmed_with_evidence") {
            err("QUOTE_CONSENT_NOT_CONFIRMED", `Quote record "${quote.id}" has consent status "${quote.consent_status ?? "null"}"; funder-facing quotes require "confirmed_with_evidence".`, i);
        } else if (!isNonBlankString(quote.consent_evidence)) {
            err("QUOTE_CONSENT_EVIDENCE_MISSING", `Quote record "${quote.id}" is marked confirmed but has no consent evidence.`, i);
        }

        backedQuoteTexts.push(normalizeText(quote.text));
        if (draftNorm && !draftNorm.includes(normalizeText(quote.text))) {
            flag("QUOTE_NOT_IN_DRAFT", `Stored text of quote record "${quote.id}" does not appear verbatim in draftText.`, i);
        }
    }

    // ── Answer-level prose heuristics (review flags only) ─────────────────
    if (draftNorm) {
        const unbacked = new Set<number>();
        for (const n of extractNumbers(draftText, ignoredNumberFragments)) {
            if (!backedNumbers.some((b) => sameNumber(b, n))) unbacked.add(n);
        }
        for (const n of unbacked) {
            flag("NUMBER_IN_DRAFT_NOT_BACKED", `draftText contains the number ${n}, which no validated metric claim backs.`);
        }
        for (const m of draftNorm.matchAll(/"([^"]+)"/g)) {
            const seg = m[1].trim();
            if (!seg) continue; // short quotes are flagged too: a one-word resident quote still needs consent
            if (!backedQuoteTexts.some((q) => q.includes(seg))) {
                flag("QUOTED_TEXT_IN_DRAFT_NOT_BACKED", `draftText contains a quoted passage ("${seg.slice(0, 60)}${seg.length > 60 ? "…" : ""}") that matches no cited stored quote.`);
            }
        }
    }

    // Prose that no claim covers cannot be traced to evidence at all.
    if (draftNorm && raw.claims.length > 0) {
        let rest = draftNorm.toLowerCase();
        for (const c of raw.claims) {
            if (isRecord(c) && isNonBlankString(c.claimText)) {
                rest = rest.split(normalizeText(c.claimText).toLowerCase()).join(" ");
            }
        }
        const words = rest.match(/[a-z]{2,}/g) ?? [];
        if (words.length >= 3) {
            flag(
                "DRAFT_TEXT_NOT_COVERED_BY_CLAIMS",
                `draftText contains text not covered by any claim's claimText (e.g. "${words.slice(0, 6).join(" ")}"). It may be paraphrase or untraceable prose.`,
            );
        }
    }

    return finish();
}
