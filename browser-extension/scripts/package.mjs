import {
  existsSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash as cryptoHash } from "node:crypto";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const production = process.argv.includes("--production");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;
const outName = production
  ? `joblens-greenhouse-extension-v${version}.zip`
  : `joblens-extension-dev-v${version}.zip`;
const out = join(root, outName);

if (!existsSync(dist)) {
  console.error("Run npm run build or build:production first");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const hostPerms = manifest.host_permissions || [];
const banned = ["localhost", "127.0.0.1", "<all_urls>"];
if (production) {
  for (const h of hostPerms) {
    for (const b of banned) {
      if (h.includes(b)) {
        console.error(`Production package contains forbidden host permission: ${h}`);
        process.exit(1);
      }
    }
  }
  // Scan built JS for localhost URLs
  function walkScan(dir, files = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walkScan(p, files);
      else if (/\.(js|json|html|css)$/.test(name)) files.push(p);
    }
    return files;
  }
  for (const file of walkScan(dist)) {
    if (file.endsWith("build-info.json")) continue;
    const text = readFileSync(file, "utf8");
    if (/localhost|127\.0\.0\.1/.test(text)) {
      console.error(`Production artifact contains localhost reference: ${relative(dist, file)}`);
      process.exit(1);
    }
  }
}

function walk(dir, base = dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, files);
    else {
      // Exclude source maps from production packages
      if (production && name.endsWith(".map")) continue;
      files.push(p);
    }
  }
  return files;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

const files = walk(dist);
const chunks = [];
const central = [];
let offset = 0;

for (const file of files) {
  const data = readFileSync(file);
  const name = relative(dist, file).replace(/\\/g, "/");
  const nameBuf = Buffer.from(name, "utf8");
  const compressed = deflateRawSync(data);
  const crc = crc32(data);
  const local = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(8),
    u16(0),
    u16(0),
    u32(crc),
    u32(compressed.length),
    u32(data.length),
    u16(nameBuf.length),
    u16(0),
    nameBuf,
    compressed,
  ]);
  chunks.push(local);
  central.push(
    Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ]),
  );
  offset += local.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.concat([
  u32(0x06054b50),
  u16(0),
  u16(0),
  u16(files.length),
  u16(files.length),
  u32(centralBuf.length),
  u32(offset),
  u16(0),
]);

const zipBuf = Buffer.concat([...chunks, centralBuf, end]);
writeFileSync(out, zipBuf);
const sha256 = cryptoHash("sha256").update(zipBuf).digest("hex");
writeFileSync(join(root, `${outName}.sha256`), `${sha256}  ${outName}\n`);

let buildInfo = {};
try {
  buildInfo = JSON.parse(readFileSync(join(dist, "build-info.json"), "utf8"));
} catch {
  /* optional */
}

const releaseManifest = {
  ...buildInfo,
  artifact: outName,
  sha256,
  file_count: files.length,
  permissions_summary: {
    permissions: manifest.permissions,
    host_permissions: hostPerms,
  },
  release_notes: [
    "Greenhouse-only assisted fill and optional document upload.",
    "User must click employer Submit and confirm with I Submitted.",
    "No automatic submission, CAPTCHA bypass, or employer credential storage.",
  ],
  excluded: [".env", "source maps (production)", "dev fixtures", "localhost hosts"],
};
writeFileSync(join(root, `build-manifest-v${version}.json`), JSON.stringify(releaseManifest, null, 2));

console.log("packed", out);
console.log("sha256", sha256);
console.log("files", files.length);
