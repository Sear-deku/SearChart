(function (global) {
  'use strict';

  const defaults = {
    fontFamily: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif',
    titleSize: 16,
    axisSize: 12,
    legendSize: 12,
    labelSize: 12,
    foreground: '#283444',
    muted: '#64748b',
    grid: '#e5eaf0',
    border: '#dce4ec',
  };
  const controllers = new WeakMap();
  const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 12 });
  const percentFormatter = new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 5 });

  async function mount(container, input) {
    const report = prepareReport(container, input);
    await document.fonts.ready;
    controllers.get(container)?.destroy();
    const root = document.createElement('section');
    root.className = 'searchart-report';
    root.style.cssText = 'width:100%;min-width:0;box-sizing:border-box;';
    root.style.fontFamily = report.theme.fontFamily;
    container.replaceChildren(root);
    let previousWidth = -1;
    let destroyed = false;
    let frame = 0;

    function redraw(force = true) {
      if (destroyed) return;
      const width = root.getBoundingClientRect().width;
      if (!force && Math.abs(width - previousWidth) < 0.1) return;
      previousWidth = width;
      renderReport(root, report, width);
    }

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => redraw(false));
    });
    observer.observe(root);
    const controller = {
      redraw,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        if (root.parentNode === container) root.remove();
        controllers.delete(container);
      },
    };
    controllers.set(container, controller);
    redraw();
    return controller;
  }

  function prepareReport(container, input) {
    if (!(container instanceof Element)) throw new Error('SearChart.mount requires a container element.');
    if (!global.d3) throw new Error('Load the D3 browser bundle before SearChart.');
    if (!input || !Array.isArray(input.rows) || !input.rows.length) throw new Error('report.rows must contain chart rows.');
    const theme = { ...defaults, ...input.theme };
    for (const key of ['titleSize', 'axisSize', 'legendSize', 'labelSize']) {
      if (!Number.isFinite(theme[key]) || theme[key] <= 0) throw new Error(`theme.${key} must be a positive size.`);
    }
    if (typeof theme.fontFamily !== 'string' || !theme.fontFamily.trim()) throw new Error('theme.fontFamily must name a font family.');
    const rowHeight = input.rowHeight ?? 360;
    const gap = input.gap ?? 24;
    if (!Number.isFinite(rowHeight) || rowHeight < 180) throw new Error('report.rowHeight must be at least 180 CSS pixels.');
    if (!Number.isFinite(gap) || gap < 0) throw new Error('report.gap must be non-negative.');
    const ids = new Set();
    const rows = input.rows.map((row) => {
      if (!Array.isArray(row.charts) || row.charts.length < 1 || row.charts.length > 2) throw new Error('Each report row must contain one or two charts.');
      return { charts: row.charts.map((chart) => prepareChart(chart, ids)) };
    });
    return { ...input, theme, rowHeight, gap, rows };
  }

  function prepareChart(chart, ids) {
    if (!chart || typeof chart.id !== 'string' || !chart.id || ids.has(chart.id)) throw new Error('Every chart needs a unique id.');
    ids.add(chart.id);
    if (!['bar', 'line', 'combo', 'stacked', 'custom'].includes(chart.type)) throw new Error(`${chart.id}: unsupported chart type.`);
    if (typeof chart.title !== 'string') throw new Error(`${chart.id}: title must be text.`);
    if (!Array.isArray(chart.categories) || !chart.categories.length || chart.categories.some((value) => typeof value !== 'string')) throw new Error(`${chart.id}: categories must be a non-empty text array.`);
    if (new Set(chart.categories).size !== chart.categories.length) throw new Error(`${chart.id}: category names must be unique so their positions are unambiguous.`);
    if (chart.contexts && (!Array.isArray(chart.contexts) || chart.contexts.length !== chart.categories.length || chart.contexts.some((value) => typeof value !== 'string'))) throw new Error(`${chart.id}: contexts must match categories.`);
    if (!Array.isArray(chart.series) || (chart.type !== 'custom' && !chart.series.length)) throw new Error(`${chart.id}: series must contain data.`);
    if (chart.type === 'custom' && typeof chart.draw !== 'function') throw new Error(`${chart.id}: custom charts require draw(context).`);
    const keys = new Set();
    const groups = [...new Set(chart.series.map((series) => series.group ?? series.key))];
    const series = chart.series.map((item, index) => {
      if (typeof item.key !== 'string' || !item.key || keys.has(item.key)) throw new Error(`${chart.id}: series keys must be unique.`);
      keys.add(item.key);
      if (typeof item.name !== 'string') throw new Error(`${chart.id}: series names must be text.`);
      if (!['percent', 'number'].includes(item.unit)) throw new Error(`${chart.id}/${item.key}: unit must be percent or number.`);
      if (item.axis && !['primary', 'secondary'].includes(item.axis)) throw new Error(`${chart.id}/${item.key}: unknown axis.`);
      if (item.kind && !['bar', 'line'].includes(item.kind)) throw new Error(`${chart.id}/${item.key}: kind must be bar or line.`);
      if (!Array.isArray(item.values) || item.values.length !== chart.categories.length || item.values.some((value) => value !== null && !Number.isFinite(value))) throw new Error(`${chart.id}/${item.key}: values must match categories and contain finite numbers or null.`);
      const groupIndex = groups.indexOf(item.group ?? item.key);
      const groupPeers = chart.series.filter((peer) => (peer.group ?? peer.key) === (item.group ?? item.key));
      const peerIndex = groupPeers.indexOf(item);
      const baseColor = global.d3.schemeTableau10[groupIndex % 10];
      const color = item.color ?? (item.emphasis === 'context'
        ? global.d3.interpolateRgb(baseColor, '#ffffff')(0.7)
        : global.d3.interpolateRgb(baseColor, '#ffffff')(Math.min(peerIndex * 0.18, 0.55)));
      return { ...item, axis: item.axis ?? 'primary', kind: item.kind ?? (['bar', 'stacked'].includes(chart.type) ? 'bar' : 'line'), color, index };
    });
    const labels = chart.labels ?? [];
    if (!Array.isArray(labels)) throw new Error(`${chart.id}: labels must be an array.`);
    for (const label of labels) {
      if (!keys.has(label.series) || !Number.isInteger(label.index) || label.index < 0 || label.index >= chart.categories.length) throw new Error(`${chart.id}: each label requires a known series and category index.`);
      if (series.find((item) => item.key === label.series).values[label.index] === null) throw new Error(`${chart.id}: labels cannot target missing values.`);
      if (label.text !== undefined && typeof label.text !== 'string') throw new Error(`${chart.id}: label.text must be text.`);
    }
    const y = prepareAxis(chart, series, 'primary', chart.y);
    const secondaryY = prepareAxis(chart, series, 'secondary', chart.secondaryY);
    for (const axis of ['primary', 'secondary']) {
      const spec = axis === 'primary' ? y : secondaryY;
      for (const item of series.filter((entry) => entry.axis === axis)) {
        const missingLabel = item.values.some((value, index) => value !== null && !labels.some((label) => label.series === item.key && label.index === index));
        if (!spec.visible && missingLabel) throw new Error(`${chart.id}/${item.key}: a hidden axis requires data labels (标签) for every non-missing value.`);
      }
    }
    if (chart.type === 'stacked') {
      if (!['percent', 'diverging'].includes(chart.stackMode ?? 'diverging')) throw new Error(`${chart.id}: stackMode must be percent or diverging.`);
      if (series.some((item) => item.axis !== 'primary' || item.values.some((value) => value === null))) throw new Error(`${chart.id}: stacked series require complete values on the primary axis.`);
      if (chart.stackMode === 'percent') {
        if (y.unit !== 'percent') throw new Error(`${chart.id}: percent stacks require fractional percent values.`);
        for (let index = 0; index < chart.categories.length; index++) {
          const values = series.map((item) => item.values[index]);
          if (values.some((value) => value < 0) || Math.abs(global.d3.sum(values) - 1) > 1e-6) throw new Error(`${chart.id}: percent stack values must be non-negative fractions summing to 1 at every category.`);
        }
      }
    }
    const placement = chart.legend?.placement ?? 'auto';
    if (!['auto', 'row', 'right', 'none'].includes(placement)) throw new Error(`${chart.id}: invalid legend placement.`);
    return { ...chart, series, labels, y, secondaryY, legend: { placement } };
  }

  function prepareAxis(chart, series, axis, input) {
    const items = series.filter((item) => item.axis === axis);
    const unit = input?.unit ?? items[0]?.unit ?? 'number';
    if (!['percent', 'number'].includes(unit) || items.some((item) => item.unit !== unit)) throw new Error(`${chart.id}: each axis must use one consistent unit.`);
    if (input?.domain && (!Array.isArray(input.domain) || input.domain.length !== 2 || !input.domain.every(Number.isFinite) || input.domain[0] >= input.domain[1])) throw new Error(`${chart.id}: axis domain must be an increasing pair.`);
    return { ...input, unit, visible: input?.visible !== false };
  }

  function renderReport(root, report, width) {
    root.replaceChildren();
    const header = document.createElement('header');
    header.style.cssText = 'margin:0 0 20px;color:#283444;';
    if (report.title) {
      const title = document.createElement('h1');
      title.style.cssText = 'font-size:24px;font-weight:650;margin:0 0 8px;line-height:1.4;';
      title.textContent = report.title;
      header.append(title);
    }
    if (report.description) {
      const description = document.createElement('p');
      description.style.cssText = 'font-size:13px;line-height:1.7;margin:0;color:#64748b;';
      description.textContent = report.description;
      header.append(description);
    }
    root.append(header);
    const layouts = [];
    for (const row of report.rows) {
      const rowElement = document.createElement('div');
      rowElement.className = 'searchart-row';
      const columns = row.charts.length === 2 && width >= 900 ? 2 : 1;
      rowElement.style.cssText = `display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:${report.gap}px;margin-bottom:${report.gap}px;min-width:0;`;
      for (const chart of row.charts) {
        const card = document.createElement('div');
        card.className = 'searchart-chart';
        card.style.cssText = 'min-width:0;';
        rowElement.append(card);
        layouts.push({ card, chart });
      }
      root.append(rowElement);
    }
    for (const entry of layouts) entry.layout = planChart(entry.chart, entry.card.getBoundingClientRect().width, report.theme);
    const height = Math.max(report.rowHeight, ...layouts.map((entry) => entry.layout.minimumHeight));
    for (const entry of layouts) renderChart(entry.card, entry.chart, entry.layout, height, report.theme);
  }

  function textWidth(text, size, family, weight = 400) {
    const canvas = textWidth.canvas ??= document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${weight} ${size}px ${family}`;
    return context.measureText(text).width;
  }

  function wrapText(text, width, size, family, weight = 400) {
    const lines = [];
    for (const paragraph of String(text).split('\n')) {
      let line = '';
      const tokens = paragraph.match(/\d+(?:[.,]\d+)*|[^\d]/gu) ?? [];
      for (const token of tokens) {
        const candidate = line + token;
        if (line && textWidth(candidate, size, family, weight) > width) {
          lines.push(line.trimEnd());
          line = token.trimStart();
        } else line = candidate;
      }
      lines.push(line);
    }
    return lines;
  }

  function planChart(chart, width, theme) {
    const titleLines = wrapText(chart.title, Math.max(60, width - 32), theme.titleSize, theme.fontFamily, 600);
    const titleHeight = titleLines.length * (theme.titleSize + 4);
    const legendRowWidth = global.d3.sum(chart.series, (item) => textWidth(item.name, theme.legendSize, theme.fontFamily) + 40);
    let placement = chart.legend.placement;
    if (placement === 'auto' || placement === 'row') placement = chart.series.length <= 5 && legendRowWidth <= width - 36 ? 'row' : 'right';
    if (!chart.series.length || chart.legend.placement === 'none') placement = 'none';
    const legendWidth = placement === 'right'
      ? Math.min(Math.max(72, global.d3.max(chart.series, (item) => textWidth(item.name, theme.legendSize, theme.fontFamily)) + 26), width * 0.32)
      : legendRowWidth;
    const legendEntries = chart.series.map((item) => ({
      ...item,
      lines: placement === 'right' ? wrapText(item.name, Math.max(30, legendWidth - 24), theme.legendSize, theme.fontFamily) : [item.name],
    }));
    const legendHeight = placement === 'right'
      ? global.d3.sum(legendEntries, (entry) => entry.lines.length * (theme.legendSize + 2) + 2)
      : placement === 'row' ? theme.legendSize + 8 : 0;
    const titleTop = 16;
    const legendTop = titleTop + titleHeight + 10;
    const plotTop = placement === 'row' ? legendTop + legendHeight + 12 : legendTop + 4;
    const left = chart.y.visible ? 54 : 20;
    const right = chart.series.some((item) => item.axis === 'secondary') && chart.secondaryY.visible ? 54 : 18;
    const preliminaryPlotWidth = width - left - right - (placement === 'right' ? legendWidth + 16 : 0);
    const categoryWidth = Math.max(10, preliminaryPlotWidth / chart.categories.length - 3);
    const categoryLines = chart.categories.map((category) => wrapText(category, categoryWidth, theme.axisSize, theme.fontFamily));
    const contextLines = chart.contexts?.map((context) => wrapText(`(${context})`, categoryWidth, theme.axisSize, theme.fontFamily)) ?? [];
    const categoryHeight = global.d3.max(categoryLines, (lines) => lines.length) * (theme.axisSize + 2);
    const contextHeight = contextLines.length ? global.d3.max(contextLines, (lines) => lines.length) * (theme.axisSize + 2) + 4 : 0;
    const bottom = 18 + categoryHeight + contextHeight + 12;
    return {
      width, titleLines, titleTop, titleHeight, legendTop, legendWidth, legendHeight,
      legendEntries, placement, plotTop, left, right, bottom, categoryLines, contextLines,
      minimumHeight: Math.max(plotTop + bottom + 140, placement === 'right' ? legendTop + legendHeight + 16 : 0),
    };
  }

  function renderChart(card, chart, layout, height, theme) {
    const d3 = global.d3;
    const svg = d3.select(card).append('svg')
      .attr('data-chart-id', chart.id).attr('role', 'img').attr('aria-label', chart.title)
      .attr('width', layout.width).attr('height', height)
      .attr('viewBox', `0 0 ${layout.width} ${height}`)
      .style('display', 'block').style('width', '100%').style('height', `${height}px`)
      .style('font-family', theme.fontFamily).style('overflow', 'visible');
    svg.append('rect').attr('x', 0.5).attr('y', 0.5).attr('width', layout.width - 1).attr('height', height - 1).attr('rx', 10).attr('fill', '#ffffff').attr('stroke', theme.border);
    const plot = { x: layout.left, y: layout.plotTop, width: layout.width - layout.left - layout.right, height: height - layout.plotTop - layout.bottom };
    const yScale = d3.scaleLinear().domain(axisDomain(chart, 'primary')).range([plot.y + plot.height, plot.y]);
    const secondaryYScale = d3.scaleLinear().domain(axisDomain(chart, 'secondary')).range([plot.y + plot.height, plot.y]);
    let xScale = makeXScale(chart, plot);
    let geometry = chartGeometry(chart, xScale, yScale, secondaryYScale);
    let legendBounds = { x: 0, y: 0, width: 0, height: 0 };
    let legendInside = false;
    if (layout.placement === 'right') {
      const candidate = { x: plot.x + plot.width - layout.legendWidth - 8, y: plot.y + 6, width: layout.legendWidth, height: layout.legendHeight };
      legendInside = chart.type !== 'custom' && candidate.height <= plot.height - 12 && !geometry.some((mark) => markIntersectsBox(mark, candidate));
      if (legendInside) legendBounds = candidate;
      else {
        plot.width -= layout.legendWidth + 16;
        xScale = makeXScale(chart, plot);
        geometry = chartGeometry(chart, xScale, yScale, secondaryYScale);
        legendBounds = { x: plot.x + plot.width + 16, y: layout.legendTop, width: layout.legendWidth, height: layout.legendHeight };
      }
    } else if (layout.placement === 'row') {
      legendBounds = { x: (layout.width - layout.legendWidth) / 2, y: layout.legendTop, width: layout.legendWidth, height: layout.legendHeight };
    }
    const roleSize = (role) => role === 'title' ? theme.titleSize : role === 'legend' ? theme.legendSize : role === 'value-label' ? theme.labelSize : theme.axisSize;
    const addText = (text, attributes = {}, role = 'value-label') => {
      const selection = svg.append('text').attr('data-role', role).attr('fill', theme.foreground)
        .attr('font-family', theme.fontFamily).attr('font-size', roleSize(role)).style('font-size', `${roleSize(role)}px`);
      for (const [key, value] of Object.entries(attributes)) selection.attr(key, value);
      return selection.text(text);
    };
    addWrappedText(addText, layout.titleLines, layout.width / 2, layout.titleTop, theme.titleSize + 4, 'title', { 'text-anchor': 'middle', 'font-weight': 600 });
    drawAxes(chart, plot, xScale, yScale, secondaryYScale, layout, theme, addText, svg);
    if (chart.type !== 'custom') drawGeometry(svg, chart, geometry);
    if (layout.placement !== 'none') drawLegend(svg, layout, legendBounds, legendInside, theme, addText);
    drawLabels(chart, geometry, plot, legendInside ? legendBounds : null, theme, addText, svg);
    if (chart.type === 'custom') chart.draw({ svg, plot, width: layout.width, height, xScale, yScale, secondaryYScale, theme, d3, addText });
    svg.node().__searchart = { id: chart.id, width: layout.width, height, plot, legend: { placement: layout.placement, inside: legendInside, bounds: legendBounds } };
    svg.node().__searchartGeometry = geometry;
  }

  function axisDomain(chart, axis) {
    const definition = axis === 'primary' ? chart.y : chart.secondaryY;
    if (definition.domain) return definition.domain;
    const series = chart.series.filter((item) => item.axis === axis);
    let values = series.flatMap((item) => item.values.filter((value) => value !== null));
    if (chart.type === 'stacked' && axis === 'primary') {
      values = chart.categories.flatMap((_, index) => [
        global.d3.sum(series, (item) => Math.max(0, item.values[index])),
        global.d3.sum(series, (item) => Math.min(0, item.values[index])),
      ]);
    }
    const minimum = Math.min(0, global.d3.min(values) ?? 0);
    const maximum = Math.max(0, global.d3.max(values) ?? 1);
    return global.d3.scaleLinear().domain(minimum === maximum ? [minimum, minimum + 1] : [minimum, maximum]).nice(4).domain();
  }

  function makeXScale(chart, plot) {
    return global.d3.scaleBand().domain(chart.categories).range([plot.x, plot.x + plot.width]).paddingInner(0.16).paddingOuter(0.12);
  }

  function chartGeometry(chart, xScale, yScale, secondaryYScale) {
    const marks = [];
    if (chart.type === 'custom') return marks;
    const center = (index) => xScale(chart.categories[index]) + xScale.bandwidth() / 2;
    if (chart.type === 'stacked') {
      const rows = chart.categories.map((_, index) => Object.fromEntries(chart.series.map((series) => [series.key, series.values[index]])));
      const stacked = global.d3.stack().keys(chart.series.map((series) => series.key)).offset(global.d3.stackOffsetDiverging)(rows);
      stacked.forEach((layer, seriesIndex) => {
        const series = chart.series[seriesIndex];
        layer.forEach((pair, index) => {
          marks.push({ kind: 'rect', series, index, value: series.values[index], x: xScale(chart.categories[index]), y: yScale(pair[1]), width: xScale.bandwidth(), height: yScale(pair[0]) - yScale(pair[1]), start: pair[0], end: pair[1], cx: center(index), cy: yScale((pair[0] + pair[1]) / 2), stacked: true });
        });
      });
      return marks;
    }
    const bars = chart.series.filter((series) => series.kind === 'bar');
    const barWidth = xScale.bandwidth() / Math.max(1, bars.length);
    for (const series of chart.series) {
      const scale = series.axis === 'secondary' ? secondaryYScale : yScale;
      if (series.kind === 'bar') {
        const barIndex = bars.indexOf(series);
        series.values.forEach((value, index) => {
          if (value === null) return;
          const x = xScale(chart.categories[index]) + barIndex * barWidth;
          marks.push({ kind: 'rect', series, index, value, x, y: Math.min(scale(0), scale(value)), width: barWidth * 0.96, height: Math.abs(scale(value) - scale(0)), cx: x + barWidth * 0.48, cy: scale(value), stacked: false });
        });
      } else {
        let previous = null;
        series.values.forEach((value, index) => {
          if (value === null) { previous = null; return; }
          const point = { kind: 'point', series, index, value, x: center(index), y: scale(value), cx: center(index), cy: scale(value) };
          marks.push(point);
          if (previous) marks.push({ kind: 'segment', series, x1: previous.x, y1: previous.y, x2: point.x, y2: point.y });
          previous = point;
        });
      }
    }
    return marks;
  }

  function addWrappedText(addText, lines, x, y, lineHeight, role, attributes = {}) {
    const text = addText('', { x, y, 'dominant-baseline': 'hanging', ...attributes }, role);
    lines.forEach((line, index) => text.append('tspan').attr('x', x).attr('dy', index === 0 ? 0 : lineHeight).text(line));
    return text;
  }

  function drawAxes(chart, plot, xScale, yScale, secondaryYScale, layout, theme, addText, svg) {
    if (chart.y.visible) {
      const tickFormat = yScale.tickFormat(4, chart.y.unit === 'percent' ? '%' : undefined);
      for (const value of yScale.ticks(4)) {
        const y = yScale(value);
        svg.append('line').attr('x1', plot.x).attr('x2', plot.x + plot.width).attr('y1', y).attr('y2', y).attr('stroke', theme.grid);
        addText(tickFormat(value), { x: plot.x - 9, y, 'text-anchor': 'end', 'dominant-baseline': 'central', fill: theme.muted, 'data-axis-unit': chart.y.unit, 'data-axis': 'primary' }, 'y-label');
      }
    }
    if (chart.series.some((series) => series.axis === 'secondary') && chart.secondaryY.visible) {
      const tickFormat = secondaryYScale.tickFormat(4, chart.secondaryY.unit === 'percent' ? '%' : undefined);
      for (const value of secondaryYScale.ticks(4)) addText(tickFormat(value), { x: plot.x + plot.width + 9, y: secondaryYScale(value), 'dominant-baseline': 'central', fill: theme.muted, 'data-axis-unit': chart.secondaryY.unit, 'data-axis': 'secondary' }, 'y-label');
    }
    const zero = Math.max(plot.y, Math.min(plot.y + plot.height, yScale(0)));
    svg.append('line').attr('x1', plot.x).attr('x2', plot.x + plot.width).attr('y1', zero).attr('y2', zero).attr('stroke', '#667482').attr('stroke-width', 1);
    const baseY = plot.y + plot.height + 12;
    const categoryHeight = global.d3.max(layout.categoryLines, (lines) => lines.length) * (theme.axisSize + 2);
    chart.categories.forEach((_, index) => {
      const x = xScale(chart.categories[index]) + xScale.bandwidth() / 2;
      addWrappedText(addText, layout.categoryLines[index], x, baseY, theme.axisSize + 2, 'x-label', { 'text-anchor': 'middle', fill: theme.muted, 'data-index': index });
      if (chart.contexts) addWrappedText(addText, layout.contextLines[index], x, baseY + categoryHeight + 4, theme.axisSize + 2, 'x-context', { 'text-anchor': 'middle', fill: theme.muted, 'data-index': index });
    });
  }

  function drawGeometry(svg, chart, geometry) {
    for (const mark of geometry.filter((item) => item.kind === 'rect')) {
      svg.append('rect').attr('data-mark', 'bar').attr('data-series', mark.series.key).attr('data-index', mark.index).attr('data-value', mark.value)
        .attr('data-stack-start', mark.start ?? '').attr('data-stack-end', mark.end ?? '')
        .attr('x', mark.x).attr('y', mark.y).attr('width', mark.width).attr('height', mark.height).attr('fill', mark.series.color);
    }
    for (const series of chart.series.filter((item) => item.kind === 'line' && chart.type !== 'stacked')) {
      const points = geometry.filter((mark) => mark.kind === 'point' && mark.series.key === series.key);
      const byIndex = new Map(points.map((point) => [point.index, point]));
      const line = global.d3.line().defined((_, index) => byIndex.has(index)).x((_, index) => byIndex.get(index).x).y((_, index) => byIndex.get(index).y);
      svg.append('path').attr('data-mark', 'line').attr('data-series', series.key).attr('d', line(series.values)).attr('fill', 'none').attr('stroke', series.color).attr('stroke-width', 2).attr('stroke-dasharray', series.dash ? '5 4' : null);
      for (const point of points) svg.append('circle').attr('data-mark', 'point').attr('data-series', series.key).attr('data-index', point.index).attr('data-value', point.value).attr('cx', point.x).attr('cy', point.y).attr('r', 2.4).attr('fill', series.color);
    }
  }

  function drawLegend(svg, layout, bounds, inside, theme, addText) {
    const group = svg.append('g').attr('data-role', 'legend-container').attr('data-placement', layout.placement).attr('data-inside', inside);
    if (inside) group.append('rect').attr('x', bounds.x - 4).attr('y', bounds.y - 4).attr('width', bounds.width + 8).attr('height', bounds.height + 8).attr('rx', 4).attr('fill', '#ffffff').attr('fill-opacity', 0.94);
    let x = bounds.x;
    let y = bounds.y;
    for (const entry of layout.legendEntries) {
      const symbolY = y + theme.legendSize / 2;
      if (entry.kind === 'line') group.append('line').attr('x1', x).attr('x2', x + 14).attr('y1', symbolY).attr('y2', symbolY).attr('stroke', entry.color).attr('stroke-width', 2).attr('stroke-dasharray', entry.dash ? '4 3' : null);
      else group.append('rect').attr('x', x).attr('y', y + 1).attr('width', 12).attr('height', theme.legendSize - 1).attr('rx', 1).attr('fill', entry.color);
      const text = addWrappedText(addText, entry.lines, x + 20, y, theme.legendSize + 2, 'legend', { fill: theme.muted, 'data-series': entry.key, 'data-group': entry.group ?? '' });
      group.node().append(text.node());
      if (layout.placement === 'row') x += textWidth(entry.name, theme.legendSize, theme.fontFamily) + 40;
      else y += entry.lines.length * (theme.legendSize + 2) + 2;
    }
  }

  function drawLabels(chart, geometry, plot, legendBounds, theme, addText, svg) {
    const occupied = [];
    for (const label of chart.labels) {
      const mark = geometry.find((entry) => entry.series.key === label.series && entry.index === label.index && entry.kind !== 'segment');
      if (!mark) continue;
      const text = label.text ?? formatValue(mark.value, mark.series.unit, chart.type === 'stacked' && chart.stackMode !== 'percent');
      const width = textWidth(text, theme.labelSize, theme.fontFamily, 600) + 8;
      const height = theme.labelSize + 6;
      if (mark.stacked && mark.height >= height + 2 && mark.width >= width) {
        const box = { x: mark.cx - width / 2, y: mark.cy - height / 2, width, height };
        addText(text, { x: mark.cx, y: mark.cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-weight': 600, fill: contrastText(mark.series.color), 'data-series': mark.series.key, 'data-index': mark.index }, 'value-label');
        occupied.push(box);
        continue;
      }
      const options = mark.kind === 'rect'
        ? [
          { x: mark.cx - width / 2, y: mark.value >= 0 ? mark.y - height - 4 : mark.y + mark.height + 4 },
          { x: mark.cx - width / 2, y: mark.stacked ? mark.cy - height / 2 : mark.y + 4 },
          { x: mark.cx - width / 2, y: mark.y - height * 2 - 10 },
          { x: mark.cx - width / 2, y: mark.y - height * 3 - 16 },
          { x: mark.cx - width / 2, y: mark.y + height + 10 },
          { x: mark.cx - width / 2, y: mark.y + mark.height - height - 4 },
        ]
        : [{ x: mark.cx + 8, y: mark.cy - height - 6 }, { x: mark.cx - width - 8, y: mark.cy - height - 6 }, { x: mark.cx + 8, y: mark.cy + 8 }, { x: mark.cx - width - 8, y: mark.cy + 8 }, { x: mark.cx - width / 2, y: mark.cy - height - 22 }, { x: mark.cx - width / 2, y: mark.cy + 24 }];
      const candidates = options.map((option) => ({ x: Math.max(plot.x + 2, Math.min(plot.x + plot.width - width - 2, option.x)), y: Math.max(plot.y + 2, Math.min(plot.y + plot.height - height - 2, option.y)), width, height }));
      const scores = candidates.map((box) => {
        const labelPenalty = occupied.filter((other) => boxesIntersect(box, other)).length * 100;
        const legendPenalty = legendBounds && boxesIntersect(box, legendBounds) ? 100 : 0;
        const markPenalty = global.d3.sum(geometry, (other) => other !== mark && markIntersectsBox(other, box) ? (other.kind === 'rect' ? 0.25 : 20) : 0);
        const displacement = Math.hypot(box.x + width / 2 - mark.cx, box.y + height / 2 - mark.cy) / 12;
        return labelPenalty + legendPenalty + markPenalty + displacement;
      });
      const best = scores.indexOf(Math.min(...scores));
      const box = candidates[best];
      const connectorX = Math.max(box.x, Math.min(box.x + width, mark.cx));
      const connectorY = Math.max(box.y, Math.min(box.y + height, mark.cy));
      if (Math.hypot(connectorX - mark.cx, connectorY - mark.cy) > 6) svg.append('line')
        .attr('data-role', 'label-connector').attr('data-series', mark.series.key).attr('data-index', mark.index)
        .attr('x1', mark.cx).attr('y1', mark.cy).attr('x2', connectorX).attr('y2', connectorY)
        .attr('stroke', theme.muted).attr('stroke-width', 0.8);
      svg.append('rect').attr('data-role', 'label-box').attr('data-series', mark.series.key).attr('data-index', mark.index).attr('x', box.x).attr('y', box.y).attr('width', width).attr('height', height).attr('rx', 3).attr('fill', '#ffffff').attr('fill-opacity', 0.96).attr('stroke', mark.series.color).attr('stroke-width', 0.6);
      const layoutConflict = occupied.some((other) => boxesIntersect(box, other)) || (legendBounds && boxesIntersect(box, legendBounds));
      addText(text, { x: box.x + width / 2, y: box.y + height / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-weight': 600, fill: theme.foreground, 'data-series': mark.series.key, 'data-index': mark.index, 'data-layout-conflict': layoutConflict ? 'true' : null }, 'value-label');
      occupied.push(box);
    }
  }

  function contrastText(color) {
    const rgb = global.d3.rgb(color);
    return (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) > 175 ? '#283444' : '#ffffff';
  }

  function formatValue(value, unit, signed = false) {
    const formatted = unit === 'percent' ? `${percentFormatter.format(value * 100)}%` : numberFormatter.format(value);
    return signed && value > 0 ? `+${formatted}` : formatted;
  }

  function boxesIntersect(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function markIntersectsBox(mark, box) {
    if (mark.kind === 'rect') return mark.height > 0 && boxesIntersect(mark, box);
    if (mark.kind === 'point') return boxesIntersect({ x: mark.x - 3, y: mark.y - 3, width: 6, height: 6 }, box);
    const dx = mark.x2 - mark.x1;
    const dy = mark.y2 - mark.y1;
    let start = 0;
    let end = 1;
    const boundaries = [[-dx, mark.x1 - box.x], [dx, box.x + box.width - mark.x1], [-dy, mark.y1 - box.y], [dy, box.y + box.height - mark.y1]];
    for (const [direction, distance] of boundaries) {
      if (direction === 0) { if (distance < 0) return false; }
      else {
        const position = distance / direction;
        if (direction < 0) start = Math.max(start, position);
        else end = Math.min(end, position);
        if (start > end) return false;
      }
    }
    return true;
  }

  function inspect(container) {
    const errors = [];
    const warnings = [];
    const charts = [];
    const expectedFonts = new Map();
    for (const svg of container.querySelectorAll('svg[data-chart-id]')) {
      const metadata = svg.__searchart;
      const bounds = svg.getBoundingClientRect();
      const transform = svg.getScreenCTM();
      const fonts = {};
      if (Math.abs(transform.a - 1) > 0.001 || Math.abs(transform.d - 1) > 0.001) errors.push(`${metadata.id}: SVG is scaled relative to CSS pixels.`);
      for (const text of svg.querySelectorAll('text')) {
        const style = getComputedStyle(text);
        if (style.display === 'none' || style.visibility === 'hidden' || !text.textContent.trim()) continue;
        const box = text.getBoundingClientRect();
        if (box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1) errors.push(`${metadata.id}: ${text.dataset.role} text is outside the SVG: ${text.textContent}`);
        const role = text.dataset.role;
        if (role) {
          const font = { family: style.fontFamily, size: style.fontSize };
          fonts[role] = font;
          const signature = JSON.stringify(font);
          if (expectedFonts.has(role) && expectedFonts.get(role) !== signature) errors.push(`${metadata.id}: inconsistent ${role} typography.`);
          else expectedFonts.set(role, signature);
        }
        if (text.dataset.axisUnit === 'percent' && !text.textContent.trim().endsWith('%')) errors.push(`${metadata.id}: percentage tick is missing %. `);
        if ((role === 'x-label' || role === 'x-context') && /rotate\s*\(/i.test(text.getAttribute('transform') ?? '')) errors.push(`${metadata.id}: x-axis labels must be horizontal or vertical.`);
        if (text.dataset.layoutConflict === 'true') warnings.push(`${metadata.id}: label needs visual review: ${text.textContent}`);
      }
      const labelBoxes = [...svg.querySelectorAll('text[data-role="value-label"]')].map((text) => {
        const background = [...svg.querySelectorAll('rect[data-role="label-box"]')].find((box) => box.dataset.series === text.dataset.series && box.dataset.index === text.dataset.index);
        const measured = (background ?? text).getBBox();
        return { text: text.textContent, x: measured.x, y: measured.y, width: measured.width, height: measured.height };
      });
      labelBoxes.forEach((box, index) => {
        if (labelBoxes.slice(index + 1).some((other) => boxesIntersect(box, other))) errors.push(`${metadata.id}: overlapping data labels near ${box.text}; increase the shared rowHeight or adjust label positions.`);
        if (svg.__searchartGeometry.some((mark) => mark.kind === 'segment' && markIntersectsBox(mark, box))) errors.push(`${metadata.id}: a data label covers a curve near ${box.text}; adjust label positions or the shared rowHeight.`);
      });
      charts.push({ ...metadata, fonts });
    }
    if (!charts.length) errors.push('No rendered SearChart SVGs were found.');
    return { ok: errors.length === 0, errors, warnings, charts };
  }

  global.SearChart = { mount, inspect };
})(globalThis);
