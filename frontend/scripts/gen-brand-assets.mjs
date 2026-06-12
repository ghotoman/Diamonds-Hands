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

/// The gem mark. `s` = body side in px (the rotated square), `r` = corner
/// radius, `stroke` = inner white stroke width — proportions match Logo.tsx.
const gem = (s, { glow = true } = {}) => `
  <div style="position:relative; width:${s * 1.5}px; height:${s * 1.5}px; display:grid; place-items:center;">
    ${
      glow
        ? `<div style="position:absolute; inset:-12%; background:radial-gradient(circle at 50% 46%, rgba(61,61,255,.42), rgba(61,61,255,.14) 42%, transparent 68%);"></div>`
        : ""
    }
    <div style="
      width:${s}px; height:${s}px;
      transform: rotate(45deg);
      border-radius:${Math.round(s * 0.25)}px;
      background: linear-gradient(135deg, #3D3DFF, #0000FF);
      box-shadow:
        inset 0 0 0 ${Math.max(3, Math.round(s * 0.018))}px rgba(255,255,255,.32),
        inset ${Math.round(s * 0.05)}px ${Math.round(s * 0.05)}px ${Math.round(s * 0.22)}px rgba(255,255,255,.13),
        inset ${-Math.round(s * 0.06)}px ${-Math.round(s * 0.06)}px ${Math.round(s * 0.25)}px rgba(0,0,90,.45),
        0 ${Math.round(s * 0.06)}px ${Math.round(s * 0.16)}px rgba(0,0,40,.45);
      position:relative; overflow:hidden;
    ">
      <div style="position:absolute; inset:0;
        background: linear-gradient(115deg, rgba(255,255,255,.22) 0%, rgba(255,255,255,.06) 26%, transparent 44%);"></div>
      <div style="position:absolute; left:-22%; top:-46%; width:70%; height:200%;
        transform: rotate(18deg);
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.10), transparent);"></div>
    </div>
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
