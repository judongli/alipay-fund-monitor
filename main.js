"ui";
// ============================================================
// 支付宝基金监控 — 手机端 UI(单文件,F5 直接运行)
// ============================================================
// 点「采集」→ 自动进支付宝持仓页 → 抓全部基金 → 卡片展示(红涨绿跌)
// 数据存 /sdcard/Download/alipay_funds.json
// ============================================================

// ---------- 常量 ----------
var PKG = "com.eg.android.AlipayGphone";
var ACT = "com.eg.android.AlipayGphone.AlipayLogin";
var DATA_FILE = "/sdcard/Download/alipay_funds.json";
var FIND_TO = 6000, WAIT = 1500, LOAD_WAIT = 3000;
var COL = function (h) { return android.graphics.Color.parseColor(h); };
var GD = android.graphics.drawable.GradientDrawable;
// 圆角 / 圆形纸感背景(AutoX.js 无 CSS,用 GradientDrawable 还原)
function roundRect(c, r, sc, sw) { var d = new GD(); d.setCornerRadius(r); d.setColor(COL(c)); if (sc) d.setStroke(sw, COL(sc)); return d; }
// 视图状态:搜索 + 排序(固定降序;名称用 localeCompare)
var SORTS = [["amount", "金额"], ["yesterday", "昨日"], ["holding", "持有"], ["rate", "收益率"], ["name", "名称"]];
var sortKey = "amount", sortDir = -1, query = "", currentData = null, uiList = null, uiFoot = null;
// 页面返回栈:每条 {onBack:fn}。硬件返回键按栈顶逐层回退;空栈则退出 App。
// renderHome/renderConfig/startEditPage 各自 reset/push;浮层卡片(overlay)优先于页面层。
var navStack = [];

// ---------- 格式化 ----------
function money(n) { n = n || 0; return "¥" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function signed(n) { return (n > 0 ? "+" : (n < 0 ? "−" : "")) + money(Math.abs(n || 0)); }
function pct(r) { return (r >= 0 ? "+" : "−") + (Math.abs(r) * 100).toFixed(2) + "%"; }
function hexOf(n) { return n > 0 ? "#c0392b" : (n < 0 ? "#2e8b57" : "#8b857b"); }

// ---------- 悬浮窗(浮在支付宝上方,实时显示当前操作进度)----------
var fw = null, fx = 0, fy = 0, pulse = null;
// 心跳:进行中红点缓慢呼吸;终态(完成/出错/切回)停心跳、定色
function startPulse() {
    if (!fw || pulse) return;
    try {
        var a = new android.view.animation.AlphaAnimation(1, 0.25);
        a.setDuration(750);
        a.setRepeatCount(android.view.animation.Animation.INFINITE);
        a.setRepeatMode(android.view.animation.Animation.REVERSE);
        fw.dot.startAnimation(a); pulse = a;
    } catch (e) {}
}
function stopPulse() {
    if (pulse) { try { pulse.cancel(); } catch (e) {} pulse = null; }
    if (fw) { try { fw.dot.clearAnimation(); } catch (e) {} }
}
// title:小标题(采集进度 / 交易进度 / 策略引擎);op:当前步骤
function openFloaty(title) {
    if (fw) { try { fw.title.setText(title || "进度"); } catch (e) {} return; }
    try { fw = floaty.window(
        <frame>
            <vertical id="card" bg="#fffdf8" w="246" padding="14 11" margin="12">
                <horizontal gravity="center_vertical">
                    <text id="dot" text="●" textColor="#c0392b" textSize="11sp" margin="0 0 6 0" />
                    <text id="title" text="进度" textColor="#8b857b" textSize="10sp" />
                </horizontal>
                <text id="op" text="准备中…" textColor="#3d342a" textSize="13sp" textStyle="bold" margin="0 4 0 0" />
            </vertical>
        </frame>
    ); } catch (e) { console.log("悬浮窗创建失败: " + e); fw = null; return; }
    try {
        fw.card.setBackground(roundRect("#fffdf8", 14, "#e7e1d4", 1));
        fw.title.setText(title || "进度");
        fw.op.setMaxLines(2);
        var dm = context.getResources().getDisplayMetrics();
        fx = Math.floor((dm.widthPixels - 270 * dm.density) / 2); fy = 140; // 顶部居中(270dp = 卡片+边距)
        fw.setPosition(fx, fy);
        startPulse();
        // 入场:中心缩放 + 淡入(DecelerateInterpolator 收尾,有"落定"感)
        var ea = new android.view.animation.AlphaAnimation(0, 1);
        var es = new android.view.animation.ScaleAnimation(0.9, 1, 0.9, 1, android.view.animation.Animation.RELATIVE_TO_SELF, 0.5, android.view.animation.Animation.RELATIVE_TO_SELF, 0.5);
        var set = new android.view.animation.AnimationSet(false); set.addAnimation(ea); set.addAnimation(es); set.setDuration(300); set.setInterpolator(new android.view.animation.DecelerateInterpolator());
        fw.card.startAnimation(set);
    } catch (e) { console.log("悬浮窗样式失败: " + e); }
}
function closeFloaty() {
    if (!fw) return;
    stopPulse();
    var w = fw, card = fw.card; fw = null;
    try {
        var out = new android.view.animation.AlphaAnimation(1, 0); out.setDuration(220);
        out.setAnimationListener(new android.view.animation.Animation.AnimationListener({
            onAnimationStart: function () {}, onAnimationRepeat: function () {},
            onAnimationEnd: function () { try { w.close(); } catch (e) {} }
        }));
        card.startAnimation(out);
    } catch (e) { try { w.close(); } catch (e2) {} }
}
// 统一状态出口:既写日志,又刷新悬浮窗(子线程文本更新需 post 到 UI 线程)
// dotColor 可选:终态用(完成绿 / 出错红 / 切回灰),传入则停心跳、定色
function status(msg, dotColor) {
    console.log(msg);
    if (!fw) return;
    var m = msg, c = dotColor;
    ui.post(function () {
        try {
            fw.op.setText(m);
            if (c) { stopPulse(); fw.dot.setTextColor(COL(c)); }
            var f = new android.view.animation.AlphaAnimation(0.35, 1); f.setDuration(160); fw.op.startAnimation(f); // 步骤切换:轻闪一下
        } catch (e) {}
    });
}

// ---------- 交易纯逻辑(@sync src/trade-logic.js,改动两处同步)----------
// 护栏校验(白名单已移除,改由组别/策略作用范围控制)
function checkGuard(o) {
    if (typeof o.amount !== 'number' || isNaN(o.amount)) return { ok: false, needConfirm: false, reason: '金额非数字' };
    var dec = ("" + o.amount).split('.')[1];
    if (dec && dec.length > 2) return { ok: false, needConfirm: false, reason: '金额小数超过2位:' + o.amount };
    if (!o.amount || o.amount < 1) return { ok: false, needConfirm: false, reason: '金额必须 >=1.00' };
    if (o.amount > o.maxAmount) return { ok: false, needConfirm: false, reason: '金额 ' + o.amount + ' 超上限 ' + o.maxAmount };
    var needConfirm = o.confirmThreshold != null && o.amount > o.confirmThreshold;
    return { ok: true, needConfirm: needConfirm, reason: '' };
}
function ratioToShares(ratio, holdingShares) { return Math.floor(ratio * holdingShares * 100) / 100; }
function buildAudit(o) {
    return JSON.stringify({ ts: o.ts, action: o.action, code: o.code || '', name: o.name || '',
        amount: o.amount != null ? o.amount : '', shares: o.shares != null ? o.shares : '',
        dryRun: !!o.dryRun, status: o.status, msg: o.msg || '' });
}
var TRADE_LOG = "/sdcard/Download/alipay_trade.log";
function appendAudit(line) { try { files.ensureDir(TRADE_LOG); files.append(TRADE_LOG, line + '\n'); return true; } catch (e) { console.log('审计写入失败 ' + e); return false; } }

// ---------- 策略纯逻辑(@sync src/strategy-logic.js,改动两处同步)----------
// 固定四种策略各一份实例,靠内部配置表达差异:
//   base(全局)       持仓<目标 → 买 单次金额
//   dca(组别级)       每个组别自带 dcaEnabled+dcaAmount;"全部基金"有 allEnabled+allAmount。
//                    开关开的组,组内每只基金各按该组金额买一笔。
//   costReduce(全局) 亏损(rate<0)→ 取最浅匹配档金额
//   takeProfit(全局) 收益率达档 → 卖 1/分母
// 关系(买入侧两条道):
//   ① 二选一:base 与 dca 互斥,取金额高者(并列 base>dca)
//   ② 可叠加:costReduce 独立,可与①同时命中
//   ③ 合并:同一只基金若 costReduce 与①都命中 → 金额相加合成一笔买单(减少操作次数)
//   卖出侧:takeProfit 独立,与买入互不影响。
// 金额归属:组别自带定投金额(不再逐基金填 entries);"全部基金"用 dca.allAmount。
// 基金是否在定投作用范围内(groupId='ALL' 表示全部基金)
function fundInGroup(fundName, groupId, groups) {
    if (groupId === 'ALL') return true;
    var g = null;
    (groups || []).forEach(function (x) { if (x.id === groupId) g = x; });
    return !!(g && (g.funds || []).indexOf(fundName) >= 0);
}
// 定投候选金额:收集该基金在所有启用定投来源中的金额(ALL + 各 dcaEnabled 组),返回金额列表
function dcaCandidates(fundName, S, groups) {
    var amts = [];
    if (!S.dca || !S.dca.enabled) return amts;
    if (S.dca.allEnabled && S.dca.allAmount >= 1) amts.push(S.dca.allAmount);
    (groups || []).forEach(function (g) {
        if (g.dcaEnabled && g.dcaAmount >= 1 && (g.funds || []).indexOf(fundName) >= 0) {
            amts.push(g.dcaAmount);
        }
    });
    return amts;
}
function planBuys(funds, S, groups, onlyKeys) {
    var PICK_RANK = { base: 0, dca: 1 };  // 二选一并列优先级:base>dca
    var allow = function (k) { return !onlyKeys || onlyKeys.indexOf(k) >= 0; };
    var orders = [];
    (funds || []).forEach(function (f) {
        var hits = [];
        // ② 可叠加:降本——rate<0,取最浅匹配档
        //   tiers 自动按 maxLoss 升序(亏损小→大),首个 rate>=-maxLoss 即最浅匹配档
        if (allow('costReduce') && S.costReduce && S.costReduce.enabled && f.rate != null && f.rate < 0) {
            var tier = null;
            var crTiers = (S.costReduce.tiers || []).slice().sort(function (a, b) { return a.maxLoss - b.maxLoss; });
            crTiers.forEach(function (t) { if (!tier && t.enabled !== false && f.rate >= -t.maxLoss) tier = t; });
            // 兜底档:普通档都不命中(亏损超过最深档;空 tiers 时任意亏损)→ 启用则用兜底金额
            var catchAll = S.costReduce.catchAll;
            if (!tier && catchAll && catchAll.enabled && catchAll.amount >= 1) {
                tier = { amount: catchAll.amount };
            }
            if (tier) hits.push({ amount: tier.amount, strategy: 'costReduce' });
        }
        // ① 二选一:底仓 vs 定投,取金额高者(并列 base>dca)
        var pick = null;
        if (allow('base') && S.base && S.base.enabled && f.amount != null && f.amount < S.base.target) {
            pick = { amount: S.base.amount, strategy: 'base' };
        }
        if (allow('dca') && S.dca && S.dca.enabled) {
            var dcaAmts = dcaCandidates(f.name, S, groups);
            if (dcaAmts.length) {
                var dcaMax = dcaAmts.reduce(function (a, b) { return a > b ? a : b; });
                if (!pick || dcaMax > pick.amount ||
                    (dcaMax === pick.amount && PICK_RANK.dca < PICK_RANK[pick.strategy])) {
                    pick = { amount: dcaMax, strategy: 'dca' };
                }
            }
        }
        if (pick) hits.push(pick);
        if (!hits.length) return;
        // ③ 合并:所有命中策略金额相加,合成一笔
        var sum = hits.reduce(function (a, h) { return a + h.amount; }, 0);
        var keys = hits.map(function (h) { return h.strategy; });
        orders.push({ name: f.name, amount: sum, strategy: keys.join('+'), strategies: keys });
    });
    return orders;
}
function planSells(funds, S, onlyKeys) {
    var orders = [];
    if (onlyKeys && onlyKeys.indexOf('takeProfit') < 0) return orders;
    if (!S.takeProfit || !S.takeProfit.enabled) return orders;
    (funds || []).forEach(function (f) {
        if (f.rate == null || f.rate <= 0) return;
        var tier = null;
        // tiers 自动按 minRate 升序(收益低→高),遍历取最后命中即最高匹配档
        var tpTiers = (S.takeProfit.tiers || []).slice().sort(function (a, b) { return a.minRate - b.minRate; });
        tpTiers.forEach(function (t) {
            if (f.rate >= t.minRate && t.enabled !== false) tier = t;  // 跳过禁用档,取最高启用命中档
        });
        if (tier) orders.push({ name: f.name, ratio: 1 / tier.ratio, strategy: 'takeProfit' });
    });
    return orders;
}

// ---------- 支付密码加密存储(AES-GCM + Android Keystore,不明文落盘)----------
var KeyStore = java.security.KeyStore;
var KeyGenerator = javax.crypto.KeyGenerator;
var Cipher = javax.crypto.Cipher;
var GCMParameterSpec = javax.crypto.spec.GCMParameterSpec;
var KeyGenParameterSpec = android.security.keystore.KeyGenParameterSpec;
var KeyProperties = android.security.KeyProperties;
var Base64 = android.util.Base64;
var PIN_KEY_ALIAS = "fund_trade_pin_key";
var secretStore = (function () {
    var st = storages.create("fund_trade_secret");
    function getKey() {
        var kp = KeyStore.getInstance("AndroidKeyStore"); kp.load(null);
        if (kp.containsAlias(PIN_KEY_ALIAS)) return kp.getKey(PIN_KEY_ALIAS, null);
        var gen = KeyGenerator.getInstance("AES", "AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(PIN_KEY_ALIAS,
            1 | 2)  // PURPOSE_ENCRYPT=1 | PURPOSE_DECRYPT=2(AutoX.js 访问 KeyProperties 静态字段失败,改数字常量)
            .setBlockModes("GCM").setEncryptionPaddings("NoPadding").build());
        return gen.generateKey();
    }
    function b64(buf) { return Base64.encodeToString(buf, 2); }
    function unb64(s) { return Base64.decode(s, 2); }
    return {
        set: function (pin) {
            var c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, getKey());
            var ct = c.doFinal(new java.lang.String(pin).getBytes("UTF-8"));
            st.put("pin_ct", b64(ct)); st.put("pin_iv", b64(c.getIV())); return true;
        },
        get: function () {
            if (!st.contains("pin_ct")) return null;
            var c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, getKey(), new GCMParameterSpec(128, unb64(st.get("pin_iv"))));
            var pt = c.doFinal(unb64(st.get("pin_ct")));
            return String(new java.lang.String(pt, "UTF-8"));
        },
        has: function () { return st.contains("pin_ct"); },
        clear: function () { st.remove("pin_ct"); st.remove("pin_iv"); }
    };
})();

