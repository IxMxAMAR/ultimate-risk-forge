import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PORT = 4317;
const BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SIZES = [[2512, 1398], [1440, 960]];
const PAGES = [['console', '#/case/VT-G24B-KD'], ['report', '#/case/VT-G24B-KD/report'], ['forge', '#/forge']];

const up = () => new Promise(done => {
  const req = get(BASE, res => { res.resume(); done(true); });
  req.on('error', () => done(false));
  req.setTimeout(1000, () => { req.destroy(); done(false); });
});

async function waitForServer() {
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    if (await up()) return;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`preview did not answer on ${BASE} within 30 s`);
}

const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let exited = false;
preview.on('exit', () => { exited = true; });

try {
  await waitForServer();
  if (exited) throw new Error(`port ${PORT} was already in use`);
  mkdirSync('qa-shots', { recursive: true });
  for (const [w, h] of SIZES) {
    for (const [name, hash] of PAGES) {
      const out = resolve(`qa-shots/${name}-${w}x${h}.png`);
      const profile = mkdtempSync(join(tmpdir(), 'rf-qa-'));
      try {
        const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=5000',
          `--window-size=${w},${h}`, `--user-data-dir=${profile}`, `--screenshot=${out}`, BASE + hash], { stdio: 'ignore' });
        if (r.status !== 0) throw new Error(`Chrome failed for ${name} ${w}x${h} (exit ${r.status})`);
      } finally {
        rmSync(profile, { recursive: true, force: true });
      }
      console.log(out);
    }
  }
} finally {
  if (!exited) spawnSync('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' });
}
