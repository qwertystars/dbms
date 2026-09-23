import { and, eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { mediaAssets } from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { nanoid } from "nanoid";

const ALLOWED_MIME_PREFIXES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MAX_SIZE = 10 * 1024 * 1024;

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
  if (input.size > MAX_SIZE) {
    throw Errors.MEDIA_INVALID("File exceeds maximum size.");
  }
  if (input.purpose !== "ACCOUNT_AVATAR" && !input.familyId) {
    throw Errors.VALIDATION("familyId is required for this media purpose.");
  }

  const extension = ALLOWED_MIME_PREFIXES[input.mimeType];
  const objectKey = `family-social/${input.purpose.toLowerCase()}/${account.id}/${nanoid(16)}.${extension}`;

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

  const uploadUrl = buildPresignedUploadUrl(objectKey);
  return { asset, uploadUrl };
}

export async function completeUpload(account: Account, mediaId: string, sha256?: string) {
  const asset = await db.query.mediaAssets.findFirst({
    where: and(eq(mediaAssets.id, mediaId), eq(mediaAssets.ownerAccountId, account.id)),
  });
  if (!asset) throw Errors.NOT_FOUND();
  if (asset.status !== "PENDING") throw Errors.MEDIA_INVALID("Media is not in a pending state.");

  const [updated] = await db
    .update(mediaAssets)
    .set({
      status: "READY",
      readyAt: new Date(),
      sha256: sha256 ?? null,
    })
    .where(eq(mediaAssets.id, mediaId))
    .returning();

  return { asset: updated };
}

function buildPresignedUploadUrl(objectKey: string) {
  // For v1, return a local endpoint that would be replaced by S3-compatible
  // presigned URL in a real deployment. The object key is the permanent key.
  return `/api/v1/media/upload/${encodeURIComponent(objectKey)}`;
}

export async function getMediaAsset(assetId: string, accountId: string) {
  const asset = await db.query.mediaAssets.findFirst({
    where: and(eq(mediaAssets.id, assetId), eq(mediaAssets.ownerAccountId, accountId)),
  });
  if (!asset) throw Errors.NOT_FOUND();
  return asset;
}
