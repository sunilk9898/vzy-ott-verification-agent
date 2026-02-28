// ============================================================================
// Next.js Middleware - JWT Auth Guard
// ============================================================================

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/_next", "/favicon.ico"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for JWT token in cookie or Authorization header
  const token =
    request.cookies.get("vzy_token")?.value ||
    request.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) {
    // Redirect to login for browser requests
    if (request.headers.get("accept")?.includes("text/html")) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    // Return 401 for API-like requests
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Token validation would happen here in production (verify JWT signature)
  // For now, presence of token is sufficient
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
