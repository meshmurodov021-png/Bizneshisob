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
<rect width="512" height="512" rx="80" fill="#7C3AED"/>
<rect x="120" y="320" width="60" height="120" rx="6" fill="#A78BFA"/>
<rect x="220" y="260" width="60" height="180" rx="6" fill="#C4B5FD"/>
<rect x="320" y="180" width="60" height="260" rx="6" fill="#EDE9FE"/>
<polyline points="140,260 240,190 340,130 390,100" fill="none" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="140" cy="260" r="12" fill="white"/>
<circle cx="240" cy="190" r="12" fill="white"/>
<circle cx="340" cy="130" r="12" fill="white"/>
<circle cx="390" cy="100" r="12" fill="white"/>
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

  // iOS uchun (manifest alohida ishlatishi mumkin)
  const applePath = join(ICONS_DIR, "apple-touch-icon.png");
  await base
    .clone()
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toFile(applePath);
  console.log(`✓ ${applePath}`);

  console.log(`\nTayyor: ${SIZES.length + 1} ta PNG (${ICONS_DIR})`);
}

generateIcons().catch(err => {
  console.error("Xatolik:", err.message);
  process.exit(1);
});
