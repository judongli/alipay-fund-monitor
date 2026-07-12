// 连续6只基金完整支付流程(dry-run,每只走到密码页即退出,不真实下单)
// 核心验证点:对窗口范围外的基金也「直接 accessibility click,不滑动」能否进详情
//   (对照 main.js navToDetail:它是先滑动可见再坐标 click,兜底 pick.click())
// 流程/每只:持有页→(不滑动)点基金进详情→点买入→填金额→点确认支付→到密码页→
//           点关闭按钮退出→点返回按钮回持有页→下一只
// 任意步骤失败:dump 当前界面全元素到日志,但【不 exit】,继续下一只(要测满6只)
// 前置:支付宝已停在「理财-基金-持有」页(用户保证)
// 输出:/sdcard/test_multi_out.txt
var PKG = "com.eg.android.AlipayGphone";
var OUT = "/sdcard/test_multi_out.txt";
var AMOUNT = "10";
var TARGET = 6;  // 测试基金数

try { files.write(OUT, "=== test_multi start " + new Date().toLocaleTimeString() + " ===\n"); } catch (e) {}
function log(s) { try { files.append(OUT, s + "\n"); } catch (e) {} console.log(s); }

// ===== 失败兜底:dump 当前界面全部元素(不 exit,继续主循环) =====
function dumpFail(reason) {
    log("  ## FAIL: " + reason + " ##");
    log("  --- 界面 dump ---");
    var classes = ["android.widget.Button", "android.widget.TextView", "android.widget.ImageView",
        "android.widget.ImageButton", "android.widget.EditText", "android.view.View",
        "android.widget.FrameLayout", "android.widget.RelativeLayout", "android.widget.LinearLayout"];
    var idx = 0;
    classes.forEach(function (cls) {
        try {
            className(cls).find().forEach(function (w) {
                try {
                    var t = (w.text() || "").replace(/\n/g, " ").trim();
                    var d = (w.desc() || "").replace(/\n/g, " ").trim();
                    var rid = w.id() || "";
                    var ck = false; try { ck = w.clickable(); } catch (e) {}
                    var b = w.bounds();
                    if (t || d || rid) {
                        log("  [" + (idx++) + "] cls=" + (w.className() || "") + " id=" + rid + " click=" + ck +
                            " text=" + JSON.stringify(t) + " desc=" + JSON.stringify(d) +
                            " bounds=[" + b.left + "," + b.top + "][" + b.right + "," + b.bottom + "]");
                    }
                } catch (e) {}
            });
        } catch (e) {}
    });
    try { log("  currentPackage=" + currentPackage() + " act=" + currentActivity()); } catch (e) {}
    log("  --- dump end ---");
}

// ===== 工具函数(复用 01,验证过的写法)=====
function onHoldPage(to) { return !!textContains("持有收益率").findOne(to || 500) && !text("买入").findOne(200); }
function onPwdPage() {
    return !!textContains("密码").findOne(1200) || !!textContains("指纹").findOne(800)
        || !!textContains("验证身份").findOne(800) || !!textContains("验证指纹").findOne(800);
}
function tapBackBtn() {
    var b = id("com.alipay.multiplatform.phone.xriver_integration:id/frameLayout_backButton").findOne(1500)
        || id("com.alipay.multiplatform.phone.xriver_integration:id/auiconView_backButton").findOne(800);
    if (!b) return false;
    var bd = b.bounds();
    click(Math.floor((bd.left + bd.right) / 2), Math.floor((bd.top + bd.bottom) / 2));
    return true;
}
function tapConfirm() {
    var w = text("确认支付").findOne(2500) || textMatches(/^确\s*定$/).findOne(1500);
    if (!w) return false;
    var b = w.bounds(); click(Math.floor((b.left + b.right) / 2), Math.floor((b.top + b.bottom) / 2));
    return true;
}
function tapRe(t) {
    var w = (t instanceof RegExp) ? textMatches(t).findOne(2500) : text(t).findOne(2500);
    if (!w) return false;
    var b = w.bounds(); click(Math.floor((b.left + b.right) / 2), Math.floor((b.top + b.bottom) / 2));
    return true;
}
function clickableAncestor(node) {
    var n = node, i = 0;
    while (n && i < 8) { try { if (n.clickable()) return n; } catch (e) {} n = n.parent(); i++; }
    return null;
}
// 轮询等待:checkFn 返回真值即成功;包容 H5 白屏/卡顿(不靠固定 sleep)
function waitFor(checkFn, timeoutMs, intervalMs) {
    intervalMs = intervalMs || 500;
    var t = 0;
    while (t < timeoutMs) {
        try { var v = checkFn(); if (v) return v; } catch (e) {}
        sleep(intervalMs); t += intervalMs;
    }
    return null;
}
// 失败即 dump + exit(不兜底重导航,回不到持有页就终止,避免引入变量)
function dumpExit(reason) {
    dumpFail(reason);
    log("=== test_multi ABORT end (失败终止) ===");
    exit();
}
function waitPkg(ms) { var t = 0; while (t < ms) { if (isInAlipay()) return true; sleep(400); t += 400; } return isInAlipay(); }
function isInAlipay() { var p = currentPackage(); return p.indexOf("Alipay") >= 0 || p.indexOf("alipay") >= 0; }

