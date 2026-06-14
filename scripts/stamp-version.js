/**
 * Stamps build version across deploy artifacts (run before Vercel deploy).
 * Usage: node scripts/stamp-version.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const VERSION = String(Date.now());
const builtAt = new Date().toISOString();

function stampHtml(content) {
  let out = content.replaceAll("__BUILD_VERSION__", VERSION);
  out = out.replace(
    /(<meta name="app-build-version" content=")[^"]*(">)/g,
    `$1${VERSION}$2`
  );
  out = out.replace(/(\?v=)[^"'`$\s&)}]+/g, `$1${VERSION}`);
  return out;
}

function stampSw(content) {
  let out = content.replaceAll("__BUILD_VERSION__", VERSION);
  out = out.replace(/const BUILD_VERSION = "[^"]+";/, `const BUILD_VERSION = "${VERSION}";`);
  return out;
}

function stampVersionJson(content) {
  let out = content.replaceAll("__BUILD_VERSION__", VERSION);
  try {
    const data = JSON.parse(out);
    data.version = VERSION;
    data.builtAt = builtAt;
    return JSON.stringify(data, null, 2) + "\n";
  } catch {
    return JSON.stringify({ version: VERSION, builtAt }, null, 2) + "\n";
  }
}

const TARGETS = [
  { file: "index.html", stamp: stampHtml },
  { file: "landing.html", stamp: stampHtml },
  { file: "sw.js", stamp: stampSw },
  { file: "version.json", stamp: stampVersionJson }
];

for (const { file, stamp } of TARGETS) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`[stamp-version] Skip missing file: ${file}`);
    continue;
  }
  const content = fs.readFileSync(filePath, "utf8");
  fs.writeFileSync(filePath, stamp(content), "utf8");
  console.log(`[stamp-version] Stamped ${file} → ${VERSION}`);
}

console.log(`[stamp-version] Done — v${VERSION} (${builtAt})`);
