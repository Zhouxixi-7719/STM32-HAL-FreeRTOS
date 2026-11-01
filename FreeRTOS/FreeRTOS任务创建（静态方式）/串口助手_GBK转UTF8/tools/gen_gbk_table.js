/*  gen_gbk_table.js  --  build the GBK -> Unicode code table
 *  ---------------------------------------------------------------------------
 *  Source of truth: the standard GBK index, read through V8/ICU
 *  TextDecoder('gbk') (== WHATWG encoding spec "gbk" == GBK/GB18030 1-2 byte
 *  index).  Windows CP936 (.NET) agrees with it on all 23,840 common slots and
 *  differs only on 100 legacy symbol slots where .NET keeps a private-use
 *  area codepoint (e.g. 0xA3A0: .NET U+E5E5 vs standard U+3000); those are
 *  listed by tools/check_vs_dotnet.ps1.
 *
 *  out : tools/gbk_table.bin
 *        [0     .. 47879]  double byte: lead 0x81..0xFE x trail 0x40..0xFE
 *                          excluding 0x7F  ==>  23940 entries, little-endian
 *                          UTF-16, 0x0000 = undefined
 *                          index = (lead-0x81)*190 + (trail-0x40-(trail>0x7F?1:0))
 *        [47880 .. 48391]  single byte: 0x00..0xFF (256 entries)
 *
 *  usage: node tools/gen_gbk_table.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DOUBLE_SLOTS = 126 * 190;                 // 23940
const SINGLE_SLOTS = 256;
const OUT = path.join(__dirname, 'gbk_table.bin');

const dec = new TextDecoder('gbk', { fatal: false });

function codeUnitOf(bytes) {
    const s = dec.decode(bytes);
    // one char, and not the replacement character -> real mapping
    if (s.length === 1 && s.charCodeAt(0) !== 0xFFFD) { return s.charCodeAt(0); }
    return 0;
}

const buf = Buffer.alloc((DOUBLE_SLOTS + SINGLE_SLOTS) * 2);
let dblMapped = 0, dblUndefined = 0, sglMapped = 0;
let i = 0;

for (let lead = 0x81; lead <= 0xFE; lead++) {
    for (let trail = 0x40; trail <= 0xFE; trail++) {
        if (trail === 0x7F) { continue; }
        const cu = codeUnitOf(Uint8Array.from([lead, trail]));
        if (cu !== 0) { dblMapped++; } else { dblUndefined++; }
        buf.writeUInt16LE(cu, i);
        i += 2;
    }
}
if (i !== DOUBLE_SLOTS * 2) { throw new Error('double-byte slot count mismatch: ' + i / 2); }

for (let b = 0; b < 256; b++) {
    const cu = codeUnitOf(Uint8Array.from([b]));
    if (cu !== 0) { sglMapped++; }
    buf.writeUInt16LE(cu, DOUBLE_SLOTS * 2 + b * 2);
}

fs.writeFileSync(OUT, buf);

const spot = [
    [[0xB0, 0xA1], '啊'], [[0xC4, 0xE3], '你'], [[0xBA, 0xC3], '好'],
    [[0xD6, 0xD0], '中'], [[0xCE, 0xC4], '文'], [[0xA1, 0xA1], '\u3000'],
    [[0xA3, 0xAC], '，'], [[0xA2, 0xE3], '\u20AC'], [[0xA3, 0xA0], '\u3000'],
    [[0x81, 0x40], '\u4E02'], [[0xD7, 0xF9], '座']
];
let bad = 0;
for (const [bytes, want] of spot) {
    const idx = (bytes[0] - 0x81) * 190 + (bytes[1] - 0x40 - (bytes[1] > 0x7F ? 1 : 0));
    const cu = buf.readUInt16LE(idx * 2);
    const ok = cu === want.charCodeAt(0);
    if (!ok) { bad++; }
    console.log(`  ${bytes.map((b) => b.toString(16).toUpperCase()).join('')} -> U+${cu.toString(16).toUpperCase().padStart(4, '0')} ${ok ? 'OK ' : 'BAD'} (want ${want})`);
}

console.log('');
console.log('output        :', OUT);
console.log('size          :', buf.length, 'bytes');
console.log(`double byte   : ${dblMapped} mapped / ${dblUndefined} undefined`);
console.log(`single byte   : ${sglMapped} mapped / 256`);
console.log('single 0x80   : U+' + buf.readUInt16LE(DOUBLE_SLOTS * 2 + 0x80 * 2).toString(16).toUpperCase());
console.log('spot check    :', bad === 0 ? 'all OK' : bad + ' mismatch');
process.exit(bad === 0 ? 0 : 1);