// ===== 列出持有页全部基金卡片 =====
function listFundCards() {
    var arr = [];
    var col = className("android.widget.Button").find();
    for (var i = 0; i < col.size(); i++) {
        var t = (col.get(i).text() || "");
        if (t.indexOf("金额:") >= 0 && /昨日收益:/.test(t)) {
            var name = t.split("金额:")[0].replace(/(\s*(支付宝金选|定投))+\s*$/, "").trim();
            arr.push(name);
        }
    }
    return arr;
}

// ===== 进详情:直接 accessibility click,不滑动 =====
// 返回 {ok, visible, boundsStr} 便于分析窗口内/外成功率
function enterDetailNoScroll(name) {
    var col = className("android.widget.Button").find();
    var pick = null;
    for (var i = 0; i < col.size(); i++) {
        var t = (col.get(i).text() || "");
        if (t.indexOf(name) >= 0 && /金额:.*昨日收益:/.test(t)) { pick = col.get(i); break; }
    }
    if (!pick) return { ok: false, visible: null, boundsStr: "not_found" };
    var b = pick.bounds();
    var H = (typeof device !== "undefined" && device.height) ? device.height : 2400;
    var visible = (b.top < b.bottom && b.top > 50 && b.bottom < H - 50);
    var bs = "[" + b.left + "," + b.top + "][" + b.right + "," + b.bottom + "]";
    log("    pick.click() visible=" + visible + " bounds=" + bs + " clickable=" + (function(){try{return pick.clickable();}catch(e){return "?";}})());
    pick.click();  // accessibility click,不依赖可见性
    // 轮询等详情页买入按钮出现(包容白屏卡顿,最多 12s);每 3s 无进展则重试点一次
    var hasBuy = waitFor(function(){ return text("买入").findOne(800); }, 12000, 600);
    var waited = 0;
    while (!hasBuy && waited < 2) {
        log("    详情页未出买入按钮,可能白屏,重试 pick.click()");
        pick = null;
        var col2 = className("android.widget.Button").find();
        for (var m = 0; m < col2.size(); m++) {
            var t2 = (col2.get(m).text() || "");
            if (t2.indexOf(name) >= 0 && /金额:.*昨日收益:/.test(t2)) { pick = col2.get(m); break; }
        }
        if (pick) { try { pick.click(); } catch (e) {} }
        hasBuy = waitFor(function(){ return text("买入").findOne(800); }, 6000, 600);
        waited++;
    }
    return { ok: !!hasBuy, visible: visible, boundsStr: bs };
}

