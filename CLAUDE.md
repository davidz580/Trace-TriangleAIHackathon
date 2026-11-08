# Trace — Development Instructions

## Working Rules
- Work only on `trace-development`. Never modify `main`.
- Do not commit, push, merge, or deploy without explicit instruction.
- Never expose, print, or commit API keys or secret environment-variable values.
- Never modify `.env.local` other than when explicitly authorized.
- Never run Supabase reset, destructive SQL, or remote migrations without explicit approval.
- Never read `node_modules`, `.git`, `package-lock.json`, or entire large configuration files unnecessarily.
- Inspect only files relevant to the current task.
- Do not dump entire source files or enormous command outputs into the conversation.
- Keep responses and progress reports concise.
- Use the actual Tinker runtime for production AI. Do not pretend mocked AI is real AI.
- Do not silently substitute static answers when an AI request fails.
- Preserve all project requirements in repository documentation.

## Architecture Snapshots
- Stack: Next.js (App Router), TypeScript, Tailwind CSS, Supabase (Postgres + Edge Functions), Tinker OpenAI-compatible API.
- Director access uses a server-side passcode with a signed expiring session cookie (server-only secret). Volunteers submit without authentication.
- All AI calls are server-side.
- Structured outputs use Zod. Retry invalid responses where reasonable.
- Deterministic TypeScript/SQL handles all arithmetic, counts, averages, word counts, question usage, skip rates, and evidence totals.

## Privacy Guardrails
- Volunteer names are director-only metadata; they are never sent to the AI model or included in funder-facing outputs.
- Redact PII server-side before sending text to the model.
- Count participant encounters, not unique participants. Never claim attendance counts represent unique individuals.
- Avoid collecting health information and room numbers.
- Only include quotes in funder-facing outputs when documented consent exists. A volunteer’s consent alone does not authorize quoting a resident.
- Every evidence claim must be traceable to its actual source.

## Key Files
- `docs/PROJECT_SPEC.md` — full product requirements
- `docs/IMPLEMENTATION_STATUS.md` — current build status and next step
- `docs/ARCHITECTURE.md` — system design
- `docs/DEPLOYMENT.md` — deployment checklist
