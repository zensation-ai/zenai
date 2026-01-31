/**
 * Generate PWA icons from SVG source
 * Run: node scripts/generate-icons.mjs
 */

import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const svgPath = join(projectRoot, 'public', 'zenai-brain.svg');
const outputDir = join(projectRoot, 'public', 'icons');

// Ensure output directory exists
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Read SVG
const svgBuffer = readFileSync(svgPath);

console.log('Generating PWA icons...');

for (const size of sizes) {
  const outputPath = join(outputDir, `icon-${size}x${size}.png`);

  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(outputPath);

  console.log(`  ✓ icon-${size}x${size}.png`);
}

// Generate Apple touch icon (180x180)
await sharp(svgBuffer)
  .resize(180, 180)
  .png()
  .toFile(join(outputDir, 'apple-touch-icon.png'));
console.log('  ✓ apple-touch-icon.png');

// Generate favicon (32x32)
await sharp(svgBuffer)
  .resize(32, 32)
  .png()
  .toFile(join(outputDir, 'favicon-32x32.png'));
console.log('  ✓ favicon-32x32.png');

// Generate favicon (16x16)
await sharp(svgBuffer)
  .resize(16, 16)
  .png()
  .toFile(join(outputDir, 'favicon-16x16.png'));
console.log('  ✓ favicon-16x16.png');

console.log('\nDone! Icons generated in public/icons/');
