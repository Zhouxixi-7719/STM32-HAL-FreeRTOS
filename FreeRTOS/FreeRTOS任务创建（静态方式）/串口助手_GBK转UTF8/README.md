# 串口助手 GBK → UTF-8 接收脚本

针对 **Serial Debug Assistant（串口调试助手，lgblog/lingguang）** 的「接收脚本」：
串口设备发来的是 **GBK/GB2312** 字节，窗口按 UTF-8 解码就成了乱码 —— 这些脚本把原始字节
按 GBK 解码成正确的文本，并且可以按 **UTF-8** 保存成文本文件、或转成 UTF-8 字节转发出去。

> 先说一句最省事的：如果只是想在窗口里看到正确的中文，其实**不用脚本** ——
> 在工具「设置 → 编码类型」里选 **GB2312** 就行了。需要用脚本的场景是：
> ① 不想改全局编码设置；② 要把收到的中文**以 UTF-8 存文件 / 转发**。

---

## 文件说明

| 文件 | 说明 |
| --- | --- |
| [gbk2utf8.js](gbk2utf8.js) | **推荐**。接收脚本，自带完整 GBK 码表，不依赖工具编码设置，任意设置下都能正确解码 |
| [gbk2utf8_lite.js](gbk2utf8_lite.js) | 精简版（约 100 行）。依赖工具编码设置为 GB2312，只做「已解好的文本 → UTF-8 存文件/转发」 |
| [tools/gbk2utf8.template.js](tools/gbk2utf8.template.js) | 主脚本的可读模板（码表位置是占位符） |
| [tools/gen_gbk_table.js](tools/gen_gbk_table.js) | 生成 GBK 码表 `tools/gbk_table.bin`（按 GBK 标准，与 V8/ICU `TextDecoder('gbk')` 完全一致） |
| [tools/check_vs_dotnet.ps1](tools/check_vs_dotnet.ps1) | 把码表和 Windows CP936（.NET）逐码位对照，证明两者兼容 |
| [tools/build.js](tools/build.js) | 把模板 + 码表装配成 `gbk2utf8.js` |
| [tools/verify.js](tools/verify.js) | 独立验证程序：全码位校验 + 模拟串口助手宿主做端到端测试（24 项检查） |
| [tools/demo.js](tools/demo.js) | 命令行小演示：把一段 GBK 十六进制喂给主脚本，打印窗口会显示的内容 |

---

## 一、主脚本 gbk2utf8.js 用法

1. 打开 **Js 编辑器 - 接收脚本** → 左上 `New script name` 里输入名字（例如 `GBK-UTF8`）→ 点 `+` 新建；
2. 把编辑器里的内容全选删除，粘贴 [gbk2utf8.js](gbk2utf8.js) 的**全部内容**（含末尾那一大段码表，约 84 KB）；
3. 点保存（磁盘图标）；
4. 回到主界面，**勾选「接收脚本」**，并**取消勾选十六进制显示**；
5. 接收窗口出现红色提示框 = 脚本已生效。此时收到 GBK 中文（例如 `温度: 25.6`）会显示成正确的中文。

> 提示：脚本写的是解码后的标准字符串，与工具的「编码类型」设置无关。
> 万一窗口里仍显示乱码，把「编码类型」改成 GB2312 再看一次即可（脚本行为不变）。

### 用户配置（脚本开头，改这几行就够了）

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `MODE` | `'gbk'` | `'gbk'` 按 GBK 解码；`'utf8'` 按 UTF-8 解码；`'auto'` 自动判断（整包是合法 UTF-8 就按 UTF-8，否则按 GBK） |
| `COLOR` | `'Green'` | 解码文本的显示颜色，如 `'Green'` / `'red'` / `'#FF00FF00'` |
| `CLEAR_RAW` | `true` | 先清掉工具自己显示的那一行乱码（`receive.clearLastReceived()`），窗口只留正确文本；不想让脚本动显示就改 `false` |
| `SHOW_HEX` | `false` | 额外显示一行原始 HEX |
| `SAVE_FILE` | `false` | 把解码结果**以 UTF-8 追加保存**到 `SAVE_PATH`（`file.appendText` 固定 UTF-8 写入） |
| `SAVE_PATH` | `D:\serial_gbk2utf8.log` | 保存路径 |
| `SEND_UTF8` | `false` | 把解码结果编成 **UTF-8 字节**从串口发出去（设备若有回显会造成死循环，谨慎开启） |

配置 `SAVE_FILE = true` 后，接收窗口里的中文会同时落到一个 **UTF-8 文本文件**里 ——
这正是「把 GBK 数据转换成 UTF-8 格式」最直接的用法。

---

## 二、精简版 gbk2utf8_lite.js

前置条件：工具「设置 → 编码类型」= **GB2312**。此时 `receive.get()` 返回的已经是正确中文，
脚本只负责转 UTF-8：`SAVE_FILE`（UTF-8 存文件）、`SEND_UTF8`（UTF-8 字节转发）、`ECHO`（是否回显）。

