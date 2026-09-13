/**
 * BiznesHisob — SVG dan PWA ikonlarini yaratish (sharp)
 * Ishga tushirish: npm install && node generate-icons.js
 */

import { readFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "icons");
const SVG_PATH = join(ICONS_DIR, "icon.svg");

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

const SVG_INLINE = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bhMark" x1="18%" y1="0%" x2="82%" y2="100%">
      <stop offset="0%" stop-color="#C4B0FF"/>
      <stop offset="38%" stop-color="#9B7CFF"/>
      <stop offset="100%" stop-color="#5B3DF5"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="115" fill="url(#bhMark)"/>
  <rect x="138.2" y="277.3" width="61.2" height="127.2" rx="30.6" fill="#fff"/>
  <rect x="225.4" y="128" width="61.2" height="276.5" rx="30.6" fill="#fff"/>
  <rect x="312.5" y="210.9" width="61.2" height="193.5" rx="30.6" fill="#fff"/>
</svg>`;

async function loadSvg() {
  try {
    return await readFile(SVG_PATH, "utf8");
  } catch {
    return SVG_INLINE;
  }
}

async function generateIcons() {
  await mkdir(ICONS_DIR, { recursive: true });
  const svg = await loadSvg();
  const base = sharp(Buffer.from(svg), { density: 300 });

  for (const size of SIZES) {
    const outPath = join(ICONS_DIR, `icon-${size}.png`);
    await base
      .clone()
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outPath);
    console.log(`✓ ${outPath}`);
  }

  const applePath = join(ICONS_DIR, "apple-touch-icon.png");
  await base
    .clone()
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toFile(applePath);
  console.log(`✓ ${applePath}`);

  const sourcePath = join(ICONS_DIR, "icon-source.png");
  await base
    .clone()
    .resize(1024, 1024)
    .png({ compressionLevel: 9 })
    .toFile(sourcePath);
  console.log(`✓ ${sourcePath}`);

  console.log(`\nTayyor: ${SIZES.length + 2} ta PNG (${ICONS_DIR})`);
}

generateIcons().catch(err => {
  console.error("Xatolik:", err.message);
  process.exit(1);
});
