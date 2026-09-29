#!/usr/bin/env node
// Headless shots, videos and frame sheets for PR proof. Run with no args for usage.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const USAGE = `usage:
  capture.mjs shot <base-url> <paths...> [--width 1440,390] [--scheme light,dark] [--height 800]
      [--out DIR] [--name NAME] [--tag before|after] [--scroll] [--reduced-motion]
      [--wait-for SELECTOR] [--storage state.json] [--mask TEXT]...
  capture.mjs record <base-url> <steps.json> [--width 1280] [--height 800] [--scheme light]
      [--fps 15] [--out DIR] [--name NAME] [--storage state.json] [--mask TEXT]...
  capture.mjs login <base-url> --storage state.json [--path /login]   (reads QA_EMAIL, QA_PASSWORD)
  capture.mjs sheet <video> [out.png]    (up to 16 frames in a 4x4 grid, to read before upload)

files: <name|slug>-<width>-<scheme>.png, with "<tag>-" in front when --tag is set.
steps.json: {"steps":[{"do":"goto","path":"/"},{"do":"scroll","by":600},{"do":"wait","for":800},
  {"do":"click","target":"text=Save"},{"do":"type","target":"input","text":"hi"},{"do":"press","key":"Enter"},
  {"do":"hover","target":"nav a"}]}  targets are playwright selectors, "wait" takes ms or a selector.
