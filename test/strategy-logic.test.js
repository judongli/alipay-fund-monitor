const assert = require('assert');
const { fundInGroup, dcaCandidates, planBuys, planSells } = require('../src/strategy-logic.js');

// ---- fundInGroup ----
assert.strictEqual(fundInGroup('A', 'ALL', []), true);                 // ALL 命中任意基金
assert.strictEqual(fundInGroup('A', 'g1', [{ id: 'g1', name: '组1', funds: ['A', 'B'] }]), true);
assert.strictEqual(fundInGroup('C', 'g1', [{ id: 'g1', name: '组1', funds: ['A', 'B'] }]), false);
assert.strictEqual(fundInGroup('A', 'nope', []), false);               // 组不存在

// ---- dcaCandidates(组别级金额)----
// ALL 开:任意基金命中 allAmount
var SallOnly = { dca: { enabled: true, allEnabled: true, allAmount: 80 } };
assert.deepStrictEqual(dcaCandidates('任意A', SallOnly, []), [80]);
assert.deepStrictEqual(dcaCandidates('任意A', { dca: { enabled: true, allEnabled: false, allAmount: 80 } }, []), []); // allEnabled 关
// 单组 dcaEnabled:组内基金命中该组金额,组外不命中
var groups2 = [
    { id: 'g1', name: '组1', funds: ['A', 'B'], dcaEnabled: true, dcaAmount: 100 },
    { id: 'g2', name: '组2', funds: ['C'], dcaEnabled: false, dcaAmount: 200 }, // 未启用
];
var Sgrp = { dca: { enabled: true, allEnabled: false, allAmount: 50 } };
assert.deepStrictEqual(dcaCandidates('A', Sgrp, groups2), [100]);  // g1 内
assert.deepStrictEqual(dcaCandidates('B', Sgrp, groups2), [100]);
assert.deepStrictEqual(dcaCandidates('C', Sgrp, groups2), []);     // g2 未启用
assert.deepStrictEqual(dcaCandidates('D', Sgrp, groups2), []);     // 不在任何组
// ALL + 组同时命中 → 多候选,由 planBuys 取最高
var Sboth = { dca: { enabled: true, allEnabled: true, allAmount: 50 } };
assert.deepStrictEqual(dcaCandidates('A', Sboth, groups2), [50, 100]); // ALL 50 + g1 100
// dca 总开关关 → 空
assert.deepStrictEqual(dcaCandidates('A', { dca: { enabled: false, allEnabled: true, allAmount: 80 } }, groups2), []);
// 金额<1 视为无效
var Sbad = { dca: { enabled: true, allEnabled: true, allAmount: 0.5 } };
assert.deepStrictEqual(dcaCandidates('A', Sbad, [{ id: 'g', name: 'g', funds: ['A'], dcaEnabled: true, dcaAmount: 0 }]), []);

// ---- 完整策略子树 ----
// dca:不开 ALL,只让"定投组"内的基金命中(组 g1 含"定投A")
var S = {
    base: { enabled: true, target: 100, amount: 100 },
    dca: { enabled: true, allEnabled: false, allAmount: 200 },
    costReduce: { enabled: true, tiers: [{ maxLoss: 0.05, amount: 10 }, { maxLoss: 0.10, amount: 20 }] },
    takeProfit: {
        enabled: true,
        tiers: [
            { minRate: 0.10, ratio: 8 }, { minRate: 0.15, ratio: 7 }, { minRate: 0.20, ratio: 6 },
            { minRate: 0.25, ratio: 5 }, { minRate: 0.30, ratio: 4 }, { minRate: 0.35, ratio: 3 },
            { minRate: 0.40, ratio: 2 }, { minRate: 0.45, ratio: 1 },
        ],
    },
};
var groups = [{ id: 'g1', name: '定投组', funds: ['定投A'], dcaEnabled: true, dcaAmount: 200 },
              { id: 'g2', name: '空组', funds: ['组内A', '组内B'], dcaEnabled: false, dcaAmount: 100 }];

