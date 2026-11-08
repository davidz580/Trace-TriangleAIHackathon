import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  // Validate redirect target to prevent open redirects
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth/callback] exchangeCodeForSession error:", error.message);
      return NextResponse.redirect(
        new URL(
          `/director/login?error=${encodeURIComponent("Verification link expired or invalid. Please sign in.")}`,
          request.url
        )
      );
    }

    // Successful exchange — check if user has an organization
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: memberships } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1);

      if (!memberships || memberships.length === 0) {
        return NextResponse.redirect(new URL("/onboarding", request.url));
      }

      const returnTo = safeNext || "/";
      return NextResponse.redirect(new URL(returnTo, request.url));
    }
  }

  // No code present — redirect to login
  return NextResponse.redirect(new URL("/director/login", request.url));
}
