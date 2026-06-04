// Generate branded placeholder PNGs (icon / splash / og) with a pure-Node PNG
// encoder — no native deps. A blue Diamond Hands rhombus on the brand-dark bg.
// Replace these with real design assets before a public launch.
//   node scripts/gen-placeholder-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
};
const png = (w, h, rgb) => {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
};

// brand colors
const BG = [0x0b, 0x11, 0x20]; // #0b1120
const A = [0x3d, 0x3d, 0xff]; // gradient start
const B = [0x00, 0x00, 0xff]; // baseblue

const draw = (w, h) => {
  const rgb = Buffer.alloc(w * h * 3);
  const cx = w / 2;
  const cy = h / 2;
  const half = Math.min(w, h) * 0.3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = Math.abs(x - cx) / half + Math.abs(y - cy) / half <= 1;
      let col = BG;
      if (inside) {
        const t = (x + y) / (w + h);
        col = [
          Math.round(A[0] * (1 - t) + B[0] * t),
          Math.round(A[1] * (1 - t) + B[1] * t),
          Math.round(A[2] * (1 - t) + B[2] * t),
        ];
      }
      const i = (y * w + x) * 3;
      rgb[i] = col[0];
      rgb[i + 1] = col[1];
      rgb[i + 2] = col[2];
    }
  }
  return rgb;
};

const out = (name, w, h) => {
  writeFileSync(resolve("public", name), png(w, h, draw(w, h)));
  console.log(`wrote public/${name} (${w}x${h})`);
};

out("icon.png", 1024, 1024);
out("splash.png", 200, 200);
out("og.png", 1200, 630);
