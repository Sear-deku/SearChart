# SVG 布局与接口

## 技术边界

HTML/CSS 负责报告布局。SVG 承载每张图的标题、图例、轴、数据图元和附注。D3 提供比例尺和几何能力，复杂构图通过 `draw(context)` 实现。

报告输入使用自包含 ES 模块并默认导出对象。导出工具将该模块、D3 和运行时内联到 HTML，通过浏览器模块执行输入，以保留定制函数及同模块辅助函数。

## 报告对象

```javascript
export default {
  title: '报告标题',
  description: '数据来源、时间窗口及比例分母',
  theme: {
    fontFamily: 'system-ui, "Microsoft YaHei", "PingFang SC", sans-serif',
    titleSize: 16,
    axisSize: 12,
    legendSize: 12,
    labelSize: 12
  },
  rowHeight: 360,
  gap: 24,
  rows: [
    {
      charts: [
        {
          id: 'daily-share',
          title: '各节点占比',
          type: 'line',
          categories: ['第1天', '第2天', '第3天'],
          contexts: ['', '活动开始', ''],
          series: [
            {
              key: 'share',
              name: '目标人群占比',
              values: [0.42, 0.58, 0.73],
              unit: 'percent',
              emphasis: 'focus'
            }
          ],
          y: { unit: 'percent', domain: [0, 1], visible: true },
          legend: { placement: 'auto' },
          labels: [{ series: 'share', index: 2 }]
        }
      ]
    }
  ]
}
```

该示例使用合成数据。字体字号、图高与间隔按报告需要设定，并在整份报告中统一。

每行 `charts` 可容纳一张或两张图。`gap` 控制间隔，`rowHeight` 是每张图共同的高度基准。

## 图表字段

| 字段 | 约定 |
| --- | --- |
| `id` | 报告内唯一标识 |
| `title` | 图内标题 |
| `type` | `bar`、`line`、`combo`、`stacked` 或 `custom` |
| `categories` | 横轴主标签字符串数组 |
| `contexts` | 可选，与主标签等长的附注数组 |
| `series` | 数据系列数组 |
| `y` | 主轴单位、可选范围 `domain` 和可见性 `visible` |
| `secondaryY` | 可选，第二轴使用相同的轴结构 |
| `legend.placement` | `auto`、`row`、`right` 或 `none` |
| `stackMode` | 堆叠使用 `percent` 或 `diverging` |
| `labels` | 重点标签数组，每项指定 `series` 键与从零开始的 `index`，可选 `text` |
| `draw` | `custom` 构图的同步绘制函数 |

`series` 每项使用以下字段。

```javascript
{
  key: 'series-key',
  name: '系列名称',
  values: [0.42, null, 0.73],
  unit: 'percent',
  kind: 'line',
  axis: 'primary',
  color: '#426F9F',
  group: '同一语义组',
  emphasis: 'focus',
  dash: false
}
```

`key`、`name`、`values` 和 `unit` 为系列的基本信息。`values` 与 `categories` 等长，值为有限数值或 `null`。`unit` 为 `percent` 或 `number`。

`kind` 可选 `bar` 或 `line`，用于组合编码。`axis` 可选 `primary` 或 `secondary`。颜色、语义组、强调和虚线均为可选，`emphasis` 使用 `focus` 或 `context`。

百分比一律传入比例小数。`percent` 结构堆叠的各列非负且合计 `1`，`diverging` 保留有符号原值。

## 挂载与检查

浏览器加载全局 `d3` 和 `runtime/searchart.js` 后调用以下接口。CLI 生成的 HTML 已完成资源内联和加载。

```javascript
const mounted = await globalThis.SearChart.mount(container, report)
const result = globalThis.SearChart.inspect(container)
mounted.redraw()
mounted.destroy()
```

`mount` 等待字体及首次绘制，返回重绘和销毁方法。`redraw()` 同步重算整个报告。`destroy()` 释放该挂载的尺寸监听。

`inspect` 返回 `{ ok, errors, warnings, charts }`。`errors` 和 `warnings` 为字符串数组，每个图表记录包含 `id`、`width`、`height`、`plot`、`legend` 和 `fonts`，其中 `legend` 包含实际 `placement` 与 `bounds`。

检查覆盖文本边界、跨图角色字体、百分比刻度及 SVG 坐标与显示尺寸的映射，结合截图继续审查。

