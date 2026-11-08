-- Migration: 00004_trace_reflections.sql
-- Phase: 2B — database architecture and migration design
-- Tables: volunteer_identities, form_versions, organization_questions,
--         question_options, volunteer_reflections, reflection_answers, quote_records

-- ============================================================
-- Volunteer Identities (director-only metadata)
-- ============================================================
CREATE TABLE volunteer_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    display_name text NOT NULL,
    primary_instrument text,
    email text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_volunteer_identities_org_id ON volunteer_identities(organization_id);

-- ============================================================
-- Form Versions
-- ============================================================
CREATE TABLE form_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version_number int NOT NULL,
    published_at timestamptz,
    is_active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, version_number),
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_form_versions_org_id ON form_versions(organization_id);
CREATE UNIQUE INDEX idx_form_versions_active_unique ON form_versions(organization_id) WHERE is_active = true;

-- ============================================================
-- Pin form versions to activity sessions
-- ============================================================
ALTER TABLE activity_sessions
    ADD COLUMN form_version_id uuid,
    ADD CONSTRAINT fk_activity_sessions_form_version
    FOREIGN KEY (organization_id, form_version_id) REFERENCES form_versions(organization_id, id) ON DELETE RESTRICT;

CREATE INDEX idx_activity_sessions_form_version_id ON activity_sessions(form_version_id);

-- At session creation, automatically pin the currently active form version.
CREATE OR REPLACE FUNCTION set_session_form_version()
RETURNS trigger AS $$
BEGIN
    IF NEW.form_version_id IS NULL THEN
        SELECT id INTO NEW.form_version_id
        FROM form_versions
        WHERE organization_id = NEW.organization_id
          AND is_active = true
        LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER trg_set_session_form_version
    BEFORE INSERT ON activity_sessions
    FOR EACH ROW EXECUTE FUNCTION set_session_form_version();

-- ============================================================
-- Organization Questions (snapshot per form version)
-- ============================================================
CREATE TABLE organization_questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    form_version_id uuid NOT NULL REFERENCES form_versions(id) ON DELETE CASCADE,
    question_key text NOT NULL,
    question_text text NOT NULL,
    question_type text NOT NULL CHECK (question_type IN ('text','number','rating','boolean','single_choice','multi_choice')),
    sort_order int NOT NULL,
    is_required boolean NOT NULL DEFAULT true,
    config_json jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id),
    FOREIGN KEY (organization_id, form_version_id) REFERENCES form_versions(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_organization_questions_org_id ON organization_questions(organization_id);
CREATE INDEX idx_organization_questions_form_version_id ON organization_questions(form_version_id);
CREATE INDEX idx_organization_questions_question_key ON organization_questions(organization_id, question_key);

-- ============================================================
-- Question Options (for single_choice / multi_choice)
-- ============================================================
CREATE TABLE question_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES organization_questions(id) ON DELETE CASCADE,
    option_value text NOT NULL,
    option_label text NOT NULL,
    sort_order int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_question_options_question_id ON question_options(question_id);

-- ============================================================
-- Volunteer Reflections
-- ============================================================
CREATE TABLE volunteer_reflections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id uuid REFERENCES activity_sessions(id) ON DELETE SET NULL,
    form_version_id uuid NOT NULL REFERENCES form_versions(id) ON DELETE RESTRICT,
    volunteer_id uuid REFERENCES volunteer_identities(id) ON DELETE SET NULL,
    submitted_at timestamptz NOT NULL DEFAULT now(),
    source_type text NOT NULL CHECK (source_type IN ('synthetic_demo','historical_import','live_submission')),
    import_batch_id uuid,
    idempotency_key text NOT NULL,
    -- Structured activity metadata (not mixed into dynamic reflection_answers)
    date date,
    host_site_id uuid REFERENCES host_sites(id) ON DELETE SET NULL,
    format text CHECK (format IN ('solo','small group','sing-along','interactive')),
    participant_encounters int CHECK (participant_encounters >= 0),
    minutes_performed int CHECK (minutes_performed >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id),
    UNIQUE (organization_id, idempotency_key),
    -- Tenant-consistent composite foreign keys
    FOREIGN KEY (organization_id, session_id) REFERENCES activity_sessions(organization_id, id) ON DELETE SET NULL (session_id),
    FOREIGN KEY (organization_id, host_site_id) REFERENCES host_sites(organization_id, id) ON DELETE SET NULL (host_site_id),
    FOREIGN KEY (organization_id, form_version_id) REFERENCES form_versions(organization_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, volunteer_id) REFERENCES volunteer_identities(organization_id, id) ON DELETE SET NULL (volunteer_id),
    CONSTRAINT chk_volunteer_reflections_session_or_manual
        CHECK ((session_id IS NOT NULL) OR (date IS NOT NULL AND host_site_id IS NOT NULL))
);

