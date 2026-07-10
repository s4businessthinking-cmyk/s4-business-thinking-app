const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const rulesPath = path.join(root, "firestore.rules");
const projectId = "s4-business-thinking-31213";

function run(command) {
  console.log(`\n[S4 Rules] > ${command}`);
  execSync(command, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
}

function runCapture(command) {
  return execSync(command, {
    cwd: root,
    encoding: "utf8",
    shell: true,
  }).trim();
}

function main() {
  if (!fs.existsSync(rulesPath)) {
    throw new Error(`Missing rules file: ${rulesPath}`);
  }

  const rules = fs.readFileSync(rulesPath, "utf8");
  if (!rules.includes("staffLoginIndex")) {
    throw new Error("firestore.rules is missing staffLoginIndex block.");
  }

  console.log("============================================");
  console.log("S4 Firestore Rules Deploy");
  console.log("============================================");
  console.log(`Project: ${projectId}`);
  console.log(`Rules:   ${rulesPath}`);
  console.log("");

  let accounts = "";
  try {
    accounts = runCapture("firebase login:list");
  } catch {
    accounts = "";
  }

  const hasAccount = /Logged in as/i.test(accounts);
  const hasToken = Boolean(process.env.FIREBASE_TOKEN);

  if (!hasAccount && !hasToken) {
    console.error("[S4 Rules] Firebase CLI is not logged in.");
    console.error("");
    console.error("Run once in terminal:");
    console.error("  firebase login");
    console.error("  node scripts/deploy-firestore-rules.cjs");
    console.error("");
    console.error("Or publish manually:");
    console.error(
      `  https://console.firebase.google.com/project/${projectId}/firestore/rules`
    );
    process.exit(1);
  }

  const tokenArg = hasToken ? `--token "${process.env.FIREBASE_TOKEN}"` : "";
  run(`firebase deploy --only firestore:rules --project ${projectId} ${tokenArg}`.trim());

  console.log("");
  console.log("[S4 Rules] Deployed successfully.");
}

try {
  main();
} catch (error) {
  console.error("[S4 Rules] Deploy failed:", error.message || error);
  process.exit(1);
}
