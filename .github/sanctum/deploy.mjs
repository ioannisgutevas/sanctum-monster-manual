// SANCTUM-OWNED: sanctum-deploy-helper v1
// Server-generated helper. Do not print secrets or Authorization headers.
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const API = process.env.SANCTUM_DEPLOY_API;
const TOKEN = process.env.SANCTUM_DEPLOY_TOKEN;
const APP_KEY = process.env.SANCTUM_APP_KEY;
const RUNTIME_ID = process.env.SANCTUM_APPROVED_RUNTIME_ID;
const VERSION = (process.env.SANCTUM_RELEASE_VERSION || "").slice(0, 40);
const MAX_FILE_BYTES = 26214400;
const BLOCKED = new Set([
  "sw.js",
  "service-worker.js",
  "serviceworker.js",
  "manifest.webmanifest",
]);

if (!API || !TOKEN || !APP_KEY || !RUNTIME_ID || !VERSION) {
  throw new Error("missing_sanctum_deploy_configuration");
}

const TYPES = {
  html: "text/html; charset=utf-8",
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  woff2: "font/woff2",
  woff: "font/woff",
  txt: "text/plain; charset=utf-8",
  map: "application/json",
  wasm: "application/wasm",
};

function assertInsideDist(distRoot, full) {
  const root = distRoot.endsWith(sep) ? distRoot : distRoot + sep;
  const abs = resolve(full);
  if (abs !== distRoot && !abs.startsWith(root)) {
    throw new Error("dist_path_escape");
  }
}

function walk(dir, distRoot, files = []) {
  for (const name of readdirSync(dir)) {
    if (!name || name === "." || name === "..") {
      throw new Error("dist_unsafe_name");
    }
    const full = join(dir, name);
    assertInsideDist(distRoot, full);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) throw new Error("dist_symlink_rejected");
    if (st.isDirectory()) walk(full, distRoot, files);
    else files.push(full);
  }
  return files;
}

function contentType(path) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] || "application/octet-stream";
}

function encodeUploadPath(rel) {
  return rel.split("/").map(encodeURIComponent).join("/");
}

async function api(method, path, body, headers = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: "SanctumDeploy " + TOKEN,
      ...headers,
    },
    body,
  });
  if (!response.ok) {
    throw new Error("sanctum_deploy_failed:" + response.status);
  }
  return response.json();
}

const dist = "dist";
let distStat;
try {
  distStat = lstatSync(dist);
} catch {
  throw new Error("dist_missing");
}
if (distStat.isSymbolicLink() || !distStat.isDirectory()) {
  throw new Error("dist_missing");
}
const distRoot = resolve(dist);

const files = walk(dist, distRoot).map((full) => {
  const rel = relative(distRoot, full).split(sep).join("/");
  if (!rel || rel.startsWith("/") || rel.includes("..") || rel.includes("\\")) {
    throw new Error("dist_unsafe_path");
  }
  if (BLOCKED.has(rel.toLowerCase()) || BLOCKED.has(rel.split("/").pop().toLowerCase())) {
    throw new Error("service_worker_not_supported");
  }
  const bytes = readFileSync(full);
  if (bytes.length > MAX_FILE_BYTES) throw new Error("dist_file_too_large");
  return {
    path: rel,
    bytes,
    contentType: contentType(rel),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
});

function isExternalAbsoluteUrl(value) {
  return /^(?:https?:|data:|blob:)/i.test(value) || value.startsWith("//");
}

function isNonPortableAssetRef(value) {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || isExternalAbsoluteUrl(path)) return false;
  return (
    /^\/(?:tools|apps)(?:\/|$)/i.test(path) ||
    /^\/assets(?:\/|$)/i.test(path) ||
    /^\/[^/].*\.(?:js|mjs|css)(?:[?#].*)?$/i.test(path)
  );
}

function assertPortableIndexHtml(html) {
  const attr = /\b(?:src|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = attr.exec(html))) {
    if (isNonPortableAssetRef(match[1])) {
      throw new Error("non_portable_build_output");
    }
  }
  const cssUrl = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((match = cssUrl.exec(html))) {
    if (isNonPortableAssetRef(match[1])) {
      throw new Error("non_portable_build_output");
    }
  }
}

if (!files.some((file) => file.path === "index.html")) {
  throw new Error("entrypoint_missing");
}
const indexHtml = files.find((file) => file.path === "index.html");
assertPortableIndexHtml(indexHtml.bytes.toString("utf8"));

const begun = await api(
  "POST",
  "/releases",
  JSON.stringify({
    approvedRuntimeId: RUNTIME_ID,
    appKey: APP_KEY,
    version: VERSION,
  }),
  { "Content-Type": "application/json" },
);

const releaseId = begun.release.id;
if (!/^[A-Za-z0-9_-]{1,80}$/.test(releaseId)) {
  throw new Error("invalid_release_id");
}
for (const file of files) {
  await api(
    "PUT",
    "/releases/" + encodeURIComponent(releaseId) + "/files/" + encodeUploadPath(file.path),
    file.bytes,
    { "Content-Type": file.contentType },
  );
}

await api(
  "POST",
  "/releases/" + encodeURIComponent(releaseId) + "/finalize",
  JSON.stringify({
    appKey: APP_KEY,
    version: VERSION,
    entrypoint: "index.html",
    files: files.map((file) => ({
      path: file.path,
      contentType: file.contentType,
      size: file.bytes.length,
      sha256: file.sha256,
    })),
  }),
  { "Content-Type": "application/json" },
);

await api("POST", "/releases/" + encodeURIComponent(releaseId) + "/activate");
