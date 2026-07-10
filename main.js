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

// ---------- 导航 / 采集 ----------
function validBounds(b) { return b && b.bottom > b.top && b.top >= 0 && b.top <= device.height && (b.bottom - b.top) >= 10; }
function clickableAncestor(w) { var cur = w; for (var i = 0; i < 8 && cur; i++) { var c = false; try { c = cur.clickable(); } catch (e) {} if (c) return cur; cur = cur.parent(); } return w; }
function tapSmart(t) {
    if (!text(t).findOne(FIND_TO)) { console.log("⚠️ 找不到「" + t + "」"); return false; }
    var col = text(t).find(), pick = null;
    for (var i = 0; i < col.size(); i++) { if (validBounds(col.get(i).bounds())) { pick = col.get(i); break; } }
    if (!pick) pick = col.get(0);
    var b = pick.bounds(); if (!validBounds(b)) b = clickableAncestor(pick).bounds();
    click(Math.floor((b.left + b.right) / 2), Math.floor((b.top + b.bottom) / 2));
    console.log("✓ 点「" + t + "」"); return true;
}
function isInAlipay() { var p = currentPackage(); return p.indexOf("Alipay") >= 0 || p.indexOf("alipay") >= 0; }
function waitPkg(ms) { var t = 0; while (t < ms) { if (isInAlipay()) return true; sleep(400); t += 400; } return isInAlipay(); }
// 是否在理财页(特征:分类栏"稳健理财" 或 "总资产(元)")
function onLicaiPage() {
    return !!((text("稳健理财").findOne(600)) || (textContains("总资产(元)").findOne(500)));
}
function settle() { sleep(800); var prev = -1; for (var i = 0; i < 5; i++) { var n = -1; try { n = className("android.widget.TextView").find().size(); } catch (e) {} if (n > 0 && n === prev) break; prev = n; sleep(350); } }
function openFundPage() {
    if (!isInAlipay()) { try { app.launchPackage(PKG); } catch (e) {} if (!waitPkg(6000)) throw new Error("启动支付宝失败,请先手动打开支付宝"); }
    settle();
    // 无 root 无法强制重启支付宝;改用「检测+返回键」走到理财页,适配任意起始页
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

// ---------- UI ----------
ui.layout(
    <vertical bg="#f6f4ef">
        <horizontal bg="#fffdf8" padding="16 14" gravity="center_vertical">
            <vertical layout_weight="1">
                <text text="支付宝 · 基金持仓" textColor="#1c1a17" textSize="15sp" textStyle="bold" />
                <text id="meta" text="点右上角刷新按钮获取数据" textColor="#8b857b" textSize="11sp" />
            </vertical>
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
    ui.btn.setEnabled(false); ui.btn.setAlpha(0.4);
    threads.start(function () {
        var myPkg = currentPackage(); // 记住本 App 包名,采集后切回
        var data, err;
        try { data = collectFunds(); saveData(data); }
        catch (e) { err = e.message || String(e); }
        ui.post(function () {
            if (err) { toast("❌ " + err); }
            else { render(data); ui.meta.setText(fmtTs(data.ts)); toast("✅ 采集完成,共 " + data.funds.length + " 只基金"); }
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
    });
});
