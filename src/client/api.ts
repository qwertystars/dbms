export interface ApiResult {
  status: number;
  body: any;
}

export async function api(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      redirect: "manual",
    });
  } catch {
    // Network failure: report it like an API error so pages show a message
    // instead of hanging on their loading state.
    return {
      status: 0,
      body: { error: { message: "Could not reach the server. Check your connection." } },
    };
  }
  if (response.type === "opaqueredirect") return sessionEnded();
  const json = await response.json().catch(() => ({}));
  return { status: response.status, body: json };
}

// Unexpected redirects are treated as an ended session.
function sessionEnded(): ApiResult {
  window.location.assign("/sign-in");
  return { status: 401, body: { error: { message: "Your session has ended. Sign in again." } } };
}

export type UploadPurpose = "ACCOUNT_AVATAR" | "PERSON_PROFILE" | "POST_ATTACHMENT";

const MAX_IMAGE_EDGE = 1600;

// Redraws a photo through a canvas: applies its EXIF rotation, drops all
// metadata (including GPS) before it leaves the device, and caps its size.
async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.88),
  );
  if (!blob) throw new Error("Could not read this image.");
  return blob;
}

// Upload intent, then the file itself. Resolves to the READY media id.
export async function uploadImage(
  file: File,
  purpose: UploadPurpose,
  familyId?: string,
): Promise<{ ok: true; mediaId: string } | { ok: false; message: string }> {
  let blob: Blob;
  try {
    blob = await prepareImage(file);
  } catch {
    return { ok: false, message: "Couldn't read that file. Choose a JPEG, PNG or WebP photo." };
  }
  const intent = await api("POST", "/api/v1/media/upload-intents", {
    purpose,
    familyId,
    mimeType: blob.type,
    size: blob.size,
  });
  if (intent.status !== 201) {
    return { ok: false, message: errorMessage(intent, "Couldn't start the upload.") };
  }
  let response: Response;
  try {
    response = await fetch(intent.body.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": blob.type },
      body: blob,
      credentials: "same-origin",
      redirect: "manual",
    });
  } catch {
    return { ok: false, message: "Could not reach the server. Check your connection." };
  }
  if (response.type === "opaqueredirect") {
    return { ok: false, message: sessionEnded().body.error.message };
  }
  if (!response.ok) {
    const json: any = await response.json().catch(() => ({}));
    return { ok: false, message: json?.error?.message || "Couldn't upload the photo." };
  }
  return { ok: true, mediaId: intent.body.asset.id };
}

export function mediaUrl(mediaId: string): string {
  return `/api/v1/media/${encodeURIComponent(mediaId)}/content`;
}

export function errorMessage(result: ApiResult, fallback: string): string {
  return result.body?.error?.message || fallback;
}
