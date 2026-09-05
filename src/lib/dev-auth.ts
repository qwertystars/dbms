import { generateKeyPair, exportJWK, importJWK, SignJWT, type KeyLike } from "jose";
import { env } from "~/lib/env";
import { setCachedJWKs } from "~/lib/auth";

let devPrivateKey: KeyLike | undefined;

export async function ensureDevKeys() {
  if (devPrivateKey) return;
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  devPrivateKey = privateKey;
  const jwk = await exportJWK(publicKey);
  jwk.kid = "dev-key";
  jwk.alg = "RS256";
  const publicJWK = jwk as Record<string, unknown>;
  const cryptoKey = (await importJWK(publicJWK, "RS256")) as KeyLike;
  setCachedJWKs([cryptoKey]);
  process.env.AUTH_JWKS = JSON.stringify({ keys: [publicJWK] });
}

export async function signDevToken(subject: string, displayName: string) {
  await ensureDevKeys();
  if (!devPrivateKey) throw new Error("Dev keys not initialized");
  return await new SignJWT({ sub: subject, name: displayName })
    .setProtectedHeader({ alg: "RS256", kid: "dev-key" })
    .setIssuer(env.AUTH_ISSUER)
    .setAudience(env.AUTH_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(devPrivateKey);
}
