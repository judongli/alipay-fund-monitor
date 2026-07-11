const assert = require('assert');
const { planBuys, planSells } = require('../src/strategy-logic.js');

var S = {
    base: { inPool: true, target: 100, amount: 100 },
    dca: { inPool: true, amount: 200, whitelist: ['定投A'] },
    costReduce: { inPool: true, tiers: [{ maxLoss: 0.05, amount: 10 }, { maxLoss: 0.10, amount: 20 }] },
    takeProfit: {
        inPool: true,
        tiers: [
            { minRate: 0.10, ratio: 8 }, { minRate: 0.15, ratio: 7 }, { minRate: 0.20, ratio: 6 },
            { minRate: 0.25, ratio: 5 }, { minRate: 0.30, ratio: 4 }, { minRate: 0.35, ratio: 3 },
            { minRate: 0.40, ratio: 2 }, { minRate: 0.45, ratio: 1 },
        ],
    },
};

// ---- planBuys ----
var funds = [
    { name: '亏损浅', amount: 500, rate: -0.03 },     // 降本 5%内 → 10
    { name: '亏损深', amount: 500, rate: -0.08 },     // 降本 10%档 → 20
    { name: '小仓盈利', amount: 50, rate: 0.02 },     // 底仓(target=100) → 100 (不命中降本,盈利)
    { name: '定投A', amount: 5000, rate: 0.01 },     // 定投白名单 → 200
    { name: '正常', amount: 5000, rate: 0.05 },       // 无命中
    { name: '亏损+小仓', amount: 30, rate: -0.06 },  // 优先级:降本(20)赢底仓
];
var buys = planBuys(funds, S);
var byName = {};
buys.forEach(function (o) { byName[o.name] = o; });

assert.strictEqual(buys.length, 5);  // '正常' 不命中
assert.strictEqual(byName['亏损浅'].amount, 10);
assert.strictEqual(byName['亏损浅'].strategy, 'costReduce');
assert.strictEqual(byName['亏损深'].amount, 20);
assert.strictEqual(byName['亏损深'].strategy, 'costReduce');
assert.strictEqual(byName['小仓盈利'].amount, 100);
assert.strictEqual(byName['小仓盈利'].strategy, 'base');
assert.strictEqual(byName['定投A'].amount, 200);
assert.strictEqual(byName['定投A'].strategy, 'dca');
assert.strictEqual(byName['亏损+小仓'].strategy, 'costReduce');  // 降本优先于底仓
assert.strictEqual(byName['亏损+小仓'].amount, 20);

// 各策略都不在池时
assert.strictEqual(planBuys(funds, { base: { inPool: false }, dca: { inPool: false }, costReduce: { inPool: false } }).length, 0);
// costReduce 出池,小仓仍命中底仓
assert.strictEqual(planBuys(funds, { base: { inPool: true, target: 100, amount: 100 }, dca: { inPool: false }, costReduce: { inPool: false } }).length, 2); // 小仓盈利 + 亏损+小仓(amount<100)

// 降本边界:rate=-0.05 命中 5%内(>= -0.05)
assert.strictEqual(planBuys([{ name: 'X', amount: 500, rate: -0.05 }], S)[0].amount, 10);
// rate=-0.10 命中 10%档
assert.strictEqual(planBuys([{ name: 'X', amount: 500, rate: -0.10 }], S)[0].amount, 20);
// rate=-0.11 超过最深档 → 不命中降本(本轮只有两档,不无限外推)
assert.strictEqual(planBuys([{ name: 'X', amount: 500, rate: -0.11 }], S).length, 0);

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

// 边界:rate=0.099 不卖
assert.strictEqual(planSells([{ name: 'X', rate: 0.099 }], S).length, 0);
// rate=0 精确不卖
assert.strictEqual(planSells([{ name: 'X', rate: 0 }], S).length, 0);
// takeProfit 出池 → 空
assert.strictEqual(planSells(sellFunds, { takeProfit: { inPool: false } }).length, 0);

console.log('✅ strategy-logic tests passed');
