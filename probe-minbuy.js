// 探针:扫描持仓基金,找出"1 元起购"(最低申购 ≤1 元)的基金。只读,不下单。
//
// ★本脚本工具函数逐字借自 verified-flows/02_multi_fund_pwd_flow.js(6/6 实测跑通),
//   只把 runOne() 改成"读起购金额、不进密码页"的探测版。导航/dump/退出策略均沿用已验证写法。
//
// 用法:
//   1. 手动把支付宝停到「理财-基金-持有」页(前置,同 verified-flows 约定)。
//   2. AutoX.js 打开本文件 → F5 运行。
//   3. 先把下面 MAX_FUNDS 改成 3 小测一遍(验证能跑通 + 看清起购文本格式),把控制台日志贴回;
//      确认无误后改回 999 跑全集,再贴回 → 我据此给出"真实测试(1元)"入口。
//
// 安全:本脚本绝不点「确认支付」,只进详情/买入页读文本再退出。无任何扣款风险。
// 输出:控制台紧凑日志(贴这个) + /sdcard/Download/minbuy_probe.json 完整明细(兜底)。

"auto";
auto.waitFor();

var PKG = "com.eg.android.AlipayGphone";
var FIND_TO = 6000, WAIT = 1500, LOAD_WAIT = 3000;
var OUT_FILE = "/sdcard/Download/minbuy_probe.json";
var MAX_FUNDS = 999;   // 全集(42 只,约 6-7 分钟,只读零扣款)

try { files.write(OUT_FILE, "[]"); } catch (e) {}
function log(m) { console.log(m); }

// ===== 工具函数(借自 verified-flows/02,验证过的写法)=====
function onHoldPage(to) { return !!textContains("持有收益率").findOne(to || 500) && !text("买入").findOne(200); }
function isInAlipay() { var p = currentPackage(); return p.indexOf("Alipay") >= 0 || p.indexOf("alipay") >= 0; }
function waitPkg(ms) { var t = 0; while (t < ms) { if (isInAlipay()) return true; sleep(400); t += 400; } return isInAlipay(); }
function onLicaiPage() { return !!((text("稳健理财").findOne(600)) || (textContains("总资产(元)").findOne(500))); }
function settle() { sleep(800); var prev = -1; for (var i = 0; i < 5; i++) { var n = -1; try { n = className("android.widget.TextView").find().size(); } catch (e) {} if (n > 0 && n === prev) break; prev = n; sleep(350); } }
function tapBackBtn() {
    var b = id("com.alipay.multiplatform.phone.xriver_integration:id/frameLayout_backButton").findOne(1500)
        || id("com.alipay.multiplatform.phone.xriver_integration:id/auiconView_backButton").findOne(800);
    if (!b) return false;
    var bd = b.bounds(); click(Math.floor((bd.left + bd.right) / 2), Math.floor((bd.top + bd.bottom) / 2)); return true;
}
function tapRe(t) {  // 正则或文字 → 直接 bounds 中心 click
    var w = (t instanceof RegExp) ? textMatches(t).findOne(2500) : text(t).findOne(2500);
    if (!w) return false;
    var b = w.bounds(); click(Math.floor((b.left + b.right) / 2), Math.floor((b.top + b.bottom) / 2)); return true;
}
function clickableAncestor(node) { var n = node, i = 0; while (n && i < 8) { try { if (n.clickable()) return n; } catch (e) {} n = n.parent(); i++; } return null; }
// 轮询等待:checkFn 返回真值即成功(包容 H5 白屏/卡顿,不靠固定 sleep)— 02 关键发现3
function waitFor(checkFn, timeoutMs, intervalMs) { intervalMs = intervalMs || 500; var t = 0; while (t < timeoutMs) { try { var v = checkFn(); if (v) return v; } catch (e) {} sleep(intervalMs); t += intervalMs; } return null; }

