// 全局配置
module.exports = {
    alipayPackage: "com.eg.android.AlipayGphone", // 支付宝包名
    alipayActivity: "com.eg.android.AlipayGphone.AlipayLogin", // 主 Activity
    alipayName: "支付宝",

    pageLoadWait: 3000,  // 页面加载等待(ms)
    actionWait: 1000,    // 操作间隔(ms)
    findTimeout: 6000,   // 查找控件超时(ms)

    reconFile: "/sdcard/Download/alipay_recon.txt",   // 侦察输出文件
    dataFile: "/sdcard/Download/alipay_funds.json",   // 基金数据文件
};
