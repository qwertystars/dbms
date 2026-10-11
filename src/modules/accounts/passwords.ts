import { Buffer } from "node:buffer";
import { scrypt, timingSafeEqual } from "node:crypto";
import { randomToken } from "~/lib/crypto";

// OWASP scrypt parameters: N=2^14, r=8, p=5. Supported by Workers nodejs_compat.
function derive(password: string, salt: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomToken();
  return `scrypt$16384$8$5$${salt}$${Buffer.from(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (
    parts.length !== 6 ||
    parts.slice(0, 4).join("$") !== "scrypt$16384$8$5" ||
    !/^[a-f0-9]{64}$/.test(parts[4]) ||
    !/^[a-f0-9]{64}$/.test(parts[5])
  )
    return false;
  return timingSafeEqual(await derive(password, parts[4]), Buffer.from(parts[5], "hex"));
}
// Unknown usernames still incur the same KDF cost to avoid a timing oracle.
export const dummyPasswordHash = `scrypt$16384$8$5$${"0".repeat(64)}$${"0".repeat(64)}`;
