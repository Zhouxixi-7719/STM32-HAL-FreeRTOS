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
    var GBK_B64 = 'Ak4ETgVOBk4PThJOF04fTiBOIU4jTiZOKU4uTi9OMU4zTjVON048TkBOQU5CTkRORk5KTlFOVU5XTlpOW05iTmNOZE5lTmdOaE5qTmtObE5t' +
        'Tm5Ob05yTnROdU52TndOeE55TnpOe058Tn1Of06AToFOgk6DToROhU6HTopOkE6WTpdOmU6cTp1Onk6jTqpOr06wTrFOtE62TrdOuE65TrxO' +
        'vU6+TshOzE7PTtBO0k7aTttO3E7gTuJO5k7nTulO7U7uTu9O8U70TvhO+U76TvxO/k4ATwJPA08ETwVPBk8HTwhPC08MTxJPE08UTxVPFk8c' +
        'Tx1PIU8jTyhPKU8sTy1PLk8xTzNPNU83TzlPO08+Tz9PQE9BT0JPRE9FT0dPSE9JT0pPS09MT1JPVE9WT2FPYk9mT2hPak9rT21Pbk9xT3JP' +
        'dU93T3hPeU96T31PgE+BT4JPhU+GT4dPik+MT45PkE+ST5NPlU+WT5hPmU+aT5xPnk+fT6FPok+kT6tPrU+wT7FPsk+zT7RPtk+3T7hPuU+6' +
        'T7tPvE+9T75PwE/BT8JPxk/HT8hPyU/LT8xPzU/ST9NP1E/VT9ZP2U/bT+BP4k/kT+VP50/rT+xP8E/yT/RP9U/2T/dP+U/7T/xP/U//TwBQ' +
        'AVACUANQBFAFUAZQB1AIUAlQClALUA5QEFARUBNQFVAWUBdQG1AdUB5QIFAiUCNQJFAnUCtQL1AwUDFQMlAzUDRQNVA2UDdQOFA5UDtQPVA/' +
        'UEBQQVBCUERQRVBGUElQSlBLUE1QUFBRUFJQU1BUUFZQV1BYUFlQW1BdUF5QX1BgUGFQYlBjUGRQZlBnUGhQaVBqUGtQbVBuUG9QcFBxUHJQ' +
        'c1B0UHVQeFB5UHpQfFB9UIFQglCDUIRQhlCHUIlQilCLUIxQjlCPUJBQkVCSUJNQlFCVUJZQl1CYUJlQmlCbUJxQnVCeUJ9QoFChUKJQpFCm' +
        'UKpQq1CtUK5Qr1CwULFQs1C0ULVQtlC3ULhQuVC8UL1QvlC/UMBQwVDCUMNQxFDFUMZQx1DIUMlQylDLUMxQzVDOUNBQ0VDSUNNQ1FDVUNdQ' +
        '2FDZUNtQ3FDdUN5Q31DgUOFQ4lDjUORQ5VDoUOlQ6lDrUO9Q8FDxUPJQ9FD2UPdQ+FD5UPpQ/FD9UP5Q/1AAUQFRAlEDUQRRBVEIUQlRClEM' +
        'UQ1RDlEPURBREVETURRRFVEWURdRGFEZURpRG1EcUR1RHlEfUSBRIlEjUSRRJVEmUSdRKFEpUSpRK1EsUS1RLlEvUTBRMVEyUTNRNFE1UTZR' +
        'N1E4UTlROlE7UTxRPVE+UUJRR1FKUUxRTlFPUVBRUlFTUVdRWFFZUVtRXVFeUV9RYFFhUWNRZFFmUWdRaVFqUW9RclF6UX5Rf1GDUYRRhlGH' +
        'UYpRi1GOUY9RkFGRUZNRlFGYUZpRnVGeUZ9RoVGjUaZRp1GoUalRqlGtUa5RtFG4UblRulG+Ub9RwVHCUcNRxVHIUcpRzVHOUdBR0lHTUdRR' +
        '1VHWUddR2FHZUdpR3FHeUd9R4lHjUeVR5lHnUehR6VHqUexR7lHxUfJR9FH3Uf5RBFIFUglSC1IMUg9SEFITUhRSFVIcUh5SH1IhUiJSI1Il' +
        'UiZSJ1IqUixSL1IxUjJSNFI1UjxSPlJEUkVSRlJHUkhSSVJLUk5ST1JSUlNSVVJXUlhSWVJaUltSXVJfUmBSYlJjUmRSZlJoUmtSbFJtUm5S' +
        'cFJxUnNSdFJ1UnZSd1J4UnlSelJ7UnxSflKAUoNShFKFUoZSh1KJUopSi1KMUo1SjlKPUpFSklKUUpVSllKXUphSmVKaUpxSpFKlUqZSp1Ku' +
        'Uq9SsFK0UrVStlK3UrhSuVK6UrtSvFK9UsBSwVLCUsRSxVLGUshSylLMUs1SzlLPUtFS01LUUtVS11LZUtpS21LcUt1S3lLgUuFS4lLjUuVS' +
        '5lLnUuhS6VLqUutS7FLtUu5S71LxUvJS81L0UvVS9lL3UvhS+1L8Uv1SAVMCUwNTBFMHUwlTClMLUwxTDlMRUxJTE1MUUxhTG1McUx5TH1Mi' +
        'UyRTJVMnUyhTKVMrUyxTLVMvUzBTMVMyUzNTNFM1UzZTN1M4UzxTPVNAU0JTRFNGU0tTTFNNU1BTVFNYU1lTW1NdU2VTaFNqU2xTbVNyU3ZT' +
        'eVN7U3xTfVN+U4BTgVODU4dTiFOKU45Tj1OQU5FTklOTU5RTllOXU5lTm1OcU55ToFOhU6RTp1OqU6tTrFOtU69TsFOxU7JTs1O0U7VTt1O4' +
        'U7lTulO8U71TvlPAU8NTxFPFU8ZTx1POU89T0FPSU9NT1VPaU9xT3VPeU+FT4lPnU/RT+lP+U/9TAFQCVAVUB1QLVBRUGFQZVBpUHFQiVCRU' +
        'JVQqVDBUM1Q2VDdUOlQ9VD9UQVRCVERURVRHVElUTFRNVE5UT1RRVFpUXVReVF9UYFRhVGNUZVRnVGlUalRrVGxUbVRuVG9UcFR0VHlUelR+' +
        'VH9UgVSDVIVUh1SIVIlUilSNVJFUk1SXVJhUnFSeVJ9UoFShVKJUpVSuVLBUslS1VLZUt1S5VLpUvFS+VMNUxVTKVMtU1lTYVNtU4FThVOJU' +
        '41TkVOtU7FTvVPBU8VT0VPVU9lT3VPhU+VT7VP5UAFUCVQNVBFUFVQhVClULVQxVDVUOVRJVE1UVVRZVF1UYVRlVGlUcVR1VHlUfVSFVJVUm' +
        'VShVKVUrVS1VMlU0VTVVNlU4VTlVOlU7VT1VQFVCVUVVR1VIVUtVTFVNVU5VT1VRVVJVU1VUVVdVWFVZVVpVW1VdVV5VX1VgVWJVY1VoVWlV' +
        'a1VvVXBVcVVyVXNVdFV5VXpVfVV/VYVVhlWMVY1VjlWQVZJVk1WVVZZVl1WaVZtVnlWgVaFVolWjVaRVpVWmVahVqVWqVatVrFWtVa5Vr1Ww' +
        'VbJVtFW2VbhVulW8Vb9VwFXBVcJVw1XGVcdVyFXKVctVzlXPVdBV1VXXVdhV2VXaVdtV3lXgVeJV51XpVe1V7lXwVfFV9FX2VfhV+VX6VftV' +
        '/FX/VQJWA1YEVgVWBlYHVgpWC1YNVhBWEVYSVhNWFFYVVhZWF1YZVhpWHFYdViBWIVYiViVWJlYoVilWKlYrVi5WL1YwVjNWNVY3VjhWOlY8' +
        'Vj1WPlZAVkFWQlZDVkRWRVZGVkdWSFZJVkpWS1ZPVlBWUVZSVlNWVVZWVlpWW1ZdVl5WX1ZgVmFWY1ZlVmZWZ1ZtVm5Wb1ZwVnJWc1Z0VnVW' +
        'd1Z4VnlWelZ9Vn5Wf1aAVoFWglaDVoRWh1aIVolWilaLVoxWjVaQVpFWklaUVpVWllaXVphWmVaaVptWnFadVp5Wn1agVqFWolakVqVWplan' +
        'VqhWqVaqVqtWrFatVq5WsFaxVrJWs1a0VrVWtla4VrlWula7Vr1Wvla/VsBWwVbCVsNWxFbFVsZWx1bIVslWy1bMVs1WzlbPVtBW0VbSVtNW' +
        '1VbWVthW2VbcVuNW5VbmVudW6FbpVupW7FbuVu9W8lbzVvZW91b4VvtW/FYAVwFXAlcFVwdXC1cMVw1XDlcPVxBXEVcSVxNXFFcVVxZXF1cY' +
        'VxlXGlcbVx1XHlcgVyFXIlckVyVXJlcnVytXMVcyVzRXNVc2VzdXOFc8Vz1XP1dBV0NXRFdFV0ZXSFdJV0tXUldTV1RXVVdWV1hXWVdiV2NX' +
        'ZVdnV2xXbldwV3FXcld0V3VXeFd5V3pXfVd+V39XgFeBV4dXiFeJV4pXjVeOV49XkFeRV5RXlVeWV5dXmFeZV5pXnFedV55Xn1elV6hXqles' +
        'V69XsFexV7NXtVe2V7dXuVe6V7tXvFe9V75Xv1fAV8FXxFfFV8ZXx1fIV8lXylfMV81X0FfRV9NX1lfXV9tX3FfeV+FX4lfjV+VX5lfnV+hX' +
        '6VfqV+tX7FfuV/BX8VfyV/NX9Vf2V/dX+1f8V/5X/1cBWANYBFgFWAhYCVgKWAxYDlgPWBBYElgTWBRYFlgXWBhYGlgbWBxYHVgfWCJYI1gl' +
        'WCZYJ1goWClYK1gsWC1YLlgvWDFYMlgzWDRYNlg3WDhYOVg6WDtYPFg9WD5YP1hAWEFYQlhDWEVYRlhHWEhYSVhKWEtYTlhPWFBYUlhTWFVY' +
        'VlhXWFlYWlhbWFxYXVhfWGBYYVhiWGNYZFhmWGdYaFhpWGpYbVhuWG9YcFhxWHJYc1h0WHVYdlh3WHhYeVh6WHtYfFh9WH9YgliEWIZYh1iI' +
        'WIpYi1iMWI1YjliPWJBYkViUWJVYlliXWJhYm1icWJ1YoFihWKJYo1ikWKVYplinWKpYq1isWK1YrlivWLBYsViyWLNYtFi1WLZYt1i4WLlY' +
        'uli7WL1Yvli/WMBYwljDWMRYxljHWMhYyVjKWMtYzFjNWM5Yz1jQWNJY01jUWNZY11jYWNlY2ljbWNxY3VjeWN9Y4FjhWOJY41jlWOZY51jo' +
        'WOlY6ljtWO9Y8VjyWPRY9Vj3WPhY+lj7WPxY/Vj+WP9YAFkBWQNZBVkGWQhZCVkKWQtZDFkOWRBZEVkSWRNZF1kYWRtZHVkeWSBZIVkiWSNZ' +
        'JlkoWSxZMFkyWTNZNVk2WTtZPVk+WT9ZQFlDWUVZRllKWUxZTVlQWVJZU1lZWVtZXFldWV5ZX1lhWWNZZFlmWWdZaFlpWWpZa1lsWW1Zbllv' +
        'WXBZcVlyWXVZd1l6WXtZfFl+WX9ZgFmFWYlZi1mMWY5Zj1mQWZFZlFmVWZhZmlmbWZxZnVmfWaBZoVmiWaZZp1msWa1ZsFmxWbNZtFm1WbZZ' +
        't1m4WbpZvFm9Wb9ZwFnBWcJZw1nEWcVZx1nIWclZzFnNWc5Zz1nVWdZZ2VnbWd5Z31ngWeFZ4lnkWeZZ51npWepZ61ntWe5Z71nwWfFZ8lnz' +
        'WfRZ9Vn2WfdZ+Fn6WfxZ/Vn+WQBaAloKWgtaDVoOWg9aEFoSWhRaFVoWWhdaGVoaWhtaHVoeWiFaIlokWiZaJ1ooWipaK1osWi1aLlovWjBa' +
        'M1o1WjdaOFo5WjpaO1o9Wj5aP1pBWkJaQ1pEWkVaR1pIWktaTFpNWk5aT1pQWlFaUlpTWlRaVlpXWlhaWVpbWlxaXVpeWl9aYFphWmNaZFpl' +
        'WmZaaFppWmtabFptWm5ab1pwWnFaclpzWnhaeVp7WnxafVp+WoBagVqCWoNahFqFWoZah1qIWolailqLWoxajVqOWo9akFqRWpNalFqVWpZa' +
        'l1qYWplanFqdWp5an1qgWqFaolqjWqRapVqmWqdaqFqpWqtarFqtWq5ar1qwWrFatFq2WrdauVq6WrtavFq9Wr9awFrDWsRaxVrGWsdayFrK' +
        'WstazVrOWs9a0FrRWtNa1VrXWtla2lrbWt1a3lrfWuJa5FrlWuda6FrqWuxa7VruWu9a8FryWvNa9Fr1WvZa91r4Wvla+lr7Wvxa/Vr+Wv9a' +
        'AFsBWwJbA1sEWwVbBlsHWwhbClsLWwxbDVsOWw9bEFsRWxJbE1sUWxVbGFsZWxpbG1scWx1bHlsfWyBbIVsiWyNbJFslWyZbJ1soWylbKlsr' +
        'WyxbLVsuWy9bMFsxWzNbNVs2WzhbOVs6WztbPFs9Wz5bP1tBW0JbQ1tEW0VbRltHW0hbSVtKW0tbTFtNW05bT1tSW1ZbXltgW2FbZ1toW2tb' +
        'bVtuW29bclt0W3Zbd1t4W3lbe1t8W35bf1uCW4ZbiluNW45bkFuRW5JblFuWW59bp1uoW6lbrFutW65br1uxW7Jbt1u6W7tbvFvAW8Fbw1vI' +
        'W8lbylvLW81bzlvPW9Fb1FvVW9Zb11vYW9lb2lvbW9xb4FviW+Nb5lvnW+lb6lvrW+xb7VvvW/Fb8lvzW/Rb9Vv2W/db/Vv+WwBcAlwDXAVc' +
        'B1wIXAtcDFwNXA5cEFwSXBNcF1wZXBtcHlwfXCBcIVwjXCZcKFwpXCpcK1wtXC5cL1wwXDJcM1w1XDZcN1xDXERcRlxHXExcTVxSXFNcVFxW' +
        'XFdcWFxaXFtcXFxdXF9cYlxkXGdcaFxpXGpca1xsXG1ccFxyXHNcdFx1XHZcd1x4XHtcfFx9XH5cgFyDXIRchVyGXIdciVyKXItcjlyPXJJc' +
        'k1yVXJ1cnlyfXKBcoVykXKVcplynXKhcqlyuXK9csFyyXLRctly5XLpcu1y8XL5cwFzCXMNcxVzGXMdcyFzJXMpczFzNXM5cz1zQXNFc01zU' +
        'XNVc1lzXXNhc2lzbXNxc3VzeXN9c4FziXONc51zpXOtc7FzuXO9c8VzyXPNc9Fz1XPZc91z4XPlc+lz8XP1c/lz/XABdAV0EXQVdCF0JXQpd' +
        'C10MXQ1dD10QXRFdEl0TXRVdF10YXRldGl0cXR1dH10gXSFdIl0jXSVdKF0qXStdLF0vXTBdMV0yXTNdNV02XTddOF05XTpdO108XT9dQF1B' +
        'XUJdQ11EXUVdRl1IXUldTV1OXU9dUF1RXVJdU11UXVVdVl1XXVldWl1cXV5dX11gXWFdYl1jXWRdZV1mXWddaF1qXW1dbl1wXXFdcl1zXXVd' +
        'dl13XXhdeV16XXtdfF19XX5df12AXYFdg12EXYVdhl2HXYhdiV2KXYtdjF2NXY5dj12QXZFdkl2TXZRdlV2WXZddmF2aXZtdnF2eXZ9doF2h' +
        'XaJdo12kXaVdpl2nXahdqV2qXatdrF2tXa5dr12wXbFdsl2zXbRdtV22XbhduV26XbtdvF29Xb5dv13AXcFdwl3DXcRdxl3HXchdyV3KXctd' +
        'zF3OXc9d0F3RXdJd013UXdVd1l3XXdhd2V3aXdxd313gXeNd5F3qXexd7V3wXfVd9l34Xfld+l37Xfxd/10AXgReB14JXgpeC14NXg5eEl4T' +
        'XhdeHl4fXiBeIV4iXiNeJF4lXiheKV4qXiteLF4vXjBeMl4zXjReNV42XjleOl4+Xj9eQF5BXkNeRl5HXkheSV5KXkteTV5OXk9eUF5RXlJe' +
        'U15WXldeWF5ZXlpeXF5dXl9eYF5jXmReZV5mXmdeaF5pXmpea15sXm1ebl5vXnBecV51XndeeV5+XoFegl6DXoVeiF6JXoxejV6OXpJemF6b' +
        'Xp1eoV6iXqNepF6oXqleql6rXqxerl6vXrBesV6yXrReul67XrxevV6/XsBewV7CXsNexF7FXsZex17IXstezF7NXs5ez17QXtRe1V7XXthe' +
        '2V7aXtxe3V7eXt9e4F7hXuJe417kXuVe5l7nXule617sXu1e7l7vXvBe8V7yXvNe9V74Xvle+178Xv1eBV8GXwdfCV8MXw1fDl8QXxJfFF8W' +
        'XxlfGl8cXx1fHl8hXyJfI18kXyhfK18sXy5fMF8yXzNfNF81XzZfN184XztfPV8+Xz9fQV9CX0NfRF9FX0ZfR19IX0lfSl9LX0xfTV9OX09f' +
        'UV9UX1lfWl9bX1xfXl9fX2BfY19lX2dfaF9rX25fb19yX3RfdV92X3hfel99X35ff1+DX4ZfjV+OX49fkV+TX5Rfll+aX5tfnV+eX59foF+i' +
        'X6NfpF+lX6Zfp1+pX6tfrF+vX7BfsV+yX7NftF+2X7hfuV+6X7tfvl+/X8BfwV/CX8dfyF/KX8tfzl/TX9Rf1V/aX9tf3F/eX99f4l/jX+Vf' +
        '5l/oX+lf7F/vX/Bf8l/zX/Rf9l/3X/lf+l/8XwdgCGAJYAtgDGAQYBFgE2AXYBhgGmAeYB9gImAjYCRgLGAtYC5gMGAxYDJgM2A0YDZgN2A4' +
        'YDlgOmA9YD5gQGBEYEVgRmBHYEhgSWBKYExgTmBPYFFgU2BUYFZgV2BYYFtgXGBeYF9gYGBhYGVgZmBuYHFgcmB0YHVgd2B+YIBggWCCYIVg' +
        'hmCHYIhgimCLYI5gj2CQYJFgk2CVYJdgmGCZYJxgnmChYKJgpGClYKdgqWCqYK5gsGCzYLVgtmC3YLlgumC9YL5gv2DAYMFgwmDDYMRgx2DI' +
        'YMlgzGDNYM5gz2DQYNJg02DUYNZg12DZYNtg3mDhYOJg42DkYOVg6mDxYPJg9WD3YPhg+2D8YP1g/mD/YAJhA2EEYQVhB2EKYQthDGEQYRFh' +
        'EmETYRRhFmEXYRhhGWEbYRxhHWEeYSFhImElYShhKWEqYSxhLWEuYS9hMGExYTJhM2E0YTVhNmE3YThhOWE6YTthPGE9YT5hQGFBYUJhQ2FE' +
        'YUVhRmFHYUlhS2FNYU9hUGFSYVNhVGFWYVdhWGFZYVphW2FcYV5hX2FgYWFhY2FkYWVhZmFpYWpha2FsYW1hbmFvYXFhcmFzYXRhdmF4YXlh' +
        'emF7YXxhfWF+YX9hgGGBYYJhg2GEYYVhhmGHYYhhiWGKYYxhjWGPYZBhkWGSYZNhlWGWYZdhmGGZYZphm2GcYZ5hn2GgYaFhomGjYaRhpWGm' +
        'Yaphq2GtYa5hr2GwYbFhsmGzYbRhtWG2YbhhuWG6YbthvGG9Yb9hwGHBYcNhxGHFYcZhx2HJYcxhzWHOYc9h0GHTYdVh1mHXYdhh2WHaYdth' +
        '3GHdYd5h32HgYeFh4mHjYeRh5WHnYehh6WHqYeth7GHtYe5h72HwYfFh8mHzYfRh9mH3Yfhh+WH6Yfth/GH9Yf5hAGIBYgJiA2IEYgViB2IJ' +
        'YhNiFGIZYhxiHWIeYiBiI2ImYidiKGIpYitiLWIvYjBiMWIyYjViNmI4YjliOmI7YjxiQmJEYkViRmJKYk9iUGJVYlZiV2JZYlpiXGJdYl5i' +
        'X2JgYmFiYmJkYmViaGJxYnJidGJ1YndieGJ6YntifWKBYoJig2KFYoZih2KIYotijGKNYo5ij2KQYpRimWKcYp1inmKjYqZip2KpYqpirWKu' +
        'Yq9isGKyYrNitGK2YrdiuGK6Yr5iwGLBYsNiy2LPYtFi1WLdYt5i4GLhYuRi6mLrYvBi8mL1Yvhi+WL6YvtiAGMDYwRjBWMGYwpjC2MMYw1j' +
        'D2MQYxJjE2MUYxVjF2MYYxljHGMmYydjKWMsYy1jLmMwYzFjM2M0YzVjNmM3YzhjO2M8Yz5jP2NAY0FjRGNHY0hjSmNRY1JjU2NUY1ZjV2NY' +
        'Y1ljWmNbY1xjXWNgY2RjZWNmY2hjamNrY2xjb2NwY3Jjc2N0Y3VjeGN5Y3xjfWN+Y39jgWODY4RjhWOGY4tjjWORY5NjlGOVY5djmWOaY5tj' +
        'nGOdY55jn2OhY6RjpmOrY69jsWOyY7VjtmO5Y7tjvWO/Y8BjwWPCY8NjxWPHY8hjymPLY8xj0WPTY9Rj1WPXY9hj2WPaY9tj3GPdY99j4mPk' +
        'Y+Vj5mPnY+hj62PsY+5j72PwY/Fj82P1Y/dj+WP6Y/tj/GP+YwNkBGQGZAdkCGQJZApkDWQOZBFkEmQVZBZkF2QYZBlkGmQdZB9kImQjZCRk' +
        'JWQnZChkKWQrZC5kL2QwZDFkMmQzZDVkNmQ3ZDhkOWQ7ZDxkPmRAZEJkQ2RJZEtkTGRNZE5kT2RQZFFkU2RVZFZkV2RZZFpkW2RcZF1kX2Rg' +
        'ZGFkYmRjZGRkZWRmZGhkamRrZGxkbmRvZHBkcWRyZHNkdGR1ZHZkd2R7ZHxkfWR+ZH9kgGSBZINkhmSIZIlkimSLZIxkjWSOZI9kkGSTZJRk' +
        'l2SYZJpkm2ScZJ1kn2SgZKFkomSjZKVkpmSnZKhkqmSrZK9ksWSyZLNktGS2ZLlku2S9ZL5kv2TBZMNkxGTGZMdkyGTJZMpky2TMZM9k0WTT' +
        'ZNRk1WTWZNlk2mTbZNxk3WTfZOBk4WTjZOVk52ToZOlk6mTrZOxk7WTuZO9k8GTxZPJk82T0ZPVk9mT3ZPhk+WT6ZPtk/GT9ZP5k/2QBZQJl' +
        'A2UEZQVlBmUHZQhlCmULZQxlDWUOZQ9lEGURZRNlFGUVZRZlF2UZZRplG2UcZR1lHmUfZSBlIWUiZSNlJGUmZSdlKGUpZSplLGUtZTBlMWUy' +
        'ZTNlN2U6ZTxlPWVAZUFlQmVDZURlRmVHZUplS2VNZU5lUGVSZVNlVGVXZVhlWmVcZV9lYGVhZWRlZWVnZWhlaWVqZW1lbmVvZXFlc2V1ZXZl' +
        'eGV5ZXple2V8ZX1lfmV/ZYBlgWWCZYNlhGWFZYZliGWJZYpljWWOZY9lkmWUZZVllmWYZZplnWWeZaBlomWjZaZlqGWqZaxlrmWxZbJls2W0' +
        'ZbVltmW3ZbhlumW7Zb5lv2XAZcJlx2XIZcllymXNZdBl0WXTZdRl1WXYZdll2mXbZdxl3WXeZd9l4WXjZeRl6mXrZfJl82X0ZfVl+GX5Zftl' +
        '/GX9Zf5l/2UBZgRmBWYHZghmCWYLZg1mEGYRZhJmFmYXZhhmGmYbZhxmHmYhZiJmI2YkZiZmKWYqZitmLGYuZjBmMmYzZjdmOGY5ZjpmO2Y9' +
        'Zj9mQGZCZkRmRWZGZkdmSGZJZkpmTWZOZlBmUWZYZllmW2ZcZl1mXmZgZmJmY2ZlZmdmaWZqZmtmbGZtZnFmcmZzZnVmeGZ5ZntmfGZ9Zn9m' +
        'gGaBZoNmhWaGZohmiWaKZotmjWaOZo9mkGaSZpNmlGaVZphmmWaaZptmnGaeZp9moGahZqJmo2akZqVmpmapZqpmq2asZq1mr2awZrFmsmaz' +
        'ZrVmtma3Zrhmuma7ZrxmvWa/ZsBmwWbCZsNmxGbFZsZmx2bIZslmymbLZsxmzWbOZs9m0GbRZtJm02bUZtVm1mbXZthm2mbeZt9m4GbhZuJm' +
        '42bkZuVm52boZupm62bsZu1m7mbvZvFm9Wb2Zvhm+mb7Zv1mAWcCZwNnBGcFZwZnB2cMZw5nD2cRZxJnE2cWZxhnGWcaZxxnHmcgZyFnImcj' +
        'ZyRnJWcnZylnLmcwZzJnM2c2ZzdnOGc5ZztnPGc+Zz9nQWdEZ0VnR2dKZ0tnTWdSZ1RnVWdXZ1hnWWdaZ1tnXWdiZ2NnZGdmZ2dna2dsZ25n' +
        'cWd0Z3ZneGd5Z3pne2d9Z4BngmeDZ4VnhmeIZ4pnjGeNZ45nj2eRZ5Jnk2eUZ5ZnmWebZ59noGehZ6RnpmepZ6xnrmexZ7JntGe5Z7pnu2e8' +
        'Z71nvme/Z8BnwmfFZ8Znx2fIZ8lnymfLZ8xnzWfOZ9Vn1mfXZ9tn32fhZ+Nn5GfmZ+dn6GfqZ+tn7WfuZ/Jn9Wf2Z/dn+Gf5Z/pn+2f8Z/5n' +
        'AWgCaANoBGgGaA1oEGgSaBRoFWgYaBloGmgbaBxoHmgfaCBoImgjaCRoJWgmaCdoKGgraCxoLWguaC9oMGgxaDRoNWg2aDpoO2g/aEdoS2hN' +
        'aE9oUmhWaFdoWGhZaFpoW2hcaF1oXmhfaGpobGhtaG5ob2hwaHFocmhzaHVoeGh5aHpoe2h8aH1ofmh/aIBogmiEaIdoiGiJaIpoi2iMaI1o' +
        'jmiQaJFokmiUaJVolmiYaJlommibaJxonWieaJ9ooGihaKNopGilaKloqmiraKxormixaLJotGi2aLdouGi5aLpou2i8aL1ovmi/aMFow2jE' +
        'aMVoxmjHaMhoymjMaM5oz2jQaNFo02jUaNZo12jZaNto3GjdaN5o32jhaOJo5GjlaOZo52joaOlo6mjraOxo7WjvaPJo82j0aPZo92j4aPto' +
        '/Wj+aP9oAGkCaQNpBGkGaQdpCGkJaQppDGkPaRFpE2kUaRVpFmkXaRhpGWkaaRtpHGkdaR5pIWkiaSNpJWkmaSdpKGkpaSppK2ksaS5pL2kx' +
        'aTJpM2k1aTZpN2k4aTppO2k8aT5pQGlBaUNpRGlFaUZpR2lIaUlpSmlLaUxpTWlOaU9pUGlRaVJpU2lVaVZpWGlZaVtpXGlfaWFpYmlkaWVp' +
        'Z2loaWlpamlsaW1pb2lwaXJpc2l0aXVpdml6aXtpfWl+aX9pgWmDaYVpimmLaYxpjmmPaZBpkWmSaZNplmmXaZlpmmmdaZ5pn2mgaaFpommj' +
        'aaRppWmmaalpqmmsaa5pr2mwabJps2m1abZpuGm5abppvGm9ab5pv2nAacJpw2nEacVpxmnHachpyWnLac1pz2nRadJp02nVadZp12nYadlp' +
        '2mncad1p3mnhaeJp42nkaeVp5mnnaehp6Wnqaetp7Gnuae9p8GnxafNp9Gn1afZp92n4aflp+mn7afxp/mkAagFqAmoDagRqBWoGagdqCGoJ' +
        'agtqDGoNag5qD2oQahFqEmoTahRqFWoWahlqGmobahxqHWoeaiBqImojaiRqJWomaidqKWoraixqLWouajBqMmozajRqNmo3ajhqOWo6ajtq' +
        'PGo/akBqQWpCakNqRWpGakhqSWpKaktqTGpNak5qT2pRalJqU2pUalVqVmpXalpqXGpdal5qX2pgamJqY2pkamZqZ2poamlqampramxqbWpu' +
        'am9qcGpyanNqdGp1anZqd2p4anpqe2p9an5qf2qBaoJqg2qFaoZqh2qIaolqimqLaoxqjWqPapJqk2qUapVqlmqYaplqmmqbapxqnWqeap9q' +
        'oWqiaqNqpGqlaqZqp2qoaqpqrWquaq9qsGqxarJqs2q0arVqtmq3arhquWq6artqvGq9ar5qv2rAasFqwmrDasRqxWrGasdqyGrJaspqy2rM' +
        'as1qzmrPatBq0WrSatNq1GrVatZq12rYatlq2mrbatxq3Wreat9q4GrhauJq42rkauVq5mrnauhq6Wrqautq7Grtau5q72rwavFq8mrzavRq' +
        '9Wr2avdq+Gr5avpq+2r8av1q/mr/agBrAWsCawNrBGsFawZrB2sIawlrCmsLawxrDWsOaw9rEGsRaxJrE2sUaxVrFmsXaxhrGWsaaxtrHGsd' +
        'ax5rH2slayZrKGspayprK2ssay1rLmsvazBrMWszazRrNWs2azhrO2s8az1rP2tAa0FrQmtEa0VrSGtKa0trTWtOa09rUGtRa1JrU2tUa1Vr' +
        'VmtXa1hrWmtba1xrXWtea19rYGtha2hraWtra2xrbWtua29rcGtxa3Jrc2t0a3Vrdmt3a3hremt9a35rf2uAa4VriGuMa45rj2uQa5FrlGuV' +
        'a5drmGuZa5xrnWuea59roGuia6NrpGula6Zrp2uoa6lrq2usa61rrmuva7BrsWuya7ZruGu5a7pru2u8a71rvmvAa8NrxGvGa8dryGvJa8pr' +
        'zGvOa9Br0WvYa9pr3Gvda95r32vga+Jr42vka+Vr5mvna+hr6Wvsa+1r7mvwa/Fr8mv0a/Zr92v4a/pr+2v8a/5r/2sAbAFsAmwDbARsCGwJ' +
        'bApsC2wMbA5sEmwXbBxsHWwebCBsI2wlbCtsLGwtbDFsM2w2bDdsOWw6bDtsPGw+bD9sQ2xEbEVsSGxLbExsTWxObE9sUWxSbFNsVmxYbFls' +
        'WmxibGNsZWxmbGdsa2xsbG1sbmxvbHFsc2x1bHdseGx6bHtsfGx/bIBshGyHbIpsi2yNbI5skWySbJVslmyXbJhsmmycbJ1snmygbKJsqGys' +
        'bK9ssGy0bLVstmy3bLpswGzBbMJsw2zGbMdsyGzLbM1szmzPbNFs0mzYbNls2mzcbN1s32zkbOZs52zpbOxs7WzybPRs+Wz/bABtAm0DbQVt' +
        'Bm0IbQltCm0NbQ9tEG0RbRNtFG0VbRZtGG0cbR1tH20gbSFtIm0jbSRtJm0obSltLG0tbS9tMG00bTZtN204bTptP21AbUJtRG1JbUxtUG1V' +
        'bVZtV21YbVttXW1fbWFtYm1kbWVtZ21obWttbG1tbXBtcW1ybXNtdW12bXltem17bX1tfm1/bYBtgW2DbYRthm2HbYpti22NbY9tkG2SbZZt' +
        'l22YbZltmm2cbaJtpW2sba1tsG2xbbNttG22bbdtuW26bbttvG29bb5twW3CbcNtyG3JbcptzW3Obc9t0G3SbdNt1G3Vbddt2m3bbdxt323i' +
        'beNt5W3nbeht6W3qbe1t723wbfJt9G31bfZt+G36bf1t/m3/bQBuAW4CbgNuBG4GbgduCG4JbgtuD24SbhNuFW4YbhluG24cbh5uH24ibiZu' +
        'J24obipuLG4ubjBuMW4zbjVuNm43bjluO248bj1uPm4/bkBuQW5CbkVuRm5HbkhuSW5KbktuTG5PblBuUW5SblVuV25ZblpuXG5dbl5uYG5h' +
        'bmJuY25kbmVuZm5nbmhuaW5qbmxubW5vbnBucW5ybnNudG51bnZud254bnluem57bnxufW6AboFugm6EboduiG6KbotujG6Nbo5ukW6SbpNu' +
        'lG6VbpZul26Zbppum26dbp5uoG6hbqNupG6mbqhuqW6rbqxurW6ubrBus261brhuuW68br5uv27AbsNuxG7FbsZuyG7JbspuzG7Nbs5u0G7S' +
        'btZu2G7Zbttu3G7dbuNu527qbutu7G7tbu5u727wbvFu8m7zbvVu9m73bvhu+m77bvxu/W7+bv9uAG8BbwNvBG8FbwdvCG8KbwtvDG8Nbw5v' +
        'EG8RbxJvFm8XbxhvGW8abxtvHG8dbx5vH28hbyJvI28lbyZvJ28obyxvLm8wbzJvNG81bzdvOG85bzpvO288bz1vP29Ab0FvQm9Db0RvRW9I' +
        'b0lvSm9Mb05vT29Qb1FvUm9Tb1RvVW9Wb1dvWW9ab1tvXW9fb2BvYW9jb2RvZW9nb2hvaW9qb2tvbG9vb3BvcW9zb3Vvdm93b3lve299b35v' +
        'f2+Ab4Fvgm+Db4Vvhm+Hb4pvi2+Pb5BvkW+Sb5NvlG+Vb5Zvl2+Yb5lvmm+bb51vnm+fb6Bvom+jb6RvpW+mb6hvqW+qb6tvrG+tb65vr2+w' +
        'b7Fvsm+0b7Vvt2+4b7pvu2+8b71vvm+/b8Fvw2/Eb8Vvxm/Hb8hvym/Lb8xvzW/Ob89v0G/Tb9Rv1W/Wb9dv2G/Zb9pv22/cb91v32/ib+Nv' +
        '5G/lb+Zv52/ob+lv6m/rb+xv7W/wb/Fv8m/zb/Rv9W/2b/dv+G/5b/pv+2/8b/1v/m//bwBwAXACcANwBHAFcAZwB3AIcAlwCnALcAxwDXAO' +
        'cA9wEHAScBNwFHAVcBZwF3AYcBlwHHAdcB5wH3AgcCFwInAkcCVwJnAncChwKXAqcCtwLHAtcC5wL3AwcDFwMnAzcDRwNnA3cDhwOnA7cDxw' +
        'PXA+cD9wQHBBcEJwQ3BEcEVwRnBHcEhwSXBKcEtwTXBOcFBwUXBScFNwVHBVcFZwV3BYcFlwWnBbcFxwXXBfcGBwYXBicGNwZHBlcGZwZ3Bo' +
        'cGlwanBucHFwcnBzcHRwd3B5cHpwe3B9cIFwgnCDcIRwhnCHcIhwi3CMcI1wj3CQcJFwk3CXcJhwmnCbcJ5wn3CgcKFwonCjcKRwpXCmcKdw' +
        'qHCpcKpwsHCycLRwtXC2cLpwvnC/cMRwxXDGcMdwyXDLcMxwzXDOcM9w0HDRcNJw03DUcNVw1nDXcNpw3HDdcN5w4HDhcOJw43DlcOpw7nDw' +
        'cPFw8nDzcPRw9XD2cPhw+nD7cPxw/nD/cABxAXECcQNxBHEFcQZxB3EIcQtxDHENcQ5xD3ERcRJxFHEXcRtxHHEdcR5xH3EgcSFxInEjcSRx' +
        'JXEncShxKXEqcStxLHEtcS5xMnEzcTRxNXE3cThxOXE6cTtxPHE9cT5xP3FAcUFxQnFDcURxRnFHcUhxSXFLcU1xT3FQcVFxUnFTcVRxVXFW' +
        'cVdxWHFZcVpxW3FdcV9xYHFhcWJxY3FlcWlxanFrcWxxbXFvcXBxcXF0cXVxdnF3cXlxe3F8cX5xf3GAcYFxgnGDcYVxhnGHcYhxiXGLcYxx' +
        'jXGOcZBxkXGScZNxlXGWcZdxmnGbcZxxnXGecaFxonGjcaRxpXGmcadxqXGqcatxrXGuca9xsHGxcbJxtHG2cbdxuHG6cbtxvHG9cb5xv3HA' +
        'ccFxwnHEccVxxnHHcchxyXHKcctxzHHNcc9x0HHRcdJx03HWcddx2HHZcdpx23Hccd1x3nHfceFx4nHjceRx5nHocelx6nHrcexx7XHvcfBx' +
        '8XHycfNx9HH1cfZx93H4cfpx+3H8cf1x/nH/cQByAXICcgNyBHIFcgdyCHIJcgpyC3IMcg1yDnIPchByEXISchNyFHIVchZyF3IYchlyGnIb' +
        'chxyHnIfciByIXIiciNyJHIlciZyJ3IpcityLXIuci9yMnIzcjRyOnI8cj5yQHJBckJyQ3JEckVyRnJJckpyS3JOck9yUHJRclNyVHJVcldy' +
        'WHJaclxyXnJgcmNyZHJlcmhyanJrcmxybXJwcnFyc3J0cnZyd3J4cntyfHJ9coJyg3KFcoZyh3KIcolyjHKOcpBykXKTcpRylXKWcpdymHKZ' +
        'cppym3Kccp1ynnKgcqFyonKjcqRypXKmcqdyqHKpcqpyq3KucrFysnKzcrVyunK7crxyvXK+cr9ywHLFcsZyx3LJcspyy3LMcs9y0XLTctRy' +
        '1XLWcthy2nLbcsbkx+TI5MnkyuTL5MzkzeTO5M/k0OTR5NLk0+TU5NXk1uTX5Njk2eTa5Nvk3OTd5N7k3+Tg5OHk4uTj5OTk5eTm5Ofk6OTp' +
        '5Ork6+Ts5O3k7uTv5PDk8eTy5PPk9OT15Pbk9+T45Pnk+uT75Pzk/eT+5P/kAOUB5QLlA+UE5QXlBuUH5QjlCeUK5QvlDOUN5Q7lD+UQ5RHl' +
        'EuUT5RTlFeUW5RflGOUZ5RrlG+Uc5R3lHuUf5SDlIeUi5SPlJOUl5QAwATACMLcAyQLHAqgAAzAFMBQgXv8WICYgGCAZIBwgHSAUMBUwCDAJ' +
        'MAowCzAMMA0wDjAPMBYwFzAQMBEwsQDXAPcANiInIigiESIPIioiKSIIIjciGiKlIiUiICISI5kiKyIuImEiTCJIIj0iHSJgIm4ibyJkImUi' +
        'HiI1IjQiQiZAJrAAMiAzIAMhBP+kAOD/4f8wIKcAFiEGJgUmyyXPJc4lxyXGJaEloCWzJbIlOyCSIZAhkSGTIRMwJuUn5SjlKeUq5SvlLOUt' +
        '5S7lL+Uw5THlMuUz5TTlNeU25TflOOU55TrlO+U85T3lPuU/5UDlQeVC5UPlROVF5UblR+VI5UnlSuVL5UzlTeVO5U/lUOVR5VLlU+VU5VXl' +
        'VuVX5VjlWeVa5VvlXOVd5V7lX+Vg5WHlYuVj5WTlZeVm5WflaOVp5Wrla+Vs5W3lbuVv5XDlceVy5XPldOV15Xbld+V45XnleuV75XzlfeV+' +
        '5X/lgOWB5YLlg+WE5YXlcCFxIXIhcyF0IXUhdiF3IXgheSFm52fnaOdp52rna+eIJIkkiiSLJIwkjSSOJI8kkCSRJJIkkySUJJUkliSXJJgk' +
        'mSSaJJskdCR1JHYkdyR4JHkkeiR7JHwkfSR+JH8kgCSBJIIkgySEJIUkhiSHJGAkYSRiJGMkZCRlJGYkZyRoJGkkrCBt5yAyITIiMiMyJDIl' +
        'MiYyJzIoMikybudv52AhYSFiIWMhZCFlIWYhZyFoIWkhaiFrIXDnceeG5YfliOWJ5Yrli+WM5Y3ljuWP5ZDlkeWS5ZPllOWV5Zbll+WY5Znl' +
        'muWb5ZzlneWe5Z/loOWh5aLlo+Wk5aXlpuWn5ajlqeWq5avlrOWt5a7lr+Ww5bHlsuWz5bTlteW25bfluOW55brlu+W85b3lvuW/5cDlweXC' +
        '5cPlxOXF5cblx+XI5cnlyuXL5czlzeXO5c/l0OXR5dLl0+XU5dXl1uXX5djl2eXa5dvl3OXd5d7l3+Xg5eHl4uXj5eTlADAB/wL/A//l/wX/' +
        'Bv8H/wj/Cf8K/wv/DP8N/w7/D/8Q/xH/Ev8T/xT/Ff8W/xf/GP8Z/xr/G/8c/x3/Hv8f/yD/If8i/yP/JP8l/yb/J/8o/yn/Kv8r/yz/Lf8u' +
        '/y//MP8x/zL/M/80/zX/Nv83/zj/Of86/zv/PP89/z7/P/9A/0H/Qv9D/0T/Rf9G/0f/SP9J/0r/S/9M/03/Tv9P/1D/Uf9S/1P/VP9V/1b/' +
        'V/9Y/1n/Wv9b/1z/Xf/j/+bl5+Xo5enl6uXr5ezl7eXu5e/l8OXx5fLl8+X05fXl9uX35fjl+eX65fvl/OX95f7l/+UA5gHmAuYD5gTmBeYG' +
        '5gfmCOYJ5grmC+YM5g3mDuYP5hDmEeYS5hPmFOYV5hbmF+YY5hnmGuYb5hzmHeYe5h/mIOYh5iLmI+Yk5iXmJuYn5ijmKeYq5ivmLOYt5i7m' +
        'L+Yw5jHmMuYz5jTmNeY25jfmOOY55jrmO+Y85j3mPuY/5kDmQeZC5kPmROZF5kEwQjBDMEQwRTBGMEcwSDBJMEowSzBMME0wTjBPMFAwUTBS' +
        'MFMwVDBVMFYwVzBYMFkwWjBbMFwwXTBeMF8wYDBhMGIwYzBkMGUwZjBnMGgwaTBqMGswbDBtMG4wbzBwMHEwcjBzMHQwdTB2MHcweDB5MHow' +
        'ezB8MH0wfjB/MIAwgTCCMIMwhDCFMIYwhzCIMIkwijCLMIwwjTCOMI8wkDCRMJIwkzBy53PndOd153bnd+d453nneud753znRuZH5kjmSeZK' +
        '5kvmTOZN5k7mT+ZQ5lHmUuZT5lTmVeZW5lfmWOZZ5lrmW+Zc5l3mXuZf5mDmYeZi5mPmZOZl5mbmZ+Zo5mnmauZr5mzmbeZu5m/mcOZx5nLm' +
        'c+Z05nXmduZ35njmeeZ65nvmfOZ95n7mf+aA5oHmguaD5oTmheaG5ofmiOaJ5ormi+aM5o3mjuaP5pDmkeaS5pPmlOaV5pbml+aY5pnmmuab' +
        '5pzmneae5p/moOah5qLmo+ak5qXmoTCiMKMwpDClMKYwpzCoMKkwqjCrMKwwrTCuMK8wsDCxMLIwszC0MLUwtjC3MLgwuTC6MLswvDC9ML4w' +
        'vzDAMMEwwjDDMMQwxTDGMMcwyDDJMMowyzDMMM0wzjDPMNAw0TDSMNMw1DDVMNYw1zDYMNkw2jDbMNww3TDeMN8w4DDhMOIw4zDkMOUw5jDn' +
        'MOgw6TDqMOsw7DDtMO4w7zDwMPEw8jDzMPQw9TD2MH3nfud/54DngeeC54PnhOem5qfmqOap5qrmq+as5q3mruav5rDmseay5rPmtOa15rbm' +
        't+a45rnmuua75rzmvea+5r/mwObB5sLmw+bE5sXmxubH5sjmyebK5svmzObN5s7mz+bQ5tHm0ubT5tTm1ebW5tfm2ObZ5trm2+bc5t3m3ubf' +
        '5uDm4ebi5uPm5Obl5ubm5+bo5unm6ubr5uzm7ebu5u/m8Obx5vLm8+b05vXm9ub35vjm+eb65vvm/Ob95v7m/+YA5wHnAucD5wTnBeeRA5ID' +
        'kwOUA5UDlgOXA5gDmQOaA5sDnAOdA54DnwOgA6EDowOkA6UDpgOnA6gDqQOF54bnh+eI54nniueL54znsQOyA7MDtAO1A7YDtwO4A7kDugO7' +
        'A7wDvQO+A78DwAPBA8MDxAPFA8YDxwPIA8kDEP4S/hH+E/4U/hX+Fv41/jb+Of46/j/+QP49/j7+Qf5C/kP+RP4X/hj+O/48/jf+OP4x/hn+' +
        'M/40/pfnmOeZ55rnm+ec553nnuef5wbnB+cI5wnnCucL5wznDecO5w/nEOcR5xLnE+cU5xXnFucX5xjnGeca5xvnHOcd5x7nH+cg5yHnIucj' +
        '5yTnJecm5yfnKOcp5yrnK+cs5y3nLucv5zDnMecy5zPnNOc15zbnN+c45znnOuc75zznPec+5z/nQOdB50LnQ+dE50XnRudH50jnSedK50vn' +
        'TOdN507nT+dQ51HnUudT51TnVedW51fnWOdZ51rnW+dc513nXudf52DnYedi52PnZOdl5xAEEQQSBBMEFAQVBAEEFgQXBBgEGQQaBBsEHAQd' +
        'BB4EHwQgBCEEIgQjBCQEJQQmBCcEKAQpBCoEKwQsBC0ELgQvBKDnoeei56PnpOel56bnp+eo56nnquer56znreeu5zAEMQQyBDMENAQ1BFEE' +
        'NgQ3BDgEOQQ6BDsEPAQ9BD4EPwRABEEEQgRDBEQERQRGBEcESARJBEoESwRMBE0ETgRPBK/nsOex57Lns+e057Xntue357jnuee657vnygLL' +
        'AtkCEyAVICUgNSAFIQkhliGXIZghmSEVIh8iIyJSImYiZyK/IlAlUSVSJVMlVCVVJVYlVyVYJVklWiVbJVwlXSVeJV8lYCVhJWIlYyVkJWUl' +
        'ZiVnJWglaSVqJWslbCVtJW4lbyVwJXElciVzJYElgiWDJYQlhSWGJYcliCWJJYoliyWMJY0ljiWPJZMllCWVJbwlvSXiJeMl5CXlJQkmlSIS' +
        'MB0wHjC8573nvue/58DnwefC58PnxOfF58bnAQHhAM4B4AATAekAGwHoACsB7QDQAewATQHzANIB8gBrAfoA1AH5ANYB2AHaAdwB/ADqAFEC' +
        'Px5EAUgB+QFhAsnnyufL58znBTEGMQcxCDEJMQoxCzEMMQ0xDjEPMRAxETESMRMxFDEVMRYxFzEYMRkxGjEbMRwxHTEeMR8xIDEhMSIxIzEk' +
        'MSUxJjEnMSgxKTHN587nz+fQ59Hn0ufT59Tn1efW59fn2OfZ59rn2+fc593n3uff5+Dn4echMCIwIzAkMCUwJjAnMCgwKTCjMo4zjzOcM50z' +
        'njOhM8QzzjPRM9Iz1TMw/uL/5P/i5yEhMTLj5xAg5Ofl5+bn/DCbMJww/TD+MAYwnTCeMEn+Sv5L/kz+Tf5O/k/+UP5R/lL+VP5V/lb+V/5Z' +
        '/lr+W/5c/l3+Xv5f/mD+Yf5i/mP+ZP5l/mb+aP5p/mr+a/4+MPAv8S/yL/Mv9C/1L/Yv9y/4L/kv+i/7Lwcw9Of15/bn9+f45/nn+uf75/zn' +
        '/ef+5//nAOgAJQElAiUDJQQlBSUGJQclCCUJJQolCyUMJQ0lDiUPJRAlESUSJRMlFCUVJRYlFyUYJRklGiUbJRwlHSUeJR8lICUhJSIlIyUk' +
        'JSUlJiUnJSglKSUqJSslLCUtJS4lLyUwJTElMiUzJTQlNSU2JTclOCU5JTolOyU8JT0lPiU/JUAlQSVCJUMlRCVFJUYlRyVIJUklSiVLJQHo' +
        'AugD6AToBegG6AfoCOgJ6AroC+gM6A3oDugP6Nxy3XLfcuJy43LkcuVy5nLncupy63L1cvZy+XL9cv5y/3IAcwJzBHMFcwZzB3MIcwlzC3MM' +
        'cw1zD3MQcxFzEnMUcxhzGXMacx9zIHMjcyRzJnMncyhzLXMvczBzMnMzczVzNnM6cztzPHM9c0BzQXNCc0NzRHNFc0ZzR3NIc0lzSnNLc0xz' +
        'TnNPc1FzU3NUc1VzVnNYc1lzWnNbc1xzXXNec19zYXNic2NzZHNlc2ZzZ3Noc2lzanNrc25zcHNxcwDgAeAC4APgBOAF4AbgB+AI4AngCuAL' +
        '4AzgDeAO4A/gEOAR4BLgE+AU4BXgFuAX4BjgGeAa4BvgHOAd4B7gH+Ag4CHgIuAj4CTgJeAm4CfgKOAp4CrgK+As4C3gLuAv4DDgMeAy4DPg' +
        'NOA14DbgN+A44DngOuA74DzgPeA+4D/gQOBB4ELgQ+BE4EXgRuBH4EjgSeBK4EvgTOBN4E7gT+BQ4FHgUuBT4FTgVeBW4FfgWOBZ4FrgW+Bc' +
        '4F3gcnNzc3RzdXN2c3dzeHN5c3pze3N8c31zf3OAc4FzgnODc4VzhnOIc4pzjHONc49zkHOSc5NzlHOVc5dzmHOZc5pznHOdc55zoHOhc6Nz' +
        'pHOlc6Zzp3Ooc6pzrHOtc7FztHO1c7ZzuHO5c7xzvXO+c79zwXPDc8RzxXPGc8dzy3PMc85z0nPTc9Rz1XPWc9dz2HPac9tz3HPdc99z4XPi' +
        'c+Nz5HPmc+hz6nPrc+xz7nPvc/Bz8XPzc/Rz9XP2c/dzXuBf4GDgYeBi4GPgZOBl4GbgZ+Bo4GngauBr4GzgbeBu4G/gcOBx4HLgc+B04HXg' +
        'duB34HjgeeB64HvgfOB94H7gf+CA4IHgguCD4ITgheCG4IfgiOCJ4Irgi+CM4I3gjuCP4JDgkeCS4JPglOCV4Jbgl+CY4JngmuCb4JzgneCe' +
        '4J/goOCh4KLgo+Ck4KXgpuCn4KjgqeCq4KvgrOCt4K7gr+Cw4LHgsuCz4LTgteC24LfguOC54Lrgu+D4c/lz+nP7c/xz/XP+c/9zAHQBdAJ0' +
        'BHQHdAh0C3QMdA10DnQRdBJ0E3QUdBV0FnQXdBh0GXQcdB10HnQfdCB0IXQjdCR0J3QpdCt0LXQvdDF0MnQ3dDh0OXQ6dDt0PXQ+dD90QHRC' +
        'dEN0RHRFdEZ0R3RIdEl0SnRLdEx0TXROdE90UHRRdFJ0U3RUdFZ0WHRddGB0YXRidGN0ZHRldGZ0Z3RodGl0anRrdGx0bnRvdHF0cnRzdHR0' +
        'dXR4dHl0enS84L3gvuC/4MDgweDC4MPgxODF4Mbgx+DI4MngyuDL4MzgzeDO4M/g0ODR4NLg0+DU4NXg1uDX4Njg2eDa4Nvg3ODd4N7g3+Dg' +
        '4OHg4uDj4OTg5eDm4Ofg6ODp4Org6+Ds4O3g7uDv4PDg8eDy4PPg9OD14Pbg9+D44Png+uD74Pzg/eD+4P/gAOEB4QLhA+EE4QXhBuEH4Qjh' +
        'CeEK4QvhDOEN4Q7hD+EQ4RHhEuET4RThFeEW4RfhGOEZ4Xt0fHR9dH90gnSEdIV0hnSIdIl0inSMdI10j3SRdJJ0k3SUdJV0lnSXdJh0mXSa' +
        'dJt0nXSfdKB0oXSidKN0pHSldKZ0qnSrdKx0rXSudK90sHSxdLJ0s3S0dLV0tnS3dLh0uXS7dLx0vXS+dL90wHTBdMJ0w3TEdMV0xnTHdMh0' +
        'yXTKdMt0zHTNdM50z3TQdNF003TUdNV01nTXdNh02XTadNt03XTfdOF05XTndOh06XTqdOt07HTtdPB08XTydBrhG+Ec4R3hHuEf4SDhIeEi' +
        '4SPhJOEl4SbhJ+Eo4SnhKuEr4SzhLeEu4S/hMOEx4TLhM+E04TXhNuE34TjhOeE64TvhPOE94T7hP+FA4UHhQuFD4UThReFG4UfhSOFJ4Urh' +
        'S+FM4U3hTuFP4VDhUeFS4VPhVOFV4VbhV+FY4VnhWuFb4VzhXeFe4V/hYOFh4WLhY+Fk4WXhZuFn4WjhaeFq4WvhbOFt4W7hb+Fw4XHhcuFz' +
        '4XThdeF24Xfh83T1dPh0+XT6dPt0/HT9dP50AHUBdQJ1A3UFdQZ1B3UIdQl1CnULdQx1DnUQdRJ1FHUVdRZ1F3UbdR11HnUgdSF1InUjdSR1' +
        'JnUndSp1LnU0dTZ1OXU8dT11P3VBdUJ1Q3VEdUZ1R3VJdUp1TXVQdVF1UnVTdVV1VnVXdVh1XXVedV91YHVhdWJ1Y3VkdWd1aHVpdWt1bHVt' +
        'dW51b3VwdXF1c3V1dXZ1d3V6dXt1fHV9dX51gHWBdYJ1hHWFdYd1eOF54Xrhe+F84X3hfuF/4YDhgeGC4YPhhOGF4Ybhh+GI4YnhiuGL4Yzh' +
        'jeGO4Y/hkOGR4ZLhk+GU4ZXhluGX4ZjhmeGa4ZvhnOGd4Z7hn+Gg4aHhouGj4aThpeGm4afhqOGp4arhq+Gs4a3hruGv4bDhseGy4bPhtOG1' +
        '4bbht+G44bnhuuG74bzhveG+4b/hwOHB4cLhw+HE4cXhxuHH4cjhyeHK4cvhzOHN4c7hz+HQ4dHh0uHT4dTh1eGIdYl1inWMdY11jnWQdZN1' +
        'lXWYdZt1nHWedaJ1pnWndah1qXWqda11tnW3dbp1u3W/dcB1wXXGdct1zHXOdc910HXRddN113XZddp13HXddd914HXhdeV16XXsde117nXv' +
        'dfJ183X1dfZ193X4dfp1+3X9df51AnYEdgZ2B3YIdgl2C3YNdg52D3YRdhJ2E3YUdhZ2GnYcdh12HnYhdiN2J3Yodix2LnYvdjF2MnY2djd2' +
        'OXY6djt2PXZBdkJ2RHbW4dfh2OHZ4drh2+Hc4d3h3uHf4eDh4eHi4ePh5OHl4ebh5+Ho4enh6uHr4ezh7eHu4e/h8OHx4fLh8+H04fXh9uH3' +
        '4fjh+eH64fvh/OH94f7h/+EA4gHiAuID4gTiBeIG4gfiCOIJ4griC+IM4g3iDuIP4hDiEeIS4hPiFOIV4hbiF+IY4hniGuIb4hziHeIe4h/i' +
        'IOIh4iLiI+Ik4iXiJuIn4ijiKeIq4iviLOIt4i7iL+Iw4jHiMuIz4kV2RnZHdkh2SXZKdkt2TnZPdlB2UXZSdlN2VXZXdlh2WXZadlt2XXZf' +
        'dmB2YXZidmR2ZXZmdmd2aHZpdmp2bHZtdm52cHZxdnJ2c3Z0dnV2dnZ3dnl2enZ8dn92gHaBdoN2hXaJdop2jHaNdo92kHaSdpR2lXaXdph2' +
        'mnabdpx2nXaedp92oHahdqJ2o3aldqZ2p3aodql2qnardqx2rXavdrB2s3a1drZ2t3a4drl2una7drx2vXa+dsB2wXbDdkpVP5bDVyhjzlQJ' +
        'VcBUkXZMdjyF7nd+go14MXKYlo2XKGyJW/pPCWOXZrhc+oBIaK6AAmbOdvlRVmWscfF/hIiyUGVZymGzb62CTGNSYu1TJ1QGe2tRpHX0XdRi' +
        'y412l4piGYBdVziXYn84cn12z2d+dkZkcE8ljdxiF3qRZe1zLGRzYiyCgZh/Z0hybmLMYjRP43RKU55Syn6mkC5ehmicaYCB0X7SaMV4jIZR' +
        'lY1QJIzegt6ABVMSiWVSxHbHdsl2y3bMdtN21XbZdtp23Hbddt524HbhduJ243bkduZ253bodul26nbrdux27XbwdvN29Xb2dvd2+nb7dv12' +
        '/3YAdwJ3A3cFdwZ3CncMdw53D3cQdxF3EncTdxR3FXcWdxd3GHcbdxx3HXcedyF3I3ckdyV3J3cqdyt3LHcudzB3MXcydzN3NHc5dzt3PXc+' +
        'dz93QndEd0V3RndId0l3SndLd0x3TXdOd093UndTd1R3VXdWd1d3WHdZd1x3hIX5lt1PIVhxmZ1bsWKlYrRmeYyNnAZyb2eReLJgUVMXU4iP' +
        'zIAdjaGUDVDIcgdZ62AZcauIVFnvgixnKHspXfd+LXX1bGaO+I88kDuf1GsZkRR7fF+neNaEPYXVa9lr1msBXode+XXtlV1lCl/FX5+PwVjC' +
        'gX+QW5atl7mPFn8sjUFiv0/YU15TqI+pj6uPTZAHaGpfmIFoiNaci2ErUip2bF+MZdJv6G6+W0hkdVGwUcRnGU7JeXyZs3Bdd153X3dgd2R3' +
        'Z3dpd2p3bXdud293cHdxd3J3c3d0d3V3dnd3d3h3end7d3x3gXeCd4N3hneHd4h3iXeKd4t3j3eQd5N3lHeVd5Z3l3eYd5l3mnebd5x3nXee' +
        'd6F3o3ekd6Z3qHerd613rnevd7F3sne0d7Z3t3e4d7l3une8d753wHfBd8J3w3fEd8V3xnfHd8h3yXfKd8t3zHfOd8930HfRd9J303fUd9V3' +
        '1nfYd9l32nfdd95333fgd+F35HfFdXZeu3Pgg61k6GK1lOJsWlPDUg9kwpSUey9PG142ghaBioEkbspsc5pVY1xT+lRliOBXDU4DXmVrP3zo' +
        'kBZg5mQcc8GIUGdNYiKNbHcpjseRaV/cgyGFEJnCU5WGi2vtYOhgf3DNgjGC006nbM+FzWTZfP1p+WZJg5VTVnunT4xRS21CXG2O0mPJUyyD' +
        'NoPlZ7R4PWTfW5Rc7l3ni8Zi9Gd6jABkumNJh4uZF4wgf/KUp04QlqSYDGYWc+Z36Hfqd+938Hfxd/J39Hf1d/d3+Xf6d/t3/HcDeAR4BXgG' +
        'eAd4CHgKeAt4DngPeBB4E3gVeBl4G3geeCB4IXgieCR4KHgqeCt4LngveDF4MngzeDV4Nng9eD94QXhCeEN4RHhGeEh4SXhKeEt4TXhPeFF4' +
        'U3hUeFh4WXhaeFt4XHheeF94YHhheGJ4Y3hkeGV4ZnhneGh4aXhveHB4cXhyeHN4dHh1eHZ4eHh5eHp4e3h9eH54f3iAeIF4gniDeDpXHVw4' +
        'Xn+Vf1CggIJTXmVFdTFVIVCFjYRinpQdZzJWbm/iXTVUknBmj29ipGSjY3tfiG/0kOOBsI8YXGhm8V+JbEiWgY1siJFk8HnOV1lqEGJIVFhO' +
        'C3rpYIRv2ot/Yh6Qi5rkeQNU9HUBYxlTYGzfjxtfcJo7gH+fiE86XGSNxX+lZb1wRVGyUWuGB12gW71ibJF0dQyOIHoBYXl7x074foV3EU7t' +
        'gR1S+lFxaqhTh44Elc+WwW5kllpphHiFeIZ4iHiKeIt4j3iQeJJ4lHiVeJZ4mXideJ54oHiieKR4pnioeKl4qnireKx4rXiueK94tXi2eLd4' +
        'uHi6eLt4vHi9eL94wHjCeMN4xHjGeMd4yHjMeM14znjPeNF40njTeNZ413jYeNp423jceN143njfeOB44XjieON45HjleOZ453jpeOp463jt' +
        'eO5473jwePF483j1ePZ4+Hj5ePt4/Hj9eP54/3gAeQJ5A3kEeQZ5B3kIeQl5CnkLeQx5QHioUNd3EGTmiQRZ42PdXX96PWkgTzmCmFUyTq51' +
        'l3piXope75UbUjlUinB2YySVglclZj9ph5EHVfNtr34iiDNi8H61dSiDwXjMlp6PSGH3dM2LZGs6UlCNIWtqgHGE8VYGU85OG07RUZd8i5EH' +
        'fMNPf47he5x6Z2QUXaxQBoEBdrl87G3gf1FnWFv4W8t4rmQTZKpjK2MZlS1kvo9Ueyl2U2InWUZUeWujUDRiJl6Ga+NON42LiIVfLpANeQ55' +
        'D3kQeRF5EnkUeRV5FnkXeRh5GXkaeRt5HHkdeR95IHkheSJ5I3kleSZ5J3koeSl5KnkreSx5LXkueS95MHkxeTJ5M3k1eTZ5N3k4eTl5PXk/' +
        'eUJ5Q3lEeUV5R3lKeUt5THlNeU55T3lQeVF5UnlUeVV5WHlZeWF5Y3lkeWZ5aXlqeWt5bHlueXB5cXlyeXN5dHl1eXZ5eXl7eXx5fXl+eX95' +
        'gnmDeYZ5h3mIeYl5i3mMeY15jnmQeZF5knkgYD2AxWI5TlVT+JC4Y8aA5mUubEZP7mDhbd6LOV/LhlNfIWNaUWGDY2gAUmNjSI4SUJtcd3n8' +
        'WzBSO3q8YFOQ13a3X5dfhHZsjm9we3ZJe6p381GTkCRYTk/0buqPTGUbe8RypG3ff+FatWKVXjBXgoQsex1eH18SkBR/oJiCY8dumHi5cHhR' +
        'W5erVzV1Q084dZde5mBgWcBtv2uJePxT1ZbLUQFSiWMKVJOUA4zMjTlyn3h2h+2PDYzgU5N5lHmVeZZ5l3mYeZl5m3mceZ15nnmfeaB5oXmi' +
        'eaN5pHmleaZ5qHmpeap5q3msea15rnmvebB5sXmyebR5tXm2ebd5uHm8eb95wnnEecV5x3nIecp5zHnOec950HnTedR51nnXedl52nnbedx5' +
        '3XneeeB54XnieeV56Hnqeex57nnxefJ583n0efV59nn3efl5+nn8ef55/3kBegR6BXoHegh6CXoKegx6D3oQehF6EnoTehV6FnoYehl6G3oc' +
        'egFO73buU4mUdpgOny2VmluiiyJOHE6sUWOEwmGoUgtol09rYLtRHm1cUZZil2VhlkaMF5DYdf2QY3fSa4py7HL7izVYeXdMjVxnQJWagKZe' +
        'IW6SWe967Xc7lbVrrWUOfwZYUVEflvlbqVgoVHKOZmV/mORWnZT+dkGQh2PGVBpZOlmbV7KONWf6jTWCQVLwYBVY/oboXEWexE+dmLmLJVp2' +
        'YIRTfGJPkAKRf5lpYAyAP1EzgBRcdZkxbYxOHXofeiF6InokeiV6Jnoneih6KXoqeit6LHotei56L3owejF6Mno0ejV6Nno4ejp6PnpAekF6' +
        'QnpDekR6RXpHekh6SXpKekt6THpNek56T3pQelJ6U3pUelV6VnpYell6Wnpbelx6XXpeel96YHphemJ6Y3pkemV6Znpnemh6aXpqemt6bHpt' +
        'em56b3pxenJ6c3p1ent6fHp9en56gnqFeod6iXqKeot6jHqOeo96kHqTepR6mXqaept6nnqheqJ6MI3RU1p/T3sQT09OAJbVbNBz6YUGXmp1' +
        '+38Kav53kpRBfuFR5nDNU9SPA4Mpja9ybZnbbEpXs4K5ZaqAP2IylqhZ/06/i7p+PmXyg16XYVXemKWAKlP9iyBUuoCfXrhsOY2sglqRKVQb' +
        'bAZSt35fVxpxfmyJfEtZ/U7/XyRhqnwwTgFcq2cCh/BcC5XOmK91/XAikK9RHX+9i0lZ5FFbTyZUK1l3ZaSAdVt2YsJikI9FXh9sJnsPT9hP' +
        'DWejeqR6p3qpeqp6q3queq96sHqxerJ6tHq1erZ6t3q4erl6unq7erx6vXq+esB6wXrCesN6xHrFesZ6x3rIesl6ynrMes16znrPetB60XrS' +
        'etN61HrVetd62Hraett63HrdeuF64nrkeud66Hrpeup663rseu568HrxevJ683r0evV69nr3evh6+3r8ev56AHsBewJ7BXsHewl7DHsNew57' +
        'EHsSexN7FnsXexh7Gnscex17H3sheyJ7I3sneyl7LXtubaptj3mxiBdfK3WaYoWP70/ckadlL4FRgZxeUIF0jW9SholLjQ1ZhVDYThyWNnJ5' +
        'gR+NzFuji0SWh1kaf5BUdlYOVuWLOWWCaZmU1naJbnJeGHVGZ9Fn/3qdgHaNH2HGeWJlY42IURpSopQ4f5uAsn6XXC9uYGfZe4t22JqPgZR/' +
        '1XweZFCVP3pKVOVUTGsBZAhiPZ7zgJl1clJpl1uEPGjkhgGWlJbslCpOBFTZfjlo340VgPRmml65fy97MHsyezR7NXs2ezd7OXs7ez17P3tA' +
        'e0F7QntDe0R7RntIe0p7TXtOe1N7VXtXe1l7XHtee197YXtje2R7ZXtme2d7aHtpe2p7a3tse217b3twe3N7dHt2e3h7ent8e317f3uBe4J7' +
        'g3uEe4Z7h3uIe4l7inuLe4x7jnuPe5F7knuTe5Z7mHuZe5p7m3uee597oHuje6R7pXuue697sHuye7N7tXu2e7d7uXu6e7t7vHu9e757v3vA' +
        'e8J7w3vEe8JXP4CXaOVdO2WfUm1gmp+bT6yObFGrWxNf6V1ebPFiIY1xUamU/lKfbN+C13KiV4RnLY0fWZyPx4OVVI17ME+9bGRb0VkTn+RT' +
        'yoaomjeMoYBFZX6Y+lbHli5S3HRQUuFbAmMCiVZO0GIqYPpoc1GYW6BRwomhe4aZUH/vYExwL41JUX9eG5BwdMSJLVdFeFJfn5/6lWiPPJvh' +
        'i3h2QmjcZ+qNNY09UoqP2m7NaAWV7ZD9Vpxn+YjHj8hUxXvIe8l7ynvLe817znvPe9B70nvUe9V71nvXe9h723vce95733vge+J743vke+d7' +
        '6Hvpe+t77Hvte+978Hvye/N79Hv1e/Z7+Hv5e/p7+3v9e/97AHwBfAJ8A3wEfAV8BnwIfAl8CnwNfA58EHwRfBJ8E3wUfBV8F3wYfBl8Gnwb' +
        'fBx8HXwefCB8IXwifCN8JHwlfCh8KXwrfCx8LXwufC98MHwxfDJ8M3w0fDV8Nnw3fDl8Onw7fDx8PXw+fEJ8uJppW3dtJmylTrNbh5pjkahh' +
        'r5DplytUtW3SW/1RilVVf/B/vGRNY/FlvmGNYApxV2xJbC9ZbWcqgtVYjlZqjOtr3ZB9WReA91NpbXVUnVV3g8+DOGi+eYxUVU8IVNJ2iYwC' +
        'lrNsuG1rjRCJZJ46jT9W0Z7VdYhf4HJoYPxUqE4qamGIUmBwj8RU2HB5hj+eKm2PWxhfon6JVa9PNHM8VJpTGVAOVHxUTk79X1p09lhrhOGA' +
        'dIfQcsp8Vm5DfER8RXxGfEd8SHxJfEp8S3xMfE58T3xQfFF8UnxTfFR8VXxWfFd8WHxZfFp8W3xcfF18XnxffGB8YXxifGN8ZHxlfGZ8Z3xo' +
        'fGl8anxrfGx8bXxufG98cHxxfHJ8dXx2fHd8eHx5fHp8fnx/fIB8gXyCfIN8hHyFfIZ8h3yIfIp8i3yMfI18jnyPfJB8k3yUfJZ8mXyafJt8' +
        'oHyhfKN8pnynfKh8qXyrfKx8rXyvfLB8tHy1fLZ8t3y4fLp8u3wnX06GLFWkYpJOqmw3YrGC11ROUz5z0W47dRJSFlPdi9Bpil8AYO5tT1ci' +
        'a69zU2jYjxN/YmOjYCRV6nVijBVxo22mW3teUoNMYcSe+nhXhyd8h3bwUfZgTHFDZkxeTWAOjHBwJWOJj71fYmDUht5WwWuUYGdhSVPgYGZm' +
        'P439eRpP6XBHbLOL8ovYfmSDD2ZaWkKbUW33bUGMO20ZT2twt4MWYtFgDZcnjXh5+1E+V/pXOmd4dT1673mVe798wHzCfMN8xHzGfMl8y3zO' +
        'fM980HzRfNJ803zUfNh82nzbfN183nzhfOJ843zkfOV85nznfOl86nzrfOx87XzufPB88XzyfPN89Hz1fPZ893z5fPp8/Hz9fP58/3wAfQF9' +
        'An0DfQR9BX0GfQd9CH0JfQt9DH0NfQ59D30QfRF9En0TfRR9FX0WfRd9GH0ZfRp9G30cfR19Hn0ffSF9I30kfSV9Jn0ofSl9Kn0sfS19Ln0w' +
        'fTF9Mn0zfTR9NX02fYyAZZn5j8BvpYshnuxZ6X4JfwlUgWfYaJGPTXzGlspTJWC+dXJsc1PJWqd+JGPgUQqB8V3fhIBigFFjWw5PbXlCUrhg' +
        'Tm3EW8JboYuwi+JlzF9FlpNZ536qfglWt2c5WXNPtlugUlqDipg+jTJ1vpRHUDx69062Z36awVp8a9F2WlcWXDp79JVOcXxRqYBwgnhZBH8n' +
        'g8Bo7GexeHd442JhY4B77U9qUs9RUIPbaXSS9Y0xjcGJLpWte/ZON304fTl9On07fTx9PX0+fT99QH1BfUJ9Q31EfUV9Rn1HfUh9SX1KfUt9' +
        'TH1NfU59T31QfVF9Un1TfVR9VX1WfVd9WH1ZfVp9W31cfV19Xn1ffWB9YX1ifWN9ZH1lfWZ9Z31ofWl9an1rfWx9bX1vfXB9cX1yfXN9dH11' +
        'fXZ9eH15fXp9e318fX19fn1/fYB9gX2CfYN9hH2FfYZ9h32IfYl9in2LfYx9jX2OfY99kH2RfZJ9k32UfZV9ln2XfZh9ZVAwglFSb5kQboVu' +
        'p236XvVQ3FkGXEZtX2yGdYuEaGhWWbKLIFNxkU2WSYUSaQF5JnH2gKROypBHbYSaB1q8VgVk8JTrd6VPGoHhctKJepk0f95+f1JZZXWRf4+D' +
        'j+tTlnrtY6Vjhnb4eVeINpYqYqtSgoJUaHBnd2Nrd+16AW3TfuOJ0FkSYsmFpYJMdR9Qy06ldeuLSlz+XUt7pGXRkcpOJW1fiSd9JpXFTiiM' +
        '249zl0tmgXnRj+xweG2ZfZp9m32cfZ19nn2ffaB9oX2ifaN9pH2lfad9qH2pfap9q32sfa19r32wfbF9sn2zfbR9tX22fbd9uH25fbp9u328' +
        'fb19vn2/fcB9wX3CfcN9xH3FfcZ9x33Ifcl9yn3Lfcx9zX3Ofc990H3RfdJ9033UfdV91n3Xfdh92X3afdt93H3dfd59333gfeF94n3jfeR9' +
        '5X3mfed96H3pfep9633sfe197n3vffB98X3yffN99H31ffZ99334ffl9+n09XLJSRoNiUQ6DW3d2ZricrE7KYL58s3zPfpVOZotvZoiYWZeD' +
        'WGxlXJWEX8l1Vpffet56wFGvcJh66mN2eqB+lnPtl0VOeHBdTlKRqVNRZedl/IEFgo5UMVyadaCX2GLZcr11RVx5msqDQFyAVOl3Pk6ubFqA' +
        '0mJuY+hdd1HdjR6OL5XxT+VT52CscGdSUGNDnh9aJlA3d3dT4n6FZCtliWKYYxRQNXLJibNRwIvdfkdXzIOnlJtRG1T7XPt9/H39ff59/30A' +
        'fgF+An4DfgR+BX4Gfgd+CH4Jfgp+C34Mfg1+Dn4PfhB+EX4SfhN+FH4VfhZ+F34Yfhl+Gn4bfhx+HX4efh9+IH4hfiJ+I34kfiV+Jn4nfih+' +
        'KX4qfit+LH4tfi5+L34wfjF+Mn4zfjR+NX42fjd+OH45fjp+PH49fj5+P35AfkJ+Q35EfkV+Rn5Ifkl+Sn5Lfkx+TX5Ofk9+UH5RflJ+U35U' +
        'flV+Vn5Xflh+WX5aflt+XH5dfspP43pabeGQj5qAVZZUYVOvVABf6WN3ae9RaGEKUipY2FJOVw14C3e3Xndh4HxbYpdiok6VcAOA92LkcGCX' +
        'd1fbgu9n9WjVeJeY0XnzWLNU71M0bktRO1KiW/6Lr4BDVaZXc2BRVy1UenpQYFRbp2OgYuNTY2LHW69n7VSfeuaCd5GTXuSIOFmuVw5j6I3v' +
        'gFdXd3upT+tfvVs+ayFTUHvCckZo/3c2d/dltVGPTtR2v1ylenWETllBm4BQXn5ffmB+YX5ifmN+ZH5lfmZ+Z35ofml+an5rfmx+bX5ufm9+' +
        'cH5xfnJ+c350fnV+dn53fnh+eX56fnt+fH59fn5+f36AfoF+g36EfoV+hn6Hfoh+iX6Kfot+jH6Nfo5+j36QfpF+kn6TfpR+lX6Wfpd+mH6Z' +
        'fpp+nH6dfp5+rn60frt+vH7WfuR+7H75fgp/EH8efzd/OX87fzx/PX8+fz9/QH9Bf0N/Rn9Hf0h/SX9Kf0t/TH9Nf05/T39Sf1N/iJknYYNu' +
        'ZFcGZkZj8FbsYmli014UloNXyWKHVSGHSoGjj2ZVsYNlZ1aN3YRqWg9o5mLuexGWcFGcbzCM/WPIidJhBn/CcOVuBXSUafxyyl7OkBdnam1e' +
        'Y7NSYnIBgGxP5VlqkdlwnW3SUlBO95ZtlX6FyngvfSFRklfCZIuAe3zqbPFoXmm3UZhTqGiBcs6e8Xv4crt5E28GdE5nzJGknDx5iYNUgw9U' +
        'F2g9TolTsVI+eIZTKVKIUItP0E9Wf1l/W39cf11/Xn9gf2N/ZH9lf2Z/Z39rf2x/bX9vf3B/c391f3Z/d394f3p/e398f31/f3+Af4J/g3+E' +
        'f4V/hn+Hf4h/iX+Lf41/j3+Qf5F/kn+Tf5V/ln+Xf5h/mX+bf5x/oH+if6N/pX+mf6h/qX+qf6t/rH+tf65/sX+zf7R/tX+2f7d/un+7f75/' +
        'wH/Cf8N/xH/Gf8d/yH/Jf8t/zX/Pf9B/0X/Sf9N/1n/Xf9l/2n/bf9x/3X/ef+J/43/idct6knylbLaWm1KDdOlU6U9UgLKD3o9wlcleHGCf' +
        'bRheW2U4gf6US2C8cMN+rnzJUYFosXxvgiROho/PkX5mrk4FjKlkSoDaUJd1znHlW72PZm+GToJkY5XWXpllF1LCiMhwo1IOczN0l2f3eBaX' +
        'NE67kN6cy23bUUGNHVTOYrJz8YP2loSfw5Q2T5p/zFF1cHWWrVyGmOZT5E6cbgl0tGlreI+ZWXUYUiR2QW3zZ21RmZ9LgJlUPHu/euR/53/o' +
        'f+p/63/sf+1/73/yf/R/9X/2f/d/+H/5f/p//X/+f/9/AoAHgAiACYAKgA6AD4ARgBOAGoAbgB2AHoAfgCGAI4AkgCuALIAtgC6AL4AwgDKA' +
        'NIA5gDqAPIA+gECAQYBEgEWAR4BIgEmAToBPgFCAUYBTgFWAVoBXgFmAW4BcgF2AXoBfgGCAYYBigGOAZIBlgGaAZ4BogGuAbIBtgG6Ab4Bw' +
        'gHKAc4B0gHWAdoB3gHiAeYB6gHuAfIB9gIaWhFfiYkeWfGkEWgJk03sPb0uWpoJiU4WYkF6JcLNjZFNPhoGck56MeDKX741CjX+eXm+EeVVf' +
        'RpYuYnSaFVTdlKNPxWVlXGFcFX9Rhi9si1+Hc+Ru/37mXBtjalvmbnVTcU6gY2V1oWJujyZP0U6mbLZ+uosdhLqHV387kCOVqXuhmviIPYQb' +
        'bYaa3H6IWbuem3MBeIKGbJqCmhtWF1TLV3BOpp5WU8iPCYGSd5KZ7obhbhOF/GZiYStvfoCBgIKAhYCIgIqAjYCOgI+AkICRgJKAlICVgJeA' +
        'mYCegKOApoCngKiArICwgLOAtYC2gLiAuYC7gMWAx4DIgMmAyoDLgM+A0IDRgNKA04DUgNWA2IDfgOCA4oDjgOaA7oD1gPeA+YD7gP6A/4AA' +
        'gQGBA4EEgQWBB4EIgQuBDIEVgReBGYEbgRyBHYEfgSCBIYEigSOBJIElgSaBJ4EogSmBKoErgS2BLoEwgTOBNIE1gTeBOYE6gTuBPIE9gT+B' +
        'KYySgiuD8nYTbNlfvYMrcwWDGpXba9t3xpRvUwKDklE9XoyMOI1ITqtzmmeFaHaRCZdkcaFsCXeSWkGVz2uOfydm0Fu5WZpa6JX3lexODISZ' +
        'hKxq33YwlRtzpmhfWy93mpFhl9x8948cjCVfc3zYecWJzGwch8ZbQl7JaCB39X6VUU1RyVIpWgV/YpfXgs9jhHfQhdJ5Om6ZXplZEYVtcBFs' +
        'v2K/dk9lr2D9lQ5mn4cjnu2UDVR9VCyMeGRAgUGBQoFDgUSBRYFHgUmBTYFOgU+BUoFWgVeBWIFbgVyBXYFegV+BYYFigWOBZIFmgWiBaoFr' +
        'gWyBb4FygXOBdYF2gXeBeIGBgYOBhIGFgYaBh4GJgYuBjIGNgY6BkIGSgZOBlIGVgZaBl4GZgZqBnoGfgaCBoYGigaSBpYGngamBq4Gsga2B' +
        'roGvgbCBsYGygbSBtYG2gbeBuIG5gbyBvYG+gb+BxIHFgceByIHJgcuBzYHOgc+B0IHRgdKB04F5ZBGGIWqcgeh4aWRUm7liK2erg6hY2J6r' +
        'bCBv3ltMlguMX3LQZ8diYXKpTsZZzWuTWK5mVV7fUlVhKGfudmZ3Z3JGev9i6lRQVKCUo5AcWrN+FmxDTnZZEIBIWVdTN3W+lspWIGMRgXxg' +
        '+ZXWbWJUgZmFUela/YCuWROXKlDlbDxc32JgTz9Te4EGkLpuK4XIYnRevni1ZHtj9V8YWn+RH54/XE9jQoB9W25VSpVNlYVtqGDgZ95y3VGB' +
        'W9SB1YHWgdeB2IHZgdqB24Hcgd2B3oHfgeCB4YHigeSB5YHmgeiB6YHrge6B74HwgfGB8oH1gfaB94H4gfmB+oH9gf+BA4IHggiCCYIKgguC' +
        'DoIPghGCE4IVghaCF4IYghmCGoIdgiCCJIIlgiaCJ4Ipgi6CMoI6gjyCPYI/gkCCQYJCgkOCRYJGgkiCSoJMgk2CToJQglGCUoJTglSCVYJW' +
        'gleCWYJbglyCXYJegmCCYYJigmOCZIJlgmaCZ4Jpgudi3mxbcm1irpS9fhOBU22cUQRfdFmqUhJgc1mWZlCGn3UqY+Zh73z6i+ZUJ2slnrRr' +
        '1YVVVHZQpGxqVbSNLHIVXhVgNnTNYpJjTHKYX0NuPm0AZVhv2HbQePx2VHUkUttTU06eXsFlKoDWgJtihlQoUq5wjYjRjeFseFTagPlX9IhU' +
        'jWqWTZFpT5tst1XGdjB4qGL5cI5vbV/shNpofHj3e6iBC2dPnmdjsHhvVxJ4OZd5YqtiiFI1dNdraoJrgmyCbYJxgnWCdoJ3gniCe4J8goCC' +
        'gYKDgoWChoKHgomCjIKQgpOClIKVgpaCmoKbgp6CoIKigqOCp4KygrWCtoK6gruCvIK/gsCCwoLDgsWCxoLJgtCC1oLZgtqC3YLigueC6ILp' +
        'guqC7ILtgu6C8ILygvOC9YL2gviC+oL8gv2C/oL/ggCDCoMLgw2DEIMSgxODFoMYgxmDHYMegx+DIIMhgyKDI4MkgyWDJoMpgyqDLoMwgzKD' +
        'N4M7gz2DZFU+gbJ1rnY5U951+1BBXGyLx3tPUEdyl5rYmAJv4nRoeYdkpXf8YpGYK43BVFiAUk5qV/mCDYRzXu1R9nTEi09cYVf8bIeYRlo0' +
        'eESb64+VfFZSUWL6lMZOhoNhhOmDsoTUVzRnA1duZmZtMYzdZhFwH2c6axZoGmK7WQNOxFEGb9Jnj2x2UctoR1lna2Z1Dl0QgVCf12VIeUF5' +
        'kZp3jYJcXk4BTy9UUVkMeGhWFGzEjwNffWzjbKuLkGM+gz+DQYNCg0SDRYNIg0qDS4NMg02DToNTg1WDVoNXg1iDWYNdg2KDcINxg3KDc4N0' +
        'g3WDdoN5g3qDfoN/g4CDgYOCg4ODhIOHg4iDioOLg4yDjYOPg5CDkYOUg5WDloOXg5mDmoOdg5+DoYOig6ODpIOlg6aDp4Osg62DroOvg7WD' +
        'u4O+g7+DwoPDg8SDxoPIg8mDy4PNg86D0IPRg9KD04PVg9eD2YPag9uD3oPig+OD5IPmg+eD6IPrg+yD7YNwYD1tdXJmYo6UxZRDU8GPfnvf' +
        'TiaMfk7UnrGUs5RNUlxvY5BFbTSMEVhMXSBrSWuqZ1tUVIGMf5lYN4U6X6JiR2o5lXJlhGBlaKd3VE6oT+ddmJesZNh/7VzPT416B1IEgxRO' +
        'L2CDeqaUtU+yTuZ5NHTkUrmC0mS9ed1bgWxSl3uPImw+UH9TBW7OZHRmMGzFYHeY94uGXjx0d3rLeRhOsZADdEJs2lZLkcVsi406U8aG8mav' +
        'jkhccZogbu6D74Pzg/SD9YP2g/eD+oP7g/yD/oP/gwCEAoQFhAeECIQJhAqEEIQShBOEFIQVhBaEF4QZhBqEG4QehB+EIIQhhCKEI4QphCqE' +
        'K4QshC2ELoQvhDCEMoQzhDSENYQ2hDeEOYQ6hDuEPoQ/hECEQYRChEOERIRFhEeESIRJhEqES4RMhE2EToRPhFCEUoRThFSEVYRWhFiEXYRe' +
        'hF+EYIRihGSEZYRmhGeEaIRqhG6Eb4RwhHKEdIR3hHmEe4R8hNZTNlqLn6ONu1MIV6eYQ2ebkclsaFHKdfNirHI4Up1SOn+UcDh2dFNKnrdp' +
        'bnjAltmIpH82ccNxiVHTZ+R05FgYZbdWqYt2mXBi1X75YO1w7FjBTrpOzV/nl/tOpIsDUopZq35UYs1O5WUOYjiDyYRjg42HlHG2brlb0n6X' +
        'Uclj1GeJgDmDFYgSUXpbglmxj3NOXWxlUSWJb48ulkqFXnQQlfCVpm3lgjFfkmQSbSiEboHDnF5YW40JTsFTfYR+hH+EgISBhIOEhISFhIaE' +
        'ioSNhI+EkISRhJKEk4SUhJWEloSYhJqEm4SdhJ6En4SghKKEo4SkhKWEpoSnhKiEqYSqhKuErISthK6EsISxhLOEtYS2hLeEu4S8hL6EwITC' +
        'hMOExYTGhMeEyITLhMyEzoTPhNKE1ITVhNeE2ITZhNqE24TchN6E4YTihOSE54TohOmE6oTrhO2E7oTvhPGE8oTzhPSE9YT2hPeE+IT5hPqE' +
        '+4T9hP6EAIUBhQKFHk9jZVFo01UnThRkmpprYsJaX3Rygqlt7mjnUI6DAnhAZzlSmWyxfrtQZVVecVt7UmbKc+uCSWdxXCBSfXFriOqVVZbF' +
        'ZGGNs4GEVVVsR2Iuf5JYJE9GVU+NTGYKThpc84iiaE5jDXrncI2C+lL2lxFc6FS1kM1+YllKjceGDIINgmaNRGQEXFFhiW0+eb6LN3gzdXtU' +
        'OE+rjvFtIFrFfl55iGyhW3ZaGnW+gE5hF27wWB91JXVyckdT834DhQSFBYUGhQeFCIUJhQqFC4UNhQ6FD4UQhRKFFIUVhRaFGIUZhRuFHIUd' +
        'hR6FIIUihSOFJIUlhSaFJ4UohSmFKoUthS6FL4UwhTGFMoUzhTSFNYU2hT6FP4VAhUGFQoVEhUWFRoVHhUuFTIVNhU6FT4VQhVGFUoVThVSF' +
        'VYVXhViFWoVbhVyFXYVfhWCFYYVihWOFZYVmhWeFaYVqhWuFbIVthW6Fb4VwhXGFc4V1hXaFd4V4hXyFfYV/hYCFgYUBd9t2aVLcgCNXCF4x' +
        'We5yvWV/bteLOFxxhkFT83f+YvZlwE7fmICGnlvGi/JT4nd/T05cdprLWQ9fOnnrWBZO/2eLTu1ik4odkL9SL2bcVWxWApDVTo1PypFwmQ9s' +
        'Al5DYKRbxonVizZlS2KWmYhb/1uIYy5V11Mmdn1RLIWiZ7NoimuSYpOP1FMSgtFtj3VmTk6NcFufca+FkWbZZnJ/AIfNniCfXlwvZ/CPEWhf' +
        'Zw1i1nqFWLZecGUxb4KFg4WGhYiFiYWKhYuFjIWNhY6FkIWRhZKFk4WUhZWFloWXhZiFmYWahZ2FnoWfhaCFoYWihaOFpYWmhaeFqYWrhayF' +
        'rYWxhbKFs4W0hbWFtoW4hbqFu4W8hb2FvoW/hcCFwoXDhcSFxYXGhceFyIXKhcuFzIXNhc6F0YXShdSF1oXXhdiF2YXahduF3YXehd+F4IXh' +
        'heKF44XlheaF54XoheqF64Xshe2F7oXvhfCF8YXyhfOF9IX1hfaF94X4hVVgN1INgFRkcIgpdQVeE2j0YhyXzFM9cgGMNGxhdw56LlSsd3qY' +
        'HIL0i1V4FGfBcK9llWQ2Vh1gwXn4Ux1Oe2uGgPpb41XbVjpPPE9ymfNdfmc4gAJggpgBkItbvIv1ixxkWILeZP1Vz4JlkddPIH0fkJ9881BR' +
        'WK9uv1vJi4OAeJGchJd7fYaLlo+W5X7Tmo54gVxXekKQp5ZfeVlbX2MLe9GErWgGVSl/EHQifQGVQGJMWNZOg1t5WVRY+YX6hfyF/YX+hQCG' +
        'AYYChgOGBIYGhgeGCIYJhgqGC4YMhg2GDoYPhhCGEoYThhSGFYYXhhiGGYYahhuGHIYdhh6GH4YghiGGIoYjhiSGJYYmhiiGKoYrhiyGLYYu' +
        'hi+GMIYxhjKGM4Y0hjWGNoY3hjmGOoY7hj2GPoY/hkCGQYZChkOGRIZFhkaGR4ZIhkmGSoZLhkyGUoZThlWGVoZXhliGWYZbhlyGXYZfhmCG' +
        'YYZjhmSGZYZmhmeGaIZphmqGbXMeY0uOD47OgNSCrGLwU/BsXpEqWQFgcGxNV0pkKo0rduluW1eAavB1bW8tjAiMZlfva5KIs3iiY/lTrXBk' +
        'bFhYKmQCWOBom4EQVdZ8GFC6jsxtn43rcI9jm23UbuZ+BIRDaAOQ2G12lqiLV1l5cuSFfoG8dYqKr2hUUiKOEZXQY5iYRI58VVNP/2aPVtVg' +
        'lW1DUklcKVn7bWtYMHUcdWxgFIJGgRFjYWfijzp38400jcGUFl6FUyxUw3Bthm+GcIZyhnOGdIZ1hnaGd4Z4hoOGhIaFhoaGh4aIhomGjoaP' +
        'hpCGkYaShpSGloaXhpiGmYaahpuGnoafhqCGoYaihqWGpoarhq2GroayhrOGt4a4hrmGu4a8hr2Gvoa/hsGGwobDhsWGyIbMhs2G0obThtWG' +
        '1obXhtqG3IbdhuCG4YbihuOG5YbmhueG6IbqhuuG7IbvhvWG9ob3hvqG+4b8hv2G/4YBhwSHBYcGhwuHDIcOhw+HEIcRhxSHFodAbPdeXFCt' +
        'Tq1eOmNHghqQUGhukbN3DFTclGRf5Xp2aEVjUnvfftt1d1CVYjRZD5D4UcN5gXr+VpJfFJCCbWBcH1cQVFRRTW7iVqhjk5h/gRWHKokAkB5U' +
        'b1zAgdZiWGIxgTWeQJZumnyaLWmlWdNiPlUWY8dU2YY8bQNa5nSciGprFllMjC9ffm6pc32YOE73cIxbl3g9Y1pmlnbLYJtbSVoHTlWBamyL' +
        'c6FOiWdRf4Bf+mUbZ9hfhFkBWhmHG4cdhx+HIIckhyaHJ4cohyqHK4cshy2HL4cwhzKHM4c1hzaHOIc5hzqHPIc9h0CHQYdCh0OHRIdFh0aH' +
        'SodLh02HT4dQh1GHUodUh1WHVodYh1qHW4dch12HXodfh2GHYodmh2eHaIdph2qHa4dsh22Hb4dxh3KHc4d1h3eHeId5h3qHf4eAh4GHhIeG' +
        'h4eHiYeKh4yHjoePh5CHkYeSh5SHlYeWh5iHmYeah5uHnIedh56HoIehh6KHo4ekh81drl9xU+aX3Y9FaPRWL1XfYDpOTW/0fseCDoTUWR9P' +
        'Kk8+XKx+KmcahXNUT3XDgIJVT5tNTy1uE4wJXHBha1MfdiluioaHZfuVuX47VDN6Cn3uleFVwX/udB1jF4ehbZ16EWKhZWdT4WODbOtdXFSo' +
        'lExOYWzsi0tc4GWcgqdoPlQ0VMtrZmuUTkJjSFMegg1Prk9eVwpi/pZkZmly/1KhUp9g74sUZplxkGd/iVJ4/XdwZjtWOFQhlXpypYemh6eH' +
        'qYeqh66HsIexh7KHtIe2h7eHuIe5h7uHvIe+h7+HwYfCh8OHxIfFh8eHyIfJh8yHzYfOh8+H0IfUh9WH1ofXh9iH2Yfah9yH3Yfeh9+H4Yfi' +
        'h+OH5Ifmh+eH6Ifph+uH7Ifth++H8Ifxh/KH84f0h/WH9of3h/iH+of7h/yH/Yf/hwCIAYgCiASIBYgGiAeICIgJiAuIDIgNiA6ID4gQiBGI' +
        'EogUiBeIGIgZiBqIHIgdiB6IH4ggiCOIAHpvYAxeiWCdgRVZ3GCEce9wqm5QbIByhGqtiC1eYE6zWpxV45QXbft8mZYPYsZ+jnd+hiNTHpeW' +
        'j4dm4VygT+1yC06mUw9ZE1SAYyiVSFHZTpycpH64VCSNVIg3gvKVjm0mX8xaPmZplrBzLnO/U3qBhZmhf6pbd5ZQlr9++HaiU3aVmZmxe0SJ' +
        'WG5hTtR/ZXnmi/NgzVSrTnmY911has9QEVRhjCeEXXgEl0pS7lSjVgCViG21W8ZtU2YkiCWIJogniCiIKYgqiCuILIgtiC6IL4gwiDGIM4g0' +
        'iDWINog3iDiIOog7iD2IPog/iEGIQohDiEaIR4hIiEmISohLiE6IT4hQiFGIUohTiFWIVohYiFqIW4hciF2IXohfiGCIZohniGqIbYhviHGI' +
        'c4h0iHWIdoh4iHmIeoh7iHyIgIiDiIaIh4iJiIqIjIiOiI+IkIiRiJOIlIiViJeImIiZiJqIm4idiJ6In4igiKGIo4iliKaIp4ioiKmIqogP' +
        'XF1bIWiWgHhVEXtIZVRpm05Ha06Hi5dPUx9jOmSqkJxlwYAQjJlRsGh4U/mHyGHEbPtsIoxRXKqFr4IMlSNrm4+wZftfw1/hT0WIH2ZlgSlz' +
        '+mB0URFSi1diX6KQTIiSkXheT2cnYNNZRFH2UfiACFN5bMSWinERT+5Pnn89Z8VVCJXAeZaI436fWAxiAJdahhhWe5iQX7iLxIRXkdlT7WWP' +
        'Xlx1ZGBufX9a6n7tfmmPp1WjW6xgy2WEc6yIroiviLCIsoiziLSItYi2iLiIuYi6iLuIvYi+iL+IwIjDiMSIx4jIiMqIy4jMiM2Iz4jQiNGI' +
        '04jWiNeI2ojbiNyI3YjeiOCI4YjmiOeI6YjqiOuI7IjtiO6I74jyiPWI9oj3iPqI+4j9iP+IAIkBiQOJBIkFiQaJB4kIiQmJC4kMiQ2JDokP' +
        'iRGJFIkViRaJF4kYiRyJHYkeiR+JIIkiiSOJJIkmiSeJKIkpiSyJLYkuiS+JMYkyiTOJNYk3iQmQY3Ypd9p+dJebhWZbdHrqlkCIy1KPcapf' +
        '7GXii/tbb5rhXYlrW2yti6+LCpDFj4tTvGImni2eQFQrTr2CWXKchhZdWYivbcWW0VSaTraLCXG9VAmW33D5bdB2JU4UeBKHqVz2XgCKnJgO' +
        'lo5wv2xEWaljPHdNiBRvc4IwWNVxjFMaeMGWAVVmXzBxtFsajIyag2suWS+e53loZ2xib0+hdYp/C20zlids8E7SdXtRN2g+b4CQcIGWWXZ0' +
        'OIk5iTqJO4k8iT2JPok/iUCJQolDiUWJRolHiUiJSYlKiUuJTIlNiU6JT4lQiVGJUolTiVSJVYlWiVeJWIlZiVqJW4lciV2JYIlhiWKJY4lk' +
        'iWWJZ4loiWmJaolriWyJbYluiW+JcIlxiXKJc4l0iXWJdol3iXiJeYl6iXyJfYl+iYCJgomEiYWJh4mIiYmJiomLiYyJjYmOiY+JkImRiZKJ' +
        'k4mUiZWJlomXiZiJmYmaiZuJnImdiZ6Jn4mgiaGJR2QnXGWQkXojjNpZrFQAgm+DgYkAgDBpTlY2gDdyzpG2UV9OdZiWYxpO9lPzZkuBHFmy' +
        'bQBO+Vg7U9Zj8ZSdTwpPY4iQmDdZV5D7eepO8ICRdYJsnFvoWV1fBWmBhhpQ8l1ZTuN35U56gpFiE2aRkHlcv055X8aBOJCEgKt1pk7UiA9h' +
        'xWvGX0lOynaibuOLrosKjNGLAl/8f8x/zn41g2uD4Fa3a/OXNJb7WR9U9pTrbcVbbpk5XBVfkJaiiaOJpImliaaJp4moiamJqomriayJrYmu' +
        'ia+JsImxibKJs4m0ibWJtom3ibiJuYm6ibuJvIm9ib6Jv4nAicOJzYnTidSJ1YnXidiJ2Ynbid2J34ngieGJ4onkieeJ6InpieqJ7Intie6J' +
        '8InxifKJ9In1ifaJ94n4ifmJ+on7ifyJ/Yn+if+JAYoCigOKBIoFigaKCIoJigqKC4oMig2KDooPihCKEYoSihOKFIoVihaKF4oYihmKGoob' +
        'ihyKHYpwU/GCMWp0WnCelF4of7mDJIQlhGeDR4fOj2KNyHZxX5aYbHggZt9U5WJjT8OByHW4Xs2WCo75ho9U82yMbThsf2DHUih1fV4YT6Bg' +
        '518kXDF1rpDAlLlyuWw4bkmRCWfLU/NTUU/JkfGLyFN8XsKP5G2OTsJ2hmlehhphBoJZT95PPpB8nAlhHW4UboWWiE4xWuiWDk5/XLl5h1vt' +
        'i71/iXPfV4uCwZABVEeQu1XqXKFfCGEya/FysoCJih6KH4ogiiGKIoojiiSKJYomiieKKIopiiqKK4osii2KLoovijCKMYoyijOKNIo1ijaK' +
        'N4o4ijmKOoo7ijyKPYo/ikCKQYpCikOKRIpFikaKR4pJikqKS4pMik2KTopPilCKUYpSilOKVIpVilaKV4pYilmKWopbilyKXYpeil+KYIph' +
        'imKKY4pkimWKZopnimiKaYpqimuKbIptim6Kb4pwinGKcopzinSKdYp2ineKeIp6inuKfIp9in6Kf4qAinRt01vViISYa4xtmjOeCm6kUUNR' +
        'o1eBiJ9T9GOVj+1WWFQGVz9zkG4Yf9yP0YI/YShgYpbwZqZ+io3DjaWUs1ykfAhnpmAFlhiAkU7nkABTaJZBUdCPdIVdkVVm9ZdVWx1TOHhC' +
        'Zz1oyVR+cLBbfY+NUShXsVQSZYJmXo1DjQ+BbIRtkN98/1H7haNn6WWhb6SGgY5qViCQgnZ2cOVxI43pYhlS/Ww8jQ5gnliOYf5mYI1OYrNV' +
        'I24tZ2ePgYqCioOKhIqFioaKh4qIiouKjIqNio6Kj4qQipGKkoqUipWKloqXipiKmYqaipuKnIqdip6Kn4qgiqGKooqjiqSKpYqmiqeKqIqp' +
        'iqqKq4qsiq2KroqvirCKsYqyirOKtIq1iraKt4q4irmKuoq7iryKvYq+ir+KwIrBisKKw4rEisWKxorHisiKyYrKisuKzIrNis6Kz4rQitGK' +
        '0orTitSK1YrWiteK2IrZitqK24rcit2K3orfiuCK4YriiuOK4ZT4lSh3BWioaYtUTU64cMiLWGSLZYVbhHo6UOhbu3fha3mKmHy+bM92qWWX' +
        'jy1dVVw4hghoYFMYYtl6W279fh9q4HpwXzNvIF+MY6htVmcIThBeJo3XTsCANHaclttiLWZ+YrxsdY1ncWl/RlGHgOxTbpCYYvJU8IaZjwWA' +
        'F5UXhdmPWW3Nc59lH3cEdSd4+4EejYiUpk+VZ7l1yosHly9jR5U1lriEI2NBd4Ff8HKJThRgdGXvYmNrP2XkiuWK5orniuiK6YrqiuuK7Irt' +
        'iu6K74rwivGK8orzivSK9Yr2iveK+Ir5ivqK+4r8iv2K/or/igCLAYsCiwOLBIsFiwaLCIsJiwqLC4sMiw2LDosPixCLEYsSixOLFIsVixaL' +
        'F4sYixmLGosbixyLHYseix+LIIshiyKLI4skiyWLJ4soiymLKosriyyLLYsuiy+LMIsxizKLM4s0izWLNos3iziLOYs6izuLPIs9iz6LP4tA' +
        'i0GLQotDi0SLRYsnXsd10ZDBi52CnWcvZTFUGIfld6KAAoFBbEtOx35MgPR2DWmWa2diPFCET0BXB2Nia76N6lPoZbh+118aY7dj84H0gW5/' +
        'HF7ZXDZSembpeRp6KI2ZcNR13m67bJJ6LU7FduBfn5R3iMh+zXm/gM2R8k4XTx+CaFTeXTJtzIulfHSPmIAaXpJUsXaZWzxmpJrgcypo24Yx' +
        'Zypz+IvbixCQ+XrbcG5xxGKpdzFWO05XhPFnqVLAhi6N+JRRe0aLR4tIi0mLSotLi0yLTYtOi0+LUItRi1KLU4tUi1WLVotXi1iLWYtai1uL' +
        'XItdi16LX4tgi2GLYotji2SLZYtni2iLaYtqi2uLbYtui2+LcItxi3KLc4t0i3WLdot3i3iLeYt6i3uLfIt9i36Lf4uAi4GLgouDi4SLhYuG' +
        'i4eLiIuJi4qLi4uMi42LjouPi5CLkYuSi5OLlIuVi5aLl4uYi5mLmoubi5yLnYuei5+LrIuxi7uLx4vQi+qLCYwejE9P6GxdeXuak2Iqcv1i' +
        'E04WeGyPsGRajcZ7aWiEXsWIhlmeZO5YtnIOaSWV/Y9YjWBXAH8GjMZRSWPZYlNTTGgidAGDTJFEVUB3fHBKbXlRqFREjf9Zy27EbVxbK33U' +
        'Tn18025QW+qBDW5XWwOb1Wgqjpdb/H47YLV+uZBwjU9ZzWPfebONUlPPZVZ5xYs7lsR+u5SCfjRWiZEAZ2p/Clx1kChm5l1QT95nWlBcT1BX' +
        'p14Q6BHoEugT6BToOIw5jDqMO4w8jD2MPow/jECMQoxDjESMRYxIjEqMS4xNjE6MT4xQjFGMUoxTjFSMVoxXjFiMWYxbjFyMXYxejF+MYIxj' +
        'jGSMZYxmjGeMaIxpjGyMbYxujG+McIxxjHKMdIx1jHaMd4x7jHyMfYx+jH+MgIyBjIOMhIyGjIeMiIyLjI2MjoyPjJCMkYySjJOMlYyWjJeM' +
        'mYyajJuMnIydjJ6Mn4ygjKGMooyjjKSMpYymjKeMqIypjKqMq4ysjK2MjU4MTkBREE7/XkVTFU6YTh5OMptsW2lWKE66eT9OFVNHTi1ZO3Ju' +
        'UxBs31bkgJeZ02t+dxefNk6fThCfXE5pTpNOiIJbW2xVD1bETo1TnVOjU6VTrlNll12NGlP1UyZTLlM+U1yNZlNjUwJSCFIOUi1SM1I/UkBS' +
        'TFJeUmFSXFKvhH1SglKBUpBSk1KCUVR/u07DTslOwk7oTuFO607eThtP804iT2RP9U4lTydPCU8rT15PZ084ZVpPXU+ujK+MsIyxjLKMs4y0' +
        'jLWMtoy3jLiMuYy6jLuMvIy9jL6Mv4zAjMGMwozDjMSMxYzGjMeMyIzJjMqMy4zMjM2MzozPjNCM0YzSjNOM1IzVjNaM14zYjNmM2ozbjNyM' +
        '3YzejN+M4IzhjOKM44zkjOWM5oznjOiM6YzqjOuM7IztjO6M74zwjPGM8ozzjPSM9Yz2jPeM+Iz5jPqM+4z8jP2M/oz/jACNAY0CjQONBI0F' +
        'jQaNB40IjQmNCo0LjQyNDY1fT1dPMk89T3ZPdE+RT4lPg0+PT35Pe0+qT3xPrE+UT+ZP6E/qT8VP2k/jT9xP0U/fT/hPKVBMUPNPLFAPUC5Q' +
        'LVD+TxxQDFAlUChQflBDUFVQSFBOUGxQe1ClUKdQqVC6UNZQBlHtUOxQ5lDuUAdRC1HdTj1sWE9lT85PoJ9GbHR8blH9XcmemJmBURRZ+VIN' +
        'UweKEFPrURlZVVGgTlZRs05uiKSItU4UgdKIgHk0WwOIuH+rUbFRvVG8UQ6ND40QjRGNEo0TjRSNFY0WjReNGI0ZjRqNG40cjSCNUY1SjVeN' +
        'X41ljWiNaY1qjWyNbo1vjXGNco14jXmNeo17jXyNfY1+jX+NgI2CjYONho2HjYiNiY2MjY2Njo2PjZCNko2TjZWNlo2XjZiNmY2ajZuNnI2d' +
        'jZ6NoI2hjaKNpI2ljaaNp42ojamNqo2rjayNrY2uja+NsI2yjbaNt425jbuNvY3AjcGNwo3FjceNyI3JjcqNzY3QjdKN043UjcdRllGiUaVR' +
        'oIumi6eLqou0i7WLt4vCi8OLy4vPi86L0ovTi9SL1ovYi9mL3Ivfi+CL5Ivoi+mL7ovwi/OL9ov5i/yL/4sAjAKMBIwHjAyMD4wRjBKMFIwV' +
        'jBaMGYwbjBiMHYwfjCCMIYwljCeMKowrjC6ML4wyjDOMNYw2jGlTelMdliKWIZYxliqWPZY8lkKWSZZUll+WZ5ZslnKWdJaIlo2Wl5awlpeQ' +
        'm5CdkJmQrJChkLSQs5C2kLqQ1Y3YjdmN3I3gjeGN4o3ljeaN543pje2N7o3wjfGN8o30jfaN/I3+jf+NAI4BjgKOA44EjgaOB44IjguODY4O' +
        'jhCOEY4SjhOOFY4WjheOGI4ZjhqOG44cjiCOIY4kjiWOJo4njiiOK44tjjCOMo4zjjSONo43jjiOO448jj6OP45DjkWORo5Mjk2OTo5PjlCO' +
        'U45UjlWOVo5XjliOWo5bjlyOXY5ejl+OYI5hjmKOY45kjmWOZ45ojmqOa45ujnGOuJCwkM+QxZC+kNCQxJDHkNOQ5pDikNyQ15DbkOuQ75D+' +
        'kASRIpEekSORMZEvkTmRQ5FGkQ1SQlmiUqxSrVK+Uv9U0FLWUvBS31Pucc139F71UfxRL5u2UwFfWnXvXUxXqVehV35YvFjFWNFYKVcsVypX' +
        'M1c5Vy5XL1dcVztXQldpV4VXa1eGV3xXe1doV21XdldzV61XpFeMV7JXz1enV7RXk1egV9VX2FfaV9lX0le4V/RX71f4V+RX3VdzjnWOd454' +
        'jnmOeo57jn2Ofo6AjoKOg46EjoaOiI6JjoqOi46Mjo2Ojo6RjpKOk46VjpaOl46YjpmOmo6bjp2On46gjqGOoo6jjqSOpY6mjqeOqI6pjqqO' +
        'rY6ujrCOsY6zjrSOtY62jreOuI65jruOvI69jr6Ov47AjsGOwo7DjsSOxY7GjseOyI7JjsqOy47Mjs2Oz47QjtGO0o7TjtSO1Y7WjteO2I7Z' +
        'jtqO247cjt2O3o7fjuCO4Y7ijuOO5I4LWA1Y/VftVwBYHlgZWERYIFhlWGxYgViJWJpYgFiomRmf/2F5gn2Cf4KPgoqCqIKEgo6CkYKXgpmC' +
        'q4K4gr6CsILIgsqC44KYgreCroLLgsyCwYKpgrSCoYKqgp+CxILOgqSC4YIJg/eC5IIPgweD3IL0gtKC2IIMg/uC04IRgxqDBoMUgxWD4ILV' +
        'ghyDUYNbg1yDCIOSgzyDNIMxg5uDXoMvg0+DR4NDg1+DQIMXg2CDLYM6gzODZoNlg+WO5o7njuiO6Y7qjuuO7I7tju6O747wjvGO8o7zjvSO' +
        '9Y72jveO+I75jvqO+478jv2O/o7/jgCPAY8CjwOPBI8FjwaPB48IjwmPCo8LjwyPDY8Ojw+PEI8RjxKPE48UjxWPFo8XjxiPGY8ajxuPHI8d' +
        'jx6PH48gjyGPIo8jjySPJY8mjyePKI8pjyqPK48sjy2PLo8vjzCPMY8yjzOPNI81jzaPN484jzmPOo87jzyPPY8+jz+PQI9Bj0KPQ49Ej2iD' +
        'G4Npg2yDaoNtg26DsIN4g7ODtIOgg6qDk4Ocg4WDfIO2g6mDfYO4g3uDmIOeg6iDuoO8g8GDAYTlg9iDB1gYhAuE3YP9g9aDHIQ4hBGEBoTU' +
        'g9+DD4QDhPiD+YPqg8WDwIMmhPCD4YNchFGEWoRZhHOEh4SIhHqEiYR4hDyERoRphHaEjISOhDGEbYTBhM2E0ITmhL2E04TKhL+EuoTghKGE' +
        'uYS0hJeE5YTjhAyFDXU4hfCEOYUfhTqFRY9Gj0ePSI9Jj0qPS49Mj02PTo9Pj1CPUY9Sj1OPVI9Vj1aPV49Yj1mPWo9bj1yPXY9ej1+PYI9h' +
        'j2KPY49kj2WPao+Aj4yPko+dj6CPoY+ij6SPpY+mj6ePqo+sj62Pro+vj7KPs4+0j7WPt4+4j7qPu4+8j7+PwI/Dj8aPyY/Kj8uPzI/Nj8+P' +
        '0o/Wj9eP2o/gj+GP44/nj+yP74/xj/KP9I/1j/aP+o/7j/yP/o//jweQCJAMkA6QE5AVkBiQVoU7hf+E/IRZhUiFaIVkhV6FeoWid0OFcoV7' +
        'haSFqIWHhY+FeYWuhZyFhYW5hbeFsIXThcGF3IX/hSeGBYYphhaGPIb+XghfPFlBWTeAVVlaWVhZD1MiXCVcLFw0XExiamKfYrtiymLaYtdi' +
        '7mIiY/ZiOWNLY0NjrWP2Y3FjemOOY7RjbWOsY4pjaWOuY7xj8mP4Y+Bj/2PEY95jzmNSZMZjvmNFZEFkC2QbZCBkDGQmZCFkXmSEZG1klmQZ' +
        'kByQI5AkkCWQJ5AokCmQKpArkCyQMJAxkDKQM5A0kDeQOZA6kD2QP5BAkEOQRZBGkEiQSZBKkEuQTJBOkFSQVZBWkFmQWpBckF2QXpBfkGCQ' +
        'YZBkkGaQZ5BpkGqQa5BskG+QcJBxkHKQc5B2kHeQeJB5kHqQe5B8kH6QgZCEkIWQhpCHkImQipCMkI2QjpCPkJCQkpCUkJaQmJCakJyQnpCf' +
        'kKCQpJClkKeQqJCpkKuQrZCykLeQvJC9kL+QwJB6ZLdkuGSZZLpkwGTQZNdk5GTiZAllJWUuZQtf0l8ZdRFfX1PxU/1T6VPoU/tTElQWVAZU' +
        'S1RSVFNUVFRWVENUIVRXVFlUI1QyVIJUlFR3VHFUZFSaVJtUhFR2VGZUnVTQVK1UwlS0VNJUp1SmVNNU1FRyVKNU1VS7VL9UzFTZVNpU3FSp' +
        'VKpUpFTdVM9U3lQbVedUIFX9VBRV81QiVSNVD1URVSdVKlVnVY9VtVVJVW1VQVVVVT9VUFU8VcKQw5DGkMiQyZDLkMyQzZDSkNSQ1ZDWkNiQ' +
        '2ZDakN6Q35DgkOOQ5JDlkOmQ6pDskO6Q8JDxkPKQ85D1kPaQ95D5kPqQ+5D8kP+QAJEBkQORBZEGkQeRCJEJkQqRC5EMkQ2RDpEPkRCREZES' +
        'kRORFJEVkRaRF5EYkRqRG5EckR2RH5EgkSGRJJElkSaRJ5EokSmRKpErkSyRLZEukTCRMpEzkTSRNZE2kTeROJE6kTuRPJE9kT6RP5FAkUGR' +
        'QpFEkTdVVlV1VXZVd1UzVTBVXFWLVdJVg1WxVblViFWBVZ9VflXWVZFVe1XfVb1VvlWUVZlV6lX3VclVH1bRVetV7FXUVeZV3VXEVe9V5VXy' +
        'VfNVzFXNVehV9VXkVZSPHlYIVgxWAVYkViNW/lUAVidWLVZYVjlWV1YsVk1WYlZZVlxWTFZUVoZWZFZxVmtWe1Z8VoVWk1avVtRW11bdVuFW' +
        '9VbrVvlW/1YEVwpXCVccVw9eGV4UXhFeMV47XjxeRZFHkUiRUZFTkVSRVZFWkViRWZFbkVyRX5FgkWaRZ5FokWuRbZFzkXqRe5F8kYCRgZGC' +
        'kYORhJGGkYiRipGOkY+Rk5GUkZWRlpGXkZiRmZGckZ2RnpGfkaCRoZGkkaWRppGnkaiRqZGrkayRsJGxkbKRs5G2kbeRuJG5kbuRvJG9kb6R' +
        'v5HAkcGRwpHDkcSRxZHGkciRy5HQkdKR05HUkdWR1pHXkdiR2ZHakduR3ZHekd+R4JHhkeKR45HkkeWRN15EXlReW15eXmFejFx6XI1ckFyW' +
        'XIhcmFyZXJFcmlycXLVcoly9XKxcq1yxXKNcwVy3XMRc0lzkXMtc5VwCXQNdJ10mXS5dJF0eXQZdG11YXT5dNF09XWxdW11vXV1da11LXUpd' +
        'aV10XYJdmV2dXXOMt13FXXNfd1+CX4dfiV+MX5VfmV+cX6hfrV+1X7xfYohhX61ysHK0crdyuHLDcsFyznLNctJy6HLvculy8nL0cvdyAXPz' +
        'cgNz+nLmkeeR6JHpkeqR65Hske2R7pHvkfCR8ZHykfOR9JH1kfaR95H4kfmR+pH7kfyR/ZH+kf+RAJIBkgKSA5IEkgWSBpIHkgiSCZIKkguS' +
        'DJINkg6SD5IQkhGSEpITkhSSFZIWkheSGJIZkhqSG5Ickh2SHpIfkiCSIZIikiOSJJIlkiaSJ5IokimSKpIrkiySLZIuki+SMJIxkjKSM5I0' +
        'kjWSNpI3kjiSOZI6kjuSPJI9kj6SP5JAkkGSQpJDkkSSRZL7chdzE3MhcwpzHnMdcxVzInM5cyVzLHM4czFzUHNNc1dzYHNsc29zfnMbgiVZ' +
        '55gkWQJZY5lnmWiZaZlqmWuZbJl0mXeZfZmAmYSZh5mKmY2ZkJmRmZOZlJmVmYBekV6LXpZepV6gXrletV6+XrNeU43SXtFe217oXupeuoHE' +
        'X8lf1l/PXwNg7l8EYOFf5F/+XwVgBmDqX+1f+F8ZYDVgJmAbYA9gDWApYCtgCmA/YCFgeGB5YHtgemBCYEaSR5JIkkmSSpJLkkySTZJOkk+S' +
        'UJJRklKSU5JUklWSVpJXkliSWZJakluSXJJdkl6SX5JgkmGSYpJjkmSSZZJmkmeSaJJpkmqSa5Jskm2SbpJvknCScZJyknOSdZJ2kneSeJJ5' +
        'knqSe5J8kn2SfpJ/koCSgZKCkoOShJKFkoaSh5KIkomSipKLkoySjZKPkpCSkZKSkpOSlJKVkpaSl5KYkpmSmpKbkpySnZKekp+SoJKhkqKS' +
        'o5KkkqWSppKnkmpgfWCWYJpgrWCdYINgkmCMYJtg7GC7YLFg3WDYYMZg2mC0YCBhJmEVYSNh9GAAYQ5hK2FKYXVhrGGUYadht2HUYfVh3V+z' +
        'lumV65XxlfOV9ZX2lfyV/pUDlgSWBpYIlgqWC5YMlg2WD5YSlhWWFpYXlhmWGpYsTj9yFWI1bFRsXGxKbKNshWyQbJRsjGxobGlsdGx2bIZs' +
        'qWzQbNRsrWz3bPhs8WzXbLJs4GzWbPps62zubLFs02zvbP5sqJKpkqqSq5Kskq2Sr5KwkrGSspKzkrSStZK2kreSuJK5krqSu5K8kr2SvpK/' +
        'ksCSwZLCksOSxJLFksaSx5LJksqSy5LMks2SzpLPktCS0ZLSktOS1JLVktaS15LYktmS2pLbktyS3ZLekt+S4JLhkuKS45LkkuWS5pLnkuiS' +
        '6ZLqkuuS7JLtku6S75LwkvGS8pLzkvSS9ZL2kveS+JL5kvqS+5L8kv2S/pL/kgCTAZMCkwOTBJMFkwaTB5MIkwmTOW0nbQxtQ21IbQdtBG0Z' +
        'bQ5tK21NbS5tNW0abU9tUm1UbTNtkW1vbZ5toG1ebZNtlG1cbWBtfG1jbRpux23Fbd5tDm6/beBtEW7mbd1t2W0WbqttDG6ubStubm5Obmtu' +
        'sm5fboZuU25UbjJuJW5Ebt9usW6YbuBuLW/ibqVup269brtut27XbrRuz26PbsJun25ib0ZvR28kbxVv+W4vbzZvS290bypvCW8pb4lvjW+M' +
        'b3hvcm98b3pv0W8KkwuTDJMNkw6TD5MQkxGTEpMTkxSTFZMWkxeTGJMZkxqTG5Mckx2THpMfkyCTIZMikyOTJJMlkyaTJ5MokymTKpMrkyyT' +
        'LZMuky+TMJMxkzKTM5M0kzWTNpM3kziTOZM6kzuTPJM9kz+TQJNBk0KTQ5NEk0WTRpNHk0iTSZNKk0uTTJNNk06TT5NQk1GTUpNTk1STVZNW' +
        'k1eTWJNZk1qTW5Nck12TXpNfk2CTYZNik2OTZJNlk2aTZ5Nok2mTa5PJb6dvuW+2b8Jv4W/ub95v4G/vbxpwI3AbcDlwNXBPcF5wgFuEW5Vb' +
        'k1ulW7hbL3WemjRk5FvuWzCJ8FtHjgeLto/Tj9WP5Y/uj+SP6Y/mj/OP6I8FkASQC5AmkBGQDZAWkCGQNZA2kC2QL5BEkFGQUpBQkGiQWJBi' +
        'kFuQuWZ0kH2QgpCIkIOQi5BQX1dfVl9YXztcq1RQXFlccVtjXGZcvH8qXylfLV90gjxfO5tuXIFZg1mNWalZqlmjWWyTbZNuk2+TcJNxk3KT' +
        'c5N0k3WTdpN3k3iTeZN6k3uTfJN9k36Tf5OAk4GTgpODk4SThZOGk4eTiJOJk4qTi5OMk42TjpOQk5GTkpOTk5STlZOWk5eTmJOZk5qTm5Oc' +
        'k52TnpOfk6CToZOik6OTpJOlk6aTp5Ook6mTqpOrk6yTrZOuk6+TsJOxk7KTs5O0k7WTtpO3k7iTuZO6k7uTvJO9k76Tv5PAk8GTwpPDk8ST' +
        'xZPGk8eTyJPJk8uTzJPNk5dZylmrWZ5ZpFnSWbJZr1nXWb5ZBVoGWt1ZCFrjWdhZ+VkMWglaMlo0WhFaI1oTWkBaZ1pKWlVaPFpiWnVa7ICq' +
        'Wptad1p6Wr5a61qyWtJa1Fq4WuBa41rxWtZa5lrYWtxaCVsXWxZbMls3W0BbFVwcXFpbZVtzW1FbU1tiW3Wad5p4mnqaf5p9moCagZqFmoia' +
        'ipqQmpKak5qWmpiam5qcmp2an5qgmqKao5qlmqean36hfqN+pX6ofql+zpPPk9CT0ZPSk9OT1JPVk9eT2JPZk9qT25Pck92T3pPfk+CT4ZPi' +
        'k+OT5JPlk+aT55Pok+mT6pPrk+yT7ZPuk++T8JPxk/KT85P0k/WT9pP3k/iT+ZP6k/uT/JP9k/6T/5MAlAGUApQDlASUBZQGlAeUCJQJlAqU' +
        'C5QMlA2UDpQPlBCUEZQSlBOUFJQVlBaUF5QYlBmUGpQblByUHZQelB+UIJQhlCKUI5QklCWUJpQnlCiUKZQqlCuULJQtlC6UrX6wfr5+wH7B' +
        'fsJ+yX7Lfsx+0H7Uftd+237gfuF+6H7rfu5+737xfvJ+DX/2fvp++37+fgF/An8Dfwd/CH8Lfwx/D38RfxJ/F38Zfxx/G38ffyF/In8jfyR/' +
        'JX8mfyd/Kn8rfyx/LX8vfzB/MX8yfzN/NX96Xn91210+dZWQjnORc65zonOfc89zwnPRc7dzs3PAc8lzyHPlc9lzfJgKdOlz53Pec7pz8nMP' +
        'dCp0W3QmdCV0KHQwdC50LHQvlDCUMZQylDOUNJQ1lDaUN5Q4lDmUOpQ7lDyUPZQ/lECUQZRClEOURJRFlEaUR5RIlEmUSpRLlEyUTZROlE+U' +
        'UJRRlFKUU5RUlFWUVpRXlFiUWZRalFuUXJRdlF6UX5RglGGUYpRjlGSUZZRmlGeUaJRplGqUbJRtlG6Ub5RwlHGUcpRzlHSUdZR2lHeUeJR5' +
        'lHqUe5R8lH2UfpR/lICUgZSClIOUhJSRlJaUmJTHlM+U05TUlNqU5pT7lByVIJUbdBp0QXRcdFd0VXRZdHd0bXR+dJx0jnSAdIF0h3SLdJ50' +
        'qHSpdJB0p3TSdLp06pfrl+yXTGdTZ15nSGdpZ6Vnh2dqZ3NnmGenZ3VnqGeeZ61ni2d3Z3xn8GcJaNhnCmjpZ7BnDGjZZ7Vn2mezZ91nAGjD' +
        'Z7hn4mcOaMFn/WcyaDNoYGhhaE5oYmhEaGRog2gdaFVoZmhBaGdoQGg+aEpoSWgpaLVoj2h0aHdok2hraMJobmn8aB9pIGn5aCeVM5U9lUOV' +
        'SJVLlVWVWpVglW6VdJV1lXeVeJV5lXqVe5V8lX2VfpWAlYGVgpWDlYSVhZWGlYeViJWJlYqVi5WMlY2VjpWPlZCVkZWSlZOVlJWVlZaVl5WY' +
        'lZmVmpWblZyVnZWelZ+VoJWhlaKVo5WklaWVppWnlaiVqZWqlauVrJWtla6Vr5WwlbGVspWzlbSVtZW2lbeVuJW5lbqVu5W8lb2VvpW/lcCV' +
        'wZXClcOVxJXFlcaVx5XIlcmVypXLlSRp8GgLaQFpV2njaBBpcWk5aWBpQmldaYRpa2mAaZhpeGk0acxph2mIac5piWlmaWNpeWmbaadpu2mr' +
        'aa1p1GmxacFpymnfaZVp4GmNaf9pL2rtaRdqGGplavJpRGo+aqBqUGpbajVqjmp5aj1qKGpYanxqkWqQaqlql2qrajdzUnOBa4Jrh2uEa5Jr' +
        'k2uNa5prm2uha6pra49tj3GPco9zj3WPdo94j3ePeY96j3yPfo+Bj4KPhI+Hj4uPzJXNlc6Vz5XQldGV0pXTldSV1ZXWldeV2JXZldqV25Xc' +
        'ld2V3pXfleCV4ZXileOV5JXlleaV55Xslf+VB5YTlhiWG5YeliCWI5YkliWWJpYnliiWKZYrliyWLZYvljCWN5Y4ljmWOpY+lkGWQ5ZKlk6W' +
        'T5ZRllKWU5ZWlleWWJZZllqWXJZdll6WYJZjlmWWZpZrlm2WbpZvlnCWcZZzlniWeZZ6lnuWfJZ9ln6Wf5aAloGWgpaDloSWh5aJloqWjY+O' +
        'j4+PmI+aj86OC2IXYhtiH2IiYiFiJWIkYixi54HvdPR0/3QPdRF1E3U0Ze5l72XwZQpmGWZyZwNmFWYAZoVw92YdZjRmMWY2ZjVmBoBfZlRm' +
        'QWZPZlZmYWZXZndmhGaMZqdmnWa+Zttm3GbmZulmMo0zjTaNO409jUCNRY1GjUiNSY1HjU2NVY1ZjceJyonLicyJzonPidCJ0Ylucp9yXXJm' +
        'cm9yfnJ/coRyi3KNco9yknIIYzJjsGOMlo6WkZaSlpOWlZaWlpqWm5adlp6Wn5aglqGWopajlqSWpZamlqiWqZaqlquWrJatlq6Wr5axlrKW' +
        'tJa1lreWuJa6lruWv5bClsOWyJbKlsuW0JbRltOW1JbWlteW2JbZltqW25bclt2W3pbfluGW4pbjluSW5ZbmlueW65bslu2W7pbwlvGW8pb0' +
        'lvWW+Jb6lvuW/Jb9lv+WApcDlwWXCpcLlwyXEJcRlxKXFJcVlxeXGJcZlxqXG5cdlx+XIJc/ZNhkBIDqa/Nr/Wv1a/lrBWwHbAZsDWwVbBhs' +
        'GWwabCFsKWwkbCpsMmw1ZVVla2VNclJyVnIwcmKGFlKfgJyAk4C8gApnvYCxgKuArYC0gLeA54DogOmA6oDbgMKAxIDZgM2A14AQZ92A64Dx' +
        'gPSA7YANgQ6B8oD8gBVnEoFajDaBHoEsgRiBMoFIgUyBU4F0gVmBWoFxgWCBaYF8gX2BbYFngU1YtVqIgYKBkYHVbqOBqoHMgSZnyoG7gSGX' +
        'IpcjlySXJZcmlyeXKJcplyuXLJculy+XMZczlzSXNZc2lzeXOpc7lzyXPZc/l0CXQZdCl0OXRJdFl0aXR5dIl0mXSpdLl0yXTZdOl0+XUJdR' +
        'l1SXVZdXl1iXWpdcl12XX5djl2SXZpdnl2iXapdrl2yXbZdul2+XcJdxl3KXdZd3l3iXeZd6l3uXfZd+l3+XgJeBl4KXg5eEl4aXh5eIl4mX' +
        'ipeMl46Xj5eQl5OXlZeWl5eXmZeal5uXnJedl8GBpoEkazdrOWtDa0ZrWWvRmNKY05jVmNmY2piza0BfwmvziZBlUZ+TZbxlxmXEZcNlzGXO' +
        'ZdJl1mWAcJxwlnCdcLtwwHC3cKtwsXDocMpwEHETcRZxL3ExcXNxXHFocUVxcnFKcXhxenGYcbNxtXGocaBx4HHUcedx+XEdcihybHAYcWZx' +
        'uXE+Yj1iQ2JIYkliO3lAeUZ5SXlbeVx5U3laeWJ5V3lgeW95Z3l6eYV5inmaead5s3nRX9Bfnpefl6GXopekl6WXppenl6iXqZeql6yXrpew' +
        'l7GXs5e1l7aXt5e4l7mXupe7l7yXvZe+l7+XwJfBl8KXw5fEl8WXxpfHl8iXyZfKl8uXzJfNl86Xz5fQl9GX0pfTl9SX1ZfWl9eX2JfZl9qX' +
        '25fcl92X3pffl+CX4Zfil+OX5Jfll+iX7pfvl/CX8Zfyl/SX95f4l/mX+pf7l/yX/Zf+l/+XAJgBmAKYA5gEmAWYBpgHmAiYCZgKmAuYDJgN' +
        'mA6YPGBdYFpgZ2BBYFlgY2CrYAZhDWFdYalhnWHLYdFhBmKAgH+Ak2z2bPxt9nf4dwB4CXgXeBh4EXirZS14HHgdeDl4Ong7eB94PHgleCx4' +
        'I3gpeE54bXhWeFd4JnhQeEd4THhqeJt4k3iaeId4nHiheKN4sni5eKV41HjZeMl47HjyeAV59HgTeSR5Hnk0eZuf+Z77nvye8XYEdw13+XYH' +
        'dwh3Gncidxl3LXcmdzV3OHdQd1F3R3dDd1p3aHcPmBCYEZgSmBOYFJgVmBaYF5gYmBmYGpgbmByYHZgemB+YIJghmCKYI5gkmCWYJpgnmCiY' +
        'KZgqmCuYLJgtmC6YL5gwmDGYMpgzmDSYNZg2mDeYOJg5mDqYO5g8mD2YPpg/mECYQZhCmEOYRJhFmEaYR5hImEmYSphLmEyYTZhOmE+YUJhR' +
        'mFKYU5hUmFWYVphXmFiYWZhamFuYXJhdmF6YX5hgmGGYYphjmGSYZZhmmGeYaJhpmGqYa5hsmG2Ybphid2V3f3eNd313gHeMd5F3n3egd7B3' +
        'tXe9dzp1QHVOdUt1SHVbdXJ1eXWDdVh/YX9ff0iKaH90f3F/eX+Bf35/zXbldjKIhZSGlIeUi5SKlIyUjZSPlJCUlJSXlJWUmpSblJyUo5Sk' +
        'lKuUqpStlKyUr5SwlLKUtJS2lLeUuJS5lLqUvJS9lL+UxJTIlMmUypTLlMyUzZTOlNCU0ZTSlNWU1pTXlNmU2JTblN6U35TglOKU5JTllOeU' +
        '6JTqlG+YcJhxmHKYc5h0mIuYjpiSmJWYmZijmKiYqZiqmKuYrJitmK6Yr5iwmLGYspizmLSYtZi2mLeYuJi5mLqYu5i8mL2Yvpi/mMCYwZjC' +
        'mMOYxJjFmMaYx5jImMmYypjLmMyYzZjPmNCY1JjWmNeY25jcmN2Y4JjhmOKY45jkmOWY5pjpmOqY65jsmO2Y7pjvmPCY8ZjymPOY9Jj1mPaY' +
        '95j4mPmY+pj7mPyY/Zj+mP+YAJkBmQKZA5kEmQWZBpkHmemU65TulO+U85T0lPWU95T5lPyU/ZT/lAOVApUGlQeVCZUKlQ2VDpUPlRKVE5UU' +
        'lRWVFpUYlRuVHZUelR+VIpUqlSuVKZUslTGVMpU0lTaVN5U4lTyVPpU/lUKVNZVElUWVRpVJlUyVTpVPlVKVU5VUlVaVV5VYlVmVW5VelV+V' +
        'XZVhlWKVZJVllWaVZ5VolWmVapVrlWyVb5VxlXKVc5U6led37HfJltV57Xnjeet5BnpHXQN6AnoeehR6CJkJmQqZC5kMmQ6ZD5kRmRKZE5kU' +
        'mRWZFpkXmRiZGZkamRuZHJkdmR6ZH5kgmSGZIpkjmSSZJZkmmSeZKJkpmSqZK5ksmS2ZL5kwmTGZMpkzmTSZNZk2mTeZOJk5mTqZO5k8mT2Z' +
        'Ppk/mUCZQZlCmUOZRJlFmUaZR5lImUmZSplLmUyZTZlOmU+ZUJlRmVKZU5lWmVeZWJlZmVqZW5lcmV2ZXplfmWCZYZlimWSZZplzmXiZeZl7' +
        'mX6ZgpmDmYmZOXo3elF6z56lmXB6iHaOdpN2mXakdt504HQsdSCeIp4onimeKp4rniyeMp4xnjaeOJ43njmeOp4+nkGeQp5EnkaeR55Inkme' +
        'S55Mnk6eUZ5VnleeWp5bnlyeXp5jnmaeZ55onmmeap5rnmyecZ5tnnOeknWUdZZ1oHWddax1o3WzdbR1uHXEdbF1sHXDdcJ11nXNdeN16HXm' +
        'deR163XndQN28XX8df91EHYAdgV2DHYXdgp2JXYYdhV2GXaMmY6ZmpmbmZyZnZmemZ+ZoJmhmaKZo5mkmaaZp5mpmaqZq5msma2ZrpmvmbCZ' +
        'sZmymbOZtJm1mbaZt5m4mbmZupm7mbyZvZm+mb+ZwJnBmcKZw5nEmcWZxpnHmciZyZnKmcuZzJnNmc6Zz5nQmdGZ0pnTmdSZ1ZnWmdeZ2JnZ' +
        'mdqZ25ncmd2Z3pnfmeCZ4ZnimeOZ5JnlmeaZ55nomemZ6pnrmeyZ7Znume+Z8JnxmfKZ85n0mfWZ9pn3mfiZ+Zkbdjx2InYgdkB2LXYwdj92' +
        'NXZDdj52M3ZNdl52VHZcdlZ2a3Zvdsp/5np4enl6gHqGeoh6lXqmeqB6rHqoeq16s3pkiGmIcoh9iH+IgoiiiMaIt4i8iMmI4ojOiOOI5Yjx' +
        'iBqJ/IjoiP6I8IghiRmJE4kbiQqJNIkriTaJQYlmiXuJi3XlgLJ2tHbcdxKAFIAWgByAIIAigCWAJoAngCmAKIAxgAuANYBDgEaATYBSgGmA' +
        'cYCDiXiYgJiDmPqZ+5n8mf2Z/pn/mQCaAZoCmgOaBJoFmgaaB5oImgmaCpoLmgyaDZoOmg+aEJoRmhKaE5oUmhWaFpoXmhiaGZoamhuaHJod' +
        'mh6aH5ogmiGaIpojmiSaJZommieaKJopmiqaK5osmi2aLpovmjCaMZoymjOaNJo1mjaaN5o4mjmaOpo7mjyaPZo+mj+aQJpBmkKaQ5pEmkWa' +
        'RppHmkiaSZpKmkuaTJpNmk6aT5pQmlGaUppTmlSaVZpWmleaWJpZmomYjJiNmI+YlJiamJuYnpifmKGYopilmKaYTYZUhmyGboZ/hnqGfIZ7' +
        'hqiGjYaLhqyGnYanhqOGqoaThqmGtobEhrWGzoawhrqGsYavhsmGz4a0humG8Ybyhu2G84bQhhOH3ob0ht+G2IbRhgOHB4f4hgiHCocNhwmH' +
        'I4c7hx6HJYcuhxqHPodIhzSHMYcphzeHP4eChyKHfYd+h3uHYIdwh0yHboeLh1OHY4d8h2SHWYdlh5OHr4eoh9KHWppbmlyaXZpeml+aYJph' +
        'mmKaY5pkmmWaZppnmmiaaZpqmmuacpqDmomajZqOmpSalZqZmqaaqZqqmquarJqtmq6ar5qymrOatJq1mrmau5q9mr6av5rDmsSaxprHmsia' +
        'yZrKms2azprPmtCa0prUmtWa1prXmtma2prbmtya3ZremuCa4prjmuSa5Zrnmuia6Zrqmuya7prwmvGa8przmvSa9Zr2mvea+Jr6mvya/Zr+' +
        'mv+aAJsBmwKbBJsFmwabxoeIh4WHrYeXh4OHq4flh6yHtYezh8uH04e9h9GHwIfKh9uH6ofgh+6HFogTiP6HCogbiCGIOYg8iDZ/Qn9Ef0V/' +
        'EIL6ev16CHsDewR7FXsKeyt7D3tHezh7KnsZey57MXsgeyV7JHszez57HntYe1p7RXt1e0x7XXtge257e3tie3J7cXuQe6Z7p3u4e6x7nXuo' +
        'e4V7qnuce6J7q3u0e9F7wXvMe9172nvle+Z76nsMfP57/HsPfBZ8C3wHmwmbCpsLmwybDZsOmxCbEZsSmxSbFZsWmxebGJsZmxqbG5scmx2b' +
        'HpsgmyGbIpskmyWbJpsnmyibKZsqmyubLJstmy6bMJsxmzObNJs1mzabN5s4mzmbOps9mz6bP5tAm0abSptLm0ybTptQm1KbU5tVm1abV5tY' +
        'm1mbWptbm1ybXZtem1+bYJthm2KbY5tkm2WbZptnm2ibaZtqm2ubbJttm26bb5twm3Gbcptzm3SbdZt2m3ebeJt5m3qbe5sffCp8Jnw4fEF8' +
        'QHz+gQGCAoIEguyBRIghgiKCI4Itgi+CKIIrgjiCO4IzgjSCPoJEgkmCS4JPglqCX4Jogn6IhYiIiNiI34heiZ1/n3+nf69/sH+yf3x8SWWR' +
        'fJ18nHyefKJ8sny8fL18wXzHfMx8zXzIfMV813zofG6CqGa/f85/1X/lf+F/5n/pf+5/83/4fHd9pn2ufUd+m364nrSec42EjZSNkY2xjWeN' +
        'bY1HjEmMSpFQkU6RT5FkkXybfZt+m3+bgJuBm4Kbg5uEm4WbhpuHm4ibiZuKm4ubjJuNm46bj5uQm5GbkpuTm5SblZuWm5ebmJuZm5qbm5uc' +
        'm52bnpufm6CboZuim6ObpJulm6abp5uom6mbqpurm6ybrZuum6+bsJuxm7Kbs5u0m7Wbtpu3m7ibuZu6m7ubvJu9m76bv5vAm8GbwpvDm8Sb' +
        'xZvGm8ebyJvJm8qby5vMm82bzpvPm9Cb0ZvSm9Ob1JvVm9ab15vYm9mb2pvbm2KRYZFwkWmRb5F9kX6RcpF0kXmRjJGFkZCRjZGRkaKRo5Gq' +
        'ka2RrpGvkbWRtJG6kVWMfp64jeuNBY5ZjmmOtY2/jbyNuo3EjdaN143ajd6Nzo3PjduNxo3sjfeN+I3jjfmN+43kjQmO/Y0Ujh2OH44sji6O' +
        'I44vjjqOQI45jjWOPY4xjkmOQY5CjlGOUo5KjnCOdo58jm+OdI6Fjo+OlI6QjpyOno54jIKMioyFjJiMlIybZdaJ3onaidyJ3Jvdm96b35vg' +
        'm+Gb4pvjm+Sb5Zvmm+eb6Jvpm+qb65vsm+2b7pvvm/Cb8Zvym/Ob9Jv1m/ab95v4m/mb+pv7m/yb/Zv+m/+bAJwBnAKcA5wEnAWcBpwHnAic' +
        'CZwKnAucDJwNnA6cD5wQnBGcEpwTnBScFZwWnBecGJwZnBqcG5wcnB2cHpwfnCCcIZwinCOcJJwlnCacJ5wonCmcKpwrnCycLZwunC+cMJwx' +
        'nDKcM5w0nDWcNpw3nDicOZw6nDuc5Ynrie+JPoomi1OX6Zbzlu+WBpcBlwiXD5cOlyqXLZcwlz6XgJ+Dn4Wfhp+Hn4ifiZ+Kn4yf/p4Lnw2f' +
        'uZa8lr2WzpbSlr934JaOkq6SyJI+k2qTypOPkz6Ua5R/nIKchZyGnIeciJwjeoucjpyQnJGckpyUnJWcmpybnJ6cn5ygnKGcopyjnKWcppyn' +
        'nKicqZyrnK2crpywnLGcspyznLSctZy2nLecupy7nLycvZzEnMWcxpzHnMqcy5w8nD2cPpw/nECcQZxCnEOcRJxFnEacR5xInEmcSpxLnEyc' +
        'TZxOnE+cUJxRnFKcU5xUnFWcVpxXnFicWZxanFucXJxdnF6cX5xgnGGcYpxjnGScZZxmnGecaJxpnGqca5xsnG2cbpxvnHCccZxynHOcdJx1' +
        'nHacd5x4nHmcepx7nH2cfpyAnIOchJyJnIqcjJyPnJOclpyXnJicmZydnKqcrJyvnLmcvpy/nMCcwZzCnMicyZzRnNKc2pzbnOCc4ZzMnM2c' +
        'zpzPnNCc05zUnNWc15zYnNmc3JzdnN+c4px8l4WXkZeSl5SXr5erl6OXspe0l7GasJq3mlietpq6mryawZrAmsWawprLmsya0ZpFm0ObR5tJ' +
        'm0ibTZtRm+iYDZkumVWZVJnfmuGa5prvmuua+5rtmvmaCJsPmxObH5sjm72evp47foKeh56Inouekp7Wk52en57bntye3Z7gnt+e4p7pnuee' +
        '5Z7qnu+eIp8sny+fOZ83nz2fPp9En+Oc5JzlnOac55zonOmc6pzrnOyc7ZzunO+c8JzxnPKc85z0nPWc9pz3nPic+Zz6nPuc/Jz9nP6c/5wA' +
        'nQGdAp0DnQSdBZ0GnQedCJ0JnQqdC50MnQ2dDp0PnRCdEZ0SnROdFJ0VnRadF50YnRmdGp0bnRydHZ0enR+dIJ0hnSKdI50knSWdJp0nnSid' +
        'KZ0qnSudLJ0tnS6dL50wnTGdMp0znTSdNZ02nTedOJ05nTqdO508nT2dPp0/nUCdQZ1CnTTiNeI24jfiOOI54jriO+I84j3iPuI/4kDiQeJC' +
        '4kPiROJF4kbiR+JI4kniSuJL4kziTeJO4k/iUOJR4lLiU+JU4lXiVuJX4ljiWeJa4lviXOJd4l7iX+Jg4mHiYuJj4mTiZeJm4mfiaOJp4mri' +
        'a+Js4m3ibuJv4nDiceJy4nPidOJ14nbid+J44nnieuJ74nzifeJ+4n/igOKB4oLig+KE4oXihuKH4ojiieKK4ovijOKN4o7ij+KQ4pHiQ51E' +
        'nUWdRp1HnUidSZ1KnUudTJ1NnU6dT51QnVGdUp1TnVSdVZ1WnVedWJ1ZnVqdW51cnV2dXp1fnWCdYZ1inWOdZJ1lnWadZ51onWmdap1rnWyd' +
        'bZ1unW+dcJ1xnXKdc510nXWddp13nXideZ16nXudfJ19nX6df52AnYGdgp2DnYSdhZ2GnYediJ2JnYqdi52MnY2djp2PnZCdkZ2SnZOdlJ2V' +
        'nZadl52YnZmdmp2bnZydnZ2enZ+doJ2hnaKdkuKT4pTileKW4pfimOKZ4prim+Kc4p3inuKf4qDioeKi4qPipOKl4qbip+Ko4qniquKr4qzi' +
        'reKu4q/isOKx4rLis+K04rXituK34rjiueK64rvivOK94r7iv+LA4sHiwuLD4sTixeLG4sfiyOLJ4sriy+LM4s3izuLP4tDi0eLS4tPi1OLV' +
        '4tbi1+LY4tni2uLb4tzi3eLe4t/i4OLh4uLi4+Lk4uXi5uLn4uji6eLq4uvi7OLt4u7i7+KjnaSdpZ2mnaedqJ2pnaqdq52sna2drp2vnbCd' +
        'sZ2ynbOdtJ21nbadt524nbmdup27nbydvZ2+nb+dwJ3BncKdw53EncWdxp3HncidyZ3KncudzJ3Nnc6dz53QndGd0p3TndSd1Z3Wnded2J3Z' +
        'ndqd253cnd2d3p3fneCd4Z3ineOd5J3lnead553onemd6p3rneyd7Z3une+d8J3xnfKd8530nfWd9p33nfid+Z36nfud/J39nf6d/50AngGe' +
        'Ap7w4vHi8uLz4vTi9eL24vfi+OL54vri++L84v3i/uL/4gDjAeMC4wPjBOMF4wbjB+MI4wnjCuML4wzjDeMO4w/jEOMR4xLjE+MU4xXjFuMX' +
        '4xjjGeMa4xvjHOMd4x7jH+Mg4yHjIuMj4yTjJeMm4yfjKOMp4yrjK+Ms4y3jLuMv4zDjMeMy4zPjNOM14zbjN+M44znjOuM74zzjPeM+4z/j' +
        'QONB40LjQ+NE40XjRuNH40jjSeNK40vjTONN4wOeBJ4FngaeB54IngmeCp4LngyeDZ4Ong+eEJ4RnhKeE54UnhWeFp4XnhieGZ4anhueHJ4d' +
        'nh6eJJ4nni6eMJ40njuePJ5Ank2eUJ5SnlOeVJ5WnlmeXZ5fnmCeYZ5inmWebp5vnnKedJ51nnaed554nnmeep57nnyefZ6AnoGeg56EnoWe' +
        'hp6JnoqejJ6Nno6ej56QnpGelJ6Vnpael56Ynpmemp6bnpyenp6gnqGeop6jnqSepZ6nnqieqZ6qnk7jT+NQ41HjUuNT41TjVeNW41fjWONZ' +
        '41rjW+Nc413jXuNf42DjYeNi42PjZONl42bjZ+No42njauNr42zjbeNu42/jcONx43Ljc+N043XjduN343jjeeN643vjfON9437jf+OA44Hj' +
        'guOD44TjheOG44fjiOOJ44rji+OM443jjuOP45DjkeOS45PjlOOV45bjl+OY45njmuOb45zjneOe45/joOOh46Ljo+Ok46XjpuOn46jjqeOq' +
        '46vjq56snq2erp6vnrCesZ6ynrOetZ62nreeuZ66nryev57AnsGewp7DnsWexp7Hnsieyp7Lnsye0J7SntOe1Z7Wntee2Z7ant6e4Z7jnuSe' +
        '5p7onuue7J7tnu6e8J7xnvKe8570nvWe9p73nvie+p79nv+eAJ8BnwKfA58EnwWfBp8HnwifCZ8KnwyfD58RnxKfFJ8VnxafGJ8anxufHJ8d' +
        'nx6fH58hnyOfJJ8lnyafJ58onymfKp8rny2fLp8wnzGfrOOt467jr+Ow47HjsuOz47TjteO247fjuOO547rju+O8473jvuO/48DjwePC48Pj' +
        'xOPF48bjx+PI48njyuPL48zjzePO48/j0OPR49Lj0+PU49Xj1uPX49jj2ePa49vj3OPd497j3+Pg4+Hj4uPj4+Tj5ePm4+fj6OPp4+rj6+Ps' +
        '4+3j7uPv4/Dj8ePy4/Pj9OP14/bj9+P44/nj+uP74/zj/eP+4//jAOQB5ALkA+QE5AXkBuQH5AjkCeQynzOfNJ81nzafOJ86nzyfP59An0Gf' +
        'Qp9Dn0WfRp9Hn0ifSZ9Kn0ufTJ9Nn06fT59Sn1OfVJ9Vn1afV59Yn1mfWp9bn1yfXZ9en1+fYJ9hn2KfY59kn2WfZp9nn2ifaZ9qn2ufbJ9t' +
        'n26fb59wn3Gfcp9zn3SfdZ92n3efeJ95n3qfe598n32ffp+Bn4KfjZ+On4+fkJ+Rn5Kfk5+Un5Wflp+Xn5ifnJ+dn56foZ+in6OfpJ+lnyz5' +
        'efmV+ef58fkK5AvkDOQN5A7kD+QQ5BHkEuQT5BTkFeQW5BfkGOQZ5BrkG+Qc5B3kHuQf5CDkIeQi5CPkJOQl5CbkJ+Qo5CnkKuQr5CzkLeQu' +
        '5C/kMOQx5DLkM+Q05DXkNuQ35DjkOeQ65DvkPOQ95D7kP+RA5EHkQuRD5ETkReRG5EfkSORJ5ErkS+RM5E3kTuRP5FDkUeRS5FPkVORV5Fbk' +
        'V+RY5FnkWuRb5FzkXeRe5F/kYORh5GLkY+Rk5GXkZuRn5Az6DfoO+g/6EfoT+hT6GPof+iD6Ifoj+iT6J/oo+in6gS4W6BfoGOiELnM0RzSI' +
        'LosutJ+eNRo2DjaMLpcubjkYObWfzznfOXM60Dm2n7efTjtuPOA8py4x6Lifqi5WQF9Bri43Q7Muti63LjvosUOsQ7su3UPWRGFGTEa5nyNH' +
        'KUd8R41Hyi5HSXpJfUmCSYNJhUmGSZ9Jm0m3SbZJup9V6KNMn0ygTKFMd0yiTBNNFE0VTRZNF00YTRlNrk27n2jkaeRq5GvkbORt5G7kb+Rw' +
        '5HHkcuRz5HTkdeR25HfkeOR55Hrke+R85H3kfuR/5IDkgeSC5IPkhOSF5Ibkh+SI5InkiuSL5IzkjeSO5I/kkOSR5JLkk+SU5JXkluSX5Jjk' +
        'meSa5JvknOSd5J7kn+Sg5KHkouSj5KTkpeSm5KfkqOSp5Krkq+Ss5K3kruSv5LDkseSy5LPktOS15Lbkt+S45LnkuuS75LzkveS+5L/kwOTB' +
        '5MLkw+TE5MXkAAABAAIAAwAEAAUABgAHAAgACQAKAAsADAANAA4ADwAQABEAEgATABQAFQAWABcAGAAZABoAGwAcAB0AHgAfACAAIQAiACMA' +
        'JAAlACYAJwAoACkAKgArACwALQAuAC8AMAAxADIAMwA0ADUANgA3ADgAOQA6ADsAPAA9AD4APwBAAEEAQgBDAEQARQBGAEcASABJAEoASwBM' +
        'AE0ATgBPAFAAUQBSAFMAVABVAFYAVwBYAFkAWgBbAFwAXQBeAF8AYABhAGIAYwBkAGUAZgBnAGgAaQBqAGsAbABtAG4AbwBwAHEAcgBzAHQA' +
        'dQB2AHcAeAB5AHoAewB8AH0AfgB/AKwgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

    run();
})();
