import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const publicPaths = ["/reflect", "/director/login", "/director/signup"];
const protectedPaths = ["/", "/evidence", "/grants", "/optimizer", "/onboarding", "/sessions"];

function isPublicPath(pathname: string) {
  if (publicPaths.includes(pathname)) return true;
  if (pathname.startsWith("/api/reflect")) return true;
  return false;
}

function isProtectedPath(pathname: string) {
  return protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    if (user && (pathname === "/director/login" || pathname === "/director/signup")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return supabaseResponse;
  }

  if (isProtectedPath(pathname) && !user) {
    return NextResponse.redirect(new URL("/director/login", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