// ---------- 交易配置(组别 + 上限/dryRun + 策略池)----------
// 白名单已移除 → 改由"组别"(可复用基金集合)控制作用范围;"全部基金"是隐式默认组(groupId='ALL')。
// 定时器已移除 → 策略引擎靠「立即执行」手动触发。
var cfgStore = storages.create("fund_trade_cfg");
var DEFAULT_CFG = {
    maxAmount: 5000, confirmThreshold: 1000, dryRun: true,
    groups: [],                         // [{id, name, funds:[基金名], dcaEnabled, dcaAmount}] "全部"不入库
    strategies: {
        base:       { enabled: false, target: 100, amount: 100 },                       // 全局:持仓<目标 → 买 单次金额
        dca:        { enabled: false, allEnabled: false, allAmount: 100 },               // 组别级:allEnabled/allAmount 管全部基金;各组自带 dcaEnabled/dcaAmount
        costReduce: { enabled: false, tiers: [{ maxLoss: 0.05, amount: 10 }, { maxLoss: 0.10, amount: 20 }], catchAll: { enabled: false, amount: 20 } },
        takeProfit: { enabled: false, tiers: [
            { minRate: 0.10, ratio: 8 }, { minRate: 0.15, ratio: 7 }, { minRate: 0.20, ratio: 6 },
            { minRate: 0.25, ratio: 5 }, { minRate: 0.30, ratio: 4 }, { minRate: 0.35, ratio: 3 },
            { minRate: 0.40, ratio: 2 }, { minRate: 0.45, ratio: 1 } ] },
    },
};
// 旧字段迁移:dca 旧含 groupId/entries(逐基金)→ 新 allEnabled/allAmount(组别级)。旧 entries 无法映射,丢弃重配。
function migrateStrategy(sk, saved) {
    if (!saved || typeof saved !== 'object') return null;
    var has = function (k) { return Object.prototype.hasOwnProperty.call(saved, k); };
    if (sk === 'base') {
        return {
            enabled: has('enabled') ? !!saved.enabled : (has('inPool') ? !!saved.inPool : false),
            target: has('target') ? saved.target : 100,
            amount: has('amount') ? saved.amount : 100,
        };
    }
    if (sk === 'dca') {
        return {
            enabled: has('enabled') ? !!saved.enabled : (has('inPool') ? !!saved.inPool : false),
            allEnabled: has('allEnabled') ? !!saved.allEnabled : false,
            allAmount: has('allAmount') ? saved.allAmount : 100,
        };
    }
    if (sk === 'costReduce') {
        var ca = (has('catchAll') && saved.catchAll) ? saved.catchAll : DEFAULT_CFG.strategies.costReduce.catchAll;
        return {
            enabled: has('enabled') ? !!saved.enabled : (has('inPool') ? !!saved.inPool : false),
            tiers: has('tiers') ? saved.tiers : DEFAULT_CFG.strategies.costReduce.tiers,
            catchAll: { enabled: !!ca.enabled, amount: (ca.amount != null && !isNaN(+ca.amount)) ? +ca.amount : 20 },
        };
    }
    if (sk === 'takeProfit') {
        return {
            enabled: has('enabled') ? !!saved.enabled : (has('inPool') ? !!saved.inPool : false),
            tiers: has('tiers') ? saved.tiers : DEFAULT_CFG.strategies[sk].tiers,
        };
    }
    return null;
}
function loadTradeConfig() {
    var c = {};
    c.maxAmount = cfgStore.contains('maxAmount') ? cfgStore.get('maxAmount') : DEFAULT_CFG.maxAmount;
    c.confirmThreshold = cfgStore.contains('confirmThreshold') ? cfgStore.get('confirmThreshold') : DEFAULT_CFG.confirmThreshold;
    c.dryRun = cfgStore.contains('dryRun') ? cfgStore.get('dryRun') : DEFAULT_CFG.dryRun;
    c.groups = cfgStore.contains('groups') ? (cfgStore.get('groups') || []) : [];
    // 旧 groups 项无 dcaEnabled/dcaAmount,补默认;防御非对象项(避免 null/脏数据崩溃)
    c.groups = c.groups.map(function (g) {
        if (!g || typeof g !== 'object') return { id: genId(), name: '未命名', funds: [], dcaEnabled: false, dcaAmount: 100 };
        return {
            id: g.id, name: g.name, funds: g.funds || [],
            dcaEnabled: g.dcaEnabled === true,
            dcaAmount: (g.dcaAmount != null && !isNaN(+g.dcaAmount)) ? +g.dcaAmount : 100,
        };
    }).filter(Boolean);
    var s = {};
    Object.keys(DEFAULT_CFG.strategies).forEach(function (sk) {
        var saved = cfgStore.contains('strategies.' + sk) ? cfgStore.get('strategies.' + sk) : null;
        var mig = migrateStrategy(sk, saved);
        s[sk] = mig || JSON.parse(JSON.stringify(DEFAULT_CFG.strategies[sk]));
    });
    c.strategies = s;
    return c;
}
function saveTradeConfig(o) { Object.keys(o).forEach(function (k) { cfgStore.put(k, o[k]); }); }
function openConfigUI() { renderConfig(); }

// ---------- 浮层卡片对话框(替代原生 dialogs.* 小白框,纸感风格)----------
// 根布局含 overlay(id) + overlayCard(id)。showCard 渲染卡片并显示;点遮罩不关闭(防误触)。
function showCard(contentView) {
    var card = ui.overlayCard;
    card.removeAllViews();
    card.addView(contentView);
    card.setBackground(roundRect("#fffdf8", 18, "#e7e1d4", 1));
    ui.overlay.setVisibility(0);  // VISIBLE
}
function hideCard() { ui.overlay.setVisibility(8); }  // GONE
// overlay 点击消费(防穿透)在 ui.layout 后绑定(见文件末尾按钮绑定区)

// ---------- 硬件返回键统一分发 ----------
// 优先级:浮层卡片(overlay 可见)→ 页面栈逐层回退 → 退出 App。
// 各页面入口用 resetNav()/pushNav() 维护栈;返回按钮 onClick 也走同一 handleBackPress,保持一致。
function resetNav() { navStack = []; }
// pushNav:普通压栈。pushNavLayer(fn,layer):同 layer 替换栈顶(编辑子页 re-render 用),避免栈膨胀。
function pushNav(onBack) { navStack.push({ onBack: onBack, layer: 0 }); }
function pushNavLayer(onBack, layer) {
    if (navStack.length && navStack[navStack.length - 1].layer === layer) {
        navStack[navStack.length - 1].onBack = onBack;
    } else {
        navStack.push({ onBack: onBack, layer: layer });
    }
}
// 双容器切换:首页视图常驻 ui.body,配置/编辑页用 ui.cfgBody。
// 进配置页隐藏首页、显 cfgBody;返回只切显隐,不重建 42 张卡片 → 零延迟。
function showHome() { ui.cfgBody.setVisibility(8); ui.body.setVisibility(0); }
function showConfig() { ui.body.setVisibility(8); ui.cfgBody.setVisibility(0); }
function handleBackPress() {
    // 1. 浮层卡片打开 → 关卡片(等价于点「取消」遮罩语义)
    if (ui.overlay.getVisibility() === 0) { hideCard(); return true; }
    // 2. 页面栈非空 → 回到上一层(back_pressed 已在 UI 线程,直接调省一帧队列延迟)
    if (navStack.length) { var top = navStack.pop(); top.onBack(); return true; }
    // 3. 已在首页 → 不拦截,放行系统默认(退出 App)
    return false;
}
// 拦截 Activity 返回键:优先用 ui.emitter 的 back_pressed 事件(AutoX.js UI 模式标准通道),
// 兜底用 activity.setBackPressed / onBackPressed(老版本或某些 ROM)。
function installBackHandler() {
    try {
        ui.emitter.on("back_pressed", function (e) {
            try {
                var consumed = handleBackPress();
                if (consumed && e && e.consumed !== undefined) e.consumed = true;
            } catch (err) { console.log("back_pressed 处理异常: " + err); }
        });
    } catch (e) { console.log("ui.emitter back_pressed 绑定失败: " + e); }
    try {
        var act = ui.getActivity();
        if (act && typeof act.setBackPressed === "function") {
            act.setBackPressed(function () { handleBackPress(); });
        } else if (act) {
            // 反射兜底:覆写 onBackPressed;首页时由 handleBackPress 返回 false 再调 super 退出
            act.onBackPressed = function () {
                if (handleBackPress()) return;
                try { act.finish(); } catch (e2) {}
            };
        }
    } catch (e) { console.log("activity 返回键兜底失败: " + e); }
}

// 推断输入类型:密码→数字密码;金额/份额/元/份/目标/阈值/上限→数字;否则文本
function inferInputType(title) {
    var t = title || "";
    if (t.indexOf("密码") >= 0) return "numberPassword";
    if (t.indexOf("金额") >= 0 || t.indexOf("份额") >= 0 || t.indexOf("元") >= 0 ||
        t.indexOf("份") >= 0 || t.indexOf("目标") >= 0 || t.indexOf("阈值") >= 0 || t.indexOf("上限") >= 0) return "number";
    return "text";
}

// 选择菜单卡片:标题 + 选项行 + (取消项点选返回 -1)
function cardSelect(title, items, cb, defaultIdx) {
    var list = ui.inflate(
        <vertical padding="4 4 4 2">
            <text id="title" textSize="14sp" textStyle="bold" textColor="#3d342a" padding="12 12 12 8" />
            <vertical id="rows" />
        </vertical>);
    list.title.setText(title);
    items.forEach(function (it, i) {
        var isCancel = (it === "取消" || it === "✕ 取消");
        var row = ui.inflate(
            <horizontal gravity="center_vertical" padding="14 13" margin="6 0 6 2">
                <text id="lab" textSize="13sp" textColor="#3d342a" layout_weight="1" />
            </horizontal>);
        row.lab.setText(it);
        row.setBackground(roundRect(isCancel ? "#f6f4ef" : "#fffdf8", 10, isCancel ? null : "#eee8db", isCancel ? 0 : 1));
        if (isCancel) row.lab.setTextColor(COL("#8b857b"));
        row.on("click", function () {
            hideCard();
            cb(isCancel ? -1 : i);
        });
        list.rows.addView(row);
    });
    showCard(list);
}

// 输入卡片:标题 + input + 确定/取消。inputType 自动推断(数字/密码/文本)
function cardInput(title, prefill, hint, cb, inputType) {
    var it = inputType || inferInputType(title);
    var card = ui.inflate(
        <vertical padding="16 16 14 14">
            <text id="title" textSize="14sp" textStyle="bold" textColor="#3d342a" padding="0 0 0 10" />
            <input id="field" textSize="15sp" textColor="#3d342a" padding="12 12" margin="0 0 14 14" />
            <horizontal>
                <text id="ok" text="✓ 确定" textSize="14sp" textStyle="bold" textColor="#fffdf8" padding="14 12" layout_weight="1" gravity="center" margin="0 0 6 0" />
                <text id="cancel" text="✕ 取消" textSize="14sp" textStyle="bold" textColor="#8b857b" padding="14 12" layout_weight="1" gravity="center" margin="6 0 0 0" />
            </horizontal>
        </vertical>);
    card.title.setText(title);
    if (prefill != null) card.field.setText("" + prefill);
    if (hint) card.field.setHint(hint);
    card.field.setBackground(roundRect("#f6f4ef", 10, "#e7e1d4", 1));
    try {
        var IT = android.text.InputType;
        var map = { number: IT.TYPE_CLASS_NUMBER, numberPassword: IT.TYPE_CLASS_NUMBER | IT.TYPE_NUMBER_VARIATION_PASSWORD, text: IT.TYPE_CLASS_TEXT, textPassword: IT.TYPE_CLASS_TEXT | IT.TYPE_TEXT_VARIATION_PASSWORD };
        if (map[it]) card.field.setInputType(map[it]);
    } catch (e) {}
    card.ok.setBackground(roundRect("#3d342a", 10, null, 0));
    card.cancel.setBackground(roundRect("#f0ebe0", 10, null, 0));
    card.ok.on("click", function () {
        var v = card.field.getText().toString();
        hideCard();
        cb(v);
    });
    card.cancel.on("click", function () { hideCard(); cb(null); });
    showCard(card);
    try {
        ui.post(function () {
            card.field.requestFocus();
            var imm = context.getSystemService(context.INPUT_METHOD_SERVICE);
            imm.showSoftInput(card.field, 0);
        }, 120);
    } catch (e) {}
}

// 确认卡片:标题 + 消息 + 确认(红)/取消
function cardConfirm(title, msg, cb) {
    var card = ui.inflate(
        <vertical padding="18 18 14 14">
            <text id="title" textSize="15sp" textStyle="bold" textColor="#3d342a" padding="0 0 0 8" />
            <text id="msg" textSize="13sp" textColor="#6a645a" padding="0 0 16 0" />
            <horizontal>
                <text id="ok" text="✓ 确认" textSize="14sp" textStyle="bold" textColor="#fffdf8" padding="14 12" layout_weight="1" gravity="center" margin="0 0 6 0" />
                <text id="cancel" text="✕ 取消" textSize="14sp" textStyle="bold" textColor="#8b857b" padding="14 12" layout_weight="1" gravity="center" margin="6 0 0 0" />
            </horizontal>
        </vertical>);
    card.title.setText(title);
    card.msg.setText(msg || "");
    card.ok.setBackground(roundRect("#a8443a", 10, null, 0));
    card.cancel.setBackground(roundRect("#f0ebe0", 10, null, 0));
    card.ok.on("click", function () { hideCard(); cb(true); });
    card.cancel.on("click", function () { hideCard(); cb(false); });
    showCard(card);
}

// 运行报告卡片:运行结束切回 App 后弹出,汇总成交/失败/跳过 + 逐只基金明细。
// summary: { ts, mode, buy, sell, ok, fail, skip, err?, fundMap, hdr, detail[] }
//   detail[]: { a:'buy'|'sell', name, s:status, m:msg, amt?, strat?, ratio? }
function cardReport(summary) {
    var s = summary || {};
    var card = ui.inflate(
        <vertical padding="16 16 14 14">
            <horizontal gravity="center_vertical">
                <text id="title" textSize="15sp" textStyle="bold" textColor="#3d342a" layout_weight="1" />
                <text id="mode" textSize="10sp" textStyle="bold" textColor="#fffdf8" padding="7 3" />
            </horizontal>
            <text id="ts" textSize="11sp" textColor="#8b857b" margin="0 3 0 12" />
            <horizontal id="stats" margin="0 0 0 12" />
            <vertical id="dist" visibility="gone" margin="0 0 0 12" />
            <vertical id="rows" margin="0 2 0 0" />
            <text id="more" visibility="gone" textSize="10sp" textColor="#8b857b" gravity="center" padding="0 6" />
            <text id="ok" text="✓ 完成" textSize="14sp" textStyle="bold" textColor="#fffdf8" padding="14 12" gravity="center" margin="14 12 4 4" />
        </vertical>);
    card.title.setText("运行报告");
    card.mode.setText(s.mode === '模拟' ? '模拟 · 不下单' : '真实下单');
    card.mode.setBackground(roundRect(s.mode === '模拟' ? "#8b857b" : "#a8443a", 8, null, 0));
    card.ts.setText(s.ts ? fmtTs(s.ts) : "");
    // 汇总四格:成交 · 失败 · 跳过 · 买入合计
    var det = s.detail || [];
    var buyTotal = 0;
    det.forEach(function (d) { if (d.a === 'buy' && d.s === 'ok' && d.amt) buyTotal += d.amt; });
    var cell = function (num, lab, col) {
        var v = ui.inflate(
            <vertical gravity="center" padding="0 6" layout_weight="1" margin="3 0">
                <text id="n" textSize="18sp" textStyle="bold" />
                <text id="l" textSize="10sp" textColor="#8b857b" />
            </vertical>);
        v.n.setText("" + num); v.n.setTextColor(COL(col));
        v.l.setText(lab);
        v.setBackground(roundRect("#f6f4ef", 10, "#eee8db", 1));
        return v;
    };
    card.stats.addView(cell(s.ok || 0, "成交", "#2e8b57"));
    card.stats.addView(cell(s.fail || 0, "失败", "#c0392b"));
    card.stats.addView(cell(s.skip || 0, "跳过", "#8b857b"));
    card.stats.addView(cell(buyTotal ? money(buyTotal).replace("¥", "") : "0", "买入合计", "#5a7a52"));
    // 策略命中分布行(填充预留的 dist 占位):统计 detail 里各策略出现次数
    var stratCount = {};
    det.forEach(function (d) {
        if (!d.strat) return;
        d.strat.split('+').forEach(function (k) { stratCount[k] = (stratCount[k] || 0) + 1; });
    });
    var stratKeys = ['底仓', '定投', '降本', '止盈'];
    var stratHit = stratKeys.filter(function (k) { return stratCount[k]; });
    if (stratHit.length) {
        var chipRow = ui.inflate(
            <horizontal gravity="center_vertical" padding="11 9">
                <text text="命中" textSize="10sp" textStyle="bold" textColor="#8b857b" margin="0 0 8 0" />
                <horizontal id="chips" layout_weight="1" />
            </horizontal>);
        chipRow.setBackground(roundRect("#fffdf8", 10, "#eee8db", 1));
        stratHit.forEach(function (k) {
            var chip = ui.inflate(<text textSize="10sp" textStyle="bold" textColor="#3d342a" padding="7 3" margin="0 0 5 0" />);
            chip.setText(k + " " + stratCount[k]);
            chip.setBackground(roundRect("#efe9dc", 6, null, 0));
            chipRow.chips.addView(chip);
        });
        card.dist.addView(chipRow);
        card.dist.setVisibility(0);
    }
    // 异常行(策略引擎中途抛错时)
    var rows = card.rows;
    if (s.err) {
        var er = ui.inflate(
            <horizontal gravity="center_vertical" padding="11 10" margin="0 0 0 6">
                <text text="❌" textSize="14sp" margin="0 0 8 0" />
                <text id="m" textSize="12sp" textColor="#c0392b" layout_weight="1" />
            </horizontal>);
        er.m.setText("策略异常: " + s.err);
        er.setBackground(roundRect("#fbeceb", 10, "#e9c8c4", 1));
        rows.addView(er);
    }
    if (!det.length && !s.err) {
        rows.addView(ui.inflate(<text text="无操作(未命中任何策略)" textColor="#8b857b" textSize="12sp" padding="0 12" />));
    }
    var ST = { ok: { icon: '✅', lab: '成交', col: '#2e8b57' }, skipped: { icon: '⏭', lab: '跳过', col: '#8b857b' },
        dry_run_stopped_at_pwd: { icon: '⏸', lab: '模拟停', col: '#b0704a' }, rejected: { icon: '✕', lab: '拒绝', col: '#8b857b' },
        error: { icon: '❌', lab: '失败', col: '#c0392b' } };
    // 明细超 10 条截断(无 scroll,避免卡片过高溢出屏幕)
    var MAX_ROWS = 10;
    var shown = det.slice(0, MAX_ROWS);
    shown.forEach(function (d) {
        var isBuy = d.a === 'buy';
        var st = ST[d.s] || { icon: '❌', lab: d.s || '未知', col: '#c0392b' };
        var f = (s.fundMap && s.fundMap[d.name]) || {};
        var row = ui.inflate(
            <horizontal gravity="center_vertical" padding="10 9" margin="0 0 0 5">
                <text id="tag" textSize="10sp" textStyle="bold" textColor="#fffdf8" padding="5 3" />
                <vertical layout_weight="1" margin="8 0 0 0">
                    <horizontal gravity="center_vertical">
                        <text id="nm" textSize="13sp" textColor="#3d342a" layout_weight="1" />
                        <text id="rt" textSize="11sp" textStyle="bold" />
                    </horizontal>
                    <text id="meta" textSize="10sp" textColor="#8b857b" margin="0 2 0 0" />
                </vertical>
                <text id="st" textSize="11sp" textStyle="bold" margin="0 0 0 8" />
            </horizontal>);
        row.tag.setText(isBuy ? '买' : '卖');
        row.tag.setBackground(roundRect(isBuy ? '#5a7a52' : '#b0704a', 5, null, 0));
        row.nm.setText(d.name);
        // 收益率(带涨跌色)+ 持仓金额,关联采集快照
        if (f.rate != null) { row.rt.setText(pct(f.rate)); row.rt.setTextColor(COL(hexOf(f.rate))); }
        else { row.rt.setVisibility(8); }
        var meta = isBuy ? (d.amt != null ? money(d.amt) : '') : ('卖 1/' + (d.ratio ? Math.round(1 / d.ratio) : '?'));
        if (f.amount != null) meta += ' · 持仓 ' + money(f.amount);
        if (d.strat) meta += ' · ' + d.strat;
        if (d.s !== 'ok' && d.m) meta += ' · ' + d.m;
        row.meta.setText(meta);
        row.st.setText(st.icon + ' ' + st.lab);
        row.st.setTextColor(COL(st.col));
        row.setBackground(roundRect("#fffdf8", 9, "#eee8db", 1));
        rows.addView(row);
    });
    if (det.length > MAX_ROWS) {
        card.more.setText("…还有 " + (det.length - MAX_ROWS) + " 只未显示");
        card.more.setVisibility(0);
    }
    card.ok.setBackground(roundRect("#3d342a", 10, null, 0));
    card.ok.on("click", function () { hideCard(); });
    showCard(card);
}

