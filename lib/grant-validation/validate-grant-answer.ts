/**
 * Deterministic validation of a model-generated grant answer against TRUSTED
 * records. Pure: no network, no database, no clock, no randomness.
 *
 * ── Three outcomes, never conflated ───────────────────────────────────────
 *  - ERROR  (blocking): a DEMONSTRATED contradiction with a trusted record, or a
 *           violated contract (missing/foreign/rejected evidence, wrong value,
 *           unit, period, quote text, consent, attribution, ...).
 *  - PASS:  the statement is supported by the applicable trusted data.
 *  - FLAG   (non-blocking, human review): the checker cannot reliably interpret or
 *           substantiate the statement. A flag is NOT an assertion that it is false.
 *
 * ── What this proves ──────────────────────────────────────────────────────
 *  - Every cited evidence item exists in the supplied trusted set and belongs
 *    to the current organization (and is not rejected).
 *  - Metric/quote claims carry the required structured references.
 *  - A metric reference matches the trusted computed value, unit, and period.
 *  - A quote reference points at a stored quote of this organization, linked to
 *    a cited evidence source, whose stored text matches `quotedText` (exactly,
 *    or as a declared excerpt that is then flagged), with
 *    `confirmed_with_evidence` consent plus non-empty consent evidence, and
 *    whose attribution in nearby prose does not contradict the stored speaker.
 *  - Model-supplied values never override trusted records: the trusted record is
 *    always the side of the comparison that is believed. Extra fields on the
 *    model output (an "excerpt", a "consent" assertion) are never read.
 *
 * ── Metric prose (see text-analysis.ts) ───────────────────────────────────
 *  Each number in a metric claim's text is classified, then checked on its own:
 *   - a quantity is bound to a trusted metric by the unit words after it
 *     ("60 concerts", "1,500 encounters"). A different measure ("200 volunteer
 *     reports") is never matched merely because the number is equal;
 *   - bound to this claim's metric but wrong -> error ("600 concerts");
 *   - a quantity no reference of the claim covers ("4 sites") -> review flag,
 *     unless an `additionalMetricReferences` entry supports it;
 *   - equivalent forms are accepted: "1,500", "60.0", "sixty", "1.5 million";
 *   - rounding only via the metric's documented `permittedRounding`, conversions
 *     only via `unitConversions`; averages/percentages/changes only from a metric
 *     whose `statistic`/`comparison` says trusted code computed them;
 *   - "at least / more than / up to" must be implied by the trusted value (or
 *     trusted minimum/maximum); "more than 60" for exactly 60 is an error;
 *   - dates are compared with the trusted period, not with the metric value:
 *     disjoint -> error; broader/narrower/partial -> flag; equal -> pass;
 *   - question ids, list markers, citation markers, "60-second", "founded in
 *     2020" and numbers inside quotation marks are not program quantities.
 *
 * ── What this does NOT prove (explicit limitations) ───────────────────────
 *  1. A valid citation does not mean a NARRATIVE claim is supported. Every
 *     narrative claim is flagged `NARRATIVE_CLAIM_UNVERIFIED`.
 *  2. Correct structured metadata does not mean `draftText` says the same thing.
 *     Heuristics only: claim text / stored quote / metric value should appear in
 *     draftText; unbacked numbers, unbacked double-quoted passages, and prose not
 *     covered by any claim are review flags.
 *     Not detected: unit/period misstatements in uncovered prose, paraphrased or
 *     altered quotes, single-quoted quotations, negation, causal claims, anything
 *     semantic. A unit followed by a word outside a small closed list of clause
 *     words ("60 concert halls") is flagged AMBIGUOUS_MEASURE_ASSOCIATION, never
 *     treated as backed or contradicted; the cost is occasional extra flags.
 *  3. We cannot verify that a computed metric was derived from the cited evidence.
 *  4. Consent: only the repository's consent structure (`consent_status` +
 *     non-blank `consent_evidence`), not whether the evidence is adequate.
 *
 * ── Reading the result ────────────────────────────────────────────────────
 *  `valid: true` means ONLY "no blocking structured error". It often coexists with
 *  `requiresHumanReview: true`. Even `requiresHumanReview: false` means only "no
 *  heuristic fired", never "verified true". UIs must not label either as verified.
 */
