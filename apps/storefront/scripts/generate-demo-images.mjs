/**
 * Generates brand-styled SVG demo imagery into apps/storefront/public/demo-images.
 * Output is committed so the storefront has imagery without external services; every
 * product's image URL can later be swapped for Cloudinary photography via the admin panel.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "demo-images");
mkdirSync(outDir, { recursive: true });

const PALETTES = {
  honey: { bg: "#F6E8C8", blob: "#E4B95B", deep: "#B07E1F", accent: "#8A5A12" },
  "dry-fruits": { bg: "#F1E4D3", blob: "#C98A4B", deep: "#8F5A28", accent: "#6B3E1B" },
  kesar: { bg: "#F8E3C0", blob: "#D97C2B", deep: "#A4531A", accent: "#7A3A10" },
  "gift-boxes": { bg: "#F3E2D8", blob: "#A64450", deep: "#702C35", accent: "#58452F" },
};

function hexTile(x, y, r, fill, opacity = 1) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" opacity="${opacity}"/>`;
}

function jarImage(p, label, sub) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="${label} demo placeholder image">
  <rect width="600" height="600" fill="${p.bg}"/>
  ${hexTile(80, 90, 34, p.blob, 0.18)}
  ${hexTile(510, 80, 44, p.blob, 0.22)}
  ${hexTile(530, 520, 30, p.deep, 0.14)}
  ${hexTile(70, 510, 40, p.blob, 0.16)}
  <ellipse cx="300" cy="510" rx="190" ry="26" fill="${p.deep}" opacity="0.12"/>
  <path d="M205 300 Q205 250 240 240 L360 240 Q395 250 395 300 L388 430 Q386 470 350 472 L250 472 Q214 470 212 430 Z" fill="${p.blob}"/>
  <path d="M205 300 Q205 250 240 240 L360 240 Q395 250 395 300 L388 430 Q386 470 350 472 L250 472 Q214 470 212 430 Z" fill="none" stroke="${p.deep}" stroke-width="5"/>
  <rect x="228" y="222" width="144" height="26" rx="9" fill="${p.deep}"/>
  <rect x="248" y="318" width="104" height="110" rx="6" fill="#FFFDF6"/>
  <text x="300" y="352" text-anchor="middle" font-family="Georgia, serif" font-size="17" font-weight="bold" fill="${p.accent}">Annaadhya</text>
  <text x="300" y="376" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="${p.accent}">${sub}</text>
  ${hexTile(300, 408, 12, p.blob, 0.8)}
  <text x="300" y="560" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="${p.accent}" opacity="0.65">${label} — demo image</text>
</svg>`;
}

function pouchImage(p, label, sub) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="${label} demo placeholder image">
  <rect width="600" height="600" fill="${p.bg}"/>
  ${hexTile(90, 100, 30, p.deep, 0.14)}
  ${hexTile(520, 120, 40, p.blob, 0.2)}
  ${hexTile(540, 510, 34, p.blob, 0.18)}
  ${hexTile(60, 520, 26, p.deep, 0.12)}
  <ellipse cx="300" cy="505" rx="185" ry="24" fill="${p.deep}" opacity="0.12"/>
  <path d="M195 250 Q195 215 230 212 L370 212 Q405 215 405 250 L400 440 Q398 475 360 477 L240 477 Q202 475 200 440 Z" fill="${p.blob}"/>
  <path d="M195 250 Q195 215 230 212 L370 212 Q405 215 405 250 L400 440 Q398 475 360 477 L240 477 Q202 475 200 440 Z" fill="none" stroke="${p.deep}" stroke-width="5"/>
  <path d="M205 250 L395 250" stroke="${p.deep}" stroke-width="4" opacity="0.6"/>
  <rect x="240" y="300" width="120" height="115" rx="6" fill="#FFFDF6"/>
  <text x="300" y="334" text-anchor="middle" font-family="Georgia, serif" font-size="17" font-weight="bold" fill="${p.accent}">Annaadhya</text>
  <text x="300" y="358" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="${p.accent}">${sub}</text>
  ${hexTile(300, 392, 11, p.deep, 0.75)}
  <text x="300" y="560" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="${p.accent}" opacity="0.65">${label} — demo image</text>
</svg>`;
}

/** Hamper demo art — a lidded keepsake trunk with a ribbon, distinct from jars/pouches. */
function hamperImage(p, label, sub) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="${label} demo placeholder image">
  <rect width="600" height="600" fill="${p.bg}"/>
  ${hexTile(90, 100, 32, p.blob, 0.16)}
  ${hexTile(515, 90, 42, p.blob, 0.2)}
  ${hexTile(535, 515, 30, p.deep, 0.14)}
  ${hexTile(65, 515, 36, p.blob, 0.15)}
  <ellipse cx="300" cy="512" rx="195" ry="26" fill="${p.deep}" opacity="0.12"/>
  <rect x="165" y="285" width="270" height="190" rx="14" fill="${p.blob}"/>
  <rect x="165" y="285" width="270" height="190" rx="14" fill="none" stroke="${p.deep}" stroke-width="5"/>
  <path d="M165 320 Q300 250 435 320 L435 285 Q435 262 410 262 L190 262 Q165 262 165 285 Z" fill="${p.deep}"/>
  <rect x="272" y="252" width="56" height="34" rx="7" fill="#E9C46A" stroke="#B07E1F" stroke-width="3"/>
  <rect x="288" y="285" width="24" height="46" rx="6" fill="#E9C46A" stroke="#B07E1F" stroke-width="3"/>
  <rect x="225" y="345" width="150" height="96" rx="7" fill="#FFFDF6"/>
  <text x="300" y="380" text-anchor="middle" font-family="Georgia, serif" font-size="17" font-weight="bold" fill="${p.accent}">Annaadhya</text>
  <text x="300" y="404" text-anchor="middle" font-family="Georgia, serif" font-size="13" fill="${p.accent}">${sub}</text>
  ${hexTile(300, 425, 11, p.blob, 0.75)}
  <path d="M165 430 L435 430" stroke="#E9C46A" stroke-width="6" opacity="0.85"/>
  <text x="300" y="560" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="${p.accent}" opacity="0.65">${label} — demo image</text>
