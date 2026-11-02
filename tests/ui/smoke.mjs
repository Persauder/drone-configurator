import assert from 'node:assert/strict';
import test from 'node:test';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'vite';

for (const [name, page] of [
  ['configuration controls, summary and validation statuses', 'index.html'],
  ['GLB switching, caching, async races, controls, resize and fallback', 'model-loading.html'],
  ['Small Quad frame mapping, anchors, caching and async races', 'small-quad.html'],
  ['Aster 450 modular motors and assembly playback', 'assembly.html'],
  ['Aster 450 automatic selection animations', 'selection-animation.html'],
  ['Aster 450 modular propeller installation', 'propeller-selection.html'],
  ['Aster 450 modular ESC installation', 'esc-selection.html'],
]) {
test(`real browser: ${name}`, { timeout: ['assembly.html', 'selection-animation.html', 'propeller-selection.html', 'esc-selection.html'].includes(page) ? 90000 : 45000 }, async () => {
  const candidates = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  let browser;
  for (const candidate of candidates) {
    try { await access(candidate); browser = candidate; break; } catch { /* Try the next installed browser. */ }
  }
  assert.ok(browser, 'Chrome/Edge/Chromium not found; set CHROME_PATH to its executable.');
  const profile = await mkdtemp(join(tmpdir(), 'drone-ui-smoke-'));
  const server = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, open: false },
    logLevel: 'error',
  });
  try {
    await server.listen();
    const address = server.httpServer.address();
    const { stdout } = await promisify(execFile)(browser, [
      '--headless=new', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-component-update',
      '--enable-unsafe-swiftshader', '--window-size=1440,1100',
      '--run-all-compositor-stages-before-draw', '--disable-renderer-backgrounding',
      `--user-data-dir=${profile}`, '--dump-dom',
      `--timeout=${['assembly.html', 'selection-animation.html', 'propeller-selection.html', 'esc-selection.html'].includes(page) ? 70000 : 15000}`,
      `--virtual-time-budget=${page === 'assembly.html' ? 50000 : ['selection-animation.html', 'propeller-selection.html', 'esc-selection.html'].includes(page) ? 15000 : 5000}`,
      `http://127.0.0.1:${address.port}/tests/ui/${page}`,
    ], { windowsHide: true, timeout: ['assembly.html', 'selection-animation.html', 'propeller-selection.html', 'esc-selection.html'].includes(page) ? 80000 : 30000, maxBuffer: 2 * 1024 * 1024 });
    const result = stdout.match(/<pre id="smoke-result">([\s\S]*?)<\/pre>/)?.[1];
    assert.ok(result?.startsWith('PASS:'), result ?? 'Browser did not return a smoke-test result.');
    console.log(result);
  } finally {
    await server.close();
    const resolvedProfile = resolve(profile);
    assert.ok(resolvedProfile.startsWith(resolve(tmpdir()) + sep)
      && basename(resolvedProfile).startsWith('drone-ui-smoke-'));
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
}
