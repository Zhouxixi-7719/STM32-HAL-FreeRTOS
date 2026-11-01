/* ===========================================================================
 *  串口调试助手 (Serial Debug Assistant) —— 接收脚本：GBK / GB2312  ->  UTF-8
 *  ---------------------------------------------------------------------------
 *  作用：串口收到的是 GBK(GB2312 / CP936) 编码的字节，而窗口按 UTF-8 解码，
 *        于是中文全是乱码。本脚本直接从"原始字节"按 GBK 码表解码成正确的
 *        Unicode 文本再写进显示窗口，因此不管工具里"编码类型"选的是什么
 *        (UTF-8 / GB2312 都一样)，中文都能正确显示。
 *        另外可选：以 UTF-8 保存成文本文件、转成 UTF-8 字节转发出去。
 *
 *  用法：脚本编辑器 -> New script name(例如 "GBK-UTF8") -> 粘贴本文件全部内容
 *         -> 保存 -> 勾选"接收脚本"复选框(接收窗口出现红色提示框 = 脚本已生效)。
 *
 *  自带完整 GBK(CP936) 码表：23940 个双字节码位 + 256 个单字节码位。
 *  码表按 GBK 标准生成(与 V8/ICU 的 gbk 解码逐码位完全一致)，并与 Windows
 *  CP936(.NET) 交叉校验过：仅 101 个双字节 + 1 个单字节旧码位不同(那些位置
 *  .NET 给的是私有区码点、标准给的是真实字符)，详见 tools/verify.js 与
 *  tools/check_vs_dotnet.ps1。脚本不需要联网，也不依赖工具里的编码设置。
 *
 *  脚本入口在文件最末尾的 run();（码表很长，放在文件尾部以免影响阅读）
 * ===========================================================================
 */
