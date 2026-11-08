-- Migration: 00002_trace_org_config.sql
-- Phase: 2B — database architecture and migration design
-- Tables: organization_programs, activity_categories, host_sites,
--         organization_goals, metric_definitions

-- ============================================================
-- Organization Programs
-- ============================================================
CREATE TABLE organization_programs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_organization_programs_org_id ON organization_programs(organization_id);

-- ============================================================
-- Activity Categories
-- ============================================================
CREATE TABLE activity_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_activity_categories_org_id ON activity_categories(organization_id);

-- ============================================================
-- Host Sites
-- ============================================================
CREATE TABLE host_sites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    address text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_host_sites_org_id ON host_sites(organization_id);

-- ============================================================
-- Organization Goals
-- ============================================================
CREATE TABLE organization_goals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    program_id uuid REFERENCES organization_programs(id) ON DELETE SET NULL,
    title text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_organization_goals_org_id ON organization_goals(organization_id);
CREATE INDEX idx_organization_goals_program_id ON organization_goals(program_id);

-- ============================================================
-- Metric Definitions
-- ============================================================
CREATE TABLE metric_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    goal_id uuid REFERENCES organization_goals(id) ON DELETE SET NULL,
    name text NOT NULL,
    unit text,
    measurement_period text,
    aggregation_type text NOT NULL CHECK (aggregation_type IN ('sum','median','average','count')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_metric_definitions_org_id ON metric_definitions(organization_id);
CREATE INDEX idx_metric_definitions_goal_id ON metric_definitions(goal_id);

-- ============================================================
-- updated_at Triggers (shared function defined in 00001)
-- ============================================================
CREATE TRIGGER set_updated_at_organization_programs
    BEFORE UPDATE ON organization_programs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_activity_categories
    BEFORE UPDATE ON activity_categories
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_host_sites
    BEFORE UPDATE ON host_sites
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_organization_goals
    BEFORE UPDATE ON organization_goals
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_metric_definitions
    BEFORE UPDATE ON metric_definitions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE organization_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE host_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_definitions ENABLE ROW LEVEL SECURITY;

-- organization_programs
CREATE POLICY org_programs_select_member ON organization_programs
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY org_programs_insert_director ON organization_programs
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY org_programs_update_director ON organization_programs
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY org_programs_delete_director ON organization_programs
    FOR DELETE USING (is_org_director(organization_id));

-- activity_categories
CREATE POLICY activity_categories_select_member ON activity_categories
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY activity_categories_insert_director ON activity_categories
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY activity_categories_update_director ON activity_categories
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY activity_categories_delete_director ON activity_categories
    FOR DELETE USING (is_org_director(organization_id));

-- host_sites
CREATE POLICY host_sites_select_member ON host_sites
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY host_sites_insert_director ON host_sites
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY host_sites_update_director ON host_sites
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY host_sites_delete_director ON host_sites
    FOR DELETE USING (is_org_director(organization_id));

-- organization_goals
CREATE POLICY org_goals_select_member ON organization_goals
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY org_goals_insert_director ON organization_goals
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY org_goals_update_director ON organization_goals
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY org_goals_delete_director ON organization_goals
    FOR DELETE USING (is_org_director(organization_id));

-- metric_definitions
CREATE POLICY metric_definitions_select_member ON metric_definitions
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY metric_definitions_insert_director ON metric_definitions
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY metric_definitions_update_director ON metric_definitions
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY metric_definitions_delete_director ON metric_definitions
    FOR DELETE USING (is_org_director(organization_id));
