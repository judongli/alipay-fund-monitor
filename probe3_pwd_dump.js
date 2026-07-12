// 探针3:走到密码页,点"使用密码"展开,dump 全部 UI 元素,搞清关闭按钮是什么
// 前置:支付宝在持有页
// 输出:/sdcard/probe_out.txt(文本) + /sdcard/probe3_ui.xml(原始uiautomator dump)
var PKG = "com.eg.android.AlipayGphone";
var OUT = "/sdcard/probe_out.txt";
var UIXML = "/sdcard/probe3_ui.xml";
try { files.write(OUT, "=== probe3 start " + new Date().toLocaleTimeString() + " ===\n"); } catch (e) {}
function log(s) { try { files.append(OUT, s + "\n"); } catch (e) {} console.log(s); }

function onHoldPage(to) { return !!textContains("持有收益率").findOne(to || 500) && !text("买入").findOne(200); }
function tapRe(t) {
    var w = (t instanceof RegExp) ? textMatches(t).findOne(2500) : text(t).findOne(2500);
    if (!w) return false;
    var b = w.bounds(); click(Math.floor((b.left + b.right) / 2), Math.floor((b.top + b.bottom) / 2));
    return true;
}
// dump 当前 UI 到字符串
function dumpAll() {
    var arr = [];
    function add(w) {
        try {
            var t = (w.text() || "").replace(/\n/g, " ").trim();
            var d = (w.desc() || "").replace(/\n/g, " ").trim();
            var rid = w.id() || "";
            var cls = (w.className() || "");
            var b = w.bounds();
            arr.push("text=" + JSON.stringify(t) + " desc=" + JSON.stringify(d) + " id=" + rid + " cls=" + cls + " bounds=[" + b.left + "," + b.top + "][" + b.right + "," + b.bottom + "]");
        } catch (e) {}
    }
    className("android.widget.Button").find().forEach(add);
    className("android.widget.TextView").find().forEach(add);
    className("android.widget.ImageView").find().forEach(add);
    className("android.widget.ImageButton").find().forEach(add);
    className("android.view.View").find().forEach(add);
    className("android.widget.FrameLayout").find().forEach(add);
    return arr;
}

log("step0 前置 onHoldPage=" + onHoldPage(1500));
if (!onHoldPage(800)) { log("FAIL: 不在持有页,终止"); exit(); }

// 点第一只基金进详情
var picked = null;
var col = className("android.widget.Button").find();
for (var i = 0; i < col.size(); i++) {
    var t = (col.get(i).text() || "");
    if (t.indexOf("金额:") >= 0 && /昨日收益:/.test(t)) { picked = col.get(i); break; }
}
var pb = picked.bounds();
click(Math.floor((pb.left + pb.right) / 2), Math.floor((pb.top + pb.bottom) / 2));
sleep(3500);
log("step1 进详情 有买入=" + !!text("买入").findOne(2000));

// 点买入→填10→确认→到密码页
tapRe(/买入/); sleep(2000);
var edit = className("android.widget.EditText").findOne(3000);
var eb = edit.bounds(); click(Math.floor((eb.left + eb.right) / 2), Math.floor((eb.top + eb.bottom) / 2)); sleep(900);
for (var ai = 0; ai < "10".length; ai++) { var key = text("10".charAt(ai)).findOne(2000); if (key) { key.click(); sleep(180); } }
sleep(500);
tapRe(/确\s*定|确认支付|确认/); sleep(2500);
for (var i = 0; i < 3; i++) {
    if (textContains("密码").findOne(1500) || textContains("指纹").findOne(800) || textContains("验证身份").findOne(800)) break;
    if (textMatches(/确\s*定|确认支付|确认/).findOne(800)) { tapRe(/确\s*定|确认支付|确认/); sleep(1800); }
}
log("step2 到密码页");

// dump 密码页(展开前)
log("--- 密码页展开前 dump ---");
var before = dumpAll();
before.forEach(function (l) { log(l); });

// 点"使用密码"
var usePwd = text("使用密码").findOne(3000) || textContains("使用密码").findOne(2000);
log("step3 点使用密码=" + !!usePwd);
if (usePwd) { try { usePwd.click(); } catch (e) {} sleep(1500); }

// dump 密码页(展开后,此时应有数字键盘+关闭按钮)
log("--- 密码页展开后 dump(找关闭按钮) ---");
var after = dumpAll();
after.forEach(function (l) { log(l); });

// 也用 uiautomator dump 原始 xml(能抓到 desc 等)
var dumped = false;
try {
    var cmd = "uiautomator dump " + UIXML;
    var shell = java.lang.Runtime.getRuntime().exec(["sh", "-c", cmd]).toArray ? null : null;
    // 上面写法不稳,改用 AutoX.js 的方式:直接读 uiautomator 输出
} catch (e) {}
// 退回持有页(点返回按钮试)
log("step4 尝试点 tapBackBtn 退出...");
var b = id("com.alipay.multiplatform.phone.xriver_integration:id/frameLayout_backButton").findOne(1500)
    || id("com.alipay.multiplatform.phone.xriver_integration:id/auiconView_backButton").findOne(800);
log("step4 找到返回按钮=" + !!b);
if (b) { var bd = b.bounds(); click(Math.floor((bd.left + bd.right) / 2), Math.floor((bd.top + bd.bottom) / 2)); sleep(1500); log("step4 点了返回按钮, onHoldPage=" + onHoldPage(1500)); }

log("=== probe3 end ===");