// ---- planBuys:基础命中 ----
var funds = [
    { name: '亏损浅', amount: 500, rate: -0.03 },     // 降本 5%内 → 10
    { name: '亏损深', amount: 500, rate: -0.08 },     // 降本 10%档 → 20
    { name: '小仓盈利', amount: 50, rate: 0.02 },     // 底仓(target=100) → 100
    { name: '定投A', amount: 5000, rate: 0.01 },     // 定投组 → 200
    { name: '正常', amount: 5000, rate: 0.05 },       // 无命中
];
var buys = planBuys(funds, S, groups);
var byName = {};
buys.forEach(function (o) { byName[o.name] = o; });
assert.strictEqual(buys.length, 4);  // '正常' 不命中
assert.strictEqual(byName['亏损浅'].amount, 10);
assert.strictEqual(byName['亏损浅'].strategy, 'costReduce');
assert.strictEqual(byName['亏损深'].amount, 20);
assert.strictEqual(byName['小仓盈利'].amount, 100);
assert.strictEqual(byName['小仓盈利'].strategy, 'base');
assert.strictEqual(byName['定投A'].amount, 200);
assert.strictEqual(byName['定投A'].strategy, 'dca');

// ---- 合并规则:降本可与二选一(底仓/定投)同时命中,金额相加合成一笔 ----
// 亏损+小仓:降本 20 + 底仓 100 → 合并 120,strategy 'costReduce+base'
var conflict1 = planBuys([{ name: 'X', amount: 30, rate: -0.08 }], S, groups);
assert.strictEqual(conflict1.length, 1);
assert.strictEqual(conflict1[0].amount, 120);
assert.strictEqual(conflict1[0].strategy, 'costReduce+base');
assert.deepStrictEqual(conflict1[0].strategies, ['costReduce', 'base']);

// 亏损+定投:降本 20 + 定投 200 → 合并 220
var Sconf = {
    base: { enabled: false },
    dca: { enabled: true, allEnabled: true, allAmount: 200 },
    costReduce: { enabled: true, tiers: [{ maxLoss: 0.10, amount: 20 }] },
};
var conflict2 = planBuys([{ name: 'Y', amount: 500, rate: -0.08 }], Sconf, groups);
assert.strictEqual(conflict2[0].amount, 220);
assert.strictEqual(conflict2[0].strategy, 'costReduce+dca');

// 二选一:底仓 vs 定投,取金额高者;并列底仓>定投
// 底仓 100 vs 定投 200 → 取定投(金额高)
var SpickDca = {
    base: { enabled: true, target: 100, amount: 100 },
    dca: { enabled: true, allEnabled: true, allAmount: 200 },
    costReduce: { enabled: false },
};
var pickDca = planBuys([{ name: 'P', amount: 50, rate: 0 }], SpickDca, groups);
assert.strictEqual(pickDca[0].amount, 200);
assert.strictEqual(pickDca[0].strategy, 'dca');
// 底仓 300 vs 定投 200 → 取底仓(金额高)
var SpickBase = {
    base: { enabled: true, target: 1000, amount: 300 },
    dca: { enabled: true, allEnabled: true, allAmount: 200 },
    costReduce: { enabled: false },
};
var pickBase = planBuys([{ name: 'P', amount: 50, rate: 0 }], SpickBase, groups);
assert.strictEqual(pickBase[0].amount, 300);
assert.strictEqual(pickBase[0].strategy, 'base');
// 并列金额(都 50):底仓>定投 → 取底仓,且无降本故不合并
var StieBD = {
    base: { enabled: true, target: 1000, amount: 50 },
    dca: { enabled: true, allEnabled: true, allAmount: 50 },
    costReduce: { enabled: false },
};
var tieBD = planBuys([{ name: 'P', amount: 30, rate: 0 }], StieBD, groups);
assert.strictEqual(tieBD[0].amount, 50);
assert.strictEqual(tieBD[0].strategy, 'base');

