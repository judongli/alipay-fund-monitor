#!/usr/bin/env node
// ============================================================
// 支付宝基金采集器(ADB 驱动)
// ============================================================
// 用法:先 adb 无线连上手机,然后 node monitor/collect.js
// 流程:重启支付宝 → 理财 → 基金 → 持有 → dump 控件树 → 解析 → 生成 dashboard.html
// 依赖:adb(android-platform-tools),手机已开 USB调试(安全设置)
// ============================================================
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PKG = 'com.eg.android.AlipayGphone';
const H = 2400; // 屏幕高(px),用于过滤屏幕外控件

const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'ignore'] });
const sleep = (ms) => execSync('sleep ' + (ms / 1000));

function dump() {
    sh('adb shell uiautomator dump /sdcard/ui.xml');
    execSync('adb pull /sdcard/ui.xml /tmp/ui.xml', { stdio: 'ignore' });
    return fs.readFileSync('/tmp/ui.xml', 'utf8');
}
function nodes(xml) {
    return [...xml.matchAll(/<node\b[^>]*>/g)].map(m => {
        const tag = m[0];
        const g = re => { const x = new RegExp(re + '="([^"]*)"').exec(tag); return x ? x[1] : ''; };
        const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(tag);
        return { text: g('text'), desc: g('content-desc'), bounds: b ? [+b[1], +b[2], +b[3], +b[4]] : null };
    });
}
function findCenter(xml, target, pick = 0) {
    const valid = n => n.bounds && n.bounds[3] > n.bounds[1] && n.bounds[2] > n.bounds[0] && n.bounds[1] >= 0 && n.bounds[1] <= H;
    const ms = nodes(xml).filter(n => valid(n) && (n.text === target || n.desc === target));
    const p = ms[pick];
    return p ? [Math.round((p.bounds[0] + p.bounds[2]) / 2), Math.round((p.bounds[1] + p.bounds[3]) / 2)] : null;
}
function tap(xml, target, pick = 0) {
    const c = findCenter(xml, target, pick);
    if (!c) { console.log('  ✗ 没找到「' + target + '」'); return false; }
    console.log('  → 点「' + target + '」 @ ' + c);
    sh('adb shell input tap ' + c[0] + ' ' + c[1]);
    return true;
}
function swipe(x1, y1, x2, y2, dur) { sh('adb shell input swipe ' + x1 + ' ' + y1 + ' ' + x2 + ' ' + y2 + ' ' + (dur || 400)); }

function parse(xml) {
    const texts = [...xml.matchAll(/text="([^"]*)"/g)].map(m => m[1]);
    const funds = [];
    let hdr = { total: null, yProfit: null, hProfit: null, cProfit: null, pending: null };
    const num = (re, t) => { const m = re.exec(t); return m ? +m[1] : null; };
    texts.forEach(t => {
        if (/金额:.*昨日收益:.*持有收益:.*持有收益率:/.test(t)) {
            let name = t.split('金额:')[0].replace(/(\s*(支付宝金选|定投))+\s*$/, '').trim();
            funds.push({
                name, raw: t,
                amount: num(/金额:(-?[\d.]+)元/, t),
                yesterday: num(/昨日收益:(-?[\d.]+)元/, t),
                holding: num(/持有收益:(-?[\d.]+)元/, t),
                rate: num(/持有收益率:(-?[\d.]+)/, t),
                jinxuan: /支付宝金选/.test(t),
                autoInvest: /定投/.test(t),
            });
        }
        if (hdr.total === null && /总金额:/.test(t)) hdr.total = num(/总金额:([\d.]+)/, t);
        if (hdr.yProfit === null && /昨日收益\(元\)/.test(t)) hdr.yProfit = num(/昨日收益\(元\)\s*(-?[\d.]+)/, t);
        if (hdr.hProfit === null && /持有收益\(元\)/.test(t)) hdr.hProfit = num(/持有收益\(元\)\s*(-?[\d.]+)/, t);
        if (hdr.cProfit === null && /累计收益\(元\)/.test(t)) hdr.cProfit = num(/累计收益\(元\)\s*(-?[\d.]+)/, t);
        if (hdr.pending === null && /买入待确认/.test(t)) hdr.pending = num(/买入待确认\s*([\d.]+)/, t);
    });
    return { hdr, funds };
}

// ---------------- 主流程 ----------------
console.log('▶ 重启支付宝到首页');
sh('adb shell am force-stop ' + PKG); sleep(1000);
sh('adb shell monkey -p ' + PKG + ' -c android.intent.category.LAUNCHER 1');
sleep(6000);

console.log('▶ 导航: 理财 → 基金 → 持有');
let xml = dump(); tap(xml, '理财'); sleep(3000);
xml = dump(); tap(xml, '基金'); sleep(3000);
xml = dump(); tap(xml, '持有'); sleep(3000);
xml = dump();
for (let i = 0; i < 20 && !/持有收益率:|持有收益率排序/.test(xml); i++) { sleep(500); xml = dump(); }

console.log('▶ 采集(滚动合并,确保抓全)');
let { hdr, funds } = parse(xml);
const seen = new Set(funds.map(f => f.name));
for (let i = 0; i < 5; i++) {
    swipe(540, Math.floor(H * 0.72), 540, Math.floor(H * 0.28), 500);
    sleep(1200);
    const r = parse(dump());
    let added = 0;
    r.funds.forEach(f => { if (!seen.has(f.name)) { seen.add(f.name); funds.push(f); added++; } });
    if (added === 0 && r.funds.length > 0) break; // 没有新基金,到底了
}
funds.sort((a, b) => b.amount - a.amount);

const sum = funds.reduce((a, f) => a + f.amount, 0);
console.log('✓ 采集 ' + funds.length + ' 只基金 | 页面总金额 ' + hdr.total + ' | 合计 ' + sum.toFixed(2) + ' | 差额 ' + (hdr.total - sum).toFixed(2));

const out = {
    ts: new Date().toISOString(),
    hdr, count: funds.length, sumCheck: +sum.toFixed(2), diff: +(hdr.total - sum).toFixed(2), funds,
};
fs.writeFileSync(path.join(__dirname, 'funds.json'), JSON.stringify(out, null, 2));

// 生成 dashboard.html
const html = require('./template.js')(out);
fs.writeFileSync(path.join(__dirname, 'dashboard.html'), html);
console.log('✓ 已生成 monitor/dashboard.html ,用浏览器打开即可查看');
