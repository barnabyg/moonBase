// `node scripts/make-icon.mjs`: draws the desktop app's icon, a crescent
// Moon over a domed base on the lunar surface, and writes it to assets/icon/:
// icon.png (256 x 256) and icon.ico (16 to 256 px, for the installer, the
// app's .exe and its window). Both are committed; run this again only to
// change the icon. It uses Node's built-in modules alone, and draws each size
// from the shapes, rather than shrinking the largest, with 4 x 4 samples a
// pixel to smooth the edges.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const outDir = new URL("../assets/icon/", import.meta.url);
const sizes = [16, 24, 32, 48, 64, 128, 256];
const samples = 4;

// Shapes in a unit square, (0, 0) at the top left. Later ones are drawn over
// earlier ones.
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inRoundedSquare = (x, y, radius) => {
  const dx = Math.max(radius - x, 0, x - (1 - radius));
  const dy = Math.max(radius - y, 0, y - (1 - radius));
  return dx * dx + dy * dy <= radius * radius;
};
const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);

/** The colour [r, g, b, a] (0 to 255) at a point of the unit square. */
function colourAt(x, y) {
  if (!inRoundedSquare(x, y, 0.18)) return [0, 0, 0, 0];
  // The night sky, darker at the top.
  let colour = [...mix([8, 14, 38], [30, 44, 86], y), 255];
  // A few stars.
  for (const [sx, sy] of [
    [0.78, 0.16],
    [0.88, 0.36],
    [0.62, 0.1],
    [0.16, 0.66],
  ]) {
    if (inCircle(x, y, sx, sy, 0.018)) colour = [230, 236, 255, 255];
  }
  // The crescent Moon: a disc with a smaller one taken out of it.
  if (inCircle(x, y, 0.36, 0.34, 0.2) && !inCircle(x, y, 0.46, 0.27, 0.18)) {
    colour = [240, 232, 206, 255];
  }
  // The base's dome, with a mast and a door, on the ground.
  if (x >= 0.645 && x <= 0.665 && y >= 0.44 && y <= 0.62) {
    colour = [200, 208, 222, 255];
  }
  if (inCircle(x, y, 0.655, 0.44, 0.03)) colour = [255, 120, 80, 255];
  if (inCircle(x, y, 0.6, 0.78, 0.2) && y <= 0.78) {
    colour = [...mix([236, 242, 250], [168, 182, 204], (x - 0.4) / 0.4), 255];
    if (x >= 0.56 && x <= 0.64 && y >= 0.7) colour = [40, 60, 100, 255];
  }
  // The lunar surface: the top of a large disc, lit from the left.
  if (inCircle(x, y, 0.5, 1.62, 0.9)) {
    colour = [...mix([150, 150, 160], [92, 94, 108], x), 255];
    for (const [cx, cy, r] of [
      [0.26, 0.86, 0.05],
      [0.8, 0.9, 0.04],
      [0.5, 0.94, 0.03],
    ]) {
      if (inCircle(x, y, cx, cy, r)) colour = [110, 112, 126, 255];
    }
  }
  return colour;
}

/** The icon at `size` px, as straight (not premultiplied) RGBA rows. */
function draw(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const [r, g, b, a] = colourAt(
            (px + (sx + 0.5) / samples) / size,
            (py + (sy + 0.5) / samples) / size,
          );
          sum[0] += r * a;
          sum[1] += g * a;
          sum[2] += b * a;
          sum[3] += a;
        }
      }
      const offset = (py * size + px) * 4;
      const alpha = sum[3] / samples ** 2;
      for (let i = 0; i < 3; i++) {
        rgba[offset + i] = alpha === 0 ? 0 : Math.round(sum[i] / sum[3]);
      }
      rgba[offset + 3] = Math.round(alpha);
    }
  }
  return rgba;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  // Each row starts with filter type 0 (none).
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * A 32-bit bitmap entry of an .ico: bottom-up BGRA rows, then an all-clear
 * 1-bit mask, as every Windows tool reads it. The 256 px entry is a PNG
 * instead, which Windows has read since Vista, to keep the file small.
 */
function bitmap(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // the colours and the mask, stacked
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4;
      const to = ((size - 1 - y) * size + x) * 4;
      pixels[to] = rgba[from + 2];
      pixels[to + 1] = rgba[from + 1];
      pixels[to + 2] = rgba[from];
      pixels[to + 3] = rgba[from + 3];
    }
  }
  const maskRow = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, pixels, Buffer.alloc(maskRow * size)]);
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // an icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size; // 0 means 256
    entry[1] = size === 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

mkdirSync(outDir, { recursive: true });
const images = sizes.map((size) => {
  const rgba = draw(size);
  return { size, data: size === 256 ? png(size, rgba) : bitmap(size, rgba) };
});
writeFileSync(new URL("icon.png", outDir), images.at(-1).data);
writeFileSync(new URL("icon.ico", outDir), ico(images));
console.log("Wrote assets/icon/icon.png and assets/icon/icon.ico.");
