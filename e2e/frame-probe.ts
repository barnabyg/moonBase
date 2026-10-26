// DIAGNOSTIC ONLY: records animation-frame gaps and visibility changes.
import { test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __probe: { gaps: number[]; vis: string[]; start: number } };
    w.__probe = { gaps: [], vis: [], start: performance.now() };
    let last: number | undefined;
    const f = (now: number) => {
      if (last !== undefined) w.__probe.gaps.push(now - last);
      last = now;
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    let lastTick = performance.now();
    (w.__probe as unknown as { timer: number[] }).timer = [];
    setInterval(() => { const n = performance.now(); (w.__probe as unknown as { timer: number[] }).timer.push(n - lastTick); lastTick = n; }, 50);
    document.addEventListener("visibilitychange", () => {
      w.__probe.vis.push(`${document.visibilityState}@${Math.round(performance.now())}`);
    });
  });
});

test.afterEach(async ({ page }, info) => {
  const s = await page.evaluate(() => {
    const p = (window as unknown as { __probe?: { gaps: number[]; vis: string[]; start: number } }).__probe;
    if (!p) return "no probe";
    const g = [...p.gaps].sort((a, b) => a - b);
    const total = p.gaps.reduce((a, b) => a + b, 0);
    const slow = p.gaps.filter((x) => x > 250);
    // Per-2s window frame counts, to see when frames stalled.
    const buckets: number[] = [];
    let t = 0;
    for (const x of p.gaps) { t += x; const b = Math.floor(t / 2000); buckets[b] = (buckets[b] ?? 0) + 1; }
    const tm = ((p as unknown as { timer: number[] }).timer ?? []); const tmax = Math.max(...tm); const tslow = tm.filter((x) => x > 250);
    return `timerMax=${tmax.toFixed(0)}ms timer>250ms:${tslow.length} (${(tslow.reduce((a, b) => a + b, 0) / 1000).toFixed(1)}s) frames=${p.gaps.length} span=${(total / 1000).toFixed(1)}s median=${g[Math.floor(g.length / 2)]?.toFixed(0)}ms max=${g.at(-1)?.toFixed(0)}ms >250ms:${slow.length} (${(slow.reduce((a, b) => a + b, 0) / 1000).toFixed(1)}s) vis=[${p.vis.join(",")}] per2s=[${Array.from(buckets, (x) => x ?? 0).join(",")}] visible=${document.visibilityState} focus=${document.hasFocus()}`;
  }).catch((e: unknown) => `probe failed: ${String(e)}`);
  console.log(`PROBE w${info.workerIndex} ${info.title.slice(0, 40)} (${(info.duration / 1000).toFixed(1)}s): ${s}`);
});