import type { EvidenceItem, QuoteRecord } from "../../types/database.ts";
import { daySpan, monthDayOf, parsePeriod, quarterSpan, relate, type Span } from "./periods.ts";
import {
    analyzeText,
    comparable,
    isNounless,
    matchUnit,
    normalizeText,
    stripListMarkers,
    unitPhrasesOf,
    type DateMention,
    type QuantityToken,
    type RangeToken,
} from "./text-analysis.ts";
import type {
    GeneratedClaim,
    GeneratedGrantAnswer,
    GrantAnswerValidationResult,
    GrantReviewFlag,
    GrantReviewFlagCode,
    GrantValidationContext,
    GrantValidationError,
    GrantValidationErrorCode,
    MetricReference,
    TrustedMetric,
} from "./types.ts";

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isNonBlankString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const normalizeLabel = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();
const numEq = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// ── Outcomes of the pure per-token checks ───────────────────────────────────
interface ResolvedRef {
    ref: MetricReference;
    trusted: TrustedMetric;
    span: Span | null;
    baseline: Span | null;
    /** The reference itself passed value/unit/period checks. */
    clean: boolean;
}
type Outcome =
    | { kind: "ok"; recorded: number[]; via: ResolvedRef[] }
    | { kind: "error"; code: GrantValidationErrorCode; message: string }
    | { kind: "flag"; code: GrantReviewFlagCode; message: string };

const COMPARISON_RE =
    /\b(?:increas\w*|decreas\w*|declin\w*|grew|grow(?:th|n|ing)?|rose|rise|rising|fell|fall(?:en|ing)?|dropp?\w*|reduc\w*|improv\w*|doubled|tripled|compared (?:to|with)|versus|vs\.?|year[- ]over[- ]year|up from|down from|higher than|lower than)\b/i;
const UP_RE = /\b(?:increas\w*|grew|grow\w*|rose|rise|rising|higher|gain\w*|improv\w*|up from)\b/i;
const DOWN_RE = /\b(?:decreas\w*|declin\w*|fell|fall\w*|dropp?\w*|lower|reduc\w*|down from)\b/i;
const AVERAGE_RE = /\b(?:average|mean|median|typical|typically)\b/;
const UNIQUE_RE = /\b(?:unique|distinct|individual|different|separate)\b/;
const PEOPLE_RE = /\b(?:people|persons?|residents?|participants?|individuals?|seniors|elders|attendees|folks)\b/;

const BOUND_LABEL = {
    min: "at least",
    "min-exclusive": "more than",
    max: "at most",
    "max-exclusive": "fewer than",
} as const;

const phraseOf = (q: QuantityToken | RangeToken): string =>
    `"${[q.raw, ...q.afterWords.slice(0, 3)].join(" ")}"`;

function isPercentWording(q: QuantityToken | RangeToken): boolean {
    const [a, b] = q.afterWords;
    return a === "%" || a === "percent" || a === "percentage" || (a === "per" && b === "cent");
}