优点是脚本很短、开销几乎为零；缺点是**依赖工具的编码设置**，设置成 UTF-8 时中文依然是乱码。

---

## 三、它是怎么工作的

工具脚本 API（[脚本API介绍](https://lgblog.github.io/Help/zh-Hans/JsAPI.html)）里的 `util` **没有**字节 → 字符串的编码转换函数
（只有 `bytesToHexString` / `bytesToInteger` / `bytesTofloat` / `hexStringToBytes`），
而且引擎是 **V8 + 标准内置对象**（[帮助首页](https://lgblog.github.io/Help/zh-Hans/)），没有 `TextDecoder` 这种 Web API。
所以脚本自己带一张 GBK 码表：

* **双字节**：`0x81..0xFE` 作首字节、`0x40..0xFE`（跳过 `0x7F`）作尾字节，
  索引 `idx = (lead-0x81)*190 + (trail-0x40-(trail>0x7F?1:0))`，共 **23940** 个码位，每个 2 字节（UTF-16、小端）；
* **单字节**：`0x00..0xFF` 共 256 项（ASCII、`0x80` = `€`、以及未定义时输出 `U+FFFD`）；
* 码表用 base64 内嵌（64524 字符，ASCII 安全，不受脚本文件编码影响），
  第一次运行时解码成 `Uint8Array` 并缓存到 `globalThis.__GBK936_TABLE_V1__`，之后每帧只做纯查表；
* 解码结果直接交给 `receive.write()` 显示；另外提供 `utf8Encode()` 把字符串编成真正的 UTF-8 字节，
  供 `send.writeBytes()` 或 `file` 系列 API 使用。

---

## 四、验证结果

```powershell
node tools\gen_gbk_table.js        # 生成码表
node tools\build.js                # 装配 gbk2utf8.js
node tools\verify.js               # 24 项检查（退出码 0 = 全过）
powershell -File tools\check_vs_dotnet.ps1   # 与 Windows CP936 对照
node tools\demo.js C4E3BAC3A3ACCAC0BDE70D0A  # 演示：GBK 字节 -> 你好，世界
```

* **全码位校验**：23940 个双字节码位 + 256 个单字节取值，脚本的解码结果与 V8/ICU `TextDecoder('gbk')`
  （即 GBK 标准 / WHATWG 编码规范）**逐字节完全一致**；
* **与 Windows CP936(.NET) 对照**：23839 个码位完全相同，仅 **102 个旧码位**不同，
  且全部是「.NET 给私有区(PUA)码位、标准给真实字符」，例如
  `0xA2E3`：标准 `€`(U+20AC) vs .NET `U+E76C`；`0xA3A0`：标准全角空格 U+3000 vs .NET `U+E5E5`。
  码表按**标准**取值（私有区字符在窗口里只会显示成方块）；
* **端到端**：把 `gbk2utf8.js` 放进模拟的串口助手宿主（`receive` / `util` / `send` / `file` / `console`）
  实跑，检查显示文本、清屏调用、HEX 行、UTF-8 文件内容、UTF-8 转发字节、`auto` 模式同时对 GBK 与 UTF-8 生效；
* **UTF-8 编解码**：`utf8Encode` 与 `Buffer.from(str,'utf8')` 逐字节相同，`isValidUtf8` 拒绝全部 13 个非法样例；
* **性能**：706 字节 GBK 帧 → 每帧 **约 1 ms**（含脚本解析）；码表缓存后 **约 0.04 ms/帧**。

---

## 五、已知限制

* 只处理 **GBK/GB2312 的一、二字节**部分；**GB18030 的四字节**生僻字（如 𠀀，U+10000 以上）不支持；
* 不支持 Big5 / Shift-JIS（如需要，换一份码表即可，解码骨架可复用）；
* 一个汉字被拆在两帧里（首字节在上一帧）时，末尾会出现一个 `U+FFFD`；
  建议在工具里打开「自动断帧」，或把 `MODE` 改成 `'auto'` 观察；
* `receive.clearLastReceived()` 在 9.x 才有；旧版本里该调用失败会被 `try/catch` 忽略，
  效果是窗口中会同时保留工具自己显示的那一行（乱码行）；
* `SEND_UTF8 = true` 会让脚本在**接收**时发送数据，若设备有回显会形成回环，默认关闭。

---

## 六、参考

* 脚本 API（receive / send / chart / console / util / file）：<https://lgblog.github.io/Help/zh-Hans/JsAPI.html>
* 帮助首页（编码设置、V8 引擎、接收脚本执行时机）：<https://lgblog.github.io/Help/zh-Hans/>
* 官方示例（ASCII 与 HEX 同时显示）：<https://lgblog.github.io/pages/AsciiHexAllShow.html>
