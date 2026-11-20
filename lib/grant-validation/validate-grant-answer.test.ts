import { describe, it } from "node:test";
import assert from "node:assert";
import { validateGrantAnswer } from "./validate-grant-answer.ts";
import { makeValidAnswer, syntheticContext as ctx } from "./fixtures.ts";
import type { GeneratedGrantAnswer, GrantAnswerValidationResult } from "./types.ts";

const codes = (r: GrantAnswerValidationResult) => r.errors.map((e) => e.code);
const flagCodes = (r: GrantAnswerValidationResult) => r.reviewFlags.map((f) => f.code);
const hasError = (r: GrantAnswerValidationResult, code: string, claimIndex?: number) =>
    r.errors.some((e) => e.code === code && e.claimIndex === claimIndex);

describe("validateGrantAnswer: valid answer", () => {
    it("passes deterministic checks, but still requires human review for the narrative claim", () => {
        const r = validateGrantAnswer(makeValidAnswer(), ctx);
        assert.deepStrictEqual(r.errors, []);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.requiresHumanReview, true);
        assert.deepStrictEqual(flagCodes(r), ["NARRATIVE_CLAIM_UNVERIFIED"]);
        assert.strictEqual(r.reviewFlags[0].claimIndex, 2);
    });

    it("does not require review when there are no narrative claims and the draft is fully backed", () => {
        const a = makeValidAnswer();
        a.claims.pop();
        a.draftText = a.draftText.replace(" Volunteers describe a warm, welcoming atmosphere.", "");
        const r = validateGrantAnswer(a, ctx);
        assert.deepStrictEqual(r.errors, []);
        assert.deepStrictEqual(r.reviewFlags, []);
        assert.strictEqual(r.requiresHumanReview, false);
    });
});

describe("evidence citations", () => {
    it("rejects a claim with no evidence ids", () => {
        const a = makeValidAnswer();
        a.claims[0].evidenceItemIds = [];
        assert.ok(hasError(validateGrantAnswer(a, ctx), "CLAIM_MISSING_EVIDENCE", 0));
    });

    it("rejects evidence that does not exist", () => {
        const a = makeValidAnswer();
        a.claims[2].evidenceItemIds = ["ev-made-up"];
        assert.ok(hasError(validateGrantAnswer(a, ctx), "EVIDENCE_NOT_FOUND", 2));
    });

    it("rejects evidence from another organization", () => {
        const a = makeValidAnswer();
        a.claims[2].evidenceItemIds = ["ev-other-org"];
        assert.ok(hasError(validateGrantAnswer(a, ctx), "EVIDENCE_WRONG_ORGANIZATION", 2));
    });

    it("rejects rejected evidence and flags pending evidence", () => {
        const a = makeValidAnswer();
        a.claims[2].evidenceItemIds = ["ev-rejected"];
        a.claims[0].evidenceItemIds = ["ev-pending"];
        const r = validateGrantAnswer(a, ctx);
        assert.ok(hasError(r, "EVIDENCE_REJECTED", 2));
        assert.ok(flagCodes(r).includes("EVIDENCE_PENDING_VERIFICATION"));
    });

    it("does not let a model-supplied excerpt stand in for a trusted evidence record", () => {
        const a = makeValidAnswer();
        (a.claims[2] as unknown as Record<string, unknown>).evidenceItemIds = ["ev-made-up"];
        (a.claims[2] as unknown as Record<string, unknown>).evidenceExcerpt = "Volunteers describe a warm atmosphere.";
        assert.ok(hasError(validateGrantAnswer(a, ctx), "EVIDENCE_NOT_FOUND", 2));
    });
});

describe("required references", () => {
    it("requires metricReference on metric claims", () => {
        const a = makeValidAnswer();
        delete a.claims[0].metricReference;
        assert.ok(hasError(validateGrantAnswer(a, ctx), "METRIC_REFERENCE_MISSING", 0));
    });

    it("requires quoteReference on quote claims", () => {
        const a = makeValidAnswer();
        delete a.claims[1].quoteReference;
        assert.ok(hasError(validateGrantAnswer(a, ctx), "QUOTE_REFERENCE_MISSING", 1));
    });

    it("rejects an answer with no claims", () => {
        const a = makeValidAnswer();
        a.claims = [];
        assert.ok(codes(validateGrantAnswer(a, ctx)).includes("NO_CLAIMS"));
    });

    it("reports malformed model output instead of throwing", () => {
        const bad = { requirementKey: "x", draftText: "t", claims: [null, { claimText: "a", claimType: "other" }] };
        const r = validateGrantAnswer(bad as unknown as GeneratedGrantAnswer, ctx);
        assert.ok(hasError(r, "MALFORMED_ANSWER", 0));
        assert.ok(hasError(r, "MALFORMED_ANSWER", 1));
        const r2 = validateGrantAnswer(null as unknown as GeneratedGrantAnswer, ctx);
        assert.ok(codes(r2).includes("MALFORMED_ANSWER"));
    });
});

