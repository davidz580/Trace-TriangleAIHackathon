# Trace — Data Contract Mapping (Phase 2A)

> Prepared by reconciling the existing frontend, the NOTEWORTHE dataset (`data/private-input/noteworthe-sample.json`), and the approved project architecture.
> **Status:** Review requested. No schema changes applied yet.

---

## 1. Executive Summary

| Item | Finding |
|------|---------|
| Dataset present? | Yes — `data/private-input/noteworthe-sample.json` |
| Existing shared contract? | **No.** `types/index.ts` contains only UI types. No Zod schemas, no API routes, no migrations, no `lib/ai/` functions. |
| Frontend form contract? | Present in `app/(public)/reflect/reflect-form.tsx`, but field names and types diverge from the dataset. |
| Concert context mechanism? | **None.** The form asks for date + free-text host site with no explicit `concert_id`. |
| Data quality | Excellent. 200 submissions, 60 concerts, 18 volunteers, 4 host sites. No duplicates, no missing required fields, all FKs valid. |

---

## 2. Form Question → Backend Mapping

### 2A. Current Frontend (`reflect-form.tsx`)

| # | Form label | Frontend `name` | Type | Notes |
|---|------------|-----------------|------|-------|
| — | Your name | `volunteerName` | Text | Director-only metadata (not counted in 10-question limit) |
| 1 | Performance date | `performanceDate` | Date (`YYYY-MM-DD`) | Defaults to today (computed server-side in `page.tsx`) |
| 2 | Host site | `hostSite` | Free text | No dropdown; no `host_site_id` |
| 3 | Performance format | `format` | Select | `solo`, `small-group`, `sing-along`, `interactive` |
| 4 | Approximate number of attendees | `attendees` | Integer ≥ 0 | Label says "encounters, not unique individuals" |
| 5 | Minutes performed | `minutes` | Integer ≥ 1 | — |
| 6 | Audience engagement | `engagement` | Integer 1–5 (radio) | Scale label in UI helper |
| 7 | How did the performance go for you? | `volunteerExperience` | Integer 1–5 (radio) | Label says "1 = very difficult, 5 = very rewarding" |
| 8 | One standout moment | `standoutMoment` | Text (textarea) | Required |
| 9 | What would make the next visit better? | `improvement` | Text (textarea) | Required |
| 10 | Custom question (songs) | `customAnswer` | Text (textarea) | Optional; legacy wording: "Which songs did you play?" |

### 2B. Dataset Contract (`form_fields` in `noteworthe-sample.json`)

| # | Question | Dataset key | Type | Options / Constraints |
|---|----------|-------------|------|----------------------|
| 1 | Date | `date` | Date (`YYYY-MM-DD`) | Required |
| 2 | Host site | `host_site_id` | String FK | Required; sourced from `host_sites` table |
| 3 | Format | `format` | String | `solo`, `small group`, `sing-along`, `interactive` |
| 4 | About how many people attended? | `participant_encounters` | Integer ≥ 0 | Required |
| 5 | Were family members or caregivers in the audience? | `family_or_caregivers` | String | `none`, `a few`, `many` |
| 6 | Minutes performed | `minutes_performed` | Integer ≥ 1 | Required; **individual active time**, not total concert duration |
| 7 | Audience engagement | `audience_engagement` | Integer 1–5 | Required |
| 8 | How confident did you feel leading this visit? | `volunteer_confidence` | Integer 1–5 | Required |
| 9 | One moment that stood out | `standout_moment` | String | Required |
| 10 | What would make the next visit better? | `next_visit_improvement` | String | Required |
| 11 | A quote, plus who said it and consent | `quote` | Object or `null` | `{ text, speaker, consent }` — **optional but structured** |

### 2C. Seed field → Database field mapping (for imports)

| Seed source field | Target DB field | Type | Notes |
|-------------------|-----------------|------|-------|
| `submissions.id` | `id` (PK) | UUID / string | Preserve stable IDs for idempotent upserts |
| `submissions.concert_id` | `concert_id` | FK → `concerts` | Required; links multiple musician reports to one concert |
| `submissions.volunteer_id` | `volunteer_id` | FK → `volunteers` | Required; links to rostered volunteer |
| `submissions.submitted_at` | `submitted_at` | TimestampTZ | When the form was submitted |
| `submissions.is_mock` | `is_mock` | Boolean | Must be `true` for all seed records |
| `submissions.date` | `date` | Date | Concert date (may differ from `submitted_at`) |
| `submissions.host_site_id` | `host_site_id` | FK → `host_sites` | Required |
| `submissions.format` | `format` | String (enum) | Normalize values (see §5) |
| `submissions.participant_encounters` | `participant_encounters` | Integer | Required |
| `submissions.family_or_caregivers` | `family_or_caregivers` | String (enum) | Required |
| `submissions.minutes_performed` | `minutes_performed` | Integer | Required; individual musician time |
| `submissions.audience_engagement` | `audience_engagement` | Integer (1–5) | Required |
| `submissions.volunteer_confidence` | `volunteer_confidence` | Integer (1–5) | Required |
| `submissions.standout_moment` | `standout_moment` | Text | Required |
| `submissions.next_visit_improvement` | `next_visit_improvement` | Text | Required |
| `submissions.quote.text` | `quote_text` | Text | Nullable |
| `submissions.quote.speaker` | `quote_speaker` | String (enum) | Nullable |
| `submissions.quote.consent` | `quote_consent` | String (enum) | Nullable |

