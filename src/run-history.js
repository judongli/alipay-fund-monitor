// 运行历史纯逻辑。main.js 内有一份 @sync 版本，供 AutoX.js 单文件运行。

function createRunRecord(o) {
    o = o || {};
    var ts = o.ts || Date.now();
    return {
        id: o.id || ('run_' + ts),
        ts: ts,
        updatedAt: ts,
        endedAt: null,
        status: 'running',
        incomplete: true,
        resumable: true,
        phase: 'collecting',
        mode: o.mode || '模拟',
        strategyKeys: (o.strategyKeys || []).slice(),
        config: o.config || null,
        buy: 0,
        sell: 0,
        ok: 0,
        fail: 0,
        skip: 0,
        nextIndex: 0,
        currentIndex: null,
        plan: [],
        detail: [],
        fundMap: {},
        hdr: {},
    };
}

function recalcRunStats(run) {
    var ok = 0, fail = 0, skip = 0;
    (run.detail || []).forEach(function (d) {
        if (d.s === 'skipped') skip++;
        else if (d.s === 'ok' || d.s === 'dry_run_stopped_at_pwd') ok++;
        else fail++;
    });
    run.ok = ok;
    run.fail = fail;
    run.skip = skip;
    return run;
}

function canResumeRun(run) {
    return !!(run && run.incomplete && run.resumable !== false &&
        ['running', 'interrupted', 'paused', 'terminated', 'failed'].indexOf(run.status) >= 0);
}

function recoverInterruptedRun(run, ts) {
    if (!run || run.status !== 'running') return run;
    run.status = 'interrupted';
    run.incomplete = true;
    run.resumable = true;
    run.endedAt = ts || Date.now();
    run.updatedAt = run.endedAt;
    // 若进程在一笔交易中消失，无法安全判断支付宝是否已受理。为防重复下单，
    // 将该笔记为结果待核对并从后续未执行操作继续。
    if (run.currentIndex != null && run.plan && run.plan[run.currentIndex] &&
        run.plan[run.currentIndex].state === 'executing') {
        var o = run.plan[run.currentIndex];
        o.state = 'unknown';
        run.detail = run.detail || [];
        run.detail.push({
            a: o.a, name: o.name, s: 'unknown_interrupted',
            m: '运行中断，交易结果需在支付宝核对', amt: o.amt,
            ratio: o.ratio, strat: o.strat,
        });
        run.nextIndex = run.currentIndex + 1;
        run.currentIndex = null;
        recalcRunStats(run);
    }
    return run;
}

module.exports = {
    createRunRecord: createRunRecord,
    recalcRunStats: recalcRunStats,
    canResumeRun: canResumeRun,
    recoverInterruptedRun: recoverInterruptedRun,
};
