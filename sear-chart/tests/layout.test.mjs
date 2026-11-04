import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const d3Path = resolve(dirname(require.resolve('d3')), '../dist/d3.min.js');
const runtimePath = new URL('../runtime/searchart.js', import.meta.url);
const demoPath = new URL('../examples/demo.mjs', import.meta.url);
let browser;
let d3Source;
let runtimeSource;
let demoSource;

before(async () => {
  [d3Source, demoSource] = await Promise.all([
    readFile(d3Path, 'utf8'),
    readFile(demoPath, 'utf8'),
  ]);
  runtimeSource = await readFile(runtimePath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
});

after(async () => {
  await browser?.close();
});

async function mountReport(width = 1200) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}*{box-sizing:border-box}</style></head><body><main id="report"></main></body></html>');
  await page.locator('#report').evaluate((element, containerWidth) => {
    element.style.width = `${containerWidth}px`;
  }, width);
  await page.addScriptTag({ content: d3Source });
  await page.addScriptTag({ content: runtimeSource || 'void 0;' });
  const hasRuntime = await page.evaluate(() => typeof globalThis.SearChart?.mount === 'function');
  assert.equal(hasRuntime, true, 'runtime must expose the real SearChart.mount entry point');
  await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const { default: report } = await import(url);
    URL.revokeObjectURL(url);
    globalThis.demoReport = report;
    await globalThis.SearChart.mount(document.querySelector('#report'), report);
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  }, demoSource);
  return page;
}

async function chartBoxes(page) {
  return page.locator('svg[data-chart-id]').evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    const transform = element.getScreenCTM();
    return {
      id: element.dataset.chartId,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      scaleX: transform.a,
      scaleY: transform.d,
    };
  }));
}

async function legendMarkIntersections(page, chartId) {
  return page.evaluate((id) => {
    const chart = document.querySelector(`svg[data-chart-id="${id}"]`);
    const layout = globalThis.SearChart.inspect(document.querySelector('#report')).charts.find((item) => item.id === id);
    const transform = chart.getScreenCTM();
    const bounds = layout.legend.bounds;
    const left = bounds.x * transform.a + transform.e;
    const top = bounds.y * transform.d + transform.f;
    const right = left + bounds.width * transform.a;
    const bottom = top + bounds.height * transform.d;
    return [...chart.querySelectorAll('[data-series][data-index]')].flatMap((mark) => {
      const markBounds = mark.getBoundingClientRect();
      const intersects = markBounds.width > 0 && markBounds.height > 0 && markBounds.left < right && markBounds.right > left && markBounds.top < bottom && markBounds.bottom > top;
      return intersects ? [{ series: mark.dataset.series, index: mark.dataset.index }] : [];
    });
  }, chartId);
}

test('1200px report keeps the single chart and paired charts at one height without scaling SVG', async () => {
  const page = await mountReport();
  try {
    const boxes = await chartBoxes(page);
    assert.equal(boxes.length, 4);
    assert.ok(Math.abs(boxes[0].width - 1200) < 1);
    assert.ok(Math.abs(boxes[3].width - 1200) < 1);
    assert.ok(Math.abs(boxes[1].width - 588) < 1);
    assert.ok(Math.abs(boxes[2].width - 588) < 1);
    assert.ok(Math.abs(boxes[1].y - boxes[2].y) < 1);
    assert.ok(Math.abs(boxes[2].x - boxes[1].x - boxes[1].width - 24) < 1);
    for (const box of boxes) {
      assert.equal(box.height, 360, `${box.id} must preserve the shared row height`);
      assert.ok(Math.abs(box.scaleX - 1) < 0.001, `${box.id} scales its text horizontally`);
      assert.ok(Math.abs(box.scaleY - 1) < 0.001, `${box.id} scales its text vertically`);
    }
  } finally {
    await page.close();
  }
});