// 三策略同命中:降本 + 二选一(并列底仓)→ 金额合并
var Stie = {
    base: { enabled: true, target: 100, amount: 50 },
    dca: { enabled: true, allEnabled: true, allAmount: 50 },
    costReduce: { enabled: true, tiers: [{ maxLoss: 0.10, amount: 50 }] },
};
var tieFunds = [{ name: 'Z', amount: 30, rate: -0.05 }];  // 三策略都命中,金额都 50
var tie = planBuys(tieFunds, Stie, groups);
assert.strictEqual(tie.length, 1);
assert.strictEqual(tie[0].amount, 100);  // 降本50 + 底仓50
assert.strictEqual(tie[0].strategy, 'costReduce+base');
assert.deepStrictEqual(tie[0].strategies, ['costReduce', 'base']);

// ---- ALL 定投:全部基金按 allAmount ----
var Sall = {
    base: { enabled: false }, costReduce: { enabled: false },
    dca: { enabled: true, allEnabled: true, allAmount: 30 },
};
var dcaBuys = planBuys([{ name: 'A', amount: 100, rate: 0 }, { name: 'B', amount: 100, rate: 0 }, { name: 'C', amount: 100, rate: 0 }], Sall, []);
assert.strictEqual(dcaBuys.length, 3);  // 全部命中
var dcaBy = {};
dcaBuys.forEach(function (o) { dcaBy[o.name] = o; });
assert.strictEqual(dcaBy['A'].amount, 30);
assert.strictEqual(dcaBy['B'].amount, 30);
assert.strictEqual(dcaBy['C'].amount, 30);

// ---- 单组 dcaEnabled:仅组内基金按该组金额 ----
var Sgrp2 = {
    base: { enabled: false }, costReduce: { enabled: false },
    dca: { enabled: true, allEnabled: false, allAmount: 50 },
};
var grp = [{ id: 'g1', name: '组1', funds: ['组内A', '组内B'], dcaEnabled: true, dcaAmount: 15 }];
var grpBuys = planBuys([{ name: '组内A', amount: 100, rate: 0 }, { name: '组内B', amount: 100, rate: 0 }, { name: '组外', amount: 100, rate: 0 }], Sgrp2, grp);
assert.strictEqual(grpBuys.length, 2);  // 仅组内两只
var grpBy = {};
grpBuys.forEach(function (o) { grpBy[o.name] = o; });
assert.strictEqual(grpBy['组内A'].amount, 15);
assert.strictEqual(grpBy['组内B'].amount, 15);

// ---- 多组各自启用,不同金额:基金在两组都启用 → 取最高 ----
var multi = [
    { id: 'g1', name: '组1', funds: ['A'], dcaEnabled: true, dcaAmount: 100 },
    { id: 'g2', name: '组2', funds: ['A'], dcaEnabled: true, dcaAmount: 300 },
];
var Smulti = { dca: { enabled: true, allEnabled: false, allAmount: 50 } };
var multiBuys = planBuys([{ name: 'A', amount: 100, rate: 0 }], Smulti, multi);
assert.strictEqual(multiBuys.length, 1);
assert.strictEqual(multiBuys[0].amount, 300);  // 两组命中取最高

// ---- ALL + 组同时命中取最高 ----
var SallGrp = { dca: { enabled: true, allEnabled: true, allAmount: 40 } };
var grpHigh = [{ id: 'g1', name: '组1', funds: ['A'], dcaEnabled: true, dcaAmount: 120 }];
var agBuys = planBuys([{ name: 'A', amount: 100, rate: 0 }], SallGrp, grpHigh);
assert.strictEqual(agBuys[0].amount, 120);  // 组 120 > ALL 40

// ---- 降本边界 ----
assert.strictEqual(planBuys([{ name: 'X', amount: 500, rate: -0.05 }], S, groups)[0].amount, 10);  // >=-0.05 命中 5%档
assert.strictEqual(planBuys([{ name: 'X', amount: 500, rate: -0.10 }], S, groups)[0].amount, 20);  // 命中 10%档
assert.strictEqual(planBuys([{ name: 'X', amount: 500, rate: -0.11 }], S, groups).length, 0);      // 超最深档,定投也未命中(无 ALL)

