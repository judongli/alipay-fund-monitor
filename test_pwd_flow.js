// 端到端流程测试(单只基金,完整走一遍):
//   持有页 → 点基金进详情 → 点买入 → 填金额 → 点确认 → 到密码页 →
//   点关闭按钮退出密码页 → 点详情页返回按钮 → 回持有页
// 任何一步失败:立即 dump 当前界面全部元素(text/desc/id/cls/bounds)到日志,便于调试
// 前置:支付宝已停在「理财-基金-持有」页(用户保证)
// 输出:/sdcard/test_pwd_flow_out.txt
var PKG = "com.eg.android.AlipayGphone";
var OUT = "/sdcard/test_pwd_flow_out.txt";
var AMOUNT = "10";  // dryRun 填小金额,只走到密码页

try { files.write(OUT, "=== test_pwd_flow start " + new Date().toLocaleTimeString() + " ===\n"); } catch (e) {}
function log(s) { try { files.append(OUT, s + "\n"); } catch (e) {} console.log(s); }

// ===== 失败兜底:dump 当前界面全部元素,然后 exit =====
function dumpAndFail(reason) {
    log("######## FAIL: " + reason + " ########");
    log("--- 当前界面 dump (text/desc/id/cls/bounds) ---");
    var classes = [
        "android.widget.Button", "android.widget.TextView", "android.widget.ImageView",
        "android.widget.ImageButton", "android.widget.EditText", "android.view.View",
        "android.widget.FrameLayout", "android.widget.RelativeLayout", "android.widget.LinearLayout"
    ];
    var idx = 0;
    classes.forEach(function (cls) {
        try {
            className(cls).find().forEach(function (w) {
                try {
                    var t = (w.text() || "").replace(/\n/g, " ").trim();
                    var d = (w.desc() || "").replace(/\n/g, " ").trim();
                    var rid = w.id() || "";
                    var cn = w.className() || "";
                    var ck = false; try { ck = w.clickable(); } catch (e) {}
                    var b = w.bounds();
                    if (t || d || rid) {
                        log("[" + (idx++) + "] cls=" + cn + " id=" + rid + " click=" + ck +
                            " text=" + JSON.stringify(t) + " desc=" + JSON.stringify(d) +
                            " bounds=[" + b.left + "," + b.top + "][" + b.right + "," + b.bottom + "]");
                    }
                } catch (e) {}
            });
        } catch (e) {}
    });
    log("--- 当前 activity / package ---");
    try { log("currentPackage=" + currentPackage() + " currentActivity=" + currentActivity()); } catch (e) {}
    log("--- dump end ---");
    log("=== test_pwd_flow FAIL end ===");
    exit();
}

