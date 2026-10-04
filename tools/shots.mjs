// fluid-canvas 演示截图生成 — 用 window.fluid API 驱动三组经典场景
import { pathToFileURL } from 'url';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(import.meta.dirname, '..');
const URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const OUT = path.join(ROOT, 'screenshots');

const browser = await chromium.launch({
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
await page.goto(URL);
await page.waitForFunction(() => window.fluid);

// 统一前置：关自动喷发、暂停动画，全部用确定性 step
await page.evaluate(() => {
  window.fluid.setAutoSplats(false);
  window.fluid.setPaused(true);
});

async function shot (name) {
  await page.evaluate(() => window.fluid.step(1)); // 触发一次 render
  await page.locator('#c').screenshot({ path: path.join(OUT, name) });
  console.log('saved', name);
}

/* 场景 1：墨滴绽放 — 中心多层彩色 splat，涡量撕出细丝 */
await page.evaluate(() => {
  const f = window.fluid;
  f.reset();
  f.setParams({ CURL: 30, DENSITY_DISSIPATION: 0.2, SPLAT_RADIUS: 0.3 });
  const cols = [[0.05, 0.55, 0.95], [0.95, 0.35, 0.10], [0.10, 0.85, 0.55]];
  const angs = [0, 2.1, 4.2];
  for (let ring = 0; ring < 3; ring++) {
    for (let i = 0; i < 3; i++) {
      const a = angs[i] + ring * 0.7;
      const r = 0.06 + ring * 0.10;
      f.splat(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r,
        Math.cos(a + 1.5) * 300, Math.sin(a + 1.5) * 300,
        cols[i].map(c => c * (1 - ring * 0.25)), 1.2 - ring * 0.3);
    }
  }
  f.step(160);
});
await shot('demo-bloom.png');

/* 场景 2：涡街 — 一排向右射流 + 上下扰动，涡量卷出漩涡链 */
await page.evaluate(() => {
  const f = window.fluid;
  f.reset();
  f.setParams({ CURL: 30, DENSITY_DISSIPATION: 0.12, SPLAT_RADIUS: 0.25 });
  for (let i = 0; i < 5; i++) {
    const x = 0.16 + i * 0.055;
    const y = 0.5 + (i % 2 === 0 ? 0.06 : -0.06);
    f.splat(x, y, 320, (i % 2 === 0 ? 1 : -1) * 90, [0.05, 0.6, 0.95], 1.0);
    f.splat(x, y + 0.10, 260, (i % 2 === 0 ? -1 : 1) * 110, [0.55, 0.15, 0.85], 0.9);
  }
  f.step(150);
});
await shot('demo-vortex.png');

/* 场景 3：流带 — 沿正弦轨迹的连续喷洒 */
await page.evaluate(() => {
  const f = window.fluid;
  f.reset();
  f.setParams({ CURL: 18, DENSITY_DISSIPATION: 0.25, SPLAT_RADIUS: 0.22 });
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const x = 0.12 + t * 0.76;
    const y = 0.5 + Math.sin(t * Math.PI * 2.2 + 0.6) * 0.22;
    const dx = 130, dy = Math.cos(t * Math.PI * 2.2 + 0.6) * 80;
    const hue = t;
    const col = hsv(hue, 0.9, 1.0);
    f.splat(x, y, dx, dy, col, 0.9);
  }
  f.step(90);
  function hsv (h, s, v) {
    const i = Math.floor(h * 6), f2 = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f2 * s), t2 = v * (1 - (1 - f2) * s);
    const c = [[v, t2, p], [q, v, p], [p, v, t2], [p, q, v], [t2, p, v], [v, p, q]][i % 6];
    return c.map(x => x * 0.55);
  }
});
await shot('demo-ribbon.png');

/* 场景 4：交互全景 — 打开面板 + 模拟拖拽笔触 */
await page.evaluate(() => {
  const f = window.fluid;
  f.reset();
  f.setParams({ CURL: 26, DENSITY_DISSIPATION: 0.3, SPLAT_RADIUS: 0.25 });
  // 两条手工"笔触"（模拟 pointer 拖动的连续 splat）
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    f.splat(0.2 + t * 0.45, 0.68 - t * 0.25 + Math.sin(t * 6) * 0.04,
      200, -50, [0.30, 1.10, 1.90], 1.0);
  }
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    f.splat(0.30 + t * 0.45, 0.30 + t * 0.16 + Math.sin(t * 5 + 2) * 0.04,
      190, 60, [1.80, 0.55, 0.25], 1.0);
  }
  f.step(70);
});
await shot('demo-paint.png');

/* 场景 5：界面全景（含控制面板）*/
await page.evaluate(() => {
  const f = window.fluid;
  f.setPaused(false); // 恢复动态，让画面自然
});
await page.locator('body').screenshot({ path: path.join(OUT, 'demo-ui.png') });
console.log('saved demo-ui.png');

await browser.close();
console.log('ALL DONE');
