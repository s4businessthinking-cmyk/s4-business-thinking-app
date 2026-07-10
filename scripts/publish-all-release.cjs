const { execSync } = require("child_process");
const path = require("path");
const { RELEASE_CONFIG, getTag, getVersion, getGithubReleaseUrl } = require("./release-config.cjs");
const { buildAllRelease } = require("./build-all-release.cjs");

const root = path.join(__dirname, "..");

function run(command) {
  console.log(`\n[S4 Release] > ${command}`);
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

function remoteTagExists(tag) {
  const output = runCapture(`git ls-remote --tags origin refs/tags/${tag}`);
  return Boolean(output);
}

function publishToGitHub({ version, tag }) {
  const commitMessage = `Release ${tag}`;

  console.log("");
  console.log("============================================");
  console.log("S4 Business Thinking - GitHub Publish");
  console.log("============================================");

  if (remoteTagExists(tag)) {
    throw new Error(
      `Git tag ${tag} already exists on GitHub. Bump package.json version first, then run again.`
    );
  }

  run("git add -A");

  const pending = runCapture("git status --porcelain");
  if (pending) {
    run(`git commit -m "${commitMessage}"`);
  } else {
    console.log("[S4 Release] No new code changes. Continuing with tag push.");
  }

  run("git push origin main");

  const localTag = runCapture(`git tag -l "${tag}"`);
  if (!localTag) {
    run(`git tag ${tag}`);
  }

  run(`git push origin ${tag}`);
}

function main() {
  const version = getVersion();
  const tag = getTag(version);

  console.log("============================================");
  console.log("S4 Business Thinking - ONE-CLICK RELEASE");
  console.log("============================================");
  console.log("This single run updates ALL places together:");
  console.log("  1) Windows .exe");
  console.log("  2) Android .apk");
  console.log("  3) Mobile OTA bundle.zip");
  console.log(`  4) USB folder: ${RELEASE_CONFIG.usbDeliveryDir}`);
  console.log(`  5) Project folder: ${RELEASE_CONFIG.projectReleaseDir}`);
  console.log("  6) GitHub Releases (via tag push + Actions)");
  console.log("");
  console.log(`Version: ${version}`);
  console.log(`Tag: ${tag}`);
  console.log("");

  buildAllRelease();
  publishToGitHub({ version, tag });

  console.log("");
  console.log("DONE - everything updated in one run.");
  console.log("");
  console.log("Local/USB files:");
  console.log(`  ${RELEASE_CONFIG.projectReleaseDir}`);
  console.log(`  ${RELEASE_CONFIG.usbDeliveryDir}`);
  console.log("");
  console.log("GitHub (Actions will finish in ~10-20 min):");
  console.log(`  ${getGithubReleaseUrl(version)}`);
}

try {
  main();
} catch (error) {
  console.error("[S4 Release] Publish failed:", error.message || error);
  process.exit(1);
}
