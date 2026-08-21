import { afterEach, describe, expect, it } from "vitest";
import { B2ConfigError, uploadPhoto, setB2Fetch } from "../src/storage/b2";

const ENDPOINT = "https://s3.us-west-004.backblazeb2.com";
const BUCKET = "dbms-family-photos";
const FIXED_NOW = new Date("2026-08-21T12:34:56Z");

interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
}

function makeCapture(): { requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  setB2Fetch(async (input, init) => {
    const req = new Request(input, init);
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      headers[k] = v;
    });
    requests.push({ method: req.method, url: req.url, headers });
    return new Response(null, { status: 200 });
  });
  return { requests };
}

function baseEnv() {
  return {
    B2_KEY_ID: "test-key-id",
    B2_APP_KEY: "test-app-key",
    B2_ENDPOINT: ENDPOINT,
    B2_BUCKET: BUCKET,
  };
}

afterEach(() => {
  setB2Fetch(null);
});

describe("uploadPhoto", () => {
  it("throws B2ConfigError when credentials are missing", async () => {
    await expect(
      uploadPhoto({ ...baseEnv(), B2_KEY_ID: undefined }, "k", new Uint8Array(1), "image/jpeg"),
    ).rejects.toBeInstanceOf(B2ConfigError);

    await expect(
      uploadPhoto({ ...baseEnv(), B2_APP_KEY: "" }, "k", new Uint8Array(1), "image/jpeg"),
    ).rejects.toBeInstanceOf(B2ConfigError);
  });

  it("issues a PUT to endpoint/bucket/key", async () => {
    const { requests } = makeCapture();
    await uploadPhoto(baseEnv(), "test-key", new Uint8Array([1, 2, 3]), "image/jpeg");

    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("PUT");
    expect(requests[0]!.url).toBe(`${ENDPOINT}/${BUCKET}/test-key`);
  });

  it("signs exactly the headers content-type;host;x-amz-content-sha256;x-amz-date", async () => {
    const { requests } = makeCapture();
    await uploadPhoto(baseEnv(), "test-key", new Uint8Array([1]), "image/jpeg");

    const auth = requests[0]!.headers["authorization"]!;
    expect(auth).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(auth).toContain(
      "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date",
    );
  });

  it("is deterministic for a fixed now (credential date + x-amz-date)", async () => {
    const { requests } = makeCapture();
    await uploadPhoto(
      baseEnv(),
      "test-key",
      new Uint8Array([1]),
      "image/jpeg",
      { now: FIXED_NOW },
    );

    const auth = requests[0]!.headers["authorization"]!;
    expect(auth).toContain(
      "Credential=test-key-id/20260821/us-west-004/s3/aws4_request",
    );
    expect(requests[0]!.headers["x-amz-date"]).toBe("20260821T123456Z");
  });

  it("produces identical signatures for identical inputs", async () => {
    const { requests } = makeCapture();
    const body = new Uint8Array([9, 8, 7]);
    await uploadPhoto(baseEnv(), "same-key", body, "image/png", { now: FIXED_NOW });
    await uploadPhoto(baseEnv(), "same-key", body, "image/png", { now: FIXED_NOW });

    const sigOf = (auth: string) => auth.split("Signature=")[1];
    expect(sigOf(requests[0]!.headers["authorization"]!)).toBe(
      sigOf(requests[1]!.headers["authorization"]!),
    );
  });

  it("changes x-amz-content-sha256 when one body byte changes", async () => {
    const { requests } = makeCapture();
    await uploadPhoto(baseEnv(), "k", new Uint8Array([1, 2, 3]), "image/jpeg");
    await uploadPhoto(baseEnv(), "k", new Uint8Array([1, 2, 4]), "image/jpeg");

    const shaA = requests[0]!.headers["x-amz-content-sha256"];
    const shaB = requests[1]!.headers["x-amz-content-sha256"];
    expect(shaA).not.toBe(shaB);
    expect(shaA).toMatch(/^[0-9a-f]{64}$/);
  });

  it("has a 64-char lowercase-hex signature", async () => {
    const { requests } = makeCapture();
    await uploadPhoto(baseEnv(), "k", new Uint8Array([5]), "image/jpeg", {
      now: FIXED_NOW,
    });

    const auth = requests[0]!.headers["authorization"]!;
    const m = auth.match(/Signature=([0-9a-f]+)$/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns photo_url as endpoint/bucket/key", async () => {
    makeCapture();
    const res = await uploadPhoto(baseEnv(), "photos/a.jpg", new Uint8Array([1]), "image/jpeg");
    expect(res.photo_url).toBe(`${ENDPOINT}/${BUCKET}/photos/a.jpg`);
  });
});
