# 档位启用开关设计（止盈 + 降本）

- 日期:2026-07-18
- 状态:已批准,待实现计划
- 范围:`src/strategy-logic.js`、`main.js`(含 @sync 内联策略逻辑)、`test/strategy-logic.test.js`
- 关联:复用现有 `catchAll` / `dca` 组别的 `enabled` 开关模式与 `buildToggleChip` 视觉语言

## 背景

止盈/降本是两个「档位型」策略,共用一个档位编辑页 `renderTiersEdit`:

- **止盈** `takeProfit.tiers = [{minRate, ratio}]`:收益率达档 → 卖 `1/ratio`。`planSells` 按 minRate 升序遍历,取**最高命中档**。
- **降本** `costReduce.tiers = [{maxLoss, amount}]`:亏损达档 → 买入。`planBuys` 按 maxLoss 升序遍历,取**最浅命中档**(首个)。

档位一旦填入就会永久参与判断,用户无法「暂时停用某档而保留配置」。需要每档一个启用开关,关掉的档不参与命中,但配置保留,随时可重新打开。

## 目标

1. 止盈、降本**每个档位**各自带一个启用开关(止盈和降本都加,因 `renderTiersEdit` 共用)。
2. 关掉的档**视为不存在**(回退语义):命中逻辑跳过禁用档,取相邻的启用档。
3. UI 上每档用一个**标签左圆点**(●/○)表达状态,点标签区切换,禁用态整行变灰,即时持久化。
4. 旧配置(无 `enabled` 字段)零迁移兼容,默认视为启用。

## 非目标

- 不改 `catchAll` 兜底档(它已有独立开关,语义独立,不受档位开关影响)。
- 不改档位的编辑/删除/添加交互与即时排序持久化逻辑。
- 不动 base/dca 策略。
- 不改采集、parse、存储格式(tier 对象自然多一个可选字段)。

## 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 禁用语义 | **回退**:关掉视为不存在,取相邻启用档 | 算法可预测;例:止盈档 [10%,15%,20%] 关 15%,收益 17% → 命中 10%(卖 1/8)。与「档位阶梯取最高/最浅启用命中」直觉一致 |
| 适用范围 | 止盈 + 降本都加 | `renderTiersEdit` 共用,统一加开关比加参数分支更简单,两套档位体验一致 |
| 开关位置 | 标签左圆点 ●/○,点标签区切换 | 比行尾三 chip 并排更紧凑;禁用整行变灰,状态一眼可见 |
| 数据兼容 | `t.enabled !== false` 兜底 | 旧 tier 无字段时默认启用,无需迁移代码,`DEFAULT_CFG` 不动 |

## 核心语义（回退算法）

### 止盈 `planSells`（strategy-logic.js + main.js @sync）

当前:遍历排序后的 tiers,`if (f.rate >= t.minRate) tier = t`,取最后命中(最高档)。

改为:`if (f.rate >= t.minRate && t.enabled !== false) tier = t`——跳过禁用档,仍取**最高启用命中档**。

边界:
- 收益落在某禁用档区间 → 回退到更低的启用档(如关 15%、收益 17% → 10% 档)。
- 所有命中档都被禁用 → `tier` 保持 null → 不卖(等价该基金此轮不止盈)。
- 收益本就不到最低启用档 → 不变,不卖。

### 降本 `planBuys`（strategy-logic.js + main.js @sync，costReduce 段）

当前:遍历排序后的 tiers,`if (!tier && f.rate >= -t.maxLoss) tier = t`,取首个(最浅档)。

改为:`if (!tier && t.enabled !== false && f.rate >= -t.maxLoss) tier = t`——跳过禁用档,仍取**最浅启用命中档**。

边界:
- 禁用最浅档(如关 5%):小亏损(如 -4%)无更浅启用档 → 不命中(不买);中等亏损(如 -7%)→ 命中更深的启用档(如 10%)。
- 全部启用档都不命中 + `catchAll.enabled` → 兜底档接管(逻辑不变)。

## 数据模型与兼容