// rawInput 兼容 Promise(旧);现底层走纸感卡片浮层,业务回调结构不变。
function rawInputAsync(title, prefill, cb) {
    cardInput(title, prefill, null, cb);
}
// 多选卡片:标题 + 勾选项(左侧勾选框,右侧 label/side/sub/param)+ 确定/取消。
// items: [{key,label,side?,sub?,param?,checked,disabled}],cb(selectedKeys[]|null)  null=取消
// 确定:至少勾 1 项才高亮可点(防误触第一道)。勾选框用圆角方框容器内含对勾,避免字体缺字问题。
function cardMultiSelect(title, items, cb) {
    var card = ui.inflate(
        <vertical padding="4 4 4 2">
            <text id="title" textSize="14sp" textStyle="bold" textColor="#3d342a" padding="12 12 12 8" />
            <vertical id="rows" padding="6 0 6 2" />
            <horizontal padding="10 6 6 6">
                <text id="ok" text="✓ 确定" textSize="14sp" textStyle="bold" textColor="#fffdf8" padding="14 12" layout_weight="1" gravity="center" margin="0 0 6 0" />
                <text id="cancel" text="✕ 取消" textSize="14sp" textStyle="bold" textColor="#8b857b" padding="14 12" layout_weight="1" gravity="center" margin="6 0 0 0" />
            </horizontal>
        </vertical>);
    card.title.setText(title);
    var state = items.map(function (it) { return !!it.checked; });
    var refreshOk = function () {};
    items.forEach(function (it, i) {
        var row = ui.inflate(
            <horizontal gravity="center_vertical" padding="13 12" margin="0 0 0 6">
                <vertical id="box" w="22" h="22" gravity="center" margin="0 0 12 0" />
                <vertical layout_weight="1">
                    <horizontal gravity="center_vertical">
                        <text id="lab" textSize="14sp" textStyle="bold" textColor="#3d342a" />
                        <text id="side" textSize="10sp" textStyle="bold" textColor="#8b857b" padding="5 2" margin="8 0 0 0" />
                    </horizontal>
                    <text id="sub" textSize="11sp" textColor="#8b857b" margin="0 2 0 0" />
                    <text id="prm" textSize="11sp" textColor="#6a645a" margin="0 1 0 0" />
                </vertical>
            </horizontal>);
        row.lab.setText(it.label);
        if (it.side) row.side.setText(it.side); else row.side.setVisibility(8);
        if (it.sub) row.sub.setText(it.sub); else row.sub.setVisibility(8);
        if (it.param) row.prm.setText(it.param); else row.prm.setVisibility(8);
        var render = function () {
            // 勾选框:勾上=深墨底白勾;未勾=浅描边空框。每次新建 tick(避免单实例被多框争用)
            row.box.removeAllViews();
            row.box.setBackground(roundRect(state[i] ? "#3d342a" : "#fffdf8", 6, state[i] ? null : "#c4bcaa", state[i] ? 0 : 1.5));
            if (state[i]) {
                var tk = ui.inflate(<text text="✓" textSize="15sp" textStyle="bold" textColor="#fffdf8" gravity="center" />);
                row.box.addView(tk);
            }
            var dim = it.disabled;
            row.lab.setTextColor(COL(dim ? "#b8b1a6" : "#3d342a"));
            row.side.setTextColor(COL(dim ? "#cfc8b8" : (it.side === '卖' ? "#b0704a" : "#5a7a52")));
            row.sub.setTextColor(COL(dim ? "#d8d2c5" : "#8b857b"));
            row.prm.setTextColor(COL(dim ? "#cfc8b8" : "#6a645a"));
            row.setBackground(roundRect(state[i] ? "#efe9dc" : "#fffdf8", 10, "#eee8db", 1));
            if (dim) row.setAlpha(0.55);
        };
        render();
        row.on("click", function () {
            if (it.disabled) return;
            state[i] = !state[i]; render(); refreshOk();
        });
        card.rows.addView(row);
    });
    card.cancel.setBackground(roundRect("#f0ebe0", 10, null, 0));
    var updateOk = function () {
        var any = state.some(function (s) { return s; });
        card.ok.setTextColor(COL(any ? "#fffdf8" : "#9a948a"));
        card.ok.setBackground(roundRect(any ? "#3d342a" : "#cfc8b8", 10, null, 0));
        card.ok.setEnabled(any);
        card.ok.setAlpha(any ? 1 : 0.6);
    };
    refreshOk = updateOk;
    updateOk();
    card.ok.on("click", function () {
        var sel = items.map(function (it, i) { return state[i] ? it.key : null; }).filter(function (k) { return k; });
        if (!sel.length) return;
        hideCard(); cb(sel);
    });
    card.cancel.on("click", function () { hideCard(); cb(null); });
    showCard(card);
}
// dialogs.select 旧封装;现底层走纸感卡片浮层。cb(-1) 表示取消/未选。
function selectAsync(title, items, cb, defaultIdx) {
    cardSelect(title, items, cb, defaultIdx);
}
// dialogs.confirm 封装(纸感卡片)
function confirmAsync(title, msg, cb) {
    cardConfirm(title, msg, cb);
}

// 配置页:在 ui.cfgBody 内重建为纸感卡片列表(不嵌套弹窗);首页视图留在 ui.body 不动,返回时只切显隐。
function renderConfig() {
    var c = loadTradeConfig();
    var pinSet = secretStore.has();
    var body = ui.cfgBody;
    body.removeAllViews();
    resetNav();  // 配置页是首页外的第一层:进此页即清空栈(不保留编辑子页)

    // 顶部返回条
    var top = ui.inflate(
        <horizontal gravity="center_vertical" margin="0 2 0 10">
            <button id="back" text="← 返回" textColor="#3d342a" textSize="13sp" padding="14 9" />
            <vertical layout_weight="1" padding="6 0 0 0">
                <text text="交易配置" textColor="#3d342a" textSize="16sp" textStyle="bold" />
                <text text="长按基金卡片可触发交易(演示)" textColor="#8b857b" textSize="11sp" />
            </vertical>
        </horizontal>);
    top.back.setBackground(roundRect("#fffdf8", 12, "#e7e1d4", 1));
    var backToHome = function () {
        // 首页视图常驻 ui.body,返回只切显隐 → 零重建零延迟。
        // meta 已是最新更新时间(采集时设过),无需重设。
        showHome();
    };
    top.back.on("click", function () { backToHome(); });  // 点击回调已在 UI 线程,无需 post
    pushNavLayer(backToHome, 1);  // 硬件返回键 = 同 ← 返回,回首页
    body.addView(top);

    // —— 安全 · 交易参数 ——
    body.addView(buildConfigSection("安全与风控"));

    // 1. 支付密码
    var pinCard = buildConfigRow("支付密码", "6 位数字 · AES-GCM 加密落盘",
        pinSet ? "已设置 · 点此重置" : "未设置 · 点此设置", pinSet ? "#8a6a2f" : "#a8443a",
        function () {
            rawInputAsync("输入 6 位支付密码", "", function (pin) {
                if (pin && /^\d{6}$/.test(pin)) {
                    try { secretStore.set(pin); toast("密码已加密保存"); }
                    catch (e) { toast("保存失败: " + e); }
                    ui.post(function () { renderConfig(); });
                } else { toast("密码必须 6 位数字"); ui.post(function () { renderConfig(); }); }
            });
        });
    body.addView(pinCard);

    // 2. 单笔上限
    var maxCard = buildConfigRow("单笔金额上限", "超过此金额的交易将被拒绝",
        c.maxAmount + " 元", "#3d342a",
        function () {
            rawInputAsync("单笔金额上限(元)", "" + c.maxAmount, function (m) {
                if (m && !isNaN(+m)) saveTradeConfig({ maxAmount: +m });
                ui.post(function () { renderConfig(); });
            });
        });
    body.addView(maxCard);

    // 3. 二次确认阈值
    var thrCard = buildConfigRow("二次确认阈值", "超过此金额需弹窗确认",
        c.confirmThreshold + " 元", "#3d342a",
        function () {
            rawInputAsync("大额二次确认阈值(元)", "" + c.confirmThreshold, function (t) {
                if (t && !isNaN(+t)) saveTradeConfig({ confirmThreshold: +t });
                ui.post(function () { renderConfig(); });
            });
        });
    body.addView(thrCard);

    // —— 组别(定投用;可复用基金集合,"全部"为默认组)——
    body.addView(buildConfigSection("基金组别 · 定投作用范围"));
    body.addView(buildGroupManager(c));

    // —— 策略(一个模块:买入二选一 + 可叠加;卖出独立)——
    var S = c.strategies;
    body.addView(buildConfigSection("策略"));
    var stratBox = ui.inflate(
        <vertical bg="#fffdf8" padding="14 12" margin="0 0 0 8">
            <vertical id="rows" />
        </vertical>);
    stratBox.setBackground(roundRect("#fffdf8", 14, "#e7e1d4", 1));
    var stratRows = stratBox.rows;

    // 关系小标签(浅灰细字,仅说明用)
    var relTag = ui.inflate(
        <text textSize="11sp" textColor="#b8b1a6" margin="0 6 0 5" />);
    relTag.setText("买入 · 二选一(金额高者生效)");
    stratRows.addView(relTag);

    stratRows.addView(buildStrategyCard("底仓", "持仓金额 < 目标时买一笔(全局)",
        "目标 " + S.base.target + " 元 · 单次 " + S.base.amount + " 元", S.base.enabled, function (en) {
            saveStrategy('base', { enabled: en });
        }, function () { safeRender("底仓", renderBaseEdit); }));

    // 定投:组别级金额(全部基金 + 各自定义组各自开关金额)
    var dcaGrpN = (c.groups || []).filter(function (g) { return g.dcaEnabled; }).length;
    stratRows.addView(buildStrategyCard("定投", "每组各设金额,开关开的组内每只各买一笔",
        (S.dca.allEnabled ? "全部:" + S.dca.allAmount + "元 ✓" : "全部:关") + " · " + dcaGrpN + " 组启用", S.dca.enabled, function (en) {
            saveStrategy('dca', { enabled: en });
        }, function () { safeRender("定投", renderDcaEdit); }));

    var relTag2 = ui.inflate(
        <text textSize="11sp" textColor="#b8b1a6" margin="10 6 0 5" />);
    relTag2.setText("买入 · 可叠加(与上方同时命中,金额合并)");
    stratRows.addView(relTag2);

    var crCatchAll = (S.costReduce.catchAll && S.costReduce.catchAll.enabled)
        ? " / 兜底→" + S.costReduce.catchAll.amount + "元" : "";
    stratRows.addView(buildStrategyCard("降本", "亏损时买入,按亏损档位加码(全局)",
        (S.costReduce.tiers.map(function (t) { return (t.maxLoss * 100) + "%内→" + t.amount + "元" + (t.enabled === false ? " 停" : ""); }).join(" / ") || "无档位") + crCatchAll, S.costReduce.enabled, function (en) {
            saveStrategy('costReduce', { enabled: en });
        }, function () {
            safeRender("降本档位", function () {
                renderTiersEdit("降本档位", S.costReduce.tiers,
                    [{ k: 'maxLoss', label: '亏损%', scale: 100 }, { k: 'amount', label: '金额(元)' }],
                    function (tiers) { saveStrategy('costReduce', { tiers: tiers }); },
                    renderCatchAllFooter);
            });
        }));

    var relTag3 = ui.inflate(
        <text textSize="11sp" textColor="#b8b1a6" margin="10 6 0 5" />);
    relTag3.setText("卖出 · 独立(与买入互不影响)");
    stratRows.addView(relTag3);

    stratRows.addView(buildStrategyCard("止盈", "收益率达档位卖等比份额(全局)",
        S.takeProfit.tiers.map(function (t) { return (t.minRate * 100) + "%→1/" + t.ratio + (t.enabled === false ? " 停" : ""); }).join(" / ") || "无档位", S.takeProfit.enabled, function (en) {
            saveStrategy('takeProfit', { enabled: en });
        }, function () {
            safeRender("止盈档位", function () {
                renderTiersEdit("止盈档位", S.takeProfit.tiers,
                    [{ k: 'minRate', label: '收益%', scale: 100 }, { k: 'ratio', label: '分母(卖 1/N)' }],
                    function (tiers) { saveStrategy('takeProfit', { tiers: tiers }); });
            });
        }));
    body.addView(stratBox);

    // —— 执行(模拟开关 + 立即执行 + 单只测试,都是"跑一遍")——
    body.addView(buildConfigSection("执行 · 跑一遍看看"));

    // 模拟运行开关(原 dry-run):开=走到密码页前停止不真实下单,关=真实下单
    var dryCard = buildConfigRow("模拟运行（不下单）", "开:走到密码页前停止,不真实下单",
        c.dryRun ? "开 · 模拟" : "关 · 真实", c.dryRun ? "#8a6a2f" : "#a8443a",
        function () {
            var next = !c.dryRun;
            saveTradeConfig({ dryRun: next });
            toast("模拟运行 " + (next ? "开（不下单）" : "关（真实下单）"));
            ui.post(function () { renderConfig(); });
        });
    body.addView(dryCard);

    var execCard = buildConfigRow("立即执行策略", "扫描全部基金,启用的策略买卖一遍",
        "▶ " + (c.dryRun ? "模拟" : "真实"), c.dryRun ? "#8a6a2f" : "#a8443a",
        function () {
            if (!secretStore.has() && !c.dryRun) { toast("未设置支付密码,无法真实下单"); return; }
            runStrategy();
        });
    body.addView(execCard);

    var buyCard = buildConfigRow("测试买入", "10 元 · 按上方模拟开关",
        "▶ 执行", "#8b857b",
        function () {
            pickFundName(function (fn) { if (fn) runBuy(fn, 10); });
        });
    body.addView(buyCard);

    var sellCard = buildConfigRow("测试卖出", "1 份 · 按上方模拟开关",
        "▶ 执行", "#8b857b",
        function () {
            pickFundName(function (fn) { if (fn) runSell(fn, 1); });
        });
    body.addView(sellCard);

    var realTestCard = buildConfigRow("🧪 真实测试(1元)", "真实买入 1元基金 验证连续支付 · 与持仓取交",
        "▶ " + REAL_TEST_MAX + "只/" + (REAL_TEST_MAX * REAL_TEST_AMOUNT) + "元", "#a8443a",
        function () { openRealTestConfirm(); });
    body.addView(realTestCard);

    // 页脚说明
    var foot = ui.inflate(
        <text text="配置存储于本地 storages · 密码经 Android Keystore 加密&#10;点策略卡配参数 · 点右侧「启用/停用」切换"
            textColor="#b8b1a6" textSize="11sp" gravity="center" padding="0 20" />);
    body.addView(foot);
    showConfig();  // 切到配置容器(首页视图保留在 ui.body,不重建)
}

