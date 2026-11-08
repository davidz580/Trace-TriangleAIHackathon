-- Migration: 00008_trace_import.sql
-- Phase: 2B — database architecture and migration design
-- Tables: import_batches

-- ============================================================
-- Import Batches
-- ============================================================
CREATE TABLE import_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_classification text NOT NULL CHECK (source_classification IN ('synthetic_demo','historical_import','live_submission')),
    confirmed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    file_name text,
    record_count int,
    metadata_json jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_import_batches_org_id ON import_batches(organization_id);
CREATE INDEX idx_import_batches_source_classification ON import_batches(source_classification);
CREATE INDEX idx_import_batches_confirmed_by ON import_batches(confirmed_by);

-- ============================================================
-- Add import_batch_id foreign key to volunteer_reflections
-- (table created in 00004; adds FK constraint now that import_batches exists)
-- Tenant-consistent composite foreign key.
-- ============================================================
ALTER TABLE volunteer_reflections
    ADD CONSTRAINT fk_volunteer_reflections_import_batch
    FOREIGN KEY (organization_id, import_batch_id) REFERENCES import_batches(organization_id, id) ON DELETE SET NULL (import_batch_id);

CREATE INDEX idx_volunteer_reflections_import_batch_id ON volunteer_reflections(import_batch_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

-- import_batches
CREATE POLICY import_batches_select_member ON import_batches
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY import_batches_insert_director ON import_batches
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY import_batches_update_director ON import_batches
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY import_batches_delete_director ON import_batches
    FOR DELETE USING (is_org_director(organization_id));
