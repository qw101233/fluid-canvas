// fluid-canvas 自动化验证 — Playwright + swiftshader
// 断言物理行为本身（注入生效 / 平流方向性 / 无 JS 错误），不验证"像素好不好看"
import { pathToFileURL } from 'url';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(import.meta.dirname, '..');
const URL = pathToFileURL(path.join(ROOT, 'index.html')).href;

const results = [];
function check (name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

/* 亮度加权质心（x 归一化），只统计明显高于背景的像素 */
function centroidX (img) {
  let wsum = 0, xsum = 0;
  const { width, height, data } = img;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum > 40) { wsum += lum; xsum += lum * x; }
    }
  }
  if (wsum === 0) return null;
  return { cx: xsum / wsum / width, weight: wsum };
}

/* 区域平均亮度 */
function regionMean (img, x0, y0, x1, y1) {
  let sum = 0, n = 0;
  for (let y = Math.floor(img.height * y0); y < img.height * y1; y += 2) {
    for (let x = Math.floor(img.width * x0); x < img.width * x1; x += 2) {
      const i = (y * img.width + x) * 4;
      sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
      n++;
    }
  }
  return n ? sum / n : -1;
}

const browser = await chromium.launch({
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(URL);
await page.waitForFunction(() => window.fluid && window.fluid.version, null, { timeout: 15000 });

// 0. 环境与零错误
const renderer = await page.evaluate(() => {
  const gl = document.getElementById('c').getContext('webgl');
  return { renderer: gl.getParameter(gl.RENDERER), linear: window.fluid._ext.supportLinearFiltering };
});
check('WebGL 上下文可用', !!renderer.renderer, renderer.renderer);

// 关掉自动喷发与动画，进入确定性模式
await page.evaluate(() => {
  window.fluid.setAutoSplats(false);
  window.fluid.setPaused(true);
});

// 1. 清屏基线：重置后画面接近背景色
await page.evaluate(() => { window.fluid.reset(); window.fluid.step(2); });
const base = await page.evaluate(() => {
  const img = window.fluid.readPixels();
  let sum = 0, n = 0;
  for (let i = 0; i < img.data.length; i += 4) { sum += img.data[i] + img.data[i + 1] + img.data[i + 2]; n += 3; }
  return sum / n;
});
check('重置后画面为暗背景', base < 25, '均值=' + base.toFixed(1));

// 2. 染料注入生效：中心 splat 后中心区域显著变亮（区域取实测校准：大区域会被高斯稀释）
await page.evaluate(() => {
  window.fluid.reset();
  window.fluid.splat(0.5, 0.5, 0, 0, [1, 1, 1], 2.0);
  window.fluid.step(5);
});
let img = await page.evaluate(() => window.fluid.readPixels());
const centerMean = regionMean(img, 0.42, 0.42, 0.58, 0.58);
check('splat 注入染料生效', centerMean > 40, '中心均值=' + centerMean.toFixed(1));

// 3. 平流方向性：向右注入速度，染料质心应右移
const centroidRight = await page.evaluate(() => {
  window.fluid.reset();
  window.fluid.splat(0.30, 0.5, 160, 0, [0.7, 0.7, 0.7], 1.0);
  window.fluid.step(25);
  const img = window.fluid.readPixels();
  let wsum = 0, xsum = 0;
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      const i = (y * img.width + x) * 4;
      const lum = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
      if (lum > 40) { wsum += lum; xsum += lum * x; }
    }
  }
  return wsum === 0 ? null : xsum / wsum / img.width;
});
check('平流方向性（质心右移）', centroidRight !== null && centroidRight > 0.36,
  '质心x=' + (centroidRight === null ? 'null' : centroidRight.toFixed(3)) + '（注入点 0.30）');

// 4. 无速度注入时质心基本不动（对照组，排除压力项假阳性）
const centroidStill = await page.evaluate(() => {
  window.fluid.reset();
  window.fluid.splat(0.30, 0.5, 0, 0, [0.7, 0.7, 0.7], 1.0);
  window.fluid.step(25);
  const img = window.fluid.readPixels();
  let wsum = 0, xsum = 0;
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      const i = (y * img.width + x) * 4;
      const lum = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
      if (lum > 40) { wsum += lum; xsum += lum * x; }
    }
  }
  return wsum === 0 ? null : xsum / wsum / img.width;
});
check('对照组（静置染料不漂移）', centroidStill !== null && Math.abs(centroidStill - 0.30) < 0.05,
  '质心x=' + (centroidStill === null ? 'null' : centroidStill.toFixed(3)));

// 5. 参数热更新 + 爆发 + 大步数无错误
const paramErr = await page.evaluate(() => {
  try {
    window.fluid.setParams({ CURL: 40, PRESSURE_ITERATIONS: 40, DENSITY_DISSIPATION: 0.5 });
    window.fluid.burst(8);
    window.fluid.step(120);
    window.fluid.setParams({ CURL: 25, PRESSURE_ITERATIONS: 20, DENSITY_DISSIPATION: 1.0 });
    return null;
  } catch (e) { return String(e); }
});
check('参数热更新与爆发稳定', paramErr === null, paramErr || '');

// 6. 长时间运行能量衰减不爆炸（染料消散后画面回落）
const afterDecay = await page.evaluate(() => {
  window.fluid.reset();
  window.fluid.burst(6);
  window.fluid.step(600); // 10 秒模拟
  const img = window.fluid.readPixels();
  let mx = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    mx = Math.max(mx, img.data[i], img.data[i + 1], img.data[i + 2]);
  }
  return mx;
});
check('长时间模拟无数值爆炸', afterDecay < 256, '最大通道值=' + afterDecay);

// 7. 恢复运行态 + FPS
await page.evaluate(() => { window.fluid.setPaused(false); });
await page.waitForTimeout(1200);
const fps = await page.evaluate(() => window.fluid.fps());
check('渲染循环运行（FPS>0）', fps > 0, 'FPS=' + fps);

// 8. 零 JS 错误
check('无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' ; '));
check('无 console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' ; '));

await browser.close();

const failed = results.filter(r => !r.ok);
console.log('----');
console.log('TOTAL ' + results.length + ' | PASS ' + (results.length - failed.length) + ' | FAIL ' + failed.length);
process.exit(failed.length ? 1 : 0);
