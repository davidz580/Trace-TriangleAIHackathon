# Trace — Architecture Plan

## Stack
| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + custom design system |
| Icons | Lucide React |
| Database | Supabase Postgres |
| Auth | Supabase Auth with role-based organization memberships (`owner`, `director`, `viewer`). Volunteers submit without authentication via opaque session tokens. |
| AI Runtime | Tinker OpenAI-compatible API (`TINKER_API_KEY`, `TINKER_BASE_URL`, `TINKER_MODEL`) |
| Structured Output | Zod (server-side validation + retry logic) |
| Hosting | Vercel (target) |

## Directory Conventions (implemented)
```
app/                        # Next.js App Router
  layout.tsx                # Root layout (Inter font, metadata, CSS tokens)
  globals.css               # Design system tokens (Tailwind v4 @theme inline)
  (director)/
    layout.tsx              # Director shell with responsive sidebar
    page.tsx                # Dashboard (at /)
    evidence/page.tsx       # Evidence library (at /evidence)
    grants/page.tsx         # Grant builder (at /grants)
    optimizer/page.tsx      # Form optimizer (at /optimizer)
  (public)/
    layout.tsx              # Public shell with header/footer
    reflect/page.tsx        # Volunteer reflection form (at /reflect)
  director/
    login/page.tsx          # Director login via Supabase Auth (at /director/login)
components/
  ui/                       # Reusable UI primitives (Button, Card, Badge, Input, Textarea, Dialog, Spinner, Skeleton, EmptyState)
  layout/                   # Layout components (AppShell, PublicShell, Sidebar, TopBar)
lib/
  utils.ts                  # cn() helper (clsx + tailwind-merge)
types/
  index.ts                  # Shared TypeScript interfaces
supabase/
  migrations/               # SQL migrations (tracked in Git)
  functions/                # Supabase Edge Functions (when needed)
```

## Design System
- Warm, understated backgrounds (`#faf9f7` / `#0c0a09` dark)
- Deep, readable typography (Inter)
- Restrained accent palette: muted sage green (`#4a7c6f`)
- Clean cards with clear hierarchy
- Accessible contrast and keyboard navigation throughout
- Responsive sidebar navigation with mobile overlay
- Thoughtful empty states and loading states

## Multi-Tenant Security Model

Every table holding organization-private data has `organization_id uuid NOT NULL` with a foreign key to `organizations(id)`. Row Level Security (RLS) policies enforce that rows are only visible to members of the owning organization. In addition, composite foreign keys (`FOREIGN KEY (organization_id, parent_id) REFERENCES parent(organization_id, id)`) enforce cross-table tenant consistency at the database level, preventing a child record from linking to a parent in a different organization even if RLS were bypassed.

- `is_org_member(org_id)` — true if the current Supabase Auth user belongs to the organization (any role).
- `is_org_director(org_id)` — true if the user is an `owner` or `director`.
- `is_org_owner(org_id)` — true only for the `owner`.

### Auth and Membership Flow
1. **Supabase Auth** handles authentication (`auth.users`).
2. **`user_profiles`** extends `auth.users` with display name.
3. **`organization_memberships`** links users to organizations with roles: `owner`, `director`, `viewer`.
4. The user who creates an organization becomes its `owner` via the `create_organization()` database function, which wraps org creation and owner membership in a single atomic transaction.
5. Users can belong to multiple organizations.
6. **Volunteers do not need accounts.** They submit anonymously via opaque session invitation tokens.

## Data Model (high-level)

### Core Multi-Tenant Tables
- **organizations** — the tenant root.
- **user_profiles** — extends Supabase Auth users.
- **organization_memberships** — role-based membership linking users to organizations.

### Organization Configuration
- **organization_programs** — named programs (e.g., "Intergenerational Music").
- **activity_categories** — event types (e.g., "Concert", "Workshop").
- **host_sites** — locations where activities occur.
- **organization_goals** — measurable goals, optionally linked to programs.
- **metric_definitions** — how each metric is measured and aggregated.

### Activity Sessions
- **activity_sessions** — a scheduled event (date, category, host site).
- **session_invitation_tokens** — opaque tokens allowing anonymous volunteers to submit reflections for a specific session. Tokens may have expiration, usage limits, and active/inactive states.

### Reflections
- **volunteer_identities** — director-only roster (name, instrument, email). Never sent to AI.
- **form_versions** — snapshots of an organization's questionnaire. Only one version may be active at a time.
- **organization_questions** — individual questions within a form version, preserving exact wording at publish time.
- **question_options** — choices for single/multi-select questions.
- **volunteer_reflections** — a submitted form instance. Stores structured activity metadata (date, host_site_id, format, participant_encounters, minutes_performed, session_id) as typed columns. Supports `source_type` for provenance (`live_submission`, `historical_import`, `synthetic_demo`).
- **reflection_answers** — typed answers for organization-specific reflection questions (text, number, boolean, JSON) linked to a question snapshot.
- **quote_records** — structured quotes with speaker and consent metadata, stored separately from answers and outside the question limit.

### Evidence
- **historical_sources** — uploaded documents or text with redacted excerpts.
- **director_inputs** — reusable narrative answers to organization-history prompts.
- **evidence_items** — extracts linked to exactly one typed source (`source_volunteer_reflection_id`, `source_historical_source_id`, or `source_director_input_id`) with a `CHECK` constraint enforcing exactly one non-null source. A database trigger verifies the source record exists and belongs to the same organization.

