import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, '..', 'website', 'public', 'blog');

// Brand colors
const TEAL = '#0d9488';
const TEAL_DARK = '#0a7a70';
const BG = '#0c1222';
const TEXT = '#e2e8f0';
const ACCENT = '#ea6022';

function makeSvg(title, subtitle, iconPath, gradFrom, gradTo) {
  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${gradFrom}"/>
      <stop offset="100%" style="stop-color:${gradTo}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${TEAL}"/>
      <stop offset="100%" style="stop-color:${ACCENT}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <!-- Grid pattern -->
  ${Array.from({length: 20}, (_, i) => `<line x1="${i*60}" y1="0" x2="${i*60}" y2="630" stroke="${TEXT}" stroke-opacity="0.03" stroke-width="1"/>`).join('\n  ')}
  ${Array.from({length: 11}, (_, i) => `<line x1="0" y1="${i*60}" x2="1200" y2="${i*60}" stroke="${TEXT}" stroke-opacity="0.03" stroke-width="1"/>`).join('\n  ')}
  <!-- Accent bar -->
  <rect x="0" y="0" width="1200" height="4" fill="url(#accent)"/>
  <!-- Icon area -->
  ${iconPath}
  <!-- Title -->
  <text x="80" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700" fill="${TEXT}" letter-spacing="-1">
    ${title.length > 40 ? title.slice(0, 40) : title}
  </text>
  ${title.length > 40 ? `<text x="80" y="440" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700" fill="${TEXT}" letter-spacing="-1">${title.slice(40)}</text>` : ''}
  <!-- Subtitle -->
  <text x="80" y="${title.length > 40 ? 490 : 440}" font-family="system-ui, -apple-system, sans-serif" font-size="22" fill="${TEAL}" font-weight="400">
    ${subtitle}
  </text>
  <!-- Author line -->
  <text x="80" y="580" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="${TEXT}" fill-opacity="0.5">
    Alexander Bering · Zensation AI · 2026
  </text>
  <!-- Bottom accent -->
  <rect x="0" y="626" width="1200" height="4" fill="url(#accent)"/>
</svg>`;
}

const covers = [
  {
    file: 'sleep-consolidation.png',
    title: 'Sleep Consolidation',
    subtitle: 'Teaching AI to Dream — Hippocampal Replay for Memory Systems',
    icon: `<circle cx="900" cy="200" r="120" fill="none" stroke="${TEAL}" stroke-width="2" stroke-opacity="0.3"/>
    <circle cx="900" cy="200" r="80" fill="none" stroke="${TEAL}" stroke-width="2" stroke-opacity="0.5"/>
    <circle cx="900" cy="200" r="40" fill="none" stroke="${TEAL}" stroke-width="2" stroke-opacity="0.7"/>
    <circle cx="900" cy="200" r="8" fill="${ACCENT}"/>
    <!-- Moon shape -->
    <path d="M860 140 A80 80 0 0 1 860 260 A60 60 0 0 0 860 140" fill="${TEAL}" fill-opacity="0.15"/>
    <!-- Pulse lines -->
    <path d="M750 200 L810 200 L825 160 L840 240 L855 180 L870 220 L885 200 L1050 200" fill="none" stroke="${TEAL}" stroke-width="2" stroke-opacity="0.4"/>`,
    gradFrom: '#0c1222',
    gradTo: '#0f1a2e',
  },
  {
    file: 'how-we-built-arag.png',
    title: 'How We Built A-RAG',
    subtitle: 'When Retrieval Learns to Think Before Searching',
    icon: `<!-- Search/Plan icon -->
    <circle cx="880" cy="180" r="50" fill="none" stroke="${TEAL}" stroke-width="3" stroke-opacity="0.6"/>
    <line x1="915" y1="215" x2="950" y2="250" stroke="${TEAL}" stroke-width="3" stroke-opacity="0.6"/>
    <!-- Strategy nodes -->
    <circle cx="820" cy="120" r="12" fill="${TEAL}" fill-opacity="0.3" stroke="${TEAL}" stroke-width="1.5"/>
    <circle cx="960" cy="120" r="12" fill="${TEAL}" fill-opacity="0.3" stroke="${TEAL}" stroke-width="1.5"/>
    <circle cx="960" cy="260" r="12" fill="${ACCENT}" fill-opacity="0.3" stroke="${ACCENT}" stroke-width="1.5"/>
    <circle cx="820" cy="260" r="12" fill="${TEAL}" fill-opacity="0.3" stroke="${TEAL}" stroke-width="1.5"/>
    <!-- Connecting lines -->
    <line x1="832" y1="120" x2="868" y2="145" stroke="${TEAL}" stroke-width="1" stroke-opacity="0.3"/>
    <line x1="948" y1="120" x2="912" y2="145" stroke="${TEAL}" stroke-width="1" stroke-opacity="0.3"/>
    <line x1="948" y1="260" x2="925" y2="230" stroke="${ACCENT}" stroke-width="1" stroke-opacity="0.3"/>
    <line x1="832" y1="260" x2="855" y2="230" stroke="${TEAL}" stroke-width="1" stroke-opacity="0.3"/>`,
    gradFrom: '#0c1222',
    gradTo: '#121a30',
  },
  {
    file: 'the-art-of-forgetting.png',
    title: 'The Art of Forgetting',
    subtitle: 'Why Your AI Needs to Learn to Let Go — Ebbinghaus Decay',
    icon: `<!-- Decay curve -->
    <path d="M780 120 C800 120 820 280 1100 290" fill="none" stroke="${ACCENT}" stroke-width="3" stroke-opacity="0.6"/>
    <!-- Dots fading out along curve -->
    <circle cx="790" cy="125" r="6" fill="${TEXT}" fill-opacity="0.9"/>
    <circle cx="820" cy="170" r="6" fill="${TEXT}" fill-opacity="0.7"/>
    <circle cx="860" cy="220" r="5" fill="${TEXT}" fill-opacity="0.5"/>
    <circle cx="920" cy="255" r="4" fill="${TEXT}" fill-opacity="0.3"/>
    <circle cx="1000" cy="275" r="3" fill="${TEXT}" fill-opacity="0.15"/>
    <circle cx="1080" cy="285" r="2" fill="${TEXT}" fill-opacity="0.07"/>
    <!-- Axis lines -->
    <line x1="770" y1="120" x2="770" y2="300" stroke="${TEXT}" stroke-width="1" stroke-opacity="0.15"/>
    <line x1="770" y1="300" x2="1110" y2="300" stroke="${TEXT}" stroke-width="1" stroke-opacity="0.15"/>
    <text x="770" y="315" font-family="system-ui" font-size="11" fill="${TEXT}" fill-opacity="0.3">time →</text>
    <text x="755" y="125" font-family="system-ui" font-size="11" fill="${TEXT}" fill-opacity="0.3" text-anchor="end">R</text>`,
    gradFrom: '#0c1222',
    gradTo: '#1a0f0c',
  },
  {
    file: '7-layer-memory.png',
    title: '7-Layer Memory Architecture',
    subtitle: 'How ZenBrain Remembers Like a Human Brain',
    icon: `<!-- 7 stacked layers -->
    ${['Working', 'Short-Term', 'Episodic', 'Semantic', 'Procedural', 'Core', 'Cross-Ctx'].map((label, i) => {
      const y = 80 + i * 36;
      const opacity = 1 - i * 0.1;
      const width = 260 - i * 10;
      const x = 890 - width/2;
      const fill = i === 0 ? ACCENT : TEAL;
      return `<rect x="${x}" y="${y}" width="${width}" height="28" rx="4" fill="${fill}" fill-opacity="${opacity * 0.2}" stroke="${fill}" stroke-width="1" stroke-opacity="${opacity * 0.5}"/>
      <text x="890" y="${y + 19}" font-family="system-ui" font-size="12" fill="${TEXT}" fill-opacity="${opacity * 0.7}" text-anchor="middle">${label}</text>`;
    }).join('\n    ')}`,
    gradFrom: '#0c1222',
    gradTo: '#0c1a1f',
  },
];

for (const cover of covers) {
  const svg = makeSvg(cover.title, cover.subtitle, cover.icon, cover.gradFrom, cover.gradTo);
  const outPath = join(OUT, cover.file);
  await sharp(Buffer.from(svg)).png({ quality: 90 }).toFile(outPath);
  console.log(`✓ ${cover.file}`);
}

console.log('Done — 4 covers generated');