always masked: git user.email and your home dir. exit 2 means the leak scan or a redirect needs a look.`;

const DEPS = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'visual-qa');
const GIF_CAP = 10 * 1024 * 1024;
const STAND_IN_EMAIL = 'dev@example.com';
const HIDE_DEV_UI = 'nextjs-portal, vite-error-overlay { display: none !important; }';
const LEAKS = [
  /[\w.+-]+@(?!example\.(?:com|org))[\w-]+\.[\w.-]+/g,
  /\/(?:Users|home)\/[\w.-]+/g,
  /\b(?:sk-[\w-]{20,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|sb_secret_\w+|xox[abpr]-[\w-]{10,}|AKIA[0-9A-Z]{16})\b/g,
  /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+/g,
];

const { values: opt, positionals: [cmd, ...args] } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: 'string' },
    height: { type: 'string', default: '800' },
    scheme: { type: 'string' },
    fps: { type: 'string', default: '15' },
    out: { type: 'string', default: 'qa-out' },
    name: { type: 'string' },
    tag: { type: 'string' },
    scroll: { type: 'boolean' },
    'reduced-motion': { type: 'boolean' },
    'wait-for': { type: 'string' },
    storage: { type: 'string' },
    mask: { type: 'string', multiple: true, default: [] },
    path: { type: 'string', default: '/login' },
  },
});

const die = msg => {
  console.error(msg);
  process.exit(1);
};
const list = v => v.split(',').map(s => s.trim()).filter(Boolean);
const slug = p => p.split('?')[0].split('/').filter(Boolean).join('-') || 'home';
const mb = f => `${(statSync(f).size / 1048576).toFixed(1)} MB`;
const run = (bin, argv) => {
  const r = spawnSync(bin, argv, { encoding: 'utf8' });
  if (r.status !== 0) die(`${bin} ${argv.join(' ')} failed\n${r.stderr}`);
  return r.stdout.trim();
};

// Deps live in a cache dir, not the skill dir, so skill syncs never copy node_modules.
async function chromium() {
  const req = createRequire(join(DEPS, 'package.json'));
  let pw;
  try {
    pw = req('playwright-core');
  } catch {
    mkdirSync(DEPS, { recursive: true });
    if (!existsSync(join(DEPS, 'package.json'))) writeFileSync(join(DEPS, 'package.json'), '{"private":true}\n');
    console.error(`installing playwright-core into ${DEPS}`);
    run('npm', ['install', '--prefix', DEPS, '--silent', '--no-audit', '--no-fund', 'playwright-core@1']);
    pw = req('playwright-core');
  }
  try {
    return await pw.chromium.launch({ channel: 'chrome' });
  } catch {
    return pw.chromium.launch().catch(() => die('no Chrome found. Fix: install Google Chrome, or run npx playwright-core install chromium'));
  }
}

function masks() {
  const git = spawnSync('git', ['config', 'user.email'], { encoding: 'utf8' }).stdout.trim();
  return [...new Set([...opt.mask, git, homedir()].filter(Boolean))].map(from => ({
    to: from.includes('@') ? STAND_IN_EMAIL : from === homedir() ? '~' : 'redacted',
    re: new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('@', '(?:@|%40)'), 'gi'),
  }));
}

// Swapping on the wire keeps server html and client hydration in step, so nothing flashes the real value.
async function newContext(browser, { width, height, scheme, video }) {
  const context = await browser.newContext({
    colorScheme: scheme,
    reducedMotion: opt['reduced-motion'] ? 'reduce' : 'no-preference',
    storageState: opt.storage,
    viewport: { width, height },
    ...(video && { recordVideo: { dir: opt.out, size: { width, height } } }),
  });
  await context.addInitScript(`document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style'); s.textContent = ${JSON.stringify(HIDE_DEV_UI)}; document.head.append(s);
  });`);
  const rules = masks();
  await context.route('**/*', async route => {
    if (!['document', 'fetch', 'xhr'].includes(route.request().resourceType())) return route.fallback();
    const response = await route.fetch().catch(() => null);
    if (!response) return route.abort();
    const headers = response.headers();
    if (!/text|json|x-component/.test(headers['content-type'] ?? '')) return route.fulfill({ response });
    delete headers['content-length'];
    delete headers['content-encoding'];
    const body = rules.reduce((text, { re, to }) => text.replace(re, to), await response.text());
    return route.fulfill({ body, headers, response });
  });
  return context;
}

async function scan(page, label, found) {
  const text = await page.evaluate(() => document.body?.innerText ?? '');
  for (const re of LEAKS) for (const [hit] of text.matchAll(re)) found.add(`${label}: ${hit}`);
}

async function scrollThrough(page, height) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let top = 0; top < total; top += Math.floor(height * 0.8)) {
    await page.evaluate(y => scrollTo(0, y), top);
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(600);
}

function report(found) {
  if (!found.size) return;
  console.error(`\nCHECK BEFORE UPLOAD (leak scan and redirects):\n${[...found].map(f => `  ${f}`).join('\n')}`);
  process.exitCode = 2;
}

async function shot([base, ...paths]) {
  if (!base || !paths.length) die(USAGE);
  const widths = list(opt.width ?? '1440,390').map(Number);
  const schemes = list(opt.scheme ?? 'light,dark');
  const height = Number(opt.height);
  const nameFor = p => [opt.tag, opt.name && paths.length > 1 ? `${opt.name}-${slug(p)}` : (opt.name ?? slug(p))].filter(Boolean).join('-');
  mkdirSync(opt.out, { recursive: true });
  const browser = await chromium();
  const found = new Set();
  try {
    const jobs = paths.flatMap(p => widths.flatMap(width => schemes.map(scheme => ({ p, width, scheme }))));
    const lines = await Promise.all(
      jobs.map(async ({ p, width, scheme }) => {
        const context = await newContext(browser, { width, height, scheme });
        const page = await context.newPage();
        const res = await page.goto(new URL(p, base).href, { waitUntil: 'networkidle' });
        const landed = new URL(page.url()).pathname;
        if (landed !== new URL(p, base).pathname) found.add(`${p} redirected to ${landed}, sign in with login + --storage?`);
        if (opt['wait-for']) await page.waitForSelector(opt['wait-for']);
        if (opt.scroll) await scrollThrough(page, height);
        const file = join(opt.out, `${nameFor(p)}-${width}-${scheme}.png`);
        await page.screenshot({ fullPage: true, path: file });
        await scan(page, basename(file), found);
        await context.close();
        return `${res?.status() ?? '???'} ${file}`;
      }),
    );
    lines.forEach(l => console.log(l));
  } finally {
    await browser.close();
  }
  report(found);
}

async function step(page, base, s) {
  const at = t => page.locator(t).first();
  switch (s.do) {
    case 'goto': return page.goto(new URL(s.path, base).href, { waitUntil: 'networkidle' });
    case 'click': return at(s.target).click();
    case 'type': return s.target ? at(s.target).pressSequentially(s.text, { delay: s.delay ?? 45 }) : page.keyboard.type(s.text, { delay: s.delay ?? 45 });
    case 'press': return page.keyboard.press(s.key);
    case 'scroll': return page.mouse.wheel(0, s.by);
    case 'hover': return at(s.target).hover();
    case 'wait': return typeof s.for === 'number' ? page.waitForTimeout(s.for) : at(s.for).waitFor();
    default: throw new Error(`unknown step ${JSON.stringify(s)}`);
  }
}

async function record([base, script]) {
  if (!base || !script) die(USAGE);
  const { steps } = JSON.parse(readFileSync(script, 'utf8'));
  if (steps?.[0]?.do !== 'goto') die(`${script}: the first step must be a goto`);
  const width = Number(opt.width ?? 1280);
  const height = Number(opt.height);
  const fps = Number(opt.fps);
  const name = opt.name ?? basename(script, extname(script));
  const out = n => join(opt.out, `${name}.${n}`);
  mkdirSync(opt.out, { recursive: true });
  const browser = await chromium();
  const found = new Set();
  let lead = 0;
  try {
    const context = await newContext(browser, { width, height, scheme: opt.scheme ?? 'light', video: true });
    const page = await context.newPage();
    const opened = Date.now();
    const video = page.video();
    try {
      await step(page, base, steps[0]);
      const paint = await page.evaluate(() => performance.getEntriesByName('first-paint')[0]?.startTime + performance.timeOrigin);
      lead = Math.max(0, (paint || Date.now()) - opened) / 1000;
      for (const [i, s] of steps.slice(1).entries()) {
        await step(page, base, s);
        await scan(page, `${name} step ${i + 2}`, found);
      }
    } finally {
      await context.close();
      await video.saveAs(out('webm'));
      await video.delete();
    }
  } finally {
    await browser.close();
  }
  const q = ['-y', '-hide_banner', '-loglevel', 'error', '-ss', lead.toFixed(2), '-i', out('webm')];
  run('ffmpeg', [...q, '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-movflags', '+faststart', out('mp4')]);
  const top = Math.min(width, 960);
  for (const [scale, rate] of [[1, fps], [0.8, 12], [0.65, 10], [0.5, 8]]) {
    const w = Math.round((top * scale) / 2) * 2;
    const vf = `fps=${Math.min(fps, rate)},scale=${w}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
    run('ffmpeg', [...q, '-vf', vf, '-loop', '0', out('gif')]);
    if (statSync(out('gif')).size < GIF_CAP) break;
  }
  ['webm', 'mp4', 'gif'].forEach(ext => console.log(`${out(ext)} ${mb(out(ext))}`));
  if (statSync(out('gif')).size >= GIF_CAP) {
    console.error('gif is over 10 MB even at the smallest rung, GitHub will not show it. shorten the steps');
    process.exitCode = 1;
  }
  report(found);
}

