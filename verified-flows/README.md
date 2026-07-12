# Verified Flows — 已跑通流程参考库

记录在支付宝自动化中**实际跑通**的端到端流程脚本。每个脚本都是自包含的探针，可直接在 AutoX.js 里 F5 运行。后续复杂调试/新功能开发时，从这里借鉴已验证的定位方式和退出策略。

## 约定

- **前置**:运行前支付宝停在哪个页面,脚本头部注明
- **输出**:所有脚本写日志到 `/sdcard/<name>_out.txt`(用 `adb pull` 拉回分析)
- **失败即 dump**:任何步骤失败,立即抓取当前界面全部元素(text/desc/id/cls/bounds/clickable)到日志,便于定位
- **不 mutate 手机状态**:除 dry-run(只走到密码页就退出)外,不做真实交易

## 已跑通流程

| # | 脚本 | 流程 | 关键发现 |
|---|------|------|----------|
| 01 | [01_fund_detail_pwd_exit.js](./01_fund_detail_pwd_exit.js) | 持有页→点基金进详情→点买入→填金额→点确认支付→到密码页→点关闭按钮退出→点返回按钮回持有页 | 见下方「01 关键发现」 |
| 02 | [02_multi_fund_pwd_flow.js](./02_multi_fund_pwd_flow.js) | 连续 6 只基金完整支付流程(dry-run);核心验证:**窗口范围外的基金直接 accessibility click 不滑动**能否进详情 | 见下方「02 关键发现」 |

---

### 01 — `01_fund_detail_pwd_exit.js`

**流程**: 持有页 → 详情页 → 买入 → 填金额 → 确认支付 → 密码页 → 关闭密码弹窗 → 返回持有页 (dry-run, 不真实下单)

**前置**: 支付宝停在 `理财-基金-持有` 页(用户保证)

**输出**: `/sdcard/test_pwd_flow_out.txt`

**关键发现**(踩坑记录,后续借鉴):

1. **基金卡片是 Button 不是 TextView** —— 持有页基金卡片用 `className("android.widget.Button").find()` 扫,匹配 `金额:.*昨日收益:`。不靠滚动,一次性扫全部。

2. **确认按钮要用精确匹配** —— `text("确认支付")` 或 `textMatches(/^确\s*定$/)`。**不要**用泛 `确认` 正则,会在跳转残留页误点(买入流程有两层确认:确认金额 → 确认支付)。

3. **密码页是原生 Activity 不是 H5** —— `currentActivity=com.alipay.mobile.verifyidentity.module.password.pay.ui.PayPwdDialogActivity`。关闭按钮靠 id 不靠 text。

4. **关闭按钮 closeimg 是 ImageView 且 `click=false`,点它无效!** 真正可点的是它的祖先 `closelayout`:
   - `id=com.alipay.android.phone.mobilecommon.verifyidentity:id/closelayout`
   - `clickable=true`,`desc="关闭按钮"`,bounds=[108,562][252,706]
   - 必须直接按 id 找 closelayout 并 `.click()`,坐标点 closeimg 中心不触发
   - closelayout 的 `parent()` 上溯 8 层也可能拿不到 clickable(节点对象失效),所以**直接 id 找最稳**

5. **指纹页切密码键盘**:点 `text("使用密码")` 展开数字键盘,之后才出现 closelayout。指纹页关闭按钮是另一个 id:`com.alipay.android.phone.seauthenticator.iotauth:id/close`。

6. **回持有页用混合退回策略**(对齐 main.js `backToHoldPage`):
   - `tapBackBtn` 为主(找 XRiver H5 返回按钮 id:`frameLayout_backButton` / `auiconView_backButton`,不退出 App)
   - 找不到返回按钮 → `back()` 兜底
   - 5 轮都没回 → `launchPackage` 重导航 + back 退栈
   - 关闭密码页后,从密码页回持有页通常要过 2 层 H5(买入确认页 → 详情页 → 持有页),tapBackBtn 每层都找得到

