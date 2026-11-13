#!/usr/bin/env node
// Reuse the QR encoder already bundled with EAS CLI; no package install.
const fs = require('node:fs');
const path = require('node:path');
const roots = ['/usr/lib/node_modules/eas-cli',
  '/home/solrahk/.npm-global/lib/node_modules/eas-cli'];
const root = roots.find(r => fs.existsSync(path.join(r, 'node_modules/qrcode-terminal/vendor/QRCode')));
if (!root) throw new Error('EAS CLI QR encoder not found');
const QRCode = require(path.join(root, 'node_modules/qrcode-terminal/vendor/QRCode'));
const levels = require(path.join(root, 'node_modules/qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel'));
const url = 'http://192.168.69.1/?setup=1';
const qr = new QRCode(-1, levels.M);
qr.addData(url); qr.make();
const n = qr.getModuleCount(), size = n + 8;
let cells = '';
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
  if (qr.isDark(y, x)) cells += `<rect x="${x+4}" y="${y+4}" width="1" height="1"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="740" height="740" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="PigPulse local setup QR"><title>${url}</title><rect width="100%" height="100%" fill="white"/><g fill="black">${cells}</g></svg>\n`;
const output = process.argv[2] || path.join(__dirname, 'pigpulse-setup-qr.svg');
fs.writeFileSync(output, svg);
console.log(`${output} → ${url}`);
