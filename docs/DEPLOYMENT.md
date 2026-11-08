# Trace — Deployment Checklist

## Pre-Deployment
- [ ] `.env.local` values are mirrored in Vercel environment variables (do not commit secrets).
- [ ] Supabase project is linked and migrations are up to date on the remote instance.
- [ ] RLS policies are tested on a fresh Supabase connection (verify members see only their org, directors can write, anonymous volunteers can submit via token lookup only).
- [ ] **No public SELECT policy** exists on `session_invitation_tokens` for `anon` or `authenticated`.
- [ ] **No unintended EXECUTE grants** on `lookup_token_by_value`, `submit_reflection`, or `create_organization` for `PUBLIC`, `anon`, or `authenticated`.
- [ ] **Composite foreign keys** are enforced: no child record can reference a parent in a different organization.
- [ ] Import idempotency is verified (re-importing the same batch with stable IDs produces no duplicates).
- [ ] All AI calls succeed against Tinker from a deployed endpoint (no client-side key leakage).
- [ ] Structured Tinker responses pass Zod validation in staging.
- [ ] PII redaction is verified end-to-end (names omitted from AI prompts and exports).
- [ ] Volunteer form displays the required privacy note.
- [ ] Demo disclaimer is visible: *"Real RFP, drafted with simulated data."* and NOTEWORTHE non-applicant statement.

## Build & Deploy
- [ ] `npm run build` passes with zero TypeScript errors.
- [ ] Linting passes (`npm run lint`).
- [ ] Production bundle size is reasonable (no accidental large dependencies).
- [ ] Vercel deploy succeeds with environment variables configured.
- [ ] Custom domain or Vercel subdomain is accessible.

## Post-Deploy Verification
- [ ] Volunteer form submits and stores data on Supabase.
- [ ] Historical import accepts text/txt and rejects unsupported formats.
- [ ] Evidence library loads and filters correctly.
- [ ] Dashboard metrics and chart render real data (no fabricated numbers).
- [ ] Grant builder generates answers with citations.
- [ ] Tracer links open precise sources.
- [ ] Director inputs save and appear as reusable evidence.
- [ ] Form optimizer presents suggestions and does not auto-apply changes.

## Maintenance & Operations
- [ ] Database backups are enabled on Supabase.
- [ ] Rate limiting / abuse prevention is configured on public form endpoints.
- [ ] Error monitoring (e.g. Sentry or Vercel Analytics) is optionally configured.
