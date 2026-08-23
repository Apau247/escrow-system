/**
 * Dev-only visual preview: drives the real Edge browser through login and
 * key pages, saving screenshots. Usage:
 *   $env:BASE_URL="http://localhost:3111"; node scripts/preview.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3111";
const OUT = process.env.SHOT_DIR ?? "../escrow-shots";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-first-run", "--disable-gpu", "--window-size=1440,1000"],
  defaultViewport: { width: 1440, height: 950 },
});

const page = await browser.newPage();
const shot = async (name) => {
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot:", name);
};

// 1. Login page
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await shot("01-login");

// 2. Sign in as the next of kin and capture her view.
await page.evaluate(async () => {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "kendra.anderson@demo.escrow.test", password: "Test123!" }),
  });
  if (!r.ok) throw new Error("kendra login failed: " + r.status);
});
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
await page.waitForSelector("#main-content", { timeout: 30000 }).catch(() => {});
await shot("02-kendra-next-of-kin");

// 3. Sign in as administrator via API from within the page (reliable),
//    then enter the authenticated portal.
await page.evaluate(async () => {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@escrow.test", password: "Test123!" }),
  });
  if (!r.ok) throw new Error("login failed: " + r.status);
});
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
await page.waitForSelector("#main-content", { timeout: 30000 }).catch(() => {});
await shot("03-dashboard");

// 3. Timeline (workflow stages)
await page.goto(`${BASE}/timeline`, { waitUntil: "networkidle2" });
await shot("03-timeline");

// 4. Obligations register
await page.goto(`${BASE}/obligations`, { waitUntil: "networkidle2" });
await shot("04-obligations");

// 5. Mobile layout check of dashboard (nav drawer open)
await page.setViewport({ width: 390, height: 844 });
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
await shot("05-mobile-dashboard");
const burger = await page
  .waitForSelector('button[aria-controls="mobile-nav"]', { visible: true, timeout: 10000 })
  .catch(() => null);
if (burger) {
  await burger.evaluate((b) => b.click());
  await shot("06-mobile-nav-open");
} else {
  console.log("mobile nav toggle not found");
}

await browser.close();
console.log("done");