### Grants
- **grants** — funding opportunities with status tracking.
- **grant_requirements** — individual RFP questions/criteria.
- **grant_responses** — draft and final answers, linked to requirements.
- **grant_claims** — individual factual claims within a response.
- **evidence_citations** — links between claims and supporting evidence items.

### Form Optimizer
- **question_presentation_events** — analytics events (presented, answered, skipped) per question per form version.
- **form_optimizer_recommendations** — AI-generated suggestions with rationale and evidence gap.
- **form_optimizer_approval_history** — every director approval/rejection/modification action.

### Import
- **import_batches** — provenance metadata for bulk imports, requiring explicit classification confirmation before processing.

## Session and Submission Architecture

```
Director creates org → configures programs, categories, host sites, goals, metrics
Director creates activity session → generates invitation token
Volunteer visits /reflect?token=<opaque> → server resolves session + org
Volunteer submits → idempotency-checked, server-validated, PII-redacted, persisted
AI extracts evidence from redacted text → evidence_items linked to source
Director reviews optimizer suggestions → approves changes → new form version published
Director builds grant → claims linked to evidence_citations
```

### Anonymous Submission Architecture

Volunteers submit **through a Next.js server endpoint**, not directly to the database.

```
Volunteer POST /api/reflect
  → Server validates opaque token via lookup_token_by_value()
  → Server redacts PII before persistence
  → Server calls submit_reflection() with service-role credentials
```

The `submit_reflection` SECURITY DEFINER function accepts a dynamic `jsonb` answers payload keyed to the active form version, supporting any organization's questionnaire:

```
select * from submit_reflection(
  p_token_text => '<opaque token>',
  p_idempotency_key => '<client-generated-key>',
  p_volunteer_id => '<optional rostered volunteer uuid>',
  p_format => 'small group',
  p_participant_encounters => 25,
  p_minutes_performed => 45,
  p_answers => '{"family_or_caregivers":"a few","audience_engagement":4,...}',
  p_quote => '{"text":"...","speaker":"resident","consent_status":"unknown"}'
);
```

Server-side behavior (enforced by `submit_reflection()`):
1. Resolve `token` via `lookup_token_by_value()` (SECURITY DEFINER, exact match only).
2. Derive `organization_id` and `session_id` from the token (never trusts client-supplied identifiers).
3. Validate required questions are present in `p_answers` and reject unknown keys.
4. Insert `volunteer_reflections` with `ON CONFLICT (organization_id, idempotency_key) DO NOTHING`; return the existing row on legitimate retries without consuming a token use.
5. Insert `reflection_answers` mapped to the published form version (dynamic, no hardcoded keys).
6. Insert `quote_records` when a quote is provided, defaulting consent to `unknown`.
7. Atomically consume token usage (`UPDATE ... WHERE used_count < max_uses`) only after successful validation and persistence; concurrent requests cannot exceed the limit. Any failure before this step rolls back the transaction and leaves the token untouched.

Public volunteers have **no direct table access** and **no EXECUTE privilege** on `submit_reflection` or `lookup_token_by_value`. These are restricted to the service role.


## Consent and Provenance Rules
- Only include quotes in funder-facing outputs when `quote_records.consent_status` is `confirmed_with_evidence`.
- `unknown`, `not_documented`, and `denied` quotes are evidence for internal use only.
- Host-site documentation alone does not automatically prove participant consent; the schema enforces `confirmed_with_evidence` only when `consent_evidence` is non-null (`chk_quote_confirmed_requires_evidence`).
- `source_consent_label` preserves the original host-site or import label separately from the verified `consent_status`.
- Never automatically promote imported quotes to `confirmed_with_evidence`.
- Every imported record gets a `source_type` and `import_batch_id`.
- Bulk import requires **explicit director confirmation** of classification (`synthetic_demo`, `historical_import`, `live_submission`).
- Reimport with the same stable IDs is idempotent (`ON CONFLICT DO NOTHING`).

## Concert Aggregation Logic (Deterministic)
- **Report count:** `COUNT(*)` on `volunteer_reflections`.
- **Concert count:** `COUNT(DISTINCT session_id)` on `volunteer_reflections`.
- **Audience encounters:** Per-concert, median of `volunteer_reflections.participant_encounters` across reports for that `session_id`. Round `.5` upward. Sum the concert-level values. Never sum all musician estimates directly.
- **Engagement:** Per-concert median of `audience_engagement` values from `reflection_answers` linked to reports for that `session_id`.
- **Performance duration:** Sum `volunteer_reflections.minutes_performed` by report, but do **not** treat as unique service hours or concert duration.

The SQL function `aggregate_concert_encounters(p_organization_id uuid)` implements the audience-encounter calculation server-side, rounding each session's median `.5` upward individually before summing. It never sums unrounded medians and rounds the grand total.

## Deterministic vs. AI Boundaries
| Deterministic (TS/SQL) | AI (Tinker) |
|------------------------|-------------|
| Counts, averages, totals | Evidence extraction |
| Word counts | Gap analysis |
| Question usage/skip rates | Question generation |
| Evidence totals | Grant response drafting |
| Retirement eligibility scoring | Claim-support verification |
| Concert medians and aggregation | Redaction pattern suggestions |

All AI calls happen in Next.js Route Handlers or Supabase Edge Functions (server-side only). PII redaction runs server-side before any text reaches Tinker.

## Demo Constraints
- No CRM, scheduled reports, vector DB, embeddings, OCR, spreadsheets, or question rotation.
- Optional donor-update feature only after all mandatory features work.
- Never auto-send anything.
