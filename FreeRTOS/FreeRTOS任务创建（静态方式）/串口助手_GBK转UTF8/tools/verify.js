/*  verify.js  --  independent verification of the shipped gbk2utf8.js
 *  ---------------------------------------------------------------------------
 *  1) integrity   : embedded base64 table == tools/gbk_table.bin
 *  2) exhaustive  : all 23940 double-byte codes + 256 single bytes decoded by
 *                   the script are compared with Node/V8-ICU TextDecoder('gbk')
 *  3) utf-8       : utf8Encode/decodeUtf8/isValidUtf8 vs Buffer utf8
 *  4) end-to-end  : the shipped script is executed in a mock serial-assistant
 *                   host (receive/util/send/file/console) and the produced
 *                   display text / file content / sent bytes are asserted
 *  5) perf        : decode throughput of a 1 KB frame
 *
 *  usage: node tools/verify.js        (exit code 0 = all checks passed)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const here = __dirname;
const SHIPPED = path.join(here, '..', 'gbk2utf8.js');
const BINPATH = path.join(here, 'gbk_table.bin');
const DOUBLE_SLOTS = 126 * 190;
const SINGLE_OFFSET = DOUBLE_SLOTS * 2;

let checks = 0, failures = 0, notes = [];
function ok(cond, msg, extra) {
    checks++;
    if (cond) { console.log('  PASS  ' + msg); }
    else { failures++; console.log('  FAIL  ' + msg + (extra ? '   -> ' + extra : '')); }
}
function info(msg) { notes.push(msg); console.log('  ..    ' + msg); }
function section(t) { console.log('\n=== ' + t + ' ==='); }

const code = fs.readFileSync(SHIPPED, 'utf8');
const bin = fs.readFileSync(BINPATH);

// ---------------------------------------------------------------- 1. integrity
section('1. integrity of the shipped file');

const MARKER = '\n    run();\n})();';
ok(code.split(MARKER).length - 1 === 1, 'exactly one run(); entry point in the shipped script');

const testCode = code.replace(
    MARKER,
    '\n    globalThis.__TESTAPI__ = { decodeBytes: decodeBytes, decodeGbk: decodeGbk, ' +
    'decodeUtf8: decodeUtf8, isValidUtf8: isValidUtf8, utf8Encode: utf8Encode, ' +
    'base64ToBytes: base64ToBytes, GBK_B64: GBK_B64 };\n})();');

function makeHost() {
    const h = { writes: [], cleared: 0, files: [], sent: [], errors: [], bytes: null };
    h.sandbox = {
        receive: {
            getBytes: () => h.bytes,
            write: (s, c) => { h.writes.push({ s: s, c: c }); },
            clearLastReceived: () => { h.cleared++; }
        },
        util: {
            bytesToHexString: (b, upper) => {
                const hex = Buffer.from(Uint8Array.from(b)).toString('hex');
                const s = upper ? hex.toUpperCase() : hex;
                return s.replace(/(..)(?=.)/g, '$1 ');
            }
        },
        send: { writeBytes: (a) => { h.sent.push(Buffer.from(Uint8Array.from(a))); } },
        file: { appendText: (p, s) => { h.files.push({ path: p, text: s }); } },
        console: {
            log() { }, warn() { }, dir() { }, time() { }, timeEnd() { },
            error: (...a) => { h.errors.push(a.map(String).join(' ')); }
        },
        chart: { write() { } }
    };
    vm.createContext(h.sandbox);
    return h;
}
function exec(h, src, bytes) { h.bytes = bytes; vm.runInContext(src, h.sandbox, { filename: 'gbk2utf8.js' }); }

const host = makeHost();
exec(host, testCode, new Uint8Array(0));
const T = host.sandbox.__TESTAPI__;
ok(T && typeof T.decodeGbk === 'function', 'script internals exported for testing');

const table = T.base64ToBytes(T.GBK_B64);
ok(T.GBK_B64.length === Math.ceil(bin.length / 3) * 4,
   'embedded base64 length matches table size (' + T.GBK_B64.length + ' chars)');
ok(table.length === bin.length && Buffer.from(table).equals(bin),
   'embedded table is byte-identical to tools/gbk_table.bin',
   table.length + ' vs ' + bin.length);

// ------------------------------------------------------- 2. exhaustive decode
section('2. exhaustive GBK decode vs V8/ICU TextDecoder(\'gbk\')');

let icuGbk = true;
try { new TextDecoder('gbk'); } catch (e) { icuGbk = false; }
ok(icuGbk, 'node build provides TextDecoder("gbk") as an independent reference');

if (icuGbk) {
    const ref = new TextDecoder('gbk', { fatal: false });

    // every one of the 23940 double-byte slots, decoded by the script
    let diff = 0, firstDiff = null, undefinedSlots = 0;
    for (let lead = 0x81; lead <= 0xFE; lead++) {
        for (let trail = 0x40; trail <= 0xFE; trail++) {
            if (trail === 0x7F) { continue; }
            const bytes = Uint8Array.from([lead, trail]);
            const mine = T.decodeBytes(bytes, 'gbk');
            const theirs = ref.decode(bytes);
            if (theirs === '\uFFFD') { undefinedSlots++; }
            if (mine === theirs) { continue; }
            diff++;
            if (!firstDiff) {
                firstDiff = {
                    code: lead.toString(16) + trail.toString(16),
                    mine: 'U+' + mine.charCodeAt(0).toString(16),
                    ref: 'U+' + theirs.codePointAt(0).toString(16)
                };
            }
        }
    }
    ok(diff === 0, 'script decode is identical to the GBK standard on all ' + DOUBLE_SLOTS +
       ' double-byte slots (V8/ICU reference)', firstDiff ? JSON.stringify(firstDiff) : '');
    info('slots without a standard mapping: ' + undefinedSlots + ' (decoded as U+FFFD by both)');

    // single byte / broken pair: a byte followed by a byte that cannot be a trail
    let singleMismatch = 0, singleExact = 0, firstSingle = null;
    for (let b = 0; b < 256; b++) {
        const bytes = Uint8Array.from([b, 0x20]);
        const mine = T.decodeBytes(bytes, 'gbk');
        const theirs = ref.decode(bytes);
        if (mine === theirs) { singleExact++; continue; }
        singleMismatch++;
        if (!firstSingle) { firstSingle = { byte: b.toString(16), mine: JSON.stringify(mine), theirs: JSON.stringify(theirs) }; }
    }
    ok(singleMismatch === 0, 'single-byte / broken-pair handling is identical for all 256 byte values',
       firstSingle ? JSON.stringify(firstSingle) : '');
    info('single-byte cases matching the reference exactly: ' + singleExact + '/256');
}

// -------------------------------------------------------- reverse map (encoder)
const uniToGbk = new Map();
for (let lead = 0x81; lead <= 0xFE; lead++) {
    for (let trail = 0x40; trail <= 0xFE; trail++) {
        if (trail === 0x7F) { continue; }
        const idx = (lead - 0x81) * 190 + (trail - 0x40 - (trail > 0x7F ? 1 : 0));
        const cu = bin[idx * 2] | (bin[idx * 2 + 1] << 8);
        if (cu !== 0 && !uniToGbk.has(cu)) { uniToGbk.set(cu, [lead, trail]); }
    }
}
function gbkEncode(str) {
    const out = [];
    for (const ch of str) {
        const cu = ch.codePointAt(0);
        if (cu < 0x80 && ch !== '\u20ac') { out.push(cu); continue; }
        const p = uniToGbk.get(cu);
        if (!p) { throw new Error('char not in GBK: ' + ch + ' U+' + cu.toString(16)); }
        out.push(p[0], p[1]);
    }
    return Uint8Array.from(out);
}

section('3. UTF-8 encode / decode / validate');
const utf8Corpus = [
    'Hello, world!', '温度: 25.6C 湿度:60%', '你好，世界！', '中文测试：串口助手 GBK -> UTF-8',
    '一乙二十丁厂七卜人入八九几儿了力乃刀又', '￥‰§№→←↑↓℃㎡①⑴⒈─│┌┐',
    'emoji 😀 补充平面 𠀀', 'tab\there\nnewline\r\n', 'mixed 中文 abc 123 ！@#￥%……&*（）'
];
let encBad = 0, decBad = 0, valBad = 0;
for (const s of utf8Corpus) {
    const mine = Buffer.from(T.utf8Encode(s));
    if (!mine.equals(Buffer.from(s, 'utf8'))) { encBad++; console.log('     enc diff: ' + JSON.stringify(s)); }
    const valid = Buffer.from(s, 'utf8').toString('utf8') === s && /[^\x00-\x7F]/.test(s);
    const gotValid = T.isValidUtf8(Buffer.from(s, 'utf8'), Buffer.byteLength(s, 'utf8'));
    if (valid !== gotValid) { valBad++; console.log('     validity diff: ' + JSON.stringify(s) + ' ' + valid + ' vs ' + gotValid); }
    if (valid) {
        const dec = T.decodeUtf8(Buffer.from(s, 'utf8'), Buffer.byteLength(s, 'utf8'));
        if (dec !== s) { decBad++; console.log('     dec diff: ' + JSON.stringify(s) + ' -> ' + JSON.stringify(dec)); }
    }
}
ok(encBad === 0, 'utf8Encode matches Buffer.from(str,"utf8") on ' + utf8Corpus.length + ' strings');
ok(decBad === 0, 'decodeUtf8 round-trips every valid UTF-8 string');
ok(valBad === 0, 'isValidUtf8 agrees with the corpus validity');

const invalidUtf8 = [
    [0xC0, 0x80], [0xC1, 0xBF], [0xE0, 0x80, 0x80], [0xED, 0xA0, 0x80],
    [0xF0, 0x80, 0x80, 0x80], [0xF4, 0x90, 0x80, 0x80], [0xF5, 0x80, 0x80, 0x80],
    [0x80], [0xBF], [0xE4, 0xBD], [0xE4, 0xBD, 0x41], [0xFF], [0xC2]
];
let invalidOk = 0;
for (const a of invalidUtf8) {
    const u = Uint8Array.from(a);
    if (T.isValidUtf8(u, u.length) === false) { invalidOk++; }
    else { console.log('     should be invalid: ' + Buffer.from(u).toString('hex')); }
}
ok(invalidOk === invalidUtf8.length, 'isValidUtf8 rejects all ' + invalidUtf8.length + ' malformed sequences');

// ------------------------------------------------------------- 4. end-to-end
section('4. end-to-end run of the shipped script in a mock serial-assistant host');

function patch(src, from, to, label) {
    if (src.split(from).length - 1 !== 1) { throw new Error('config patch failed: ' + label + ' (' + from + ')'); }
    return src.replace(from, to);
}

const samples = [
    '温度: 25.6℃ 湿度:60%\r\n',
    '你好，世界！Hello 123',
    '中文测试：串口助手 GBK -> UTF-8\r\n',
    '一乙二十丁厂七卜人入八九几儿了力乃刀又',
    '寄存器值 = 0x1234，状态 OK\r\n'
];

let e2eBad = 0;
for (const text of samples) {
    const gbk = gbkEncode(text);
    const h = makeHost();
    exec(h, code, gbk);
    const out = h.writes.map((w) => w.s).join('');
    const want = '\n' + text + (text.endsWith('\n') ? '' : '\n');
    if (out !== want || h.cleared !== 1 || h.errors.length !== 0) {
        e2eBad++;
        console.log('     ' + JSON.stringify(text) + ' -> ' + JSON.stringify(out) +
                    ' cleared=' + h.cleared + ' errors=' + JSON.stringify(h.errors));
    }
}
ok(e2eBad === 0, 'displayed text is exact for ' + samples.length + ' GBK frames (raw line cleared)');

// ASCII-only frame must survive too
{
    const h = makeHost();
    exec(h, code, Buffer.from('boot ok\r\n', 'ascii'));
    ok(h.writes.map((w) => w.s).join('') === '\nboot ok\r\n', 'pure ASCII frame passes through unchanged');
}
// empty frame must not write anything
{
    const h = makeHost();
    exec(h, code, new Uint8Array(0));
    ok(h.writes.length === 0 && h.cleared === 0, 'empty frame is ignored');
    const h2 = makeHost();
    exec(h2, code, null);
    ok(h2.writes.length === 0, 'null frame is ignored');
}

// CLEAR_RAW = false
{
    const src = patch(code, 'var CLEAR_RAW = true;', 'var CLEAR_RAW = false;', 'CLEAR_RAW');
    const h = makeHost();
    exec(h, src, gbkEncode('中文'));
    ok(h.cleared === 0, 'CLEAR_RAW=false keeps the tool\'s own line');
}
// SHOW_HEX = true
{
    const src = patch(code, 'var SHOW_HEX = false;', 'var SHOW_HEX = true;', 'SHOW_HEX');
    const h = makeHost();
    const gbk = gbkEncode('中文');
    exec(h, src, gbk);
    const out = h.writes.map((w) => w.s).join('');
    const expectHex = 'HEX -> ' + Buffer.from(gbk).toString('hex').toUpperCase().replace(/(..)(?=.)/g, '$1 ') + '\n';
    ok(out.indexOf(expectHex) >= 0, 'SHOW_HEX=true prints the raw hex line', JSON.stringify(out));
}
// SAVE_FILE = true  -> file.appendText receives the decoded string (API writes UTF-8)
{
    const src = patch(code, 'var SAVE_FILE = false;', 'var SAVE_FILE = true;', 'SAVE_FILE');
    const h = makeHost();
    const text = '保存测试：UTF-8 文件\r\n';
    exec(h, src, gbkEncode(text));
    ok(h.files.length === 1 && h.files[0].text === text,
       'SAVE_FILE=true appends the decoded text (UTF-8 via file.appendText)',
       JSON.stringify(h.files));
}
// SEND_UTF8 = true  -> send.writeBytes gets real UTF-8 bytes
{
    const src = patch(code, 'var SEND_UTF8 = false;', 'var SEND_UTF8 = true;', 'SEND_UTF8');
    const h = makeHost();
    const text = '转发测试 ABC 123';
    exec(h, src, gbkEncode(text));
    ok(h.sent.length === 1 && h.sent[0].equals(Buffer.from(text, 'utf8')),
       'SEND_UTF8=true forwards exactly the UTF-8 bytes',
       h.sent.length ? h.sent[0].toString('hex') : 'nothing sent');
}
// MODE = 'auto' : must accept both encodings
{
    const src = patch(code, "var MODE = 'gbk';", "var MODE = 'auto';", 'MODE');
    const text = '自动识别：GBK 与 UTF-8 都能显示\r\n';
    const h1 = makeHost(); exec(h1, src, gbkEncode(text));
    const h2 = makeHost(); exec(h2, src, Buffer.from(text, 'utf8'));
    ok(h1.writes.map((w) => w.s).join('') === h2.writes.map((w) => w.s).join('') &&
       h1.writes.map((w) => w.s).join('') === '\n' + text,
       "MODE='auto' decodes both a GBK frame and a UTF-8 frame identically");
}

// ------------------------------------------------------------- 5. lite variant
section('5. lite variant (gbk2utf8_lite.js)');

const liteCode = fs.readFileSync(path.join(here, '..', 'gbk2utf8_lite.js'), 'utf8');
function makeLiteHost(text) {
    const h = { writes: [], files: [], sent: [], errors: [], text: text };
    h.sandbox = {
        receive: {
            get: () => h.text,
            getString: () => h.text,
            write: (s, c) => { h.writes.push({ s: s, c: c }); }
        },
        send: { writeBytes: (a) => { h.sent.push(Buffer.from(Uint8Array.from(a))); } },
        file: { appendText: (p, s) => { h.files.push({ path: p, text: s }); } },
        console: {
            log() { }, warn() { },
            error: (...a) => { h.errors.push(a.map(String).join(' ')); }
        },
        util: {}, chart: { write() { } }
    };
    vm.createContext(h.sandbox);
    return h;
}
{
    const text = '精简版：编码设置=GB2312 时保存/转发 UTF-8\r\n';
    const h = makeLiteHost(text);
    vm.runInContext(liteCode, h.sandbox, { filename: 'gbk2utf8_lite.js' });
    ok(h.files.length === 1 && h.files[0].text === text && h.sent.length === 0 &&
       h.writes.length === 0 && h.errors.length === 0,
       'lite: saves the decoded text (UTF-8) and stays silent when ECHO/SEND are off');
}
{
    const src = patch(liteCode, 'var SEND_UTF8 = false;', 'var SEND_UTF8 = true;', 'lite SEND_UTF8');
    const text = '转发 UTF-8 字节';
    const h = makeLiteHost(text);
    vm.runInContext(src, h.sandbox, { filename: 'gbk2utf8_lite.js' });
    ok(h.sent.length === 1 && h.sent[0].equals(Buffer.from(text, 'utf8')),
       'lite: SEND_UTF8=true forwards exactly the UTF-8 bytes',
       h.sent.length ? h.sent[0].toString('hex') : 'nothing sent');
}
{
    const src = patch(liteCode, 'var ECHO = false;', 'var ECHO = true;', 'lite ECHO');
    const h = makeLiteHost('回显');
    vm.runInContext(src, h.sandbox, { filename: 'gbk2utf8_lite.js' });
    ok(h.writes.map((w) => w.s).join('') === '\n回显\n', 'lite: ECHO=true echoes the text once',
       JSON.stringify(h.writes));
}
{
    const h1 = makeLiteHost('');
    vm.runInContext(liteCode, h1.sandbox, { filename: 'gbk2utf8_lite.js' });
    const h2 = makeLiteHost(null);
    vm.runInContext(liteCode, h2.sandbox, { filename: 'gbk2utf8_lite.js' });
    ok(h1.files.length === 0 && h2.files.length === 0, 'lite: empty/null input is ignored');
}

// -------------------------------------------------------------- 6. performance
section('6. performance (informational)');

function bench(bytes, iterations, freshContext) {
    const t0 = process.hrtime.bigint();
    if (freshContext) {
        for (let i = 0; i < iterations; i++) {
            const h = makeHost();
            exec(h, code, bytes);
        }
    } else {
        const h = makeHost();
        for (let i = 0; i < iterations; i++) { exec(h, code, bytes); }
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / iterations;
    return ms;
}
const perfText = ('温度:25.6℃ 湿度:60% 状态:正常 中文数据测试 ').repeat(16) + '\r\n';
const perfBytes = gbkEncode(perfText);
info('frame size: ' + perfBytes.length + ' bytes of GBK');
info('fresh script parse+decode per frame : ' + bench(perfBytes, 200, true).toFixed(3) + ' ms/frame');
info('long-lived context (table cached)  : ' + bench(perfBytes, 2000, false).toFixed(3) + ' ms/frame');

// ---------------------------------------------------------------------- result
console.log('\n=== result ===');
console.log('checks: ' + checks + ', failures: ' + failures);
process.exit(failures === 0 ? 0 : 1);
