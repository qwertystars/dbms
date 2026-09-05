import { NextResponse } from "next/server";
import { signDevToken } from "~/lib/dev-auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const subject = form.get("subject") as string;
  const displayName = (form.get("displayName") as string) || subject;
  if (!subject) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }
  const token = await signDevToken(subject, displayName);
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const response = NextResponse.redirect(new URL("/app", baseUrl));
  response.cookies.set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7200,
    path: "/",
  });
  return response;
}
