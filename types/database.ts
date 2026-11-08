// types/database.ts
// TypeScript interfaces matching the Trace multi-tenant database schema.
// These are additive to types/index.ts (UI types) and generated manually here.

// ============================================================
// Core Multi-Tenant Tables
// ============================================================

export interface Organization {
    id: string;
    name: string;
    slug: string;
    mission: string | null;
    history: string | null;
    created_at: string;
    updated_at: string;
}

export type MembershipRole = 'owner' | 'director' | 'viewer';

export interface UserProfile {
    id: string;
    display_name: string | null;
    created_at: string;
    updated_at: string;
}

export interface OrganizationMembership {
    id: string;
    organization_id: string;
    user_id: string;
    role: MembershipRole;
    created_at: string;
    updated_at: string;
}

// ============================================================
// Organization Configuration
// ============================================================

export interface OrganizationProgram {
    id: string;
    organization_id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
}

export interface ActivityCategory {
    id: string;
    organization_id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
}

export interface HostSite {
    id: string;
    organization_id: string;
    name: string;
    address: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface OrganizationGoal {
    id: string;
    organization_id: string;
    program_id: string | null;
    title: string;
    description: string | null;
    created_at: string;
    updated_at: string;
}

export type AggregationType = 'sum' | 'median' | 'average' | 'count';

export interface MetricDefinition {
    id: string;
    organization_id: string;
    goal_id: string | null;
    name: string;
    unit: string | null;
    measurement_period: string | null;
    aggregation_type: AggregationType;
    created_at: string;
    updated_at: string;
}

// ============================================================
// Activity Sessions
// ============================================================

export interface ActivitySession {
    id: string;
    organization_id: string;
    activity_category_id: string | null;
    host_site_id: string | null;
    form_version_id: string | null;
    date: string; // date (YYYY-MM-DD)
    title: string | null;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface SessionInvitationToken {
    id: string;
    organization_id: string;
    session_id: string;
    token: string;
    expires_at: string | null;
    used_count: number;
    max_uses: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

// ============================================================
// Reflections
// ============================================================

export interface VolunteerIdentity {
    id: string;
    organization_id: string;
    display_name: string;
    primary_instrument: string | null;
    email: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface FormVersion {
    id: string;
    organization_id: string;
    version_number: number;
    published_at: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export type QuestionType = 'text' | 'number' | 'rating' | 'boolean' | 'single_choice' | 'multi_choice';

export interface OrganizationQuestion {
    id: string;
    organization_id: string;
    form_version_id: string;
    question_key: string;
    question_text: string;
    question_type: QuestionType;
    sort_order: number;
    is_required: boolean;
    config_json: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

export interface QuestionOption {
    id: string;
    question_id: string;
    option_value: string;
    option_label: string;
    sort_order: number;
    created_at: string;
}

export type SourceType = 'synthetic_demo' | 'historical_import' | 'live_submission';

export interface VolunteerReflection {
    id: string;
    organization_id: string;
    session_id: string | null;
    form_version_id: string;
    volunteer_id: string | null;
    submitted_at: string;
    source_type: SourceType;
    import_batch_id: string | null;
    idempotency_key: string;
    date: string | null; // YYYY-MM-DD
    host_site_id: string | null;
    format: 'solo' | 'small group' | 'sing-along' | 'interactive' | null;
    participant_encounters: number | null;
    minutes_performed: number | null;
    created_at: string;
}

export interface ReflectionAnswer {
    id: string;
    organization_id: string;
    reflection_id: string;
    question_id: string;
    question_text_snapshot: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    value_json: Record<string, unknown> | null;
    created_at: string;
}

export type SpeakerType = 'resident' | 'family member' | 'staff';
export type ConsentStatus = 'unknown' | 'not_documented' | 'confirmed_with_evidence' | 'denied';

export interface QuoteRecord {
    id: string;
    organization_id: string;
    reflection_id: string;
    text: string;
    speaker: SpeakerType | null;
    consent_status: ConsentStatus | null;
    consent_evidence: string | null;
    source_consent_label: string | null;
    is_redacted_before_ai: boolean;
    created_at: string;
}

// ============================================================
// Evidence
// ============================================================

export type HistoricalSourceType = 'historical_upload' | 'director_input';

export interface HistoricalSource {
    id: string;
    organization_id: string;
    source_type: HistoricalSourceType;
    title: string;
    content_excerpt: string | null;
    original_filename: string | null;
    uploaded_by: string | null;
    created_at: string;
}

export interface DirectorInput {
    id: string;
    organization_id: string;
    category: string;
    prompt_text: string;
    response_text: string;
    submitted_by: string | null;
    created_at: string;
    updated_at: string;
}

export type EvidenceSourceType = 'volunteer_reflection' | 'historical_upload' | 'director_input';
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface EvidenceItem {
    id: string;
    organization_id: string;
    source_volunteer_reflection_id: string | null;
    source_historical_source_id: string | null;
    source_director_input_id: string | null;
    excerpt: string;
    claim_type: string | null;
    tags: string[] | null;
    verification_status: VerificationStatus;
    consent_status: ConsentStatus | null;
    created_at: string;
}

// ============================================================
// Grants
// ============================================================

export type GrantStatus = 'draft' | 'in_progress' | 'submitted' | 'awarded' | 'declined';

export interface Grant {
    id: string;
    organization_id: string;
    title: string;
    funder_name: string | null;
    rfp_url: string | null;
    deadline: string | null; // date (YYYY-MM-DD)
    status: GrantStatus;
    created_at: string;
    updated_at: string;
}

export interface GrantRequirement {
    id: string;
    organization_id: string;
    grant_id: string;
    requirement_key: string;
    question_text: string;
    max_words: number | null;
    sort_order: number;
    created_at: string;
}

export type GrantResponseStatus = 'draft' | 'edited' | 'approved';

export interface GrantResponse {
    id: string;
    organization_id: string;
    grant_id: string;
    requirement_id: string;
    draft_text: string | null;
    final_text: string | null;
    status: GrantResponseStatus;
    created_at: string;
    updated_at: string;
}

export type ClaimType = 'metric' | 'quote' | 'narrative';

export interface GrantClaim {
    id: string;
    organization_id: string;
    grant_id: string;
    response_id: string | null;
    claim_text: string;
    claim_type: ClaimType | null;
    is_supported: boolean | null;
    created_at: string;
}

export interface EvidenceCitation {
    id: string;
    organization_id: string;
    claim_id: string;
    evidence_item_id: string;
    citation_text: string | null;
    created_at: string;
}

// ============================================================
// Form Optimizer
// ============================================================

export type PresentationEventType = 'presented' | 'answered' | 'skipped';

export interface QuestionPresentationEvent {
    id: string;
    organization_id: string;
    question_id: string;
    form_version_id: string;
    event_type: PresentationEventType;
    reflection_id: string | null;
    created_at: string;
}

export type RecommendationStatus = 'pending' | 'approved' | 'rejected' | 'implemented';

export interface FormOptimizerRecommendation {
    id: string;
    organization_id: string;
    suggested_question_text: string;
    suggested_question_type: QuestionType;
    rationale: string | null;
    evidence_gap: string | null;
    status: RecommendationStatus;
    created_at: string;
}

export type OptimizerAction = 'approve' | 'reject' | 'retire' | 'add_question' | 'modify_question';

export interface FormOptimizerApprovalHistory {
    id: string;
    organization_id: string;
    recommendation_id: string | null;
    action: OptimizerAction;
    question_id: string | null;
    performed_by: string | null;
    notes: string | null;
    created_at: string;
}

// ============================================================
// Import
// ============================================================

export type SourceClassification = 'synthetic_demo' | 'historical_import' | 'live_submission';

export interface ImportBatch {
    id: string;
    organization_id: string;
    source_classification: SourceClassification;
    confirmed_by: string | null;
    file_name: string | null;
    record_count: number | null;
    metadata_json: Record<string, unknown> | null;
    created_at: string;
}

// ============================================================
// View Models / Aggregates (non-table, used in UI)
// ============================================================

export interface DashboardMetrics {
    total_encounters: number;
    total_sessions: number;
    avg_engagement: number | null;
    active_volunteers: number;
}

export interface SessionWithMetadata extends ActivitySession {
    category_name: string | null;
    host_site_name: string | null;
    reflection_count: number;
}