// 保存策略子树(合并写回,避免覆盖其它模板)
function saveStrategy(key, patch) {
    var s = loadTradeConfig().strategies[key];
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    cfgStore.put('strategies.' + key, s);
}

// 策略卡片:左标签+参数概览,右启用开关(独立可点)。点卡片=配参数,点右侧开关=切换启用。
// 不用 longClick(设备差异大,常被识别成 click),改用独立开关 chip,交互稳定。
function buildStrategyCard(label, sub, paramText, enabled, onToggle, onEdit) {
    var row = ui.inflate(
        <vertical bg="#fffdf8" padding="14 13" margin="0 0 0 8">
            <horizontal gravity="center_vertical">
                <vertical id="info" layout_weight="1">
                    <text id="lab" textSize="14sp" textStyle="bold" textColor="#3d342a" />
                    <text id="sub" textSize="11sp" textColor="#8b857b" margin="0 2 0 0" />
                    <text id="prm" textSize="11sp" textColor="#6a645a" margin="0 3 0 0" />
                </vertical>
                <text id="pool" textSize="12sp" textStyle="bold" padding="11 7" />
            </horizontal>
        </vertical>);
    row.setBackground(roundRect(enabled ? "#efe9dc" : "#fffdf8", 12, enabled ? "#3d342a" : "#e7e1d4", enabled ? 2 : 1));
    row.lab.setText(label + (enabled ? " ✓" : ""));
    row.sub.setText(sub);
    row.prm.setText(paramText);
    row.pool.setText(enabled ? "启用" : "停用");
    row.pool.setBackground(roundRect(enabled ? "#3d342a" : "#f0ebe0", 10, null, 0));
    row.pool.setTextColor(COL(enabled ? "#fffdf8" : "#8b857b"));
    row.info.on("click", function () { row.info.setAlpha(0.6); onEdit(); });
    row.pool.on("click", function () { onToggle(!enabled); toast(label + (enabled ? " 停用" : " 启用")); ui.post(function () { renderConfig(); }); });
    return row;
}

// 分组小标题(纸感 · 次要灰)
function buildConfigSection(label) {
    var s = ui.inflate(<text id="lab" textSize="11sp" textStyle="bold" textColor="#a89e8a" padding="2 16 0 5" margin="0 22 0 0" />);
    s.lab.setText(label);
    return s;
}

// 已采集基金名列表(供选择;未采集则提示)
function availableFunds() {
    var d = loadData();
    return (d && d.funds) ? d.funds.map(function (f) { return f.name; }) : [];
}

// 选基金(select,零手敲)。无数据提示先采集。
function pickFundName(cb) {
    var names = availableFunds();
    if (!names.length) { toast("请先采集基金数据"); cb(null); return; }
    selectAsync("选择基金", names, function (i) {
        cb(i >= 0 ? names[i] : null);
    });
}

// 生成组别 id(时间戳基;脚本内不能用 Date.now() 的限制仅限 workflow,运行时可)
function genId() { return 'g_' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1000).toString(36); }

// ===== 首页基金卡片操作(逐只基金添加/交易)=====

// 加入组别:select 已有组 + 「+新建组别」。逐只加入,组别添加的主入口在首页。
function addToGroup(fundName) {
    var c = loadTradeConfig();
    var groups = c.groups || [];
    var opts = groups.map(function (g) { return g.name; });
    opts.push("+ 新建组别");
    opts.push("取消");
    selectAsync("把「" + fundName + "」加入组别", opts, function (idx) {
        if (idx == null || idx < 0 || idx === opts.length - 1) return;  // 取消
        if (idx === opts.length - 2) {  // 新建组别
            rawInputAsync("新组别名称", "组" + (groups.length + 1), function (nm) {
                var name = (nm || "").trim() || ("组" + (groups.length + 1));
                groups.push({ id: genId(), name: name, funds: [fundName], dcaEnabled: false, dcaAmount: 100 });
                saveTradeConfig({ groups: groups });
                toast("已新建「" + name + "」并加入 " + fundName);
            });
        } else {  // 已有组
            var g = groups[idx];
            if (g.funds.indexOf(fundName) >= 0) { toast(fundName + " 已在该组"); return; }
            g.funds.push(fundName);
            saveTradeConfig({ groups: groups });
            toast("已加入「" + g.name + "」");
        }
    });
}

// 设为定投(首页入口):定投金额在组别上,这里选/建一个组并设该组定投开关+金额。
function setupDca(fundName) {
    var c = loadTradeConfig();
    var groups = c.groups || [];
    var opts = groups.map(function (g) { return g.name; });
    opts.unshift("全部基金");
    opts.push("+ 新建组别");
    opts.push("取消");
    selectAsync("把「" + fundName + "」定投到", opts, function (idx) {
        if (idx == null || idx < 0 || idx === opts.length - 1) return;  // 取消
        if (idx === opts.length - 2) {  // 新建组别
            rawInputAsync("新组别名称", "组" + (groups.length + 1), function (nm) {
                var name = (nm || "").trim() || ("组" + (groups.length + 1));
                askDcaAmount(name, function (amt) {
                    var g = { id: genId(), name: name, funds: [fundName], dcaEnabled: true, dcaAmount: amt };
                    groups.push(g);
                    saveTradeConfig({ groups: groups });
                    toast("已新建「" + name + "」并开启定投 " + amt + " 元");
                });
            });
        } else if (idx === 0) {  // 全部基金
            askDcaAmount("全部基金", function (amt) {
                saveStrategy('dca', { allEnabled: true, allAmount: amt });
                toast("全部基金定投 " + amt + " 元已开启");
            });
        } else {  // 已有组(注意 unshift 后索引+1)
            var g = groups[idx - 1];
            if (g.funds.indexOf(fundName) < 0) g.funds.push(fundName);
            askDcaAmount(g.name, function (amt) {
                g.dcaEnabled = true; g.dcaAmount = amt;
                saveTradeConfig({ groups: groups });
                toast("「" + g.name + "」定投 " + amt + " 元已开启");
            });
        }
    });
}
// 定投金额输入(共用),amt>=1 才回调
function askDcaAmount(label, cb) {
    rawInputAsync(label + " 定投金额(元)", "100", function (v) {
        if (v == null || v === "" || isNaN(+v) || +v < 1) { toast("金额需 >=1"); return; }
        cb(+v);
    });
}

// 组别管理区(只读+调整):列出"全部"(只读)+ 各自定义组;点组进管理菜单。
// 组别的"添加"在首页基金卡片「加入组」做,这里只查看/重命名/删基金/删组。
function buildGroupManager(c) {
    var wrap = ui.inflate(<vertical id="root" margin="0 0 0 8" />);
    // "全部基金"只读行
    var allRow = ui.inflate(
        <vertical bg="#fffdf8" padding="14 12" margin="0 0 0 6">
            <horizontal gravity="center_vertical">
                <text text="全部基金" textSize="14sp" textStyle="bold" textColor="#3d342a" layout_weight="1" />
                <text text="默认 · 不可编辑" textSize="11sp" textColor="#b8b1a6" />
            </horizontal>
        </vertical>);
    allRow.setBackground(roundRect("#fffdf8", 12, "#e7e1d4", 1));
    wrap.root.addView(allRow);
    // 自定义组
    var groups = c.groups || [];
    if (!groups.length) {
        var tip = ui.inflate(
            <vertical bg="#fffdf8" padding="14 12" margin="0 0 0 6">
                <text text="暂无自定义组别" textSize="13sp" textColor="#8b857b" />
                <text text="在首页点基金卡片「加入组」即可新建" textSize="11sp" textColor="#b8b1a6" margin="0 3 0 0" />
            </vertical>);
        tip.setBackground(roundRect("#fffdf8", 12, "#e7e1d4", 1));
        wrap.root.addView(tip);
    } else {
        groups.forEach(function (g) {
            var preview = (g.funds || []).slice(0, 3).join("、") + ((g.funds || []).length > 3 ? " …" : "");
            var dcaTxt = g.dcaEnabled ? " · 定投 " + g.dcaAmount + "元" : "";
            var row = buildConfigRow(g.name, (g.funds || []).length + " 只" + dcaTxt + " · " + (preview || "空"),
                "✎ 管理", "#8b857b", function () { safeRender("组别", function () { renderGroupDetail(g, groups); }); });
            wrap.root.addView(row);
        });
    }
    return wrap.root;
}

// 配置行卡片:左标签+副标题,右当前值(整行可点)
function buildConfigRow(label, sub, value, valueColor, onTap) {
    var row = ui.inflate(
        <vertical bg="#fffdf8" padding="14 13" margin="0 0 0 8">
            <horizontal gravity="center_vertical">
                <vertical layout_weight="1">
                    <text id="lab" textSize="14sp" textStyle="bold" textColor="#3d342a" />
                    <text id="sub" textSize="11sp" textColor="#8b857b" margin="0 2 0 0" />
                </vertical>
                <text id="val" textSize="13sp" textStyle="bold" gravity="right" />
            </horizontal>
        </vertical>);
    row.setBackground(roundRect("#fffdf8", 12, "#e7e1d4", 1));
    row.lab.setText(label);
    row.sub.setText(sub);
    row.val.setText(value);
    row.val.setTextColor(COL(valueColor || "#8b857b"));
    // 点击微反馈:按下时轻微压暗
    row.on("click", function () {
        row.setAlpha(0.6);
        onTap();  // 直接调(含 rawInput),避免 ui.post 异步导致返回值丢失
    });
    return row;
}

// ---------- 整页配置视图(写入 ui.cfgBody,带 ← 返回 头)----------
// 整页头:深墨底白字(现代 toolbar 风,与浅色内容强分隔)。onBack 通常 = renderConfig。
function editHeader(title, sub, onBack) {
    var top = ui.inflate(
        <horizontal bg="#3d342a" gravity="center_vertical" padding="14 16" margin="0 0 0 14">
            <text id="back" text="‹" textColor="#fffdf8" textSize="26sp" padding="6 0 10 0" />
            <vertical layout_weight="1" padding="2 0 0 0">
                <text id="title" textColor="#fffdf8" textSize="17sp" textStyle="bold" />
                <text id="sub" textColor="#b8b1a6" textSize="11sp" margin="0 2 0 0" />
            </vertical>
        </horizontal>);
    top.setBackground(roundRect("#3d342a", 14, null, 0));
    top.title.setText(title);
    if (sub) top.sub.setText(sub); else top.sub.setVisibility(8);
    top.back.on("click", function () { top.back.setAlpha(0.5); ui.post(onBack); });
    return top;
}
// 整页视图异常兜底:崩溃时 toast 异常+行号,定位无日志崩溃
function safeRender(name, fn) {
    try { fn(); }
    catch (e) {
        toast("❌ " + name + " 异常: " + e + " @" + (e.lineNumber || "?"));
        console.error("safeRender[" + name + "] " + e + "\n" + (e.stack || ""));
    }
}
// 开始整页视图:清 cfgBody,加头(配置/编辑共用 cfgBody 容器)。返回 body 供 addView。
function startEditPage(title, sub) {
    var body = ui.cfgBody;
    body.removeAllViews();
    var backToConfig = function () { renderConfig(); };
    body.addView(editHeader(title, sub, backToConfig));
    // 编辑子页属配置页下一层:组内行内操作会反复 re-render 本页,
    // 用 layer 标记替换栈顶(避免栈无限增长),而非累加新层。
    pushNavLayer(backToConfig, 2);
    return body;
}

// 行内开关:胶囊形,固定宽度,开合不跳。开=暖墨底白字,关=浅米底灰字。
function buildToggleChip(enabled, onToggle) {
    var row = ui.inflate(<text id="c" textSize="13sp" textStyle="bold" padding="22 10" gravity="center" minWidth="74" />);
    function apply(en) {
        row.c.setText(en ? "● 开" : "○ 关");
        row.c.setBackground(roundRect(en ? "#3d342a" : "#ece4d3", 24, null, 0));
        row.c.setTextColor(COL(en ? "#fffdf8" : "#8b857b"));
    }
    apply(enabled);
    row.c.on("click", function () { row.c.setAlpha(0.6); onToggle(!enabled); });
    return { view: row, set: apply };
}

// 行内金额 chip:强调底深墨字"100元",右侧留间距。
function buildAmountChip(text, onTap) {
    var c = ui.inflate(<text textSize="13sp" textStyle="bold" textColor="#3d342a" padding="16 9" gravity="center" margin="0 0 6 0" />);
    c.setText(text);
    c.setBackground(roundRect("#efe9dc", 12, null, 0));
    c.on("click", function () { c.setAlpha(0.6); onTap(); });
    return c;
}

// 行内操作小按钮(编辑/删除/+)。label 文本,色 由 bg 决定。
function buildActionChip(label, bg, onTap) {
    var c = ui.inflate(<text textSize="14sp" padding="13 9" gravity="center" textColor="#3d342a" />);
    c.setText(label);
    c.setBackground(roundRect(bg || "#f6f4ef", 12, "#e7e1d4", 1));
    c.on("click", function () { c.setAlpha(0.6); onTap(); });
    return c;
}

// 主操作按钮(保存/完成/删除):整宽,底色+白字。
function buildPrimaryButton(label, bg, onTap) {
    var b = ui.inflate(<text textSize="15sp" textStyle="bold" textColor="#fffdf8" padding="16 15" gravity="center" margin="0 6 0 10" />);
    b.setText(label);
    b.setBackground(roundRect(bg || "#3d342a", 14, null, 0));
    b.on("click", function () { b.setAlpha(0.7); onTap(); });
    return b;
}

// 次操作按钮(添加/新建):浅底深墨字,与主按钮(深墨底白字)形成层级。
function buildSecondaryButton(label, onTap) {
    var b = ui.inflate(<text textSize="14sp" textStyle="bold" textColor="#3d342a" padding="15 13" gravity="center" margin="0 4 0 6" />);
    b.setText(label);
    b.setBackground(roundRect("#efe9dc", 14, "#e0d8c6", 1));
    b.on("click", function () { b.setAlpha(0.7); onTap(); });
    return b;
}

// 浮层两字段表单(档位编辑/新增用,两 input 同屏,不串行)。
// fields:[{key,label,inputType?}], prefillObj:{key:val}, onSave(obj)。
function cardForm(title, fields, prefillObj, onSave) {
    var inputs = {};
    var card = ui.inflate(
        <vertical padding="18 18 14 14">
            <text id="title" textSize="14sp" textStyle="bold" textColor="#3d342a" padding="0 0 0 12" />
            <vertical id="rows" />
            <horizontal margin="0 14 0 0">
                <text id="ok" text="✓ 保存" textSize="14sp" textStyle="bold" textColor="#fffdf8" padding="14 12" layout_weight="1" gravity="center" margin="0 0 6 0" />
                <text id="cancel" text="✕ 取消" textSize="14sp" textStyle="bold" textColor="#8b857b" padding="14 12" layout_weight="1" gravity="center" margin="6 0 0 0" />
            </horizontal>
        </vertical>);
    card.title.setText(title);
    fields.forEach(function (f) {
        var row = ui.inflate(
            <vertical margin="0 0 0 12">
                <text id="lab" textSize="11sp" textColor="#8b857b" padding="0 0 0 5" />
                <input id="field" textSize="15sp" textColor="#3d342a" padding="12 11" />
            </vertical>);
        row.lab.setText(f.label);
        row.field.setBackground(roundRect("#f6f4ef", 10, "#e7e1d4", 1));
        if (prefillObj && prefillObj[f.key] != null) row.field.setText("" + prefillObj[f.key]);
        try {
            var IT = android.text.InputType;
            var it = f.inputType || inferInputType(f.label);
            var map = { number: IT.TYPE_CLASS_NUMBER, numberPassword: IT.TYPE_CLASS_NUMBER | IT.TYPE_NUMBER_VARIATION_PASSWORD, text: IT.TYPE_CLASS_TEXT };
            if (map[it]) row.field.setInputType(map[it]);
        } catch (e) {}
        inputs[f.key] = row.field;
        card.rows.addView(row);
    });
    card.ok.setBackground(roundRect("#3d342a", 10, null, 0));
    card.cancel.setBackground(roundRect("#f0ebe0", 10, null, 0));
    card.ok.on("click", function () {
        var obj = {};
        fields.forEach(function (f) { obj[f.key] = inputs[f.key].getText().toString(); });
        hideCard();
        onSave(obj);
    });
    card.cancel.on("click", function () { hideCard(); });
    showCard(card);
}