async function login([base]) {
  const { QA_EMAIL: email, QA_PASSWORD: password } = process.env;
  if (!base || !opt.storage || !email || !password) die('login needs <base-url>, --storage and QA_EMAIL / QA_PASSWORD in the env');
  const browser = await chromium();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(new URL(opt.path, base).href);
    await page.locator('input[type=email], input[name=email], input[name=username]').first().fill(email);
    await page.locator('input[type=password]').first().fill(password);
    await page.locator('button[type=submit], input[type=submit]').first().click();
    await page.waitForURL(u => u.pathname !== opt.path, { timeout: 15000 }).catch(() => die(`sign in did not leave ${opt.path}`));
    await context.storageState({ path: opt.storage });
    console.log(`signed in, state in ${opt.storage}`);
  } finally {
    await browser.close();
  }
}

function sheet([video, target]) {
  if (!video) die(USAGE);
  const seconds = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video])) || 1;
  const file = target ?? video.replace(/\.\w+$/, '-sheet.png');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-vf', `fps=${Math.min(2, 16 / seconds).toFixed(3)},scale=480:-1,tile=4x4`, '-frames:v', '1', file]);
  console.log(resolve(file));
}

const commands = { shot, record, login, sheet };
if (!commands[cmd]) die(USAGE);
await commands[cmd](args);
