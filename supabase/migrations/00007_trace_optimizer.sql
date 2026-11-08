-- Migration: 00007_trace_optimizer.sql
-- Phase: 2B — database architecture and migration design
-- Tables: question_presentation_events, form_optimizer_recommendations, form_optimizer_approval_history

-- ============================================================
-- Question Presentation Events
-- ============================================================
CREATE TABLE question_presentation_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    question_id uuid NOT NULL REFERENCES organization_questions(id) ON DELETE CASCADE,
    form_version_id uuid NOT NULL REFERENCES form_versions(id) ON DELETE CASCADE,
    event_type text NOT NULL CHECK (event_type IN ('presented','answered','skipped')),
    reflection_id uuid REFERENCES volunteer_reflections(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Tenant-consistent composite foreign keys
    FOREIGN KEY (organization_id, question_id) REFERENCES organization_questions(organization_id, id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, form_version_id) REFERENCES form_versions(organization_id, id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, reflection_id) REFERENCES volunteer_reflections(organization_id, id) ON DELETE SET NULL (reflection_id)
);

CREATE INDEX idx_question_presentation_events_org_id ON question_presentation_events(organization_id);
CREATE INDEX idx_question_presentation_events_question_id ON question_presentation_events(question_id);
CREATE INDEX idx_question_presentation_events_form_version_id ON question_presentation_events(form_version_id);
CREATE INDEX idx_question_presentation_events_reflection_id ON question_presentation_events(reflection_id);
CREATE INDEX idx_question_presentation_events_event_type ON question_presentation_events(event_type);

-- ============================================================
-- Form Optimizer Recommendations
-- ============================================================
CREATE TABLE form_optimizer_recommendations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    suggested_question_text text NOT NULL,
    suggested_question_type text NOT NULL CHECK (suggested_question_type IN ('text','number','rating','boolean','single_choice','multi_choice')),
    rationale text,
    evidence_gap text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','implemented')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_form_optimizer_recommendations_org_id ON form_optimizer_recommendations(organization_id);
CREATE INDEX idx_form_optimizer_recommendations_status ON form_optimizer_recommendations(status);

-- ============================================================
-- Form Optimizer Approval History
-- ============================================================
CREATE TABLE form_optimizer_approval_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    recommendation_id uuid REFERENCES form_optimizer_recommendations(id) ON DELETE SET NULL,
    action text NOT NULL CHECK (action IN ('approve','reject','retire','add_question','modify_question')),
    question_id uuid REFERENCES organization_questions(id) ON DELETE SET NULL,
    performed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Tenant-consistent composite foreign keys
    FOREIGN KEY (organization_id, recommendation_id) REFERENCES form_optimizer_recommendations(organization_id, id) ON DELETE SET NULL (recommendation_id),
    FOREIGN KEY (organization_id, question_id) REFERENCES organization_questions(organization_id, id) ON DELETE SET NULL (question_id)
);

CREATE INDEX idx_form_optimizer_approval_history_org_id ON form_optimizer_approval_history(organization_id);
CREATE INDEX idx_form_optimizer_approval_history_recommendation_id ON form_optimizer_approval_history(recommendation_id);
CREATE INDEX idx_form_optimizer_approval_history_question_id ON form_optimizer_approval_history(question_id);
CREATE INDEX idx_form_optimizer_approval_history_performed_by ON form_optimizer_approval_history(performed_by);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE question_presentation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_optimizer_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_optimizer_approval_history ENABLE ROW LEVEL SECURITY;

-- question_presentation_events
CREATE POLICY question_presentation_events_select_member ON question_presentation_events
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY question_presentation_events_insert_director ON question_presentation_events
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY question_presentation_events_update_director ON question_presentation_events
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY question_presentation_events_delete_director ON question_presentation_events
    FOR DELETE USING (is_org_director(organization_id));

-- form_optimizer_recommendations
CREATE POLICY form_optimizer_recommendations_select_member ON form_optimizer_recommendations
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY form_optimizer_recommendations_insert_director ON form_optimizer_recommendations
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY form_optimizer_recommendations_update_director ON form_optimizer_recommendations
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY form_optimizer_recommendations_delete_director ON form_optimizer_recommendations
    FOR DELETE USING (is_org_director(organization_id));

-- form_optimizer_approval_history
CREATE POLICY form_optimizer_approval_history_select_member ON form_optimizer_approval_history
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY form_optimizer_approval_history_insert_director ON form_optimizer_approval_history
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY form_optimizer_approval_history_update_director ON form_optimizer_approval_history
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY form_optimizer_approval_history_delete_director ON form_optimizer_approval_history
    FOR DELETE USING (is_org_director(organization_id));