// ---------- 整页配置视图实现 ----------

// 底仓整页表单:目标持仓 + 单次金额 同屏。
function renderBaseEdit() {
    var S = loadTradeConfig().strategies;
    var body = startEditPage("底仓", "持仓金额 < 目标时买一笔(全局)");
    body.addView(buildConfigSection("参数"));
    var fields = ui.inflate(<vertical bg="#fffdf8" padding="18 18 18 12" margin="0 0 0 16" />);
    fields.setBackground(roundRect("#fffdf8", 14, "#e7e1d4", 1));
    var tgtInput = ui.inflate(
        <vertical margin="0 0 0 14">
            <text text="目标持仓(元)" textSize="11sp" textColor="#8b857b" padding="0 0 0 6" />
            <input id="f" textSize="15sp" textColor="#3d342a" padding="12 11" />
        </vertical>);
    tgtInput.f.setText("" + S.base.target);
    tgtInput.f.setBackground(roundRect("#f6f4ef", 10, "#e7e1d4", 1));
    try { tgtInput.f.setInputType(android.text.InputType.TYPE_CLASS_NUMBER); } catch (e) {}
    fields.addView(tgtInput);
    var amtInput = ui.inflate(
        <vertical margin="0 0 0 4">
            <text text="单次金额(元)" textSize="11sp" textColor="#8b857b" padding="0 0 0 6" />
            <input id="f" textSize="15sp" textColor="#3d342a" padding="12 11" />
        </vertical>);
    amtInput.f.setText("" + S.base.amount);
    amtInput.f.setBackground(roundRect("#f6f4ef", 10, "#e7e1d4", 1));
    try { amtInput.f.setInputType(android.text.InputType.TYPE_CLASS_NUMBER); } catch (e) {}
    fields.addView(amtInput);
    body.addView(fields);
    body.addView(buildPrimaryButton("✓ 保存", "#3d342a", function () {
        var t = tgtInput.f.getText().toString(), a = amtInput.f.getText().toString();
        if (!t || isNaN(+t) || +t <= 0) { toast("目标持仓需 >0"); return; }
        if (!a || isNaN(+a) || +a < 1) { toast("单次金额需 >=1"); return; }
        saveStrategy('base', { target: +t, amount: +a });
        toast("底仓已保存");
        ui.post(function () { renderConfig(); });
    }));
}

// 定投整页列表:全部基金 + 各组,行内开关+金额。
function renderDcaEdit() {
    var c = loadTradeConfig();
    var dca = c.strategies.dca, groups = c.groups || [];
    var body = startEditPage("定投管理", "开关开的组,组内每只各按金额买一笔");
    body.addView(buildConfigSection("全部基金"));
    // 全部基金行:左侧标题+全局标签,右侧仅开关;启用时下方一行金额(可点编辑)
    var allRow = ui.inflate(
        <vertical bg="#fffdf8" padding="14 13" margin="0 0 0 8">
            <horizontal gravity="center_vertical">
                <vertical layout_weight="1">
                    <horizontal gravity="center_vertical">
                        <text text="全部基金" textSize="14sp" textStyle="bold" textColor="#3d342a" />
                        <text text="全局" textSize="10sp" textStyle="bold" textColor="#8a6a2f" padding="6 2" margin="6 0 0 0" />
                    </horizontal>
                    <text id="sub" textSize="11sp" textColor="#8b857b" margin="0 2 0 0" />
                </vertical>
                <horizontal id="ctl" gravity="center_vertical" />
            </horizontal>
            <horizontal id="amtRow" gravity="center_vertical" margin="12 12 0 0" visibility="gone">
                <text text="定投金额" textSize="11sp" textColor="#a89e8a" layout_weight="1" />
                <text id="amt" textSize="13sp" textStyle="bold" textColor="#3d342a" padding="12 7" gravity="center" />
            </horizontal>
        </vertical>);
    allRow.amtRow.setBackground(roundRect("#f6f4ef", 10, null, 0));
    allRow.setBackground(roundRect(dca.allEnabled ? "#efe9dc" : "#f6f4ef", 14, dca.allEnabled ? "#3d342a" : "#e0d8c6", dca.allEnabled ? 2 : 1));
    allRow.sub.setText(dca.allEnabled ? "对每只基金各买一笔" : "未开启");
    var allCtl = allRow.ctl;
    var allToggle = buildToggleChip(dca.allEnabled, function (en) {
        saveStrategy('dca', { allEnabled: en });
        toast("全部基金定投 " + (en ? "开" : "关"));
        ui.post(function () { renderDcaEdit(); });
    });
    allCtl.addView(allToggle.view);
    if (dca.allEnabled) {
        allRow.amtRow.setVisibility(0);
        allRow.amt.setText(dca.allAmount + " 元  ✎");
        allRow.amt.setBackground(roundRect("#f6f4ef", 10, "#e0d8c6", 1));
        allRow.amt.on("click", function () { allRow.amt.setAlpha(0.6);
            cardInput("全部基金定投金额(元)", "" + dca.allAmount, null, function (v) {
                if (v != null && v !== "" && !isNaN(+v) && +v >= 1) {
                    saveStrategy('dca', { allAmount: +v });
                    toast("金额改为 " + (+v) + " 元");
                }
                ui.post(function () { renderDcaEdit(); });
            });
        });
    }
    body.addView(allRow);

    body.addView(buildConfigSection("自定义组别 · " + groups.length + " 组"));
    if (!groups.length) {
        var tip = ui.inflate(
            <vertical bg="#fffdf8" padding="16 14" margin="0 0 0 8" gravity="center_horizontal">
                <text text="暂无组别" textSize="13sp" textColor="#8b857b" gravity="center" />
                <text text="点下方「+ 新建组别」添加" textSize="11sp" textColor="#b8b1a6" margin="0 4 0 0" gravity="center" />
            </vertical>);
        tip.setBackground(roundRect("#fffdf8", 12, "#e7e1d4", 1));
        body.addView(tip);
    } else {
        groups.forEach(function (g) {
            var grpRow = ui.inflate(
                <vertical bg="#fffdf8" padding="14 13" margin="0 0 0 8">
                    <horizontal gravity="center_vertical">
                        <vertical id="info" layout_weight="1">
                            <horizontal gravity="center_vertical">
                                <text id="nm" textSize="14sp" textStyle="bold" textColor="#3d342a" />
                                <text text="管理 ›" textSize="11sp" textColor="#b8b1a6" margin="8 0 0 0" />
                            </horizontal>
                            <text id="sub" textSize="11sp" textColor="#8b857b" margin="0 2 0 0" />
                        </vertical>
                        <horizontal id="ctl" gravity="center_vertical" />
                    </horizontal>
                    <horizontal id="amtRow" gravity="center_vertical" margin="12 12 0 0" visibility="gone">
                        <text text="定投金额" textSize="11sp" textColor="#a89e8a" layout_weight="1" />
                        <text id="amt" textSize="13sp" textStyle="bold" textColor="#3d342a" padding="12 7" gravity="center" />
                    </horizontal>
                </vertical>);
            grpRow.setBackground(roundRect(g.dcaEnabled ? "#efe9dc" : "#fffdf8", 14, g.dcaEnabled ? "#3d342a" : "#e7e1d4", g.dcaEnabled ? 2 : 1));
            var preview = (g.funds || []).slice(0, 3).join("、") + ((g.funds || []).length > 3 ? " …" : "");
            grpRow.nm.setText(g.name);
            grpRow.sub.setText((g.funds || []).length + " 只 · " + (preview || "空"));
            // 左侧标题区整块可点 → 进组别详情(替代小 ✎ 图标)
            grpRow.info.on("click", function () { grpRow.info.setAlpha(0.6); safeRender("组别", function () { renderGroupDetail(g, groups); }); });
            var ctl = grpRow.ctl;
            var tg = buildToggleChip(g.dcaEnabled, function (en) {
                g.dcaEnabled = en; saveTradeConfig({ groups: groups });
                toast("「" + g.name + "」定投 " + (en ? "开" : "关"));
                ui.post(function () { renderDcaEdit(); });
            });
            ctl.addView(tg.view);
            if (g.dcaEnabled) {
                grpRow.amtRow.setVisibility(0);
                grpRow.amt.setText(g.dcaAmount + " 元  ✎");
                grpRow.amt.setBackground(roundRect("#f6f4ef", 10, "#e0d8c6", 1));
                grpRow.amt.on("click", function () { grpRow.amt.setAlpha(0.6);
                    cardInput("「" + g.name + "」定投金额(元)", "" + g.dcaAmount, null, function (v) {
                        if (v != null && v !== "" && !isNaN(+v) && +v >= 1) {
                            g.dcaAmount = +v; saveTradeConfig({ groups: groups });
                            toast("金额改为 " + (+v) + " 元");
                        }
                        ui.post(function () { renderDcaEdit(); });
                    });
                });
            }
            body.addView(grpRow);
        });
    }
    body.addView(buildPrimaryButton("+ 新建组别", "#3d342a", function () {
        pickFundName(function (fn) {
            if (!fn) return;
            cardInput("新组别名称", "组" + (groups.length + 1), null, function (nm) {
                if (!nm || !(nm = nm.trim())) return;
                cardInput("「" + nm + "」定投金额(元)", "100", null, function (v) {
                    if (v == null || v === "" || isNaN(+v) || +v < 1) { toast("金额需 >=1"); return; }
                    groups.push({ id: genId(), name: nm, funds: [fn], dcaEnabled: true, dcaAmount: +v });
                    saveTradeConfig({ groups: groups });
                    toast("已新建「" + nm + "」并开启定投");
                    ui.post(function () { renderDcaEdit(); });
                });
            });
        });
    }));
}

// 档位整页列表:每档一行,行内 编辑 / 删除,+ 添加,完成保存。
function renderTiersEdit(title, tiers, fields, onSave, footerBuilder) {
    var list = tiers.map(function (t) { return JSON.parse(JSON.stringify(t)); });
    function fmt(t) {
        var a = fields[0], b = fields[1];
        var av = t[a.k] * (a.scale || 1), bv = t[b.k];
        return a.label + " " + (Math.round(av * 100) / 100) + " · " + b.label + " " + bv;
    }
    // 即时持久化:每次增/改/删后立刻按 fields[0] 升序排序 + onSave 存盘。
    // 避免用户忘记点「完成返回」导致新档丢失(止盈档位曾因此"添加不进去")。
    function persist(msg) {
        var key0 = fields[0].k;
        list.sort(function (x, y) { return x[key0] - y[key0]; });
        onSave(list);
        if (msg) toast(msg);
    }
    function render() {
        var body = startEditPage(title, "共 " + list.length + " 档 · 行内编辑");
        if (!list.length) {
            var tip = ui.inflate(
                <vertical bg="#fffdf8" padding="16 14" margin="0 0 0 8" gravity="center_horizontal">
                    <text text="暂无档位,点下方「+ 添加」" textSize="13sp" textColor="#8b857b" gravity="center" />
                </vertical>);
            tip.setBackground(roundRect("#fffdf8", 12, "#e7e1d4", 1));
            body.addView(tip);
        } else {
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
        }
        if (footerBuilder) {
            var fb = footerBuilder(render);
            if (fb) body.addView(fb);
        }
        body.addView(buildSecondaryButton("+ 添加档位", function () {
            var pre = {}; pre[fields[0].k] = 5; pre[fields[1].k] = (fields[0].k === 'maxLoss' ? 10 : 8);
            cardForm("添加档位", fields.map(function (f) {
                return { key: f.k, label: f.label, inputType: "number" };
            }), pre, function (obj) {
                var va = +obj[fields[0].k], vb = +obj[fields[1].k];
                if (isNaN(va) || isNaN(vb)) { toast("请填数字"); ui.post(render); return; }
                var t = {}; t[fields[0].k] = va / (fields[0].scale || 1); t[fields[1].k] = vb; t.enabled = true;
                list.push(t); persist("已添加"); ui.post(render);
            });
        }));
        // 即时持久化下每步已存盘,无单独「完成保存」按钮;离开本页用 header「‹」返回即可。
    }
    render();
}

// 降本兜底档页脚:亏损超过最深档时买入(独立开关 + 独立金额)。样式仿定投 allRow。
// onRerender:就地重绘档位页回调(避免 toggle/保存后跳回配置页)。
function renderCatchAllFooter(onRerender) {
    var S = loadTradeConfig().strategies.costReduce;
    var ca = S.catchAll || { enabled: false, amount: 20 };
    var row = ui.inflate(
        <vertical bg="#fffdf8" padding="14 13" margin="0 0 0 8">
            <horizontal gravity="center_vertical">
                <vertical layout_weight="1">
                    <horizontal gravity="center_vertical">
                        <text text="兜底档" textSize="14sp" textStyle="bold" textColor="#3d342a" />
                        <text text="亏损∞" textSize="10sp" textStyle="bold" textColor="#8a6a2f" padding="6 2" margin="6 0 0 0" />
                    </horizontal>
                    <text id="sub" textSize="11sp" textColor="#8b857b" margin="0 2 0 0" />
                </vertical>
                <horizontal id="ctl" gravity="center_vertical" />
            </horizontal>
            <horizontal id="amtRow" gravity="center_vertical" margin="12 12 0 0" visibility="gone">
                <text text="兜底金额" textSize="11sp" textColor="#a89e8a" layout_weight="1" />
                <text id="amt" textSize="13sp" textStyle="bold" textColor="#3d342a" padding="12 7" gravity="center" />
            </horizontal>
        </vertical>);
    row.setBackground(roundRect(ca.enabled ? "#efe9dc" : "#f6f4ef", 14, ca.enabled ? "#3d342a" : "#e0d8c6", ca.enabled ? 2 : 1));
    row.sub.setText(ca.enabled ? "超过最深档时买入" : "未开启");
    var tg = buildToggleChip(ca.enabled, function (en) {
        saveStrategy('costReduce', { catchAll: { enabled: en, amount: ca.amount } });
        toast("兜底档 " + (en ? "开" : "关"));
        ui.post(onRerender);
    });
    row.ctl.addView(tg.view);
    if (ca.enabled) {
        row.amtRow.setVisibility(0);
        row.amt.setText(ca.amount + " 元  ✎");
        row.amt.setBackground(roundRect("#f6f4ef", 10, "#e0d8c6", 1));
        row.amt.on("click", function () { row.amt.setAlpha(0.6);
            cardInput("兜底金额(元)", "" + ca.amount, null, function (v) {
                if (v != null && v !== "" && !isNaN(+v) && +v >= 1) {
                    saveStrategy('costReduce', { catchAll: { enabled: ca.enabled, amount: +v } });
                    toast("金额改为 " + (+v) + " 元");
                }
                ui.post(onRerender);
            });
        });
    }
    return row;
}

