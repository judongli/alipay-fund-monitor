# 档位启用开关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给止盈/降本每个档位加启用开关,关掉的档视为不存在(回退),UI 用标签左圆点切换、禁用整行变灰。

**Architecture:** 纯逻辑先行(TDD):`src/strategy-logic.js` 的 `planSells`(止盈)、`planBuys` 降本段各加一处 `t.enabled !== false` 过滤,配套单测;再逐字 @sync 到 `main.js` 顶部内联的同一份逻辑;最后改 `main.js` 的 `renderTiersEdit` UI(圆点开关)与概览/报告文案。

**Tech Stack:** Node.js(策略单测)、AutoX.js(`main.js` 手机端 UI,单文件)、无新依赖。

## Global Constraints

- **旧 tier 兼容**:旧 tier 对象无 `enabled` 字段时必须视为启用 —— 算法一律用 `t.enabled !== false`(缺省/undefined 都走启用分支),**零迁移代码**。`DEFAULT_CFG.strategies.{takeProfit,costReduce}.tiers` 不新增 `enabled` 字段。
- **catchAll 兜底档独立**:降本 `catchAll` 有自己的 `enabled`,**不受**档位 `enabled` 影响,逻辑保持不变。
- **@sync 双份**:`src/strategy-logic.js` 与 `main.js` 内联(注释标 `@sync`)的 `planBuys`/`planSells` 必须逐字一致。src 用单测驱动,改完逐字同步到 main.js。
- **commit message 格式**:`<type>: <desc>`,**不加** Co-Authored-By/attribution(用户全局规则禁用)。
- **文案停用标注**用精确 `t.enabled === false`(只有明确禁用才标「停」;旧数据无字段不误标)。
- **AutoX.js 约定**:整数 sp、保留 inflate 的 `id`(如 `lab`/`dot`/`ctl`)、`COL()` 转颜色、`ui.post(render)` 重绘、`setAlpha` 做按下反馈。无 root,单文件。

## File Structure

| 文件 | 责任 | 本次改动 |
|---|---|---|
| `src/strategy-logic.js` | 策略纯逻辑(node 可测,与 main.js @sync) | `planSells` 止盈遍历、`planBuys` 降本遍历各加 enabled 过滤 |
| `test/strategy-logic.test.js` | 策略单测 | 追加止盈/降本档位开关 case |
| `main.js` | AutoX.js 手机端(含 @sync 内联策略逻辑 + UI) | @sync 同步两处过滤;`renderTiersEdit` 圆点开关;概览/报告文案 |

---

## Task 1: 止盈档位启用过滤(纯逻辑 + 单测)

**Files:**
- Modify: `src/strategy-logic.js:120-122`(planSells 止盈遍历)
- Test: `test/strategy-logic.test.js`(在末尾 `console.log` 前追加)

**Interfaces:**
- Consumes: `S.takeProfit.tiers = [{minRate, ratio, enabled?}]`(`enabled` 可选,缺省=启用)
- Produces: `planSells` 行为变更 —— 跳过 `enabled===false` 的档,取最高启用命中档;旧 tier 无字段行为不变

- [ ] **Step 1: 写失败测试**

在 `test/strategy-logic.test.js` 的最后一行 `console.log('✅ strategy-logic tests passed');` **之前**插入:

```js
// ---- 档位启用开关:关掉的档视为不存在,回退到相邻启用档 ----
// 止盈:档 [10%,15%,20%],关 15% → 收益 17% 回退到 10% 档(1/8)
var STpSw = { takeProfit: { enabled: true, tiers: [
    { minRate: 0.10, ratio: 8 }, { minRate: 0.15, ratio: 7, enabled: false }, { minRate: 0.20, ratio: 6 },
] } };
assert.strictEqual(planSells([{ name: 'X', rate: 0.17 }], STpSw)[0].ratio, 1 / 8);  // 回退 10%档
// 关掉的高档不影响更高收益:25% 仍命中启用的 20% 档(1/6)
assert.strictEqual(planSells([{ name: 'X', rate: 0.25 }], STpSw)[0].ratio, 1 / 6);
// 关最低档 10% → 收益 12% 无更浅启用档 → 不卖
var STpLo = { takeProfit: { enabled: true, tiers: [
    { minRate: 0.10, ratio: 8, enabled: false }, { minRate: 0.20, ratio: 6 },
] } };
assert.strictEqual(planSells([{ name: 'X', rate: 0.12 }], STpLo).length, 0);
// 全部命中档都关 → 不卖
var STpAll = { takeProfit: { enabled: true, tiers: [
    { minRate: 0.10, ratio: 8, enabled: false }, { minRate: 0.20, ratio: 6, enabled: false },
] } };
assert.strictEqual(planSells([{ name: 'X', rate: 0.25 }], STpAll).length, 0);
// 旧 tier 无 enabled 字段 → 视为启用(回归保护):都启用,17% 命中最高档 20%(1/6)
var STpLegacy = { takeProfit: { enabled: true, tiers: [{ minRate: 0.10, ratio: 8 }, { minRate: 0.20, ratio: 6 }] } };
assert.strictEqual(planSells([{ name: 'X', rate: 0.17 }], STpLegacy)[0].ratio, 1 / 6);

```

