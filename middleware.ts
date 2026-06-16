import { NextRequest, NextResponse } from "next/server";

const PUBLIC_API_PREFIXES = [
  "/api/slack/interactions",
  "/api/health"
];

function isPublicPath(pathname: string) {
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return pathname.startsWith("/api/");
}

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Agent World"'
    }
  });
}

export function middleware(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password || isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return unauthorized();

  const decoded = Buffer.from(authHeader.slice("Basic ".length), "base64").toString("utf8");
  const [, suppliedPassword] = decoded.split(":");

  if (suppliedPassword !== password) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"]
};
