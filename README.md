# 支付宝基金监控 · 策略交易（AutoX.js）

> ⚠️ **本项目会自动执行真实支付宝基金买入/卖出，涉及真实资金。使用前务必阅读[风险提示](#风险提示)。**

基于 [AutoX.js](https://github.com/aiselp/AutoX)（Android 无障碍服务）的支付宝基金持仓监控 + 自动化交易工具：采集全部持仓基金并展示，按策略模板自动买卖，含 dry-run 模拟、真实小额测试入口、审计日志。

## 风险提示

- **真实资金**：真实模式下脚本会按配置自动买入/卖出基金，产生真实扣款，**不可撤销**。
- **个人自用**：仅供作者个人学习与使用，**不构成任何投资建议**。
- **合规**：自动化操作支付宝可能违反其用户协议，使用风险自负。
- **无担保**：按 MIT 许可「as is」提供，不对任何资金损失负责。请务必先用 dry-run 模拟、再用最小金额（1 元）真实测试验证后再放开。

## 功能

- **持仓采集**：自动进入「理财-基金-持有」页，采集全部基金的 名称/持仓金额/昨日收益/持有收益/收益率，合计与页面总额对平。
- **卡片展示**：手机端 UI（红涨绿跌），悬浮窗实时显示采集/交易/策略进度。
- **原子交易**：`buy` / `sell`，支付密码经 Android Keystore（AES-GCM）加密落盘，支持 dry-run（走到密码页前停止）、大额二次确认、审计日志。
- **策略引擎**（四模板，按「组别」控制作用范围，冲突取金额最高）：
  - **底仓 base**：持仓 < 目标 → 补仓
  - **定投 dca**：组别级金额，组内每只各买一笔
  - **降本 costReduce**：亏损按档位加码
  - **止盈 takeProfit**：收益率达档卖等比份额
  - 执行序：先卖后买，逐只 try/catch，单只失败不级联。
- **真实测试（1 元）**：专用入口，对探针筛出的 1 元起购基金真实买入 1 元，验证连续支付链路（金额恒定 1 元，超购在结构上不可能）。

## 安全机制

- `dryRun` 默认开启（模拟·不下单）；真实模式强制要求已设支付密码。
- `checkGuard` 校验金额类型 / 小数精度（≤2 位）/ 上下限；大额二次确认弹窗。
- 真实测试入口金额恒定 1 元；min > 1 的基金会被支付宝拒（记 error 跳过，不扣款）。
- 每只交易独立 try/catch，单只异常不中断批次；失败审计 + 退出回持有页兜底重导航。
- 审计日志：`/sdcard/Download/alipay_trade.log`。

## 技术栈

- **AutoX.js v6**（Android 无障碍服务，JavaScript；实测红米 HyperOS / Android 15）
- **VSCode + Auto.js-Autox.js-VSCodeExt**（Mac ↔ 手机，WiFi 远程）
- **node**（纯逻辑测试）

## 目录结构

```
alipay-fund-monitor/
├── main.js                 # 手机端 App(自包含:采集+展示+交易+策略)
├── project.json            # AutoX.js 项目配置
├── src/                    # 纯逻辑(node 可测,@sync 进 main.js)
│   ├── strategy-logic.js   #   策略计划 planBuys/planSells
│   ├── trade-logic.js      #   护栏/份额/审计
│   └── collector.js recon.js probe-noscroll.js config.js storage.js
├── test/                   # node 测试(三套全绿)
├── verified-flows/         # 已跑通端到端流程脚本 + README(导航/dump/退出复用源)
├── probe-minbuy.js         # 起购金额探针(扫持仓基金筛 1 元起购)
├── probe[1-5]*.js          # 开发期侦察脚本
├── monitor/                # ADB 驱动采集 + HTML 面板(Mac 端)
└── release/                # 打包源(project.json + main.js) + APK(gitignored)
```

## 快速开始

### 手机端运行（F5）
1. 手机装 AutoX.js v6，开启其**无障碍服务** + **悬浮窗**权限。
2. VSCode 装 Auto.js-Autox.js-VSCodeExt，WiFi 连手机，打开 `main.js` → F5。
3. 点 **↻** 采集；点 **⚙** 配置交易/策略；点 **▶** 运行策略。

### 打包成 APK
1. `release/` 内是最新打包源（`main.js` + `project.json`，gitignored 不入库）。
2. `adb push release/ /sdcard/脚本/<项目名>/`。
3. 手机 AutoX.js v6 长按项目 → ⋮ →「打包应用」→ 类型选「界面应用」→ 在线打包（约 30–60s）。
4. `adb pull` APK 回本地 → `adb install`（注意 `pm install /sdcard/x.apk` 会失败，须 `adb install`）。

> 导航 / dump / 退出策略的踩坑沉淀见 [`verified-flows/README.md`](./verified-flows/README.md)。

## 开发

纯逻辑（`src/strategy-logic.js`、`src/trade-logic.js`）与 `main.js` 内联同一份（`@sync`），node 测试三套：

```bash
node test/strategy-logic.test.js   # 策略计划
node test/trade-logic.test.js      # 护栏/份额/审计
node test/apply-query-sort.test.js
```

## 许可证

[MIT](./LICENSE)