(function () {
    'use strict';

    // ========================= 用户配置 =========================
    var MODE = 'gbk';      // 'gbk'  = 按 GBK/GB2312 解码（默认）
                           // 'utf8' = 按 UTF-8 解码
                           // 'auto' = 自动判断：整包是合法 UTF-8 就按 UTF-8，否则按 GBK
    var COLOR = 'Green';   // 解码文本的显示颜色，如 'Green' / 'red' / '#FF00FF00'
    var CLEAR_RAW = true;  // true  = 先清掉工具自己显示的那一行乱码，窗口只留正确文本
                           //         (若工具"编码类型"已设为 GB2312，或不想让脚本改显示，改成 false)
    var SHOW_HEX = false;  // true  = 额外显示一行原始 HEX
    var SAVE_FILE = false; // true  = 把解码结果追加保存为 UTF-8 文本文件
    var SAVE_PATH = 'D:\\serial_gbk2utf8.log';
    var SEND_UTF8 = false; // true  = 把解码结果编成 UTF-8 字节发回串口
                           //         (注意：设备若有回显会造成死循环，默认关闭)
    // ===========================================================

    // ========================= 脚本主流程 =========================
    function run() {
        // ---------- 1. 取原始字节 ----------
        var bytes = receive.getBytes();
        if (bytes == null || bytes.length === 0) {
            return;
        }

        // ---------- 2. 解码：GBK 字节 -> Unicode 字符串 ----------
        var text = decodeBytes(bytes, MODE);

        // ---------- 3. 显示 ----------
        if (CLEAR_RAW) {
            // 工具会把它按自己编码设置解出来的乱码先显示出来，这里把它清掉
            try { receive.clearLastReceived(); } catch (e) { }
        }
        receive.write('\n');
        receive.write(text, COLOR);
        if (text.length === 0 || text.charAt(text.length - 1) !== '\n') {
            receive.write('\n');
        }
        if (SHOW_HEX) {
            receive.write('HEX -> ' + util.bytesToHexString(bytes, true) + '\n', 'Peru');
        }

        // ---------- 4. 可选：保存为 UTF-8 文本 ----------
        if (SAVE_FILE) {
            try {
                file.appendText(SAVE_PATH, text);   // 该 API 固定以 UTF-8 写入
            } catch (e) {
                console.error('save failed: ' + e);
            }
        }

        // ---------- 5. 可选：以 UTF-8 字节转发 ----------
        if (SEND_UTF8) {
            try {
                send.writeBytes(utf8Encode(text));
            } catch (e) {
                console.error('send failed: ' + e);
            }
        }
        return;
    }

    /* =======================================================================
     *                          下面是实现部分
     * ===================================================================== */

    function decodeBytes(buf, mode) {
        var n = buf.length;
        if (mode === 'utf8') {
            return decodeUtf8(buf, n);
        }
        if (mode === 'auto') {
            return isValidUtf8(buf, n) ? decodeUtf8(buf, n) : decodeGbk(buf, n);
        }
        return decodeGbk(buf, n);
    }

    // ---------------------- GBK(CP936) 解码 ----------------------
    var REPL = 0xFFFD;              // 未定义字节 -> U+FFFD
    var SINGLE_OFFSET = 47880;      // 单字节表在码表中的字节偏移

    function decodeGbk(buf, n) {
        var t = getGbkTable();
        var out = [];
        var i = 0, b, tr, idx, cu;
        while (i < n) {
            b = buf[i] & 0xFF;              // & 0xFF: Int8Array/普通数组也能正确取值
            if (b < 0x80) {                 // ASCII 直接输出
                out.push(b);
                i++;
                continue;
            }
            if (b >= 0x81 && b <= 0xFE && i + 1 < n) {
                tr = buf[i + 1] & 0xFF;
                if (tr >= 0x40 && tr <= 0xFE && tr !== 0x7F) {      // 合法双字节
                    idx = (b - 0x81) * 190 + (tr - 0x40 - (tr > 0x7F ? 1 : 0));
                    cu = t[idx * 2] | (t[idx * 2 + 1] << 8);
                    out.push(cu !== 0 ? cu : REPL);
                    i += 2;
                    continue;
                }
            }
            // 尾字节非法，或单个 0x80 / 0xA0 / 0xFF 等 -> 查单字节表
            cu = t[SINGLE_OFFSET + b * 2] | (t[SINGLE_OFFSET + b * 2 + 1] << 8);
            out.push(cu !== 0 ? cu : REPL);
            i++;
        }
        return codesToString(out);
    }

    // ---------------------- UTF-8 解码 / 校验 / 编码 ----------------------
    function decodeUtf8(buf, n) {
        var out = [];
        var i = 0, b, need = 0, cp = 0;
        while (i < n) {
            b = buf[i] & 0xFF;
            if (need === 0) {
                if (b < 0x80) { out.push(b); i++; continue; }
                if (b >= 0xC2 && b <= 0xDF) { cp = b & 0x1F; need = 1; }
                else if (b >= 0xE0 && b <= 0xEF) { cp = b & 0x0F; need = 2; }
                else if (b >= 0xF0 && b <= 0xF4) { cp = b & 0x07; need = 3; }
                else { out.push(REPL); i++; continue; }
                i++;
            } else if (b >= 0x80 && b <= 0xBF) {
                cp = (cp << 6) | (b & 0x3F);
                need--;
                i++;
                if (need === 0) {
                    if (cp > 0xFFFF) {          // 补充平面 -> 代理对
                        cp -= 0x10000;
                        out.push(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
                    } else {
                        out.push(cp);
                    }
                }
            } else {                            // 非法续字节：替换并重新同步
                out.push(REPL);
                need = 0;
                cp = 0;
            }
        }
        return codesToString(out);
    }

    // 严格校验：合法 UTF-8 且至少含一个多字节字符（纯 ASCII 交给 GBK 走也一样）
    function isValidUtf8(buf, n) {
        var i = 0, b, need = 0, cp = 0, min = 0, multi = 0;
        while (i < n) {
            b = buf[i] & 0xFF;
            if (need === 0) {
                if (b < 0x80) { i++; continue; }
                if (b >= 0xC2 && b <= 0xDF) { cp = b & 0x1F; need = 1; min = 0x80; }
                else if (b >= 0xE0 && b <= 0xEF) { cp = b & 0x0F; need = 2; min = 0x800; }
                else if (b >= 0xF0 && b <= 0xF4) { cp = b & 0x07; need = 3; min = 0x10000; }
                else { return false; }
                multi++;
                i++;
            } else {
                if (b < 0x80 || b > 0xBF) { return false; }
                cp = (cp << 6) | (b & 0x3F);
                need--;
                i++;
                if (need === 0) {
                    if (cp < min || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) {
                        return false;
                    }
                }
            }
        }
        return need === 0 && multi > 0;
    }

    // 字符串 -> UTF-8 字节数组（send.writeBytes 需要 Uint8Array）
    function utf8Encode(str) {
        var out = [];
        var i, c, d, cp;
        for (i = 0; i < str.length; i++) {
            c = str.charCodeAt(i);
            if (c < 0x80) {
                out.push(c);
            } else if (c < 0x800) {
                out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
            } else if (c >= 0xD800 && c <= 0xDBFF) {
                d = (i + 1 < str.length) ? str.charCodeAt(i + 1) : 0;
                if (d >= 0xDC00 && d <= 0xDFFF) {
                    cp = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00);
                    out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F),
                             0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
                    i++;
                } else {
                    out.push(0xEF, 0xBF, 0xBD);
                }
            } else if (c >= 0xDC00 && c <= 0xDFFF) {
                out.push(0xEF, 0xBF, 0xBD);
            } else {
                out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
            }
        }
        return new Uint8Array(out);
    }

    // 码位数组 -> 字符串（分块 fromCharCode，避免长包爆栈）
    function codesToString(codes) {
        var s = '';
        var step = 2048, k;
        for (k = 0; k < codes.length; k += step) {
            s += String.fromCharCode.apply(null, codes.slice(k, k + step));
        }
        return s;
    }

    // ---------------------- 码表：base64 -> Uint8Array（整个会话只解一次） ----------------------
    function getGbkTable() {
        var g = null;
        try { if (typeof globalThis !== 'undefined') { g = globalThis; } } catch (e) { g = null; }
        if (g && g.__GBK936_TABLE_V1__) {
            return g.__GBK936_TABLE_V1__;
        }
        var t = base64ToBytes(GBK_B64);
        if (g) {
            try { g.__GBK936_TABLE_V1__ = t; } catch (e) { }
        }
        return t;
    }

    function base64ToBytes(s) {
        var n = s.length;
        var out = new Uint8Array((n >> 2) * 3 + 3);
        var o = 0, acc = 0, bits = 0, i, v;
        for (i = 0; i < n; i++) {
            v = B64_MAP[s.charCodeAt(i) & 0xFF];
            if (v < 0) { continue; }        // 跳过换行、'=' 等
            acc = (acc << 6) | v;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out[o++] = (acc >> bits) & 0xFF;
            }
        }
        return o === out.length ? out : out.subarray(0, o);
    }

    var B64_MAP = (function () {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var m = new Int16Array(256);
        var i;
        for (i = 0; i < 256; i++) { m[i] = -1; }
        for (i = 0; i < 64; i++) { m[chars.charCodeAt(i)] = i; }
        return m;
    })();

    /* -----------------------------------------------------------------------
     * GBK(CP936) 码表，base64(小端 UTF-16，2 字节/项，0x0000 = 未定义)
     *   [0 .. 47879]     双字节区: lead 0x81..0xFE (126) x trail 0x40..0xFE
     *                    跳过 0x7F (190) = 23940 项
     *                    索引 = (lead-0x81)*190 + (trail-0x40-(trail>0x7F?1:0))
     *   [47880 .. 48391] 单字节区: 0x00..0xFF (256 项)
     * 下面这段由 tools/build.js 自动生成，请勿手工改动。
     * --------------------------------------------------------------------- */
    var GBK_B64 = /*@@GBK_TABLE_B64@@*/ '';

    run();
})();
