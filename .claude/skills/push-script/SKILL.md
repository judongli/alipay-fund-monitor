---
name: push-script
description: 把本地 main.js 推送到手机 AutoX.js 打包目录(/sdcard/脚本/支付宝基金监控_release/),供重新打包 APK。触发:用户说「推送脚本 / 同步到手机 / 把 main.js 推到手机 / 重新打包前同步」。
---

# 推送脚本到手机

将本地 `main.js` 同步到手机 AutoX.js v6 的打包目录,为重新打包 APK 做准备。**每次改完 `main.js`、想让新功能进打包 app 时用。**

## 步骤

1. **确认设备在线**(应看到 `vermeer`):
   ```bash
   adb devices
   ```

2. **推送**(中文路径必须 `LC_ALL=C`,否则报 illegal byte sequence):
   ```bash
   export LC_ALL=C
   adb push main.js '/sdcard/脚本/支付宝基金监控_release/main.js'
   ```

3. **验证**手机上文件已更新(`head -1` 应为 `"ui";`):
   ```bash
   adb shell "ls -la '/sdcard/脚本/支付宝基金监控_release/'" | tr -d '\r'
   adb shell "head -1 '/sdcard/脚本/支付宝基金监控_release/main.js'" | tr -d '\r'
   ```

4. **提示用户**:脚本已更新到手机 → 打开 AutoX.js v6 → 长按「支付宝基金监控_release」→ ⋮ →「打包应用」→ 生成新版 APK。

## 打包完成后(可选收尾)

```bash
export LC_ALL=C
adb pull '/sdcard/脚本/支付宝基金监控_release/'*.apk release/   # 拉回本地
adb install release/<新apk文件名>.apk                            # 装机
```

## 踩坑(都已验证)
- 中文路径:adb 命令前 `export LC_ALL=C`,输出 `| tr -d '\r'` 去回车;`tr`/`sed` 遇中文也会报 illegal byte sequence,务必先设 `LC_ALL=C`。
- `pm install /sdcard/x.apk` 会失败(Android FUSE/SELinux 禁止 system_server 读 /sdcard)。装机一律用 `adb install 本地.apk`。
- 打包出的 APK 自带 AutoX.js 运行时,装到任何手机都能跑;但运行后仍需手动开「无障碍服务」才能采集支付宝。
