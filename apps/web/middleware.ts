import { auth } from "./lib/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");

  if (isAuthPage && isLoggedIn) {
    return Response.redirect(new URL("/", req.url));
  }

  if (!isAuthPage && !isLoggedIn) {
    return Response.redirect(new URL("/login", req.url));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