for (const width of [720, 480]) {
  test(`${width}px container reflows the paired row and redraws instead of shrinking text`, async () => {
    const page = await mountReport();
    try {
      await page.locator('#report').evaluate((element, containerWidth) => {
        element.style.width = `${containerWidth}px`;
      }, width);
      await page.waitForFunction((containerWidth) => {
        const charts = [...document.querySelectorAll('svg[data-chart-id]')];
        return charts.length === 4 && charts.every((chart) => Math.abs(chart.getBoundingClientRect().width - containerWidth) < 1);
      }, width);
      const boxes = await chartBoxes(page);
      assert.ok(boxes[2].y >= boxes[1].y + 360, 'paired charts must occupy separate rows');
      for (const box of boxes) {
        assert.equal(box.height, 360);
        assert.ok(Math.abs(box.scaleX - 1) < 0.001);
        assert.ok(Math.abs(box.scaleY - 1) < 0.001);
      }
    } finally {
      await page.close();
    }
  });
}

test('chart titles, x labels and legends retain the same configured font sizes across layouts', async () => {
  const page = await mountReport();
  try {
    for (const width of [1200, 720, 480]) {
      await page.locator('#report').evaluate((element, containerWidth) => {
        element.style.width = `${containerWidth}px`;
      }, width);
      await page.waitForFunction((containerWidth) => Math.abs(document.querySelector('svg[data-chart-id]').getBoundingClientRect().width - containerWidth) < 1, width);
      const fonts = await page.locator('svg[data-chart-id]').evaluateAll((charts) => charts.map((chart) => {
        const sizes = {};
        for (const role of ['title', 'x-label', 'x-context', 'legend', 'value-label']) {
          sizes[role] = [...chart.querySelectorAll(`text[data-role="${role}"]`)].map((text) => getComputedStyle(text).fontSize);
        }
        return { id: chart.dataset.chartId, sizes };
      }));
      for (const chart of fonts) {
        assert.deepEqual([...new Set(chart.sizes.title)], ['16px'], `${chart.id} title font at ${width}px`);
        assert.deepEqual([...new Set(chart.sizes['x-label'])], ['12px'], `${chart.id} x-axis font at ${width}px`);
        assert.deepEqual([...new Set(chart.sizes.legend)], ['12px'], `${chart.id} legend font at ${width}px`);
        for (const size of chart.sizes['x-context']) assert.equal(size, '12px');
        for (const size of chart.sizes['value-label']) assert.equal(size, '12px');
      }
      const families = await page.locator('svg[data-chart-id] text[data-role]').evaluateAll((texts) => [...new Set(texts.map((text) => getComputedStyle(text).fontFamily))]);
      assert.equal(families.length, 1, `all chart text must share a font family at ${width}px`);
      assert.match(families[0], /Microsoft YaHei/);
    }
  } finally {
    await page.close();
  }
});

test('fractional percentages render percent ticks and horizontal day/context labels', async () => {
  const page = await mountReport();
  try {
    const axes = await page.locator('svg[data-chart-id]').evaluateAll((charts) => charts.map((chart) => ({
      id: chart.dataset.chartId,
      ticks: [...chart.querySelectorAll('text[data-role="y-label"][data-axis-unit="percent"]')].map((text) => text.textContent),
      labels: [...chart.querySelectorAll('text[data-role="x-label"], text[data-role="x-context"]')].map((text) => {
        const transform = text.getCTM();
        return { text: text.textContent, rotationB: transform.b, rotationC: transform.c };
      }),
      contexts: chart.querySelectorAll('text[data-role="x-context"]').length,
    })));
    for (const axis of axes) {
      assert.ok(axis.ticks.length >= 3, `${axis.id} must provide readable percentage ticks`);
      assert.ok(axis.ticks.every((tick) => tick.includes('%')), `${axis.id} lost its percentage unit`);
      assert.ok(axis.labels.every((label) => Math.abs(label.rotationB) < 0.001 && Math.abs(label.rotationC) < 0.001), `${axis.id} rotates axis text`);
    }
    assert.ok(axes[0].contexts > 0);
    assert.ok(axes[2].contexts > 0);
    assert.ok(axes[3].contexts > 0);
    const rateLabels = await page.locator('svg[data-chart-id="completion"] text[data-role="y-label"]').allTextContents();
    assert.ok(rateLabels.some((label) => Number(label.replace('%', '').trim()) === 100), '0–1 percent domain must display 100%');
  } finally {
    await page.close();
  }
});

