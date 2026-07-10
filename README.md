# 支付宝基金监控（AutoX.js）

用 AutoX.js 自动获取支付宝「已购入基金」的全部信息，并在手机 UI 上展示。**只读，不涉及任何交易操作。**

## 目标（MVP）
- 自动进入支付宝基金持仓页
- 采集每只基金的：名称 / 代码 / 持仓金额 / 收益 / 收益率 等
- 手机 UI 展示采集结果

## 技术栈
- **AutoX.js**（Android 无障碍服务，JavaScript）
- **VSCode + Auto.js-Autox.js-VSCodeExt 插件**（Mac ↔ 手机，WiFi 连接）

## 目录结构
```
alipay-fund-monitor/
├── main.js            # UI 入口（展示基金信息）
├── project.json       # AutoX.js 项目配置
├── src/
│   ├── config.js      # 全局配置
│   ├── recon.js       # ★ 页面侦察脚本（开发期：dump 控件树）
│   ├── collector.js   # 基金信息采集逻辑（待侦察后实现）
│   └── storage.js     # 数据本地存储
```

## 开发路线
- [x] 项目骨架
- [ ] 侦察支付宝基金页控件结构 ← **当前**
- [ ] 基金信息采集逻辑
- [ ] 数据模型与存储
- [ ] UI 展示
- [ ] 联调与健壮性

## 当前阶段：跑侦察脚本
1. 手机打开支付宝 → 手动导航到「基金持仓」页（能看到已购基金列表）
2. VSCode 打开 `src/recon.js` → `F5` 运行
3. 把「调试控制台」里的完整输出复制发给 Claude → 据此编写采集逻辑
