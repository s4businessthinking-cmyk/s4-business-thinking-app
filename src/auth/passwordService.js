const DEFAULT_ALGORITHM = "pbkdf2-sha256";
const DEFAULT_ITERATIONS = 150000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

function getCrypto() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("Web Crypto API is required for local password hashing.");
  }
  return cryptoApi;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

async function derivePasswordHash(password, saltBytes, iterations) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Password is required.");
  }

  const cryptoApi = getCrypto();
  const keyMaterial = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await cryptoApi.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations,
    },
    keyMaterial,
    HASH_BITS
  );

  return new Uint8Array(bits);
}

export function getPasswordHashDefaults() {
  return {
    algorithm: DEFAULT_ALGORITHM,
    iterations: DEFAULT_ITERATIONS,
  };
}

export async function hashPassword(password, options = {}) {
  const cryptoApi = getCrypto();
  const salt = new Uint8Array(SALT_BYTES);
  cryptoApi.getRandomValues(salt);

  const iterations = Number(options.iterations || DEFAULT_ITERATIONS);
  const hash = await derivePasswordHash(password, salt, iterations);

  return {
    passwordHash: bytesToBase64(hash),
    passwordSalt: bytesToBase64(salt),
    passwordAlgo: DEFAULT_ALGORITHM,
    passwordIterations: iterations,
  };
}

export async function verifyPassword(password, stored) {
  if (!stored || stored.passwordAlgo !== DEFAULT_ALGORITHM) {
    return { ok: false, reason: "UNSUPPORTED_ALGORITHM" };
  }

  const iterations = Number(stored.passwordIterations || 0);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return { ok: false, reason: "INVALID_ITERATIONS" };
  }

  try {
    const salt = base64ToBytes(stored.passwordSalt || "");
    const expectedHash = base64ToBytes(stored.passwordHash || "");
    const actualHash = await derivePasswordHash(password, salt, iterations);

    return {
      ok: constantTimeEqual(actualHash, expectedHash),
      reason: constantTimeEqual(actualHash, expectedHash) ? "MATCH" : "NO_MATCH",
    };
  } catch {
    return { ok: false, reason: "INVALID_HASH_DATA" };
  }
}

export function needsPasswordRehash(stored) {
  return (
    stored?.passwordAlgo !== DEFAULT_ALGORITHM ||
    Number(stored?.passwordIterations || 0) < DEFAULT_ITERATIONS
  );
}