CREATE INDEX idx_volunteer_reflections_org_id ON volunteer_reflections(organization_id);
CREATE INDEX idx_volunteer_reflections_session_id ON volunteer_reflections(session_id);
CREATE INDEX idx_volunteer_reflections_volunteer_id ON volunteer_reflections(volunteer_id);
CREATE INDEX idx_volunteer_reflections_source_type ON volunteer_reflections(source_type);
CREATE INDEX idx_volunteer_reflections_submitted_at ON volunteer_reflections(submitted_at);

-- ============================================================
-- Reflection Answers (typed columns, no untyped JSON blob)
-- ============================================================
CREATE TABLE reflection_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    reflection_id uuid NOT NULL REFERENCES volunteer_reflections(id) ON DELETE CASCADE,
    question_id uuid NOT NULL REFERENCES organization_questions(id) ON DELETE RESTRICT,
    question_text_snapshot text NOT NULL,
    value_text text,
    value_number numeric,
    value_boolean boolean,
    value_json jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Tenant-consistent composite foreign keys
    FOREIGN KEY (organization_id, reflection_id) REFERENCES volunteer_reflections(organization_id, id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, question_id) REFERENCES organization_questions(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_reflection_answers_reflection_id ON reflection_answers(reflection_id);
CREATE INDEX idx_reflection_answers_question_id ON reflection_answers(question_id);

-- ============================================================
-- Quote Records
-- ============================================================
CREATE TABLE quote_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    reflection_id uuid NOT NULL REFERENCES volunteer_reflections(id) ON DELETE CASCADE,
    text text NOT NULL,
    speaker text CHECK (speaker IN ('resident','family member','staff')),
    consent_status text CHECK (consent_status IN ('unknown','not_documented','confirmed_with_evidence','denied')),
    consent_evidence text,
    source_consent_label text,
    is_redacted_before_ai boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Tenant-consistent composite foreign key
    FOREIGN KEY (organization_id, reflection_id) REFERENCES volunteer_reflections(organization_id, id) ON DELETE CASCADE,
    -- confirmed_with_evidence requires real consent evidence;
    -- never auto-promote imports to confirmed consent.
    CONSTRAINT chk_quote_confirmed_requires_evidence
        CHECK (consent_status <> 'confirmed_with_evidence' OR consent_evidence IS NOT NULL)
);

CREATE INDEX idx_quote_records_reflection_id ON quote_records(reflection_id);
CREATE INDEX idx_quote_records_consent_status ON quote_records(consent_status);

-- ============================================================
-- updated_at Triggers (shared function defined in 00001)
-- ============================================================
CREATE TRIGGER set_updated_at_volunteer_identities
    BEFORE UPDATE ON volunteer_identities
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_form_versions
    BEFORE UPDATE ON form_versions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_organization_questions
    BEFORE UPDATE ON organization_questions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE volunteer_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflection_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_records ENABLE ROW LEVEL SECURITY;

-- volunteer_identities: member read only (director-only names)
CREATE POLICY volunteer_identities_select_member ON volunteer_identities
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY volunteer_identities_insert_director ON volunteer_identities
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY volunteer_identities_update_director ON volunteer_identities
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY volunteer_identities_delete_director ON volunteer_identities
    FOR DELETE USING (is_org_director(organization_id));

-- form_versions
CREATE POLICY form_versions_select_member ON form_versions
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY form_versions_insert_director ON form_versions
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY form_versions_update_director ON form_versions
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY form_versions_delete_director ON form_versions
    FOR DELETE USING (is_org_director(organization_id));

-- organization_questions
CREATE POLICY organization_questions_select_member ON organization_questions
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY organization_questions_insert_director ON organization_questions
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY organization_questions_update_director ON organization_questions
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY organization_questions_delete_director ON organization_questions
    FOR DELETE USING (is_org_director(organization_id));

-- question_options
CREATE POLICY question_options_select_member ON question_options
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM organization_questions oq
            WHERE oq.id = question_options.question_id
              AND is_org_member(oq.organization_id)
        )
    );