describe("metric references", () => {
    it("rejects an unknown metric", () => {
        const a = makeValidAnswer();
        a.claims[0].metricReference!.metricKey = "invented_metric";
        assert.ok(hasError(validateGrantAnswer(a, ctx), "METRIC_NOT_FOUND", 0));
    });

    it("rejects another organization's metric", () => {
        const a = makeValidAnswer();
        a.claims[0].metricReference = { metricKey: "other_org_metric", statedValue: 5, unit: "things", period: "2025-Q1" };
        assert.ok(hasError(validateGrantAnswer(a, ctx), "METRIC_WRONG_ORGANIZATION", 0));
    });

    it("rejects a value that differs from the trusted value", () => {
        const a = makeValidAnswer();
        a.claims[0].metricReference!.statedValue = 61;
        assert.ok(hasError(validateGrantAnswer(a, ctx), "METRIC_VALUE_MISMATCH", 0));
    });

    it("rejects a unit mismatch", () => {
        const a = makeValidAnswer();
        a.claims[0].metricReference!.unit = "unique residents";
        assert.ok(hasError(validateGrantAnswer(a, ctx), "METRIC_UNIT_MISMATCH", 0));
    });

    it("rejects a reporting-period mismatch", () => {
        const a = makeValidAnswer();
        a.claims[0].metricReference!.period = "2025-Q2";
        assert.ok(hasError(validateGrantAnswer(a, ctx), "METRIC_PERIOD_MISMATCH", 0));
    });

    it("tolerates case and whitespace differences in unit/period labels", () => {
        const a = makeValidAnswer();
        a.claims[0].metricReference!.unit = "  Concerts ";
        a.claims[0].metricReference!.period = "2025-q1";
        assert.deepStrictEqual(validateGrantAnswer(a, ctx).errors, []);
    });

    it('catches "600 concerts" in claimText when the metric reference correctly says 60', () => {
        const a = makeValidAnswer();
        a.claims[0].claimText = "In 2025-Q1 we performed 600 concerts.";
        a.draftText = a.draftText.replace("60 concerts", "600 concerts");
        const r = validateGrantAnswer(a, ctx);
        assert.strictEqual(a.claims[0].metricReference!.statedValue, 60); // structured metadata is correct
        assert.ok(hasError(r, "METRIC_CLAIM_TEXT_VALUE_MISMATCH", 0));
        assert.strictEqual(r.valid, false);
        assert.ok(flagCodes(r).includes("NUMBER_IN_DRAFT_NOT_BACKED"));
    });
});

describe("metric claim text must not hide a wrong quantity", () => {
    it("fails when the correct number appears alongside a wrong number of the SAME measure", () => {
        const a = makeValidAnswer();
        a.claims[0].claimText = "In 2025-Q1 we performed 60 concerts, plus 600 concerts at other venues.";
        const r = validateGrantAnswer(a, ctx);
        assert.ok(hasError(r, "METRIC_CLAIM_TEXT_VALUE_MISMATCH", 0));
        assert.match(r.errors.find((e) => e.code === "METRIC_CLAIM_TEXT_VALUE_MISMATCH")!.message, /600/);
    });

    it("flags, but does not reject, an extra quantity of a DIFFERENT measure that no reference covers", () => {
        // Behavior change: this used to be a blocking error for ANY extra number. A different measure
        // ("600 residents") is not contradicted by the concert count; it is merely unsupported.
        const a = makeValidAnswer();
        a.claims[0].claimText = "In 2025-Q1 we performed 60 concerts for 600 residents.";
        const r = validateGrantAnswer(a, ctx);
        assert.deepStrictEqual(r.errors, []);
        assert.ok(r.reviewFlags.some((f) => f.code === "NUMBER_IN_CLAIM_NOT_BACKED" && f.claimIndex === 0));
        assert.strictEqual(r.requiresHumanReview, true);
    });

    it("does not skip year-like quantities (2000 concerts is not a year)", () => {
        const a = makeValidAnswer();
        a.claims[0].claimText = "In 2025-Q1 we performed 2000 concerts.";
        assert.ok(hasError(validateGrantAnswer(a, ctx), "METRIC_CLAIM_TEXT_VALUE_MISMATCH", 0));
    });

    it("still allows the period label and the trusted value, in any common form", () => {
        const a = makeValidAnswer();
        a.claims[0].claimText = "During Q1 2025 we performed 60 concerts.";
        assert.deepStrictEqual(validateGrantAnswer(a, ctx).errors, []);
        const b = makeValidAnswer();
        b.claims[0].metricReference = { metricKey: "participant_encounters", statedValue: 1240, unit: "participant encounters", period: "2025-Q1" };
        b.claims[0].claimText = "We recorded 1,240 participant encounters in 2025-Q1.";
        assert.deepStrictEqual(validateGrantAnswer(b, ctx).errors, []);
    });
});

