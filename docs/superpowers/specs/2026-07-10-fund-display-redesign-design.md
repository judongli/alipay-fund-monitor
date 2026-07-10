# 手机端基金展示界面优化设计

- 日期:2026-07-10
- 状态:已批准,待实现计划
- 范围:`main.js`(AutoX.js 手机端,单文件)
- 关联:迁移 `monitor/template.js`(ADB 浏览器端)的搜索 + 排序能力

## 背景

项目有两套交付物:

- `main.js` —— 手机端 AutoX.js,卡片式展示,**纯展示无交互**(仅顶部「采集」按钮触发后台采集)。
- `monitor/`(`collect.js` + `template.js` → `dashboard.html`)—— ADB 端,采集后生成浏览器 HTML,**已有**「名称搜索 + 5 列排序 + 表头点击排序」交互。

用户希望把 ADB 端那套搜索 + 排序迁移到手机端,并把刷新(采集)按钮做得更好看。视觉延续现有米白纸感。

## 目标

1. 在 `main.js` 的 `body` 内新增**工具区**:名称搜索框 + 排序标签条。
2. 排序 5 项:金额 / 昨日 / 持有 / 收益率 / 名称,**固定降序**(名称用 `localeCompare`),照搬 ADB 的 `filter → sort`。
3. 刷新按钮:文字「采集」→ **圆形图标 ↻**。
4. 视觉精修:卡片描边 + 圆角、chip、搜索框,沿用纸感配色。

## 非目标

- 不改采集 / parse / 存储 / 数据格式。
- 不加升降序切换、涨跌筛选、金选 / 定投筛选(用户未选)。
- 不引入新依赖,不动 `monitor/` 与 `src/`。

## 现状关键事实(实现参考)

- `main.js` 数据流:`loadData() → render(d)`;`btn.on("click")` 后台线程 `collectFunds() → saveData → render`。
- `render(d)`:`body.removeAllViews()` → hero → 统计单文本块 → 卡片 `forEach` inflate → 页脚。
- ADB `template.js` 的核心逻辑(待迁移):
  - `sortKey="amount"`,`sortDir=-1`,`query=""`
  - `filter`:`f.name.toLowerCase().indexOf(query) >= 0`
  - `sort`:name → `sortDir * localeCompare`;数值 → `sortDir * (x - y)`
  - 当前 `sortKey` 的 chip `active` 高亮
- 配色(两端一致):底 `#f6f4ef`、纸面 `#fffdf8`、墨 `#1c1a17`、muted `#8b857b`、描边 `#e7e1d4`、涨 `#c0392b`、跌 `#2e8b57`、零 `#8b857b`。

## 设计

### 布局

保留 `vertical > header(horizontal) + scroll#body`。header 右侧刷新按钮改为圆形。`body` 内顺序:hero → 统计行 →【新增工具区】→ 卡片流 → 页脚。

工具区:

- `EditText` 搜索框:纸色底 + 描边 + 圆角,placeholder「搜索基金名称…」。
- 排序标签条:`horizontal` 内 5 个 chip,选中项深墨底白字 + `▼`,未选中纸色描边灰字。

### 状态与交互

新增模块级状态:`sortKey="amount"`、`sortDir=-1`、`query=""`。

拆分渲染:

- `render(d)`:hero / 统计 / 工具区骨架 / 页脚(汇总类),末尾调用 `renderList(d)`。
- `renderList(d)`:调用 `applyQuerySort` 得到过滤排序后的列表,重建卡片流,并更新页脚计数(N / 共 M)与空匹配提示。

纯函数:

```js
applyQuerySort(funds, query, sortKey, sortDir)
  → funds.slice()
        .filter(f => !query || f.name.toLowerCase().indexOf(query) >= 0)
        .sort((a, b) => sortKey === "name"
              ? sortDir * a.name.localeCompare(b.name)
              : sortDir * (a[sortKey] - b[sortKey]))
```

不可变(`slice` 复制,不改原数组,与 ADB 的 `slice()` 一致)。

事件:

- 搜索框 `addTextChangedListener` → `query = text.toLowerCase()` → `renderList(currentData)`。
- chip `click` → `sortKey = key`(`sortDir` 恒 `-1`)→ 重绘高亮 + `renderList`。
- 刷新 `click`:同现有采集流程;完成后 `render(data)`,**保留当前 `query` / `sortKey`**。

### 视觉精修

- 卡片:加描边 `#e7e1d4` + 圆角(`GradientDrawable.setCornerRadius`)。
- chip / 搜索框:描边 + 圆角;chip 选中态深墨白字。
- 刷新按钮:`GradientDrawable.setShape(OVAL)` + `#1c1a17`,白色 `↻`(约 40dp)。
- 圆角与圆形均由代码构建 `GradientDrawable` 实现(AutoX.js 无 CSS,这是原生 View 还原纸感圆角的正确方式)。

### 边界

- 无数据:空态提示,工具区不渲染。
- 搜索无匹配:卡片区显示「没有匹配的基金」(迁移 ADB 的 empty 提示)。
- 采集失败:保留现有 toast,**不破坏已显示数据**。
- 采集中:刷新按钮置灰。

## 验证

AutoX.js 无单测框架,靠真机 F5:

1. 启动渲染已存数据 → hero / 统计 / 工具区 / 卡片正常。
2. 搜索框输入 → 列表实时过滤 + 页脚计数变化 + 空匹配提示。
3. 依次点 5 个 chip → 顺序正确(数值项降序、名称 `localeCompare` 降序)+ 当前 chip 高亮。
4. 点刷新 → 采集流程正常,完成后数据更新且**保留当前筛选**。
5. 截图比对纸感、圆角、圆形按钮、chip 高亮。

`applyQuerySort` 是纯函数,额外配 Node 单测锁定排序逻辑,降低真机调试成本。

## 文件影响

- 改:`main.js`
- 新增(可选):`test/apply-query-sort.test.js`(Node 单测)
- 不动:采集 / parse / 存储、`monitor/`、`src/`
- 无新依赖

## 取舍(已定)

- 采集中按钮:**仅置灰**,不做旋转动画(AutoX.js 动画成本高、收益低)。
- `applyQuerySort` 抽纯函数 + 配 Node 单测。