CREATE POLICY question_options_insert_director ON question_options
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_questions oq
            WHERE oq.id = question_options.question_id
              AND is_org_director(oq.organization_id)
        )
    );
CREATE POLICY question_options_update_director ON question_options
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM organization_questions oq
            WHERE oq.id = question_options.question_id
              AND is_org_director(oq.organization_id)
        )
    );
CREATE POLICY question_options_delete_director ON question_options
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM organization_questions oq
            WHERE oq.id = question_options.question_id
              AND is_org_director(oq.organization_id)
        )
    );

-- volunteer_reflections: member read; token-based insert via security definer function
CREATE POLICY volunteer_reflections_select_member ON volunteer_reflections
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY volunteer_reflections_insert_director ON volunteer_reflections
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY volunteer_reflections_update_director ON volunteer_reflections
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY volunteer_reflections_delete_director ON volunteer_reflections
    FOR DELETE USING (is_org_director(organization_id));

-- reflection_answers
CREATE POLICY reflection_answers_select_member ON reflection_answers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM volunteer_reflections vr
            WHERE vr.id = reflection_answers.reflection_id
              AND is_org_member(vr.organization_id)
        )
    );
CREATE POLICY reflection_answers_insert_director ON reflection_answers
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM volunteer_reflections vr
            WHERE vr.id = reflection_answers.reflection_id
              AND is_org_director(vr.organization_id)
        )
    );
CREATE POLICY reflection_answers_update_director ON reflection_answers
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM volunteer_reflections vr
            WHERE vr.id = reflection_answers.reflection_id
              AND is_org_director(vr.organization_id)
        )
    );
CREATE POLICY reflection_answers_delete_director ON reflection_answers
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM volunteer_reflections vr
            WHERE vr.id = reflection_answers.reflection_id
              AND is_org_director(vr.organization_id)
        )
    );

-- quote_records
CREATE POLICY quote_records_select_member ON quote_records
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM volunteer_reflections vr
            WHERE vr.id = quote_records.reflection_id
              AND is_org_member(vr.organization_id)
        )
    );
CREATE POLICY quote_records_insert_director ON quote_records
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM volunteer_reflections vr
            WHERE vr.id = quote_records.reflection_id
              AND is_org_director(vr.organization_id)
        )
    );
CREATE POLICY quote_records_update_director ON quote_records
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM volunteer_reflections vr
            WHERE vr.id = quote_records.reflection_id
              AND is_org_director(vr.organization_id)
        )
    );
CREATE POLICY quote_records_delete_director ON quote_records
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM volunteer_reflections vr
            WHERE vr.id = quote_records.reflection_id
              AND is_org_director(vr.organization_id)
        )
    );

-- ============================================================
-- SECURITY DEFINER: Anonymous submission
-- Defined here because it depends on tables created in this migration.
-- lookup_token_by_value() is defined in migration 00003.
-- ============================================================
CREATE OR REPLACE FUNCTION submit_reflection(
    p_token_text text,
    p_idempotency_key text,
    p_volunteer_id uuid DEFAULT NULL,
    p_format text DEFAULT NULL,
    p_participant_encounters int DEFAULT NULL,
    p_minutes_performed int DEFAULT NULL,
    p_answers jsonb DEFAULT '{}',
    p_quote jsonb DEFAULT NULL
)
RETURNS TABLE (
    reflection_id uuid,
    is_new boolean
) AS $$
DECLARE
    v_token record;
    v_session_form_version_id uuid;
    v_reflection_id uuid;
