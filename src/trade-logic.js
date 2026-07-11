// 交易纯逻辑(无 AutoX.js 依赖,node 可测)。main.js 内联同一份(@sync)。

/** 护栏校验 */
function checkGuard(o) {
    var wl = o.whitelist || [];
    if (!o.amount || o.amount < 1) return { ok: false, needConfirm: false, reason: '金额必须 >=1.00' };
    if (wl.length > 0 && wl.indexOf(o.name) < 0) return { ok: false, needConfirm: false, reason: '基金 ' + o.name + ' 不在白名单' };
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
