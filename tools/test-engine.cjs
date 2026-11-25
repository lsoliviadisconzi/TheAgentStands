const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const STAGE_SELECTOR = '#stage';
const VIEWPORT = { width: 360, height: 640 };
const ENGINE_URL = 'http://localhost:4000/api/reels/rmwu567iif8e/player?mode=preview&engine=1';

async function capture(url, times, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector(STAGE_SELECTOR, { timeout: 15000 });

  // Wait for engine to be ready
  await page.evaluate(
    () =>
      new Promise((res) => {
        const go = () => ((window.__stage?.setTime ? res() : setTimeout(go, 50)));
        go();
      }),
  );

  for (const t of times) {
    await page.evaluate((ms) => window.__stage.setTime(ms), t);
    await page.waitForTimeout(20);
    const file = path.join(outDir, `frame_${String(t).padStart(6, '0')}.png`);
    await page.locator(STAGE_SELECTOR).screenshot({ path: file });
  }
  await browser.close();
}

function diff(a, b) {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  const total = pa.width * pa.height;
  let bad = 0;
  let max = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    const d = Math.max(
      Math.abs(pa.data[i] - pb.data[i]),
      Math.abs(pa.data[i + 1] - pb.data[i + 1]),
      Math.abs(pa.data[i + 2] - pb.data[i + 2]),
    );
    if (d > max) max = d;
    if (d > 8) bad++;
  }
  return { pct: bad / total, max };
}

async function main() {
  const times = [0, 2320, 5000, 10000, 15000];

  console.log('Capturing engine-a...');
  await capture(ENGINE_URL, times, 'frames/engine-a');
  console.log('Capturing engine-b...');
  await capture(ENGINE_URL, times, 'frames/engine-b');
  
  let worstDet = 0;
  for (const t of times) {
    const f = `frame_${String(t).padStart(6, '0')}.png`;
    const d = diff(
      fs.readFileSync(path.join('frames/engine-a', f)),
      fs.readFileSync(path.join('frames/engine-b', f)),
    );
    worstDet = Math.max(worstDet, d.pct);
    console.log(`  t=${t}ms: diff=${(d.pct * 100).toFixed(4)}% maxChannel=${d.max}`);
  }
  console.log(`Determinism: worst diff ${(worstDet * 100).toFixed(4)}%`);

  if (worstDet > 0) {
    console.error('FAIL: engine is not deterministic');
    process.exit(1);
  }
  console.log('PASS (determinism).');
}

main().catch((e) => { console.error(e); process.exit(1); });
