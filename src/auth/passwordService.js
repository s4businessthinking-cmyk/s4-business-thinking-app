const DEFAULT_ALGORITHM = "pbkdf2-sha256";
const DEFAULT_ITERATIONS = 150000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

function getCrypto() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error("Web Crypto API is required for local password hashing.");
  }
  return cryptoApi;
}

function getRandomBytes(size) {
  const bytes = new Uint8Array(size);
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }

  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }

  return bytes;
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

function rightRotate(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256(message) {
  const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
  const bitLength = bytes.length * 8;
  const withOne = bytes.length + 1;
  const paddedLength = Math.ceil((withOne + 8) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[i] + w[i]) >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((value, index) => {
    outView.setUint32(index * 4, value, false);
  });
  return out;
}

function hmacSha256(key, data) {
  let normalizedKey = key;
  if (normalizedKey.length > 64) normalizedKey = sha256(normalizedKey);

  const inner = new Uint8Array(64 + data.length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i += 1) {
    const value = normalizedKey[i] || 0;
    inner[i] = value ^ 0x36;
    outer[i] = value ^ 0x5c;
  }
  inner.set(data, 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

function pbkdf2Sha256Fallback(password, saltBytes, iterations) {
  const passwordBytes = new TextEncoder().encode(password);
  const blockInput = new Uint8Array(saltBytes.length + 4);
  blockInput.set(saltBytes);
  blockInput[saltBytes.length + 3] = 1;

  let u = hmacSha256(passwordBytes, blockInput);
  const output = new Uint8Array(u);
  for (let i = 1; i < iterations; i += 1) {
    u = hmacSha256(passwordBytes, u);
    for (let j = 0; j < output.length; j += 1) {
      output[j] ^= u[j];
    }
  }
  return output;
}

async function derivePasswordHash(password, saltBytes, iterations) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Password is required.");
  }

  try {
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
  } catch (error) {
    console.warn("[S4 Auth] Web Crypto unavailable; using JS password hash fallback", error);
    return pbkdf2Sha256Fallback(password, saltBytes, iterations);
  }
}

export function getPasswordHashDefaults() {
  return {
    algorithm: DEFAULT_ALGORITHM,
    iterations: DEFAULT_ITERATIONS,
  };
}

export async function hashPassword(password, options = {}) {
  const salt = getRandomBytes(SALT_BYTES);

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
