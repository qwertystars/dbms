"use server";

import { revalidatePath } from "next/cache";
import { serverApi } from "~/lib/server-api";

export async function createPost(familyId: string, formData: FormData) {
  const body = formData.get("body") as string;
  if (!body) return { error: "Body is required" };
  const { status } = await serverApi("POST", `/api/v1/families/${familyId}/posts`, { body });
  if (status !== 201) return { error: "Could not create post" };
  revalidatePath(`/app/families/${familyId}/feed`);
  return { ok: true };
}
