# flash-html

极速 Markdown → wuch-ai-ui 预装版式 HTML。

`templates/kit.css` 是唯一视觉真值源。

## v3 交互能力

页面自带阅读进度条、四按钮工具条（源码预览弹窗 / 复制 Markdown / 导出 PNG / 打印 PDF）、锚点导航、可点击 KPI 带、可交互时间线与图表、可筛选卡片区和可检索目录。内容默认全部可见，不依赖视口进场动画，截图 / 打印 / 嵌入式预览都不会丢内容。

新增指令：`@nav`、`@cards`/`@card`、`@catalog`/`@cat`；扩展：`@band`、`@flow`、`@chart`。详见 `SKILL.md`。

## Install

```bash
npx skills add CCharlie-xiu/flash-html -y
```

或：

```bash
npx skills add https://github.com/CCharlie-xiu/flash-html -y
```