- tier 对象新增可选字段 `enabled:boolean`。缺省/未定义 = 启用。
- `DEFAULT_CFG.strategies.{takeProfit,costReduce}.tiers` **不**显式写 `enabled`(保持简洁,缺省即启用)。
- `migrateStrategy` 对 takeProfit/costReduce 的 tiers 是整体搬运(`has('tiers') ? saved.tiers : default`),旧 tier 无 `enabled` 字段时,靠算法侧 `!== false` 兜底,无需改迁移代码。
- 新建档位(UI「+ 添加」)默认 `enabled:true`。

## UI 设计（renderTiersEdit，降本/止盈共用）

当前每行:`[标签 lab, weight=1] [ctl: 编辑 | 删除]`。

改为:`[圆点 ●/○] [标签 lab, weight=1, 可点] [ctl: 编辑 | 删除]`。

- 圆点 + 标签共同构成可点切换区(`lab` 与圆点都绑 on click → toggle `t.enabled`)。
- **启用态**:圆点 `●` 暖墨色 `#3d342a`,标签正常色 `#3d342a`,行背景 `#fffdf8`、描边正常。
- **禁用态**:圆点 `○` 灰 `#b8b1a6`,标签灰 `#a89e8a`,行背景更浅 `#f6f4ef`、描边更淡。
- 切换后:`t.enabled = !t.enabled` → `persist()` → `ui.post(render)` 重绘(沿用现有即时持久化)。
- `fmt(t)` 文案不变;禁用态靠圆点+灰表达,不在文案里加字。
- 编辑档位(`cardForm`)不暴露 `enabled`(只改 minRate/ratio 或 maxLoss/amount);深拷贝已保留 `enabled` 字段,保存后不丢。

### 配置页概览 & 运行报告文案

- `buildStrategyCard` 的 paramText(止盈/降本):停用档追加 ` 停` 标记,如 `15%→1/7 停`,让概览准确反映实际生效档。
- 运行报告(main.js 末段策略 param)同步标注。

## 改动清单

| 文件 | 位置 | 改动 |
|---|---|---|
| `src/strategy-logic.js` | `planSells` 止盈遍历 | 加 `t.enabled !== false` 过滤 |
| `src/strategy-logic.js` | `planBuys` 降本遍历 | 加 `t.enabled !== false` 过滤 |
| `main.js` | 内联 @sync `planSells` | 同步同一处过滤 |
| `main.js` | 内联 @sync `planBuys` 降本段 | 同步同一处过滤 |
| `main.js` | `renderTiersEdit` 每行 | 加圆点 + 标签可点切换 + 禁用视觉 + 即时持久化;新建档 `enabled:true` |
| `main.js` | 止盈/降本卡片 paramText | 停用档标 ` 停` |
| `main.js` | 运行报告策略 param | 停用档标 ` 停` |
| `test/strategy-logic.test.js` | 新增 case | 见下 |

## 测试计划（TDD,先 RED 后 GREEN）

止盈:
- 档 [10%→1/8, 15%→1/7, 20%→1/6],关 15% 档 → rate=0.17 命中 10%(ratio=1/8)。
- 关 10% 档 → rate=0.12 无更浅启用档 → 不卖。
- 关全部启用命中档(收益区间内全关)→ 不卖。
- 旧 tier 无 `enabled` 字段 → 视为启用,行为与现状一致(回归保护)。

降本:
- 档 [5%→10, 10%→20],关 5% 档 → rate=-0.04 不命中;rate=-0.07 命中 10% 档(20)。
- 关中间档 → 跳过取更深的启用档。
- 全部启用档不命中但 `catchAll.enabled` → 仍走兜底(不受档位开关影响)。
- 旧 tier 无 `enabled` → 视为启用(回归)。

## 风险与注意

- **@sync 双份逻辑**:策略纯逻辑在 `src/strategy-logic.js`,main.js 顶部内联同一份(注释标 `@sync`)。两处的 `planBuys`/`planSells` 必须同步改,否则手机端实际行为与单测不一致。实现时以 `src/` 单测驱动,改完逐字同步到 main.js。
- **禁用态概览**:概览 paramText 若不标注停用档,用户会以为某档生效实则被关。必须同步文案。
- **行点击切换 vs 编辑/删除**:圆点+标签区点切换,编辑/删除 chip 各自独立点;确保点击不串(标签区点击不触发 chip)。
