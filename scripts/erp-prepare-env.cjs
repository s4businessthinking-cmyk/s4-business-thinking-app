const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dockerDir = path.join(__dirname, "..", "erp", "infrastructure", "docker");
const examplePath = path.join(dockerDir, ".env.example");
const envPath = path.join(dockerDir, ".env");

function generateRsaKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    privateB64: Buffer.from(privateKey, "utf8").toString("base64"),
    publicB64: Buffer.from(publicKey, "utf8").toString("base64"),
  };
}

function ensureEnv() {
  if (!fs.existsSync(examplePath)) {
    throw new Error(`Missing ${examplePath}`);
  }

  let content;
  if (!fs.existsSync(envPath)) {
    content = fs.readFileSync(examplePath, "utf8");
    const secret = crypto.randomBytes(48).toString("hex");
    content = content.replace("change-me-to-a-long-random-secret-key-for-production", secret);
    const keys = generateRsaKeyPair();
    content = content.replace("JWT_RSA_PRIVATE_KEY_B64=", `JWT_RSA_PRIVATE_KEY_B64=${keys.privateB64}`);
    content = content.replace("JWT_RSA_PUBLIC_KEY_B64=", `JWT_RSA_PUBLIC_KEY_B64=${keys.publicB64}`);
    fs.writeFileSync(envPath, content, "utf8");
    console.log("[erp:env] Created erp/infrastructure/docker/.env with JWT keys");
    return;
  }

  content = fs.readFileSync(envPath, "utf8");
  let changed = false;
  if (!/JWT_RSA_PRIVATE_KEY_B64=.+/.test(content)) {
    const keys = generateRsaKeyPair();
    content += `\nJWT_KEY_ID=s4-erp-stage2\nJWT_ACCESS_TOKEN_TTL_SECONDS=300\nJWT_RSA_PRIVATE_KEY_B64=${keys.privateB64}\nJWT_RSA_PUBLIC_KEY_B64=${keys.publicB64}\n`;
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(envPath, content, "utf8");
    console.log("[erp:env] Added JWT keys to existing .env");
  } else {
    console.log("[erp:env] .env already exists");
  }
}

ensureEnv();
