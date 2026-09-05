"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverApi } from "~/lib/server-api";

export async function createPerson(familyId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const gender = formData.get("gender") as string;
  if (!name || !gender) return { error: "Name and gender are required" };

  const payload: Record<string, any> = { name, gender };
  const fields = [
    "dateOfBirth",
    "dateOfDeath",
    "address",
    "email",
    "phone",
    "occupation",
    "biography",
  ];
  for (const key of fields) {
    const value = formData.get(key);
    if (value) payload[key] = value as string;
  }
  const height = formData.get("heightCm");
  if (height) payload.heightCm = Number(height);
  const weight = formData.get("weightKg");
  if (weight) payload.weightKg = Number(weight);

  const { status, body } = await serverApi("POST", `/api/v1/families/${familyId}/people`, payload);
  if (status !== 201) return { error: body.error?.message || "Could not create person" };
  revalidatePath(`/app/families/${familyId}`);
  return { person: body.person };
}

export async function createInvitation(familyId: string, formData: FormData) {
  const role = formData.get("role") as string;
  if (!role) return { error: "Role is required" };
  const { body } = await serverApi("POST", `/api/v1/families/${familyId}/invitations`, { role });
  return { token: body.token };
}

export async function createTreeEdge(familyId: string, formData: FormData) {
  const parentPersonId = formData.get("parentPersonId") as string;
  const childPersonId = formData.get("childPersonId") as string;
  if (!parentPersonId || !childPersonId) return { error: "Both people are required" };
  const { status, body } = await serverApi(
    "POST",
    `/api/v1/families/${familyId}/relationships/parent-child`,
    {
      parentPersonId,
      childPersonId,
    },
  );
  if (status !== 201) return { error: body.error?.message || "Could not add relationship" };
  revalidatePath(`/app/families/${familyId}/tree`);
  return { edge: body.edge };
}
