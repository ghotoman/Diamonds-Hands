// Generate the Diamond Hands brand assets (icon / splash / embed / og) by
// rendering HTML/CSS in headless Chromium — same gem as the in-app Logo
// (rotated rounded square, #3D3DFF→#0000FF, inner white stroke), elevated
// with a gloss highlight and a soft glow on the brand-dark background.
//   node scripts/gen-brand-assets.mjs
// Outputs into public/. Commit the PNGs; the script is the source of truth.
import puppeteer from "puppeteer-core";
import { resolve } from "node:path";

const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = (f) => resolve("public", f);

/// The gem mark — a faceted brilliant-cut diamond (flat style, brand blues).
/// Crown (table + side facets) over a pavilion converging to the culet;
/// light reads from the top-left. `s` = svg width in px.
const gem = (s, { glow = true } = {}) => `
  <div style="position:relative; width:${s * 1.5}px; height:${s * 1.4}px; display:grid; place-items:center;">
    ${
      glow
        ? `<div style="position:absolute; inset:-10%; background:radial-gradient(circle at 50% 44%, rgba(61,61,255,.40), rgba(61,61,255,.13) 44%, transparent 70%);"></div>`
        : ""
    }
    <svg width="${s}" height="${Math.round(s * 0.92)}" viewBox="0 0 100 92"
         style="position:relative; filter: drop-shadow(0 ${s * 0.02}px ${s * 0.06}px rgba(0,0,60,.55)) drop-shadow(0 0 ${s * 0.10}px rgba(61,61,255,.45));">
      <!-- crown -->
      <polygon points="30,8 70,8 65,34 35,34" fill="#7B7BFF"/>
      <polygon points="30,8 35,34 4,34"  fill="#5050FF"/>
      <polygon points="70,8 96,34 65,34" fill="#3636F0"/>
      <!-- pavilion -->
      <polygon points="4,34 35,34 50,88"  fill="#2D2DE0"/>
      <polygon points="35,34 65,34 50,88" fill="#4A4AFF"/>
      <polygon points="65,34 96,34 50,88" fill="#1D1DC4"/>
      <!-- table shine -->
      <polygon points="33,10 50,10 39,31" fill="rgba(255,255,255,.30)"/>
      <!-- facet edges -->
      <g stroke="rgba(255,255,255,.30)" stroke-width="1" stroke-linejoin="round" fill="none">
        <polygon points="30,8 70,8 96,34 50,88 4,34"/>
        <path d="M4,34 H96 M30,8 L35,34 M70,8 L65,34 M35,34 L50,88 M65,34 L50,88"/>
      </g>
      <!-- sparkles -->
      <path d="M27 16 l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6 Z" fill="#fff" opacity=".95"/>
      <path d="M76 47 l1.1 3 3 1.1 -3 1.1 -1.1 3 -1.1 -3 -3 -1.1 3 -1.1 Z" fill="#fff" opacity=".75"/>
    </svg>
  </div>`;

const FONT = `-apple-system, 'Segoe UI', 'Inter', Roboto, Helvetica, Arial, sans-serif`;

const page = (bodyHtml, { transparent = false } = {}) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:100%; height:100%; }
  body {
    background:${transparent ? "transparent" : "#0b1120"};
    font-family:${FONT};
    display:grid; place-items:center;
    -webkit-font-smoothing:antialiased;
    overflow:hidden;
  }
</style></head><body>${bodyHtml}</body></html>`;

/// Asset specs.
const ASSETS = [
  {
    file: "icon.png",
    width: 1024,
    height: 1024,
    html: page(`
      <div style="position:relative; width:100%; height:100%; display:grid; place-items:center;
                  background: radial-gradient(circle at 50% 38%, #131b33, #0b1120 70%);">
        ${gem(560)}
      </div>`),
  },
  {
    file: "splash.png",
    width: 200,
    height: 200,
    transparent: true,
    html: page(gem(116, { glow: false }), { transparent: true }),
  },
  {
    file: "embed.png", // Mini App embed card — 3:2 per Farcaster spec
    width: 1200,
    height: 800,
    html: page(`
      <div style="position:relative; width:100%; height:100%;
                  background: radial-gradient(900px 700px at 26% 46%, #141d38, #0b1120 75%);
                  display:flex; align-items:center; gap:8px; padding:0 90px;">
        <div style="flex:0 0 auto;">${gem(300)}</div>
        <div style="flex:1; padding-left:24px;">
          <div style="font-size:88px; font-weight:800; letter-spacing:-2px; color:#fff; line-height:1.04;">
            Diamond<br/>Hands
          </div>
          <div style="margin-top:26px; font-size:34px; color:#8b93a7; line-height:1.35;">
            Lock your tokens on-chain.<br/>Beat paper hands.
          </div>
          <div style="margin-top:40px; display:inline-flex; align-items:center; gap:12px;
                      border:1.5px solid #28324d; border-radius:999px; padding:12px 26px;">
            <span style="width:18px; height:18px; border-radius:50%; background:#0000FF; display:inline-block;"></span>
            <span style="font-size:24px; font-weight:600; color:#aeb6c8;">Built on Base</span>
          </div>
        </div>
      </div>`),
  },
  {
    file: "og.png", // generic link previews — 1.91:1
    width: 1200,
    height: 630,
    html: page(`
      <div style="position:relative; width:100%; height:100%;
                  background: radial-gradient(900px 600px at 26% 50%, #141d38, #0b1120 75%);
                  display:flex; align-items:center; gap:8px; padding:0 90px;">
        <div style="flex:0 0 auto;">${gem(250)}</div>
        <div style="flex:1; padding-left:24px;">
          <div style="font-size:76px; font-weight:800; letter-spacing:-2px; color:#fff; line-height:1.05;">
            Diamond Hands
          </div>
          <div style="margin-top:20px; font-size:31px; color:#8b93a7; line-height:1.35;">
            Lock your tokens on-chain.<br/>Beat paper hands.
          </div>
          <div style="margin-top:34px; display:inline-flex; align-items:center; gap:12px;
                      border:1.5px solid #28324d; border-radius:999px; padding:10px 24px;">
            <span style="width:16px; height:16px; border-radius:50%; background:#0000FF; display:inline-block;"></span>
            <span style="font-size:22px; font-weight:600; color:#aeb6c8;">Built on Base</span>
          </div>
        </div>
      </div>`),
  },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--force-color-profile=srgb"],
});

for (const a of ASSETS) {
  const p = await browser.newPage();
  await p.setViewport({ width: a.width, height: a.height, deviceScaleFactor: 1 });
  await p.setContent(a.html, { waitUntil: "networkidle0" });
  await p.screenshot({ path: OUT(a.file), omitBackground: !!a.transparent });
  await p.close();
  console.log(`wrote public/${a.file} (${a.width}x${a.height}${a.transparent ? ", transparent" : ""})`);
}

await browser.close();
