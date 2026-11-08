-- Migration: 00006_trace_grants.sql
-- Phase: 2B — database architecture and migration design
-- Tables: grants, grant_requirements, grant_responses, grant_claims, evidence_citations

-- ============================================================
-- Grants
-- ============================================================
CREATE TABLE grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title text NOT NULL,
    funder_name text,
    rfp_url text,
    deadline date,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','submitted','awarded','declined')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_grants_org_id ON grants(organization_id);
CREATE INDEX idx_grants_status ON grants(status);
CREATE INDEX idx_grants_deadline ON grants(deadline);

-- ============================================================
-- Grant Requirements
-- ============================================================
CREATE TABLE grant_requirements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    grant_id uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
    requirement_key text NOT NULL,
    question_text text NOT NULL,
    max_words int,
    sort_order int NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id),
    FOREIGN KEY (organization_id, grant_id) REFERENCES grants(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_grant_requirements_grant_id ON grant_requirements(grant_id);

-- ============================================================
-- Grant Responses
-- ============================================================
CREATE TABLE grant_responses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    grant_id uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
    requirement_id uuid NOT NULL REFERENCES grant_requirements(id) ON DELETE CASCADE,
    draft_text text,
    final_text text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','edited','approved')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id),
    UNIQUE (grant_id, requirement_id),
    FOREIGN KEY (organization_id, grant_id) REFERENCES grants(organization_id, id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, requirement_id) REFERENCES grant_requirements(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_grant_responses_grant_id ON grant_responses(grant_id);
CREATE INDEX idx_grant_responses_requirement_id ON grant_responses(requirement_id);

-- ============================================================
-- Grant Claims
-- ============================================================
CREATE TABLE grant_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    grant_id uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
    response_id uuid REFERENCES grant_responses(id) ON DELETE SET NULL,
    claim_text text NOT NULL,
    claim_type text CHECK (claim_type IN ('metric','quote','narrative')),
    is_supported boolean,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id),
    FOREIGN KEY (organization_id, grant_id) REFERENCES grants(organization_id, id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, response_id) REFERENCES grant_responses(organization_id, id) ON DELETE SET NULL (response_id)
);

CREATE INDEX idx_grant_claims_grant_id ON grant_claims(grant_id);
CREATE INDEX idx_grant_claims_response_id ON grant_claims(response_id);

-- ============================================================
-- Evidence Citations
-- ============================================================
CREATE TABLE evidence_citations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    claim_id uuid NOT NULL REFERENCES grant_claims(id) ON DELETE CASCADE,
    evidence_item_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
    citation_text text,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, claim_id) REFERENCES grant_claims(organization_id, id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, evidence_item_id) REFERENCES evidence_items(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_evidence_citations_claim_id ON evidence_citations(claim_id);
CREATE INDEX idx_evidence_citations_evidence_item_id ON evidence_citations(evidence_item_id);

-- ============================================================
-- updated_at Triggers (shared function defined in 00001)
-- ============================================================
CREATE TRIGGER set_updated_at_grants
    BEFORE UPDATE ON grants
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_grant_responses
    BEFORE UPDATE ON grant_responses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_citations ENABLE ROW LEVEL SECURITY;

-- grants
CREATE POLICY grants_select_member ON grants
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY grants_insert_director ON grants
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY grants_update_director ON grants
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY grants_delete_director ON grants
    FOR DELETE USING (is_org_director(organization_id));

-- grant_requirements
CREATE POLICY grant_requirements_select_member ON grant_requirements
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM grants g
            WHERE g.id = grant_requirements.grant_id
              AND is_org_member(g.organization_id)
        )
    );
CREATE POLICY grant_requirements_insert_director ON grant_requirements
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM grants g
            WHERE g.id = grant_requirements.grant_id
              AND is_org_director(g.organization_id)
        )
    );
CREATE POLICY grant_requirements_update_director ON grant_requirements
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM grants g
            WHERE g.id = grant_requirements.grant_id
              AND is_org_director(g.organization_id)
        )
    );
CREATE POLICY grant_requirements_delete_director ON grant_requirements
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM grants g
            WHERE g.id = grant_requirements.grant_id
              AND is_org_director(g.organization_id)
        )
    );

-- grant_responses
CREATE POLICY grant_responses_select_member ON grant_responses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM grants g
            WHERE g.id = grant_responses.grant_id
              AND is_org_member(g.organization_id)
        )
    );
CREATE POLICY grant_responses_insert_director ON grant_responses
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM grants g
            WHERE g.id = grant_responses.grant_id
              AND is_org_director(g.organization_id)
        )
    );
CREATE POLICY grant_responses_update_director ON grant_responses
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM grants g
            WHERE g.id = grant_responses.grant_id
              AND is_org_director(g.organization_id)
        )
    );
CREATE POLICY grant_responses_delete_director ON grant_responses
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM grants g
            WHERE g.id = grant_responses.grant_id
              AND is_org_director(g.organization_id)
        )
    );

-- grant_claims
CREATE POLICY grant_claims_select_member ON grant_claims
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM grants g
            WHERE g.id = grant_claims.grant_id
              AND is_org_member(g.organization_id)
        )
    );
CREATE POLICY grant_claims_insert_director ON grant_claims
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM grants g
            WHERE g.id = grant_claims.grant_id
              AND is_org_director(g.organization_id)
        )
    );
CREATE POLICY grant_claims_update_director ON grant_claims
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM grants g
            WHERE g.id = grant_claims.grant_id
              AND is_org_director(g.organization_id)
        )
    );
CREATE POLICY grant_claims_delete_director ON grant_claims
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM grants g
            WHERE g.id = grant_claims.grant_id
              AND is_org_director(g.organization_id)
        )
    );

-- evidence_citations
CREATE POLICY evidence_citations_select_member ON evidence_citations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM grant_claims gc
            JOIN grants g ON g.id = gc.grant_id
            WHERE gc.id = evidence_citations.claim_id
              AND is_org_member(g.organization_id)
        )
    );
CREATE POLICY evidence_citations_insert_director ON evidence_citations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM grant_claims gc
            JOIN grants g ON g.id = gc.grant_id
            WHERE gc.id = evidence_citations.claim_id
              AND is_org_director(g.organization_id)
        )
    );
CREATE POLICY evidence_citations_update_director ON evidence_citations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM grant_claims gc
            JOIN grants g ON g.id = gc.grant_id
            WHERE gc.id = evidence_citations.claim_id
              AND is_org_director(g.organization_id)
        )
    );
CREATE POLICY evidence_citations_delete_director ON evidence_citations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM grant_claims gc
            JOIN grants g ON g.id = gc.grant_id
            WHERE gc.id = evidence_citations.claim_id
              AND is_org_director(g.organization_id)
        )
    );
