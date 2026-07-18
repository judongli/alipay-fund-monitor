const assert = require('assert');
const {
    createRunRecord,
    recalcRunStats,
    canResumeRun,
    recoverInterruptedRun,
} = require('../src/run-history.js');

const run = createRunRecord({ id: 'r1', ts: 100, mode: '真实', strategyKeys: ['base'] });
assert.strictEqual(run.status, 'running');
assert.strictEqual(run.incomplete, true);
assert.strictEqual(canResumeRun(run), true);

run.detail = [
    { s: 'ok' },
    { s: 'dry_run_stopped_at_pwd' },
    { s: 'skipped' },
    { s: 'error' },
];
recalcRunStats(run);
assert.deepStrictEqual({ ok: run.ok, fail: run.fail, skip: run.skip }, { ok: 2, fail: 1, skip: 1 });

run.plan = [{ a: 'buy', name: 'A', amt: 10, strat: '底仓', state: 'executing' }, { state: 'pending' }];
run.currentIndex = 0;
recoverInterruptedRun(run, 200);
assert.strictEqual(run.status, 'interrupted');
assert.strictEqual(run.plan[0].state, 'unknown');
assert.strictEqual(run.nextIndex, 1);
assert.strictEqual(run.detail[4].s, 'unknown_interrupted');
assert.strictEqual(canResumeRun(run), true);

run.resumable = false;
assert.strictEqual(canResumeRun(run), false);

const collecting = createRunRecord({ id: 'r2', ts: 300 });
recoverInterruptedRun(collecting, 400);
assert.strictEqual(collecting.status, 'interrupted');
assert.strictEqual(collecting.nextIndex, 0);
assert.strictEqual(collecting.detail.length, 0);

collecting.status = 'completed';
collecting.incomplete = false;
assert.strictEqual(canResumeRun(collecting), false);

console.log('✅ run-history tests passed');
