import { and, eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { mediaAssets } from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { objectStore, type StoredObject } from "~/lib/object-store";
import { assertCanEditTree, assertCanViewFamily, getActiveMembership } from "~/modules/auth/policy";
import { sniffImageType, stripImageMetadata } from "~/modules/media/sanitize";
import { nanoid } from "nanoid";

const ALLOWED_MIME_PREFIXES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MAX_MEDIA_SIZE = 10 * 1024 * 1024;

export interface UploadIntentInput {
  purpose: "ACCOUNT_AVATAR" | "PERSON_PROFILE" | "POST_ATTACHMENT";
  familyId?: string;
  mimeType: string;
  size: number;
}

export async function createUploadIntent(account: Account, input: UploadIntentInput) {
  if (!ALLOWED_MIME_PREFIXES[input.mimeType]) {
    throw Errors.MEDIA_INVALID("Unsupported MIME type.");
  }
  if (input.size > MAX_MEDIA_SIZE) {
    throw Errors.MEDIA_INVALID("File exceeds maximum size.");
  }
  if (input.purpose === "ACCOUNT_AVATAR") {
    if (input.familyId) throw Errors.VALIDATION("Account avatars do not belong to a family.");
  } else {
    if (!input.familyId) throw Errors.VALIDATION("familyId is required for this media purpose.");
    // Family media is family data: only members may attach it, and only
    // tree editors may upload profile photos.
    if (input.purpose === "PERSON_PROFILE") await assertCanEditTree(account, input.familyId);
    else await assertCanViewFamily(account, input.familyId);
  }

  const extension = ALLOWED_MIME_PREFIXES[input.mimeType];
  const objectKey = `media/${input.purpose.toLowerCase()}/${account.id}/${nanoid(16)}.${extension}`;

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      ownerAccountId: account.id,
      familyId: input.familyId ?? null,
      purpose: input.purpose,
      objectKey,
      mimeType: input.mimeType,
      byteSize: input.size,
      status: "PENDING",
    })
    .returning();

  return { asset, uploadUrl: `/api/v1/media/${asset.id}/content` };
}

async function getOwnedAsset(account: Account, mediaId: string) {
  const asset = await db.query.mediaAssets.findFirst({
    where: and(eq(mediaAssets.id, mediaId), eq(mediaAssets.ownerAccountId, account.id)),
  });
  if (!asset) throw Errors.NOT_FOUND();
  return asset;
}

// Stores the file in object storage (R2 on Cloudflare) after checking that the
// bytes really are the declared image type and removing their metadata.
export async function uploadContent(account: Account, mediaId: string, data: Uint8Array) {
  const asset = await getOwnedAsset(account, mediaId);
  if (asset.status !== "PENDING") throw Errors.MEDIA_INVALID("Media is not in a pending state.");
  if (data.byteLength === 0) throw Errors.MEDIA_INVALID("The file is empty.");
  if (data.byteLength > MAX_MEDIA_SIZE) throw Errors.MEDIA_INVALID("File exceeds maximum size.");

  const type = sniffImageType(data);
  if (!type || type !== asset.mimeType) {
    throw Errors.MEDIA_INVALID("The file content does not match its declared type.");
  }
  let clean: Uint8Array;
  try {
    clean = stripImageMetadata(data, type);
  } catch {
    throw Errors.MEDIA_INVALID("The image file is damaged. Try saving it again and re-uploading.");
  }

  await objectStore().put(asset.objectKey, clean, { httpMetadata: { contentType: type } });
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", clean));
  const sha256 = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");

  const [updated] = await db
    .update(mediaAssets)
    .set({ status: "READY", readyAt: new Date(), byteSize: clean.byteLength, sha256 })
    .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.status, "PENDING")))
    .returning();
  if (!updated) throw Errors.MEDIA_INVALID("Media is not in a pending state.");
  return { asset: updated };
}

// Uploading content already marks the asset READY; this remains for API
// clients that call it afterwards, and is idempotent for them.
export async function completeUpload(account: Account, mediaId: string, sha256?: string) {
  const asset = await getOwnedAsset(account, mediaId);
  if (asset.status === "READY") return { asset };
  if (asset.status !== "PENDING") throw Errors.MEDIA_INVALID("Media is not in a pending state.");
  if (!(await objectStore().head(asset.objectKey))) {
    throw Errors.MEDIA_INVALID("Upload the file before completing it.");
  }
  const [updated] = await db
    .update(mediaAssets)
    .set({ status: "READY", readyAt: new Date(), sha256: sha256 ?? null })
    .where(eq(mediaAssets.id, mediaId))
    .returning();
  return { asset: updated };
}

// Family media is readable by members of that family; account avatars by any
// signed-in account. Everything else answers 404 so ids reveal nothing.
export async function getContent(
  account: Account,
  mediaId: string,
): Promise<{ mimeType: string; sha256: string | null; object: StoredObject }> {
  const asset = await db.query.mediaAssets.findFirst({ where: eq(mediaAssets.id, mediaId) });
  if (!asset || asset.status !== "READY") throw Errors.NOT_FOUND();
  if (asset.ownerAccountId !== account.id) {
    if (asset.familyId) {
      if (!(await getActiveMembership(account.id, asset.familyId))) throw Errors.NOT_FOUND();
    } else if (asset.purpose !== "ACCOUNT_AVATAR") {
      throw Errors.NOT_FOUND();
    }
  }
  const object = await objectStore().get(asset.objectKey);
  if (!object) throw Errors.NOT_FOUND();
  return { mimeType: asset.mimeType, sha256: asset.sha256, object };
}

export async function getMediaAsset(assetId: string, accountId: string) {
  const asset = await db.query.mediaAssets.findFirst({
    where: and(eq(mediaAssets.id, assetId), eq(mediaAssets.ownerAccountId, accountId)),
  });
  if (!asset) throw Errors.NOT_FOUND();
  return asset;
}