## 定制构图

`custom` 模式的实际图元由 `draw(context)` 绘制，`series` 提供比例尺、图例和数据定义。标题、图例、坐标及横轴附注由运行时共享绘制。

`draw(context)` 在每次尺寸重排时重新执行，按新尺寸绘制定制图元与附加标注。

| 字段 | 含义 |
| --- | --- |
| `svg` | 当前 SVG 的 D3 selection |
| `plot` | 绘图区的 `x`、`y`、`width`、`height` |
| `width`、`height` | 当前 SVG 的实际 CSS 像素尺寸 |
| `xScale` | 以 `categories` 为定义域的 `scaleBand` |
| `yScale` | 主轴线性比例尺 |
| `secondaryYScale` | 第二轴比例尺，在配置第二轴时使用 |
| `theme` | 当前报告主题 |
| `d3` | 可用的 D3 全局对象 |
| `addText` | `addText(text, attrs = {}, role = 'value-label')`，返回 D3 selection |

比例尺直接返回 SVG 绝对坐标。类别中心使用 `xScale(category) + xScale.bandwidth() / 2`，纵向数值位置直接使用 `yScale(value)` 或 `secondaryYScale(value)`。

定制构图沿用语义配色与报告级文字样式。`addText` 默认使用 `theme.labelSize` 与 `theme.fontFamily`，通过 `attrs` 设置坐标、对齐、填色或字重。可用角色为 `title`、`x-label`、`x-context`、`y-label`、`legend` 和 `value-label`，同角色文字使用一致字号。数据图元使用明确的数据映射，并维护标注锚点。

原始数据标记可用 `data-series`、`data-index`、`data-value` 记录系列键、节点索引及原值，便于核对。内置柱、堆叠块和折线点已携带这些信息。

定制函数依赖的常量和辅助函数放在输入 ES 模块中。每次绘制根据 `context` 提供的实际尺寸重新计算坐标和分区。

## 实际尺寸与文字测量

SVG 使用与实际 CSS 宽高对应的坐标系，保持一个用户单位对应一个 CSS 像素。容器变化通过 `ResizeObserver` 触发重排，按新宽度重新计算几何与文字占位。

`viewBox` 的整体缩放会同时缩放文字。只给文字设置 `font-size: 12px` 仍会受到该变换影响，应重新计算布局及 SVG 尺寸。

文字测量等待字体加载完成，使用实际字体和字号。多行横轴附注、图例和重点标签都纳入空间预算。

首版使用统一系统字体栈。同一报告共享角色字体与字号，跨机器像素一致时需要提供可嵌入的字体资源。

## 导出与验证

运行环境需要 Node.js 20 或更新版本。空环境先在技能目录安装锁定依赖和浏览器。

```powershell
npm ci
npx playwright install chromium
```

已有可用浏览器时，将其可执行文件路径设为环境变量 `PLAYWRIGHT_EXECUTABLE_PATH`。运行命令沿用当前环境中的实际路径。

```powershell
node scripts/render.mjs --input examples/demo.mjs --output ../.validation/demo.html --screenshots --check
npm test
```

可用 `npm run demo` 执行完整示例导出，`../.validation` 为源包演示路径。实际任务按用户要求，将输入模块和生成结果放在明确的任务工作区，并用技能脚本的明确路径执行。

```powershell
node "$searChartSkillDirectory/scripts/render.mjs" --input "$taskDirectory/chart.mjs" --output "$taskDirectory/report.html" --screenshots --check
```

执行前将 `$searChartSkillDirectory` 和 `$taskDirectory` 分别设为本次实际使用的技能目录与任务工作区路径。`--width` 和 `--narrow-width` 为可选核验参数，按目标展示场景设置。

输入模块保持自包含，生成 HTML 内联运行时与 D3。`--screenshots` 生成 wide、half、narrow PNG。half 将视口减半、重新测量布局并截取第一张图。审查记录的 `views` 包含 wide、half、narrow 三种实际核验结果。

`--check` 检查可测的布局约束。几何等错误须修复，warnings 须逐项查看对应截图并判断处理。浏览器加载完成、字体就绪并完成当前尺寸绘制后，再查看截图和检查结果。

使用 Playwright 的真实浏览器执行测试。文字、图元与坐标的几何结果可以自动检查，重点是否清楚、比较是否顺畅和构图是否合适仍需查看实际截图。
