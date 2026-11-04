import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillDirectory = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);
  const require = createRequire(import.meta.url);
  const d3Path = path.resolve(path.dirname(require.resolve('d3')), '../dist/d3.min.js');
  const [d3Source, d3License, runtimeSource, reportSource] = await Promise.all([
    readFile(d3Path, 'utf8'),
    readFile(path.resolve(path.dirname(d3Path), '../LICENSE'), 'utf8'),
    readFile(path.join(skillDirectory, 'runtime/searchart.js'), 'utf8'),
    readFile(inputPath, 'utf8'),
  ]);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buildHtml(d3Source, d3License, runtimeSource, reportSource), 'utf8');
  process.stdout.write(`HTML ${outputPath}\n`);
  if (options.check || options.screenshots) {
    await inspectInBrowser(outputPath, options);
  }
}

function parseArguments(argumentsList) {
  const options = { input: 'examples/demo.mjs', output: '../.validation/demo.html', width: 1280, narrowWidth: 480 };
  const valueOptions = new Map([
    ['--input', 'input'], ['--output', 'output'],
    ['--width', 'width'], ['--narrow-width', 'narrowWidth'],
  ]);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--check' || argument === '--screenshots') {
      options[argument.slice(2)] = true;
    } else if (valueOptions.has(argument)) {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
      options[valueOptions.get(argument)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown option ${argument}`);
    }
  }
  options.width = Number(options.width);
  options.narrowWidth = Number(options.narrowWidth);
  if (!Number.isInteger(options.width) || options.width < 320 ||
      !Number.isInteger(options.narrowWidth) || options.narrowWidth < 320) {
    throw new Error('Viewport widths must be integers of at least 320 CSS pixels');
  }
  if (path.extname(options.output).toLowerCase() !== '.html') {
    throw new Error('The output file must have the .html extension');
  }
  return options;
}

function buildHtml(d3Source, d3License, runtimeSource, reportSource) {
  const sourceLiteral = JSON.stringify(reportSource).replace(/</g, '\\u003c');
  const scripts = [d3Source, runtimeSource].map(source => source.replace(/<\/script/gi, '<\\/script'));
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SearChart</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f7fa; color: #253244; }
    #report { width: 100%; margin: 0 auto; padding: 24px; }
    @media (max-width: 600px) { #report { padding: 12px; } }
  </style>
</head>
<body>
  <main id="report" aria-label="SearChart 数据报告"></main>
  <!-- D3 license\n${d3License.replace(/--/g, '—')} -->
  <script>${scripts[0]}</script>
  <script>${scripts[1]}</script>
  <script>
    window.__SEAR_CHART_READY__ = (async () => {
      const moduleUrl = URL.createObjectURL(new Blob([${sourceLiteral}], { type: 'text/javascript' }));
      try {
        const { default: report } = await import(moduleUrl);
        document.title = report.title || 'SearChart';
        window.__SEAR_CHART_CONTROLLER__ = await SearChart.mount(document.getElementById('report'), report);
        return SearChart.inspect(document.getElementById('report'));
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    })();
    window.__SEAR_CHART_READY__.catch(error => {
      const message = document.createElement('pre');
      message.textContent = 'SearChart 渲染失败\\n' + error.message;
      document.getElementById('report').replaceChildren(message);
    });
  </script>
</body>
</html>\n`;
}

async function inspectInBrowser(outputPath, options) {
  const localBrowsers = path.resolve(skillDirectory, '../.validation/browsers');
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(localBrowsers)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
  }
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  });
  try {
    const page = await browser.newPage({ viewport: { width: options.width, height: 1000 }, deviceScaleFactor: 1 });
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.route(/^https?:\/\//, route => route.abort());
    await page.goto(pathToFileURL(outputPath).href);
    await page.evaluate(() => window.__SEAR_CHART_READY__);
    await settleLayout(page);
    const wide = await page.evaluate(() => SearChart.inspect(document.getElementById('report')));
    const stem = outputPath.slice(0, -5);
    const screenshots = [];
    if (options.screenshots) {
      await page.locator('#report').screenshot({ path: `${stem}-wide.png` });
      screenshots.push(`${stem}-wide.png`);
    }
    const halfWidth = Math.max(320, Math.floor(options.width / 2));
    await page.setViewportSize({ width: halfWidth, height: 1000 });
    await settleLayout(page);
    const half = await page.evaluate(() => SearChart.inspect(document.getElementById('report')));
    if (options.screenshots) {
      await page.locator('svg[data-chart-id]').first().screenshot({ path: `${stem}-half.png` });
      screenshots.push(`${stem}-half.png`);
    }
    await page.setViewportSize({ width: options.narrowWidth, height: 1000 });
    await settleLayout(page);
    const narrow = await page.evaluate(() => SearChart.inspect(document.getElementById('report')));
    if (options.screenshots) {
      await page.locator('#report').screenshot({ path: `${stem}-narrow.png` });
      screenshots.push(`${stem}-narrow.png`);
    }
    const audit = { views: { wide, half, narrow }, browserErrors, screenshots };
    await writeFile(`${stem}-audit.json`, JSON.stringify(audit, null, 2) + '\n', 'utf8');
    process.stdout.write(`Audit ${stem}-audit.json\n`);
    for (const screenshot of screenshots) process.stdout.write(`PNG ${screenshot}\n`);
    if (options.check && (!wide.ok || !half.ok || !narrow.ok || browserErrors.length)) {
      process.exitCode = 1;
      process.stderr.write(JSON.stringify({ wide: wide.errors, half: half.errors, narrow: narrow.errors, browserErrors }, null, 2) + '\n');
    }
  } finally {
    await browser.close();
  }
}

async function settleLayout(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  });
}

main().catch(error => {
  process.stderr.write(`SearChart ${error.message}\n`);
  process.exitCode = 1;
});