// ===== 失败 dump(抓 text/desc/id/cls/bounds,不 exit,继续下一只)— 01 关键发现7 =====
function dumpElems() {
    var arr = [];
    var classes = ["android.widget.Button", "android.widget.TextView", "android.widget.ImageView",
        "android.widget.ImageButton", "android.widget.EditText", "android.view.View",
        "android.widget.FrameLayout", "android.widget.RelativeLayout", "android.widget.LinearLayout"];
    classes.forEach(function (cls) {
        try {
            className(cls).find().forEach(function (w) {
                try {
                    var t = (w.text() || "").replace(/\n/g, " ").trim();
                    var d = (w.desc() || "").replace(/\n/g, " ").trim();
                    var rid = w.id() || "";
                    if (t || d || rid) arr.push({ cls: "" + (w.className() || ""), id: rid, text: t, desc: d });
                } catch (e) {}
            });
        } catch (e) {}
    });
    return arr;
}

// ===== 列持有页全部基金卡片(02 listFundCards,扫 Button 不滚动)=====
function listFundCards() {
    var arr = [];
    var col = className("android.widget.Button").find();
    for (var i = 0; i < col.size(); i++) {
        var t = (col.get(i).text() || "");
        if (t.indexOf("金额:") >= 0 && /昨日收益:/.test(t)) {
            arr.push(t.split("金额:")[0].replace(/(\s*(支付宝金选|定投))+\s*$/, "").trim());
        }
    }
    return arr;
}
// 进详情:直接 accessibility click,不滑动(02 关键发现1:窗口外也可靠)
function enterDetailNoScroll(name) {
    var col = className("android.widget.Button").find(), pick = null;
    for (var i = 0; i < col.size(); i++) {
        var t = (col.get(i).text() || "");
        if (t.indexOf(name) >= 0 && /金额:.*昨日收益:/.test(t)) { pick = col.get(i); break; }
    }
    if (!pick) return false;
    pick.click();
    return !!waitFor(function () { return text("买入").findOne(800); }, 12000, 600);
}
// 回持有页:先 tapBackBtn/back 多轮;回不到则 launchPackage 重导航(长探测不因一只卡死终止全部)
function backToHoldResilient() {
    for (var i = 0; i < 5; i++) { if (onHoldPage(800)) return true; if (!tapBackBtn()) back(); sleep(1500); }
    if (onHoldPage(800)) return true;
    try { app.launchPackage(PKG); } catch (e) {}
    if (!waitPkg(7000)) return false;
    sleep(1500);
    for (var j = 0; j < 8; j++) {
        if (onHoldPage(800)) return true;
        if (onLicaiPage()) { tapRe("基金"); sleep(WAIT); settle(); tapRe("持有"); sleep(LOAD_WAIT); settle(); return onHoldPage(1500); }
        back(); sleep(1200);
        if (!isInAlipay()) { try { app.launchPackage(PKG); } catch (e) {} waitPkg(4000); }
    }
    return onHoldPage(1000);
}

// ===== 起购金额检测:扫元素 text+desc+id =====
//   通道A 关键词(起购/最低买入…):命中则取该 blob 内数字最小者
//   通道B 金额起(X元起 / ¥X起 / 起X元):精确补"1元起"这类措辞,不误中"最近7天"
var KW = /起购金额|起投金额|起售金额|最低买入|最低申购|最低投资|最低起|最小买入|单笔最低|起购|起投|起售/;
var AMT_QI = /([\d.]+)\s*元\s*起|[¥￥]\s*([\d.]+)\s*起|起\s*([\d.]+)\s*元/g;
function detectMin(els) {
    var hits = [];
    els.forEach(function (e) {
        var blob = e.text + " " + e.desc + " " + e.id;
        if (!blob) return;
        if (KW.test(blob)) {
            var re = /([\d.]+)\s*元?/g, m, nums = [];
            while ((m = re.exec(blob)) !== null) { var n = parseFloat(m[1]); if (!isNaN(n) && n > 0 && n < 1000000) nums.push(n); }
            if (nums.length) hits.push({ field: e.text ? "text" : (e.desc ? "desc" : "id"), raw: e.text || e.desc || e.id, min: Math.min.apply(null, nums) });
        }
        var m2, amtQi = AMT_QI;
        while ((m2 = amtQi.exec(blob)) !== null) {  // 通道B:精确"金额起"
            var v = parseFloat(m2[1] || m2[2] || m2[3]);
            if (!isNaN(v) && v > 0 && v < 1000000) hits.push({ field: e.text ? "text" : (e.desc ? "desc" : "id"), raw: e.text || e.desc || e.id, min: v });
        }
    });
    if (!hits.length) return { min: null, hits: [] };
    return { min: Math.min.apply(null, hits.map(function (h) { return h.min; })), hits: hits };
}

