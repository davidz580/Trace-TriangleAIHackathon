# Trace — Implementation Status

## Phase 0: Project Documentation
**Status:** Completed
**Completed Work:**
- Created `trace-development` branch.
- Initialized Supabase local dev configuration.
- Created `.env.local` with Supabase and Tinker credentials.
- Added `.gitignore`.
- Created `CLAUDE.md`, `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, and this file.

**Outstanding Work:** (none)

---

## Phase 1: Next.js Website Foundation and Visual Design
**Status:** Completed
**Completed Work:**
- Initialized Next.js 16 (App Router), TypeScript, Tailwind CSS v4.
- Preserved existing `supabase` devDependency in `package.json`.
- Added scripts: `dev`, `build`, `start`, `lint`, `typecheck`.
- Installed `lucide-react`, `clsx`, `tailwind-merge`.
- Set up absolute imports via `@/*` path alias.
- Created custom design system in `globals.css` using Tailwind v4 `@theme inline`:
  - Warm background (`#faf9f7`), deep charcoal foreground, muted sage accent (`#4a7c6f`)
  - Dark mode support via `prefers-color-scheme`
- Built reusable, accessible UI primitives in `components/ui/`:
  - Button (primary/secondary/ghost/danger variants)
  - Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
  - Badge (default/secondary/outline/accent/danger variants)
  - Input, Textarea
  - Dialog (modal primitive)
  - Spinner, Skeleton, EmptyState
- Built layout components in `components/layout/`:
  - `AppShell` with responsive `Sidebar` (collapse on mobile, overlay on small screens)
  - `PublicShell` with header/footer for volunteer-facing pages
  - `TopBar` for page titles and actions
- Implemented route structure:
  - `/` — Director dashboard (metric placeholder cards, recent evidence placeholder, chart placeholder)
  - `/reflect` — Public volunteer reflection form (9 standard + 1 custom question, privacy note, mobile-friendly)
  - `/evidence` — Evidence library (filter badges, empty state)
  - `/grants` — Grant builder (demo disclaimer badge, empty state)
  - `/optimizer` — Form optimizer (active question counts, empty state)
  - `/director/login` — Director login via Supabase Auth placeholder
- Created distinct layouts:
  - `(director)/layout.tsx` with sidebar navigation for director-only pages
  - `(public)/layout.tsx` with clean header/footer for volunteer pages
- Ensured no fake production metrics are displayed; all metric areas show "Pending data" badges.
- Verified local build, lint (ESLint 9), and typecheck (TypeScript strict) all pass.

**Outstanding Work:**
- Hook actual database queries into placeholder UI areas.
- Add real authentication logic to `/director/login`.

**Next Step:** Move to Phase 2.

---

## Phase 2A: Frontend, Shared Contract, and Dataset Reconciliation
**Status:** Completed
**Completed Work:**
- Inspected existing frontend form (`app/(public)/reflect/reflect-form.tsx`) and found no shared data contract in `types/index.ts`.
- Located and verified `data/private-input/noteworthe-sample.json`:
  - 200 submissions, 60 concerts, 18 volunteers, 4 host sites.
  - No duplicates, no missing required fields, all FKs valid.
  - 103 submissions include structured quotes; 97 do not.
  - Concert-to-report cardinality: 2–5 musicians per concert (median 3).
- Created safe local inspection script: `data/inspect-dataset.js` (does not expose raw text).
- Reconciled frontend field names with dataset contract and documented all mismatches.
- Produced dataset envelope mapping (host sites, volunteers, concerts, metadata) separated from individual submission mapping.
- Documented enum normalization rules, concert relationships, and deterministic aggregation rules.
- Identified 6 decisions requiring team agreement before finalizing schema.
- Created `docs/DATA_CONTRACT_MAPPING.md` as the authoritative mapping document.

**Outstanding Work:**
- Resolve 6 decisions documented in §10 of `docs/DATA_CONTRACT_MAPPING.md`.
- Apply approved changes to `types/index.ts` and `reflect-form.tsx`.
- Design `concert_id` context mechanism for the volunteer form.

**Next Step:** Review `docs/DATA_CONTRACT_MAPPING.md`, resolve open decisions, then proceed to Phase 2 database schema design.

---

## Phase 2B: Database Architecture Design and Migration Review
**Status:** Drafted and audited (Phase 2C corrections applied; awaiting explicit approval before remote migration)
**Completed Work:**
- Designed complete multi-tenant database schema with 29+ tables across 8 migration files.
- Defined helper functions: `is_org_member`, `is_org_director`, `is_org_owner`, `trigger_set_updated_at`.
- Wrote restrictive RLS policies for every table; no permissive `FOR ALL` policies.
- Created `supabase/migrations/00001_trace_multitenant_core.sql` (organizations, user_profiles, memberships).
- Created `supabase/migrations/00002_trace_org_config.sql` (programs, categories, host_sites, goals, metrics).
- Created `supabase/migrations/00003_trace_sessions.sql` (activity_sessions, session_invitation_tokens).
- Created `supabase/migrations/00004_trace_reflections.sql` (volunteer_identities, form_versions, organization_questions, question_options, volunteer_reflections, reflection_answers, quote_records).
- Created `supabase/migrations/00005_trace_evidence.sql` (historical_sources, director_inputs, evidence_items).
- Created `supabase/migrations/00006_trace_grants.sql` (grants, grant_requirements, grant_responses, grant_claims, evidence_citations).
- Created `supabase/migrations/00007_trace_optimizer.sql` (question_presentation_events, form_optimizer_recommendations, form_optimizer_approval_history).
- Created `supabase/migrations/00008_trace_import.sql` (import_batches, FK to volunteer_reflections).
- Created `types/database.ts` with TypeScript interfaces matching the schema.
- Updated `docs/ARCHITECTURE.md` with multi-tenant model, auth flow, question versioning, submission API, AI boundaries, concert aggregation, consent/provenance rules.
- Updated `docs/DATA_CONTRACT_MAPPING.md`: resolved all 6 open decisions, added import batch provenance mapping, added form version snapshot mapping.
- Updated `docs/DEPLOYMENT.md` with RLS testing and import idempotency verification steps.

**Phase 2C Corrections Applied:**
1. **Tenant-consistent composite foreign keys** — Added `UNIQUE (organization_id, id)` to every organization-scoped parent table and composite `FOREIGN KEY (organization_id, ...)` on all child tables that reference them (sessions, reflections, answers, quotes, evidence, grants, optimizer events, imports).
2. **Removed public token-table access** — No SELECT policy allows `anon` or `authenticated` to read `session_invitation_tokens`. `lookup_token_by_value` and `submit_reflection` `EXECUTE` privileges revoked from `PUBLIC`, `anon`, and `authenticated`.
3. **Dynamic questionnaire submission** — `submit_reflection` rewritten to accept a `jsonb` answers payload keyed to the active `form_version` instead of hardcoded NOTEWORTHE question parameters. Supports any organization's questionnaire up to the ten-question limit.
4. **Volunteer identity and PII handling** — Removed `volunteer_name_redacted` from `volunteer_reflections`. Names live only in the director-restricted `volunteer_identities` table. `submit_reflection` no longer accepts names; the Next.js server endpoint will handle redaction before persisting.
5. **Idempotency and concurrent token safety** — Uses `ON CONFLICT (organization_id, idempotency_key) DO NOTHING` to eliminate the SELECT-then-INSERT race. Validation happens before any side effects. Token consumption (`UPDATE ... WHERE used_count < max_uses`) occurs only after successful persistence, so failed submissions never consume a use. Duplicate retries return the existing row early without ever touching the token counter.
6. **Concert aggregation rounding** — SQL `aggregate_concert_encounters` now uses `FLOOR(session_median + 0.5)::int` per session before summing. TypeScript test added proving per-concert rounding differs from rounding the grand total.
7. **Atomic organization creation** — Added `create_organization(name, slug)` SECURITY DEFINER function that derives the owner from `auth.uid()`, creates the org, and creates the owner membership in the same transaction. Direct table insert policies locked down.
8. **Evidence referential integrity** — Replaced polymorphic `source_id`/`source_table` with typed nullable FK columns (`source_volunteer_reflection_id`, `source_historical_source_id`, `source_director_input_id`) and a `CHECK` requiring exactly one source. Validation trigger verifies both source existence and matching `organization_id`.
9. **Quote consent** — Added `source_consent_label` to preserve original labels separately from the verified `consent_status`. Added `chk_quote_confirmed_requires_evidence` constraint so `confirmed_with_evidence` requires a non-null `consent_evidence` value. Live submissions default to `unknown`; imports are never auto-promoted.
10. **Validation** — TypeScript typecheck passes, lint passes, aggregation tests pass, static SQL checks confirm no forbidden public policies or unintended grants.
11. **Form version pinned to activity sessions** — Added `form_version_id` to `activity_sessions` with composite FK to `form_versions`. Added partial unique index ensuring at most one active version per organization. Session-creation trigger auto-pins the currently active version. `submit_reflection` now retrieves the form version from the session, rejects submissions without a valid pinned version, and never returns a null reflection ID as though submission succeeded.
12. **Missing tenant-consistent foreign keys** — Added `FOREIGN KEY (organization_id, form_version_id)` on `organization_questions` and `FOREIGN KEY (organization_id, question_id)` on `reflection_answers`, referencing their composite unique parents.
13. **Organization creation permissions** — `create_organization()` explicitly granted to `authenticated` (revoked from `PUBLIC` and `anon`), continuing to derive the owner from `auth.uid()` and reject unauthenticated calls.
14. **Composite foreign-key deletion safety** — Inspected every composite FK containing `organization_id`; no `ON DELETE SET NULL` action targets the required `organization_id` column itself. All server-side functions have explicit `GRANT EXECUTE TO service_role`.

**Outstanding Work:**
- None (awaiting review before Phase 3).

**Next Step:** Review all migration SQL files, then apply locally (requires Docker/Postgres) and push to remote.

---

## Phase 3: Approved Supabase Migration Application
**Status:** Not Started
**Completed Work:** (none)

**Outstanding Work:**
- Apply reviewed migration to the local Supabase instance.
- Verify tables, constraints, and RLS policies.
- Generate TypeScript database types.

**Next Step:** Run `supabase db reset` locally and confirm schema integrity.

---

## Phase 4: Supabase Integration and Director Access
**Status:** Not Started
**Completed Work:** (none)

**Outstanding Work:**
- Configure server and client Supabase clients.
- Implement Supabase Auth sign-in/sign-up for directors.
- Map authenticated users to organization memberships with role checks (`owner`, `director`, `viewer`).
- Protect director routes with Supabase session validation middleware.

**Next Step:** Build the login page and route guards.

---

## Phase 5: Real Tinker AI Infrastructure
**Status:** Not Started
**Completed Work:** (none)

**Outstanding Work:**
- Create server-side Tinker client wrapper (`TINKER_API_KEY`, `TINKER_BASE_URL`, `TINKER_MODEL`).
- Implement structured-output helper with Zod validation and retry logic.
- Build deterministic utility layer (counts, averages, word counts, skip rates, etc.).
- Verify PII redaction helper runs before AI calls.

**Next Step:** Write a smoke-test route handler that calls Tinker and validates a Zod schema.

---

## Phase 6: Public Volunteer Reflection Form
**Status:** UI Completed (Backend Not Started)
**Completed Work:**
- Built mobile-friendly form UI with all 10 questions.
- Default performance date defaults to today (computed server-side, passed to client).
- Privacy note visible on form.
- Volunteer name field collected as director-only metadata.

**Outstanding Work:**
- Implement server-side insertion with PII handling.
- Wire form submission to `volunteer_reflections` table.

**Next Step:** Create API route and hook form to database.

---

## Phase 7: Historical Imports and Evidence Library
**Status:** Not Started
**Completed Work:** (none)

**Outstanding Work:**
- Build upload UI for pasted text, `.txt`, and text-based PDF.
- Server-side rejection for scanned PDFs, Word docs, spreadsheets, and unsupported formats.
- Parse and store with `sourceType` `"historical_upload"`; preserve document name and exact excerpts.
- Evidence library: list and filter by source, date, site, category, tags, and verification/consent status.
- Link every evidence item back to its original source.

**Next Step:** Build the import page and evidence library UI.

---

## Phase 8: Director Dashboard
**Status:** UI Completed (Backend Not Started)
**Completed Work:**
- Dashboard layout with metric card grid, recent evidence section, and chart placeholder.
- All placeholders clearly marked with "Pending data" badges.

**Outstanding Work:**
- Metric cards: encounter counts, performances, average engagement, etc. (deterministic SQL/TS).
- One useful chart (e.g., performances over time or engagement distribution).
- Recent evidence feed from actual data.

**Next Step:** Build dashboard route with aggregate queries and chart component.

---

## Phase 9: Grant Builder
**Status:** UI Completed (Backend Not Started)
**Completed Work:**
- Grant builder page layout with demo disclaimer card.
- Empty state for pre-data condition.

**Outstanding Work:**
- Load the Community Care Corps Cohort 7 RFP criteria.
- Generate grant answers from actual evidence, saved director inputs, and documented citations.
- Highlight unsupported claims and missing information.
- Provide Tracer links from every claim to its source evidence.
- Display demo label: *"Real RFP, drafted with simulated data."* and NOTEWORTHE non-applicant statement.

**Next Step:** Build the grant builder page with RFP parsing and AI-powered drafting.

---

## Phase 10: Tracer and Director Follow-Ups
**Status:** Not Started
**Completed Work:** (none)

**Outstanding Work:**
- Tracer: clicking a claim, number, fact, or quote opens its precise supporting source. Aggregate numbers show contributing records and values.
- Director follow-ups: ask once about organization history, local statistics, partnerships, staffing, and future plans. Save answers as reusable `director_input` evidence. Never send these questions to volunteers.

**Next Step:** Build Tracer drill-down components and director input UI.

---

## Phase 11: Form Optimizer
**Status:** UI Completed (Backend Not Started)
**Completed Work:**
- Optimizer page layout with question count cards and empty state.

**Outstanding Work:**
- Deterministic code calculates usage/skip rates and retirement eligibility.
- AI discovers volunteer-collectable evidence gaps and suggests new questions.
- Maximum ten active questions (nine standard + one custom).
- Never automatically add or retire a question. Each change requires separate explicit director approval.

**Next Step:** Build the optimizer UI and suggestion pipeline.

---

## Phase 12: Isolated Demonstration Data
**Status:** Not Started
**Completed Work:** (none)

**Outstanding Work:**
- Seed simulated volunteer reflections, historical sources, and evidence for NOTEWORTHE.
- Ensure simulated data is clearly marked and isolated from any real production data.
- Verify metrics and grant builder outputs render correctly with simulated data.

**Next Step:** Create seed scripts or manual demo data entries.

---

## Phase 13: Integration Testing and Polish
**Status:** Not Started
**Completed Work:** (none)

**Outstanding Work:**
- Responsive design pass.
- Accessibility audit.
- End-to-end QA on all mandated features.
- Verify no fabricated metrics appear in the UI.
- Confirm demo disclaimers are visible.

**Next Step:** Run QA smoke tests and fix issues.

---

## Phase 14: Deployment Preparation
**Status:** Not Started
**Completed Work:** (none)

**Outstanding Work:**
- Complete the `DEPLOYMENT.md` checklist.
- Verify environment variables on target host.
- Run production build and final verification.

**Next Step:** Follow `DEPLOYMENT.md` pre-deployment and build steps.

---

### Current Phase
**Phase 2B is drafted and audited (Phase 2C complete). Next: Explicit review and approval before applying migrations remotely (Phase 3).**