BEGIN
    -- Resolve token (SECURITY DEFINER context).
    SELECT * INTO v_token FROM lookup_token_by_value(p_token_text);
    IF v_token IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired token';
    END IF;

    -- Retrieve the form version pinned to the token's activity session.
    SELECT s.form_version_id INTO v_session_form_version_id
    FROM activity_sessions s
    WHERE s.id = v_token.session_id;

    IF v_session_form_version_id IS NULL THEN
        RAISE EXCEPTION 'Session has no valid pinned form version';
    END IF;

    -- Validate answers before any side effects so failures do not consume the token.
    IF EXISTS (
        SELECT 1 FROM organization_questions oq
        WHERE oq.form_version_id = v_session_form_version_id
          AND oq.is_required = true
          AND NOT p_answers ? oq.question_key
    ) THEN
        RAISE EXCEPTION 'Missing required question answers';
    END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(p_answers) AS k
        WHERE NOT EXISTS (
            SELECT 1 FROM organization_questions oq
            WHERE oq.form_version_id = v_session_form_version_id
              AND oq.question_key = k
        )
    ) THEN
        RAISE EXCEPTION 'Unknown question key in submission';
    END IF;

    -- Attempt insert with idempotency guarantee (unique constraint on org + key).
    INSERT INTO volunteer_reflections (
        organization_id,
        session_id,
        form_version_id,
        volunteer_id,
        source_type,
        idempotency_key,
        date,
        host_site_id,
        format,
        participant_encounters,
        minutes_performed
    )
    SELECT
        v_token.organization_id,
        v_token.session_id,
        v_session_form_version_id,
        p_volunteer_id,
        'live_submission',
        p_idempotency_key,
        s.date,
        s.host_site_id,
        p_format,
        p_participant_encounters,
        p_minutes_performed
    FROM activity_sessions s
    WHERE s.id = v_token.session_id
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING
    RETURNING volunteer_reflections.id INTO v_reflection_id;

    -- If conflict occurred, return the existing submission (legitimate retry).
    -- Token use is not consumed for duplicates.
    IF v_reflection_id IS NULL THEN
        SELECT vr.id INTO v_reflection_id
        FROM volunteer_reflections vr
        WHERE vr.organization_id = v_token.organization_id
          AND vr.idempotency_key = p_idempotency_key;

        RETURN QUERY SELECT v_reflection_id, false;
        RETURN;
    END IF;

    -- Insert dynamic reflection answers against the pinned form version.
    -- Value typed according to question_type.
    INSERT INTO reflection_answers (
        reflection_id, question_id, question_text_snapshot,
        value_text, value_number, value_boolean, value_json,
        organization_id
    )
    SELECT
        v_reflection_id,
        oq.id,
        oq.question_text,
        CASE WHEN oq.question_type IN ('text','single_choice') THEN p_answers->>oq.question_key END,
        CASE WHEN oq.question_type IN ('number','rating') THEN (p_answers->>oq.question_key)::numeric END,
        CASE WHEN oq.question_type = 'boolean' THEN (p_answers->>oq.question_key)::boolean END,
        CASE WHEN oq.question_type = 'multi_choice' THEN p_answers->oq.question_key END,
        v_token.organization_id
    FROM organization_questions oq
    WHERE oq.form_version_id = v_session_form_version_id
      AND p_answers ? oq.question_key;

    -- Insert quote if provided.
    -- Live submissions default consent to unknown; never auto-promote to confirmed.
    IF p_quote IS NOT NULL THEN
        INSERT INTO quote_records (
            reflection_id, text, speaker, consent_status,
            source_consent_label, organization_id
        )
        VALUES (
            v_reflection_id,
            p_quote->>'text',
            p_quote->>'speaker',
            COALESCE(p_quote->>'consent_status', 'unknown'),
            p_quote->>'source_consent_label',
            v_token.organization_id
        );
    END IF;

    -- Consume token use only after successful validation and persistence.
    -- A duplicate retry exits above without ever reaching here.
    UPDATE session_invitation_tokens
    SET used_count = used_count + 1
    WHERE id = v_token.token_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND (max_uses IS NULL OR used_count < max_uses);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token exhausted or expired';
    END IF;

    RETURN QUERY SELECT v_reflection_id, true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Restrict submission function to service role only.
-- Public volunteers submit through the Next.js server endpoint, not directly.
REVOKE EXECUTE ON FUNCTION submit_reflection(text, text, uuid, text, int, int, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_reflection(text, text, uuid, text, int, int, jsonb, jsonb) TO service_role;

-- ============================================================
-- Deterministic concert aggregation: median of participant_encounters
-- per session, rounding .5 upward, then summed across sessions.
-- ============================================================
CREATE OR REPLACE FUNCTION aggregate_concert_encounters(p_organization_id uuid)
RETURNS int AS $$
DECLARE
    v_total int := 0;
BEGIN
    -- Per-session median, rounded .5 upward, then summed.
    -- Never sum unrounded medians and round the grand total.
    SELECT COALESCE(SUM(FLOOR(session_median + 0.5)::int), 0) INTO v_total
    FROM (
        SELECT
            session_id,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY participant_encounters) AS session_median
        FROM volunteer_reflections
        WHERE organization_id = p_organization_id
          AND session_id IS NOT NULL
          AND participant_encounters IS NOT NULL
        GROUP BY session_id
    ) medians;

    RETURN v_total;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION aggregate_concert_encounters(uuid) TO service_role;