// ===== 单只完整流程:返回 true/false =====
function runOne(name) {
    log("  step1 进详情(不滑动): " + name);
    var r = enterDetailNoScroll(name);
    log("  step1 进详情 ok=" + r.ok + " (窗口" + (r.visible ? "内" : "外") + ")");
    if (!r.ok) dumpExit("进详情失败(未见买入按钮)");

    log("  step2 点买入...");
    if (!tapRe(/买入/)) dumpExit("点「买入」失败");
    sleep(2000);

    // 金额输入框:轮询等(包容白屏卡顿,最多 10s)
    var edit = waitFor(function(){ return className("android.widget.EditText").findOne(1000); }, 10000, 700);
    if (!edit) dumpExit("金额输入框 EditText 未找到");
    var eb = edit.bounds();
    click(Math.floor((eb.left + eb.right) / 2), Math.floor((eb.top + eb.bottom) / 2));
    sleep(900);
    for (var ai = 0; ai < AMOUNT.length; ai++) {
        var ch = AMOUNT.charAt(ai);
        var key = text(ch).findOne(2000);
        if (!key) dumpExit("数字键「" + ch + "」未找到");
        key.click(); sleep(180);
    }
    sleep(500);

    log("  step3 点确认支付...");
    if (!tapConfirm()) dumpExit("点「确认支付/确定」失败");
    sleep(2800);

    log("  step4 检测密码页...");
    var pwdReached = onPwdPage();
    if (!pwdReached) {
        // 协议勾选(可选):每只基金都可能有协议文案,但只有显示「请勾选」提示的才需要点
        // —— 已勾选/不需要的基金无此提示,跳过(避免点了反而取消勾选)
        if (text("请勾选").findOne(800)) {
            log("  step4 检测到「请勾选」提示,需勾选协议");
            var agree = textContains("点击确定代表您知悉").findOne(1500) || textContains("知悉产品概要").findOne(1000);
            if (agree) {
                try { agree.click(); } catch (e) { var ab = agree.bounds(); click(Math.floor((ab.left + ab.right) / 2), Math.floor((ab.top + ab.bottom) / 2)); }
                sleep(900);
                log("  step4 已勾选协议");
            } else {
                dumpExit("检测到「请勾选」但未找到协议勾选框");
            }
        } else {
            log("  step4 无「请勾选」提示(已勾选或不需要),跳过");
        }
        if (text("确认支付").findOne(800) || textMatches(/^确\s*定$/).findOne(500)) {
            log("  step4 买入确认页,点确定");
            tapConfirm(); sleep(2200);
        }
        // 再轮询等密码页(包容跳转卡顿,最多 8s)
        pwdReached = waitFor(onPwdPage, 8000, 800);
    }
    log("  step4 到密码页=" + pwdReached);
    if (!pwdReached) dumpExit("未到密码页");

    log("  step5 退出密码页...");
    var usePwd = text("使用密码").findOne(3000) || textContains("使用密码").findOne(2000);
    if (usePwd) {
        try { usePwd.click(); } catch (e) { var ub = usePwd.bounds(); click(Math.floor((ub.left + ub.right) / 2), Math.floor((ub.top + ub.bottom) / 2)); }
        sleep(1200);
    }
    // 关闭按钮:直接 id 找 closelayout(验证过的可靠写法,不靠上溯)
    var closeBtn = id("com.alipay.android.phone.mobilecommon.verifyidentity:id/closelayout").findOne(2000)
        || desc("关闭按钮").findOne(1500);
    if (!closeBtn) {
        var closeImg = id("com.alipay.android.phone.mobilecommon.verifyidentity:id/closeimg").findOne(1500);
        if (closeImg) closeBtn = clickableAncestor(closeImg);
    }
    if (!closeBtn) closeBtn = id("com.alipay.android.phone.seauthenticator.iotauth:id/close").findOne(1200);
    if (!closeBtn) dumpExit("密码页未找到关闭按钮");
    var clicked = false; try { closeBtn.click(); clicked = true; } catch (e) {}
    if (!clicked) { var cb = closeBtn.bounds(); click(Math.floor((cb.left + cb.right) / 2), Math.floor((cb.top + cb.bottom) / 2)); }
    sleep(1500);
    if (onPwdPage()) dumpExit("点关闭后仍未离开密码页");

    // step6: 回持有页只用 tapBackBtn/back,回不到就终止(不重导航,避免引入变量)
    log("  step6 回持有页...");
    for (var j = 0; j < 5; j++) {
        if (onHoldPage(800)) { log("  step6 第" + (j + 1) + "次循环到持有页"); break; }
        if (tapBackBtn()) { log("    tapBackBtn=true"); } else { log("    tapBackBtn=false→back()"); back(); }
        sleep(1600);
    }
    var onHold = onHoldPage(1500);
    log("  step6 onHoldPage=" + onHold);
    if (!onHold) dumpExit("退出后未回到持有页(终止,不兜底重导航)");
    return true;
}

// ===== 主流程 =====
log("step0 前置检查 onHoldPage=" + onHoldPage(1500));
if (!onHoldPage(800)) { log("FAIL: 前置不在持有页,终止"); dumpFail("前置不在持有页"); exit(); }

var allCards = listFundCards();
log("step0 持有页基金数=" + allCards.length);
var N = Math.min(TARGET, allCards.length);
log("step0 将测试 " + N + " 只(全部不滑动直接点)");
if (N === 0) { log("FAIL: 没有基金卡片"); exit(); }

var pass = 0;
for (var i = 0; i < N; i++) {
    var name = allCards[i];
    log("==== [" + (i + 1) + "/" + N + "] " + name + " ====");
    var ok = runOne(name);  // 失败即 dump+exit,不会返回 false
    log("  结果: PASS");
    pass++;
    sleep(1000);
}
log("==== 全部通过: " + pass + "/" + N + " ====");
log("=== test_multi end ===");
