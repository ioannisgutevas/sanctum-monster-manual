const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const dist = path.join(root, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

fs.copyFileSync(
  path.join(root, "index.html"),
  path.join(dist, "index.html")
);

fs.copyFileSync(
  path.join(root, "monsters.json"),
  path.join(dist, "monsters.json")
);

fs.cpSync(
  path.join(root, "monsters"),
  path.join(dist, "monsters"),
  { recursive: true }
);

console.log("Static Sanctum Monster Manual build created in dist/");
