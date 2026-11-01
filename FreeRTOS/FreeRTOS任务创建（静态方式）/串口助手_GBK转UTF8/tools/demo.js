// quick manual demo: feed GBK bytes into the shipped script and print what the window would show
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'gbk2utf8.js'), 'utf8');
const hex = process.argv[2] || 'C4E3BAC3A3ACCAC0BDE70D0A';   // GBK: 你好，世界\r\n
const bytes = Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16)));
console.log('input bytes   :', hex, '(', bytes.length, 'bytes )');

const writes = [];
const sandbox = {
    receive: {
        getBytes: () => bytes,
        write: (s, c) => { writes.push([s, c]); },
        clearLastReceived: () => { }
    },
    util: { bytesToHexString: (b, u) => Buffer.from(Uint8Array.from(b)).toString('hex').toUpperCase() },
    send: { writeBytes: () => { } },
    file: { appendText: () => { } },
    console: { error: (...a) => console.log('script error:', ...a) },
    chart: { write: () => { } }
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'gbk2utf8.js' });

const decoded = writes.filter((w) => w[0] !== '\n').map((w) => w[0]).join('');
console.log('receive.write :', JSON.stringify(writes.map((w) => w[0])));
console.log('decoded text  :', JSON.stringify(decoded), '=', decoded.trim());