/** Check one quantity against one candidate metric. */
function compareToMetric(q: QuantityToken | RangeToken, tr: TrustedMetric, factor: number): Outcome | { kind: "pass"; recorded: number[] } {
    const local = `${q.before} ${q.afterWords.join(" ")}`;
    const comparing = COMPARISON_RE.test(local);
    if (comparing && !tr.comparison) {
        return {
            kind: "flag",
            code: "COMPARISON_NOT_BACKED",
            message: `${phraseOf(q)} is stated as a change/comparison, but metric "${tr.metricKey}" has no trusted comparison (baseline period). Only a server-computed comparison metric can substantiate it.`,
        };
    }
    if (tr.statistic !== "average" && AVERAGE_RE.test(q.before)) {
        return {
            kind: "flag",
            code: "DERIVED_STATISTIC_NOT_BACKED",
            message: `${phraseOf(q)} is stated as an average/typical value, but metric "${tr.metricKey}" is not a trusted computed average.`,
        };
    }
    if (tr.statistic !== "percentage" && isPercentWording(q)) {
        return {
            kind: "flag",
            code: "DERIVED_STATISTIC_NOT_BACKED",
            message: `${phraseOf(q)} is stated as a percentage, but metric "${tr.metricKey}" is not a trusted computed percentage.`,
        };
    }

    const scaled = tr.value * factor;
    let target = scaled;
    if (comparing) {
        const up = UP_RE.test(local);
        const down = DOWN_RE.test(local);
        if ((up && !down && scaled < 0) || (down && !up && scaled > 0)) {
            return {
                kind: "error",
                code: "METRIC_CLAIM_TEXT_VALUE_MISMATCH",
                message: `${phraseOf(q)} is described as ${up ? "an increase" : "a decrease"}, but the trusted change for "${tr.metricKey}" is ${scaled}.`,
            };
        }
        target = Math.abs(scaled);
    }

    if (q.kind === "range") {
        if (tr.minimum === undefined || tr.maximum === undefined) {
            return {
                kind: "flag",
                code: "BOUND_OR_RANGE_NOT_BACKED",
                message: `${phraseOf(q)} states a range, but metric "${tr.metricKey}" has no trusted minimum and maximum. A single total cannot substantiate a range.`,
            };
        }
        if (numEq(q.lo, tr.minimum * factor) && numEq(q.hi, tr.maximum * factor)) return { kind: "pass", recorded: [q.lo, q.hi] };
        return {
            kind: "error",
            code: "METRIC_CLAIM_TEXT_VALUE_MISMATCH",
            message: `claimText states a range of ${q.lo} to ${q.hi}, but the trusted range for "${tr.metricKey}" is ${tr.minimum * factor} to ${tr.maximum * factor}.`,
        };
    }

    if (q.bound) {
        const lower = q.bound === "min" || q.bound === "min-exclusive";
        const rangeType = tr.minimum !== undefined || tr.maximum !== undefined;
        const field = lower ? tr.minimum : tr.maximum;
        if (rangeType && field === undefined) {
            return {
                kind: "flag",
                code: "BOUND_OR_RANGE_NOT_BACKED",
                message: `${phraseOf(q)} states a ${BOUND_LABEL[q.bound]} bound, but metric "${tr.metricKey}" has no trusted ${lower ? "minimum" : "maximum"}.`,
            };
        }
        const trustedBound = rangeType ? (field as number) * factor : target;
        const implied =
            q.bound === "min" ? q.value <= trustedBound
            : q.bound === "min-exclusive" ? q.value < trustedBound
            : q.bound === "max" ? q.value >= trustedBound
            : q.value > trustedBound;
        if (implied) return { kind: "pass", recorded: [q.value] };
        return {
            kind: "error",
            code: "METRIC_CLAIM_TEXT_VALUE_MISMATCH",
            message: `claimText says ${BOUND_LABEL[q.bound]} ${q.value}, which the trusted ${rangeType ? (lower ? "minimum" : "maximum") : "value"} ${trustedBound} for "${tr.metricKey}" does not support.`,
        };
    }

    if (numEq(q.value, target)) return { kind: "pass", recorded: [q.value] };
    for (const rule of tr.permittedRounding ?? []) {
        if (!(rule.increment > 0)) continue;
        const needsHedge = rule.requiresApproximateWording !== false;
        if (numEq(q.value, Math.round(target / rule.increment) * rule.increment) && (!needsHedge || q.approx)) {
            return { kind: "pass", recorded: [q.value] };
        }
    }
    const hint = q.approx
        ? (tr.permittedRounding?.length
            ? " The approximate wording does not permit this number under the documented rounding rules."
            : " Approximate wording does not permit a different number; no rounding rule is documented for this metric.")
        : "";
    return {
        kind: "error",
        code: "METRIC_CLAIM_TEXT_VALUE_MISMATCH",
        message: `claimText states ${q.value} for "${tr.metricKey}" but the trusted value is ${target}.${hint}`,
    };
}