// 组别详情整页:组名 / 基金 / 定投 / 删除,行内操作。
function renderGroupDetail(group, groups) {
    var body = startEditPage(group.name, (group.funds || []).length + " 只基金");
    body.addView(buildConfigSection("组名"));
    var nmRow = buildConfigRow("名称", "点此重命名", group.name, "#3d342a", function () {
        cardInput("组别新名称", group.name, null, function (nm) {
            var name = (nm || "").trim();
            if (name) { group.name = name; saveTradeConfig({ groups: groups }); toast("已重命名为「" + name + "」"); }
            ui.post(function () { renderGroupDetail(group, groups); });
        });
    });
    body.addView(nmRow);

    body.addView(buildConfigSection("基金"));
    var funds = group.funds || [];
    if (!funds.length) {
        var empty = ui.inflate(
            <vertical bg="#fffdf8" padding="16 14" margin="0 0 0 8" gravity="center_horizontal">
                <text text="该组无基金" textSize="13sp" textColor="#8b857b" gravity="center" />
            </vertical>);
        empty.setBackground(roundRect("#fffdf8", 12, "#e7e1d4", 1));
        body.addView(empty);
    } else {
        funds.forEach(function (fn) {
            body.addView(buildConfigRow(fn, "点此移出本组", "移除", "#a8443a", function () {
                confirmAsync("移除基金", "把「" + fn + "」移出「" + group.name + "」?", function (ok) {
                    if (ok) {
                        group.funds = funds.filter(function (n) { return n !== fn; });
                        saveTradeConfig({ groups: groups });
                        toast("已移除 " + fn);
                    }
                    ui.post(function () { renderGroupDetail(group, groups); });
                });
            }));
        });
    }

    body.addView(buildConfigSection("定投"));
    var dcaRow = ui.inflate(
        <vertical bg="#fffdf8" padding="14 13" margin="0 0 0 8">
            <horizontal gravity="center_vertical">
                <vertical layout_weight="1">
                    <text text="本组定投" textSize="14sp" textStyle="bold" textColor="#3d342a" />
                    <text id="sub" textSize="11sp" textColor="#8b857b" margin="0 2 0 0" />
                </vertical>
                <horizontal id="ctl" gravity="center_vertical" />
            </horizontal>
            <horizontal id="amtRow" gravity="center_vertical" margin="12 12 0 0" visibility="gone">
                <text text="定投金额" textSize="11sp" textColor="#a89e8a" layout_weight="1" />
                <text id="amt" textSize="13sp" textStyle="bold" textColor="#3d342a" padding="12 7" gravity="center" />
            </horizontal>
        </vertical>);
    dcaRow.setBackground(roundRect(group.dcaEnabled ? "#efe9dc" : "#fffdf8", 14, group.dcaEnabled ? "#3d342a" : "#e7e1d4", group.dcaEnabled ? 2 : 1));
    dcaRow.sub.setText(group.dcaEnabled ? "组内每只基金各买一笔" : "未开启");
    dcaRow.ctl.addView(buildToggleChip(group.dcaEnabled, function (en) {
        group.dcaEnabled = en; saveTradeConfig({ groups: groups });
        toast("「" + group.name + "」定投 " + (en ? "开" : "关"));
        ui.post(function () { renderGroupDetail(group, groups); });
    }).view);
    if (group.dcaEnabled) {
        dcaRow.amtRow.setVisibility(0);
        dcaRow.amt.setText(group.dcaAmount + " 元  ✎");
        dcaRow.amt.setBackground(roundRect("#f6f4ef", 10, "#e0d8c6", 1));
        dcaRow.amt.on("click", function () { dcaRow.amt.setAlpha(0.6);
            cardInput("「" + group.name + "」定投金额(元)", "" + group.dcaAmount, null, function (v) {
                if (v != null && v !== "" && !isNaN(+v) && +v >= 1) {
                    group.dcaAmount = +v; saveTradeConfig({ groups: groups });
                    toast("金额改为 " + (+v) + " 元");
                }
                ui.post(function () { renderGroupDetail(group, groups); });
            });
        });
    }
    body.addView(dcaRow);

    body.addView(buildPrimaryButton("✕ 删除组别", "#a8443a", function () {
        confirmAsync("删除组别", "删除「" + group.name + "」?组内基金不受影响。", function (ok) {
            if (ok) {
                var gid = group.id;
                var newGroups = groups.filter(function (x) { return x.id !== gid; });
                saveTradeConfig({ groups: newGroups });
                toast("已删除「" + group.name + "」");
                ui.post(function () { renderConfig(); });
            }
        });
    }));
}

// ---------- 导航 / 采集 ----------
function validBounds(b) { return b && b.bottom > b.top && b.top >= 0 && b.top <= device.height && (b.bottom - b.top) >= 10; }
function clickableAncestor(w) { var cur = w; for (var i = 0; i < 8 && cur; i++) { var c = false; try { c = cur.clickable(); } catch (e) {} if (c) return cur; cur = cur.parent(); } return w; }
function tapSmart(t) {
    if (!text(t).findOne(FIND_TO)) { status("⚠️ 找不到「" + t + "」"); return false; }
    var col = text(t).find(), pick = null;
    for (var i = 0; i < col.size(); i++) { if (validBounds(col.get(i).bounds())) { pick = col.get(i); break; } }
    if (!pick) pick = col.get(0);
    var b = pick.bounds(); if (!validBounds(b)) b = clickableAncestor(pick).bounds();
    click(Math.floor((b.left + b.right) / 2), Math.floor((b.top + b.bottom) / 2));
    status("✓ 点「" + t + "」"); return true;
}
function isInAlipay() { var p = currentPackage(); return p.indexOf("Alipay") >= 0 || p.indexOf("alipay") >= 0; }
function waitPkg(ms) { var t = 0; while (t < ms) { if (isInAlipay()) return true; sleep(400); t += 400; } return isInAlipay(); }
// 是否在理财页(特征:分类栏"稳健理财" 或 "总资产(元)")
function onLicaiPage() {
    return !!((text("稳健理财").findOne(600)) || (textContains("总资产(元)").findOne(500)));
}
function settle() { sleep(800); var prev = -1; for (var i = 0; i < 5; i++) { var n = -1; try { n = className("android.widget.TextView").find().size(); } catch (e) {} if (n > 0 && n === prev) break; prev = n; sleep(350); } }
// 持有页判定:有"持有收益率" 且 没有「买入」按钮(详情页也有"持有收益率",但详情页有买入按钮,会误判)
function onHoldPage(to) { return !!textContains("持有收益率").findOne(to || 500) && !text("买入").findOne(200); }
// 点支付宝 H5(XRiver)详情页左上角返回按钮;比 back 可预测(back 可能退出支付宝)。返回是否点到。
function tapBackBtn() {
    var b = id("com.alipay.multiplatform.phone.xriver_integration:id/frameLayout_backButton").findOne(1500)
        || id("com.alipay.multiplatform.phone.xriver_integration:id/auiconView_backButton").findOne(800);
    if (!b) return false;
    var bd = b.bounds();
    click(Math.floor((bd.left + bd.right) / 2), Math.floor((bd.top + bd.bottom) / 2));
    return true;
}
function openFundPage() {
    if (onHoldPage(800)) return;  // 已在持有列表,无需重新导航(连续买入第二次)
    if (!isInAlipay()) { try { app.launchPackage(PKG); } catch (e) {} if (!waitPkg(6000)) throw new Error("启动支付宝失败,请先手动打开支付宝"); }
    settle();
    for (var i = 0; i < 8; i++) {
        if (onLicaiPage()) break;
        if (text("理财").findOne(700)) { tapSmart("理财"); sleep(WAIT); continue; }
        back(); sleep(1500);
        if (!isInAlipay()) { try { app.launchPackage(PKG); } catch (e) {} waitPkg(4000); }
    }
    if (!onLicaiPage()) throw new Error("未能到达理财页,请手动进支付宝「理财」页后重试");
    tapSmart("基金"); sleep(WAIT); settle();
    tapSmart("持有"); sleep(LOAD_WAIT); settle();
}
function num(re, t) { var m = re.exec(t); return m ? +m[1] : null; }
function parseFund(t) {
    return {
        name: t.split("金额:")[0].replace(/(\s*(支付宝金选|定投))+\s*$/, "").trim(),
        amount: num(/金额:(-?[\d.]+)元/, t), yesterday: num(/昨日收益:(-?[\d.]+)元/, t),
        holding: num(/持有收益:(-?[\d.]+)元/, t), rate: num(/持有收益率:(-?[\d.]+)/, t),
        jinxuan: /支付宝金选/.test(t), autoInvest: /定投/.test(t),
    };
}
// 收集所有节点(任意 class)的文本——基金卡片是 Button,header 是 TextView/View
function allTexts() {
    var arr = [];
    function collect(sel) { try { sel.find().forEach(function (w) { var t = (w.text() || "").trim(); if (t) arr.push(t); }); } catch (e) {} }
    collect(className("android.widget.Button"));
    collect(className("android.widget.TextView"));
    collect(className("android.view.View"));
    return arr;
}
function parseHdr(texts) {
    var h = { total: null, yProfit: null, hProfit: null, cProfit: null, pending: null };
    texts.forEach(function (t) {
        if (h.total === null && /总金额:/.test(t)) h.total = num(/总金额:([\d.]+)/, t);
        if (h.yProfit === null && /昨日收益\(元\)/.test(t)) h.yProfit = num(/昨日收益\(元\)\s*(-?[\d.]+)/, t);
        if (h.hProfit === null && /持有收益\(元\)/.test(t)) h.hProfit = num(/持有收益\(元\)\s*(-?[\d.]+)/, t);
        if (h.cProfit === null && /累计收益\(元\)/.test(t)) h.cProfit = num(/累计收益\(元\)\s*(-?[\d.]+)/, t);
        if (h.pending === null && /买入待确认/.test(t)) h.pending = num(/买入待确认\s*([\d.]+)/, t);
    });
    return h;
}
function parseFunds(texts) {
    var funds = [], seen = {};
    texts.forEach(function (t) {
        if (/金额:.*昨日收益:.*持有收益:.*持有收益率:/.test(t)) {
            var f = parseFund(t);
            if (f.name && !seen[f.name]) { seen[f.name] = 1; funds.push(f); }
        }
    });
    funds.sort(function (a, b) { return b.amount - a.amount; });
    return funds;
}
function collectFunds() {
    openFundPage();
    for (var i = 0; i < 20; i++) { if (textContains("持有收益率").findOne(400)) break; sleep(500); }
    var allT = allTexts();
    var funds = parseFunds(allT);
    if (funds.length === 0) { sleep(1500); allT = allTexts(); funds = parseFunds(allT); } // 兜底再扫一次
    return { hdr: parseHdr(allT), funds: funds, ts: new Date().getTime() };
}
function saveData(d) { try { files.ensureDir(DATA_FILE); files.write(DATA_FILE, JSON.stringify(d)); } catch (e) { console.log("保存失败 " + e); } }
function loadData() { try { if (files.exists(DATA_FILE)) return JSON.parse(files.read(DATA_FILE)); } catch (e) {} return null; }

// ---------- 交易层(buy/sell,本轮)----------
var UI = {
    BTN_BUY: "买入", BTN_SELL: "卖出", BTN_CONFIRM: /^确\s*定$|^确认支付$|^确认$/, // 锚定:仅 exact 匹配 确定/确认支付/确认,不误中"确认协议""我已确认"等残留标签
    FUND_CODE_RE: /^\d{6}$/,
    SELL_CONVERT_DISMISS: "仍要卖出",
    SELL_MAX_RE: /最多可卖出([\d.]+)份/,
    PWD_KEYS: null  // Task 6 recon 标定
};
// 按文字或正则点击(扩展 tapSmart 支持正则,适配"确 定"带空格)
function tapRe(t) {
    var w = (t instanceof RegExp) ? textMatches(t).findOne(FIND_TO) : text(t).findOne(FIND_TO);
    if (!w) { status("⚠️ 找不到「" + t + "」"); return false; }
    var b = w.bounds(); if (!validBounds(b)) b = clickableAncestor(w).bounds();
    click(Math.floor((b.left + b.right) / 2), Math.floor((b.top + b.bottom) / 2));
    status("✓ 点「" + t + "」"); return true;
}
// 导航到指定基金详情页(从持有页按名称点卡片)
function navToDetail(name) {
    openFundPage();
    for (var i = 0; i < 20; i++) { if (textContains("持有收益率").findOne(400)) break; sleep(500); }
    // 持有列表为 H5;目标基金可能在窗口外,bounds 异常(top>bot 或超出屏幕),
    // 但 accessibility click(node.click())对窗口外元素同样有效(verified-flows/02 实测),
    // 故无需滑动到可见,直接找节点 click
    var pick = null;
    var col = className("android.widget.Button").find();
    for (var i = 0; i < col.size(); i++) {
        var t = (col.get(i).text() || "");
        if (t.indexOf(name) >= 0 && /金额:.*昨日收益:/.test(t)) { pick = col.get(i); break; }
    }
    if (!pick) throw new Error("持有页未找到基金「" + name + "」");
    pick.click();  // accessibility click,不依赖可见性
    sleep(3000);
    if (!text(UI.BTN_BUY).findOne(5000)) throw new Error("进详情页失败(未见「买入」)");
    return true;
}
// 支付密码输入:指纹页切"使用密码"→ 点数字键 → 提交(动态找键,不依赖坐标)
function pay(pwd) {
    sleep(2000);
    // 指纹页:点"使用密码"切到数字键盘(若有该入口)
    var usePwd = text("使用密码").findOne(3000) || textContains("使用密码").findOne(2000);
    if (usePwd) { usePwd.click(); sleep(1200); }
    // 逐位点数字键
    for (var i = 0; i < pwd.length; i++) {
        var ch = pwd.charAt(i);
        var key = text(ch).findOne(2000);
        if (key) { key.click(); sleep(220); }
        else throw new Error("密码键「" + ch + "」未找到");
    }
    sleep(1200);
    // 输完 6 位通常自动提交;若有"确认支付"按钮则点
    var sub = text("确认支付").findOne(1500) || textMatches(/^确\s*定$/).findOne(1000);
    if (sub) { sub.click(); }
    return true;
}

// 回持有页(连续买卖/dry-run 退出时用):先连 back 试退支付页;back 退不掉(指纹页等)就启动支付宝重导航
function backToHoldPage() {
    for (var i = 0; i < 4; i++) {
        if (onHoldPage(800)) { console.log("PAY 已回持有页"); return true; }
        back(); sleep(1000);
    }
    if (onHoldPage(800)) return true;
    // back 退不回去(指纹页/确认对话框卡住),启动支付宝重新导航到持有页
    console.log("PAY back 退不回,launchPackage 重进");
    try { app.launchPackage(PKG); } catch (e) {}
    if (!waitPkg(7000)) return false;
    sleep(1500);
    for (var j = 0; j < 8; j++) {
        if (onHoldPage(800)) return true;
        if (onLicaiPage()) { tapSmart("基金"); sleep(WAIT); settle(); tapSmart("持有"); sleep(LOAD_WAIT); settle(); return onHoldPage(1500); }
        back(); sleep(1200);
        if (!isInAlipay()) { try { app.launchPackage(PKG); } catch (e) {} waitPkg(4000); }
    }
    return onHoldPage(1000);
}

// dry-run 退出:点"使用密码"展开密码弹窗 → 点 closeimg 关闭密码键盘 → 显式点详情页返回按钮回持有页
// 密码页是原生 Activity(非 XRiver H5),关闭按钮靠 id 不靠 text:
//   指纹页: id=.../close (desc=取消);密码键盘页: id=.../closeimg (ImageView,无text)
function closePwdAndBack() {
    // 1. 点"使用密码"切到数字键盘(与 pay() 一致的找法)
    var usePwd = text("使用密码").findOne(3000) || textContains("使用密码").findOne(2000);
    if (usePwd) { try { usePwd.click(); } catch (e) { var ub = usePwd.bounds(); click(Math.floor((ub.left + ub.right) / 2), Math.floor((ub.top + ub.bottom) / 2)); } sleep(1200); }
    // 2. 点密码弹窗关闭按钮(按 id:密码键盘页 closeimg,或指纹页 close;坐标点击兜底)
    var closeBtn = id("com.alipay.android.phone.mobilecommon.verifyidentity:id/closeimg").findOne(2000)
        || id("com.alipay.android.phone.seauthenticator.iotauth:id/close").findOne(1500);
    if (closeBtn) {
        try { closeBtn.click(); }
        catch (e) { var cb = closeBtn.bounds(); click(Math.floor((cb.left + cb.right) / 2), Math.floor((cb.top + cb.bottom) / 2)); }
        sleep(1000);
    }
    // 3. 已回持有页则无需再退
    if (onHoldPage(800)) return;
    // 4. 显式点 XRiver 返回按钮逐层退出(详情页→持有页),最多点 3 次;每次点完等页面 settle
    for (var i = 0; i < 3; i++) {
        if (!tapBackBtn()) break;  // 找不到返回按钮(非详情页/已退出 H5),交给 backToHoldPage 兜底
        sleep(1200);
        if (onHoldPage(800)) return;
    }
    // 5. 仍未回持有页,用 launchPackage 重导航兜底
    backToHoldPage();
}