- [ ] **Step 2: 跑测试确认失败**

Run: `node test/strategy-logic.test.js`
Expected: 抛 `AssertionError` —— 关 15% 时 17% 仍命中 15% 档(1/7),不等于期望的 1/8。(脚本无 try/catch,首个 assert 失败即抛出退出,非 0 退出码)

- [ ] **Step 3: 写最小实现**

修改 `src/strategy-logic.js` 的 `planSells`,把止盈遍历那一行(原 `if (f.rate >= t.minRate) tier = t;`)加 enabled 过滤。改后该段为:

```js
        // tiers 自动按 minRate 升序(收益低→高),遍历取最后命中即最高匹配档
        var tpTiers = (S.takeProfit.tiers || []).slice().sort(function (a, b) { return a.minRate - b.minRate; });
        tpTiers.forEach(function (t) {
            if (f.rate >= t.minRate && t.enabled !== false) tier = t;  // 跳过禁用档,取最高启用命中档
        });
```

(仅改 `if` 条件,新增 `&& t.enabled !== false`;注释从「取 minRate 最高且 <= rate 的档」更新为「跳过禁用档,取最高启用命中档」)

- [ ] **Step 4: 跑测试确认通过**

Run: `node test/strategy-logic.test.js`
Expected: 末行输出 `✅ strategy-logic tests passed`,退出码 0(含新增 5 条止盈开关 assert + 原有全部)。

- [ ] **Step 5: commit**

```bash
git add src/strategy-logic.js test/strategy-logic.test.js
git commit -m "feat: 止盈档位启用开关(关掉视为不存在,回退启用命中档)"
```

---

## Task 2: 降本档位启用过滤(纯逻辑 + 单测)

**Files:**
- Modify: `src/strategy-logic.js:71`(planBuys 降本遍历,一行)
- Test: `test/strategy-logic.test.js`(在 Task 1 追加块之后、`console.log` 之前追加)

**Interfaces:**
- Consumes: `S.costReduce.tiers = [{maxLoss, amount, enabled?}]`,`S.costReduce.catchAll = {enabled, amount}`(独立)
- Produces: `planBuys` 降本段行为变更 —— 跳过 `enabled===false` 的档,取最浅启用命中档;catchAll 兜底逻辑不变

- [ ] **Step 1: 写失败测试**

在 `test/strategy-logic.test.js` 的 `console.log('✅ strategy-logic tests passed');` **之前**(Task 1 的止盈开关块之后)插入:

