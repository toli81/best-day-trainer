import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/verify", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const TRAINER_ONLY_PATHS = ["/trainer", "/record", "/upload"];
const TRAINER_ONLY_API = ["/api/clients"];

function isTrainerOnlyPath(pathname: string): boolean {
  return (
    TRAINER_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    TRAINER_ONLY_API.some((p) => pathname === p || pathname.startsWith(p + "/"))
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths, static assets, and API routes that don't need auth
  if (isPublicPath(pathname) || pathname.startsWith("/_next") || pathname.startsWith("/api/upload")) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionToken = request.cookies.get("bdt_session")?.value;
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // We can't query the DB directly in edge middleware with better-sqlite3.
  // Instead, we set a header and validate in the API routes / server components.
  // The cookie presence check here is a first gate; full validation happens server-side.
  const response = NextResponse.next();
  response.headers.set("x-session-token", sessionToken);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|clips).*)",
  ],
};
