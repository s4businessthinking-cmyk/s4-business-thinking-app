const path = require("path");

const root = path.join(__dirname, "..");

const RELEASE_CONFIG = Object.freeze({
  versionSource: path.join(root, "package.json"),
  projectReleaseDir: path.join(root, "release"),
  usbDeliveryDir: path.join(root, "..", "S4-CUSTOMER-DELIVERY"),
  github: Object.freeze({
    owner: "s4businessthinking-cmyk",
    repo: "s4-business-thinking-app",
    releasesUrl:
      "https://github.com/s4businessthinking-cmyk/s4-business-thinking-app/releases",
    latestUrl:
      "https://github.com/s4businessthinking-cmyk/s4-business-thinking-app/releases/latest",
  }),
  fileNames: Object.freeze({
    apk: (version) => `S4-Business-Thinking-${version}.apk`,
    bundle: (version) => `S4-Business-Thinking-${version}-bundle.zip`,
    manifest: "release-manifest.json",
    readme: "README-INSTALL.txt",
  }),
});

function getVersion() {
  const pkg = require(RELEASE_CONFIG.versionSource);
  const version = String(pkg.version || "").trim();
  if (!version) {
    throw new Error("RELEASE_VERSION_MISSING");
  }
  return version;
}

function getTag(version = getVersion()) {
  return `v${version}`;
}

function getGithubReleaseUrl(version = getVersion()) {
  return `${RELEASE_CONFIG.github.releasesUrl}/tag/${getTag(version)}`;
}

module.exports = {
  RELEASE_CONFIG,
  getVersion,
  getTag,
  getGithubReleaseUrl,
};
