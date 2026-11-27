---
name: flash-html
description: >-
  用户提问后极速出 wuch-ai-ui 题头/版式/装饰图 HTML 页。正文写普通 Markdown；版式用一行
  @layout 选型（不要 JSON、不要自写 CSS）。Use when 快速展示 / flash-html /
  秒出 HTML / wuch-ai-ui 回答页 / 预装版式展示.
---

# flash-html

**纯 MD 只管文字。题头、版式、图形已预装（wuch-ai-ui 冷白双表面 + 深松绿）。**

## 2 步

1. 写 `.flash-html/answer.md`（正文怎么答就怎么写）
2. `node ~/.cursor/skills/flash-html/scripts/render.mjs .flash-html/answer.md --open`

禁止 JSON。禁止发明 CSS。禁止为排版去读 `kit.css`。

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
| `compare` | 双栏对比（正文用 `---` 切开） |
| `cards` | 每个 `##` 变一张卡 |

AI 决策只剩：**要不要写、选哪个 layout、正文写什么**。