test('diverging stacks preserve raw signed fractions and position contributions around the same zero', async () => {
  const page = await mountReport();
  try {
    const bars = await page.locator('svg[data-chart-id="contributions"]').evaluate((chart) => {
      const read = (series, index) => {
        const element = chart.querySelector(`rect[data-series="${series}"][data-index="${index}"]`);
        if (!element) return null;
        const bounds = element.getBoundingClientRect();
        return { value: Number(element.dataset.value), top: bounds.top, bottom: bounds.bottom, height: bounds.height };
      };
      return { positive: read('campaign', 0), negative: read('upgrades', 0), nextPositive: read('checkin', 0) };
    });
    assert.ok(bars.positive && bars.negative && bars.nextPositive, 'stacked marks must retain data-series/data-index/data-value');
    assert.equal(bars.positive.value, 0.22);
    assert.equal(bars.negative.value, -0.14);
    assert.ok(Math.abs(bars.positive.bottom - bars.negative.top) < 1, 'positive and negative stacks must share zero');
    assert.ok(Math.abs(bars.nextPositive.bottom - bars.positive.top) < 1, 'positive series must stack upward');
    assert.ok(Math.abs(bars.positive.height / bars.negative.height - 0.22 / 0.14) < 0.03, 'bar sizes must preserve the raw signed contribution scale');
  } finally {
    await page.close();
  }
});

test('many legends use the right side without covering marks while small legends use a row', async () => {
  const page = await mountReport();
  try {
    const inspection = await page.evaluate(() => globalThis.SearChart.inspect(document.querySelector('#report')));
    assert.equal(inspection.ok, true, JSON.stringify(inspection.errors));
    const contribution = inspection.charts.find((chart) => chart.id === 'contributions');
    const completion = inspection.charts.find((chart) => chart.id === 'completion');
    assert.match(contribution.legend.placement, /^(right|inside-right|outside-right)$/);
    assert.equal(completion.legend.placement, 'row');
    assert.ok(contribution.legend.bounds.x >= contribution.plot.x + contribution.plot.width / 2, 'right legend must sit on the right side');
    assert.deepEqual(await legendMarkIntersections(page, 'contributions'), [], 'right legend must not cover data marks');
    const legend = completion.legend.bounds;
    const plot = completion.plot;
    assert.ok(legend.y + legend.height <= plot.y + 1 || legend.y >= plot.y + plot.height - 1, 'row legend must leave the data plot available');
  } finally {
    await page.close();
  }
});

test('automatic right legend uses available space inside a sparse chart without covering data', async () => {
  const page = await mountReport();
  try {
    await page.evaluate(async () => {
      const series = [
        { key: 'a', name: '来源A', values: [0.03, 0.04, 0.05, 0.06] },
        { key: 'b', name: '来源B', values: [0.05, 0.06, 0.07, 0.08] },
        { key: 'c', name: '来源C', values: [0.07, 0.08, 0.09, 0.1] },
        { key: 'd', name: '来源D', values: [0.09, 0.1, 0.11, 0.12] },
        { key: 'e', name: '来源E', values: [0.11, 0.12, 0.13, 0.14] },
        { key: 'f', name: '来源F', values: [0.13, 0.14, 0.15, 0.16] },
      ].map((item) => ({ ...item, unit: 'percent' }));
      await globalThis.SearChart.mount(document.querySelector('#report'), {
        title: '图内留白验证',
        rowHeight: 360,
        rows: [{ charts: [{
          id: 'sparse', title: '低位走势', type: 'line', categories: ['第1天', '第2天', '第3天', '第4天'],
          y: { unit: 'percent', domain: [0, 1] }, legend: { placement: 'auto' }, series,
        }] }],
      });
    });
    const layout = await page.evaluate(() => globalThis.SearChart.inspect(document.querySelector('#report')).charts[0]);
    const legend = layout.legend.bounds;
    const plot = layout.plot;
    assert.match(layout.legend.placement, /^(right|inside-right)$/);
    assert.ok(legend.x >= plot.x && legend.x + legend.width <= plot.x + plot.width + 1, 'legend must use the empty interior width');
    assert.ok(legend.y >= plot.y && legend.y + legend.height <= plot.y + plot.height + 1, 'legend must use the empty interior height');
    assert.deepEqual(await legendMarkIntersections(page, 'sparse'), [], 'interior legend must not cover data marks');
  } finally {
    await page.close();
  }
});

