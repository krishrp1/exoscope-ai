const { chromium } = require("playwright-core");
const fs = require("node:fs");

const BASE = "http://localhost:3001";
const routes = ["/", "/observatory", "/observatory/dataset", "/observatory/light-curves",
  "/observatory/detect", "/observatory/compare", "/observatory/training",
  "/observatory/performance", "/observatory/about"];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const report = [];

  for (const route of routes) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500);

    // Tab through the whole page and record focusable elements reached
    const focusable = await page.locator(
      "a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])"
    ).count();

    const reached = new Set();
    let prev = "";
    for (let i = 0; i < 60; i++) {
      const h = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "";
        const t = (el.getAttribute("href") || el.textContent || "").trim().slice(0, 60);
        const r = el.getBoundingClientRect();
        return `${el.tagName}:${t}@${Math.round(r.left)},${Math.round(r.top)}`;
      });
      if (h && h !== prev) reached.add(h);
      if (h === prev) break;
      prev = h;
      await page.keyboard.press("Tab");
    }

    const hasSkipLink = await page.evaluate(() => {
      const a = [...document.querySelectorAll("a")];
      return a.some(x => /skip/i.test(x.textContent || ""));
    });

    report.push({ route, focusable, reached: [...reached], hasSkipLink });
    console.log(`${route}: ${focusable} focusable, ${reached.size} reached by Tab, skip link ${hasSkipLink ? "yes" : "NO"}`);
  }

  // Reduced motion check
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const motion = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      motion: style.getPropertyValue("--motion-duration"),
      starfieldStatic: document.querySelector("canvas")?.dataset?.motion === "static",
    };
  });
  console.log("\nReduced-motion emulation:", JSON.stringify(motion));

  await browser.close();
  fs.writeFileSync("tests/keyboard-report.json", JSON.stringify(report, null, 2));
})();