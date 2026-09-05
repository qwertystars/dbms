"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverApi } from "~/lib/server-api";

export async function createFamily(formData: FormData) {
  const name = formData.get("name") as string;
  if (!name) return { error: "Family name is required" };
  const { status, body } = await serverApi("POST", "/api/v1/families", { name });
  if (status !== 201) return { error: body.error?.message || "Could not create family" };
  revalidatePath("/app");
  redirect(`/app/families/${body.family.id}`);
}
