// 策略纯逻辑(无 AutoX.js 依赖,node 可测)。main.js 内联同一份(@sync)。
// 单位:买入金额=元,卖出=份(份额在 sell 页读 maxShares 后算)。
// rate 为小数(0.068 = 6.8%)。

/**
 * 买入计划:每只基金按优先级 降本>底仓>定投,在池内(inPool)模板中取一个命中(只取一个,不叠加)
 * @param funds [{name,amount,rate}]
 * @param S     strategies 子树 {base,dca,costReduce,takeProfit},每模板有 inPool 字段
 * @returns     [{name,amount,strategy}]  amount=元
 */
function planBuys(funds, S) {
    var orders = [];
    (funds || []).forEach(function (f) {
        var hit = null;
        // 降本:rate<0(亏损),取最浅匹配档(tiers 按 maxLoss 升序,首个 rate>=-maxLoss 命中)
        if (!hit && S.costReduce && S.costReduce.inPool && f.rate != null && f.rate < 0) {
            var tier = null;
            (S.costReduce.tiers || []).forEach(function (t) {
                if (!tier && f.rate >= -t.maxLoss) tier = t;
            });
            if (tier) hit = { name: f.name, amount: tier.amount, strategy: 'costReduce' };
        }
        // 底仓:amount<target → 买 amount 元
        if (!hit && S.base && S.base.inPool && f.amount != null && f.amount < S.base.target) {
            hit = { name: f.name, amount: S.base.amount, strategy: 'base' };
        }
        // 定投:在定投白名单
        if (!hit && S.dca && S.dca.inPool && (S.dca.whitelist || []).indexOf(f.name) >= 0) {
            hit = { name: f.name, amount: S.dca.amount, strategy: 'dca' };
        }
        if (hit) orders.push(hit);
    });
    return orders;
}

/**
 * 卖出计划:止盈(若在池),按当前 rate 所在档位卖 1/ratio(每次满足即卖,不记状态)
 * @param funds [{name,rate}]
 * @param S     strategies 子树
 * @returns     [{name,ratio,strategy}]  ratio=份额比例(如 1/8=0.125)
 */
function planSells(funds, S) {
    var orders = [];
    if (!S.takeProfit || !S.takeProfit.inPool) return orders;
    (funds || []).forEach(function (f) {
        if (f.rate == null || f.rate <= 0) return;
        var tier = null;
        (S.takeProfit.tiers || []).forEach(function (t) {
            if (f.rate >= t.minRate) tier = t;  // 取 minRate 最高且 <= rate 的档
        });
        if (tier) orders.push({ name: f.name, ratio: 1 / tier.ratio, strategy: 'takeProfit' });
    });
    return orders;
}

module.exports = { planBuys: planBuys, planSells: planSells };
