import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PORT = 4317;
const BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SIZES = [[2512, 1398], [1440, 960]];
const READY_MS = 20_000;

// A shot is taken only once the app has loaded the store, seeded the starters and drawn the screen (DevTools polling, because IndexedDB is not covered by virtual time).
const STATE = `(() => ({
  cases: document.querySelectorAll('button.case').length,
  flags: document.querySelectorAll('.flags .flag').length,
  paper: document.querySelectorAll('.paper').length,
  dialog: document.querySelectorAll('[role="dialog"]').length,
  rows: document.querySelectorAll('[role="dialog"] .preview .prow').length,
  answers: document.querySelectorAll('.pans').length,
  title: document.title,
}))()`;
const PAGES = [
  ['console', '#/case/VT-G24B-KD', s => s.cases >= 3 && s.flags >= 1],
  ['report', '#/case/VT-G24B-KD/report', s => s.paper > 0],
  ['forge', '#/forge', s => s.dialog > 0 && s.rows > 0],
  ['console-step3', '#/case/VT-G24B-KD', s => s.cases >= 3 && s.flags >= 1 && s.answers >= 1, answerTwoSteps],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

const up = () => new Promise(done => {
  const req = get(BASE, res => { res.resume(); done(true); });
  req.on('error', () => done(false));
  req.setTimeout(1000, () => { req.destroy(); done(false); });
});

async function waitFor(check, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const v = await check(); if (v) return v; } catch { /* not ready yet */ }
    await sleep(250);
  }
  throw new Error(`${what} not ready within ${ms / 1000} s`);
}

// Answers the first two playbook steps with their first answer, then waits for the Card brands step to be current.
async function answerTwoSteps(page) {
  const read = async expression => (await page.send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  const current = () => read(`document.querySelector('.steps6 li.cur')?.textContent ?? ''`);
  for (let i = 0; i < 2; i++) {
    const before = await current();
    await read(`document.querySelector('.pans').click()`);
    await waitFor(async () => (await current()) !== before, 5_000, 'next playbook step');
  }
  await waitFor(async () => (await current()).includes('Card brands'), 5_000, 'Card brands step');
}

const freePort = () => new Promise((ok, fail) => {
  const srv = createServer();
  srv.on('error', fail);
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => ok(port)); });
});

const kill = child => { if (child && child.exitCode === null) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); };

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const waiting = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    const p = waiting.get(m.id);
    if (!p) return;
    waiting.delete(m.id);
    if (m.error) p.fail(new Error(m.error.message)); else p.ok(m.result);
  };
  const opened = new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('DevTools socket failed')); });
  const send = (method, params = {}) => new Promise((ok, fail) => { const n = ++id; waiting.set(n, { ok, fail }); ws.send(JSON.stringify({ id: n, method, params })); });
  return { opened, send, close: () => ws.close() };
}

async function shoot(name, hash, ready, w, h, drive) {
  const out = resolve(`qa-shots/${name}-${w}x${h}.png`);
  const profile = mkdtempSync(join(tmpdir(), 'rf-qa-'));
  const port = await freePort();
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
    `--window-size=${w},${h}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let page;
  try {
    const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'), 15_000, 'Chrome');
    page = connect(target.webSocketDebuggerUrl);
    await page.opened;
    await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url: BASE + hash });
    let last = null;
    const evaluate = async () => (last = (await page.send('Runtime.evaluate', { expression: STATE, returnByValue: true })).result.value);
    try {
      await waitFor(async () => ready(await evaluate()), READY_MS, `${name} ${w}x${h}`);
    } catch (e) {
      throw new Error(`${e.message}; last state ${JSON.stringify(last)}`);
    }
    if (drive) await drive(page);
    await sleep(300);
    const state = await evaluate();
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log(`${out}  case rows ${state.cases}, flag cards ${state.flags}, .paper ${state.paper > 0}, dialog ${state.dialog > 0} (${state.rows} preview rows)`);
  } finally {
    page?.close();
    kill(chrome);
    await sleep(300);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  await waitFor(up, 30_000, `preview on ${BASE}`);
  if (preview.exitCode !== null) throw new Error(`port ${PORT} was already in use`);
  mkdirSync('qa-shots', { recursive: true });
  for (const [w, h] of SIZES) for (const [name, hash, ready, drive] of PAGES) await shoot(name, hash, ready, w, h, drive);
} finally {
  kill(preview);
}