test('visible text and sparse data labels stay inside each SVG at wide and narrow widths', async () => {
  const page = await mountReport();
  try {
    for (const width of [1200, 720, 480]) {
      await page.locator('#report').evaluate((element, containerWidth) => {
        element.style.width = `${containerWidth}px`;
      }, width);
      await page.waitForFunction((containerWidth) => Math.abs(document.querySelector('svg[data-chart-id]').getBoundingClientRect().width - containerWidth) < 1, width);
      const overflow = await page.locator('svg[data-chart-id]').evaluateAll((charts) => charts.flatMap((chart) => {
        const bounds = chart.getBoundingClientRect();
        return [...chart.querySelectorAll('text')].filter((text) => {
          const style = getComputedStyle(text);
          return style.display !== 'none' && style.visibility !== 'hidden' && text.textContent.trim();
        }).flatMap((text) => {
          const box = text.getBoundingClientRect();
          const outside = box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1;
          return outside ? [{ chart: chart.dataset.chartId, text: text.textContent, role: text.dataset.role }] : [];
        });
      }));
      assert.deepEqual(overflow, [], `text overflows at ${width}px`);
    }
    assert.equal(await page.locator('svg[data-chart-id="contributions"] text[data-role="value-label"]').count(), 3);
    assert.equal(await page.locator('svg[data-chart-id="activity"] text[data-role="value-label"]').count(), 14, 'hidden headcount axis must be carried by all corresponding data labels');
  } finally {
    await page.close();
  }
});

test('custom charts execute their browser draw callback within the standard chart frame', async () => {
  const page = await mountReport();
  try {
    await page.evaluate(async () => {
      const report = {
        title: '自定义绘制验证',
        rowHeight: 360,
        rows: [{ charts: [{
          id: 'custom', title: '自定义图', type: 'custom', categories: ['第1天'],
          y: { unit: 'number', domain: [0, 10] }, series: [],
          draw(context) {
            context.svg.append('circle').attr('data-custom-mark', 'true').attr('cx', 80).attr('cy', 100).attr('r', 12).attr('fill', '#0f766e');
          },
        }] }],
      };
      await globalThis.SearChart.mount(document.querySelector('#report'), report);
    });
    assert.equal(await page.locator('svg[data-chart-id="custom"] circle[data-custom-mark="true"]').count(), 1);
    assert.equal(await page.locator('svg[data-chart-id="custom"] text[data-role="title"]').textContent(), '自定义图');
    assert.equal((await chartBoxes(page))[0].height, 360);
  } finally {
    await page.close();
  }
});