```js
// ---- 降本档位启用开关:关掉的档视为不存在,取最浅启用命中档 ----
// 关最浅 5% 档 → 小亏损(-4%)回退到 10% 档(20 元)
var SCrSw = { base: { enabled: false }, dca: { enabled: false },
    costReduce: { enabled: true, tiers: [
        { maxLoss: 0.05, amount: 10, enabled: false }, { maxLoss: 0.10, amount: 20 },
    ], catchAll: { enabled: false, amount: 30 } } };
assert.strictEqual(planBuys([{ name: 'X', amount: 500, rate: -0.04 }], SCrSw, [])[0].amount, 20);
// 关中间档(10%) → rate=-0.10 本应命中 10%(20),禁用后取更深启用 15% 档(30)
var SCrMid = { base: { enabled: false }, dca: { enabled: false },
    costReduce: { enabled: true, tiers: [
        { maxLoss: 0.05, amount: 10 }, { maxLoss: 0.10, amount: 20, enabled: false }, { maxLoss: 0.15, amount: 30 },
    ], catchAll: { enabled: false, amount: 40 } } };
assert.strictEqual(planBuys([{ name: 'X', amount: 500, rate: -0.10 }], SCrMid, [])[0].amount, 30);
// 全部启用档都关 → 不买(catchAll 也关)
var SCrAllOff = { base: { enabled: false }, dca: { enabled: false },
    costReduce: { enabled: true, tiers: [
        { maxLoss: 0.05, amount: 10, enabled: false }, { maxLoss: 0.10, amount: 20, enabled: false },
    ], catchAll: { enabled: false, amount: 30 } } };
assert.strictEqual(planBuys([{ name: 'X', amount: 500, rate: -0.04 }], SCrAllOff, []).length, 0);
// catchAll 不受档位开关影响:启用档都不命中(超最深)+ catchAll 开 → 走兜底 50
var SCrCa = { base: { enabled: false }, dca: { enabled: false },
    costReduce: { enabled: true, tiers: [
        { maxLoss: 0.05, amount: 10, enabled: false }, { maxLoss: 0.10, amount: 20, enabled: false },
    ], catchAll: { enabled: true, amount: 50 } } };
assert.strictEqual(planBuys([{ name: 'X', amount: 500, rate: -0.20 }], SCrCa, [])[0].amount, 50);
// 旧 tier 无 enabled 字段 → 视为启用(回归保护):-4% 命中最浅 5% 档(10 元)
var SCrLegacy = { base: { enabled: false }, dca: { enabled: false },
    costReduce: { enabled: true, tiers: [{ maxLoss: 0.05, amount: 10 }, { maxLoss: 0.10, amount: 20 }], catchAll: { enabled: false, amount: 30 } } };
assert.strictEqual(planBuys([{ name: 'X', amount: 500, rate: -0.04 }], SCrLegacy, [])[0].amount, 10);

```

- [ ] **Step 2: 跑测试确认失败**

Run: `node test/strategy-logic.test.js`
Expected: 抛 `AssertionError` —— 关 5% 时 -4% 仍命中 5% 档(10),不等于期望的 20。

- [ ] **Step 3: 写最小实现**

修改 `src/strategy-logic.js` 的 `planBuys` 降本遍历那一行(原 `crTiers.forEach(function (t) { if (!tier && f.rate >= -t.maxLoss) tier = t; });`),加 enabled 过滤:

```js
            crTiers.forEach(function (t) { if (!tier && t.enabled !== false && f.rate >= -t.maxLoss) tier = t; });
```

(在 `f.rate >= -t.maxLoss` 前插入 `t.enabled !== false &&`;catchAll 兜底分支 line 73-76 **不动**)

- [ ] **Step 4: 跑测试确认通过**

Run: `node test/strategy-logic.test.js`
Expected: 末行 `✅ strategy-logic tests passed`,退出码 0。

- [ ] **Step 5: commit**

```bash
git add src/strategy-logic.js test/strategy-logic.test.js
git commit -m "feat: 降本档位启用开关(关掉视为不存在,回退最浅启用命中档)"
```

---

## Task 3: @sync 档位开关到 main.js 内联逻辑

**Files:**
- Modify: `main.js:165`(降本遍历)、`main.js:206`(止盈遍历)

**Interfaces:**
- Consumes: Task 1/2 改好的 `src/strategy-logic.js` 作为「真源」
- Produces: 手机端实际运行的 `main.js` 内联 `planBuys`/`planSells` 与 src 逐字一致

`main.js` 是 AutoX.js 单文件,内联了与 `src/strategy-logic.js` 逐字相同的 `planBuys`/`planSells`(注释标 `@sync`)。本任务把 Task 1/2 的两处改动同步过去。无独立单测(靠逐字对齐 + Task 6 设备验证)。

- [ ] **Step 1: 同步降本遍历(main.js:165)**

把 `main.js` 内联 `planBuys` 里这一行:

```js
            crTiers.forEach(function (t) { if (!tier && f.rate >= -t.maxLoss) tier = t; });
```

改为(与 src Task 2 一致):

