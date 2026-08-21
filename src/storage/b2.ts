/**
 * Backblaze B2 upload adapter speaking the S3-compatible API with
 * AWS Signature V4 signing via WebCrypto (Workers compatible).
 */

export class B2ConfigError extends Error {
  constructor(message = "B2 is not configured") {
    super(message);
    this.name = "B2ConfigError";
  }
}

export interface B2Env {
  B2_KEY_ID?: string;
  B2_APP_KEY?: string;
  B2_ENDPOINT: string;
  B2_BUCKET: string;
}

type FetchLike = typeof fetch;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

let fetchImpl: FetchLike = defaultFetch;

/** Inject a fetch implementation (e.g. a test stub). Pass null to restore. */
export function setB2Fetch(fn: FetchLike | null): void {
  fetchImpl = fn ?? defaultFetch;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

async function hmac(key: Uint8Array | string, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? new TextEncoder().encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data),
  );
  return new Uint8Array(sig);
}

function regionFromEndpoint(endpoint: string): string {
  try {
    const host = new URL(endpoint).hostname;
    const m = host.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/);
    if (m?.[1]) return m[1];
  } catch {
    // fall through to default region
  }
  return "us-west-004";
}

function amzDateFormat(now: Date): string {
  const p = (n: number) => n.toString().padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
    `T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`
  );
}

export async function uploadPhoto(
  env: B2Env,
  key: string,
  body: Uint8Array,
  contentType: string,
  opts?: { now?: Date },
): Promise<{ photo_url: string }> {
  const keyId = env.B2_KEY_ID;
  const appKey = env.B2_APP_KEY;
  if (!keyId || !appKey) {
    throw new B2ConfigError();
  }

  const endpoint = env.B2_ENDPOINT.replace(/\/+$/, "");
  const bucket = env.B2_BUCKET;
  const url = `${endpoint}/${bucket}/${key}`;
  const host = new URL(url).host;
  const region = regionFromEndpoint(endpoint);

  const now = opts?.now ?? new Date();
  const amzDate = amzDateFormat(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body);

  // Canonical request (headers already in sorted order).
  const canonicalRequest = [
    "PUT",
    `/${bucket}/${key}`,
    "",
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
    "content-type;host;x-amz-content-sha256;x-amz-date",
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const canonicalRequestHash = await sha256Hex(new TextEncoder().encode(canonicalRequest));
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    canonicalRequestHash,
  ].join("\n");

  // Signing key chain: AWS4<secret> -> date -> region -> s3 -> aws4_request.
  let signingKey = await hmac(`AWS4${appKey}`, dateStamp);
  signingKey = await hmac(signingKey, region);
  signingKey = await hmac(signingKey, "s3");
  signingKey = await hmac(signingKey, "aws4_request");
  const signature = toHex(await hmac(signingKey, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, ` +
    `SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, ` +
    `Signature=${signature}`;

  await fetchImpl(url, {
    method: "PUT",
    headers: {
      "content-type": contentType,
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      authorization,
    },
    body,
  });

  return { photo_url: url };
}
