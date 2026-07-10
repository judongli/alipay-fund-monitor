// ============================================================
// 基金信息采集模块
// ============================================================
// openFundPage():  自动打开支付宝并导航到「基金持仓明细」页
//                  路径(用户提供): 首页 → 理财 → 基金 → 持有
// collectFunds():  采集每只基金的字段 —— 待 recon 拿到卡片结构后实现
// ============================================================

var config = require("./config.js");

// 点击控件中心(比 w.click() 更稳,适配支付宝自绘控件)
function tapCenter(w) {
    var b = w.bounds();
    var x = Math.floor((b.left + b.right) / 2);
    var y = Math.floor((b.top + b.bottom) / 2);
    click(x, y);
}

// 按文字点击;找到返回 true,找不到返回 false(供容错导航:不在首页也不崩)
function tryTap(t) {
    var w = text(t).findOne(config.findTimeout);
    if (!w) {
        console.log("⚠️ 未找到「" + t + "」,跳过(可能已在更深层页面)");
        return false;
    }
    tapCenter(w);
    console.log("✓ 点击「" + t + "」");
    return true;
}

// 自动打开支付宝并导航到基金持仓明细页
function openFundPage() {
    // 1. 启动支付宝(从桌面/任意页面都行,脚本自己拉起来)
    app.launchApp(config.alipayName);
    sleep(config.pageLoadWait);

    // 2. 校验确实切到支付宝了(MIUI 可能拦截后台启动)
    var pkg = currentPackage();
    if (pkg.indexOf("Alipay") < 0 && pkg.indexOf("alipay") < 0) {
        throw new Error("启动支付宝失败(当前仍在 " + pkg + ")。"
            + "多半是 MIUI 拦截:设置→应用管理→AutoX.js,把『后台弹出界面』『显示悬浮窗』打开后重试;"
            + "或先手动打开支付宝停在首页再运行。");
    }
    console.log("✓ 已进入支付宝: " + pkg);

    // 3. 容错导航:每步找不到就跳过 + 打日志(应对支付宝停在非首页的情况)
    tryTap("理财");
    sleep(config.actionWait);
    tryTap("基金");
    sleep(config.actionWait);
    tryTap("持有");
    sleep(config.pageLoadWait);
}

// 采集所有已购基金信息(卡片解析待实现)
function collectFunds() {
    // 卡片结构拿到后,这里会变成:openFundPage() → 滚动逐卡解析 → 返回数组
    // 预期返回:[{ name, code, amount, profit, profitRate, ... }]
    throw new Error("采集解析待实现:请先运行 recon.js(已自动导航)拿到卡片结构");
}

module.exports = {
    openFundPage: openFundPage,
    tryTap: tryTap,
    tapCenter: tapCenter,
    collectFunds: collectFunds,
};
