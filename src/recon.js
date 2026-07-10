// ============================================================
// 支付宝基金 持仓采集侦察 v7:导航 + 滚动抓全部基金卡片
// ============================================================
// 导航已验证:理财 → 基金 → 持有
// 本版重点:进入持仓页后一路滚动,把每只基金卡片(名称/金额/收益/收益率)抓全
// (基金卡片在懒加载列表里,必须滚动才会渲染)
// ============================================================

var CFG = {
    alipayName: "支付宝",
    alipayPackage: "com.eg.android.AlipayGphone",
    alipayActivity: "com.eg.android.AlipayGphone.AlipayLogin",
    findTimeout: 6000,
};

var BUF = [];
function say(s) { console.log(s); BUF.push(s); }

var W, H;

// 等页面控件数量稳定,避免抓到加载中途的旧状态
function settle() {
    sleep(800);
    var prev = -1;
    for (var i = 0; i < 5; i++) {
        var n = -1; try { n = className("android.widget.TextView").find().size(); } catch (e) {}
        if (n > 0 && n === prev) break;
        prev = n; sleep(350);
    }
}
function validBounds(b) {
    return b && b.bottom > b.top && b.top >= 0 && b.top <= H && (b.bottom - b.top) >= 10;
}
function clickableAncestor(w) {
    var cur = w;
    for (var i = 0; i < 8 && cur; i++) {
        var c = false; try { c = cur.clickable(); } catch (e) {}
        if (c) return cur;
        cur = cur.parent();
    }
    return w;
}
// 同名控件挑坐标有效的那一个
function tapSmart(t) {
    if (!text(t).findOne(CFG.findTimeout)) { say("   ⚠️ 找不到「" + t + "」"); return false; }
    var col = text(t).find();
    var pick = null;
    for (var i = 0; i < col.size(); i++) {
        if (validBounds(col.get(i).bounds())) { pick = col.get(i); break; }
    }
    if (!pick) pick = col.get(0);
    var b = pick.bounds();
    if (!validBounds(b)) b = clickableAncestor(pick).bounds();
    var x = Math.floor((b.left + b.right) / 2);
    var y = Math.floor((b.top + b.bottom) / 2);
    click(x, y);
    say("   ✓ 点「" + t + "」 @ (" + x + "," + y + ")");
    return true;
}

function isInAlipay() { var p = currentPackage(); return p.indexOf("Alipay") >= 0 || p.indexOf("alipay") >= 0; }
function waitForAlipay(maxMs) { var t = 0; while (t < maxMs) { if (isInAlipay()) return true; sleep(400); t += 400; } return isInAlipay(); }
function ensureAlipay() {
    if (isInAlipay()) { say("✓ 已在支付宝"); settle(); return; }
    say("⏳ 启动支付宝...");
    var steps = [
        function () { try { app.launchPackage(CFG.alipayPackage); } catch (e) {} },
        function () { try { app.startActivity({ packageName: CFG.alipayPackage, className: CFG.alipayActivity }); } catch (e) {} },
        function () { try { app.launchApp(CFG.alipayName); } catch (e) {} },
    ];
    for (var i = 0; i < steps.length; i++) {
        steps[i]();
        if (waitForAlipay(4000)) { say("✓ 已进入支付宝"); settle(); return; }
    }
    throw new Error("启动支付宝失败(仍在 " + currentPackage() + ")。请手动打开支付宝停任意页再 F5。");
}

// full=true 全量输出;否则只输出未见过的文本(去重,省篇幅)
function dumpScreen(tag, seen, out, full) {
    var valid = 0, total = 0;
    var col = className("android.widget.TextView").find();
    try { total = col.size(); } catch (e) {}
    col.forEach(function (w) {
        try {
            var t = (w.text() || "").trim(), d = (w.desc() || "").trim();
            if (!t && !d) return;
            var b = w.bounds();
            if (b.top < 0 || b.bottom <= b.top || b.top > H) return;
            if (!full && t && seen[t]) return;
            out.push("[" + tag + "] text=\"" + t + "\" | desc=\"" + d + "\" | y=" + b.top + " x=" + b.left);
            if (t) seen[t] = (seen[t] || 0) + 1;
            valid++;
        } catch (e) {}
    });
    out.push("---- " + tag + ": 有效 " + valid + " / 总 " + total + " ----");
}
function swipeDown() { swipe(Math.floor(W / 2), Math.floor(H * 0.72), Math.floor(W / 2), Math.floor(H * 0.28), 400); }
function swipeUp()   { swipe(Math.floor(W / 2), Math.floor(H * 0.28), Math.floor(W / 2), Math.floor(H * 0.72), 400); }

// ---------------- main ----------------
auto.waitFor();
sleep(800);
W = device.width;
H = device.height;
say("屏幕: " + W + "x" + H);

var seen = {}, out = [];
try {
    say("▶ 导航: 理财 → 基金 → 持有");
    ensureAlipay();
    tapSmart("理财"); settle();
    tapSmart("基金"); settle();
    tapSmart("持有"); settle();

    // 确认到持仓页(等"总金额"或"持有收益率排序"出现)
    var onHoldings = false;
    for (var tries = 0; tries < 20 && !onHoldings; tries++) {
        if (text("持有收益率排序").findOne(400) || textContains("总金额").findOne(400)) onHoldings = true;
        else sleep(300);
    }
    say(onHoldings ? "✓ 已到持仓页" : "⚠️ 未确认到持仓页(仍尝试采集)");

    // 先滚到列表顶
    for (var k = 0; k < 3; k++) { swipeUp(); sleep(300); }
    settle();

    say("▶ 滚动采集基金卡片");
    dumpScreen("屏1(全量)", seen, out, true);
    var stall = 0;
    for (var i = 2; i <= 12; i++) {
        swipeDown();
        settle();
        var before = Object.keys(seen).length;
        dumpScreen("屏" + i, seen, out, false);
        var after = Object.keys(seen).length;
        if (after - before < 1) { stall++; } else { stall = 0; }
        if (stall >= 2) { out.push("(连续2屏无新内容,结束)"); break; }
    }

    // 重复出现的标签 → 卡片字段线索
    out.push("");
    out.push("===== 重复≥2次的文本(卡片字段线索) =====");
    var reps = Object.keys(seen).filter(function (k) { return seen[k] >= 2; });
    reps.sort(function (a, b) { return seen[b] - seen[a]; });
    reps.forEach(function (k) { out.push("  ×" + seen[k] + '  "' + k + '"'); });

    say(out.join("\n"));
} catch (e) {
    say("❌ " + e.message);
}

say("");
say("👉 把上面整段输出复制发给 Claude");
var reconFile = "/sdcard/Download/alipay_recon.txt";
files.ensureDir(reconFile);
files.write(reconFile, BUF.join("\n"));
