// 策略纯逻辑(无 AutoX.js 依赖,node 可测)。main.js 内联同一份(@sync)。
// 单位:买入金额=元,卖出=份(份额在 sell 页读 maxShares 后算)。
// rate 为小数(0.068 = 6.8%)。
//
// 固定四种策略各一份实例,靠内部配置表达差异:
//   base(全局)       持仓<目标 → 买 单次金额
//   dca(组别级)       每个组别自带 dcaEnabled+dcaAmount;"全部基金"有 allEnabled+allAmount。
//                    开关开的组,组内每只基金各按该组金额买一笔。
//   costReduce(全局) 亏损(rate<0)→ 取最浅匹配档金额
//   takeProfit(全局) 收益率达档 → 卖 1/分母
// 关系(买入侧两条道):
//   ① 二选一:base 与 dca 互斥,取金额高者(并列 base>dca)
//   ② 可叠加:costReduce 独立,可与①同时命中
//   ③ 合并:同一只基金若 costReduce 与①都命中 → 金额相加合成一笔买单(减少操作次数)
//   卖出侧:takeProfit 独立,与买入互不影响。
// 金额归属:组别自带定投金额(不再逐基金填 entries);"全部基金"用 dca.allAmount。

/**
 * 基金是否在定投作用范围内。groupId='ALL' 表示全部基金(隐式默认组)。
 */
function fundInGroup(fundName, groupId, groups) {
    if (groupId === 'ALL') return true;
    var g = null;
    (groups || []).forEach(function (x) { if (x.id === groupId) g = x; });
    return !!(g && (g.funds || []).indexOf(fundName) >= 0);
}

/**
 * 定投候选金额:收集该基金在所有启用定投来源中的金额(ALL + 各 dcaEnabled 组)。
 * 一只基金可能被 ALL 和多个组同时命中 → 返回所有候选,由 planBuys 统一取最高。
 * @returns [amount, ...] 金额列表(空数组表示无定投命中)
 */
function dcaCandidates(fundName, S, groups) {
    var amts = [];
    if (!S.dca || !S.dca.enabled) return amts;
    if (S.dca.allEnabled && S.dca.allAmount >= 1) amts.push(S.dca.allAmount);
    (groups || []).forEach(function (g) {
        if (g.dcaEnabled && g.dcaAmount >= 1 && (g.funds || []).indexOf(fundName) >= 0) {
            amts.push(g.dcaAmount);
        }
    });
    return amts;
}

/**
 * 买入计划:
 *   ① 二选一(base vs dca)→ 取金额高者(并列 base>dca)
 *   ② 可叠加(costReduce 独立)
 *   ③ 合并:costReduce 与①同时命中 → 金额相加合成一笔(减少操作次数)
 * 同一只基金最终最多产出 1 笔买单(amount=命中的各策略金额之和)。
 * @param funds  [{name,amount,rate}]
 * @param S      strategies 子树 {base,dca,costReduce,takeProfit},每模板有 enabled 字段
 * @param groups [{id,name,funds}] 定投用组别
 * @param onlyKeys 可选,本次执行包含的策略 key 数组(如 ['base','costReduce'])。
 *                省略/null → 不限(等价于全部启用策略);提供时 → 仅评估该集合内且 enabled 的策略(再收窄)。
 * @returns      [{name,amount,strategy,strategies}]
 *                strategy  = 命中策略 join('+'),单命中时为单个 key(如 'base')
 *                strategies= 命中策略数组(如 ['costReduce','base'])
 */
function planBuys(funds, S, groups, onlyKeys) {
    var PICK_RANK = { base: 0, dca: 1 };  // 二选一并列优先级:base>dca
    var allow = function (k) { return !onlyKeys || onlyKeys.indexOf(k) >= 0; };
    var orders = [];
    (funds || []).forEach(function (f) {
        var hits = [];
        // ② 可叠加:降本——rate<0,取最浅匹配档
        //   tiers 自动按 maxLoss 升序(亏损小→大),首个 rate>=-maxLoss 即最浅匹配档
        if (allow('costReduce') && S.costReduce && S.costReduce.enabled && f.rate != null && f.rate < 0) {
            var tier = null;
            var crTiers = (S.costReduce.tiers || []).slice().sort(function (a, b) { return a.maxLoss - b.maxLoss; });
            crTiers.forEach(function (t) { if (!tier && t.enabled !== false && f.rate >= -t.maxLoss) tier = t; });
            // 兜底档:普通档都不命中(亏损超过最深档;空 tiers 时任意亏损)→ 启用则用兜底金额
            var catchAll = S.costReduce.catchAll;
            if (!tier && catchAll && catchAll.enabled && catchAll.amount >= 1) {
                tier = { amount: catchAll.amount };
            }
            if (tier) hits.push({ amount: tier.amount, strategy: 'costReduce' });
        }
        // ① 二选一:底仓 vs 定投,取金额高者(并列 base>dca)
        var pick = null;
        if (allow('base') && S.base && S.base.enabled && f.amount != null && f.amount < S.base.target) {
            pick = { amount: S.base.amount, strategy: 'base' };
        }
        if (allow('dca') && S.dca && S.dca.enabled) {
            var dcaAmts = dcaCandidates(f.name, S, groups);
            if (dcaAmts.length) {
                var dcaMax = dcaAmts.reduce(function (a, b) { return a > b ? a : b; });
                if (!pick || dcaMax > pick.amount ||
                    (dcaMax === pick.amount && PICK_RANK.dca < PICK_RANK[pick.strategy])) {
                    pick = { amount: dcaMax, strategy: 'dca' };
                }
            }
        }
        if (pick) hits.push(pick);
        if (!hits.length) return;
        // ③ 合并:所有命中策略金额相加,合成一笔
        var sum = hits.reduce(function (a, h) { return a + h.amount; }, 0);
        var keys = hits.map(function (h) { return h.strategy; });
        orders.push({ name: f.name, amount: sum, strategy: keys.join('+'), strategies: keys });
    });
    return orders;
}

/**
 * 卖出计划:止盈(若启用),按当前 rate 所在最高匹配档卖 1/ratio(单实例,无跨实例冲突)
 * @param funds    [{name,rate}]
 * @param S        strategies 子树
 * @param onlyKeys 可选,本次执行包含的策略 key 数组;省略/null → 不限,提供时仅评估该集合内且 enabled 的策略
 * @returns     [{name,ratio,strategy}]  ratio=份额比例(如 1/8=0.125)
 */
function planSells(funds, S, onlyKeys) {
    var orders = [];
    if (onlyKeys && onlyKeys.indexOf('takeProfit') < 0) return orders;
    if (!S.takeProfit || !S.takeProfit.enabled) return orders;
    (funds || []).forEach(function (f) {
        if (f.rate == null || f.rate <= 0) return;
        var tier = null;
        // tiers 自动按 minRate 升序(收益低→高),遍历取最后命中即最高匹配档
        var tpTiers = (S.takeProfit.tiers || []).slice().sort(function (a, b) { return a.minRate - b.minRate; });
        tpTiers.forEach(function (t) {
            if (f.rate >= t.minRate && t.enabled !== false) tier = t;  // 跳过禁用档,取最高启用命中档
        });
        if (tier) orders.push({ name: f.name, ratio: 1 / tier.ratio, strategy: 'takeProfit' });
    });
    return orders;
}

module.exports = { fundInGroup: fundInGroup, dcaCandidates: dcaCandidates, planBuys: planBuys, planSells: planSells };