describe("quote references", () => {
    it("rejects an unknown quote record", () => {
        const a = makeValidAnswer();
        a.claims[1].quoteReference!.quoteRecordId = "quote-invented";
        assert.ok(hasError(validateGrantAnswer(a, ctx), "QUOTE_NOT_FOUND", 1));
    });

    it("rejects another organization's quote", () => {
        const a = makeValidAnswer();
        a.claims[1].quoteReference = { quoteRecordId: "quote-other-org", quotedText: "Synthetic quote from another organization." };
        assert.ok(hasError(validateGrantAnswer(a, ctx), "QUOTE_WRONG_ORGANIZATION", 1));
    });

    it("rejects a quote not linked to any cited evidence source", () => {
        const a = makeValidAnswer();
        a.claims[1].evidenceItemIds = ["ev-reflection-2"]; // quote-ok comes from refl-1
        assert.ok(hasError(validateGrantAnswer(a, ctx), "QUOTE_SOURCE_NOT_CITED", 1));
    });

    it("rejects quotedText that differs from stored text, and compares only against the stored record", () => {
        const a = makeValidAnswer();
        a.claims[1].quoteReference!.quotedText = "The music made my whole life feel like home.";
        assert.ok(hasError(validateGrantAnswer(a, ctx), "QUOTE_TEXT_MISMATCH", 1));
    });

    it("accepts whitespace and curly-quote differences in quotedText", () => {
        const a = makeValidAnswer();
        a.claims[1].quoteReference!.quotedText = "  The music made my   afternoon feel like home. ";
        assert.deepStrictEqual(validateGrantAnswer(a, ctx).errors, []);
    });

    it("rejects a quote whose stored consent is not confirmed_with_evidence", () => {
        const a = makeValidAnswer();
        a.claims[1].evidenceItemIds = ["ev-reflection-2"];
        a.claims[1].quoteReference = { quoteRecordId: "quote-unknown-consent", quotedText: "I looked forward to Tuesday all week." };
        assert.ok(hasError(validateGrantAnswer(a, ctx), "QUOTE_CONSENT_NOT_CONFIRMED", 1));
    });

    it("rejects confirmed consent that has no supporting consent evidence", () => {
        const a = makeValidAnswer();
        a.claims[1].quoteReference = { quoteRecordId: "quote-confirmed-no-evidence", quotedText: "It reminded me of my wedding song." };
        assert.ok(hasError(validateGrantAnswer(a, ctx), "QUOTE_CONSENT_EVIDENCE_MISSING", 1));
    });

    it("ignores model-supplied consent assertions; trusted record decides", () => {
        const a = makeValidAnswer();
        a.claims[1].evidenceItemIds = ["ev-reflection-2"];
        a.claims[1].quoteReference = {
            quoteRecordId: "quote-unknown-consent",
            quotedText: "I looked forward to Tuesday all week.",
            consent_status: "confirmed_with_evidence",
            consentEvidence: "The resident said it was fine.",
        } as unknown as GeneratedGrantAnswer["claims"][number]["quoteReference"];
        (a.claims[1] as unknown as Record<string, unknown>).consentConfirmed = true;
        assert.ok(hasError(validateGrantAnswer(a, ctx), "QUOTE_CONSENT_NOT_CONFIRMED", 1));
    });
});

describe("valid vs requiresHumanReview", () => {
    it("valid: true coexists with requiresHumanReview: true", () => {
        const r = validateGrantAnswer(makeValidAnswer(), ctx);
        assert.deepStrictEqual([r.valid, r.requiresHumanReview], [true, true]);
    });
});