/** Check one quantity in a metric claim against every reference of that claim. */
function evaluateQuantity(q: QuantityToken | RangeToken, refs: ResolvedRef[]): Outcome {
    const nounless = isNounless(q.afterWords);
    const matched = refs
        .map((r) => ({ r, unit: nounless ? { factor: 1, ambiguous: false } : matchUnit(q.afterWords, r.trusted) }))
        .filter((x): x is { r: ResolvedRef; unit: { factor: number; ambiguous: boolean } } => x.unit !== null);

    const definite = matched.filter((x) => !x.unit.ambiguous);
    if (definite.length === 0 && matched.length > 0) {
        return {
            kind: "flag",
            code: "AMBIGUOUS_MEASURE_ASSOCIATION",
            message: `claimText states ${phraseOf(q)}; the words after the number may extend the metric's unit into a different noun (e.g. "concert halls" is not "concerts"), so the checker cannot tie it to "${matched[0].r.trusted.metricKey}". A human must confirm what is being counted.`,
        };
    }
    if (matched.length > 0 && definite.length < matched.length) matched.splice(0, matched.length, ...definite);
    if (matched.length === 0) {
        const near = q.afterWords.slice(0, 3).join(" ");
        if (q.kind === "quantity" && UNIQUE_RE.test(near) && PEOPLE_RE.test(near)) {
            const same = refs.find((r) => numEq(q.value, r.trusted.value) && !UNIQUE_RE.test(r.trusted.unit.toLowerCase()));
            if (same) {
                return {
                    kind: "error",
                    code: "METRIC_CLAIM_TEXT_UNIT_MISMATCH",
                    message: `claimText presents ${q.raw} as ${near}, but the trusted metric "${same.trusted.metricKey}" counts "${same.trusted.unit}", not unique people.`,
                };
            }
        }
        const code: GrantReviewFlagCode =
            q.kind === "range" || q.bound ? "BOUND_OR_RANGE_NOT_BACKED"
            : COMPARISON_RE.test(`${q.before} ${near}`) ? "COMPARISON_NOT_BACKED"
            : AVERAGE_RE.test(q.before) || isPercentWording(q) ? "DERIVED_STATISTIC_NOT_BACKED"
            : "NUMBER_IN_CLAIM_NOT_BACKED";
        return {
            kind: "flag",
            code,
            message: `claimText states ${phraseOf(q)}, which none of this claim's metric references measures (an equal number elsewhere does not count). Add a trusted metric reference for it or have a human verify it.`,
        };
    }

    const results = matched.map(({ r, unit }) => ({ r, res: compareToMetric(q, r.trusted, unit.factor) }));
    const passed = results.filter((x) => x.res.kind === "pass");
    if (passed.length > 0) {
        return {
            kind: "ok",
            recorded: (passed[0].res as { kind: "pass"; recorded: number[] }).recorded,
            via: passed.map((x) => x.r),
        };
    }
    const flagged = results.find((x) => x.res.kind === "flag");
    if (flagged) return flagged.res as Outcome;
    return results[0].res as Outcome;
}

const END_VERB_RE = /\b(?:ended|ends|ending|concluded|through|until)(?:\s+on)?\s*$/;
const START_VERB_RE = /\b(?:began|begins|beginning|started|starts|starting)(?:\s+on)?\s*$/;

const mentionSpan = (d: DateMention): Span | null =>
    d.kind === "span" ? d.span : d.kind === "literal" ? parsePeriod(d.label) : null;

/** Compare one date mention in a metric claim with the trusted period(s). Null = consistent. */
function evaluateDate(d: DateMention, spans: Span[]): Outcome | null {
    if (d.kind === "literal") return null;
    if (d.kind === "historical") {
        return {
            kind: "flag",
            code: "NON_MEASURE_NUMBER_NEEDS_SOURCE",
            message: `claimText mentions a historical date ("${d.raw}"). A metric reference does not support it; it needs its own evidence.`,
        };
    }
    if (d.kind === "boundary" || d.kind === "unparsed") {
        return {
            kind: "flag",
            code: "PERIOD_WORDING_UNVERIFIED",
            message: `claimText has period wording ("${d.raw}") the checker cannot compare with the trusted reporting period.`,
        };
    }
    if (spans.length === 0) {
        return {
            kind: "flag",
            code: "PERIOD_WORDING_UNVERIFIED",
            message: `claimText mentions "${d.raw}", but the trusted period is not machine-readable, so it cannot be compared.`,
        };
    }

    if (d.kind === "month-day") {
        const end = END_VERB_RE.test(d.before);
        const start = START_VERB_RE.test(d.before);
        if (end || start) {
            const ok = spans.some((s) => {
                const md = monthDayOf(end ? s.end : s.start);
                return md.month === d.month && md.day === d.day && (d.year === undefined || d.year === md.year);
            });
            if (ok) return null;
            return {
                kind: "error",
                code: "PERIOD_TEXT_MISMATCH",
                message: `claimText says the reporting period ${end ? "ended" : "began"} on "${d.raw}", which contradicts the trusted period.`,
            };
        }
    }

    const pairs: { stated: Span; trusted: Span }[] = [];
    for (const s of spans) {
        let stated: Span | null = null;
        if (d.kind === "span") stated = d.span;
        else if (d.kind === "bare-quarter") stated = quarterSpan(monthDayOf(s.end).year, d.quarter);
        else if (d.kind === "month-day") stated = daySpan(d.year ?? monthDayOf(s.end).year, d.month, d.day);
        if (stated) pairs.push({ stated, trusted: s });
    }
    const rels = pairs.map((p) => relate(p.stated, p.trusted));
    if (rels.includes("equal")) return null;
    if (d.kind === "span" && d.ends && spans.length >= 2) {
        // "from <baseline> to <period>": each endpoint must be one of the trusted periods.
        const results = d.ends.map((e, k) => evaluateDate({ ...d, raw: `${d.raw} (${k === 0 ? "start" : "end"})`, span: e, ends: undefined }, spans));
        return results.find((r) => r?.kind === "error") ?? results.find((r) => r !== null) ?? null;
    }
    if (rels.length > 0 && rels.every((r) => r === "disjoint")) {
        return {
            kind: "error",
            code: "PERIOD_TEXT_MISMATCH",
            message: `claimText says "${d.raw}", which does not overlap the trusted reporting period of the referenced metric.`,
        };
    }
    return {
        kind: "flag",
        code: "PERIOD_WORDING_UNVERIFIED",
        message: `claimText says "${d.raw}", which is ${rels[0] ?? "not comparable to"} the trusted reporting period; the metric covers exactly its own period, so a human should confirm the wording.`,
    };
}

