// ============================================================
// 不滑动点击基金卡片 — 成功率诊断
// ============================================================
// 目的:验证「不滚动,直接 node.click() 基金卡片」能否进详情页,
//       量化成功率,并区分 屏内/屏外/异常bounds 三类情况。
//
// 结论输入:若屏外 node.click 成功率高 → navToDetail 可省掉滑动;
//          若屏外成功率低 → 维持「滑动到可见再坐标 click」的现有写法。
//
// 判定(已确认):
//   - 成功:点击后出现「买入」按钮(计入成功率分母)
//   - 额外校验:详情页基金名称/代码是否与目标一致(单独标注,不计入失败)
//   - 不兜底:失败就失败,不滑动重试
//   - 范围:分层抽样 前4 + 中4 + 后4 = 12 只
//
// 用法:手机停在支付宝「基金·持有」页 → F5 运行 → 看控制台汇总表
// ============================================================

var CFG = {
    btnBuy: "买入",
    holdFeature: "持有收益率",   // 持有页特征
    sampleHead: 4,               // 前 N 只
    sampleMid: 4,                // 中间 N 只
    sampleTail: 4,               // 后 N 只
    // ★ 运行批次:改这一行选本轮测哪一段
    //   "mid"  = 中间4只  (第一次运行设这个)
    //   "tail" = 最后4只  (第二次运行设这个)
    //   "head" = 最前4只 / "all" = 全段
    batch: "mid",
    postClickWait: 3500,         // 点击后等详情页渲染
    backWait: 1200,              // back 回持有页等待
    settleTries: 20,             // 等持有页出现的重试次数
    nameMatters: false,          // 名称不匹配不计入失败(仅标注)
};

var H = (typeof device !== "undefined" && device.height) ? device.height : 2400;

function say(s) { console.log(s); }
function inHold() { return !!textContains(CFG.holdFeature).findOne(600); }

// 等"持有页"稳定出现(用于点击后回到持有页的确认)
function waitHold(ms) {
    var t = 0; var step = 500;
    while (t < ms) { if (inHold()) return true; sleep(step); t += step; }
    return inHold();
}

// 收集所有基金卡片 Button(整棵无障碍树,含屏外)
function collectCards() {
    var col = className("android.widget.Button").find();
    var list = [];
    for (var i = 0; i < col.size(); i++) {
        var w = col.get(i);
        var t = (w.text() || "");
        if (/金额:.*昨日收益:.*持有收益:.*持有收益率:/.test(t)) {
            // 解析基金名(与 main.js parseFund 一致)
            var name = t.split("金额:")[0].replace(/(\s*(支付宝金选|定投))+\s*$/, "").trim();
            var b = null; try { b = w.bounds(); } catch (e) { b = null; }
            list.push({ name: name, widget: w, bounds: b, raw: t });
        }
    }
    return list;
}

// bounds 分类:屏内 / 屏外合法 / 异常
function classify(b) {
    if (!b) return "no_bounds";
    if (b.top >= b.bottom) return "invalid";                 // 异常:top>=bottom(WebView 回收态)
    if (b.top < 0 || b.bottom < 0) return "invalid";
    if (b.top > 50 && b.bottom < H - 50) return "onscreen";  // 完全在屏内
    return "offscreen";                                       // 合法但屏外
}

// 点完后校验详情页:取页面上能找到的基金名/代码,跟目标对一下
function verifyDetail(targetName) {
    var codeNode = textMatches(/^\d{6}$/).findOne(1200);
    var code = codeNode ? codeNode.text() : "";
    // 详情页标题区一般有基金全称;宽松匹配:目标名是详情页某文本的子串
    var hit = false;
    try {
        var views = className("android.widget.TextView").find();
        for (var i = 0; i < views.size(); i++) {
            var tt = (views.get(i).text() || "");
            if (tt && tt.indexOf(targetName) >= 0) { hit = true; break; }
        }
    } catch (e) {}
    return { code: code, nameMatch: hit };
}

// 回持有页:点完详情后回退;失败再 backToHold 兜底
function returnToHold() {
    for (var i = 0; i < 3; i++) {
        if (inHold()) return true;
        back(); sleep(CFG.backWait);
    }
    if (inHold()) return true;
    // 兜底:滑动几下确认在持有页(不重新导航,避免引入变量)
    for (var j = 0; j < 3; j++) {
        if (inHold()) return true;
        swipe(540, Math.floor(H * 0.7), 540, Math.floor(H * 0.3), 400);
        sleep(800);
    }
    return inHold();
}