> **Rule:** a `quote` row is only valid when `quote_text`, `quote_speaker`, and `quote_consent` are all non-null.

---

## 3. Dataset Envelope vs. Individual Submission

### 3A. Import Envelope (NOT volunteer questions)

These are metadata tables that must exist **before** submissions are imported. They are organizational context, not form fields.

| Envelope entity | Source key | Purpose |
|-----------------|------------|---------|
| **Organization** | Implicit (`NOTEWORTHE Music`) | Multi-organization architecture; this is one org-specific questionnaire |
| **Host sites** | `host_sites[]` | `id`, `name`, `is_mock`. Four sites: `site-cedar`, `site-willow`, `site-maple`, `site-oak`. |
| **Volunteers** | `volunteers[]` | `id`, `display_name`, `primary_instrument`, `is_mock`. 18 rostered musicians. |
| **Concerts** | `concerts[]` | `id`, `date`, `host_site_id`, `starts_at`, `ends_at`, `program_minutes`, `volunteer_ids[]`, `is_mock`. 60 concerts. |
| **System metadata** | `metadata` | `dataset_name`, `schema_version`, `is_mock`, date ranges, aggregation rules, usage notes. |

### 3B. Individual Submission (volunteer reflection)

Each submission is one musician's report about **one concert**. The same concert can have 2–5 submissions (different musicians describing the same audience).

| Submission field | Meaning |
|------------------|---------|
| `id` | Stable submission identifier |
| `concert_id` | Which concert this report belongs to |
| `volunteer_id` | Which musician filed this report |
| `submitted_at` | When this musician submitted the form |
| All `form_fields` keys | The actual answers to the 10(+1) questions |

---

## 4. Mismatches Between Frontend and Dataset

| # | Area | Frontend current | Dataset expectation | Severity | Proposed resolution |
|---|------|------------------|----------------------|----------|----------------------|
| 1 | **Date field name** | `performanceDate` | `date` | Medium | Rename to `date` in request payload; keep label "Performance date". |
| 2 | **Host site** | Free text `hostSite` | `host_site_id` FK with dropdown | **High** | Add `host_sites` table and `host_site_id` select populated from org settings. Free text should not be stored. |
| 3 | **Format enum** | `small-group` (kebab-case) | `small group` (space) | Medium | Normalize on save: accept either, store `small group`. Frontend options should match the canonical values. |
| 4 | **Attendees field name** | `attendees` | `participant_encounters` | Medium | Rename payload key to `participant_encounters`. Keep UI label. |
| 5 | **Missing field** | No `family_or_caregivers` question | Required enum `none` / `a few` / `many` | **High** | Add question 4.5 (or renumber) to the form. |
| 6 | **Minutes field name** | `minutes` | `minutes_performed` | Low | Rename payload key. Keep UI label. |
| 7 | **Engagement field name** | `engagement` | `audience_engagement` | Low | Rename payload key. |
| 8 | **Confidence field name** | `volunteerExperience` | `volunteer_confidence` | Medium | Rename payload key. UI label should also change from "How did the performance go for you?" to "How confident did you feel leading this visit?" — **this is a semantic change**, not just a rename. |
| 9 | **Standout moment name** | `standoutMoment` | `standout_moment` | Low | Rename payload key. |
| 10 | **Improvement name** | `improvement` | `next_visit_improvement` | Low | Rename payload key. |
| 11 | **Missing structured quote** | No quote UI at all | Optional structured `{text, speaker, consent}` | **High** | Add optional quote section with three sub-fields: text, speaker (`resident` / `family member` / `staff`), consent (`Documented by host site` / `Not documented`). |
| 12 | **Missing concert context** | Form derives context only from date + host site | Explicit `concert_id` required | **High** | The frontend needs a mechanism to know which concert the volunteer is reporting on. See §6. |
| 13 | **Custom question handling** | `customAnswer` free text | Not defined in dataset envelope | Low | The dataset represents the NOTEWORTHE v2.0.1 questionnaire. The custom question "Which songs did you play?" is org-specific and should be stored in a `custom_answers` JSONB or `custom_question_responses` pattern that does not collide with the standard contract. |

