"ui";
// probe5: 探索关闭密码键盘页的正确姿势
// 前置: 支付宝已在「使用密码」展开后的数字键盘页(pwd_title=完成密码验证, 有 au_num_0..9)
// 不做任何跳转, 直接探索关闭方式

function L(msg) { log(msg); }

function dumpTag(tag) {
    L("--- " + tag + " ---");
    var hasPwdTitle = !!id("com.alipay.android.phone.mobilecommon.verifyidentity:id/pwd_title").findOne(400);
    var hasNum0 = !!id("com.alipay.mobile.antui:id/au_num_0").findOne(400);
    var hold = !!textContains("持有收益率").findOne(400) && !text("买入").findOne(200);
    var hasBuy = !!text("买入").findOne(300);
    L("  有密码标题=" + hasPwdTitle + " 有数字键盘0=" + hasNum0 + " 在持有页=" + hold + " 有买入=" + hasBuy);
    return { hasPwdTitle: hasPwdTitle, hasNum0: hasNum0, hold: hold, hasBuy: hasBuy };
}

// 找 clickable=true 祖先(向上最多 8 层)
function clickableAncestor(node) {
    var n = node, i = 0;
    while (n && i < 8) {
        try { if (n.clickable()) return n; } catch (e) {}
        n = n.parent(); i++;
    }
    return null;
}

L("=== probe5 start ===");

// 前置校验
var st0 = dumpTag("前置");
if (!st0.hasPwdTitle && !st0.hasNum0) { L("FAIL: 不在密码键盘页,终止(请先点使用密码展开键盘)"); exit(); }

// closeimg 信息
var closeImg = id("com.alipay.android.phone.mobilecommon.verifyidentity:id/closeimg").findOne(2000);
if (!closeImg) { L("FAIL: 没找到 closeimg"); exit(); }
L("closeimg bounds=" + JSON.stringify(closeImg.bounds()));
try { L("closeimg clickable=" + closeImg.clickable()); } catch (e) { L("closeimg clickable 读取异常"); }
var anc = clickableAncestor(closeImg);
L("closeimg 有clickable祖先=" + !!anc);
if (anc) {
    try { L("  祖先 cls=" + anc.className() + " id=" + anc.id() + " clickable=" + anc.clickable() + " bounds=" + JSON.stringify(anc.bounds())); } catch (e) {}
}

// 方式A: 点 clickable 祖先
if (anc) {
    L("方式A: 点 clickable 祖先");
    try { anc.click(); } catch (e) { var ab = anc.bounds(); click((ab.left+ab.right)/2, (ab.top+ab.bottom)/2); }
    sleep(1500);
    var stA = dumpTag("方式A后");
    if (!stA.hasPwdTitle && !stA.hasNum0) { L(">>> 方式A 成功离开密码页"); exit(); }
    L("方式A 仍在密码页");
} else {
    L("无 clickable 祖先,跳过方式A");
}

// 方式B: 坐标点 closeimg 中心
var stB0 = dumpTag("方式B前");
if (stB0.hasPwdTitle || stB0.hasNum0) {
    var bd = closeImg.bounds();
    var cx = Math.floor((bd.left + bd.right) / 2), cy = Math.floor((bd.top + bd.bottom) / 2);
    L("方式B: 坐标点击 closeimg 中心 (" + cx + "," + cy + ")");
    click(cx, cy);
    sleep(1500);
    var stB = dumpTag("方式B后");
    if (!stB.hasPwdTitle && !stB.hasNum0) { L(">>> 方式B 成功离开密码页"); exit(); }
    L("方式B 仍在密码页");
}

// 方式C: back()
var stC0 = dumpTag("方式C前");
if (stC0.hasPwdTitle || stC0.hasNum0) {
    L("方式C: back()");
    back();
    sleep(1500);
    var stC = dumpTag("方式C后");
    if (!stC.hasPwdTitle && !stC.hasNum0) { L(">>> 方式C(back) 成功离开密码页"); exit(); }
    L("方式C 仍在密码页");
}

L("=== probe5 end ===");
