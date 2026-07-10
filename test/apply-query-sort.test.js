// applyQuerySort 单元测试 —— 与 main.js 内 applyQuerySort 同源,改动需同步。
// AutoX.js 无法用 node 直接运行(含 XML 字面量与 android.* 全局),
// 故在此内联同一纯函数,锁定「搜索过滤 + 各列升降序 + 不可变」逻辑。
// 用法:node test/apply-query-sort.test.js
var assert = require("assert");

function applyQuerySort(funds, q, key, dir) {
    return funds.slice()
        .filter(function (f) { var qq = ("" + q).toLowerCase(); return !q || f.name.toLowerCase().indexOf(qq) >= 0; })
        .sort(function (a, b) {
            return key === "name" ? dir * a.name.localeCompare(b.name) : dir * (a[key] - b[key]);
        });
}

var funds = [
    { name: "华泰C", amount: 2408.89, yesterday: -22.63, holding: -192.72, rate: -0.072 },
    { name: "易方达蓝筹", amount: 5000.00, yesterday: 12.50, holding: 320.00, rate: 0.068 },
    { name: "招商中证", amount: 1200.00, yesterday: 5.00, holding: -50.00, rate: -0.040 },
    { name: "兴全合润", amount: 800.00, yesterday: 0, holding: 10.00, rate: 0.012 },
];
var names = function (rows) { return rows.map(function (f) { return f.name; }); };

// 1) 金额降序(默认)
assert.deepEqual(names(applyQuerySort(funds, "", "amount", -1)),
    ["易方达蓝筹", "华泰C", "招商中证", "兴全合润"], "金额降序");

// 2) 昨日收益降序
assert.deepEqual(names(applyQuerySort(funds, "", "yesterday", -1)),
    ["易方达蓝筹", "招商中证", "兴全合润", "华泰C"], "昨日收益降序");

// 3) 持有收益降序
assert.deepEqual(names(applyQuerySort(funds, "", "holding", -1)),
    ["易方达蓝筹", "兴全合润", "招商中证", "华泰C"], "持有收益降序");

// 4) 收益率降序
assert.deepEqual(names(applyQuerySort(funds, "", "rate", -1)),
    ["易方达蓝筹", "兴全合润", "招商中证", "华泰C"], "收益率降序");

// 5) 名称降序(localeCompare,与直接 sort 结果一致)
assert.deepEqual(names(applyQuerySort(funds, "", "name", -1)),
    names(funds.slice().sort(function (a, b) { return b.name.localeCompare(a.name); })), "名称降序");

// 6) 升序(dir = 1)金额
assert.deepEqual(names(applyQuerySort(funds, "", "amount", 1)),
    ["兴全合润", "招商中证", "华泰C", "易方达蓝筹"], "金额升序");

// 7) 搜索过滤(大小写无关子串)
assert.deepEqual(names(applyQuerySort(funds, "C", "amount", -1)), ["华泰C"], "搜索 C 命中华泰C");
assert.deepEqual(names(applyQuerySort(funds, "c", "amount", -1)), ["华泰C"], "搜索 c 大小写无关");
assert.deepEqual(names(applyQuerySort(funds, "证", "amount", -1)), ["招商中证"], "搜索 证");

// 8) 搜索无匹配 → 空数组
assert.equal(applyQuerySort(funds, "zzz", "amount", -1).length, 0, "无匹配返回空");

// 9) 不修改原数组(不可变)
var before = names(funds);
applyQuerySort(funds, "", "rate", -1);
assert.deepEqual(names(funds), before, "原数组未被修改");

console.log("✅ applyQuerySort:全部断言通过");
