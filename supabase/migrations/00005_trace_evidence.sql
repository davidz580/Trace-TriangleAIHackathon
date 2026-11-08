-- Migration: 00005_trace_evidence.sql
-- Phase: 2B — database architecture and migration design
-- Tables: historical_sources, director_inputs, evidence_items

-- ============================================================
-- Historical Sources
-- ============================================================
CREATE TABLE historical_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_type text NOT NULL CHECK (source_type IN ('historical_upload','director_input')),
    title text NOT NULL,
    content_excerpt text,
    original_filename text,
    uploaded_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_historical_sources_org_id ON historical_sources(organization_id);
CREATE INDEX idx_historical_sources_source_type ON historical_sources(source_type);
CREATE INDEX idx_historical_sources_uploaded_by ON historical_sources(uploaded_by);

-- ============================================================
-- Director Inputs
-- ============================================================
CREATE TABLE director_inputs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    category text NOT NULL,
    prompt_text text NOT NULL,
    response_text text NOT NULL,
    submitted_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_director_inputs_org_id ON director_inputs(organization_id);
CREATE INDEX idx_director_inputs_category ON director_inputs(category);
CREATE INDEX idx_director_inputs_submitted_by ON director_inputs(submitted_by);

-- ============================================================
-- Evidence Items
-- ============================================================
CREATE TABLE evidence_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- Typed nullable source foreign keys with exactly-one-source CHECK.
    source_volunteer_reflection_id uuid REFERENCES volunteer_reflections(id) ON DELETE CASCADE,
    source_historical_source_id uuid REFERENCES historical_sources(id) ON DELETE CASCADE,
    source_director_input_id uuid REFERENCES director_inputs(id) ON DELETE CASCADE,
    excerpt text NOT NULL,
    claim_type text,
    tags text[],
    verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
    consent_status text CHECK (consent_status IN ('unknown','not_documented','confirmed_with_evidence','denied')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id),
    CONSTRAINT chk_evidence_exactly_one_source CHECK (
        (source_volunteer_reflection_id IS NOT NULL)::int +
        (source_historical_source_id IS NOT NULL)::int +
        (source_director_input_id IS NOT NULL)::int = 1
    )
);

CREATE INDEX idx_evidence_items_org_id ON evidence_items(organization_id);
CREATE INDEX idx_evidence_items_source_volunteer ON evidence_items(source_volunteer_reflection_id);
CREATE INDEX idx_evidence_items_source_historical ON evidence_items(source_historical_source_id);
CREATE INDEX idx_evidence_items_source_director ON evidence_items(source_director_input_id);
CREATE INDEX idx_evidence_items_verification ON evidence_items(verification_status);
CREATE INDEX idx_evidence_items_claim_type ON evidence_items(claim_type);
CREATE INDEX idx_evidence_items_tags ON evidence_items USING gin(tags);

-- ============================================================
-- updated_at Triggers (shared function defined in 00001)
-- ============================================================
CREATE TRIGGER set_updated_at_director_inputs
    BEFORE UPDATE ON director_inputs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE historical_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE director_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_items ENABLE ROW LEVEL SECURITY;

-- historical_sources
CREATE POLICY historical_sources_select_member ON historical_sources
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY historical_sources_insert_director ON historical_sources
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY historical_sources_update_director ON historical_sources
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY historical_sources_delete_director ON historical_sources
    FOR DELETE USING (is_org_director(organization_id));

-- director_inputs
CREATE POLICY director_inputs_select_member ON director_inputs
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY director_inputs_insert_director ON director_inputs
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY director_inputs_update_director ON director_inputs
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY director_inputs_delete_director ON director_inputs
    FOR DELETE USING (is_org_director(organization_id));

-- evidence_items
CREATE POLICY evidence_items_select_member ON evidence_items
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY evidence_items_insert_director ON evidence_items
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY evidence_items_update_director ON evidence_items
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY evidence_items_delete_director ON evidence_items
    FOR DELETE USING (is_org_director(organization_id));

-- ============================================================
-- Evidence source validation trigger
-- Verifies BOTH that the source record exists AND that its
-- organization_id matches the evidence item's organization_id.
-- Prevents cross-organization linking.
-- ============================================================
CREATE OR REPLACE FUNCTION validate_evidence_source()
RETURNS trigger AS $$
DECLARE
    v_source_org_id uuid;
BEGIN
    IF NEW.source_volunteer_reflection_id IS NOT NULL THEN
        SELECT organization_id INTO v_source_org_id
        FROM volunteer_reflections WHERE id = NEW.source_volunteer_reflection_id;
        IF v_source_org_id IS NULL THEN
            RAISE EXCEPTION 'Invalid source volunteer_reflections id';
        END IF;
        IF v_source_org_id <> NEW.organization_id THEN
            RAISE EXCEPTION 'Evidence organization_id does not match source organization_id';
        END IF;
    ELSIF NEW.source_historical_source_id IS NOT NULL THEN
        SELECT organization_id INTO v_source_org_id
        FROM historical_sources WHERE id = NEW.source_historical_source_id;
        IF v_source_org_id IS NULL THEN
            RAISE EXCEPTION 'Invalid source historical_sources id';
        END IF;
        IF v_source_org_id <> NEW.organization_id THEN
            RAISE EXCEPTION 'Evidence organization_id does not match source organization_id';
        END IF;
    ELSIF NEW.source_director_input_id IS NOT NULL THEN
        SELECT organization_id INTO v_source_org_id
        FROM director_inputs WHERE id = NEW.source_director_input_id;
        IF v_source_org_id IS NULL THEN
            RAISE EXCEPTION 'Invalid source director_inputs id';
        END IF;
        IF v_source_org_id <> NEW.organization_id THEN
            RAISE EXCEPTION 'Evidence organization_id does not match source organization_id';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER trg_validate_evidence_source
    BEFORE INSERT OR UPDATE ON evidence_items
    FOR EACH ROW EXECUTE FUNCTION validate_evidence_source();
