import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = ['www.w3.org', 'react.dev/errors', 'reactjs.org'];
const PATTERNS = [
  [/https?:\/\/[^\s"'`)<>\\]+/g, url => !ALLOWED.some(a => url.includes(`//${a}`))],
  [/<link\b[^>]*\bhref\s*=\s*["']?https?:/gi, () => true],
  [/@import\s+url\(\s*["']?https?:/gi, () => true],
];

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const path = join(dir, e.name);
  return e.isDirectory() ? files(path) : /\.(html|js|css)$/.test(e.name) ? [path] : [];
});

const bad = [];
for (const file of files('dist')) {
  const text = readFileSync(file, 'utf8');
  for (const [re, isBad] of PATTERNS) {
    for (const m of text.matchAll(re)) if (isBad(m[0])) bad.push(`${file}: ${m[0]}`);
  }
}

if (bad.length > 0) {
  console.error(`Remote references found in dist:\n${bad.join('\n')}`);
  process.exit(1);
}
console.log('check:offline OK: dist has no remote references');