```js
            crTiers.forEach(function (t) { if (!tier && t.enabled !== false && f.rate >= -t.maxLoss) tier = t; });
```

- [ ] **Step 2: 同步止盈遍历(main.js:206 附近)**

把 `main.js` 内联 `planSells` 里的 forEach 块:

```js
        tpTiers.forEach(function (t) {
            if (f.rate >= t.minRate) tier = t;  // 取 minRate 最高且 <= rate 的档
        });
```

改为(与 src Task 1 一致):

```js
        tpTiers.forEach(function (t) {
            if (f.rate >= t.minRate && t.enabled !== false) tier = t;  // 跳过禁用档,取最高启用命中档
        });
```

- [ ] **Step 3: 对齐校验**

Run: `diff <(grep -A0 "crTiers.forEach" main.js) <(grep -A0 "crTiers.forEach" src/strategy-logic.js)` 以及人工核对两处 `tpTiers.forEach` 的 `if` 条件在 main.js 与 src 完全一致。
Expected: 两处过滤条件字符一致(注释可不同,条件表达式必须相同)。

- [ ] **Step 4: commit**

```bash
git add main.js
git commit -m "chore: @sync 档位启用开关到 main.js 内联 planBuys/planSells"
```

---

## Task 4: renderTiersEdit 圆点开关 UI

**Files:**
- Modify: `main.js:1388-1413`(档位行 render)、`main.js:1426`(新建档位默认 enabled)

**Interfaces:**
- Consumes: `buildActionChip`、`roundRect`、`COL`、`ui.post`、`persist`/`render`(renderTiersEdit 内部闭包)、tier 对象新增可选 `enabled`
- Produces: 档位编辑页每行圆点 ●/○,点圆点或标签切换启用,禁用整行变灰,即时持久化;新建档位默认启用

无自动化测试(AutoX.js UI)。靠代码审查 checklist + Task 6 设备验证。

- [ ] **Step 1: 改档位行,加圆点 + 可点切换 + 禁用视觉**

把 `renderTiersEdit` 内 `list.forEach(function (t, i) { ... })` 整个行渲染块(line 1388-1413)替换为下面这版(在 `<horizontal>` 里 `lab` 前加 `dot`,行背景/圆点/标签按 `en` 着色,`dot` 与 `lab` 各绑 click 切换):

```js
            list.forEach(function (t, i) {
                var en = t.enabled !== false;
                var row = ui.inflate(
                    <vertical bg="#fffdf8" padding="14 13" margin="0 0 0 8">
                        <horizontal gravity="center_vertical">
                            <text id="dot" textSize="15sp" padding="0 0 8 0" />
                            <text id="lab" textSize="13sp" textStyle="bold" textColor="#3d342a" layout_weight="1" />
                            <horizontal id="ctl" gravity="center_vertical" />
                        </horizontal>
                    </vertical>);
                row.setBackground(roundRect(en ? "#fffdf8" : "#f6f4ef", 12, en ? "#e7e1d4" : "#ece4d3", 1));
                row.dot.setText(en ? "●" : "○");
                row.dot.setTextColor(COL(en ? "#3d342a" : "#b8b1a6"));
                row.lab.setText(fmt(t));
                row.lab.setTextColor(COL(en ? "#3d342a" : "#a89e8a"));
                var toggle = function () {
                    t.enabled = !en;
                    persist("已" + (en ? "停用" : "启用"));
                    ui.post(render);
                };
                row.dot.on("click", function () { row.dot.setAlpha(0.5); toggle(); });
                row.lab.on("click", function () { row.lab.setAlpha(0.6); toggle(); });
                row.ctl.addView(buildActionChip("编辑", "#f6f4ef", function () {
                    var pre = {}; pre[fields[0].k] = t[fields[0].k] * (fields[0].scale || 1); pre[fields[1].k] = t[fields[1].k];
                    cardForm("编辑档位", fields.map(function (f) {
                        return { key: f.k, label: f.label, inputType: f.scale ? "number" : "number" };
                    }), pre, function (obj) {
                        var va = +obj[fields[0].k], vb = +obj[fields[1].k];
                        if (isNaN(va) || isNaN(vb)) { toast("请填数字"); ui.post(render); return; }
                        t[fields[0].k] = va / (fields[0].scale || 1); t[fields[1].k] = vb;
                        persist("已更新"); ui.post(render);
                    });
                }));
                row.ctl.addView(buildActionChip("删除", "#f7eeeb", function () {
                    list.splice(i, 1); persist("已删除"); ui.post(render);
                }));
                body.addView(row);
            });
```

