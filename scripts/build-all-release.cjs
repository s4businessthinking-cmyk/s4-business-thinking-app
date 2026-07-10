const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getTag, getVersion, getGithubReleaseUrl } = require("./release-config.cjs");
const { syncReleaseOutputs } = require("./sync-release-outputs.cjs");
const { syncAndroidVersion } = require("./sync-android-version.cjs");

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

function copyReleaseArtifacts(stagingDir, projectReleaseDir) {
  fs.mkdirSync(projectReleaseDir, { recursive: true });

  for (const name of fs.readdirSync(stagingDir)) {
    const sourcePath = path.join(stagingDir, name);
    const targetPath = path.join(projectReleaseDir, name);
    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
    console.log(`[S4 Release] Copied ${name}`);
  }
}

function buildDesktopRelease() {
  const stagingDir = path.join(
    process.env.LOCALAPPDATA || os.tmpdir(),
    "s4-business-thinking-release"
  );
  const projectReleaseDir = path.join(root, "release");

  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  run("npm run build:desktop-web");
  run(`npx electron-builder --publish never --config.directories.output="${stagingDir}"`);
  copyReleaseArtifacts(stagingDir, projectReleaseDir);
}

function buildAllRelease() {
  const version = getVersion();
  const tag = getTag(version);

  console.log("============================================");
  console.log("S4 Business Thinking - Locked Release Build");
  console.log("============================================");
  console.log(`Version: ${version}`);
  console.log(`Tag: ${tag}`);
  console.log("");

  syncAndroidVersion();
  buildDesktopRelease();
  run("npm run android:build");
  syncReleaseOutputs({ requireAll: true });

  return { version, tag };
}

function main() {
  const { version, tag } = buildAllRelease();

  console.log("");
  console.log("Build + USB sync done.");
  console.log("");
  console.log("Locked output folders:");
  console.log(`  1) ${path.join(root, "release")}`);
  console.log(`  2) ${path.join(root, "..", "S4-CUSTOMER-DELIVERY")}`);
  console.log("");
  console.log("Publish same version to GitHub:");
  console.log("  npm run release:publish");
  console.log("");
  console.log(`GitHub release URL after publish: ${getGithubReleaseUrl(version)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("[S4 Release] Build failed:", error.message || error);
    process.exit(1);
  }
}

module.exports = { buildAllRelease };
