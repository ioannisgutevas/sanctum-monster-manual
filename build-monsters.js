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

function stripHTML(value) {
  return String(value || "").replace(/<[^>]+>/g, "").trim();
}

function decodeHTML(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getAttr(html, attr) {
  const bodyMatch = html.match(/<body[^>]*>/i);
  const source = bodyMatch ? bodyMatch[0] : html;

  const doubleQuoteRegex = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i");
  const doubleMatch = source.match(doubleQuoteRegex);
  if (doubleMatch) return decodeHTML(doubleMatch[1].trim());

  const singleQuoteRegex = new RegExp(`${attr}\\s*=\\s*'([^']*)'`, "i");
  const singleMatch = source.match(singleQuoteRegex);
  if (singleMatch) return decodeHTML(singleMatch[1].trim());

  return "";
}

function getMeta(html, key) {
  const attrValue = getAttr(html, `data-monster-${key.toLowerCase()}`);
  if (attrValue) return attrValue;

  const commentPattern = new RegExp(`MONSTER_${key}:\\s*(.+)`, "i");
  const commentMatch = html.match(commentPattern);
  if (commentMatch) return decodeHTML(stripHTML(commentMatch[1]));

  const metaPattern = new RegExp(
    `<meta\\s+name=["']monster:${key.toLowerCase()}["']\\s+content=["']([^"']+)["']`,
    "i"
  );
  const metaMatch = html.match(metaPattern);
  if (metaMatch) return decodeHTML(metaMatch[1].trim());

  return "";
}

function getTitle(html, fallback) {
  const dataTitle = getMeta(html, "TITLE");
  if (dataTitle) return dataTitle;

  const dataName = getMeta(html, "NAME");
  if (dataName) return dataName;

  const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  if (h1) return decodeHTML(stripHTML(h1[1]));

  const title = html.match(/<title[^>]*>(.*?)<\/title>/is);
  if (title) return decodeHTML(stripHTML(title[1]).replace(/—.*$/, "").trim());

  return fallback;
}

function scanDirectory(dir, baseDir = MONSTERS_DIR) {
  if (!fs.existsSync(dir)) return [];

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

    const name = getTitle(html, fallbackName);
    const category = getMeta(html, "CATEGORY") || categoryFromFolder || "Uncategorized";
    const type = getMeta(html, "TYPE") || "Custom Monster";

    const crRaw = getMeta(html, "CR");
    const crNumber = Number(crRaw);
    const cr = Number.isFinite(crNumber) ? crNumber : "?";

    const description =
      getMeta(html, "DESCRIPTION") || "A custom Sanctum monster codex entry.";

    const tagsRaw = getMeta(html, "TAGS");
    const tags = tagsRaw
      ? tagsRaw.split(",").map(tag => tag.trim()).filter(Boolean)
      : ["Sanctum"];

    monsters.push({
      id: getMeta(html, "ID") || entry.name.replace(/\.html$/i, ""),
      name,
      category,
      type,
      cr,
      tags,
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
