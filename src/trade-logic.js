// 交易纯逻辑(无 AutoX.js 依赖,node 可测)。main.js 内联同一份(@sync)。

/** 护栏校验(白名单已移除,改由组别/策略作用范围控制) */
function checkGuard(o) {
    if (typeof o.amount !== 'number' || isNaN(o.amount)) return { ok: false, needConfirm: false, reason: '金额非数字' };
    var dec = ("" + o.amount).split('.')[1];
    if (dec && dec.length > 2) return { ok: false, needConfirm: false, reason: '金额小数超过2位:' + o.amount };
    if (!o.amount || o.amount < 1) return { ok: false, needConfirm: false, reason: '金额必须 >=1.00' };
    if (o.amount > o.maxAmount) return { ok: false, needConfirm: false, reason: '金额 ' + o.amount + ' 超上限 ' + o.maxAmount };
    var needConfirm = o.confirmThreshold != null && o.amount > o.confirmThreshold;
    return { ok: true, needConfirm: needConfirm, reason: '' };
}

/** 比例 → 份额(向下截断两位小数) */
function ratioToShares(ratio, holdingShares) {
    var s = Math.floor(ratio * holdingShares * 100) / 100;
    return s;
}

/** 审计单行(JSON) */
function buildAudit(o) {
    return JSON.stringify({
        ts: o.ts, action: o.action, code: o.code || '', name: o.name || '',
        amount: o.amount != null ? o.amount : '', shares: o.shares != null ? o.shares : '',
        dryRun: !!o.dryRun, status: o.status, msg: o.msg || '',
    });
}

/** 追加审计到文件(AutoX.js 用 files.append;node 用 fs) */
function appendAudit(file, line) {
    try {
        if (typeof files !== 'undefined') { files.ensureDir(file); files.append(file, line + '\n'); }
        else { var fs = require('fs'); fs.appendFileSync(file, line + '\n'); }
        return true;
    } catch (e) { return false; }
}

module.exports = { checkGuard: checkGuard, ratioToShares: ratioToShares, buildAudit: buildAudit, appendAudit: appendAudit };