要点:`en = t.enabled !== false`(旧档无字段=启用);编辑档位的 `cardForm` 保存只写 `fields[0]/fields[1]` 两个 key,**不碰 `t.enabled`**,所以编辑后启用状态保留。

- [ ] **Step 2: 新建档位默认 enabled:true**

把 `renderTiersEdit` 末尾「+ 添加档位」的 `list.push(t)` 那一行(line 1426 附近),由:

```js
                var t = {}; t[fields[0].k] = va / (fields[0].scale || 1); t[fields[1].k] = vb;
                list.push(t); persist("已添加"); ui.post(render);
```

改为:

```js
                var t = {}; t[fields[0].k] = va / (fields[0].scale || 1); t[fields[1].k] = vb; t.enabled = true;
                list.push(t); persist("已添加"); ui.post(render);
```

- [ ] **Step 3: 代码审查 checklist**

人工核对(Read 改后的 renderTiersEdit):
- [ ] `dot` 与 `lab` 都在 inflate 的 `<horizontal>` 内,且 `lab` 保留 `layout_weight="1"`(否则标签不占满、chip 错位)
- [ ] `dot.on("click")` 与 `lab.on("click")` 都调 `toggle()`,且 `ctl` 里的编辑/删除 chip 各自独立 `on("click")`(点 chip 不触发 toggle)
- [ ] `toggle` 内 `t.enabled = !en` 后 `persist()` 会排序+存盘,`ui.post(render)` 重绘
- [ ] 编辑档位分支未引入 `t.enabled` 赋值(状态保留)
- [ ] 禁用态:`dot=○` 灰、`lab` 灰、行背景 `#f6f4ef` 更浅

- [ ] **Step 4: commit**

```bash
git add main.js
git commit -m "feat: 档位编辑页圆点开关(标签左圆点切换,禁用整行变灰)"
```

---

## Task 5: 概览卡片 + 运行报告标注停用档

**Files:**
- Modify: `main.js:806`(降本卡片 paramText)、`main.js:823`(止盈卡片 paramText)、`main.js:1973`(报告降本 param)、`main.js:1974`(报告止盈 param)

**Interfaces:**
- Consumes: tier 对象的 `enabled` 字段
- Produces: 配置页策略卡片概览、运行报告策略 param 对停用档追加「 停」

- [ ] **Step 1: 配置页降本卡片 paramText 标注停用**

`main.js:806` 降本卡片的 paramText 表达式里,tier map 由:

```js
        (S.costReduce.tiers.map(function (t) { return (t.maxLoss * 100) + "%内→" + t.amount + "元"; }).join(" / ") || "无档位") + crCatchAll, S.costReduce.enabled, function (en) {
```

改为(每档尾部按 `=== false` 追加「 停」):

```js
        (S.costReduce.tiers.map(function (t) { return (t.maxLoss * 100) + "%内→" + t.amount + "元" + (t.enabled === false ? " 停" : ""); }).join(" / ") || "无档位") + crCatchAll, S.costReduce.enabled, function (en) {
```

- [ ] **Step 2: 配置页止盈卡片 paramText 标注停用**

`main.js:823` 止盈卡片 paramText 由:

```js
        S.takeProfit.tiers.map(function (t) { return (t.minRate * 100) + "%→1/" + t.ratio; }).join(" / ") || "无档位", S.takeProfit.enabled, function (en) {
```

改为:

```js
        S.takeProfit.tiers.map(function (t) { return (t.minRate * 100) + "%→1/" + t.ratio + (t.enabled === false ? " 停" : ""); }).join(" / ") || "无档位", S.takeProfit.enabled, function (en) {
```

- [ ] **Step 3: 运行报告降本 param 标注停用**

`main.js:1973` 报告 costReduce.param 的 tier map 由:

```js
        costReduce: { side: '买', sub: '亏损时按档位加码 · 全局', param: ((S.costReduce.tiers || []).map(function (t) { return (t.maxLoss * 100) + '%内→' + t.amount + '元'; }).join(' / ') || '无档位') + (S.costReduce.catchAll && S.costReduce.catchAll.enabled ? ' / 兜底→' + S.costReduce.catchAll.amount + '元' : '') },
```