// 对单只基金做一次"不滑动点击"
function probeOne(card) {
    var rec = {
        name: card.name,
        cls: classify(card.bounds),
        bounds: card.bounds ? (card.bounds.top + "," + card.bounds.bottom) : "-",
        clickOk: false,
        buyShown: false,
        detailCode: "",
        nameMatch: false,
        err: "",
    };
    try {
        // ★ 核心:不滑动,直接 node.click()
        var clicked = false;
        try { clicked = card.widget.click(); } catch (e) { rec.err = "click抛错:" + e; }
        if (!clicked) rec.err = rec.err || "click返回false";
        sleep(CFG.postClickWait);

        // 判定:出现「买入」即算成功
        var buy = text(CFG.btnBuy).findOne(1500);
        if (buy) {
            rec.buyShown = true;
            rec.clickOk = true;
            // 额外校验(不计入失败)
            var v = verifyDetail(card.name);
            rec.detailCode = v.code;
            rec.nameMatch = v.nameMatch;
        } else {
            rec.err = rec.err || "未见买入按钮";
        }
    } catch (e) {
        rec.err = "异常:" + (e.message || String(e));
    }
    // 退回持有页(无论成败)
    returnToHold();
    return rec;
}

// 抽样下标(按 CFG.batch 选段)
function sampleIndices(n) {
    var head = CFG.sampleHead, mid = CFG.sampleMid, tail = CFG.sampleTail;
    var idx = [], i;
    var batch = (CFG.batch || "mid").toLowerCase();

    if (batch === "all") {
        for (i = 0; i < n; i++) idx.push(i);
        return idx;
    }
    if (batch === "head") {
        for (i = 0; i < head && i < n; i++) idx.push(i);
        return idx;
    }
    if (batch === "tail") {
        var tailStart = n - tail;
        if (tailStart < 0) tailStart = 0;
        for (i = tailStart; i < n; i++) idx.push(i);
        return idx;
    }
    // 默认 mid
    var midStart = Math.floor(n / 2) - Math.floor(mid / 2);
    if (midStart < 0) midStart = 0;
    for (i = midStart; i < midStart + mid && i < n; i++) idx.push(i);
    return idx;
}

function main() {
    say("==== 不滑动点击 成功率诊断 ====");
    // 前置:必须在持有页
    if (!inHold()) {
        say("❌ 当前不在持有页(未检测到「" + CFG.holdFeature + "」)");
        say("   请手动进支付宝→理财→基金→持有,再运行本脚本");
        return;
    }
    // 稳一下
    sleep(1200);

    var cards = collectCards();
    if (cards.length === 0) {
        sleep(1500); cards = collectCards(); // 兜底再扫
    }
    say("持有页扫到基金卡片数:" + cards.length);
    if (cards.length === 0) { say("❌ 未扫到任何卡片,终止"); return; }

    var idxs = sampleIndices(cards.length);
    say("批次=" + (CFG.batch || "mid") + " | 抽样下标:" + JSON.stringify(idxs) + " | 共" + idxs.length + " 只");
    say("屏幕高度 H=" + H);
    say("----------------------------------------");

    var results = [];
    for (var k = 0; k < idxs.length; k++) {
        var ci = idxs[k];
        // 每轮重新扫一次卡片(因为回到持有页后 widget 引用可能失效)
        var fresh = collectCards();
        if (ci >= fresh.length) { say("[" + (k + 1) + "] #" + ci + " 越界(本轮扫到" + fresh.length + "只),跳过"); continue; }
        var card = fresh[ci];
        say("[" + (k + 1) + "/" + idxs.length + "] #" + ci + " 「" + card.name + "」 cls=" + classify(card.bounds) + " bounds=" + (card.bounds ? (card.bounds.top + "," + card.bounds.bottom) : "-"));
        var rec = probeOne(card);
        results.push(rec);
        say("   → buyShown=" + rec.buyShown + " code=" + rec.detailCode + " nameMatch=" + rec.nameMatch + (rec.err ? " err=" + rec.err : ""));
        sleep(600);
    }

    // ---------- 汇总 ----------
    say("========================================");
    say("==== 汇总 ====");
    var total = results.length;
    var ok = results.filter(function (r) { return r.clickOk; }).length;
    say("总计:" + total + "  成功(出现买入):" + ok + "  成功率:" + (total ? Math.round(ok * 100 / total) : 0) + "%");

    // 按 bounds 分类统计
    var byClass = {};
    results.forEach(function (r) {
        if (!byClass[r.cls]) byClass[r.cls] = { n: 0, ok: 0 };
        byClass[r.cls].n++;
        if (r.clickOk) byClass[r.cls].ok++;
    });
    say("--- 按 bounds 分类 ---");
    Object.keys(byClass).forEach(function (c) {
        var x = byClass[c];
        say("  " + c + ": " + x.ok + "/" + x.n + " (" + Math.round(x.ok * 100 / x.n) + "%)");
    });

    // 名称匹配(额外校验,不计入失败)
    var nm = results.filter(function (r) { return r.clickOk && r.nameMatch; }).length;
    say("--- 额外校验(不计入成功率)---");
    say("  详情页名称匹配:" + nm + "/" + ok + "(命中买入的基金中)");

    // 明细表
    say("--- 明细 ---");
    results.forEach(function (r, i) {
        say("  #" + (i + 1) + " " + r.name + " | " + r.cls + " | buy=" + r.buyShown + " | " + (r.err || "OK"));
    });
    say("========================================");
    say("判读:onscreen 高 + offscreen 低 → 仍需滑动;offscreen 也高 → 可去滑动");
}

main();
