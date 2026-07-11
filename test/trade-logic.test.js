const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkGuard, ratioToShares, buildAudit, appendAudit } = require('../src/trade-logic.js');

// checkGuard
assert.deepStrictEqual(checkGuard({ name: 'A', amount: 100, whitelist: ['A'], maxAmount: 5000, confirmThreshold: 1000 }),
    { ok: true, needConfirm: false, reason: '' });
assert.strictEqual(checkGuard({ name: 'B', amount: 100, whitelist: ['A'], maxAmount: 5000, confirmThreshold: 1000 }).ok, false);
assert.strictEqual(checkGuard({ name: 'B', amount: 100, whitelist: [], maxAmount: 5000, confirmThreshold: 1000 }).ok, true); // 白名单空=不校验
assert.strictEqual(checkGuard({ name: 'A', amount: 6000, whitelist: ['A'], maxAmount: 5000, confirmThreshold: 1000 }).ok, false);
assert.strictEqual(checkGuard({ name: 'A', amount: 2000, whitelist: ['A'], maxAmount: 5000, confirmThreshold: 1000 }).needConfirm, true);
assert.strictEqual(checkGuard({ name: 'A', amount: 0.5, whitelist: ['A'], maxAmount: 5000, confirmThreshold: 1000 }).ok, false);

// ratioToShares
assert.strictEqual(ratioToShares(1 / 8, 1000), 125);
assert.strictEqual(ratioToShares(1 / 7, 1000), 142.85); // floor 向下取整,防超卖
assert.strictEqual(ratioToShares(1, 1000), 1000);

// buildAudit
const line = buildAudit({ ts: 1, action: 'buy', code: '022559', name: 'X', amount: 10, dryRun: true, status: 'ok', msg: '' });
const obj = JSON.parse(line);
assert.strictEqual(obj.action, 'buy');
assert.strictEqual(obj.code, '022559');
assert.strictEqual(obj.amount, 10);

// appendAudit
const f = path.join(os.tmpdir(), 'audit_test.log');
if (fs.existsSync(f)) fs.unlinkSync(f);
assert.strictEqual(appendAudit(f, line), true);
assert.strictEqual(appendAudit(f, line), true);
assert.strictEqual(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length, 2);

console.log('✅ trade-logic tests passed');
