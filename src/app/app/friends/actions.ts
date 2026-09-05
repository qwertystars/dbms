"use server";

import { revalidatePath } from "next/cache";
import { serverApi } from "~/lib/server-api";

export async function requestFriend(formData: FormData) {
  const accountId = formData.get("accountId") as string;
  if (!accountId) return { error: "Account ID is required" };
  const { status } = await serverApi("POST", "/api/v1/friends/requests", { accountId });
  if (status !== 201) return { error: "Could not send friend request" };
  revalidatePath("/app/friends");
  return { ok: true };
}

export async function respondToRequest(formData: FormData) {
  const requestId = formData.get("requestId") as string;
  const action = formData.get("action") as string;
  if (!requestId || !action) return { error: "Missing fields" };
  const endpoint = action === "accept" ? "accept" : "reject";
  const { status } = await serverApi("POST", `/api/v1/friends/requests/${requestId}/${endpoint}`);
  if (status !== 200) return { error: `Could not ${action} request` };
  revalidatePath("/app/friends");
  return { ok: true };
}
