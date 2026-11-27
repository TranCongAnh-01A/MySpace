// Kiểm tra phiên bản trùng nhau: package.json (nguồn gốc) và src-tauri/Cargo.toml.
// tauri.conf.json trỏ tới ../package.json nên không có số riêng.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version;
const cargo = /^version\s*=\s*"([^"]+)"/m.exec(readFileSync('src-tauri/Cargo.toml', 'utf8'))?.[1];
const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;

const errors = [];
if (cargo !== pkg) errors.push(`Cargo.toml (${cargo}) khác package.json (${pkg})`);
if (conf !== '../package.json')
  errors.push(`tauri.conf.json phải có "version": "../package.json" (đang là ${conf})`);

if (errors.length) {
  console.error('Phiên bản không đồng bộ:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log(`Phiên bản đồng bộ: ${pkg}`);
