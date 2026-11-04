---
name: sear-chart
description: Use when working on data charts in HTML research reports that need complex annotations, cross-metric comparison, responsive reflow, or consistent report-wide visual styling.
---

# SearChart

从要传达的信息重点和画面构图出发，用共享 SVG 能力制作适配 HTML 长报告的数据图表。

## 开始工作

读取 [设计规则](references/design-rules.md)。涉及绘制、定制构图或导出时，再读取 [SVG 布局与接口](references/svg-layout.md)。

先确认原始数据、字段含义、指标分母、时间窗口和交付尺寸。区分实测数据、派生值与合成示例。参考图用于观察构图和视觉关系，数值与统计口径以原始材料为准。

## 设计与制作

1. 写清本模块要回答的问题、需要同时比较的对象，以及可能改变判断的证据。分析数据后再决定强调内容。
2. 设计画面中的主体、信息层级、阅读顺序、对齐关系与说明位置。多指标组合须有强逻辑必要性，并支持直接交叉比较。
3. 选择视觉编码，再选择实现方式。内置 `bar`、`line`、`combo`、`stacked` 可承载适合的编码，特殊构图使用 `custom` 和 `draw(context)`。
4. 在报告层确定字体、角色字号、图高基准和间隔。颜色按当前模块的论证重点及语义关系安排，并维护跨图语义身份的可识别性。
5. 制作自包含 ES 模块，默认导出 `report`。数据、辅助函数与 `draw` 放在同一模块，浏览器全局 `d3` 由导出工具提供。
6. 生成 HTML，在整行、半行和窄容器中实际渲染、导出截图并核验。根据结果修改输入模块，再重新生成产物。

## 必须落实的设计约束

- 同一报告中的图内标题、横轴、图例及其他同角色文字，分别采用统一字体与字号。
- 单图和双图排版遵循同一图高基准。双图宽度按可用行宽扣除间隔后分配，示例尺寸只表达排版关系。
- 百分比值使用小数比例，`0.73` 显示为 `73%`。每个百分比轴刻度都带 `%`，并说明分母。
- 横轴文字仅横排或竖排。阶段、事件等附注放在对应“第 N 天”等主标签下方。
- 图例名称精简、配色收敛。图例少时横排居中，多时右侧单列。先用合适的图内空白，空间不足时为右侧图例留出独立区域。
- 标签优先极值、异常和剧变。折线标签通过位置偏移与框线避免遮挡。
- 默认竭力避免同时展示双纵轴。隐藏一侧数值轴时，每个非缺失值均有对应标签承接读数。多维、多标签场景用网格辅助读数并减少数值标签。
- 柱形采用紧凑间距，保持组内、组间及不同节点之间的关系可辨。
- 正负来源贡献使用有符号数值表达。完整非负构成才适用 100% 结构堆叠。

完整条件、响应式取舍和参考图修正规则见 [设计规则](references/design-rules.md)。

## 运行

运行环境需要 Node.js 20 或更新版本。首次配置时，在技能目录中安装锁定依赖和 Chromium，再运行测试及示例。

```powershell
npm ci
npx playwright install chromium
npm test
npm run demo
```

已有可用浏览器时，可将其可执行文件路径设为环境变量 `PLAYWRIGHT_EXECUTABLE_PATH`，然后运行测试和导出。

使用 [示例模块](examples/demo.mjs) 查看完整接口用法。示例数据均为合成数据，实际任务按原始数据和所需构图编写输入模块。

`npm run demo` 的 `../.validation` 是源包演示输出。实际任务将输入模块、HTML 和 PNG 放在用户指定工作区。将 `$searChartSkillDirectory` 设为技能目录、`$taskDirectory` 设为任务工作区的明确路径后调用脚本。

```powershell
node "$searChartSkillDirectory/scripts/render.mjs" --input "$taskDirectory/chart.mjs" --output "$taskDirectory/report.html" --screenshots --check
```

`--input` 指向自包含 ES 模块，默认导出报告对象。`--output` 指定生成 HTML 的路径。`--screenshots` 生成 wide、half、narrow 三组 PNG，`--check` 检查几何、字体、格式和布局例外。可用 `--width` 与 `--narrow-width` 指定核验宽度，具体值按展示场景选择。

输入中的定制函数通过浏览器模块执行。保留 `draw` 及其辅助函数，使用 ES 模块作为输入格式。

导出工具将运行时与 D3 内联到 HTML。依赖安装完成后，生成的自包含 HTML 可离线打开。截图和测试需要 Playwright 可用的浏览器。

## 核验与交付

- 核对原始值、派生计算、比例分母、轴范围、单位、缺失值和标注锚点。
- 检查需要交叉比较的指标是否同画面可读，同节点关系是否清楚。
- 检查全报告字体、角色字号、共同图高、图例排布和语义配色。
- 查看实际 PNG，检查遮挡、裁切、换行、重点层级、紧凑柱间距及附注对齐。
- 核对 `--check` 和真实浏览器测试结果，修复几何等错误，逐项查看 warnings 对应的实际截图，并说明仍存在的布局例外。

自动检查覆盖可测的约束，视觉效果以实际渲染结果继续审查。交付用户要求的 HTML 或 PNG，并说明数据来源、统计口径和仍影响使用的限制。
