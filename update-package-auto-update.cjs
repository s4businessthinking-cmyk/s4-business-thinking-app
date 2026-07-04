const fs = require("fs");

const file = "package.json";
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));

pkg.version = "1.0.1";

pkg.repository = {
  type: "git",
  url: "https://github.com/s4businessthinking-cmyk/s4-business-thinking-app.git"
};

pkg.build = pkg.build || {};
pkg.build.publish = [
  {
    provider: "github",
    owner: "s4businessthinking-cmyk",
    repo: "s4-business-thinking-app",
    releaseType: "release"
  }
];

pkg.scripts = pkg.scripts || {};
pkg.scripts["desktop:publish"] = "npm run build && electron-builder --publish always";

fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n", "utf8");
console.log("package.json updated: version 1.0.1 + GitHub publish config");
