/**
 * Control HUB Demo Video Generator
 *
 * Phase 1 (--screenshots): navigates the live demo, takes screenshots
 * Phase 2 (--assemble):    assembles screenshots → MP4 with ffmpeg
 * Default: runs both phases
 *
 * Output:
 *   artifacts/cmmc-app/public/videos/control-hub-demo.mp4
 *   artifacts/cmmc-app/public/videos/control-hub-demo-poster.png
 *   artifacts/cmmc-app/public/videos/control-hub-demo-captions.vtt
 */

import { chromium } from "playwright";
import { spawnSync } from "child_process";
import { mkdirSync, existsSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join, resolve } from "path";

const BASE_URL = "http://localhost:80";
const OUT_DIR = resolve("../artifacts/cmmc-app/public/videos");
const FRAMES_DIR = resolve("/tmp/demo-video-frames");
const W = 1920;
const H = 1080;
const FPS = 3; // frames per second of output video (also capture rate)
const NIX_CHROMIUM = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

const SCENES: { id: string; name: string; caption: string; durationSec: number; path: string }[] = [
  { id: "01", name: "Demo Landing Page",        caption: "Control HUB centralises CMMC L2 readiness, evidence, monitoring, POA&M, and reporting.", durationSec: 5, path: "/demo" },
  { id: "02", name: "Executive Dashboard",      caption: "The dashboard shows live readiness health, evidence quality, monitoring status, and recommended next actions.", durationSec: 7, path: "/" },
  { id: "03", name: "Pre-Assessment",           caption: "Tenant-connected pre-assessment identifies gaps and auto-links findings to 110 CMMC controls.", durationSec: 7, path: "/pre-assessment" },
  { id: "04", name: "Control Detail",           caption: "Each control has implementation guidance, evidence, tasks, monitoring, POA&M, and SSP mapping.", durationSec: 8, path: "/controls" },
  { id: "05", name: "Evidence Repository",      caption: "Evidence is tagged by control, domain, type, owner, and review date — ready for assessors.", durationSec: 6, path: "/evidence" },
  { id: "06", name: "Monitoring Tracker",       caption: "The Monitoring Tracker proves ongoing compliance with weekly, monthly, and quarterly reviews.", durationSec: 6, path: "/monitoring" },
  { id: "07", name: "POA&M Tracker",            caption: "POA&Ms keep remediation tied to controls, owners, risk levels, and supporting evidence.", durationSec: 6, path: "/poams" },
  { id: "08", name: "Documents & Policies",     caption: "Policy and procedure library with version control, review workflows, and gap analysis.", durationSec: 6, path: "/documents" },
  { id: "09", name: "Launch Your Demo",         caption: "Control HUB: one platform from pre-assessment through ongoing CMMC L2 compliance.", durationSec: 5, path: "/demo" },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(`[demo-video] ${msg}`); }

function ensureDir(p: string) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }

