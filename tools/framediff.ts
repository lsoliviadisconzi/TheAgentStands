/* Quick determinism test: the engine must render the same frame twice identically.
 *
 * Assumes the backend is running and ENGINE_URL includes ?engine=1.
 * Requires: npm i -D playwright pngjs && npx playwright install chromium
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import * as fs from 'fs';
import * as path from 'path';

const STAGE_SELECTOR = '#stage';
const VIEWPORT = { width: 360, height: 640 };

async function capture(
  url: string,
  times: number[],
  outDir: string,
) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector(STAGE_SELECTOR, { timeout: 15000 });

  // Wait for engine to be ready
  await page.evaluate(
    () =>
      new Promise<void>((res) => {
        const go = () => ((window as any).__stage?.setTime ? res() : setTimeout(go, 50));
        go();
      }),
  );

  for (const t of times) {
    await page.evaluate((ms) => (window as any).__stage.setTime(ms), t);
    await page.waitForTimeout(20);
    const file = path.join(outDir, `frame_${String(t).padStart(6, '0')}.png`);
    await page.locator(STAGE_SELECTOR).screenshot({ path: file });
  }
  await browser.close();
}

function diff(a: Buffer, b: Buffer) {
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
  const engine = process.env.ENGINE_URL;
  if (!engine) {
    console.error('Set ENGINE_URL');
    process.exit(2);
  }

  // Test at just a few key moments
  const times: number[] = [0, 2320, 5000, 10000, 15000];

  console.log('Capturing engine-a...');
  await capture(engine, times, 'frames/engine-a');
  console.log('Capturing engine-b...');
  await capture(engine, times, 'frames/engine-b');
  
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