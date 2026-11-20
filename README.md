# Trace

> We handle the proof; you handle the impact.

Trace is a grant-evidence platform for nonprofits. It turns volunteer reflections and historical program records into traceable evidence that can support grant applications—without asking AI to invent metrics or hide weak support.

Built for the Triangle AI Hackathon and demonstrated with [NOTEWORTHE Music](https://noteworthythe.com/) data.

> **Demo note:** Trace may use simulated data. Any AI-generated grant response must be reviewed by the organization. NOTEWORTHE Music is not presented as an applicant or as eligible for the demo RFP.

## What Trace does

- **Collects volunteer reflections** through a mobile-friendly, unauthenticated form
- **Imports historical evidence** from pasted text, text files, and text-based PDFs
- **Organizes evidence** by source, date, site, category, tags, and consent status
- **Calculates metrics deterministically** in TypeScript or Postgres
- **Drafts grant responses** from actual evidence and saved director inputs using the Tinker API
- **Highlights unsupported claims** and missing information
- **Traces claims to source records** so directors can verify every number and quote
- **Optimizes the reflection form** with measured question usage and AI-discovered evidence gaps

## Product principles

- **Evidence before prose.** Grant language is grounded in recorded sources, not fabricated outcomes.
- **AI is server-side.** PII is redacted before text reaches Tinker, and model responses are validated with Zod.
- **Arithmetic is deterministic.** Counts, averages, word counts, skip rates, evidence totals, and aggregate metrics are never calculated by the model.
- **Consent is explicit.** Quotes are restricted from funder-facing outputs unless consent has documented evidence.
- **Provenance is preserved.** Each evidence item links to a specific source record and import or submission context.
- **Encounters, not people.** Dashboards count participant encounters and never imply unique attendance unless verified.

## Tech stack

- [Next.js 16](https://nextjs.org/) App Router
- [React 19](https://react.dev/) and TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/) with a custom accessible design system
- [Supabase](https://supabase.com/) Postgres and Auth
- [Tinker](https://tinker-docs.thinkingmachines.ai/) OpenAI-compatible API for server-side AI
- Zod for structured AI outputs
- Vercel as the target deployment platform

## Repository layout

```text
app/                  Next.js routes and layouts
components/           Shared UI and application components
lib/                  Utilities and deterministic business logic
types/                Shared TypeScript contracts
supabase/migrations/  Multi-tenant schema and RLS migrations
data/                Demo and reconciliation assets
docs/                 Product, architecture, and deployment documentation
```

## Getting started

### Prerequisites

- Node.js 20 or later
- npm
- Docker Desktop for a local Supabase stack
- Access to the required Supabase and Tinker environment variables

### Install and run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

> `.env.local` is local-only and must not be committed. Never print or share API keys or secret values.

### Supabase

Start the local Supabase stack:

```bash
npx supabase start
```

Migration application and resets require review and approval. Remote migrations must not be run without explicit authorization.

## Development commands

```bash
npm run dev        # Start Next.js locally
npm run build      # Create a production build
npm run lint       # Run ESLint
npm run typecheck  # Run strict TypeScript checks
npm test           # Run Vitest tests
```

## Privacy and security

Trace separates public volunteer submissions from director-only information:

- Volunteers submit without Supabase authentication
- Volunteer names remain director-only metadata
- PII is redacted before AI processing
- Director data is protected by organization membership and row-level security
- Public submissions use opaque, expiring session tokens
- Health information and room numbers should not be collected
- Resident quotes require the documented consent status `confirmed_with_evidence` before funder-facing use
- Every funder-facing evidence claim must remain traceable to its source

The volunteer form includes this privacy reminder:

> Please don't include names, room numbers, or anything about someone's health.

## Demo RFP

The demonstration is based on the public Community Care Corps Cohort 7 RFP:

- [RFP website](https://www.communitycarecorps.org/rfp-cohort7)
- [RFP PDF](https://www.communitycarecorps.org/wp-content/uploads/2026/10/2027-2028-Community-Care-Corps-RFP-FINAL.pdf)

The demo label is:

> Real RFP, drafted with simulated data.

## Documentation

- [Project specification](docs/PROJECT_SPEC.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment checklist](docs/DEPLOYMENT.md)
- [Data contract mapping](docs/DATA_CONTRACT_MAPPING.md)

## Scope

Trace intentionally does not include CRM, scheduled reports, a vector database or embeddings, OCR, spreadsheet support, or automatic question rotation.

The optional donor-update feature will not send content automatically and will only be considered after the mandatory product features are complete.
