/**
 * Build the full volunteer invitation URL from an origin and token.
 */
export function buildInvitationUrl(origin: string, token: string): string {
  const normalized = origin.replace(/\/$/, "");
  return `${normalized}/reflect?token=${encodeURIComponent(token)}`;
}

/**
 * Resolve the application origin for server-side use.
 * Prefers the Vercel deployment URL (with HTTPS), then an explicit
 * application URL, and falls back to localhost only in development.
 */
export function getAppOrigin(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}