test('hiding a numeric axis without corresponding data labels produces an actionable error', async () => {
  const page = await mountReport();
  try {
    const result = await page.evaluate(async () => {
      const report = {
        title: '错误输入验证',
        rows: [{ charts: [{
          id: 'missing-count-labels', title: '人数', type: 'combo', categories: ['第1天', '第2天'],
          y: { unit: 'percent', domain: [0, 1] },
          secondaryY: { unit: 'number', visible: false },
          series: [
            { key: 'ratio', name: '比例', values: [0.5, 0.6], unit: 'percent', kind: 'line' },
            { key: 'count', name: '人数', values: [100, 120], unit: 'number', kind: 'bar', axis: 'secondary' },
          ],
        }] }],
      };
      let thrown = '';
      try {
        await globalThis.SearChart.mount(document.querySelector('#report'), report);
      } catch (error) {
        thrown = error.message;
      }
      return { thrown, inspection: globalThis.SearChart.inspect(document.querySelector('#report')) };
    });
    const errors = [result.thrown, ...result.inspection.errors.map((error) => typeof error === 'string' ? error : JSON.stringify(error))].join(' ');
    assert.ok(result.thrown || result.inspection.ok === false, 'hidden axis without labels must be rejected');
    assert.match(errors, /label|标签/i);
  } finally {
    await page.close();
  }
});

test('small numeric domains retain distinct decimal tick readings and raw values', async () => {
  const page = await mountReport();
  try {
    await page.evaluate(async () => {
      await globalThis.SearChart.mount(document.querySelector('#report'), {
        title: '小数刻度验证',
        rows: [{ charts: [{
          id: 'small-numbers', title: '微小读数', type: 'bar', categories: ['样本A', '样本B'],
          y: { unit: 'number', domain: [0, 0.03] },
          series: [{ key: 'reading', name: '读数', unit: 'number', values: [0.01, 0.02] }],
        }] }],
      });
    });
    const readings = await page.locator('svg[data-chart-id="small-numbers"]').evaluate((chart) => ({
      ticks: [...chart.querySelectorAll('text[data-role="y-label"]')].map((text) => Number(text.textContent.replaceAll(',', '').trim())),
      values: [...chart.querySelectorAll('rect[data-series="reading"][data-index]')].map((mark) => Number(mark.dataset.value)),
    }));
    assert.deepEqual(readings.values, [0.01, 0.02]);
    assert.ok(new Set(readings.ticks).size >= 3, `small-domain ticks must remain distinct, got ${readings.ticks.join(', ')}`);
    assert.ok(readings.ticks.every((value) => Number.isFinite(value) && value >= 0 && value <= 0.03));
    assert.ok(readings.ticks.some((value) => Math.abs(value - 0.01) < 1e-9));
    assert.ok(readings.ticks.some((value) => Math.abs(value - 0.02) < 1e-9));
  } finally {
    await page.close();
  }
});

test('repeated destroy on an old mount cannot orphan the current controller or reactivate stale redraws', async () => {
  const page = await mountReport();
  try {
    const state = await page.evaluate(async () => {
      const container = document.querySelector('#report');
      globalThis.drawCounts = { a: 0, b: 0, c: 0 };
      function reportFor(id) {
        return {
          title: id,
          rows: [{ charts: [{
            id, title: id, type: 'custom', categories: ['样本'], series: [],
            draw() { globalThis.drawCounts[id]++; },
          }] }],
        };
      }
      const first = await globalThis.SearChart.mount(container, reportFor('a'));
      const second = await globalThis.SearChart.mount(container, reportFor('b'));
      first.destroy();
      const current = await globalThis.SearChart.mount(container, reportFor('c'));
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      const before = { ...globalThis.drawCounts };
      first.redraw();
      second.redraw();
      const afterStaleRedraw = { ...globalThis.drawCounts };
      current.redraw();
      return {
        before,
        afterStaleRedraw,
        afterCurrentRedraw: { ...globalThis.drawCounts },
        activeChart: container.querySelector('svg')?.dataset.chartId,
      };
    });
    assert.deepEqual(state.afterStaleRedraw, state.before, 'superseded handles must never invoke their draw callback again');
    assert.equal(state.afterCurrentRedraw.c, state.before.c + 1, 'the current controller must remain usable');
    assert.equal(state.activeChart, 'c');
  } finally {
    await page.close();
  }
});