function ffmpeg(args: string[], label: string) {
  log(`ffmpeg: ${label}`);
  const r = spawnSync("ffmpeg", ["-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed (${label}): ${(r.stderr?.toString() ?? "").slice(-800)}`);
  }
}

async function getDemoToken(): Promise<{ token: string; orgId: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/demo-login`, { method: "POST" });
  if (!res.ok) throw new Error(`Demo login failed: ${res.status}`);
  const d = await res.json() as { token: string; demoOrgId: string };
  return { token: d.token, orgId: d.demoOrgId };
}

function buildCaptionsVtt(): string {
  let vtt = "WEBVTT\n\n";
  let t = 0;
  for (const sc of SCENES) {
    vtt += `${fmt(t)} --> ${fmt(t + sc.durationSec - 0.4)}\n${sc.caption}\n\n`;
    t += sc.durationSec;
  }
  return vtt;
}

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${pad(h)}:${pad(m)}:${s.toFixed(3).padStart(6, "0")}`;
}
function pad(n: number) { return String(n).padStart(2, "0"); }

// ── Phase 1: screenshots ──────────────────────────────────────────────────────

async function takeScreenshots() {
  ensureDir(FRAMES_DIR);
  const { token, orgId } = await getDemoToken();
  log(`Demo login OK — orgId: ${orgId}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: NIX_CHROMIUM,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(({ token, orgId }: { token: string; orgId: string }) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("cmmc_active_org_id", orgId);
    localStorage.setItem("isDemoMode", "true");
  }, { token, orgId });

  const page = await ctx.newPage();

  for (const scene of SCENES) {
    log(`Scene ${scene.id}: ${scene.name} → ${scene.path}`);
    const dir = join(FRAMES_DIR, scene.id);
    ensureDir(dir);

    // Clear existing frames for this scene
    for (const f of readdirSync(dir)) unlinkSync(join(dir, f));

    await page.goto(`${BASE_URL}${scene.path}`, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);

    // Hide dev overlays + scrollbars
    await page.addStyleTag({ content: `
      #vite-error-overlay, [data-vite-dev-id] { display:none!important; }
      ::-webkit-scrollbar { display:none; }
      * { scrollbar-width:none; }
      .animate-spin { animation:none!important; }
    ` }).catch(() => {});
    await page.waitForTimeout(400);

    const totalFrames = scene.durationSec * FPS;
    const scrollStart = Math.floor(FPS * 1.5);
    const scrollEnd = Math.floor(FPS * (scene.durationSec - 1.5));

    for (let i = 0; i < totalFrames; i++) {
      // Slow scroll during middle frames
      if (i >= scrollStart && i <= scrollEnd) {
        const progress = (i - scrollStart) / Math.max(1, scrollEnd - scrollStart);
        await page.evaluate((y: number) => window.scrollTo({ top: y }), Math.floor(progress * 500)).catch(() => {});
      }
      await page.screenshot({
        path: join(dir, `${String(i).padStart(5, "0")}.png`),
        type: "png",
      }).catch(() => {});
      await page.waitForTimeout(Math.floor(1000 / FPS) - 20);
    }
  }

  // Poster: dashboard screenshot
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  ensureDir(OUT_DIR);
  await page.screenshot({ path: join(OUT_DIR, "control-hub-demo-poster.png"), type: "png" });
  log(`Poster saved`);

  await browser.close();
  log("Screenshots done.");
}

// ── Phase 2: assemble ─────────────────────────────────────────────────────────

function assembleVideo() {
  ensureDir(OUT_DIR);

  // Gather all frames in order
  const allFrames: string[] = [];
  for (const sc of SCENES) {
    const dir = join(FRAMES_DIR, sc.id);
    if (!existsSync(dir)) { log(`WARN: missing frame dir for ${sc.id}, skipping`); continue; }
    const files = readdirSync(dir).filter(f => f.endsWith(".png")).sort();
    allFrames.push(...files.map(f => join(dir, f)));
  }

  if (allFrames.length === 0) throw new Error("No frames found — run --screenshots first");
  log(`Assembling ${allFrames.length} frames at ${FPS}fps…`);

  // Write concat list
  const listPath = join(FRAMES_DIR, "frames.txt");
  const durPerFrame = 1 / FPS;
  const lines = allFrames.map(f => `file '${f}'\nduration ${durPerFrame.toFixed(6)}`);
  lines.push(`file '${allFrames[allFrames.length - 1]}'`);
  writeFileSync(listPath, lines.join("\n") + "\n");

  // Find font paths
  const boldFonts = [
    "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/share/chromium/fonts",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
  ];
  const regFonts = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
  ];
  const boldFont = boldFonts.find(f => existsSync(f)) ?? boldFonts[1];
  const regFont = regFonts.find(f => existsSync(f)) ?? regFonts[0];
  log(`Fonts: bold=${boldFont}, reg=${regFont}`);

  // Cumulative scene start times
  const sceneTimes: number[] = [];
  let t = 0;
  for (const sc of SCENES) { sceneTimes.push(t); t += sc.durationSec; }

  const safe = (s: string) => s
    .replace(/['\\":]/g, " ")
    .replace(/&/g, "and")
    .replace(/[^\x20-\x7E]/g, "");

  // Build drawtext overlay filter
  let vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=#0F172A`;

  // Header band
  vf += `,drawbox=y=0:h=56:color=0x0F172AEE:t=fill`;
  // Footer band
  vf += `,drawbox=y=${H - 72}:h=72:color=0x0F172AEE:t=fill`;

  for (let i = 0; i < SCENES.length; i++) {
    const sc = SCENES[i];
    const st = sceneTimes[i];
    const en = st + sc.durationSec;
    const titleEnd = st + 2.5;

    const title = safe(`${sc.id}  ${sc.name}`);
    const cap = safe(sc.caption.length > 100 ? sc.caption.slice(0, 97) + "..." : sc.caption);

    vf += `,drawtext=fontfile='${boldFont}':text='${title}':fontsize=26:fontcolor=white:x=(w-text_w)/2:y=16:enable='between(t,${st.toFixed(2)},${titleEnd.toFixed(2)})'`;
    vf += `,drawtext=fontfile='${regFont}':text='${cap}':fontsize=20:fontcolor=0xCBD5E1FF:x=(w-text_w)/2:y=${H - 48}:enable='between(t,${st.toFixed(2)},${en.toFixed(2)})'`;
  }

  const rawPath = join(FRAMES_DIR, "raw.mp4");
  ffmpeg([
    "-f", "concat", "-safe", "0", "-i", listPath,
    "-vf", vf,
    "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", String(FPS),
    rawPath,
  ], "encode video");

  // Re-encode with faststart for web
  const finalPath = join(OUT_DIR, "control-hub-demo.mp4");
  ffmpeg([
    "-i", rawPath,
    "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    finalPath,
  ], "web-optimize (faststart)");

  log(`Video: ${finalPath}`);

  // Captions
  const vttPath = join(OUT_DIR, "control-hub-demo-captions.vtt");
  writeFileSync(vttPath, buildCaptionsVtt());
  log(`Captions: ${vttPath}`);

  log("✅ Assembly complete!");
}

// ── entry ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const screenshotsOnly = args.includes("--screenshots");
const assembleOnly = args.includes("--assemble");

if (screenshotsOnly) {
  takeScreenshots().catch(e => { console.error(e); process.exit(1); });
} else if (assembleOnly) {
  assembleVideo();
} else {
  takeScreenshots()
    .then(() => assembleVideo())
    .catch(e => { console.error(e); process.exit(1); });
}