// ── Quote helpers ───────────────────────────────────────────────────────────
const ATTRIBUTION_VERBS =
    "said|says|shared|told|noted|described|wrote|explained|remarked|reflected|recalled|added|commented|mentioned|reported";
const ROLES =
    "residents?|volunteers?|directors?|staff(?: members?)?|family members?|families|caregivers?|participants?|students?|musicians?|visitors?|neighbou?rs?";

function canonicalRole(r: string): string {
    const s = r.toLowerCase();
    if (s.startsWith("famil")) return "family member";
    if (s.startsWith("staff")) return "staff";
    return s.replace(/s$/, "");
}

/** The role that nearby prose attributes a quotation to (the nearest attribution wins), if any. */
function attributedRole(window: string): string | null {
    const w = window.toLowerCase();
    const hits: { at: number; role: string }[] = [];
    const patterns = [
        new RegExp(`\\b(${ROLES})\\b[^.!?"]{0,30}?\\b(?:${ATTRIBUTION_VERBS})\\b`, "g"),
        new RegExp(`\\b(?:${ATTRIBUTION_VERBS})\\s+(?:by|from)\\s+(?:a|an|one|the)?\\s*(${ROLES})\\b`, "g"),
        new RegExp(`\\baccording to\\s+(?:a|an|one|the|another)?\\s*(${ROLES})\\b`, "g"),
    ];
    for (const re of patterns) for (const m of w.matchAll(re)) hits.push({ at: m.index as number, role: canonicalRole(m[1]) });
    hits.sort((a, b) => a.at - b.at);
    return hits.length ? hits[hits.length - 1].role : null;
}

const isBoundaryChar = (c: string | undefined): boolean => c === undefined || !/[\p{L}\p{N}]/u.test(c);

