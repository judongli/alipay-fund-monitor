// 探针1b:前置=支付宝在持有页。只验证:进详情页→tapBackBtn退回持有页
// 输出:/sdcard/probe_out.txt
var PKG = "com.eg.android.AlipayGphone";
var OUT = "/sdcard/probe_out.txt";
try { files.write(OUT, "=== probe1b start " + new Date().toLocaleTimeString() + " ===\n"); } catch (e) {}
function log(s) { try { files.append(OUT, s + "\n"); } catch (e) {} console.log(s); }

function onHoldPage(to) { return !!textContains("持有收益率").findOne(to || 500) && !text("买入").findOne(200); }
function tapBackBtn() {
    var b = id("com.alipay.multiplatform.phone.xriver_integration:id/frameLayout_backButton").findOne(1500)
        || id("com.alipay.multiplatform.phone.xriver_integration:id/auiconView_backButton").findOne(800);
    if (!b) return false;
    var bd = b.bounds();
    click(Math.floor((bd.left + bd.right) / 2), Math.floor((bd.top + bd.bottom) / 2));
    return true;
}

// step1 确认在持有页
log("step1 前置检查 onHoldPage=" + onHoldPage(1500));
if (!onHoldPage(800)) { log("FAIL: 前置不在持有页,终止"); exit(); }

// step2 点第一只基金进详情页
log("step2 点第一只基金卡片...");
var picked = null;
var col = className("android.widget.Button").find();
for (var i = 0; i < col.size(); i++) {
    var t = (col.get(i).text() || "");
    if (t.indexOf("金额:") >= 0 && /昨日收益:/.test(t)) { picked = col.get(i); break; }
}
if (!picked) { log("FAIL: 没找到基金卡片,终止"); exit(); }
var pb = picked.bounds();
var fname = (picked.text() || "").split("金额:")[0].trim();
log("step2 点: " + fname);
click(Math.floor((pb.left + pb.right) / 2), Math.floor((pb.top + pb.bottom) / 2));
sleep(3500);
var hasBuy = !!text("买入").findOne(2000);
var holdAfterEnter = onHoldPage(800);
log("step2 详情页: 有买入=" + hasBuy + " onHoldPage=" + holdAfterEnter + " (期望:有买入=true,onHoldPage=false)");
if (!hasBuy) { log("FAIL: 详情页没出现买入按钮,终止"); exit(); }

// step3 点 tapBackBtn 退回
log("step3 tapBackBtn...");
var tapped = tapBackBtn();
log("step3 tapBackBtn返回=" + tapped);
sleep(1800);
var holdAfterBack = onHoldPage(1500);
var stillBuy = !!text("买入").findOne(300);
log("step3 退回后: onHoldPage=" + holdAfterBack + " 仍有买入=" + stillBuy + " (期望:onHoldPage=true,买入=false)");
if (holdAfterBack && !stillBuy) log("PASS: 详情页→持有页 退回正确");
else log("FAIL: 退回后未到持有页");

// step4 再试一次往返(验证稳定性,模拟连续第二只)
log("step4 第二次往返: 再点基金进详情...");
sleep(1000);
if (!onHoldPage(800)) { log("step4 前置丢失,终止"); exit(); }
var picked2 = null;
var col2 = className("android.widget.Button").find();
for (var i = 0; i < col2.size(); i++) {
    var t = (col2.get(i).text() || "");
    if (t.indexOf("金额:") >= 0 && /昨日收益:/.test(t)) { picked2 = col2.get(i); break; }
}
var pb2 = picked2.bounds();
click(Math.floor((pb2.left + pb2.right) / 2), Math.floor((pb2.top + pb2.bottom) / 2));
sleep(3500);
var hasBuy2 = !!text("买入").findOne(2000);
log("step4 第二次详情页: 有买入=" + hasBuy2);
sleep(500);
var tapped2 = tapBackBtn();
sleep(1800);
var hold2 = onHoldPage(1500);
log("step4 第二次退回: tapBackBtn=" + tapped2 + " onHoldPage=" + hold2);
if (hold2 && hasBuy2) log("PASS: 第二次往返也正确"); else log("FAIL: 第二次往返异常");

log("=== probe1b end ===");