// 买入(o:{code,name,amount,dryRun})
function buy(o) {
    var cfg = loadTradeConfig();
    var dry = o.dryRun != null ? o.dryRun : cfg.dryRun;
    var g = checkGuard({ name: o.name, amount: o.amount, maxAmount: cfg.maxAmount, confirmThreshold: cfg.confirmThreshold });
    if (!g.ok) return { ok: false, status: "rejected", msg: g.reason };
    if (g.needConfirm) {
        // 此处在策略自动化线程内(threads.start),需同步阻塞;浮层卡片是 UI 异步,跨线程同步复杂。
        // 大额确认是低频安全关口,保留原生 dialogs.confirm 同步阻塞。
        var ok = dialogs.confirm("大额确认", "买入 " + o.name + " " + o.amount + " 元?");
        if (!ok) return { ok: false, status: "rejected", msg: "用户取消" };
    }
    var audit = { ts: new Date().getTime(), action: "buy", code: o.code || "", name: o.name, amount: o.amount, dryRun: dry };
    try {
        status("进详情:" + o.name);
        navToDetail(o.name);
        status("买入 " + o.amount + " 元");
        tapSmart(UI.BTN_BUY); sleep(2000);
        var codeNode = textMatches(UI.FUND_CODE_RE).findOne(1500);
        if (codeNode) audit.code = codeNode.text();
        var edit = className("android.widget.EditText").findOne(3000);
        if (!edit) throw new Error("金额输入框未找到");
        var eb = edit.bounds(); click(Math.floor((eb.left + eb.right) / 2), Math.floor((eb.top + eb.bottom) / 2)); sleep(900);  // 坐标点击弹键盘(edit.click 不弹)
        var amt = "" + o.amount;
        for (var ai = 0; ai < amt.length; ai++) {
            var ch = amt.charAt(ai);
            var key = text(ch).findOne(2000);
            if (key) { key.click(); sleep(180); }
            else throw new Error("数字键「" + ch + "」未找到");
        }
        sleep(500);
        tapRe(UI.BTN_CONFIRM); sleep(2500);
        // 支付确认页检测:密码页/指纹页/验证身份页都算"到达支付前"(dry-run 在此停)
        for (var i = 0; i < 3; i++) {
            if (textContains("密码").findOne(1500) || textContains("指纹").findOne(800) || textContains("验证身份").findOne(800) || textContains("验证指纹").findOne(800)) break;
            // 协议勾选(可选):部分基金首次买入/卖出需先勾选协议才会生效。
            // 判据——界面出现「请勾选」提示才点协议框;无提示=已勾选/不需要,跳过(不误点取消)
            if (text("请勾选").findOne(600)) {
                var agree = textContains("点击确定代表您知悉").findOne(1200) || textContains("知悉产品概要").findOne(800);
                if (agree) { try { agree.click(); } catch (e) {} sleep(700); console.log("TRADE 勾选协议"); }
            }
            if (textMatches(UI.BTN_CONFIRM).findOne(800)) { tapRe(UI.BTN_CONFIRM); sleep(1800); }
        }
        status(dry ? "模拟：停在密码页" : "密码页,输入密码…");
        if (dry) {
            // dry-run:走"使用密码→关闭→back2"退出路径(模拟真实下单退出,不卡指纹页),backToHoldPage 最终兜底
            closePwdAndBack();
            audit.status = "dry_run_stopped_at_pwd"; audit.msg = "模拟：到密码页前停止";
            appendAudit(buildAudit(audit)); return { ok: true, status: audit.status, msg: audit.msg };
        }
        var pin = secretStore.get();
        if (!pin) throw new Error("未配置支付密码");
        pay(pin); sleep(3000);
        var done = textContains("申请成功").findOne(8000) || textContains("支付成功").findOne(2000) || textContains("交易成功").findOne(2000) || textContains("已受理").findOne(2000) || textContains("提交成功").findOne(2000);
        if (!done) {
            var pwdErr = textContains("密码不正确").findOne(3000) || textContains("密码错误").findOne(2000);
            if (pwdErr) throw new Error("支付密码错误(请检查配置)");
            throw new Error("未识别到成交页(可能余额不足/超时)");
        }
        audit.status = "ok"; audit.msg = "成交";
        appendAudit(buildAudit(audit));
        status("✅ 成交 " + o.name, "#2e8b57");
        try {
            // 支付成功界面:点右上角"完成"回持有列表(买入卖出都是这流程)
            var finish = text("完成").findOne(3000) || text("返回").findOne(1500) || text("查看").findOne(1500);
            if (finish) { status("点「" + finish.text() + "」回持有页"); finish.click(); sleep(2500); }
            backToHoldPage();
        } catch (ex) { console.log("PAY 退出异常=" + ex); }
        return { ok: true, status: "ok", msg: "成交", audit: audit };
    } catch (e) {
        audit.status = "error"; audit.msg = e.message || String(e);
        appendAudit(buildAudit(audit));
        status("❌ " + audit.msg, "#c0392b");
        for (var k = 0; k < 4; k++) { back(); sleep(800); }
        return { ok: false, status: "error", msg: audit.msg };
    }
}
function runBuy(name, amount) {
    threads.start(function () {
        var myPkg = currentPackage();
        openFloaty("交易进度");
        var r = buy({ name: name, amount: amount });  // dryRun 用配置(关=真实下单)
        ui.post(function () { toast((r.ok ? "✅ " : "❌ ") + r.status + " " + (r.msg || "")); });
        sleep(1500);
        try { app.launchPackage(myPkg); } catch (e) {}
        closeFloaty();
    });
}

// 卖出(o:{code,name,shares,ratio,dryRun}) —— 份额上层算好后填入,或按 ratio 在卖出页读 maxShares 后算;不点"全部"按钮
function sell(o) {
    var cfg = loadTradeConfig();
    var dry = o.dryRun != null ? o.dryRun : cfg.dryRun;
    if (!o.shares && !o.ratio) return { ok: false, status: "rejected", msg: "需指定 shares 或 ratio" };
    var audit = { ts: new Date().getTime(), action: "sell", code: o.code || "", name: o.name, shares: o.shares, dryRun: dry };
    try {
        status("进详情:" + o.name);
        navToDetail(o.name);
        status(o.ratio ? ("卖出 1/" + Math.round(1 / o.ratio) + " 份") : ("卖出 " + o.shares + " 份"));
        // 点"卖出"按钮(找 clickable 的,重试到进卖出页)
        for (var ri = 0; ri < 3; ri++) {
            var sc = text(UI.BTN_SELL).find(), sb = null;
            for (var si = 0; si < sc.size(); si++) { if (sc.get(si).clickable()) { sb = sc.get(si); break; } }
            if (!sb && sc.size()) sb = sc.get(0);
            if (sb) { var bb = sb.bounds(); click(Math.floor((bb.left + bb.right) / 2), Math.floor((bb.top + bb.bottom) / 2)); }
            sleep(2500);
            if (textContains(UI.SELL_CONVERT_DISMISS).findOne(2000) || className("android.widget.EditText").findOne(1000)) break;
        }
        // 转换引导("仍要卖出")概率出现,有则点掉进真正卖出页
        var dismiss = textContains(UI.SELL_CONVERT_DISMISS).findOne(2000);
        if (dismiss) { tapSmart(UI.SELL_CONVERT_DISMISS); sleep(2500); }
        // 读可卖份额
        var maxNode = textMatches(UI.SELL_MAX_RE).findOne(2000);
        var maxShares = null;
        if (maxNode) { var mm = UI.SELL_MAX_RE.exec(maxNode.text()); if (mm) maxShares = +mm[1]; audit.maxShares = maxShares; }
        // 按 ratio 算份额(份额<1 不卖)
        if (o.ratio) {
            if (!maxShares) throw new Error("未读到可卖份额,无法按比例卖出");
            var calc = ratioToShares(o.ratio, maxShares);
            if (calc < 1) { audit.status = "skipped"; audit.msg = "份额不足1份(" + calc + ")"; appendAudit(buildAudit(audit)); return { ok: false, status: "skipped", msg: audit.msg }; }
            o.shares = calc; audit.shares = calc;
        }
        var edit = className("android.widget.EditText").findOne(3000);
        if (!edit) throw new Error("卖出份额输入框未找到");
        var eb = edit.bounds(); click(Math.floor((eb.left + eb.right) / 2), Math.floor((eb.top + eb.bottom) / 2)); sleep(900);
        var sh = "" + o.shares;
        for (var si = 0; si < sh.length; si++) { var ch = sh.charAt(si); var key = text(ch).findOne(2000); if (key) { key.click(); sleep(180); } else throw new Error("数字键「" + ch + "」未找到"); }
        sleep(500);
        tapRe(UI.BTN_CONFIRM); sleep(2500);
        // 支付确认页检测:密码页/指纹页/验证身份页都算"到达支付前"(dry-run 在此停)
        for (var i = 0; i < 3; i++) {
            if (textContains("密码").findOne(1500) || textContains("指纹").findOne(800) || textContains("验证身份").findOne(800) || textContains("验证指纹").findOne(800)) break;
            // 协议勾选(可选):部分基金首次买入/卖出需先勾选协议才会生效。
            // 判据——界面出现「请勾选」提示才点协议框;无提示=已勾选/不需要,跳过(不误点取消)
            if (text("请勾选").findOne(600)) {
                var agree = textContains("点击确定代表您知悉").findOne(1200) || textContains("知悉产品概要").findOne(800);
                if (agree) { try { agree.click(); } catch (e) {} sleep(700); console.log("TRADE 勾选协议"); }
            }
            if (textMatches(UI.BTN_CONFIRM).findOne(800)) { tapRe(UI.BTN_CONFIRM); sleep(1800); }
        }
        status(dry ? "模拟：停在密码页" : "密码页,输入密码…");
        if (dry) {
            // dry-run:走"使用密码→关闭→back2"退出路径(模拟真实下单退出,不卡指纹页),backToHoldPage 最终兜底
            closePwdAndBack();
            audit.status = "dry_run_stopped_at_pwd"; audit.msg = "模拟：到密码页前停止";
            appendAudit(buildAudit(audit)); return { ok: true, status: audit.status, msg: audit.msg };
        }
        var pin = secretStore.get();
        if (!pin) throw new Error("未配置支付密码");
        pay(pin); sleep(3000);
        var done = textContains("申请成功").findOne(8000) || textContains("支付成功").findOne(2000) || textContains("交易成功").findOne(2000) || textContains("已受理").findOne(2000) || textContains("提交成功").findOne(2000);
        if (!done) {
            var pwdErr = textContains("密码不正确").findOne(3000) || textContains("密码错误").findOne(2000);
            if (pwdErr) throw new Error("支付密码错误(请检查配置)");
            throw new Error("未识别到成交页(可能余额不足/超时)");
        }
        audit.status = "ok"; audit.msg = "成交";
        appendAudit(buildAudit(audit));
        status("✅ 成交 " + o.name, "#2e8b57");
        try {
            // 支付成功界面:点右上角"完成"回持有列表(买入卖出都是这流程)
            var finish = text("完成").findOne(3000) || text("返回").findOne(1500) || text("查看").findOne(1500);
            if (finish) { status("点「" + finish.text() + "」回持有页"); finish.click(); sleep(2500); }
            backToHoldPage();
        } catch (ex) { console.log("PAY 退出异常=" + ex); }
        return { ok: true, status: "ok", msg: "成交", audit: audit };
    } catch (e) {
        audit.status = "error"; audit.msg = e.message || String(e);
        appendAudit(buildAudit(audit));
        status("❌ " + audit.msg, "#c0392b");
        for (var k = 0; k < 4; k++) { back(); sleep(800); }
        return { ok: false, status: "error", msg: audit.msg };
    }
}
function runSell(name, shares) {
    threads.start(function () {
        var myPkg = currentPackage();
        openFloaty("交易进度");
        var r = sell({ name: name, shares: shares });  // dryRun 用配置
        ui.post(function () { toast((r.ok ? "✅ " : "❌ ") + r.status + " " + (r.msg || "")); });
        sleep(1500);
        try { app.launchPackage(myPkg); } catch (e) {}
        closeFloaty();
    });
}

// ---------- 真实测试(1元):验证真实支付多基金连续操作 ----------
// 复用已验证的 buy(),仅 dryRun:false + amount:1 循环。安全边界靠结构保证:
//   金额恒定 1 元;min>1 的基金会被支付宝拒(buy 成功检测不到成交页 → 抛错 → 审计 → 跳过),超购不可能。
// 1元起购基金清单由 probe-minbuy.js 探针扫出(2026-07-18,42只里7只1元起购)。
var REAL_TEST_FUNDS = [
    "天弘中证红利低波动100ETF联接C",
    "天弘中证高端装备制造指数增强E",
    "银华中证创新药产业ETF联接A",
    "华泰柏瑞中证红利低波动ETF联接C",
    "华夏中证大数据产业ETF联接A",
    "国泰黄金ETF联接A",
    "民生加银中证内地资源主题指数A",
];
var REAL_TEST_AMOUNT = 1;    // 每只买入金额(元) — 恒定 1,改动即失去最小代价安全边界
var REAL_TEST_MAX = 7;       // 全测 7 只(3只已 2026-07-18 验证全绿,现跑全集连续验证)
function openRealTestConfirm() {
    if (!secretStore.has()) { toast("未设置支付密码,无法真实下单"); return; }
    var data = loadData();
    var held = data && data.funds ? data.funds.map(function (f) { return f.name; }) : [];
    var list = REAL_TEST_FUNDS.filter(function (n) { return held.indexOf(n) >= 0; }).slice(0, REAL_TEST_MAX);
    if (!list.length) { toast("未匹配到测试基金,先点 ↻ 采集一次"); return; }
    var total = list.length * REAL_TEST_AMOUNT;
    cardConfirm("真实买入确认",
        "真实买入 " + list.length + " 只 × " + REAL_TEST_AMOUNT + " 元 = " + total + " 元\n\n" +
        list.join("\n") + "\n\n真实扣款 · 不可撤销,确认执行?",
        function (ok) { if (ok) runRealTest(list); });
}
function runRealTest(list) {
    threads.start(function () {
        var myPkg = currentPackage();
        var summary = { ts: new Date().getTime(), mode: '真实', ok: 0, fail: 0, skip: 0, detail: [] };
        openFloaty("真实测试");
        try {
            list.forEach(function (name, i) {
                status("[" + (i + 1) + "/" + list.length + "] 真实买入 " + name + " " + REAL_TEST_AMOUNT + "元");
                var r = buy({ name: name, amount: REAL_TEST_AMOUNT, dryRun: false });
                summary.detail.push({ a: 'buy', name: name, s: r.status, m: r.msg, amt: REAL_TEST_AMOUNT, strat: '真实测试' });
                status(r.ok ? "✅ " + r.status : "❌ " + (r.msg || r.status), r.ok ? "#2e8b57" : "#c0392b");
                if (r.ok) summary.ok++; else summary.fail++;
            });
            appendAudit(JSON.stringify({ ts: new Date().getTime(), action: 'real_test_batch', n: list.length, amount: REAL_TEST_AMOUNT, ok: summary.ok, fail: summary.fail }));
            status("完成:成交 " + summary.ok + " / 失败 " + summary.fail, "#2e8b57");
        } catch (e) {
            summary.err = String(e);
            status("❌ 真实测试异常: " + e, "#c0392b");
            ui.post(function () { toast("❌ 真实测试异常: " + e); });
        }
        ui.post(function () { toast("真实测试完成: 成交 " + summary.ok + " / 失败 " + summary.fail); });
        sleep(1500); closeFloaty();
        var back = false;
        for (var k = 0; k < 8; k++) { try { app.launchPackage(myPkg); } catch (e) {} sleep(700); if (currentPackage() === myPkg) { back = true; break; } }
        sleep(400);
        if (back) ui.post(function () { try { cardReport(summary); } catch (ex) { console.log("报告异常 " + ex); } });
        else ui.post(function () { toast("真实测试完成,请手动切回本 App 查看报告"); });
    });
}

// ---------- 策略引擎:扫描全部基金,按池内策略买卖一遍 ----------
// 入池的模板才跑;买入按优先级 降本>底仓>定投 取一个;卖出止盈按档位比例;先卖后买。
// 策略 key → 中文标签(单命中或合并的多策略)
var STRAT_CN = { costReduce: '降本', base: '底仓', dca: '定投', takeProfit: '止盈' };
function stratLabel(s) {
    return (s || '').split('+').map(function (k) { return STRAT_CN[k] || k; }).join('+');
}

// 顶部「▶ 运行」入口:①勾选本次策略(默认全启用,停用置灰)→ ②防误触二次确认 → ③执行。
// 防误触:确定按钮需≥1项才点亮;第二步弹确认卡,列明本次将跑的策略 + 模拟/真实,确认后才 runStrategy。
function openRunPicker() {
    if (!floaty.checkPermission()) { floaty.requestPermission(); toast("请先授予「悬浮窗」权限"); return; }
    var c = loadTradeConfig();
    var S = c.strategies;
    var dcaGrpN = (c.groups || []).filter(function (g) { return g.dcaEnabled; }).length;
    // 每条策略带:label(中文名)+ side(买/卖)+ sub(作用范围说明)+ param(参数概览)
    var meta = {
        base:       { side: '买', sub: '持仓 < 目标时补仓 · 全局', param: '目标 ' + S.base.target + '元 · 单次 ' + S.base.amount + '元' },
        dca:        { side: '买', sub: '每组各设金额,组内每只各买一笔', param: (S.dca.allEnabled ? '全部:' + S.dca.allAmount + '元' : '全部:关') + ' · ' + dcaGrpN + '组启用' },
        costReduce: { side: '买', sub: '亏损时按档位加码 · 全局', param: ((S.costReduce.tiers || []).map(function (t) { return (t.maxLoss * 100) + '%内→' + t.amount + '元' + (t.enabled === false ? ' 停' : ''); }).join(' / ') || '无档位') + (S.costReduce.catchAll && S.costReduce.catchAll.enabled ? ' / 兜底→' + S.costReduce.catchAll.amount + '元' : '') },
        takeProfit: { side: '卖', sub: '收益率达档位卖等比份额 · 全局', param: (S.takeProfit.tiers || []).map(function (t) { return (t.minRate * 100) + '%→1/' + t.ratio + (t.enabled === false ? ' 停' : ''); }).join(' / ') || '无档位' }
    };
    var order = ['base', 'dca', 'costReduce', 'takeProfit'];
    var items = order.map(function (k) {
        var en = !!(S[k] && S[k].enabled);
        var m = meta[k];
        return { key: k, label: STRAT_CN[k] || k, side: m.side, sub: m.sub, param: m.param, checked: en, disabled: !en };
    });
    if (!items.some(function (x) { return x.checked; })) {
        toast("没有已启用的策略,请先在配置页启用"); return;
    }
    cardMultiSelect("选择本次运行的策略", items, function (sel) {
        if (sel === null || !sel.length) return;  // 取消或空选 → 不执行
        if (!c.dryRun && !secretStore.has()) { toast("未设置支付密码,无法真实下单"); return; }
        var labels = sel.map(function (k) { return STRAT_CN[k] || k; }).join(" · ");
        var mode = c.dryRun ? "模拟(不下单)" : "真实下单";
        // 第二步:防误触确认卡,明示本次范围 + 模式
        cardConfirm("确认运行", "策略:" + labels + "\n模式:" + mode + "\n\n确认执行?", function (ok) {
            if (!ok) return;
            runStrategy(sel);
        });
    });
}