### 4A. Semantic divergence warning: `volunteerExperience` vs `volunteer_confidence`

The existing frontend asks:
> "How did the performance go for you? (1 = very difficult, 5 = very rewarding)"

The dataset asks:
> "How confident did you feel leading this visit? (1–5)"

These are **different constructs**. The dataset’s wording (`volunteer_confidence`) is the approved contract. The frontend label and helper text must change to match, not just the field name.

---

## 5. Enum Normalization Rules

### 5A. `format`

| Canonical value | Acceptable input variants | Storage |
|-----------------|---------------------------|---------|
| `solo` | `solo` | `solo` |
| `small group` | `small group`, `small-group` | `small group` |
| `sing-along` | `sing-along` | `sing-along` |
| `interactive` | `interactive` | `interactive` |

> Note: The dataset does **not** contain any `solo` submissions, but the spec requires it as an option.

### 5B. `family_or_caregivers`

| Canonical value | Acceptable input |
|-----------------|------------------|
| `none` | `none` |
| `a few` | `a few`, `few` |
| `many` | `many` |

### 5C. `quote.speaker`

| Canonical value | Dataset presence |
|-----------------|------------------|
| `resident` | Yes |
| `family member` | Yes |
| `staff` | No occurrences in seed, but spec allows it |

### 5D. `quote.consent`

| Canonical value | Meaning |
|-----------------|---------|
| `Documented by host site` | Host site has documented consent; quote may be used in funder-facing outputs. |
| `Not documented` | No documented consent; quote must be redacted from funder-facing outputs. |

---

## 6. Concert Relationships and Context

### 6A. Dataset structure

- 60 concerts.
- Each concert has `date`, `host_site_id`, `program_minutes`, and a roster of `volunteer_ids`.
- 200 submissions — every concert has 2–5 musician reports (median = 3).
- All submissions match their concert’s `date` and `host_site_id` (zero inconsistencies).

### 6B. Aggregation rules (deterministic)

| Metric | Rule | Implementation |
|--------|------|----------------|
| **Report count** | Count submissions. | `COUNT(*)` on `volunteer_reflections`. |
| **Concert count** | Count distinct `concert_id`. | `COUNT(DISTINCT concert_id)`. |
| **Audience encounters** | Per concert, take the **median** of `participant_encounters` across its reports. Round `.5` upward. Sum the concert-level values. Never sum all musician estimates. | SQL/TS median function per concert group. |
| **Engagement** | Per-concert median `audience_engagement`. Preserve 1–5 ordinal scale. | Same pattern as above. |
| **Confidence** | Per-submission value; descriptive over time only. | Individual `volunteer_confidence` values. |
| **Program duration** | Use `concerts.program_minutes` once per concert. | From `concerts` table. |
| **Performance duration** | Sum `minutes_performed` by report, but do not treat as service hours. | Individual musician active time; overlap is expected. |

### 6C. Frontend concert context — gap and proposal

**Current state:** The volunteer form has no concept of a `concert_id`. It asks for `performanceDate` and free-text `hostSite`. This is unreliable for linking multiple musician reports to the same event.

**Smallest compatible fix (recommended for review):**

A. **For new submissions:** The director pre-creates upcoming concerts in the system. Each concert gets a short token or direct URL (`/reflect?concert=mock-concert-2025-001`). The form:
1. Reads the `concert_id` from the query param (validated server-side).
2. Displays the date and host site as **read-only context** (not editable by the volunteer).
3. Hides or disables the date/host site fields so the volunteer only answers the 10 questions.
4. Submits `concert_id` explicitly along with answers.

B. **Fallback (if no concert pre-created):** Allow manual entry of date + host site, but the backend must **not** auto-group into concerts. The submission remains unlinked (`concert_id = NULL`) until a director manually associates it. This preserves data integrity without guessing.

> **Decision required:** Should the app require pre-created concerts, or support unlinked manual submissions with director reconciliation?

---

## 7. Privacy and Consent Rules

| Rule | Source | Enforcement |
|------|--------|-------------|
| Volunteer names are director-only metadata. | `PROJECT_SPEC.md` | Store `volunteer_name` in a column that is excluded from AI prompts and funder-facing exports. |
| Redact PII before AI calls. | `PROJECT_SPEC.md`, `CLAUDE.md` | Build server-side redaction helper (`lib/ai/redaction.ts`); run on `standout_moment`, `next_visit_improvement`, and `quote.text`. |
| Count encounters, not unique individuals. | `PROJECT_SPEC.md` | UI label already says this. Aggregation rules use medians, not deduplication. |
| Quotes only with documented consent. | `PROJECT_SPEC.md` | Filter `quote.consent = 'Documented by host site'` before including in grant outputs. `Not documented` quotes are evidence for internal use only. |
| No health info or room numbers. | `PROJECT_SPEC.md` | Privacy note displayed on form. Redaction should catch known health terms and room-number patterns. |
| Every claim traceable to source. | `PROJECT_SPEC.md` | Store `submission_id` and `concert_id` on every extracted evidence item. |