// ---- 各策略 disabled 不产出 ----
assert.strictEqual(planBuys(funds, { base: { enabled: false }, dca: { enabled: false }, costReduce: { enabled: false } }, groups).length, 0);
// 只开底仓:小仓盈利 + 亏损浅/深(amount=500>=100 不命中底仓)→ 只有"小仓盈利"
assert.strictEqual(planBuys(funds, { base: { enabled: true, target: 100, amount: 100 }, dca: { enabled: false }, costReduce: { enabled: false } }, groups).length, 1);

// ---- planSells ----
var sellFunds = [
    { name: '微赚', rate: 0.05 },        // <10% 不卖
    { name: '刚到线', rate: 0.10 },      // 1/8
    { name: '中段', rate: 0.17 },        // 1/7
    { name: '高段', rate: 0.42 },        // 1/2
    { name: '全卖', rate: 0.50 },        // 1
    { name: '亏损', rate: -0.05 },       // 不卖
];
var sells = planSells(sellFunds, S);
var sBy = {};
sells.forEach(function (o) { sBy[o.name] = o; });
assert.strictEqual(sells.length, 4);  // 微赚、亏损不卖
assert.strictEqual(sBy['刚到线'].ratio, 1 / 8);
assert.strictEqual(sBy['中段'].ratio, 1 / 7);
assert.strictEqual(sBy['高段'].ratio, 1 / 2);
assert.strictEqual(sBy['全卖'].ratio, 1);

assert.strictEqual(planSells([{ name: 'X', rate: 0.099 }], S).length, 0);  // 边界
assert.strictEqual(planSells([{ name: 'X', rate: 0 }], S).length, 0);
assert.strictEqual(planSells(sellFunds, { takeProfit: { enabled: false } }).length, 0);  // 出池

// ---- onlyKeys:本次执行范围收窄(只跑选定且启用的策略)----
// base+costReduce 都启用,但 onlyKeys=['base'] → 仅底仓命中,降本被排除
var onlyBase = planBuys([{ name: 'X', amount: 30, rate: -0.08 }], S, groups, ['base']);
assert.strictEqual(onlyBase.length, 1);
assert.strictEqual(onlyBase[0].amount, 100);
assert.strictEqual(onlyBase[0].strategy, 'base');
// onlyKeys=['costReduce'] → 仅降本,底仓被排除(原本会合并成 120)
var onlyCR = planBuys([{ name: 'X', amount: 30, rate: -0.08 }], S, groups, ['costReduce']);
assert.strictEqual(onlyCR[0].amount, 20);
assert.strictEqual(onlyCR[0].strategy, 'costReduce');
// onlyKeys 排除 dca → 定投基金不命中(原本定投A → 200)
var onlyBase2 = planBuys(funds, S, groups, ['base']);
var ob2 = {}; onlyBase2.forEach(function (o) { ob2[o.name] = o; });
assert.strictEqual(ob2['定投A'], undefined);       // 定投被排除
assert.strictEqual(ob2['小仓盈利'].amount, 100);    // 底仓仍命中
assert.strictEqual(ob2['亏损浅'], undefined);       // 降本被 onlyKeys 排除 → 无命中(原本会命中 10 元)
// onlyKeys 仍受 enabled 门控:策略停用时即便在 onlyKeys 内也不命中
var SbaseOff = { base: { enabled: false, target: 100, amount: 100 }, dca: { enabled: false }, costReduce: { enabled: false } };
assert.strictEqual(planBuys(funds, SbaseOff, groups, ['base']).length, 0);
// onlyKeys=null/省略 → 不限(全部启用策略,等价旧行为)
assert.strictEqual(planBuys(funds, S, groups, null).length, buys.length);
// planSells onlyKeys:排除 takeProfit → 不卖
assert.strictEqual(planSells(sellFunds, S, ['base']).length, 0);
assert.strictEqual(planSells(sellFunds, S, ['takeProfit']).length, 4);  // 含 takeProfit → 正常卖

console.log('✅ strategy-logic tests passed');
