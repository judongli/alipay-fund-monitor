// 探针2:连续多只基金,完整 dryRun 退出路径验证
// 每只流程:持有页→点基金进详情→点买入→填金额→点确认→到密码页→
//          使用密码→关闭密码弹窗→点详情页返回按钮→回持有页→下一只
// 前置:支付宝在持有页(用户保证)
// 输出:/sdcard/probe_out.txt
var PKG = "com.eg.android.AlipayGphone";
var OUT = "/sdcard/probe_out.txt";
var AMOUNT = "10";  // dryRun 填小金额
try { files.write(OUT, "=== probe2 start " + new Date().toLocaleTimeString() + " ===\n"); } catch (e) {}
function log(s) { try { files.append(OUT, s + "\n"); } catch (e) {} console.log(s); }

// ===== 被测函数(从 main.js 复制)=====
function onHoldPage(to) { return !!textContains("持有收益率").findOne(to || 500) && !text("买入").findOne(200); }
function tapBackBtn() {
    var b = id("com.alipay.multiplatform.phone.xriver_integration:id/frameLayout_backButton").findOne(1500)
        || id("com.alipay.multiplatform.phone.xriver_integration:id/auiconView_backButton").findOne(800);
    if (!b) return false;
    var bd = b.bounds();
    click(Math.floor((bd.left + bd.right) / 2), Math.floor((bd.top + bd.bottom) / 2));
    return true;
}
function closePwdAndBack() {
    // 1. 点"使用密码"切到数字键盘
    var usePwd = text("使用密码").findOne(3000) || textContains("使用密码").findOne(2000);
    if (usePwd) { try { usePwd.click(); } catch (e) { var ub = usePwd.bounds(); click(Math.floor((ub.left + ub.right) / 2), Math.floor((ub.top + ub.bottom) / 2)); } sleep(1200); }
    log("  closePwdAndBack: 点使用密码=" + !!usePwd);
    // 2. 点密码弹窗关闭按钮(按 id:密码键盘页 closeimg,或指纹页 close)
    var closeBtn = id("com.alipay.android.phone.mobilecommon.verifyidentity:id/closeimg").findOne(2000)
        || id("com.alipay.android.phone.seauthenticator.iotauth:id/close").findOne(1500);
    if (closeBtn) { try { closeBtn.click(); } catch (e) { var cb = closeBtn.bounds(); click(Math.floor((cb.left + cb.right) / 2), Math.floor((cb.top + cb.bottom) / 2)); } sleep(1000); }
    log("  closePwdAndBack: 点关闭按钮=" + !!closeBtn);
    // 3. 已回持有页则无需再退
    if (onHoldPage(800)) { log("  closePwdAndBack: 关闭后已在持有页"); return true; }
    // 4. 显式点 XRiver 返回按钮逐层退出(详情页→持有页),最多3次
    for (var i = 0; i < 3; i++) {
        if (!tapBackBtn()) { log("  closePwdAndBack: 第" + (i+1) + "次没找到返回按钮"); break; }
        sleep(1200);
        if (onHoldPage(800)) { log("  closePwdAndBack: 第" + (i+1) + "次点返回后到持有页"); return true; }
    }
    // 5. 兜底
    log("  closePwdAndBack: 返回按钮没退回,需兜底");
    return false;
}
// ===== 被测函数结束 =====

// 收集持有页所有基金名(前 N 只)
function listFundCards() {
    var arr = [];
    var col = className("android.widget.Button").find();
    for (var i = 0; i < col.size(); i++) {
        var t = (col.get(i).text() || "");
        if (t.indexOf("金额:") >= 0 && /昨日收益:/.test(t)) {
            arr.push({ name: t.split("金额:")[0].replace(/(\s*(支付宝金选|定投))+\s*$/, "").trim(), node: col.get(i) });
        }
    }
    return arr;
}
// 点基金卡片进详情(用卡片名重新找,因为滑动后节点失效)
function enterDetail(name) {
    var col = className("android.widget.Button").find();
    for (var i = 0; i < col.size(); i++) {
        var t = (col.get(i).text() || "");
        if (t.indexOf(name) >= 0 && /金额:.*昨日收益:/.test(t)) {
            var b = col.get(i).bounds();
            click(Math.floor((b.left + b.right) / 2), Math.floor((b.top + b.bottom) / 2));
            sleep(3500);
            return !!text("买入").findOne(2000);
        }
    }
    return false;
}
// 走到密码页:dryRun 到这里停
function goToPwdPage(amount) {
    tapRe(/买入/); sleep(2000);
    var edit = className("android.widget.EditText").findOne(3000);
    if (!edit) return "no_edit";
    var eb = edit.bounds(); click(Math.floor((eb.left + eb.right) / 2), Math.floor((eb.top + eb.bottom) / 2)); sleep(900);
    for (var ai = 0; ai < amount.length; ai++) {
        var ch = amount.charAt(ai);
        var key = text(ch).findOne(2000);
        if (key) { key.click(); sleep(180); } else return "no_key_" + ch;
    }
    sleep(500);
    tapRe(/确\s*定|确认支付|确认/); sleep(2500);
    for (var i = 0; i < 3; i++) {
        if (textContains("密码").findOne(1500) || textContains("指纹").findOne(800) || textContains("验证身份").findOne(800)) return "pwd_page";
        if (textMatches(/确\s*定|确认支付|确认/).findOne(800)) { tapRe(/确\s*定|确认支付|确认/); sleep(1800); }
    }
    return "no_pwd_page";
}
function tapRe(t) {
    var w = (t instanceof RegExp) ? textMatches(t).findOne(2500) : text(t).findOne(2500);
    if (!w) return false;
    var b = w.bounds(); click(Math.floor((b.left + b.right) / 2), Math.floor((b.top + b.bottom) / 2));
    return true;
}

// ===== 主流程 =====
log("step0 前置检查 onHoldPage=" + onHoldPage(1500));
if (!onHoldPage(800)) { log("FAIL: 前置不在持有页,终止"); exit(); }

var cards = listFundCards();
log("step0 持有页基金数=" + cards.length);
var N = Math.min(3, cards.length);  // 测前3只
log("step0 将测试 " + N + " 只");

var pass = 0, fail = 0;
for (var i = 0; i < N; i++) {
    var name = cards[i].name;
    log("---- [" + (i+1) + "/" + N + "] " + name + " ----");
    // 进详情
    var entered = enterDetail(name);
    log("  进详情(有买入按钮)=" + entered);
    if (!entered) { log("  FAIL: 进详情失败,跳过"); fail++; continue; }
    // 走到密码页
    var pwdSt = goToPwdPage(AMOUNT);
    log("  到密码页=" + (pwdSt === "pwd_page") + " 状态=" + pwdSt);
    if (pwdSt !== "pwd_page") { log("  FAIL: 没到密码页(" + pwdSt + "),跳过"); fail++; continue; }
    // closePwdAndBack 退出
    var ok = closePwdAndBack();
    sleep(800);
    var back = onHoldPage(1500);
    log("  退出后 onHoldPage=" + back + " closePwdAndBack返回=" + ok);
    if (back) { log("  PASS"); pass++; }
    else { log("  FAIL: 退出后不在持有页"); fail++; }
    sleep(1000);
}
log("==== 总计: PASS=" + pass + " FAIL=" + fail + " ====");
log("=== probe2 end ===");
