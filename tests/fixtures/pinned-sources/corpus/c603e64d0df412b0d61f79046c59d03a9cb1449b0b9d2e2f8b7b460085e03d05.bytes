import { chromium } from '/app/node_modules/playwright/index.mjs';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { portableName } from './portable-path.mjs';

const artifact = process.env.PERF_ARTIFACT || `${process.cwd()}/dist/${portableName}`;
const label = process.env.PERF_LABEL || 'after';
const report = { label, bytes: statSync(artifact).size, scenarios: [] };
const html = readFileSync(artifact, 'utf8');
for (const image of JSON.parse(readFileSync('src/owner-feedback-images.json'))) assert(!html.includes(image.src), 'Historical image excluded from portable');
const metric = (metrics, name) => metrics.find(m => m.name === name)?.value ?? 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
for (const tabs of [1, 3]) for (const expanded of [false, true]) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, offline: true });
    const errors = [], pages = [], sessions = [];
    const scenario = { tabs, expanded, pages: [], errors };
    // A single trace includes simultaneous tab loads, without double counting
    // nested timeline events as script CPU (that comes from Performance metrics).
    const trace = await browser.newBrowserCDPSession(), events = [];
    trace.on('Tracing.dataCollected', data => events.push(...data.value));
    await trace.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
    await Promise.all(Array.from({ length: tabs }, async (_, index) => {
      const page = await context.newPage(); pages[index] = page;
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const cdp = await context.newCDPSession(page); sessions[index] = cdp;
      await cdp.send('Performance.enable');
      await page.addInitScript(() => {
        window.perfProbe = { longTasks: [], raf: 0, resize: 0 };
        new PerformanceObserver(list => window.perfProbe.longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, ms: e.duration })))).observe({ type: 'longtask', buffered: true });
        const raf = window.requestAnimationFrame, RO = window.ResizeObserver;
        window.requestAnimationFrame = callback => raf.call(window, time => { window.perfProbe.raf++; callback(time); });
        window.ResizeObserver = class extends RO { constructor(callback) { super((...args) => { window.perfProbe.resize++; callback(...args); }); } };
      });
      const start = performance.now();
      await page.goto('file://' + artifact);
      await page.locator('.architecture-figure .diagram-scroll .diagram-zoom > svg').waitFor({ state: 'visible', timeout: 1800 });
      await page.evaluate(() => document.fonts.ready);
      const loadMs = performance.now() - start;
      assert(loadMs < 1800, `Initial load: ${loadMs} ms`);
      const loadMetrics = (await cdp.send('Performance.getMetrics')).metrics;
      scenario.pages[index] = { loadMs, scriptMs: metric(loadMetrics, 'ScriptDuration') * 1000,
        layoutMs: metric(loadMetrics, 'LayoutDuration') * 1000, layouts: metric(loadMetrics, 'LayoutCount'),
        loadHeapBytes: metric(loadMetrics, 'JSHeapUsedSize'), loadLongTasks: await page.evaluate(() => window.perfProbe.longTasks) };
    }));
    const complete = new Promise(resolve => trace.once('Tracing.tracingComplete', resolve));
    await trace.send('Tracing.end'); await complete;
    scenario.timelineMs = Object.fromEntries(['ParseHTML', 'EvaluateScript', 'UpdateLayoutTree', 'Layout', 'Paint'].map(name =>
      [name, events.filter(e => e.name === name && e.ph === 'X').reduce((sum, e) => sum + e.dur / 1000, 0)]));
    writeFileSync(`.cache/performance-${label}-${tabs}-${expanded}.trace.json`, JSON.stringify({ traceEvents: events }));
    for (let index = 0; index < tabs; index++) {
      const page = pages[index]; let clickMs = null;
      if (expanded) {
        const start = performance.now();
        await page.getByRole('button', { name: 'Tout déplier', exact: true }).first().click({ timeout: 1800 });
        await page.waitForFunction(() => document.querySelector('.architecture-figure').getAttribute('aria-busy') === 'false', null, { timeout: 1800 });
        clickMs = performance.now() - start;
        assert(clickMs < 1800, `Expand all: ${clickMs} ms`);
      }
      Object.assign(scenario.pages[index], await page.evaluate(() => ({ title: document.title,
        nodes: document.querySelectorAll('*').length, svgNodes: [...document.querySelectorAll('*')].filter(e => e.namespaceURI === 'http://www.w3.org/2000/svg').length,
        longTasks: window.perfProbe.longTasks })), { clickMs });
      assert(scenario.pages[index].title, 'Portable title loaded');
    }
    await pause(1000); // Exclude initial font and observer delivery from idle.
    const starts = await Promise.all(sessions.map(cdp => cdp.send('Performance.getMetrics')));
    const counters = await Promise.all(pages.map(page => page.evaluate(() => ({ ...window.perfProbe }))));
    await pause(10000);
    for (let index = 0; index < tabs; index++) {
      const end = (await sessions[index].send('Performance.getMetrics')).metrics;
      const probe = await pages[index].evaluate(() => ({ ...window.perfProbe }));
      const p = scenario.pages[index];
      Object.assign(p, { heapBytes: metric(end, 'JSHeapUsedSize'), cdpNodes: metric(end, 'Nodes'),
        idleTaskMs: (metric(end, 'TaskDuration') - metric(starts[index].metrics, 'TaskDuration')) * 1000,
        idleProcessMs: (metric(end, 'ProcessTime') - metric(starts[index].metrics, 'ProcessTime')) * 1000,
        idleScriptMs: (metric(end, 'ScriptDuration') - metric(starts[index].metrics, 'ScriptDuration')) * 1000,
        idleRaf: probe.raf - counters[index].raf, idleResize: probe.resize - counters[index].resize });
      assert(p.idleTaskMs < 100 && p.idleScriptMs < 10 && !p.idleRaf && !p.idleResize, `Continuous idle work: ${JSON.stringify(p)}`);
      assert(p.heapBytes < 32 * 1024 * 1024, 'Bounded portable heap');
    }
    assert.deepEqual(errors, [], 'No Chromium console errors');
    report.scenarios.push(scenario);
    writeFileSync(`.cache/performance-${label}.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(scenario));
  } finally { await browser.close(); }
}
