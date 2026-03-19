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
  // AUTH BYPASSED: Login disabled for testing. Re-enable auth checks when ready.
  return NextResponse.next();

  // --- Original auth logic (preserved for re-enabling later) ---
  // const { pathname } = request.nextUrl;
  //
  // if (isPublicPath(pathname) || pathname.startsWith("/_next") || pathname.startsWith("/api/upload")) {
  //   return NextResponse.next();
  // }
  //
  // const sessionToken = request.cookies.get("bdt_session")?.value;
  // if (!sessionToken) {
  //   return NextResponse.redirect(new URL("/login", request.url));
  // }
  //
  // const response = NextResponse.next();
  // response.headers.set("x-session-token", sessionToken);
  // return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|clips).*)",
  ],
};