function runStrategy(onlyKeys) {
    threads.start(function () {
        var myPkg = currentPackage();
        var cfg = loadTradeConfig();
        var summary = { ts: new Date().getTime(), mode: cfg.dryRun ? '模拟' : '真实', buy: 0, sell: 0, ok: 0, fail: 0, skip: 0, detail: [] };
        openFloaty("策略引擎");
        try {
            // 1. 采集
            status("采集中…");
            var data = collectFunds();
            // 基金快照(供报告关联收益率/持仓金额)
            summary.fundMap = {};
            (data.funds || []).forEach(function (f) { summary.fundMap[f.name] = f; });
            summary.hdr = data.hdr || {};
            // 2. 生成计划(只对启用的模板;onlyKeys 进一步收窄本次执行范围)
            var buys = planBuys(data.funds, cfg.strategies, cfg.groups, onlyKeys);
            var sells = planSells(data.funds, cfg.strategies, onlyKeys);
            summary.buy = buys.length; summary.sell = sells.length;
            status("计划:买 " + buys.length + " 笔 / 卖 " + sells.length + " 笔");
            var total = buys.length + sells.length, idx = 0;
            // 3. 先卖后买
            sells.forEach(function (o) {
                idx++;
                status("[" + idx + "/" + total + "] 卖 " + o.name + " (止盈)");
                var r = sell({ name: o.name, ratio: o.ratio, dryRun: cfg.dryRun });
                summary.detail.push({ a: 'sell', name: o.name, s: r.status, m: r.msg, strat: '止盈', ratio: o.ratio });
                status(r.ok ? "✅ " + r.status : "❌ " + (r.msg || r.status), r.ok ? "#2e8b57" : "#c0392b");
                if (r.status === 'skipped') summary.skip++; else if (r.ok) summary.ok++; else summary.fail++;
            });
            buys.forEach(function (o) {
                idx++;
                status("[" + idx + "/" + total + "] 买 " + o.name + " " + o.amount + "元 (" + stratLabel(o.strategy) + ")");
                var r = buy({ name: o.name, amount: o.amount, dryRun: cfg.dryRun });
                summary.detail.push({ a: 'buy', name: o.name, s: r.status, m: r.msg, amt: o.amount, strat: stratLabel(o.strategy) });
                status(r.ok ? "✅ " + r.status : "❌ " + (r.msg || r.status), r.ok ? "#2e8b57" : "#c0392b");
                if (r.ok) summary.ok++; else summary.fail++;
            });
            // 4. 写批次审计
            appendAudit(JSON.stringify({ ts: new Date().getTime(), action: 'strategy_batch', buy: summary.buy, sell: summary.sell, ok: summary.ok, fail: summary.fail, skip: summary.skip, dryRun: !!cfg.dryRun }));
            status("完成:成交 " + summary.ok + " / 失败 " + summary.fail + " / 跳过 " + summary.skip, "#2e8b57");
        } catch (e) {
            console.log("STRAT 异常 " + e);
            summary.err = String(e);
            status("❌ 策略异常: " + e, "#c0392b");
            ui.post(function () { toast("❌ 策略引擎异常: " + e); });
        }
        ui.post(function () { toast("策略完成: 成交 " + summary.ok + " / 失败 " + summary.fail + " / 跳过 " + summary.skip); });
        sleep(1500);
        closeFloaty();
        // 切回本 App:模拟运行后停在支付宝密码页,单次 launchPackage 易被 MIUI 拦截 → 多重重试 + 验证
        var back = false;
        for (var k = 0; k < 8; k++) {
            try { app.launchPackage(myPkg); } catch (e) {}
            sleep(700);
            if (currentPackage() === myPkg) { back = true; break; }
        }
        if (!back) {
            ui.post(function () { toast("策略完成,请手动切回本 App 查看报告"); });
            return;
        }
        sleep(400);  // 等界面稳定到前台后再 inflate(后台 inflate 易致 view 绑定失败)
        // 切回成功(前台)后弹出运行报告卡片
        ui.post(function () {
            try { cardReport(summary); } catch (ex) { console.log("报告卡片异常 " + ex + "\n" + (ex && ex.stack ? ex.stack : "")); }
        });
    });
}

// ---------- UI ----------
ui.layout(
    <frame bg="#f6f4ef">
        <vertical bg="#f6f4ef">
            <horizontal bg="#fffdf8" padding="16 14" gravity="center_vertical">
                <vertical layout_weight="1">
                    <text text="支付宝 · 基金持仓" textColor="#3d342a" textSize="15sp" textStyle="bold" />
                    <text id="meta" text="点右上角刷新按钮获取数据" textColor="#8b857b" textSize="11sp" />
                </vertical>
                <button id="cfg" w="36" h="36" text="⚙" textColor="#3d342a" textSize="20sp" gravity="center" margin="0 0 0 8" padding="0" />
                <button id="runBtn" w="36" h="36" text="▶" textColor="#3d342a" textSize="16sp" gravity="center" margin="0 0 0 6" padding="0" />
                <button id="btn" w="36" h="36" text="↻" textColor="#3d342a" textSize="26sp" gravity="center|top" margin="0 0 0 6" padding="0" />
            </horizontal>
            <scroll layout_weight="1">
                <vertical>
                    <vertical id="body" padding="14">
                        <text text="还没有数据&#10;点右上角刷新按钮采集" textColor="#8b857b" textSize="14sp" gravity="center" padding="0 80" />
                    </vertical>
                    <vertical id="cfgBody" padding="14" visibility="gone" />
                </vertical>
            </scroll>
        </vertical>
        <vertical id="overlay" bg="#80000000" visibility="gone" gravity="center" padding="24">
            <vertical id="overlayCard" bg="#fffdf8" padding="4" />
        </vertical>
    </frame>
);

// 刷新按钮:纯图标(透明背景,完全融入 header)
ui.btn.setBackground(new GD());
ui.cfg.setBackground(new GD());
ui.runBtn.setBackground(new GD());

function applyQuerySort(funds, q, key, dir) {
    return funds.slice()
        .filter(function (f) { var qq = ("" + q).toLowerCase(); return !q || f.name.toLowerCase().indexOf(qq) >= 0; })
        .sort(function (a, b) {
            return key === "name" ? dir * a.name.localeCompare(b.name) : dir * (a[key] - b[key]);
        });
}

function styleChip(v, active) {
    // 默认:纸面 + 描边 + 灰字;激活:淡灰褐印章 + 深墨字
    v.setTextColor(COL(active ? "#3d342a" : "#8b857b"));
    v.setBackground(roundRect(active ? "#efe9dc" : "#fffdf8", 12, "#e7e1d4", 1));
}

// 工具区:搜索框 + 排序标签条(回填 query / 高亮,采集后保留筛选)
function buildToolbar() {
    var bar = ui.inflate(
        <vertical margin="0 6 0 12">
            <input id="qbox" hint="搜索基金名称…" textSize="13sp" textColor="#3d342a" padding="12 11" margin="0 0 0 8" />
            <horizontal id="chips" gravity="center_vertical" />
        </vertical>);
    bar.qbox.setBackground(roundRect("#fffdf8", 12, "#e7e1d4", 1));
    if (query) bar.qbox.setText(query);
    bar.qbox.addTextChangedListener(new android.text.TextWatcher({
        beforeTextChanged: function (s, a, b, c) {}, onTextChanged: function (s, a, b, c) {},
        afterTextChanged: function (s) { query = (s.toString() || "").toLowerCase(); renderList(currentData); }
    }));
    var refs = [];
    SORTS.forEach(function (item) {
        var key = item[0], label = item[1];
        var chip = ui.inflate(<text id="c" textSize="12sp" padding="13 7" margin="0 0 7 0" gravity="center" />);
        var apply = function () { chip.c.setText(label + (key === sortKey ? " ▼" : "")); styleChip(chip.c, key === sortKey); };
        apply();
        chip.c.on("click", function () {
            sortKey = key;
            refs.forEach(function (r) { r(); });
            renderList(currentData);
        });
        refs.push(apply);
        bar.chips.addView(chip);
    });
    ui.body.addView(bar);
}

// 卡片流(随搜索 / 排序重建)
function renderList(d) {
    if (!uiList || !d || !d.funds) return;
    uiList.removeAllViews();
    var rows = applyQuerySort(d.funds, query, sortKey, sortDir);
    if (!rows.length) {
        uiList.addView(ui.inflate(
            <text text="没有匹配的基金" textColor="#8b857b" textSize="13sp" gravity="center" padding="0 30" />));
    } else {
        rows.forEach(function (f) {
            var card = ui.inflate(
                <vertical bg="#fffdf8" padding="13" margin="0 0 0 8">
                    <text id="nm" textSize="13sp" textStyle="bold" textColor="#3d342a" />
                    <text id="tg" textSize="10sp" textColor="#8b857b" />
                    <horizontal margin="0 8 0 0" gravity="center_vertical">
                        <text id="am" layout_weight="1" textSize="17sp" textStyle="bold" textColor="#3d342a" />
                        <text id="rt" textSize="14sp" textStyle="bold" />
                    </horizontal>
                    <horizontal margin="0 4 0 0">
                        <text id="yest" layout_weight="1" textSize="11sp" />
                        <text id="hold" textSize="11sp" />
                    </horizontal>
                    <horizontal margin="0 10 0 0" gravity="center_vertical">
                        <text id="actGrp" layout_weight="1" gravity="center" textSize="11sp" textStyle="bold" padding="0 8" />
                        <text id="actDca" layout_weight="1" gravity="center" textSize="11sp" textStyle="bold" padding="0 8" margin="6 0 0 0" />
                        <text id="actBuy" layout_weight="1" gravity="center" textSize="11sp" textStyle="bold" padding="0 8" margin="6 0 0 0" />
                        <text id="actSell" layout_weight="1" gravity="center" textSize="11sp" textStyle="bold" padding="0 8" margin="6 0 0 0" />
                    </horizontal>
                </vertical>);
            card.setBackground(roundRect("#fffdf8", 12, "#e7e1d4", 1));
            card.nm.setText(f.name);
            card.tg.setText((f.jinxuan ? "支付宝金选  " : "") + (f.autoInvest ? "定投" : ""));
            card.am.setText(money(f.amount));
            card.rt.setText(pct(f.rate)); card.rt.setTextColor(COL(hexOf(f.rate)));
            card.yest.setText("昨日 " + signed(f.yesterday)); card.yest.setTextColor(COL(hexOf(f.yesterday)));
            card.hold.setText("持有 " + signed(f.holding)); card.hold.setTextColor(COL(hexOf(f.holding)));
            // 操作按钮条(纸面描边圆角,等分四格)
            var btnStyle = function (v) { v.setBackground(roundRect("#fffdf8", 9, "#e7e1d4", 1)); v.setTextColor(COL("#6a645a")); };
            card.actGrp.setText("加入组"); btnStyle(card.actGrp);
            card.actDca.setText("定投"); btnStyle(card.actDca);
            card.actBuy.setText("买"); btnStyle(card.actBuy);
            card.actSell.setText("卖"); btnStyle(card.actSell);
            var fn = f.name;
            card.actGrp.on("click", function () { addToGroup(fn); });
            card.actDca.on("click", function () { setupDca(fn); });
            card.actBuy.on("click", function () {
                rawInputAsync(fn + " 买入金额(元)", "10", function (v) {
                    if (v && !isNaN(+v) && +v >= 1) runBuy(fn, +v);
                });
            });
            card.actSell.on("click", function () {
                rawInputAsync(fn + " 卖出份额(份)", "1", function (v) {
                    if (v && !isNaN(+v) && +v >= 1) runSell(fn, +v);
                });
            });
            uiList.addView(card);
        });
    }
    var sum = rows.reduce(function (a, f) { return a + (f.amount || 0); }, 0);
    uiFoot.setText("共 " + d.funds.length + " 只 · 显示 " + rows.length + " 只 · 合计 " + money(sum) +
        "\n点卡片按钮:加入组 / 定投 / 买卖");
}

function render(d) {
    currentData = d;
    var body = ui.body;
    body.removeAllViews();
    resetNav();  // 首页是栈底:回到首页即清空返回栈(硬件返回键将退出 App)
    showHome();  // 确保显示首页容器(采集刷新数据时 cfgBody 可能正显示)
    if (!d || !d.funds || !d.funds.length) {
        uiList = null; uiFoot = null;
        body.addView(ui.inflate(
            <text text="还没有数据&#10;点右上角刷新按钮采集" textColor="#8b857b" textSize="14sp" gravity="center" padding="0 80" />));
        return;
    }
    var h = d.hdr || {};
    // hero
    var hero = ui.inflate(
        <vertical margin="0 2 0 14">
            <text text="总金额" textColor="#8b857b" textSize="11sp" />
            <text id="ht" textSize="38sp" textStyle="bold" textColor="#3d342a" />
            <text id="hy" textSize="14sp" textStyle="bold" margin="0 8 0 0" />
        </vertical>);
    if (h.total != null) hero.ht.setText(money(h.total));
    if (h.yProfit != null) { hero.hy.setText("昨日收益 " + signed(h.yProfit)); hero.hy.setTextColor(COL(hexOf(h.yProfit))); }
    body.addView(hero);
    // 统计(单文本块,避免动态 id 中括号访问问题)
    var st = [["昨日收益", h.yProfit], ["持有收益", h.hProfit], ["累计收益", h.cProfit], ["买入待确认", h.pending]];
    var statTxt = ui.inflate(<text id="s" textSize="12sp" textColor="#6a645a" padding="2 0 0 0" margin="0 0 0 16" />);
    statTxt.s.setText(st.map(function (x) { return x[0] + " " + (x[1] == null ? "—" : signed(x[1])); }).join("    "));
    body.addView(statTxt);
    // 工具区(搜索 + 排序)
    buildToolbar();
    // 卡片容器 + 页脚
    uiList = ui.inflate(<vertical></vertical>);
    body.addView(uiList);
    uiFoot = ui.inflate(<text textSize="11sp" textColor="#b8b1a6" gravity="center" padding="0 14" />);
    body.addView(uiFoot);
    renderList(d);
}

function fmtTs(ts) { var d = new Date(ts); var p = function (n) { return ("0" + n).slice(-2); }; return "更新于 " + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); }

// 启动时显示已存数据
var saved = loadData();
if (saved) { render(saved); ui.meta.setText(fmtTs(saved.ts)); }

// 采集按钮
ui.btn.on("click", function () {
    // 悬浮窗需「显示在其他应用上层」权限;首次使用引导授权
    if (!floaty.checkPermission()) { floaty.requestPermission(); toast("请授予「悬浮窗」权限后再次点击采集"); return; }
    ui.btn.setEnabled(false); ui.btn.setAlpha(0.4);
    threads.start(function () {
        var myPkg = currentPackage(); // 记住本 App 包名,采集后切回
        openFloaty("采集进度");
        var data, err;
        try { data = collectFunds(); saveData(data); }
        catch (e) { err = e.message || String(e); }
        ui.post(function () {
            if (err) { toast("❌ " + err); status("❌ " + err, "#c0392b"); }
            else { render(data); ui.meta.setText(fmtTs(data.ts)); toast("✅ 采集完成,共 " + data.funds.length + " 只基金"); status("✅ 采集完成 " + data.funds.length + " 只", "#2e8b57"); }
            ui.btn.setEnabled(true); ui.btn.setAlpha(1);
        });
        // 采集时切去了支付宝,现在切回本 App(多重尝试 + 验证,应对 MIUI 后台启动拦截)
        var back = false;
        for (var k = 0; k < 4; k++) {
            try { app.launchPackage(myPkg); } catch (e) {}
            sleep(700);
            if (currentPackage() === myPkg) { back = true; break; }
        }
        if (!back) ui.post(function () { toast("采集完成,从后台切回本 App 查看"); });
        sleep(600); closeFloaty();
    });
});

// 设置按钮 = 交易配置
ui.cfg.on("click", function () { openConfigUI(); });
// 顶部运行按钮 → 策略选择 + 防误触确认
ui.runBtn.on("click", function () { openRunPicker(); });
// overlay 点击消费(防穿透到下层);在 ui.layout 后绑定,此时 ui.overlay 才存在
ui.overlay.on("click", function () {});
// 硬件返回键:浮层卡片 > 页面栈 > 退出 App。两个通道都装,互不冲突(已防重复)。
installBackHandler();