describe("draftText limitations", () => {
    it("flags, but does not error on, a narrative claim whose citation exists", () => {
        const r = validateGrantAnswer(makeValidAnswer(), ctx);
        assert.strictEqual(r.valid, true);
        assert.ok(flagCodes(r).includes("NARRATIVE_CLAIM_UNVERIFIED"));
    });

    it("flags a quoted passage in draftText that no cited stored quote backs", () => {
        const a = makeValidAnswer();
        a.draftText += ' Another said, "This program changed how I see my mother."';
        const r = validateGrantAnswer(a, ctx);
        assert.strictEqual(r.valid, true); // heuristic only: flagged, not blocked
        assert.strictEqual(r.requiresHumanReview, true);
        assert.ok(flagCodes(r).includes("QUOTED_TEXT_IN_DRAFT_NOT_BACKED"));
    });

    it("flags when stored quote text or metric value is absent from draftText", () => {
        const a = makeValidAnswer();
        a.draftText = "A general statement about our program.";
        const f = flagCodes(validateGrantAnswer(a, ctx));
        assert.ok(f.includes("QUOTE_NOT_IN_DRAFT"));
        assert.ok(f.includes("METRIC_VALUE_NOT_IN_DRAFT"));
        assert.ok(f.includes("CLAIM_TEXT_NOT_IN_DRAFT"));
    });

    it("flags an unbacked number in draftText even when the claims are correct", () => {
        const a = makeValidAnswer();
        a.draftText += " We reached 900 families.";
        const r = validateGrantAnswer(a, ctx);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.requiresHumanReview, true);
        assert.ok(flagCodes(r).includes("NUMBER_IN_DRAFT_NOT_BACKED"));
    });

    it("flags short quoted passages too (a one-word resident quote still needs consent)", () => {
        const a = makeValidAnswer();
        a.draftText += ' One said it was "wonderful".';
        assert.ok(flagCodes(validateGrantAnswer(a, ctx)).includes("QUOTED_TEXT_IN_DRAFT_NOT_BACKED"));
    });

    it("flags uncovered prose, so an untraceable sentence never yields requiresHumanReview: false", () => {
        const a = makeValidAnswer();
        a.claims.pop();
        a.draftText = a.draftText.replace("Volunteers describe a warm, welcoming atmosphere.", "Our program cures loneliness entirely.");
        const r = validateGrantAnswer(a, ctx);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.requiresHumanReview, true);
        assert.ok(flagCodes(r).includes("DRAFT_TEXT_NOT_COVERED_BY_CLAIMS"));
    });

    it("reports a blank draftText as malformed", () => {
        const a = makeValidAnswer();
        a.draftText = "  ";
        assert.ok(codes(validateGrantAnswer(a, ctx)).includes("MALFORMED_ANSWER"));
    });

    it("detects number words in draftText (formerly a known gap)", () => {
        const a = makeValidAnswer();
        a.draftText += " We performed six hundred concerts.";
        const r = validateGrantAnswer(a, ctx);
        assert.ok(flagCodes(r).includes("NUMBER_IN_DRAFT_NOT_BACKED"));
    });

    it("known gap: period wording in uncovered prose is not checked (the prose is still flagged as uncovered)", () => {
        const a = makeValidAnswer();
        a.draftText += " We performed 60 concerts last year.";
        const r = validateGrantAnswer(a, ctx);
        assert.ok(!flagCodes(r).includes("NUMBER_IN_DRAFT_NOT_BACKED"));
        assert.ok(flagCodes(r).includes("DRAFT_TEXT_NOT_COVERED_BY_CLAIMS"));
    });
});

describe("multiple errors", () => {
    it("reports every problem with stable codes and claim indexes", () => {
        const a = makeValidAnswer();
        a.claims[0].metricReference = { metricKey: "concerts_performed", statedValue: 600, unit: "people", period: "2024-Q4" };
        a.claims[1].quoteReference!.quotedText = "Something the resident never said.";
        a.claims[1].evidenceItemIds = ["ev-other-org"];
        a.claims[2].evidenceItemIds = [];
        const r = validateGrantAnswer(a, ctx);
        assert.strictEqual(r.valid, false);
        const got = r.errors.map((e) => `${e.claimIndex}:${e.code}`).sort();
        assert.deepStrictEqual(got, [
            "0:METRIC_PERIOD_MISMATCH",
            "0:METRIC_UNIT_MISMATCH",
            "0:METRIC_VALUE_MISMATCH",
            "1:EVIDENCE_WRONG_ORGANIZATION",
            "1:QUOTE_SOURCE_NOT_CITED",
            "1:QUOTE_TEXT_MISMATCH",
            "2:CLAIM_MISSING_EVIDENCE",
        ]);
        assert.ok(r.errors.every((e) => typeof e.message === "string" && e.message.length > 0));
    });
});

describe("purity", () => {
    it("does not mutate its inputs", () => {
        const a = makeValidAnswer();
        const before = JSON.stringify([a, ctx]);
        validateGrantAnswer(a, ctx);
        assert.strictEqual(JSON.stringify([a, ctx]), before);
    });
});
