/* ===========================================================================
 *  串口调试助手 (Serial Debug Assistant) —— 接收脚本【精简版】
 *  GB2312/GBK 交给工具解码 -> 再转成 UTF-8（保存文件 / 转发）
 *  ---------------------------------------------------------------------------
 *  前置条件：设置里"编码类型"选 GB2312(或 GBK)。
 *            这时 receive.get() 拿到的已经是正确的中文，窗口显示也正常，
 *            所以本脚本不做码表解码，只负责"再转成 UTF-8"：
 *              1) 以 UTF-8 追加保存到文本文件（file.appendText 固定 UTF-8）
 *              2) 以 UTF-8 字节转发回串口（send.writeBytes）
 *              3) 可选：把文本在接收窗口里再显示一遍
 *
 *  优点：脚本很短，不用粘贴 6 万多字符的码表，运行开销几乎为零。
 *  缺点：依赖工具里的编码设置；若设为 UTF-8，中文仍然是乱码。
 *
 *  不依赖工具设置、自带完整 GBK 码表的版本：同目录 gbk2utf8.js
 * ===========================================================================
 */
(function () {
    'use strict';

    // ========================= 用户配置 =========================
    var SAVE_FILE = true;   // true = 以 UTF-8 追加保存到文本文件
    var SAVE_PATH = 'D:\\serial_utf8.log';
    var SEND_UTF8 = false;  // true = 以 UTF-8 字节转发出去（设备有回显会死循环！）
    var ECHO = false;       // true = 再把文本显示一遍（工具窗口已正常显示时不必开）
    var COLOR = 'Green';    // ECHO = true 时的显示颜色
    // ===========================================================

    function run() {
        // 工具按设置里的编码解好的字符串（9.x 用 receive.getString，8.x 用 receive.get）
        var text = (typeof receive.getString === 'function') ? receive.getString() : receive.get();
        if (text == null || text.length === 0) {
            return;
        }

        if (ECHO) {
            receive.write('\n' + text, COLOR);
            if (text.charAt(text.length - 1) !== '\n') {
                receive.write('\n');
            }
        }

        if (SAVE_FILE) {
            try {
                file.appendText(SAVE_PATH, text);       // 该 API 固定以 UTF-8 写入
            } catch (e) {
                console.error('save failed: ' + e);
            }
        }

        if (SEND_UTF8) {
            try {
                send.writeBytes(utf8Encode(text));      // 转成真正的 UTF-8 字节
            } catch (e) {
                console.error('send failed: ' + e);
            }
        }
        return;
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

    run();
})();