// ===== 被测函数(与 main.js 保持一致)=====
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
// 精确点确认按钮:优先「确认支付」,再「确  定」(带空格),避免泛匹配「确认」误点跳转残留页
function tapConfirm() {
    var w = text("确认支付").findOne(2500)
        || textMatches(/^确\s*定$/).findOne(1500);
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
// 找 clickable 祖先(closeimg 自身 click=false,真正可点是祖先 closelayout)
function clickableAncestor(node) {
    var n = node, i = 0;
    while (n && i < 8) {
        try { if (n.clickable()) return n; } catch (e) {}
        n = n.parent(); i++;
    }
    return null;
}

// ===== 主流程 =====

// step0: 前置校验
log("step0 前置检查 onHoldPage=" + onHoldPage(1500));
if (!onHoldPage(800)) dumpAndFail("前置不在持有页(请手动停在 理财-基金-持有 页)");

// step1: 找第一只基金卡片并进详情
log("step1 找基金卡片...");
var picked = null;
var col = className("android.widget.Button").find();
for (var i = 0; i < col.size(); i++) {
    var t = (col.get(i).text() || "");
    if (t.indexOf("金额:") >= 0 && /昨日收益:/.test(t)) { picked = col.get(i); break; }
}
if (!picked) dumpAndFail("持有页未找到基金卡片(Button 含「金额:」「昨日收益:」)");
var pb = picked.bounds();
var fname = (picked.text() || "").split("金额:")[0].replace(/(\s*(支付宝金选|定投))+\s*$/, "").trim();
log("step1 点基金: " + fname + " bounds=[" + pb.left + "," + pb.top + "][" + pb.right + "," + pb.bottom + "]");
click(Math.floor((pb.left + pb.right) / 2), Math.floor((pb.top + pb.bottom) / 2));
sleep(3500);

// step2: 确认进了详情页(有「买入」按钮)
var hasBuy = !!text("买入").findOne(3000);
log("step2 详情页: 有买入=" + hasBuy);
if (!hasBuy) dumpAndFail("进详情页失败(未见「买入」按钮)");

// step3: 点买入 → 填金额 → 点确认
log("step3 点买入...");
if (!tapRe(/买入/)) dumpAndFail("点「买入」失败");
sleep(2000);

var edit = className("android.widget.EditText").findOne(3000);
if (!edit) dumpAndFail("金额输入框 EditText 未找到");
var eb = edit.bounds();
click(Math.floor((eb.left + eb.right) / 2), Math.floor((eb.top + eb.bottom) / 2));
sleep(900);
log("step3 点金额输入框,准备输入 " + AMOUNT);
for (var ai = 0; ai < AMOUNT.length; ai++) {
    var ch = AMOUNT.charAt(ai);
    var key = text(ch).findOne(2000);
    if (!key) dumpAndFail("数字键「" + ch + "」未找到");
    key.click(); sleep(180);
}
sleep(500);

log("step3 点确认支付...");
if (!tapConfirm()) dumpAndFail("点「确认支付/确定」失败");
sleep(2800);

// step4: 确认到达密码页。跳转残留页可能仍有「确定」——只在确实还没到密码页时,精确再点一次
log("step4 检测密码页...");
var pwdReached = onPwdPage();
if (!pwdReached) {
    // 还没到密码页,可能是中间确认页;精确点「确认支付」(不点泛「确认」,避免误点详情页残留)
    if (text("确认支付").findOne(800) || textMatches(/^确\s*定$/).findOne(500)) {
        log("step4 中间确认页,再点一次确认支付");
        tapConfirm(); sleep(2200);
    }
    pwdReached = onPwdPage();
}
log("step4 到密码页=" + pwdReached);
if (!pwdReached) dumpAndFail("未到达密码页(无 密码/指纹/验证身份 标识)");

// step5: 点关闭按钮退出密码页
//   先点「使用密码」展开数字键盘(若在指纹页),再点 closeimg/close 关闭
log("step5 退出密码页...");
var usePwd = text("使用密码").findOne(3000) || textContains("使用密码").findOne(2000);
log("step5 点「使用密码」=" + !!usePwd);
if (usePwd) {
    try { usePwd.click(); }
    catch (e) { var ub = usePwd.bounds(); click(Math.floor((ub.left + ub.right) / 2), Math.floor((ub.top + ub.bottom) / 2)); }
    sleep(1200);
}

// 关闭按钮:closeimg 是 ImageView 且 click=false,真正可点是兄弟/祖先 closelayout
// (dump 实证: closelayout click=true desc="关闭按钮" bounds=[108,562][252,706])
// 直接按 id 找 closelayout 最可靠;再 desc 兜底;再 closeimg 上溯兜底
var closeBtn = id("com.alipay.android.phone.mobilecommon.verifyidentity:id/closelayout").findOne(2000);
if (!closeBtn) closeBtn = desc("关闭按钮").findOne(1500);
if (!closeBtn) {
    // 上溯兜底:从 closeimg 找 clickable 祖先
    var closeImg = id("com.alipay.android.phone.mobilecommon.verifyidentity:id/closeimg").findOne(1500);
    if (closeImg) closeBtn = clickableAncestor(closeImg);
}
// 指纹页备选:close id
if (!closeBtn) closeBtn = id("com.alipay.android.phone.seauthenticator.iotauth:id/close").findOne(1200);
var ckInfo = "?"; try { ckInfo = closeBtn ? closeBtn.clickable() : "null"; } catch (e) {}
log("step5 找到关闭按钮=" + !!closeBtn + " clickable=" + ckInfo);
if (!closeBtn) dumpAndFail("密码页未找到关闭按钮(closelayout/closeimg/close 均无)");
// 优先 .click();失败则坐标点 closelayout 中心(不是 closeimg 中心)
var clicked = false;
try { closeBtn.click(); clicked = true; } catch (e) {}
if (!clicked) {
    var cb = closeBtn.bounds();
    click(Math.floor((cb.left + cb.right) / 2), Math.floor((cb.top + cb.bottom) / 2));
}
sleep(1500);

// step5b: 确认已离开密码页(此时应在买入确认页或详情页,还未回持有页)
var stillPwd = onPwdPage();
log("step5b 关闭后仍在密码页=" + stillPwd);
if (stillPwd) dumpAndFail("点关闭按钮后仍未离开密码页");

// step6: 回持有页。混合退回策略,tapBackBtn 为主(H5 返回按钮,不退出 App),
//        找不到返回按钮则 back() 兜底,仍不行 launchPackage 重导航(对齐 main.js backToHoldPage)
log("step6 退回持有页...");
function curAct() { try { return currentActivity() || ""; } catch (e) { return "?"; } }
for (var j = 0; j < 5; j++) {
    if (onHoldPage(800)) { log("step6 第" + (j + 1) + "次循环已在持有页 (act=" + curAct() + ")"); break; }
    log("step6 第" + (j + 1) + "次循环 act=" + curAct());
    var tapped = tapBackBtn();
    if (tapped) {
        log("step6   tapBackBtn=true(H5 返回按钮)");
    } else {
        log("step6   tapBackBtn=false,改用 back()");
        back();
    }
    sleep(1600);
    if (onHoldPage(800)) { log("step6 第" + (j + 1) + "次后到持有页"); break; }
}
var back = onHoldPage(1500);
if (!back) {
    // 终极兜底:启动支付宝重导航到持有页
    log("step6 返回按钮+back 均未退回,launchPackage 重导航");
    try { app.launchPackage(PKG); } catch (e) {}
    if (waitPkg(7000)) {
        sleep(1500);
        for (var k = 0; k < 6; k++) {
            if (onHoldPage(800)) { back = true; break; }
            back(); sleep(1200);
            if (!isInAlipay()) { try { app.launchPackage(PKG); } catch (e) {} waitPkg(4000); }
        }
    }
    back = onHoldPage(1000);
}
log("step6 最终 onHoldPage=" + back);

// step7: 结论
if (back) {
    log("######## PASS: 持有页→详情→密码页→关闭→返回 全流程通过 ########");
} else {
    dumpAndFail("退出后未回到持有页");
}
log("=== test_pwd_flow end ===");
