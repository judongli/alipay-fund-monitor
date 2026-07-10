// 数据存储模块
var config = require("./config.js");

// 读取已保存的基金数据
function loadFunds() {
    var f = config.dataFile;
    if (!files.exists(f)) return [];
    try {
        return JSON.parse(files.read(f));
    } catch (e) {
        console.warn("读取基金数据失败: " + e);
        return [];
    }
}

// 保存基金数据
function saveFunds(funds) {
    files.ensureDir(config.dataFile);
    files.write(config.dataFile, JSON.stringify(funds, null, 2));
}

module.exports = {
    loadFunds: loadFunds,
    saveFunds: saveFunds,
};
