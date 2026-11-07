# Trace — Project Specification

> Tagline: *"We handle the proof; you handle the impact."*

## Purpose
Trace helps nonprofits turn volunteer experiences and historical program records into organized evidence that can support grant applications.

The primary organization for the demonstration is **NOTEWORTHE Music**. Its founder has authorized use of approved organizational information. This does not mean every participant has consented to having their words quoted.

## Authentication and Access
- Director access is protected by a single, simple passcode.
- Passcode verification happens server-side only against a server-only secret.
- A successful verification sets a signed, expiring session cookie.
- Volunteers submit reflection forms without any authentication.
- No Supabase Auth email/password system is used.

## Data and Privacy Requirements
- Count participant encounters, not unique participants.
- Never claim that attendance counts represent unique individuals.
- Volunteer names may be visible to the director but must never be sent to the AI model or included in funder-facing outputs.
- Redact personally identifiable information server-side before sending text to the model.
- Avoid collecting health information and room numbers.
- Show this exact privacy note on the volunteer form:

  > "Please don't include names, room numbers, or anything about someone's health."

- Quotes may appear in funder-facing outputs only when appropriate consent from the quoted person or their legal representative is documented.
- A volunteer's consent alone does not authorize quoting a resident.
- Every evidence claim must be traceable to its actual source.

## AI Requirements
- Use Tinker's OpenAI-compatible API for application inference.
- Environment variables (already set in `.env.local`):
  - `TINKER_API_KEY`
  - `TINKER_BASE_URL`
  - `TINKER_MODEL`
- All model calls must be server-side.
- Use structured JSON responses validated with Zod. Retry invalid structured responses where reasonable.
- AI must actually perform:
  - Reflection evidence extraction.
  - Historical document evidence extraction.
  - Grant evidence-gap analysis.
  - Grant response generation.
  - Volunteer question generation.
  - Claim-support verification.
- Use deterministic TypeScript or SQL for all arithmetic, counts, averages, word counts, question usage, skip rates, and evidence totals. Never ask the model to calculate these.

## Product Features

### A. Volunteer Form
A beautiful, mobile-friendly public volunteer reflection form.

**Nine standard questions:**
1. Performance date (defaults to today).
2. Host site.
3. Performance format: solo, small group, sing-along, or interactive.
4. Approximate number of attendees.
5. Minutes performed.
6. Audience engagement, rated 1–5, with clear endpoints ranging from mostly listening quietly to singing, clapping, or requesting songs.
7. How the performance went for the volunteer, rated 1–5.
8. One standout moment.
9. What would make the next visit better?

There is one active optional custom question. Its initial legacy wording is:
> "Which songs did you play?"

Volunteer name is director-only metadata and does not count toward the ten-question maximum.

### B. Historical Import
Accept:
- Pasted text.
- `.txt` files.
- Text-based PDFs.

Reject:
- Scanned PDFs requiring OCR.
- Word documents.
- Spreadsheets.
- Other unsupported file formats.

Imported material must use `sourceType` `"historical_upload"`. Preserve the document name and exact source excerpts. Mark it as director-provided and not independently verified.

### C. Evidence Library
Organize extracted evidence by source, date, site, category, tags, and verification/consent status.

### D. Dashboard
Include metric cards, one useful chart, and recent evidence. Never fabricate production metrics.

### E. Grant Builder
Generate grant answers from actual evidence, saved director inputs, and documented citations. Highlight unsupported claims and missing information.

### F. Tracer
Clicking a claim, number, fact, or quote opens its precise supporting source. Aggregate numbers must show the contributing records and values.

### G. Director Follow-Ups
Organization history, local statistics, partnerships, staffing, and future plans are director-only questions. Ask once and save the answers as reusable `director_input` evidence. Never send these questions to volunteers.

### H. Form Optimizer
Use AI to discover volunteer-collectable evidence gaps and generate question suggestions. Use deterministic code to calculate usage and retirement eligibility.

- Maximum: ten active questions (nine standard plus one custom).
- Never automatically add or retire a question. Each change requires separate explicit director approval.

## Demo RFP
- Use the official Community Care Corps Cohort 7 RFP:
  - Web: https://www.communitycarecorps.org/rfp-cohort7
  - PDF: https://www.communitycarecorps.org/wp-content/uploads/2026/10/2027-2028-Community-Care-Corps-RFP-FINAL.pdf
- Demo label:
  > "Real RFP, drafted with simulated data."
- Clearly state that NOTEWORTHE is not an applicant and do not imply it is eligible.

## Scope Limits
Do not build:
- CRM
- Scheduled reports
- Vector database / embeddings
- OCR
- Spreadsheets
- Question rotation / sampling

A donor-update drafting feature is optional and may only be added after all mandatory features work. It must never send anything automatically.
