/**
 * Builds Nox Survivors for itch.io (0.161): the game played in itch.io's
 * page, zipped for its HTML upload.
 *
 *   npm run itch:build    → release/itch/ and release/nox-survivors-itch.zip
 *
 * itch.io serves an upload from its own host under a path of its own
 * (html-classic.itch.zone/html/<id>/index.html), so every file is linked
 * relatively (BASE_PATH ./) and /api is called at the live server's full
 * address, which answers itch.io's hosts with CORS (server/http.ts). The
 * zip holds index.html at its top, as itch.io asks, its paths with forward
 * slashes — written here, as Windows PowerShell's Compress-Archive puts
 * backslashes in them and itch.io's servers would not find the files.
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (data) => {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** 1980-01-01, the zip format's first day: the files carry no date worth keeping. */
const DOS_DATE = (1 << 5) | 1;
// Cloudflare's own list of what not to upload; nothing itch.io needs.
const LEFT_OUT = new Set(['.assetsignore']);
const filesUnder = (dir) =>
  readdirSync(dir).filter((name) => !LEFT_OUT.has(name)).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? filesUnder(join(dir, name)) : [join(dir, name)]));

/** A plain zip (deflate, no extras) of everything under `dir`, named from `dir`. */
function zipDirectory(dir) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of filesUnder(dir).sort()) {
    const name = Buffer.from(relative(dir, file).split(sep).join('/'));
    const data = readFileSync(file);
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env, VITE_PLATFORM: 'itch', VITE_API_BASE: 'https://exiledsurvivors.com', BASE_PATH: './' };

execSync('npx vite build --outDir release/itch --emptyOutDir', { cwd: root, env, stdio: 'inherit' });
const zip = join(root, 'release', 'nox-survivors-itch.zip');
writeFileSync(zip, zipDirectory(join(root, 'release', 'itch')));
console.log(`itch.io upload: ${zip}`);
