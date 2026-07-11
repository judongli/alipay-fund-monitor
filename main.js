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
                <text id="op" text="准备中…" textColor="#1c1a17" textSize="13sp" textStyle="bold" margin="0 4 0 0" />
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
function checkGuard(o) {
    var wl = o.whitelist || [];
    if (!o.amount || o.amount < 1) return { ok: false, needConfirm: false, reason: '金额必须 >=1.00' };
    if (wl.length > 0 && wl.indexOf(o.name) < 0) return { ok: false, needConfirm: false, reason: '基金 ' + o.name + ' 不在白名单' };
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
// 四套模板(底仓/定投/降本/止盈)默认都不执行,用户把想要的勾进策略池(inPool:true)才跑。
// 买入金额=元,卖出=份(rate 为小数,0.068=6.8%)。
// 多策略命中同一基金:按优先级 降本>底仓>定投 取一个。
function planBuys(funds, S) {
    var orders = [];
    (funds || []).forEach(function (f) {
        var hit = null;
        // 降本:rate<0,取最浅匹配档(tiers 按 maxLoss 升序,首个 rate>=-maxLoss 命中)
        if (!hit && S.costReduce && S.costReduce.inPool && f.rate != null && f.rate < 0) {
            var tier = null;
            (S.costReduce.tiers || []).forEach(function (t) { if (!tier && f.rate >= -t.maxLoss) tier = t; });
            if (tier) hit = { name: f.name, amount: tier.amount, strategy: 'costReduce' };
        }
        if (!hit && S.base && S.base.inPool && f.amount != null && f.amount < S.base.target) {
            hit = { name: f.name, amount: S.base.amount, strategy: 'base' };
        }
        if (!hit && S.dca && S.dca.inPool && (S.dca.whitelist || []).indexOf(f.name) >= 0) {
            hit = { name: f.name, amount: S.dca.amount, strategy: 'dca' };
        }
        if (hit) orders.push(hit);
    });
    return orders;
}
function planSells(funds, S) {
    var orders = [];
    if (!S.takeProfit || !S.takeProfit.inPool) return orders;
    (funds || []).forEach(function (f) {
        if (f.rate == null || f.rate <= 0) return;
        var tier = null;
        (S.takeProfit.tiers || []).forEach(function (t) { if (f.rate >= t.minRate) tier = t; });
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

// ---------- 交易配置(白名单/上限/dryRun + 策略池 + 定时器)----------
var cfgStore = storages.create("fund_trade_cfg");
var DEFAULT_CFG = {
    whitelist: [], maxAmount: 5000, confirmThreshold: 1000, dryRun: true,
    strategies: {
        base:       { inPool: false, target: 100, amount: 100 },
        dca:        { inPool: false, amount: 100, whitelist: [] },
        costReduce: { inPool: false, tiers: [{ maxLoss: 0.05, amount: 10 }, { maxLoss: 0.10, amount: 20 }] },
        takeProfit: { inPool: false, tiers: [
            { minRate: 0.10, ratio: 8 }, { minRate: 0.15, ratio: 7 }, { minRate: 0.20, ratio: 6 },
            { minRate: 0.25, ratio: 5 }, { minRate: 0.30, ratio: 4 }, { minRate: 0.35, ratio: 3 },
            { minRate: 0.40, ratio: 2 }, { minRate: 0.45, ratio: 1 } ] },
    },
    timer: { enabled: false, intervalMin: 60 },
};
// 深合并:顶层标量用 cfgStore 值,缺失则默认;strategies 子树逐模板合并(保留用户参数,补默认 inPool/tiers)
function mergeObj(base, extra) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    return out;
}
function loadTradeConfig() {
    var c = {};
    Object.keys(DEFAULT_CFG).forEach(function (k) {
        if (k === 'strategies') {
            var s = {};
            Object.keys(DEFAULT_CFG.strategies).forEach(function (sk) {
                var saved = cfgStore.contains('strategies.' + sk) ? cfgStore.get('strategies.' + sk) : {};
                s[sk] = mergeObj(DEFAULT_CFG.strategies[sk], saved);
            });
            c.strategies = s;
        } else if (k === 'timer') {
            c.timer = mergeObj(DEFAULT_CFG.timer, cfgStore.contains('timer') ? cfgStore.get('timer') : {});
        } else {
            c[k] = cfgStore.contains(k) ? cfgStore.get(k) : DEFAULT_CFG[k];
        }
    });
    c.whitelist = c.whitelist || [];
    return c;
}
function saveTradeConfig(o) { Object.keys(o).forEach(function (k) { cfgStore.put(k, o[k]); }); }
function openConfigUI() { renderConfig(); }

// rawInput 兼容 Promise(AutoX.js v6 rawInput 可能返回 Promise,同步处理会丢值)
function rawInputAsync(title, prefill, cb) {
    var r = dialogs.rawInput(title, prefill);
    if (r && typeof r.then === "function") r.then(cb);
    else cb(r);
}

// 配置页:在 ui.body 内重建为纸感卡片列表(不嵌套弹窗)
function renderConfig() {
    var c = loadTradeConfig();
    var pinSet = secretStore.has();
    var body = ui.body;
    body.removeAllViews();

    // 顶部返回条
    var top = ui.inflate(
        <horizontal gravity="center_vertical" margin="0 2 0 10">
            <button id="back" text="← 返回" textColor="#1c1a17" textSize="13sp" padding="14 9" />
            <vertical layout_weight="1" padding="6 0 0 0">
                <text text="交易配置" textColor="#1c1a17" textSize="16sp" textStyle="bold" />
                <text text="长按基金卡片可触发交易(演示)" textColor="#8b857b" textSize="11sp" />
            </vertical>
        </horizontal>);
    top.back.setBackground(roundRect("#fffdf8", 12, "#e7e1d4", 1));
    top.back.on("click", function () {
        ui.post(function () {
            var s = loadData();
            render(s);
            if (s) ui.meta.setText(fmtTs(s.ts));
        });
    });
    body.addView(top);

    // —— 安全 · 交易参数 ——
    body.addView(buildConfigSection("安全与风控"));

    // 1. 支付密码
    var pinCard = buildConfigRow("支付密码", "6 位数字 · AES-GCM 加密落盘",
        pinSet ? "已设置 · 点此重置" : "未设置 · 点此设置", pinSet ? "#2e8b57" : "#c0392b",
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

    // 2. 基金白名单
    var wlPreview = c.whitelist.length
        ? c.whitelist.slice(0, 3).join("、") + (c.whitelist.length > 3 ? " …" : "")
        : "未设置";
    var wlCard = buildConfigRow("基金白名单", "仅白名单内基金可交易",
        c.whitelist.length + " 只 · " + wlPreview, "#8b857b",
        function () {
            rawInputAsync("白名单基金名称(逗号分隔)", c.whitelist.join(","), function (s) {
                if (s != null) {
                    var arr = s.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
                    saveTradeConfig({ whitelist: arr });
                    toast("白名单已存 " + arr.length + " 只");
                }
                ui.post(function () { renderConfig(); });
            });
        });
    body.addView(wlCard);

    // 3. 单笔上限
    var maxCard = buildConfigRow("单笔金额上限", "超过此金额的交易将被拒绝",
        c.maxAmount + " 元", "#1c1a17",
        function () {
            rawInputAsync("单笔金额上限(元)", "" + c.maxAmount, function (m) {
                if (m && !isNaN(+m)) saveTradeConfig({ maxAmount: +m });
                ui.post(function () { renderConfig(); });
            });
        });
    body.addView(maxCard);

    // 4. 二次确认阈值
    var thrCard = buildConfigRow("二次确认阈值", "超过此金额需弹窗确认",
        c.confirmThreshold + " 元", "#1c1a17",
        function () {
            rawInputAsync("大额二次确认阈值(元)", "" + c.confirmThreshold, function (t) {
                if (t && !isNaN(+t)) saveTradeConfig({ confirmThreshold: +t });
                ui.post(function () { renderConfig(); });
            });
        });
    body.addView(thrCard);

    // —— 运行模式 ——
    body.addView(buildConfigSection("运行模式"));

    // 5. dry-run 开关
    var dryCard = buildConfigRow("dry-run 演练", "开:走到密码页前停止,不真实下单",
        c.dryRun ? "开 · 演练" : "关 · 真实下单", c.dryRun ? "#2e8b57" : "#c0392b",
        function () {
            var next = !c.dryRun;
            saveTradeConfig({ dryRun: next });
            toast("dry-run " + (next ? "开" : "关"));
            ui.post(function () { renderConfig(); });
        });
    body.addView(dryCard);

    // —— 测试 ——
    body.addView(buildConfigSection("dry-run 测试"));

    // 6. 测试买入
    var buyCard = buildConfigRow("测试买入", "10 元 · 按 dryRun 配置 · 须在白名单",
        "▶ 执行", "#8b857b",
        function () {
            rawInputAsync("基金名称(完整,须在白名单)", "", function (fn) {
                if (fn) runBuy(fn, 10);
            });
        });
    body.addView(buyCard);

    // 7. 测试卖出
    var sellCard = buildConfigRow("测试卖出", "1 份 · 按 dryRun 配置 · 须在白名单",
        "▶ 执行", "#8b857b",
        function () {
            rawInputAsync("基金名称(完整,须在白名单)", "", function (fn) {
                if (fn) runSell(fn, 1);
            });
        });
    body.addView(sellCard);

    // —— 策略池(四套模板,入池才跑;长按切换入池,点击配参数)——
    body.addView(buildConfigSection("策略池 · 入池的模板才执行"));

    var S = c.strategies;
    body.addView(buildStrategyCard("底仓", "持仓金额 < 目标时买一笔(元)",
        "目标 " + S.base.target + " 元 · 单次 " + S.base.amount + " 元", S.base.inPool, function (inPool) {
            saveStrategy('base', { inPool: inPool });
        }, function () {  // 点参数
            rawInputAsync("目标持仓 / 单次金额(逗号分隔)", S.base.target + "," + S.base.amount, function (s) {
                var p = s.split(',').map(function (x) { return +x; });
                if (p.length === 2 && p[0] > 0 && p[1] >= 1) saveStrategy('base', { target: p[0], amount: p[1] });
                ui.post(function () { renderConfig(); });
            });
        }));

    body.addView(buildStrategyCard("定投", "白名单内基金直接买一笔(元)",
        "单次 " + S.dca.amount + " 元 · 白名单 " + S.dca.whitelist.length + " 只", S.dca.inPool, function (inPool) {
            saveStrategy('dca', { inPool: inPool });
        }, function () {
            rawInputAsync("单次金额(元) / 白名单(逗号分隔,用 | 隔开)", S.dca.amount + " | " + S.dca.whitelist.join(","), function (s) {
                var p = ('' + s).split('|');
                var amt = +(p[0] || '').trim();
                var wl = (p[1] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
                if (amt >= 1) saveStrategy('dca', { amount: amt, whitelist: wl });
                ui.post(function () { renderConfig(); });
            });
        }));

    body.addView(buildStrategyCard("降本", "亏损时买入,按亏损档位加码(元)",
        S.costReduce.tiers.map(function (t) { return (t.maxLoss * 100) + "%内→" + t.amount + "元"; }).join(" / "), S.costReduce.inPool, function (inPool) {
            saveStrategy('costReduce', { inPool: inPool });
        }, function () {
            rawInputAsync("档位(亏损%:金额,逗号分隔;如 5:10,10:20)", S.costReduce.tiers.map(function (t) { return (t.maxLoss * 100) + ":" + t.amount; }).join(","), function (s) {
                var tiers = [];
                s.split(',').forEach(function (x) { var p = x.split(':'); if (p.length === 2) tiers.push({ maxLoss: +p[0] / 100, amount: +p[1] }); });
                if (tiers.length) saveStrategy('costReduce', { tiers: tiers });
                ui.post(function () { renderConfig(); });
            });
        }));

    body.addView(buildStrategyCard("止盈", "收益率达档位卖等比份额(份)",
        S.takeProfit.tiers.map(function (t) { return (t.minRate * 100) + "%→1/" + t.ratio; }).join(" / "), S.takeProfit.inPool, function (inPool) {
            saveStrategy('takeProfit', { inPool: inPool });
        }, function () {
            rawInputAsync("档位(收益%:分母,逗号分隔;如 10:8,15:7,20:6,25:5,30:4,35:3,40:2,45:1)",
                S.takeProfit.tiers.map(function (t) { return (t.minRate * 100) + ":" + t.ratio; }).join(","), function (s) {
                    var tiers = [];
                    s.split(',').forEach(function (x) { var p = x.split(':'); if (p.length === 2) tiers.push({ minRate: +p[0] / 100, ratio: +p[1] }); });
                    if (tiers.length) saveStrategy('takeProfit', { tiers: tiers });
                    ui.post(function () { renderConfig(); });
                });
        }));

    // —— 立即执行 + 定时器 ——
    body.addView(buildConfigSection("执行"));

    var execCard = buildConfigRow("立即执行策略", "扫描全部基金,池内策略买卖一遍",
        "▶ " + (c.dryRun ? "演练" : "真实"), c.dryRun ? "#2e8b57" : "#c0392b",
        function () {
            if (!secretStore.has() && !c.dryRun) { toast("未设置支付密码,无法真实下单"); return; }
            runStrategy();
        });
    body.addView(execCard);

    var timerCard = buildConfigRow("定时触发", "脚本常驻前台时按间隔自动执行",
        (c.timer.enabled ? "开 · 每 " + c.timer.intervalMin + " 分钟" : "关"), c.timer.enabled ? "#2e8b57" : "#8b857b",
        function () {
            rawInputAsync("定时间隔(分钟)", "" + c.timer.intervalMin, function (m) {
                if (m && !isNaN(+m) && +m >= 1) {
                    saveTradeConfig({ timer: { enabled: true, intervalMin: +m } });
                    startTimer();
                    toast("定时已开,每 " + m + " 分钟");
                }
                ui.post(function () { renderConfig(); });
            });
        });
    body.addView(timerCard);
    var timerOffCard = buildConfigRow("关闭定时", "停止定时触发",
        c.timer.enabled ? "▶ 关闭" : "已关", c.timer.enabled ? "#c0392b" : "#b8b1a6",
        function () {
            saveTradeConfig({ timer: { enabled: false, intervalMin: c.timer.intervalMin } });
            startTimer();
            toast("定时已关");
            ui.post(function () { renderConfig(); });
        });
    if (c.timer.enabled) body.addView(timerOffCard);

    // 页脚说明
    var foot = ui.inflate(
        <text text="配置存储于本地 storages · 密码经 Android Keystore 加密&#10;点策略卡配参数 · 点右侧「在池/未入池」切换入池"
            textColor="#b8b1a6" textSize="11sp" gravity="center" padding="0 20" />);
    body.addView(foot);
}

// 保存策略子树(合并写回,避免覆盖其它模板)
function saveStrategy(key, patch) {
    var s = loadTradeConfig().strategies[key];
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    cfgStore.put('strategies.' + key, s);
}

// 策略卡片:左标签+参数概览,右入池开关(独立可点)。点卡片=配参数,点右侧开关=切换入池。
// 不用 longClick(设备差异大,常被识别成 click),改用独立开关 chip,交互稳定。
function buildStrategyCard(label, sub, paramText, inPool, onToggle, onEdit) {
    var row = ui.inflate(
        <vertical bg="#fffdf8" padding="14 13" margin="0 0 0 8">
            <horizontal gravity="center_vertical">
                <vertical id="info" layout_weight="1">
                    <text id="lab" textSize="14sp" textStyle="bold" textColor="#1c1a17" />
                    <text id="sub" textSize="11sp" textColor="#8b857b" margin="0 2 0 0" />
                    <text id="prm" textSize="11sp" textColor="#6a645a" margin="0 3 0 0" />
                </vertical>
                <text id="pool" textSize="12sp" textStyle="bold" padding="11 7" />
            </horizontal>
        </vertical>);
    row.setBackground(roundRect(inPool ? "#efe9dc" : "#fffdf8", 12, inPool ? "#1c1a17" : "#e7e1d4", inPool ? 2 : 1));
    row.lab.setText(label + (inPool ? " ✓" : ""));
    row.sub.setText(sub);
    row.prm.setText(paramText);
    row.pool.setText(inPool ? "在池" : "未入池");
    row.pool.setBackground(roundRect(inPool ? "#1c1a17" : "#f0ebe0", 10, null, 0));
    row.pool.setTextColor(COL(inPool ? "#fffdf8" : "#8b857b"));
    row.info.on("click", function () { row.info.setAlpha(0.6); onEdit(); });
    row.pool.on("click", function () { onToggle(!inPool); toast(label + (inPool ? " 移出池" : " 入池")); ui.post(function () { renderConfig(); }); });
    return row;
}

// 分组小标题(纸感 · 次要灰)
function buildConfigSection(label) {
    var s = ui.inflate(<text id="lab" textSize="11sp" textStyle="bold" textColor="#b8b1a6" padding="4 14 0 6" margin="0 4 0 0" />);
    s.lab.setText(label);
    return s;
}

// 配置行卡片:左标签+副标题,右当前值(整行可点)
function buildConfigRow(label, sub, value, valueColor, onTap) {
    var row = ui.inflate(
        <vertical bg="#fffdf8" padding="14 13" margin="0 0 0 8">
            <horizontal gravity="center_vertical">
                <vertical layout_weight="1">
                    <text id="lab" textSize="14sp" textStyle="bold" textColor="#1c1a17" />
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
function openFundPage() {
    if (textContains("持有收益率").findOne(800)) return;  // 已在持有列表,无需重新导航(连续买入第二次)
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
    BTN_BUY: "买入", BTN_SELL: "卖出", BTN_CONFIRM: /确\s*定|确认支付|确认/,
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
    var H = (typeof device !== "undefined" && device.height) ? device.height : 2400;
    var pick = null, b = null, visible = false;
    // 持有列表为 H5 可滚动;目标基金可能在窗口外,bounds 可能是内容坐标(top 很大)或异常(top>bot),滑动到可见再坐标 click
    for (var page = 0; page < 12; page++) {
        var col = className("android.widget.Button").find();
        pick = null;
        for (var i = 0; i < col.size(); i++) {
            var t = (col.get(i).text() || "");
            if (t.indexOf(name) >= 0 && /金额:.*昨日收益:/.test(t)) { pick = col.get(i); break; }
        }
        if (pick) {
            b = pick.bounds();
            // 可见:Rect 有效(top<bottom) 且 完全在屏幕内(留 50 边距)
            visible = (b.top < b.bottom && b.top > 50 && b.bottom < H - 50);
            if (visible) break;
        }
        swipe(540, Math.floor(H * 0.72), 540, Math.floor(H * 0.25), 500);  // 向上滑露出下方基金
        sleep(1400);
    }
    if (!pick) throw new Error("持有页未找到基金「" + name + "」");
    if (visible) {
        click(Math.floor((b.left + b.right) / 2), Math.floor((b.top + b.bottom) / 2));
    } else {
        pick.click();  // 兜底:accessibility click(不依赖可见)
    }
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
        if (textContains("持有收益率").findOne(800)) { console.log("PAY 已回持有页"); return true; }
        back(); sleep(1000);
    }
    if (textContains("持有收益率").findOne(800)) return true;
    // back 退不回去(指纹页/确认对话框卡住),启动支付宝重新导航到持有页
    console.log("PAY back 退不回,launchPackage 重进");
    try { app.launchPackage(PKG); } catch (e) {}
    if (!waitPkg(7000)) return false;
    sleep(1500);
    for (var j = 0; j < 8; j++) {
        if (textContains("持有收益率").findOne(800)) return true;
        if (onLicaiPage()) { tapSmart("基金"); sleep(WAIT); settle(); tapSmart("持有"); sleep(LOAD_WAIT); settle(); return !!textContains("持有收益率").findOne(1500); }
        back(); sleep(1200);
        if (!isInAlipay()) { try { app.launchPackage(PKG); } catch (e) {} waitPkg(4000); }
    }
    return !!textContains("持有收益率").findOne(1000);
}

// 买入(o:{code,name,amount,dryRun})
function buy(o) {
    var cfg = loadTradeConfig();
    var dry = o.dryRun != null ? o.dryRun : cfg.dryRun;
    var g = checkGuard({ name: o.name, amount: o.amount, whitelist: cfg.whitelist, maxAmount: cfg.maxAmount, confirmThreshold: cfg.confirmThreshold });
    if (!g.ok) return { ok: false, status: "rejected", msg: g.reason };
    if (g.needConfirm) {
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
            if (textMatches(UI.BTN_CONFIRM).findOne(800)) { tapRe(UI.BTN_CONFIRM); sleep(1800); }
        }
        status(dry ? "dry-run 停在密码页" : "密码页,输入密码…");
        if (dry) {
            // dry-run:连 back 退支付页,退不掉就启动支付宝重进持有页(指纹页 back 常无效,靠 launchPackage 兜底)
            for (var bi = 0; bi < 4; bi++) { back(); sleep(700); if (textContains("持有收益率").findOne(600)) break; }
            backToHoldPage();
            audit.status = "dry_run_stopped_at_pwd"; audit.msg = "dry-run 到密码页前停止";
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
    if (cfg.whitelist.length > 0 && cfg.whitelist.indexOf(o.name) < 0) return { ok: false, status: "rejected", msg: "基金不在白名单" };
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
            if (textMatches(UI.BTN_CONFIRM).findOne(800)) { tapRe(UI.BTN_CONFIRM); sleep(1800); }
        }
        status(dry ? "dry-run 停在密码页" : "密码页,输入密码…");
        if (dry) {
            // dry-run:连 back 退支付页,退不掉就启动支付宝重进持有页(指纹页 back 常无效,靠 launchPackage 兜底)
            for (var bi = 0; bi < 4; bi++) { back(); sleep(700); if (textContains("持有收益率").findOne(600)) break; }
            backToHoldPage();
            audit.status = "dry_run_stopped_at_pwd"; audit.msg = "dry-run 到密码页前停止";
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

// ---------- 策略引擎:扫描全部基金,按池内策略买卖一遍 ----------
// 入池的模板才跑;买入按优先级 降本>底仓>定投 取一个;卖出止盈按档位比例;先卖后买。
function runStrategy() {
    threads.start(function () {
        var myPkg = currentPackage();
        var cfg = loadTradeConfig();
        var summary = { buy: 0, sell: 0, ok: 0, fail: 0, skip: 0, detail: [] };
        openFloaty("策略引擎");
        try {
            // 1. 采集
            status("采集中…");
            var data = collectFunds();
            // 2. 生成计划(只对池内模板)
            var buys = planBuys(data.funds, cfg.strategies);
            var sells = planSells(data.funds, cfg.strategies);
            summary.buy = buys.length; summary.sell = sells.length;
            status("计划:买 " + buys.length + " 笔 / 卖 " + sells.length + " 笔");
            var total = buys.length + sells.length, idx = 0;
            // 3. 先卖后买
            sells.forEach(function (o) {
                idx++;
                status("[" + idx + "/" + total + "] 卖 " + o.name + " (止盈)");
                var r = sell({ name: o.name, ratio: o.ratio, dryRun: cfg.dryRun });
                summary.detail.push({ a: 'sell', name: o.name, s: r.status, m: r.msg });
                status(r.ok ? "✅ " + r.status : "❌ " + (r.msg || r.status), r.ok ? "#2e8b57" : "#c0392b");
                if (r.status === 'skipped') summary.skip++; else if (r.ok) summary.ok++; else summary.fail++;
            });
            buys.forEach(function (o) {
                idx++;
                status("[" + idx + "/" + total + "] 买 " + o.name + " " + o.amount + "元 (" + o.strategy + ")");
                var r = buy({ name: o.name, amount: o.amount, dryRun: cfg.dryRun });
                summary.detail.push({ a: 'buy', name: o.name, s: r.status, m: r.msg });
                status(r.ok ? "✅ " + r.status : "❌ " + (r.msg || r.status), r.ok ? "#2e8b57" : "#c0392b");
                if (r.ok) summary.ok++; else summary.fail++;
            });
            // 4. 写批次审计
            appendAudit(JSON.stringify({ ts: new Date().getTime(), action: 'strategy_batch', buy: summary.buy, sell: summary.sell, ok: summary.ok, fail: summary.fail, skip: summary.skip, dryRun: !!cfg.dryRun }));
            status("完成:成交 " + summary.ok + " / 失败 " + summary.fail + " / 跳过 " + summary.skip, "#2e8b57");
        } catch (e) {
            console.log("STRAT 异常 " + e);
            status("❌ 策略异常: " + e, "#c0392b");
            ui.post(function () { toast("❌ 策略引擎异常: " + e); });
        }
        ui.post(function () { toast("策略完成: 成交 " + summary.ok + " / 失败 " + summary.fail + " / 跳过 " + summary.skip); });
        sleep(2000);
        try { app.launchPackage(myPkg); } catch (e) {}
        closeFloaty();
    });
}

// ---------- 定时器(脚本常驻前台 setInterval,HyperOS 后台不可靠)----------
var timerHandle = null;
function startTimer() {
    var cfg = loadTradeConfig();
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
    if (!cfg.timer || !cfg.timer.enabled) return;
    var ms = (cfg.timer.intervalMin || 60) * 60 * 1000;
    timerHandle = setInterval(function () { runStrategy(); }, ms);
    console.log("TIMER 已启动,每 " + cfg.timer.intervalMin + " 分钟触发");
}

// ---------- UI ----------
ui.layout(
    <vertical bg="#f6f4ef">
        <horizontal bg="#fffdf8" padding="16 14" gravity="center_vertical">
            <vertical layout_weight="1">
                <text text="支付宝 · 基金持仓" textColor="#1c1a17" textSize="15sp" textStyle="bold" />
                <text id="meta" text="点右上角刷新按钮获取数据" textColor="#8b857b" textSize="11sp" />
            </vertical>
            <button id="cfg" w="44" h="44" text="⚙" textColor="#1c1a17" textSize="22sp" gravity="center" />
            <button id="btn" w="44" h="44" text="↻" textColor="#1c1a17" textSize="24sp" gravity="center" />
        </horizontal>
        <scroll layout_weight="1">
            <vertical id="body" padding="14">
                <text text="还没有数据&#10;点右上角刷新按钮采集" textColor="#8b857b" textSize="14sp" gravity="center" padding="0 80" />
            </vertical>
        </scroll>
    </vertical>
);

// 刷新按钮:纯图标(透明背景,完全融入 header)
ui.btn.setBackground(new GD());
ui.cfg.setBackground(new GD());

function applyQuerySort(funds, q, key, dir) {
    return funds.slice()
        .filter(function (f) { var qq = ("" + q).toLowerCase(); return !q || f.name.toLowerCase().indexOf(qq) >= 0; })
        .sort(function (a, b) {
            return key === "name" ? dir * a.name.localeCompare(b.name) : dir * (a[key] - b[key]);
        });
}

function styleChip(v, active) {
    // 默认:纸面 + 描边 + 灰字;激活:淡灰褐印章 + 深墨字
    v.setTextColor(COL(active ? "#1c1a17" : "#8b857b"));
    v.setBackground(roundRect(active ? "#efe9dc" : "#fffdf8", 12, "#e7e1d4", 1));
}

// 工具区:搜索框 + 排序标签条(回填 query / 高亮,采集后保留筛选)
function buildToolbar() {
    var bar = ui.inflate(
        <vertical margin="0 6 0 12">
            <input id="qbox" hint="搜索基金名称…" textSize="13sp" textColor="#1c1a17" padding="12 11" margin="0 0 0 8" />
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
                    <text id="nm" textSize="13sp" textStyle="bold" textColor="#1c1a17" />
                    <text id="tg" textSize="10sp" textColor="#8b857b" />
                    <horizontal margin="0 8 0 0" gravity="center_vertical">
                        <text id="am" layout_weight="1" textSize="17sp" textStyle="bold" textColor="#1c1a17" />
                        <text id="rt" textSize="14sp" textStyle="bold" />
                    </horizontal>
                    <horizontal margin="0 4 0 0">
                        <text id="yest" layout_weight="1" textSize="11sp" />
                        <text id="hold" textSize="11sp" />
                    </horizontal>
                </vertical>);
            card.setBackground(roundRect("#fffdf8", 12, "#e7e1d4", 1));
            card.nm.setText(f.name);
            card.tg.setText((f.jinxuan ? "支付宝金选  " : "") + (f.autoInvest ? "定投" : ""));
            card.am.setText(money(f.amount));
            card.rt.setText(pct(f.rate)); card.rt.setTextColor(COL(hexOf(f.rate)));
            card.yest.setText("昨日 " + signed(f.yesterday)); card.yest.setTextColor(COL(hexOf(f.yesterday)));
            card.hold.setText("持有 " + signed(f.holding)); card.hold.setTextColor(COL(hexOf(f.holding)));
            uiList.addView(card);
        });
    }
    var sum = rows.reduce(function (a, f) { return a + (f.amount || 0); }, 0);
    uiFoot.setText("共 " + d.funds.length + " 只 · 显示 " + rows.length + " 只 · 合计 " + money(sum) +
        "\n数据来源:支付宝「基金·持有」页 · 只读,不涉及交易");
}

function render(d) {
    currentData = d;
    var body = ui.body;
    body.removeAllViews();
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
            <text id="ht" textSize="38sp" textStyle="bold" textColor="#1c1a17" />
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

// 启动时恢复定时器(脚本常驻前台才有效)
startTimer();
