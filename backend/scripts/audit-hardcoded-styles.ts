import * as fs from 'fs';
import * as path from 'path';

const FRONTEND_DIR = path.join(__dirname, '../../frontend/src');
const EXCLUDED_DIRS = ['design-system', 'node_modules', '__tests__'];

interface Finding {
  file: string;
  line: number;
  value: string;
  type: 'hex' | 'rgb' | 'rgba' | 'opacity' | 'font-size';
}

const PATTERNS = [
  { type: 'hex' as const, regex: /#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g },
  { type: 'rgba' as const, regex: /rgba?\([^)]+\)/g },
  { type: 'opacity' as const, regex: /opacity:\s*0\.\d+/g },
];

function scanFile(filePath: string): Finding[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const findings: Finding[] = [];
  const relPath = path.relative(FRONTEND_DIR, filePath);

  lines.forEach((line, i) => {
    // Skip CSS variable definitions and references
    if (line.includes('var(--') || line.includes('--')) return;
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;

    for (const { type, regex } of PATTERNS) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(line)) !== null) {
        findings.push({ file: relPath, line: i + 1, value: match[0], type });
      }
    }
  });

  return findings;
}

function walkDir(dir: string, ext: string[]): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath, ext));
    } else if (ext.some(e => entry.name.endsWith(e))) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = walkDir(FRONTEND_DIR, ['.tsx', '.css']);
const allFindings: Finding[] = [];
for (const file of files) {
  allFindings.push(...scanFile(file));
}

console.log(JSON.stringify({
  totalFiles: files.length,
  totalFindings: allFindings.length,
  findings: allFindings.slice(0, 50), // First 50 for readability
}, null, 2));