test('custom charts may use series for scales and legends without receiving built-in lines or points', async () => {
  const page = await mountReport();
  try {
    await page.evaluate(async () => {
      await globalThis.SearChart.mount(document.querySelector('#report'), {
        title: '自定义系列验证',
        rows: [{ charts: [{
          id: 'custom-series', title: '自定义点图', type: 'custom', categories: ['甲', '乙', '丙'],
          series: [{ key: 'custom-data', name: '自定义数值', unit: 'number', values: [2, 5, 3] }],
          draw(context) {
            [2, 5, 3].forEach((value, index) => {
              context.svg.append('circle').attr('data-custom-point', 'true').attr('cx', 100 + index * 100).attr('cy', context.yScale(value)).attr('r', 4).attr('fill', '#087f8c');
            });
          },
        }] }],
      });
    });
    const chart = page.locator('svg[data-chart-id="custom-series"]');
    assert.equal(await chart.locator('circle[data-custom-point="true"]').count(), 3);
    assert.ok((await chart.locator('text[data-role="legend"]').allTextContents()).includes('自定义数值'));
    assert.equal(await chart.locator('[data-mark="line"], [data-mark="point"], [data-mark="bar"]').count(), 0, 'custom charts must draw only marks supplied by their callback');
  } finally {
    await page.close();
  }
});

test('percent-structure labels omit contribution signs while diverging contributions retain them', async () => {
  const page = await mountReport();
  try {
    await page.evaluate(async () => {
      await globalThis.SearChart.mount(document.querySelector('#report'), {
        title: '百分比语义验证',
        rows: [{ charts: [
          {
            id: 'structure', title: '构成占比', type: 'stacked', stackMode: 'percent', categories: ['样本'],
            y: { unit: 'percent', domain: [0, 1] },
            series: [
              { key: 'major', name: '主要部分', unit: 'percent', values: [0.73] },
              { key: 'minor', name: '其余部分', unit: 'percent', values: [0.27] },
            ],
            labels: [{ series: 'major', index: 0 }],
          },
          {
            id: 'signed-contribution', title: '正负贡献', type: 'stacked', stackMode: 'diverging', categories: ['样本'],
            y: { unit: 'percent', domain: [-1, 1] },
            series: [
              { key: 'gain', name: '获取', unit: 'percent', values: [0.73] },
              { key: 'spend', name: '消耗', unit: 'percent', values: [-0.27] },
            ],
            labels: [{ series: 'gain', index: 0 }, { series: 'spend', index: 0 }],
          },
        ] }],
      });
    });
    assert.deepEqual(await page.locator('svg[data-chart-id="structure"] text[data-role="value-label"]').allTextContents(), ['73%']);
    const contributionLabels = await page.locator('svg[data-chart-id="signed-contribution"] text[data-role="value-label"]').allTextContents();
    assert.ok(contributionLabels.includes('+73%'));
    assert.ok(contributionLabels.some((label) => /^[-−]27%$/.test(label)));
  } finally {
    await page.close();
  }
});

test('a hidden numeric axis requires labels for every present value while allowing missing values', async () => {
  const page = await mountReport();
  try {
    const result = await page.evaluate(async () => {
      const chart = {
        id: 'partial-labels', title: '人数', type: 'bar', categories: ['第1天', '第2天'],
        y: { unit: 'number', visible: false },
        series: [{ key: 'count', name: '人数', unit: 'number', values: [100, 120] }],
        labels: [{ series: 'count', index: 0 }],
      };
      let error = '';
      try {
        await globalThis.SearChart.mount(document.querySelector('#report'), { rows: [{ charts: [chart] }] });
      } catch (caught) {
        error = caught.message;
      }
      chart.series[0].values[1] = null;
      await globalThis.SearChart.mount(document.querySelector('#report'), { rows: [{ charts: [chart] }] });
      return { error, validInspection: globalThis.SearChart.inspect(document.querySelector('#report')) };
    });
    assert.match(result.error, /label|标签/i, 'a label for the first point cannot stand in for the unlabeled second value');
    assert.equal(result.validInspection.ok, true, JSON.stringify(result.validInspection.errors));
  } finally {
    await page.close();
  }
});