7. **dump 兜底**:任意步骤失败 → `dumpAndFail(reason)` 抓 9 种 class 全元素 + currentActivity,写到日志后 exit。这是调试主武器。

**复用要点**:写新流程时,直接复制本脚本的 `dumpAndFail` / `tapRe` / `tapConfirm` / `clickableAncestor` / `onHoldPage` / `tapBackBtn` 这套工具函数,改主流程即可。

---

### 02 — `02_multi_fund_pwd_flow.js`

**流程**: 连续 6 只基金,每只走完整 dry-run 支付流程(持有页→详情→买入→填金额→确认支付→密码页→关闭→返回持有页→下一只)

**状态**: ✅ 已跑通(6/6 全过,2026-07-12)

**核心验证目标**: **窗口范围外的基金直接 `pick.click()`(accessibility click),不滑动** —— 验证 H5 不可见元素能否靠 accessibility 触发跳转,从而简化 main.js `navToDetail` 的滑动逻辑。

**前置**: 支付宝停在 `理财-基金-持有` 页(用户保证)

**输出**: `/sdcard/test_multi_out.txt`

**实测结论**:
- ✅ 窗口外基金 accessibility click **完全可行** —— 6 只里 4 只是窗口外(`visible=false`,bounds top>bottom 的异常 Rect),全部靠 `pick.click()` 成功进详情。**main.js `navToDetail` 的滑动逻辑可简化掉**。
- ✅ 协议勾选问题已解决(见下方关键发现 2)

**02 关键发现**(实测沉淀):

1. **窗口外元素 accessibility click 可靠** —— H5 持有列表里窗口外的基金卡片,`bounds` 是异常 Rect(top>bottom 或 top 超出屏幕),但 `node.click()`(accessibility click)能正常触发跳转进详情。**不需要先滑动可见再坐标 click**。对照 main.js `navToDetail` 现在的滑动+坐标 click 逻辑,可简化为直接 `pick.click()`。

2. **协议勾选是「可选」的,按基金而异** —— 买入确认页底部有「确 定」按钮,部分基金(首次买入)还需先勾选协议复选框才会生效:
   - 协议文案常驻:`textContains("点击确定代表您知悉")`(Button, `click=true`)
   - **是否需要勾选的判据**:界面出现 `text("请勾选")` 提示 → 未勾选,需点协议框;无此提示 → 已勾选或不需要,跳过
   - **安全做法**:只在检测到「请勾选」提示时才点协议框。**不要无条件点**,否则会对已勾选的基金取消勾选
   - 实测:6 只里第 3、6 只需勾选,其余 4 只跳过

3. **卡顿白屏用轮询等,不用固定 sleep** —— 第 3 只首次跑时点买入后白屏(`act=XRiverActivity` 只有 nebulax 框架节点)。`waitFor(checkFn, timeout, interval)` 轮询等关键元素(买入按钮/EditText/密码页)出现,比固定 `sleep(3500)+findOne` 可靠。`enterDetailNoScroll` 还在轮询失败时重新找节点再点一次(原 pick 节点白屏时可能失效)。

4. **失败即终止,不兜底重导航** —— 任何步骤失败 → `dumpExit()` dump 全界面 + exit。回持有页只用 `tapBackBtn`/`back`,回不到就终止。**不引入 launchPackage 重导航这种额外变量**,保证每只基金起点都是真实持有页状态,测试可复现。

5. **回持有页通常 2 次 tapBackBtn** —— 关闭密码页后,从密码页回持有页要过 2 层 H5(买入确认页 → 详情页 → 持有页),实测稳定 2 次 tapBackBtn 到持有页(脚本循环最多 5 次兜底)。

**复用要点**: 测多只基金/批量操作时,复制本脚本的 `runOne(name)` 单只流程函数 + `listFundCards()` 列表收集 + `waitFor()` 轮询 + `dumpExit()` 失败终止,外层 for 循环改数量即可。协议勾选逻辑可直接搬到 main.js `buy()`。