改为(tier map 内每档尾部加「 停」):

```js
        costReduce: { side: '买', sub: '亏损时按档位加码 · 全局', param: ((S.costReduce.tiers || []).map(function (t) { return (t.maxLoss * 100) + '%内→' + t.amount + '元' + (t.enabled === false ? ' 停' : ''); }).join(' / ') || '无档位') + (S.costReduce.catchAll && S.costReduce.catchAll.enabled ? ' / 兜底→' + S.costReduce.catchAll.amount + '元' : '') },
```

- [ ] **Step 4: 运行报告止盈 param 标注停用**

`main.js:1974` 报告 takeProfit.param 由:

```js
        takeProfit: { side: '卖', sub: '收益率达档位卖等比份额 · 全局', param: (S.takeProfit.tiers || []).map(function (t) { return (t.minRate * 100) + '%→1/' + t.ratio; }).join(' / ') || '无档位' }
```

改为:

```js
        takeProfit: { side: '卖', sub: '收益率达档位卖等比份额 · 全局', param: (S.takeProfit.tiers || []).map(function (t) { return (t.minRate * 100) + '%→1/' + t.ratio + (t.enabled === false ? ' 停' : ''); }).join(' / ') || '无档位' }
```

- [ ] **Step 5: commit**

```bash
git add main.js
git commit -m "feat: 概览卡片与运行报告标注停用档"
```

---

## Task 6: 验证

**Files:** 无改动,仅验证。

- [ ] **Step 1: 策略单测全绿**

Run: `node test/strategy-logic.test.js`
Expected: 末行 `✅ strategy-logic tests passed`,退出码 0。包含原有全部 + Task 1 止盈开关 5 条 + Task 2 降本开关 5 条。

- [ ] **Step 2: main.js 内联逻辑对齐复查**

Run: `grep -n "t.enabled !== false" main.js src/strategy-logic.js`
Expected: 命中 4 行 —— main.js(降本、止盈各 1)、src(降本、止盈各 1),条件表达式完全一致。

- [ ] **Step 3: 文案标注复查**

Run: `grep -n "=== false ? \" 停\"" main.js` (或 `grep -n "停" main.js` 人工核对 4 处)
Expected: 配置页降本/止盈 paramText、报告降本/止盈 param 共 4 处带停用标注。

- [ ] **Step 4: 设备端验证 checklist(用户在手机跑)**

部署 `main.js` 到 AutoX.js 后人工验证:
- [ ] 进入「止盈档位」编辑页:每档左侧有圆点 ●,点圆点或标签文字 → 圆点变 ○、整行变灰、toast「已停用」,刷新后仍为停用(持久化)
- [ ] 再点 → 变回 ●、恢复颜色、toast「已启用」
- [ ] 「+ 添加档位」新建的档默认 ● 启用
- [ ] 编辑某档(改 minRate/ratio)后,其启用状态保持不变
- [ ] 配置页止盈/降本卡片概览里,停用档显示「 停」
- [ ] 实跑一次策略:止盈档关 15% 时,收益 17% 的基金走 10% 档卖出比例(回退生效)

- [ ] **Step 5: 收尾**

确认所有 commit 在 `worktree-tier-enabled-switch` 分支:
Run: `git log --oneline main..HEAD`
Expected: 5 个 feat/chore commit(design doc 在更早的 commit,不在此区间)。

退出 worktree 前与用户确认合并方式(`ExitWorktree` keep 或 remove;若 remove 需先确认改动已合并/推送)。

---

## 风险与回滚

- **@sync 漏改**:若只改 src 忘改 main.js,手机端行为与单测不符。Task 6 Step 2 的 grep 4 行命中是硬校验。
- **UI 点穿**:`dot`/`lab` 与编辑/删除 chip 的 click 必须互不干扰。Task 4 Step 3 checklist 已列。
- **旧数据**:用户既有 tiers 无 `enabled`,算法 `!== false` 兜底启用,行为与现状完全一致;一旦在 UI 切换过某档,该 tier 才写入 `enabled`。无破坏性。
- **回滚**:整组改动在独立分支 `worktree-tier-enabled-switch`,不合就不影响 main。
