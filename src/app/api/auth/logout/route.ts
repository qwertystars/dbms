import { NextResponse } from "next/server";

export async function POST() {
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const response = NextResponse.redirect(new URL("/sign-in", baseUrl));
  response.cookies.set("auth_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
