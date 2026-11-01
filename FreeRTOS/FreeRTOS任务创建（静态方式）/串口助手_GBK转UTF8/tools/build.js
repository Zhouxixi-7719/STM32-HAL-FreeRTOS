/*  build.js  --  assemble gbk2utf8.js from the template + the generated table
 *  ---------------------------------------------------------------------------
 *  in : tools/gbk_table.bin            (from tools/gen_gbk_table.ps1)
 *       tools/gbk2utf8.template.js     (readable script, table placeholder)
 *  out: gbk2utf8.js                    (ready to paste into the JS editor)
 *
 *  usage: node tools/build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const here = __dirname;
const BIN = path.join(here, 'gbk_table.bin');
const TPL = path.join(here, 'gbk2utf8.template.js');
const OUT = path.join(here, '..', 'gbk2utf8.js');

const DOUBLE_SLOTS = 126 * 190;          // 23940
const SINGLE_SLOTS = 256;
const EXPECT_BYTES = (DOUBLE_SLOTS + SINGLE_SLOTS) * 2;   // 48392
const CHUNK = 108;                       // base64 chars per source line

const bin = fs.readFileSync(BIN);
if (bin.length !== EXPECT_BYTES) {
    throw new Error(`gbk_table.bin size ${bin.length}, expected ${EXPECT_BYTES}`);
}

const b64 = bin.toString('base64');
const chunks = [];
for (let i = 0; i < b64.length; i += CHUNK) chunks.push(b64.slice(i, i + CHUNK));
const block = chunks.map((c) => `'${c}'`).join(' +\n        ');

const template = fs.readFileSync(TPL, 'utf8');
const TOKEN = "/*@@GBK_TABLE_B64@@*/ ''";
if (template.split(TOKEN).length !== 2) {
    throw new Error('template placeholder not found exactly once');
}

const out = template.replace(TOKEN, block);
fs.writeFileSync(OUT, out, 'utf8');

console.log('table bytes      :', bin.length);
console.log('base64 chars     :', b64.length, `(${chunks.length} lines)`);
console.log('output           :', path.relative(process.cwd(), OUT));
console.log('output size      :', Buffer.byteLength(out, 'utf8'), 'bytes /',
            out.split('\n').length, 'lines');
