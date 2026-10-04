import { pathToFileURL } from 'url';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'deliverables');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });

for (const n of [1, 2, 3]) {
  const url = pathToFileURL(path.join(ROOT, 'slides', `slide${n}.html`)).href;
  await page.goto(url);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `slide${n}.png`) });
  // 溢出检测：量最后一个子元素的 bottom（scrollHeight 检测不到 absolute 元素）
  const info = await page.evaluate(() => {
    let maxBottom = 0;
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > maxBottom) maxBottom = r.bottom;
    }
    return { maxBottom, bodyH: document.body.clientHeight };
  });
  console.log(`slide${n}: maxBottom=${Math.round(info.maxBottom)} / ${info.bodyH}`, info.maxBottom > info.bodyH ? '⚠️ OVERFLOW' : 'OK');
}
await browser.close();
console.log('DONE');
