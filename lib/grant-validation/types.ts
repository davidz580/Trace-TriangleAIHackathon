/**
 * PROPOSED CONTRACT — generated grant answers (for review by Andrew and David).
 *
 * Nothing here exists in the database or in a generation pipeline yet. This is
 * the shape the grant-generation step is asked to emit, and the shape the
 * validator in `validate-grant-answer.ts` consumes. It is deliberately isolated
 * from `types/database.ts`; existing types are reused, not modified.
 *
 * Mapping to existing tables (if/when persisted):
 *   - GeneratedClaim.claimType      -> ClaimType            (grant_claims.claim_type)
 *   - GeneratedClaim.claimText      -> grant_claims.claim_text
 *   - GeneratedClaim.evidenceItemIds-> evidence_citations.evidence_item_id
 *   - requirementKey                -> grant_requirements.requirement_key
 *   - draftText                     -> grant_responses.draft_text
 *
 * Everything in a GeneratedGrantAnswer is MODEL-SUPPLIED and UNTRUSTED. Ids and
 * values in it are claims to be checked against trusted records, never facts.
 */
import type {
    ClaimType,
    EvidenceItem,
    QuoteRecord,
} from "../../types/database.ts";

export type { ClaimType };

export interface MetricReference {
    /** Key of a trusted computed metric (see TrustedMetric). */
    metricKey: string;
    /** The value the model states. Must equal the trusted computed value. */
    statedValue: number;
    /** Unit the model states (e.g. "participant encounters"). */
    unit: string;
    /** Reporting period the model states (e.g. "2025-Q1"). */
    period: string;
}

export interface QuoteReference {
    /** Id of a stored quote_records row. */
    quoteRecordId: string;
    /** The text the model claims the quote says. Must match the stored text. */
    quotedText: string;
}

export interface GeneratedClaim {
    claimText: string;
    claimType: ClaimType;
    /** Evidence items the model cites. All claim types require at least one. */
    evidenceItemIds: string[];
    /** Required when claimType === "metric". */
    metricReference?: MetricReference;
    /** Required when claimType === "quote". */
    quoteReference?: QuoteReference;
}

export interface GeneratedGrantAnswer {
    requirementKey: string;
    draftText: string;
    claims: GeneratedClaim[];
}

/**
 * A server-computed metric value. PROPOSED: no computed-metric type exists yet
 * (metric_definitions holds only name/unit/period, not values). Values must come
 * from deterministic TS/SQL aggregation (e.g. lib/aggregations.ts), never a model.
 */
export interface TrustedMetric {
    organizationId: string;
    metricKey: string;
    value: number;
    unit: string;
    /** Reporting period the value was computed over. */
    period: string;
}

/** Trusted inputs. Callers load these server-side; the validator does no I/O. */
export interface GrantValidationContext {
    /** The organization the answer is being generated for. */
    organizationId: string;
    /** Database EvidenceItem rows (types/database.ts), not the UI type in types/index.ts. */
    evidenceItems: readonly EvidenceItem[];
    metrics: readonly TrustedMetric[];
    quoteRecords: readonly QuoteRecord[];
}

export type GrantValidationErrorCode =
    | "MALFORMED_ANSWER"
    | "NO_CLAIMS"
    | "CLAIM_MISSING_EVIDENCE"
    | "EVIDENCE_NOT_FOUND"
    | "EVIDENCE_WRONG_ORGANIZATION"
    | "EVIDENCE_REJECTED"
    | "METRIC_REFERENCE_MISSING"
    | "METRIC_NOT_FOUND"
    | "METRIC_WRONG_ORGANIZATION"
    | "METRIC_VALUE_MISMATCH"
    | "METRIC_UNIT_MISMATCH"
    | "METRIC_PERIOD_MISMATCH"
    | "METRIC_CLAIM_TEXT_VALUE_MISMATCH"
    | "QUOTE_REFERENCE_MISSING"
    | "QUOTE_NOT_FOUND"
    | "QUOTE_WRONG_ORGANIZATION"
    | "QUOTE_SOURCE_NOT_CITED"
    | "QUOTE_TEXT_MISMATCH"
    | "QUOTE_CONSENT_NOT_CONFIRMED"
    | "QUOTE_CONSENT_EVIDENCE_MISSING";

/** Blocking problem: the answer must not be shown as grounded. */
export interface GrantValidationError {
    code: GrantValidationErrorCode;
    message: string;
    /** Index into answer.claims; absent for answer-level errors. */
    claimIndex?: number;
}

export type GrantReviewFlagCode =
    | "NARRATIVE_CLAIM_UNVERIFIED"
    | "EVIDENCE_PENDING_VERIFICATION"
    | "CLAIM_TEXT_NOT_IN_DRAFT"
    | "METRIC_VALUE_NOT_IN_DRAFT"
    | "NUMBER_IN_DRAFT_NOT_BACKED"
    | "QUOTE_NOT_IN_DRAFT"
    | "QUOTED_TEXT_IN_DRAFT_NOT_BACKED"
    | "DRAFT_TEXT_NOT_COVERED_BY_CLAIMS";

/** Non-blocking: heuristic or unverifiable content a human must review. */
export interface GrantReviewFlag {
    code: GrantReviewFlagCode;
    message: string;
    claimIndex?: number;
}

export interface GrantAnswerValidationResult {
    /**
     * True only if there are no blocking errors. NOT a statement that the
     * answer is true. `valid: true` routinely coexists with
     * `requiresHumanReview: true`; never present it as "verified".
     */
    valid: boolean;
    errors: GrantValidationError[];
    reviewFlags: GrantReviewFlag[];
    /**
     * True whenever any review flag exists (always with narrative claims). False
     * means only that no heuristic fired, not that the draft was verified.
     */
    requiresHumanReview: boolean;
}