/** Is `said` an in-order excerpt of `stored` (gaps marked "..." / "…")? Case-sensitive, word-aligned. */
function isExcerpt(said: string, stored: string): boolean {
    const segments = said
        .split(/\s*(?:\.\.\.|…|\[\.\.\.\]|\[…\])\s*/)
        .map((s) => s.trim().replace(/^[.,;:!?]+|[.,;:!?]+$/g, "").trim())
        .filter((s) => s.length > 0);
    if (segments.length === 0 || said.length >= stored.length) return false;
    let from = 0;
    for (const seg of segments) {
        let found = -1;
        for (let i = stored.indexOf(seg, from); i !== -1; i = stored.indexOf(seg, i + 1)) {
            if (isBoundaryChar(stored[i - 1]) && isBoundaryChar(stored[i + seg.length])) {
                found = i;
                break;
            }
        }
        if (found === -1) return false;
        from = found + seg.length;
    }
    return true;
}

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
    const report = (o: Outcome | null, claimIndex: number): void => {
        if (!o || o.kind === "ok") return;
        if (o.kind === "error") err(o.code, o.message, claimIndex);
        else flag(o.code, o.message, claimIndex);
    };

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
    const draftNorm = normalizeText(stripListMarkers(draftText));
    const draftComparable = comparable(draftText);

    // Index trusted records by id/key. First match wins; callers should pass unique ids.
    const evidenceById = new Map<string, EvidenceItem>();
    for (const e of context.evidenceItems) if (!evidenceById.has(e.id)) evidenceById.set(e.id, e);
    const quoteById = new Map<string, QuoteRecord>();
    for (const q of context.quoteRecords) if (!quoteById.has(q.id)) quoteById.set(q.id, q);
    const metricByKey = new Map<string, TrustedMetric[]>();
    for (const m of context.metrics) metricByKey.set(m.metricKey, [...(metricByKey.get(m.metricKey) ?? []), m]);

    const orgMetrics = context.metrics.filter((m) => m.organizationId === context.organizationId);
    const unitPhrases = orgMetrics.flatMap((m) => unitPhrasesOf(m).map((p) => p.phrase));
    const periodLabels = [
        ...new Set(orgMetrics.flatMap((m) => [m.period, ...(m.comparison ? [m.comparison.baselinePeriod] : [])])),
    ];
    const draftAnalysis = analyzeText(draftText, { literalPeriods: periodLabels, unitPhrases });
    /** Does the draft state this value for this metric's measure (not merely an equal number)? */
    const draftStates = (value: number, trusted: TrustedMetric): boolean =>
        draftAnalysis.quantities.some((q) =>
            (q.kind === "range" ? [q.lo, q.hi] : [q.value]).some(
                (v) => numEq(v, value) && (isNounless(q.afterWords) || matchUnit(q.afterWords, trusted)?.ambiguous === false),
            ),
        );

    /** Written values that validated metric claims support, with the metric they were validated against. */
    const backed: { value: number; trusted: TrustedMetric }[] = [];
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
        const claimComparable = comparable(claim.claimText);

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
            if (draftComparable && !draftComparable.includes(claimComparable)) {
                flag("CLAIM_TEXT_NOT_IN_DRAFT", "claimText was not found verbatim in draftText (may be paraphrased).", i);
            }
            return;
        }

        if (claim.claimType === "metric") {
            validateMetricClaim(claim, i);
        } else {
            validateQuoteClaim(claim, i, validEvidence);
        }

        if (draftComparable && !draftComparable.includes(claimComparable)) {
            flag("CLAIM_TEXT_NOT_IN_DRAFT", "claimText was not found verbatim in draftText (may be paraphrased).", i);
        }
    });

    /** Validate one structured metric reference against the trusted metrics (value, unit, period). */
    function resolveReference(rawRef: unknown, i: number, label: string): ResolvedRef | null {
        if (
            !isRecord(rawRef) ||
            !isNonBlankString(rawRef.metricKey) ||
            typeof rawRef.statedValue !== "number" ||
            !Number.isFinite(rawRef.statedValue) ||
            !isNonBlankString(rawRef.unit) ||
            !isNonBlankString(rawRef.period)
        ) {
            err("METRIC_REFERENCE_MISSING", `${label} requires metricKey, numeric statedValue, unit, and period.`, i);
            return null;
        }
        const ref = rawRef as unknown as MetricReference;
        const candidates = metricByKey.get(ref.metricKey) ?? [];
        if (candidates.length === 0) {
            err("METRIC_NOT_FOUND", `Metric "${ref.metricKey}" does not exist in the trusted computed metrics.`, i);
            return null;
        }
        // Prefer the candidate for this period within this organization.
        const inOrg = candidates.filter((m) => m.organizationId === context.organizationId);
        if (inOrg.length === 0) {
            err("METRIC_WRONG_ORGANIZATION", `Metric "${ref.metricKey}" does not belong to this organization.`, i);
            return null;
        }
        const trusted = inOrg.find((m) => normalizeLabel(m.period) === normalizeLabel(ref.period)) ?? inOrg[0];
        const before = errors.length;

        // Trusted value/unit/period are the source of truth.
        if (!numEq(ref.statedValue, trusted.value)) {
            err("METRIC_VALUE_MISMATCH", `Stated value ${ref.statedValue} does not match trusted value ${trusted.value} for metric "${trusted.metricKey}".`, i);
        }
        if (normalizeLabel(ref.unit) !== normalizeLabel(trusted.unit)) {
            err("METRIC_UNIT_MISMATCH", `Stated unit "${ref.unit}" does not match trusted unit "${trusted.unit}" for metric "${trusted.metricKey}".`, i);
        }
        if (normalizeLabel(ref.period) !== normalizeLabel(trusted.period)) {
            err("METRIC_PERIOD_MISMATCH", `Stated period "${ref.period}" does not match trusted period "${trusted.period}" for metric "${trusted.metricKey}".`, i);
        }
        return {
            ref,
            trusted,
            span: parsePeriod(trusted.period),
            baseline: trusted.comparison ? parsePeriod(trusted.comparison.baselinePeriod) : null,
            clean: errors.length === before,
        };
    }

    function validateMetricClaim(claim: GeneratedClaim, i: number): void {
        const primary = resolveReference((claim as unknown as Rec).metricReference, i, "Metric claim's metricReference");
        const extraRaw: unknown = (claim as unknown as Rec).additionalMetricReferences;
        const extras: (ResolvedRef | null)[] = Array.isArray(extraRaw)
            ? extraRaw.map((r, k) => resolveReference(r, i, `additionalMetricReferences[${k}]`))
            : [];
        if (extraRaw !== undefined && !Array.isArray(extraRaw)) {
            err("METRIC_REFERENCE_MISSING", "additionalMetricReferences must be an array.", i);
        }
        const refs = [primary, ...extras].filter((r): r is ResolvedRef => r !== null);
        if (refs.length === 0) return;

        // Prose check. The trusted record is the only side that is believed.
        const analysis = analyzeText(claim.claimText, {
            literalPeriods: [...new Set(refs.flatMap((r) => [r.trusted.period, ...(r.trusted.comparison ? [r.trusted.comparison.baselinePeriod] : [])]))],
            unitPhrases,
        });
        const written: { value: number; trusted: TrustedMetric }[] = [];

        // Dates / reporting-period wording: compared with the trusted period, never with the value.
        const spans = refs.flatMap((r) => [r.span, r.baseline]).filter((s): s is Span => s !== null);
        // In a comparison with no trusted baseline, the "other" period is the unsubstantiated baseline,
        // not a contradiction of the metric's own period: downgrade to a review flag.
        const unbackedComparison =
            COMPARISON_RE.test(normalizeText(claim.claimText.replace(/["“”][^"“”]*["“”]/g, " "))) &&
            !refs.some((r) => r.trusted.comparison);
        for (const d of analysis.dates) {
            const o = evaluateDate(d, spans);
            report(o && o.kind === "error" && unbackedComparison ? { kind: "flag", code: "PERIOD_WORDING_UNVERIFIED", message: o.message } : o, i);
        }

        // Each quantity needs its own support.
        const distinctPeriods = new Set(refs.map((r) => normalizeLabel(r.trusted.period))).size > 1;
        analysis.quantities.forEach((q, qi) => {
            const outcome = evaluateQuantity(q, refs);
            if (outcome.kind === "ok") {
                for (const v of outcome.recorded) written.push({ value: v, trusted: outcome.via[0].trusted });
                if (outcome.via.some((r) => r.clean)) {
                    for (const v of outcome.recorded) backed.push({ value: v, trusted: outcome.via[0].trusted });
                }
                if (distinctPeriods) {
                    // "30 in 2025 and 30 in 2026": a number must sit next to the period of the metric that backs it.
                    const nextAt = analysis.quantities[qi + 1]?.at ?? Infinity;
                    const near = analysis.dates.find((d) => d.at >= q.to && d.at < nextAt && mentionSpan(d) !== null);
                    const nearSpan = near ? mentionSpan(near) : null;
                    if (near && nearSpan && !outcome.via.some((r) => r.span && relate(nearSpan, r.span) === "equal")) {
                        err(
                            "PERIOD_TEXT_MISMATCH",
                            `${phraseOf(q)} is the trusted value for a different reporting period than the "${near.raw}" it is stated with.`,
                            i,
                        );
                    }
                }
            } else {
                report(outcome, i);
            }
        });
        for (const o of analysis.others) {
            if (o.kind === "descriptor") {
                flag(
                    "NON_MEASURE_NUMBER_NEEDS_SOURCE",
                    `claimText contains "${o.raw}", a number that is not a program-output quantity. A metric reference does not support it; it needs its own evidence.`,
                    i,
                );
            }
        }

        // Trusted values of clean references may be restated in the draft.
        for (const r of refs) {
            if (r.clean) {
                backed.push({ value: r.trusted.value, trusted: r.trusted });
                written.push({ value: r.trusted.value, trusted: r.trusted });
            }
        }
        if (draftNorm && !written.some((w) => draftStates(w.value, w.trusted))) {
            const r = refs[0];
            flag("METRIC_VALUE_NOT_IN_DRAFT", `Trusted value ${r.trusted.value} for metric "${r.trusted.metricKey}" does not appear in draftText.`, i);
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
        // Normalization is limited to whitespace and curly/straight quotes: it never forgives
        // different words, so paraphrase and changed meaning remain errors.
        const stored = normalizeText(quote.text);
        const said = normalizeText(ref.quotedText);
        let shownInDraft = stored;
        if (said === stored) {
            // exact
        } else if (ref.excerpt === true && isExcerpt(said, stored)) {
            shownInDraft = said;
            flag(
                "QUOTE_EXCERPT_REQUIRES_REVIEW",
                `quotedText is declared as an excerpt of quote record "${quote.id}". The words are in the stored quote, but the checker cannot judge whether the excerpt changes its meaning.`,
                i,
            );
        } else {
            const partial = ref.excerpt !== true && said.length > 0 && stored.includes(said);
            err(
                "QUOTE_TEXT_MISMATCH",
                partial
                    ? `quotedText is only part of the stored text of quote record "${quote.id}"; declare it with excerpt: true or quote it in full.`
                    : `quotedText does not match the stored text of quote record "${quote.id}".`,
                i,
            );
        }

        // Consent comes only from the stored record.
        if (quote.consent_status !== "confirmed_with_evidence") {
            err("QUOTE_CONSENT_NOT_CONFIRMED", `Quote record "${quote.id}" has consent status "${quote.consent_status ?? "null"}"; funder-facing quotes require "confirmed_with_evidence".`, i);
        } else if (!isNonBlankString(quote.consent_evidence)) {
            err("QUOTE_CONSENT_EVIDENCE_MISSING", `Quote record "${quote.id}" is marked confirmed but has no consent evidence.`, i);
        }

        // Attribution: the prose around the quote must not credit a different kind of speaker.
        const outsideQuote = normalizeText(claim.claimText.replace(/["“”][^"“”]*["“”]/g, " "));
        const at = draftNorm.indexOf(shownInDraft);
        const lead = at > 0 ? (draftNorm.slice(Math.max(0, at - 120), at).split(/(?<=[.!?])\s+/).pop() ?? "") : "";
        const role = attributedRole(`${lead} ${outsideQuote}`);
        if (role !== null) {
            if (quote.speaker === null) {
                flag("QUOTE_ATTRIBUTION_UNVERIFIED", `Prose attributes the quote to a ${role}, but quote record "${quote.id}" has no stored speaker.`, i);
            } else if (role !== quote.speaker) {
                err("QUOTE_ATTRIBUTION_MISMATCH", `Prose attributes the quote to a ${role}, but quote record "${quote.id}" was spoken by a ${quote.speaker}.`, i);
            }
        }

        backedQuoteTexts.push(stored, said);
        if (draftNorm && !draftNorm.includes(shownInDraft)) {
            flag("QUOTE_NOT_IN_DRAFT", `Stored text of quote record "${quote.id}" does not appear verbatim in draftText.`, i);
        }
    }

    // ── Answer-level prose heuristics (review flags only) ─────────────────
    if (draftNorm) {
        const isBacked = (value: number, afterWords: readonly string[]): boolean =>
            backed.some(
                (b) => numEq(b.value, value) && (isNounless(afterWords) || matchUnit(afterWords, b.trusted)?.ambiguous === false),
            );
        const reported = new Set<string>();
        for (const q of draftAnalysis.quantities) {
            const values = q.kind === "range" ? [q.lo, q.hi] : [q.value];
            if (values.every((v) => isBacked(v, q.afterWords))) continue;
            const key = `${q.raw}|${q.afterWords[0] ?? ""}`;
            if (reported.has(key)) continue;
            reported.add(key);
            flag("NUMBER_IN_DRAFT_NOT_BACKED", `draftText contains ${phraseOf(q)}, which no validated metric claim backs for that measure.`);
        }
        const seen = new Set<string>();
        for (const o of draftAnalysis.others) {
            if (o.kind !== "unrecognized" || seen.has(o.raw.toLowerCase())) continue;
            seen.add(o.raw.toLowerCase());
            flag("UNRECOGNIZED_NUMBER_FORMAT", `draftText contains "${o.raw}", a number form the checker does not interpret (ambiguous format or vague quantity). A human must verify it.`);
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
                const t = comparable(c.claimText);
                if (t) rest = rest.split(t).join(" ");
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
