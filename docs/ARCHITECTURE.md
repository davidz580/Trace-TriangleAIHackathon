# Trace — Architecture Plan

## Stack
| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + custom design system |
| Icons | Lucide React |
| Database | Supabase Postgres |
| Auth | Director-only passcode (server-side verification, signed expiring session cookie, server-only secret). Volunteers submit without authentication. |
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
    login/page.tsx          # Director passcode login (at /director/login)
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

## Data Model (high-level)
- **Volunteer Reflections** — raw form submissions (director-only name metadata).
- **Historical Sources** — imported files/text with `sourceType = "historical_upload"`.
- **Evidence Items** — extracted claims, quotes, metrics linked to a source.
- **Director Inputs** — reusable organization-specific answers.
- **Custom Questions** — active optional question(s); history of changes.
- **Question Suggestions** — optimizer proposals awaiting approval.
- **Grants / Grant Responses** — RFP criteria and generated answers with citations.

## Security & Privacy
- All AI calls happen in Next.js Route Handlers or Supabase Edge Functions (server-side only).
- PII redaction runs server-side before any text reaches Tinker.
- Volunteer names are stored but excluded from AI prompts and funder-facing exports.
- Director-only pages are protected by server-side passcode verification and a signed session cookie.
- RLS policies guard sensitive tables and aggregate views; volunteer submissions require no auth.

## Deterministic vs. AI Boundaries
| Deterministic (TS/SQL) | AI (Tinker) |
|------------------------|-------------|
| Counts, averages, totals | Evidence extraction |
| Word counts | Gap analysis |
| Question usage/skip rates | Question generation |
| Evidence totals | Grant response drafting |
| Retirement eligibility scoring | Claim-support verification |

## Demo Constraints
- No CRM, scheduled reports, vector DB, embeddings, OCR, spreadsheets, or question rotation.
- Optional donor-update feature only after all mandatory features work.
- Never auto-send anything.
