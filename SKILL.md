---
name: flash-html
description: >-
  用户提问后极速出 wuch-ai-ui 题头/版式/装饰图 HTML 页。正文写普通 Markdown；版式用一行
  @layout 选型（不要 JSON、不要自写 CSS）。含高精度骨架屏、语义色彩 Token、图表、单向流程、
  行内实时校验。Use when 快速展示 / flash-html / 秒出 HTML / wuch-ai-ui 回答页 / 预装版式展示 /
  骨架屏 / 图表页.
---

# flash-html

**纯 MD 只管文字。题头、版式、图形已预装（wuch-ai-ui 冷白双表面 + 深松绿）。**

`templates/kit.css` = **唯一视觉真值源**（Token + 版式 + 组件）。`tokens.css` 已废弃并入。render 整份内联 kit.css。禁止另写 CSS、禁止维护第二份 token。

## 2 步

1. 写 `.flash-html/answer.md`（正文怎么答就怎么写）
2. `node ~/.cursor/skills/flash-html/scripts/render.mjs .flash-html/answer.md --open`

禁止 JSON。禁止发明 CSS。排版时不要读 `kit.css`（样式已预装）。

## 文件头（最多几行，可选）

```markdown
@layout report
@chip 测试
@band 状态|就绪
@band 范围|本机

# 标题
> lede: 一句话导语

正文…
```

`@layout` 只选一个名字：

| 名 | 页面 |
| --- | --- |
| `answer` | 题头 + 单栏（默认） |
| `report` | 汇报题头带 + 正文 |
| `split` | 左装饰图 / 右文；可用 `---` 分左右文 |
| `cards` | 每个 `##` 变一张卡 |
| `compare` | 双栏对比（正文用 `---` 切开） |

## 内容级指令（写在正文任意位置，输出顺序即视觉顺序）

### `@skeleton` — 高精度骨架屏

行高块高度直接取自 `kit.css` 的 `--lh-*` 变量，与真实文字共用同一份真值；
图标圆圈 = 真实图标尺寸。加载完成时**零布局跳动**（有回归测试守着）。

```markdown
@skeleton 段落
@skeleton 表格
@skeleton 步骤
@skeleton 列表
```

### `@chart` — 图表

格式：`@chart 类型|标题|标签:值,标签:值`
类型：`bar`（默认）/ `line` / `donut`

```markdown
@chart bar|各渠道接入量|官网:128, 应用商店:96
@chart line|迭代耗时|第一次:52, 第二次:44
@chart donut|流量来源|自然搜索:1420, 直接访问:860
```

- 单序列柱状图走 pine 明度阶梯（`--ramp-1..8`）——顺序型数据不要用分类色
- 分类色板 `--chart-1..6` 色相分离 + 明度交替，实测全部 ≥5.16:1 on 白底
- 数字标签一律等宽（tabular-nums）

### `@flow` — 单向流程条

格式：`@flow 标题:说明|标题:说明|...`
视线只向右推进，节点表达「到哪一步」。已完成填松绿实心，当前描边 + 呼吸微动效。

```markdown
@flow 采集:读取原始指标|对齐:核对口径|生成:套用色板
```

### `@expand` — 可展开详情

格式：`@expand 标题|正文；正文；正文`
原生 `<details>`，无需 JS。打印时自动展开全部，不丢内容。适合放完整清单、明细、补充说明。

```markdown
@expand 完整仓库清单（40 个）|flash-html · aoci-wuch；wuch-ai · grid-builder-h5
```

### `@field` — 行内实时校验

格式：`@field 标签|占位符|提示`
空值不出结论；有值才校验；信息出现在输入框正下方，不弹窗、不跳页。

```markdown
@field 工作邮箱|name@example.com|用于接收构建结果通知
```

## 表格

数字列自动识别 → 右对齐 + 等宽数字。位数变化不会让列宽跳动、视线不横跳。

## 强调手段

- `**加粗**` — 行内重点
- `==高亮==` — 松绿底强调（标签、关键词，不喧哗）
- `> 结论：…` / `> 注意：…` / `> 普通说明` — 三色高亮块（ok 绿 / warn 黄 / info 蓝），前缀会自动剥离不重复显示
- `**标题**` 独占一行配合列表 — 轻量分组

## 页面自带工具条（v2.2，无需正文声明）

渲染出的每页右上角固定三个按钮：

- **复制** — 复制本页源 Markdown（render 自动注入，随时可二次编辑）
- **图片** — 导出整页 2x PNG（DOM → SVG data URL → canvas，无外部依赖、离线可用）
- **PDF** — 调用系统打印，另存为 PDF（打印样式已优化：A4、去阴影、隐藏工具条、折叠块自动展开）

内容默认全部可见，无滚动进场动画——保证截图、打印、嵌入式预览都不丢内容。打印样式收敛在 kit.css 的 `@media print`。


## v3 交互指令（完整 7 项能力）

| 指令 | 作用 |
| --- | --- |
| `@nav` | 锚点导航条，自动映射正文 `##` 标题，平滑滚动 + 滚动高亮 |
| `@band 键\|值\|锚点id\|count` | KPI 指标，点击跳转；`count` 开启数字计数 |
| `@flow 标题:说明｜标签1,标签2 详情\|...` | 可交互时间线，节点/上一步下一步切换，联动详情与标签 |
| `@chart bar/donut/line\|标题\|数据` | 可交互图表：环形悬停联动圆心与洞察胶囊；柱状支持数量/占比切换与柱条说明 |
| `@cards 标签1,标签2` + `@card 名\|标签\|摘要\|详情\|预览组` | 可筛选卡片区，标签药丸过滤，展开收起，迷你切换体验 |
| `@catalog 标题` + `@cat 分类\|条目1,条目2` | 可检索目录：实时搜索 + 分类药丸 + 匹配计数 + 条目芯片 |

工具条四按钮：**源码预览弹窗**（读 `#flash-source`）、**复制 Markdown**、**导出 PNG**（导出前自动剔除交互控件避免渲染卡死）、**打印 PDF**。顶部有阅读进度条。

正文 `##` 标题自动带锚点 id，可被 `@band` 跳转引用。打印时交互控件全部隐藏、折叠内容全部展开。

## 自检

```bash
node ~/.cursor/skills/flash-html/scripts/skeleton-precision.test.mjs
```

验收标准：骨架与真实内容高度逐项相等（±0.05px）。改 `kit.css` 的行高变量后必跑。

## AI 决策只剩：**要不要写、选哪个 layout、正文写什么**。
