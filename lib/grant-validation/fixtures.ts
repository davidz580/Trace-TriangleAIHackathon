/**
 * SYNTHETIC TEST FIXTURES — NOT REAL DATA.
 * Every organization, id, quote, number, and consent record below is invented
 * for unit tests of validateGrantAnswer. Do not import from production code or
 * display in the UI. Shapes follow types/database.ts (EvidenceItem, QuoteRecord).
 */
import type { EvidenceItem, QuoteRecord } from "../../types/database.ts";
import type { GeneratedGrantAnswer, GrantValidationContext } from "./types.ts";

export const SYNTHETIC_ORG_ID = "synthetic-org-a";
export const SYNTHETIC_OTHER_ORG_ID = "synthetic-org-b";

const ts = "2025-01-01T00:00:00Z";

export const syntheticEvidence: EvidenceItem[] = [
    {
        id: "ev-reflection-1",
        organization_id: SYNTHETIC_ORG_ID,
        source_volunteer_reflection_id: "refl-1",
        source_historical_source_id: null,
        source_director_input_id: null,
        excerpt: "[synthetic] Residents hummed along during the concert.",
        claim_type: null,
        tags: null,
        verification_status: "verified",
        consent_status: null,
        created_at: ts,
    },
    {
        id: "ev-reflection-2",
        organization_id: SYNTHETIC_ORG_ID,
        source_volunteer_reflection_id: "refl-2",
        source_historical_source_id: null,
        source_director_input_id: null,
        excerpt: "[synthetic] A resident asked for another song.",
        claim_type: null,
        tags: null,
        verification_status: "verified",
        consent_status: null,
        created_at: ts,
    },
    {
        id: "ev-other-org",
        organization_id: SYNTHETIC_OTHER_ORG_ID,
        source_volunteer_reflection_id: "refl-other",
        source_historical_source_id: null,
        source_director_input_id: null,
        excerpt: "[synthetic] Belongs to a different organization.",
        claim_type: null,
        tags: null,
        verification_status: "verified",
        consent_status: null,
        created_at: ts,
    },
    {
        id: "ev-rejected",
        organization_id: SYNTHETIC_ORG_ID,
        source_volunteer_reflection_id: "refl-1",
        source_historical_source_id: null,
        source_director_input_id: null,
        excerpt: "[synthetic] Rejected evidence.",
        claim_type: null,
        tags: null,
        verification_status: "rejected",
        consent_status: null,
        created_at: ts,
    },
    {
        id: "ev-pending",
        organization_id: SYNTHETIC_ORG_ID,
        source_volunteer_reflection_id: "refl-1",
        source_historical_source_id: null,
        source_director_input_id: null,
        excerpt: "[synthetic] Not yet verified.",
        claim_type: null,
        tags: null,
        verification_status: "pending",
        consent_status: null,
        created_at: ts,
    },
];

const quote = (over: Partial<QuoteRecord> & Pick<QuoteRecord, "id" | "text">): QuoteRecord => ({
    organization_id: SYNTHETIC_ORG_ID,
    reflection_id: "refl-1",
    speaker: "resident",
    consent_status: "confirmed_with_evidence",
    consent_evidence: "[synthetic] Signed release on file, form SYN-001.",
    source_consent_label: null,
    is_redacted_before_ai: true,
    created_at: ts,
    ...over,
});

export const syntheticQuotes: QuoteRecord[] = [
    quote({ id: "quote-ok", text: "The music made my afternoon feel like home." }),
    quote({
        id: "quote-unknown-consent",
        reflection_id: "refl-2",
        text: "I looked forward to Tuesday all week.",
        consent_status: "unknown",
        consent_evidence: null,
    }),
    // Cannot exist in the DB (chk_quote_confirmed_requires_evidence); the validator must still not trust it.
    quote({
        id: "quote-confirmed-no-evidence",
        text: "It reminded me of my wedding song.",
        consent_evidence: "   ",
    }),
    quote({
        id: "quote-other-org",
        organization_id: SYNTHETIC_OTHER_ORG_ID,
        reflection_id: "refl-other",
        text: "Synthetic quote from another organization.",
    }),
];

export const syntheticContext: GrantValidationContext = {
    organizationId: SYNTHETIC_ORG_ID,
    evidenceItems: syntheticEvidence,
    quoteRecords: syntheticQuotes,
    metrics: [
        { organizationId: SYNTHETIC_ORG_ID, metricKey: "concerts_performed", value: 60, unit: "concerts", period: "2025-Q1" },
        { organizationId: SYNTHETIC_ORG_ID, metricKey: "participant_encounters", value: 1240, unit: "participant encounters", period: "2025-Q1" },
        { organizationId: SYNTHETIC_OTHER_ORG_ID, metricKey: "other_org_metric", value: 5, unit: "things", period: "2025-Q1" },
    ],
};

/** A fully valid answer; returns a fresh copy so tests can mutate it. Has one narrative claim, so it still requires review. */
export function makeValidAnswer(): GeneratedGrantAnswer {
    return {
        requirementKey: "community-impact",
        // Exactly the claim texts, so no prose is left uncovered by a claim.
        draftText:
            'In 2025-Q1 we performed 60 concerts. "The music made my afternoon feel like home." ' +
            "Volunteers describe a warm, welcoming atmosphere.",
        claims: [
            {
                claimText: "In 2025-Q1 we performed 60 concerts.",
                claimType: "metric",
                evidenceItemIds: ["ev-reflection-1"],
                metricReference: { metricKey: "concerts_performed", statedValue: 60, unit: "concerts", period: "2025-Q1" },
            },
            {
                claimText: '"The music made my afternoon feel like home."',
                claimType: "quote",
                evidenceItemIds: ["ev-reflection-1"],
                quoteReference: { quoteRecordId: "quote-ok", quotedText: "The music made my afternoon feel like home." },
            },
            {
                claimText: "Volunteers describe a warm, welcoming atmosphere.",
                claimType: "narrative",
                evidenceItemIds: ["ev-reflection-2"],
            },
        ],
    };
}