</svg>`;
}

const PRODUCTS = [
  ["annaadhya-royal-shahi-hamper", "gift-boxes", "hamper", "Royal Shahi Hamper"],
  ["annaadhya-utsav-aarambh-hamper", "gift-boxes", "hamper", "Utsav Aarambh Hamper"],
  ["annaadhya-vanamrit-honey", "honey", "jar", "Vanamrit Honey"],
  ["annaadhya-sarson-sugandh-honey", "honey", "jar", "Sarson Sugandh"],
  ["annaadhya-litchi-madhur-honey", "honey", "jar", "Litchi Madhur"],
  ["annaadhya-jamun-van-honey", "honey", "jar", "Jamun Van"],
  ["annaadhya-acacia-amrit-honey", "honey", "jar", "Acacia Amrit"],
  ["annaadhya-eucalyptus-pushp-honey", "honey", "jar", "Eucalyptus Pushp"],
  ["annaadhya-ajwain-pushp-honey", "honey", "jar", "Ajwain Pushp"],
  ["annaadhya-parvat-pushp-honey", "honey", "jar", "Parvat Pushp"],
  ["annaadhya-ber-madhur-honey", "honey", "jar", "Ber Madhur"],
  ["annaadhya-gramya-pushp-honey", "honey", "jar", "Gramya Pushp"],
  ["annaadhya-badam-shakti", "dry-fruits", "pouch", "Badam Shakti"],
  ["annaadhya-kaju-kosh", "dry-fruits", "pouch", "Kaju Kosh"],
  ["annaadhya-pista-ratna", "dry-fruits", "pouch", "Pista Ratna"],
  ["annaadhya-akhrot-amrit", "dry-fruits", "pouch", "Akhrot Amrit"],
  ["annaadhya-kishmish-noor", "dry-fruits", "pouch", "Kishmish Noor"],
  ["annaadhya-khajoor-saanjh", "dry-fruits", "pouch", "Khajoor Saanjh"],
  ["annaadhya-anjeer-kesarika", "dry-fruits", "pouch", "Anjeer Kesarika"],
  ["annaadhya-makhana-manjari", "dry-fruits", "pouch", "Makhana Manjari"],
  ["annaadhya-kesar-shringar", "kesar", "jar", "Kesar Shringar"],
  ["annaadhya-kesar-rajat", "kesar", "jar", "Kesar Rajat"],
];

for (const [slug, palette, kind, label] of PRODUCTS) {
  const p = PALETTES[palette];
  const svg = kind === "jar" ? jarImage(p, label, "Demo pack") : kind === "hamper" ? hamperImage(p, label, "Demo hamper") : pouchImage(p, label, "Demo pack");
  writeFileSync(join(outDir, `${slug}.svg`), svg);
}

writeFileSync(
  join(outDir, "hero.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640" role="img" aria-label="Annaadhya products arrangement">
  <rect width="900" height="640" fill="#F6EEDD"/>
  ${hexTile(110, 110, 52, "#C99A3C", 0.25)}
  ${hexTile(200, 90, 36, "#1E4D3B", 0.15)}
  ${hexTile(780, 140, 60, "#C99A3C", 0.22)}
  ${hexTile(840, 520, 44, "#1E4D3B", 0.12)}
  ${hexTile(90, 540, 38, "#C99A3C", 0.2)}
  <ellipse cx="450" cy="540" rx="300" ry="34" fill="#1E4D3B" opacity="0.1"/>
  <path d="M330 300 Q330 240 375 228 L470 228 Q515 240 515 300 L505 470 Q503 516 455 518 L390 518 Q342 516 340 470 Z" fill="#E4B95B" stroke="#B07E1F" stroke-width="6"/>
  <rect x="360" y="206" width="160" height="30" rx="10" fill="#B07E1F"/>
  <rect x="390" y="320" width="120" height="130" rx="7" fill="#FFFDF6"/>
  <text x="450" y="362" text-anchor="middle" font-family="Georgia, serif" font-size="21" font-weight="bold" fill="#8A5A12">Annaadhya</text>
  <text x="450" y="390" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#8A5A12">Wild honey</text>
  ${hexTile(450, 418, 13, "#E4B95B", 0.9)}
  <path d="M560 330 Q560 295 595 290 L640 290 Q675 295 675 330 L668 480 Q666 512 632 514 L603 514 Q569 512 567 480 Z" fill="#C98A4B" stroke="#8F5A28" stroke-width="5"/>
  <rect x="592" y="370" width="52" height="105" rx="5" fill="#FFFDF6"/>
  <text x="618" y="428" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#6B3E1B" transform="rotate(-90 618 428)">DRY FRUITS</text>
  <circle cx="265" cy="430" r="72" fill="#D97C2B" stroke="#A4531A" stroke-width="5"/>
  <text x="265" y="425" text-anchor="middle" font-family="Georgia, serif" font-size="15" font-weight="bold" fill="#7A3A10">KESAR</text>
  <text x="265" y="447" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#7A3A10">small batch</text>
  <text x="450" y="606" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" fill="#6B6353" opacity="0.6">Annaadhya Products — demo hero image</text>
</svg>`,
);

writeFileSync(
  join(outDir, "placeholder.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="Product image placeholder">
  <rect width="600" height="600" fill="#F3EBDC"/>
  ${hexTile(300, 280, 70, "#C99A3C", 0.4)}
  ${hexTile(300, 280, 46, "#1E4D3B", 0.35)}
  <text x="300" y="420" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" fill="#6B6353">Image coming soon</text>
</svg>`,
);

console.log(`Generated ${PRODUCTS.length + 2} demo images in ${outDir}`);
