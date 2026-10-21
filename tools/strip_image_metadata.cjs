"use strict";

// Run with --write to clean existing repository images in place.
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("../api/node_modules/sharp");
const root = path.resolve(__dirname, "..");
const fields = ["exif", "xmp", "iptc", "icc", "comments", "orientation"];

function stripJpeg(bytes) {
  const chunks = [];
  let start = 0, pos = 0;
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) { pos++; continue; }
    const markerStart = pos++;
    while (bytes[pos] === 0xff) pos++;
    const marker = bytes[pos++];
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (pos + 2 > bytes.length) throw new Error("Truncated JPEG marker");
    const length = bytes.readUInt16BE(pos);
    if (length < 2 || pos + length > bytes.length) throw new Error("Invalid JPEG marker");
    // Adobe APP14 affects pixel decoding; other APP segments and comments
    // carry metadata, thumbnails, profiles, or application-specific payloads.
    const standardJfif = marker === 0xe0 && length === 16 && bytes.toString("ascii", pos + 2, pos + 7) === "JFIF\0";
    if (((marker >= 0xe0 && marker <= 0xef && marker !== 0xee) && !standardJfif) || marker === 0xfe) {
      chunks.push(bytes.subarray(start, markerStart));
      start = pos + length;
    }
    pos += length;
  }
  chunks.push(bytes.subarray(start));
  return Buffer.concat(chunks);
}

function stripPng(bytes) {
  const keep = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "sBIT", "bKGD", "acTL", "fcTL", "fdAT"]);
  const chunks = [bytes.subarray(0, 8)];
  for (let pos = 8; pos < bytes.length;) {
    if (pos + 12 > bytes.length) throw new Error("Truncated PNG chunk");
    const end = pos + 12 + bytes.readUInt32BE(pos);
    if (end > bytes.length) throw new Error("Invalid PNG chunk");
    if (keep.has(bytes.toString("ascii", pos + 4, pos + 8))) chunks.push(bytes.subarray(pos, end));
    pos = end;
  }
  return Buffer.concat(chunks);
}

async function main() {
  let count = 0;
  for (const folder of ["images", "public"]) {
    for (const relative of await fs.readdir(path.join(root, folder), { recursive: true })) {
      if (!/\.(jpe?g|jfif|png|webp|gif)$/i.test(relative)) continue;
      const file = path.join(root, folder, relative);
      const before = await fs.readFile(file);
      const meta = await sharp(before).metadata();
      let after = meta.format === "jpeg" ? stripJpeg(before) : meta.format === "png" ? stripPng(before) : before;
      if (after.equals(before) && !fields.some(key => meta[key] != null)) continue;
      const originalPixels = await sharp(before, { animated: true }).autoOrient().raw().toBuffer();
      const cleanedPixels = await sharp(after, { animated: true }).raw().toBuffer();
      // Orientation or a non-sRGB profile may require rendering rather than
      // removing segments. Preserve the displayed colors in that case.
      const remaining = await sharp(after).metadata();
      if (!originalPixels.equals(cleanedPixels) || fields.some(key => remaining[key] != null)) {
        after = await sharp(before, { animated: true }).autoOrient()
          .toFormat(meta.format, meta.format === "jpeg" ? { quality: 100, chromaSubsampling: "4:4:4" } : {}).toBuffer();
      }
      const verified = await sharp(after, { animated: true }).metadata();
      if (fields.some(key => verified[key] != null)) throw new Error(`Metadata remains: ${file}`);
      if (verified.width !== (meta.autoOrient?.width || meta.width) || verified.height !== (meta.autoOrient?.height || meta.height)) {
        throw new Error(`Image dimensions changed: ${file}`);
      }
      if (process.argv.includes("--write")) {
        const temporary = `${file}.metadata-clean.tmp`;
        await fs.writeFile(temporary, after, { flag: "wx" });
        await fs.rename(temporary, file);
      }
      count++;
      console.log(`${process.argv.includes("--write") ? "Cleaned" : "Needs cleaning"}: ${path.relative(root, file)}`);
    }
  }
  console.log(`${count} image(s) ${process.argv.includes("--write") ? "cleaned" : "need cleaning"}.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