---

## 8. Proposed Shared TypeScript Contract

> This is a **proposal** for `types/index.ts` (or a new `types/data.ts`). Do not apply until reviewed.

```typescript
// Envelope types
export interface HostSite {
  id: string;
  name: string;
  organization_id?: string;
}

export interface Volunteer {
  id: string;
  display_name: string;
  primary_instrument?: string;
}

export interface Concert {
  id: string;
  date: string; // YYYY-MM-DD
  host_site_id: string;
  program_minutes: number;
  volunteer_ids: string[];
}

// Quote sub-object
export interface SubmissionQuote {
  text: string;
  speaker: "resident" | "family member" | "staff";
  consent: "Documented by host site" | "Not documented";
}

// Core submission (shared contract)
export interface VolunteerReflection {
  id: string;
  concert_id: string;
  volunteer_id: string;
  submitted_at: string; // ISO 8601
  date: string; // YYYY-MM-DD
  host_site_id: string;
  format: "solo" | "small group" | "sing-along" | "interactive";
  participant_encounters: number;
  family_or_caregivers: "none" | "a few" | "many";
  minutes_performed: number;
  audience_engagement: number; // 1–5
  volunteer_confidence: number; // 1–5
  standout_moment: string;
  next_visit_improvement: string;
  quote: SubmissionQuote | null;
  // Org-specific extension point (does not count toward 10-question limit)
  custom_answer?: string;
  is_mock?: boolean;
}
```

---

## 9. Proposed Zod API Contract

> For the `/api/reflect` route handler.

```typescript
import { z } from "zod";

const QuoteSchema = z.object({
  text: z.string().min(1).max(2000),
  speaker: z.enum(["resident", "family member", "staff"]),
  consent: z.enum(["Documented by host site", "Not documented"]),
});

export const ReflectionSubmissionSchema = z.object({
  concert_id: z.string().uuid(), // or string for mock IDs
  volunteer_name: z.string().min(1).max(100), // director-only metadata
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  host_site_id: z.string(),
  format: z.enum(["solo", "small group", "sing-along", "interactive"]),
  participant_encounters: z.number().int().min(0),
  family_or_caregivers: z.enum(["none", "a few", "many"]),
  minutes_performed: z.number().int().min(1),
  audience_engagement: z.number().int().min(1).max(5),
  volunteer_confidence: z.number().int().min(1).max(5),
  standout_moment: z.string().min(1).max(4000),
  next_visit_improvement: z.string().min(1).max(4000),
  quote: QuoteSchema.nullable(),
  custom_answer: z.string().max(2000).optional(),
});
```

---

## 10. Decisions Requiring Team Agreement

1. **Concert context mechanism:** Pre-created concerts with tokens/URLs (recommended) vs. manual date+site entry with director reconciliation?
2. **`volunteerExperience` → `volunteer_confidence` semantic change:** Does the product team approve changing the question from "How did the performance go for you?" to "How confident did you feel leading this visit?"
3. **Adding `family_or_caregivers`:** This is a new required question that was not in the original frontend. Does it replace one of the existing slots, or is the total now 10 standard + this = 11? (The spec says max 10 active questions: 9 standard + 1 custom.)
   - *Note:* The dataset has 11 form fields (10 questions + quote). If we must keep to 10, one standard question needs to be absorbed or the quote treated as a special optional component outside the count.
4. **Quote question count:** Does the structured quote count as one of the 10 active questions, or is it an always-optional special component alongside them?
5. **Solo format:** The dataset has zero `solo` submissions, but the spec requires it as an option. Should it remain in the enum for future use?
6. **Custom question versioning:** The current custom question is "Which songs did you play?" Should this be stored as a flexible `custom_questions` response, or hardcoded for the NOTEWORTHE demo?

---

## 11. Files Touched / Created in Phase 2A

| File | Action |
|------|--------|
| `data/private-input/noteworthe-sample.json` | Inspected (read-only) |
| `data/inspect-dataset.js` | Created — safe local inspection script (ESM) |
| `docs/DATA_CONTRACT_MAPPING.md` | Created (this file) |
| `docs/IMPLEMENTATION_STATUS.md` | Updated to reflect Phase 2A completion |

---

## 12. Next Steps (pending review)

1. Resolve the 6 decisions in §10.
2. Update `types/index.ts` with the approved shared contract.
3. Update `reflect-form.tsx` to match the approved field names, labels, and add missing fields (quote, family_or_caregivers).
4. Design the `concert_id` context mechanism.
5. Draft the Zod API schema and `/api/reflect` route handler.
6. Proceed to Phase 2 (database schema design) with this mapping as the source of truth.