function short(s, n) { s = "" + s; return s.length > n ? s.slice(0, n) + "…" : s; }

// ===== 单只探测(读详情页 + 买入页,不进密码页)=====
function probeOne(name) {
    var r = { name: name, min: null, source: "", detailHit: null, buyHit: null, editHint: "", note: "", failDump: null };
    try {
        if (!enterDetailNoScroll(name)) { r.note = "进详情失败"; r.failDump = dumpElems(); return r; }
        sleep(700);
        var dD = detectMin(dumpElems());
        if (dD.min != null) { r.min = dD.min; r.source = "detail"; r.detailHit = dD.hits[0]; }

        if (tapRe(/买入/)) {
            // 等买入页出现输入框或确认按钮(包容白屏卡顿)
            waitFor(function () { return className("android.widget.EditText").findOne(800) || text("确认支付").findOne(400) || textMatches(/^确\s*定$/).findOne(400); }, 8000, 700);
            var bEls = dumpElems();
            var bD = detectMin(bEls);
            if (bD.min != null) { r.min = bD.min; r.source = "buy"; r.buyHit = bD.hits[0]; }  // 买入页优先
            try { var ed = className("android.widget.EditText").findOne(2000); if (ed && ed.getHint) r.editHint = (ed.getHint() || "") + ""; } catch (e) {}
        } else { r.note = (r.note ? r.note + "; " : "") + "未见买入按钮"; }
    } catch (e) { r.note = "异常:" + e; r.failDump = dumpElems(); }
    try { backToHoldResilient(); } catch (e) {}
    return r;
}

// ===== 主流程 =====
log("===== 起购金额探测开始 (MAX_FUNDS=" + MAX_FUNDS + ") =====");
if (!onHoldPage(1500)) { log("❌ 前置不在「理财-基金-持有」页,请手动停到持有页再 F5"); exit(); }

var cards = listFundCards();
log("持有页基金数=" + cards.length + ",本次探测前 " + Math.min(cards.length, MAX_FUNDS) + " 只");
if (!cards.length) { log("❌ 没有基金卡片"); exit(); }

var N = Math.min(cards.length, MAX_FUNDS);
var results = [], y1 = [], gt1 = [], unknown = [];
for (var i = 0; i < N; i++) {
    var name = cards[i];
    log("[" + (i + 1) + "/" + N + "] " + name);
    var r = probeOne(name);
    results.push(r);
    if (r.min == null) {
        log("    → 未检出起购关键词 " + (r.note ? "⚠" + r.note : "") + " (见 json)");
    } else {
        var h = r.buyHit || r.detailHit;
        log("    → 起购=" + r.min + "元" + (r.min <= 1 ? " ✓可1元" : "") + "  [" + r.source + ":" + h.field + "]「" + short(h.raw, 50) + "」" + (r.editHint ? " hint:" + short(r.editHint, 24) : ""));
    }
    if (r.min == null) unknown.push(name);
    else if (r.min <= 1) y1.push(name + (r.min < 1 ? "(" + r.min + "元)" : ""));
    else gt1.push(name + "(" + r.min + "元)");
}

log("================ 完成 ================");
log("✓ 可 1 元起购(" + y1.length + "): " + (y1.join(" | ") || "无"));
log("✗ >1 元(" + gt1.length + "): " + (gt1.join(" | ") || "无"));
log("? 未检出(" + unknown.length + "): " + (unknown.join(" | ") || "无"));
try { files.ensureDir(OUT_FILE); files.write(OUT_FILE, JSON.stringify({ ts: new Date().getTime(), count: results.length, funds: results }, null, 2)); log("完整明细(含未命中页全元素 dump)已写入 " + OUT_FILE); } catch (e) { log("写文件失败 " + e); }
log("把以上控制台日志贴回即可(未检出项如需细看再 pull " + OUT_FILE + ")");
