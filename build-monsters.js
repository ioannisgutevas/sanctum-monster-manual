const fs = require("fs");
const path = require("path");

const MONSTERS_DIR = path.join(__dirname, "monsters");
const OUTPUT_FILE = path.join(__dirname, "monsters.json");

function titleFromFilename(filename) {
  return filename
    .replace(/\.html$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function getAttr(html, attr) {
  const bodyMatch = html.match(/<body[^>]*>/i);
  const source = bodyMatch ? bodyMatch[0] : html;
  const regex = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = source.match(regex);
  return match ? match[1].trim() : "";
}

function getMeta(html, key) {
  const attrValue = getAttr(html, `data-monster-${key.toLowerCase()}`);
  if (attrValue) return attrValue;

  const patterns = [
    new RegExp(`MONSTER_${key}:\\s*(.+)`, "i"),
    new RegExp(`<meta\\s+name=["']monster:${key.toLowerCase()}["']\\s+content=["']([^"']+)["']`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1].trim();
  }

  return "";
}

function getTitle(html, fallback) {
  const dataTitle = getMeta(html, "TITLE");
  if (dataTitle) return dataTitle;

  const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  if (h1) return h1[1].replace(/<[^>]+>/g, "").trim();

  const title = html.match(/<title[^>]*>(.*?)<\/title>/is);
  if (title) return title[1].replace(/—.*$/, "").trim();

  return fallback;
}

function scanDirectory(dir, baseDir = MONSTERS_DIR) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let monsters = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      monsters = monsters.concat(scanDirectory(fullPath, baseDir));
      continue;
    }

    if (!entry.name.toLowerCase().endsWith(".html")) continue;

    const html = fs.readFileSync(fullPath, "utf8");
    const relativePath = path.relative(__dirname, fullPath).replaceAll("\\", "/");
    const fallbackName = titleFromFilename(entry.name);

    const categoryFromFolder = path
      .relative(baseDir, path.dirname(fullPath))
      .split(path.sep)
      .filter(Boolean)[0];

    const name = getMeta(html, "TITLE") || getMeta(html, "NAME") || getTitle(html, fallbackName);
    const category = getMeta(html, "CATEGORY") || categoryFromFolder || "Uncategorized";
    const type = getMeta(html, "TYPE") || "Custom Monster";

    const crRaw = getMeta(html, "CR");
    const crNumber = Number(crRaw);
    const cr = Number.isFinite(crNumber) ? crNumber : "?";

    const description = getMeta(html, "DESCRIPTION") || "A custom Sanctum monster codex entry.";
    const tagsRaw = getMeta(html, "TAGS");

    monsters.push({
      id: getMeta(html, "ID") || entry.name.replace(/\.html$/i, ""),
      name,
      category,
      type,
      cr,
      tags: tagsRaw ? tagsRaw.split(",").map(tag => tag.trim()).filter(Boolean) : ["Sanctum"],
      url: relativePath,
      description
    });
  }

  return monsters;
}

const monsters = scanDirectory(MONSTERS_DIR).sort((a, b) => {
  return String(a.name).localeCompare(String(b.name));
});

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(monsters, null, 2));

console.log(`Generated monsters.json with ${monsters.length} monster(s).`);
