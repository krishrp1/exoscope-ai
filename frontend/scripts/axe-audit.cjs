const { chromium } = require("playwright-core");
const { AxeBuilder } = require("@axe-core/playwright");
const fs = require("node:fs");

const BASE = "http://localhost:3001";
const routes = [
  "/",
  "/observatory",
  "/observatory/dataset",
  "/observatory/light-curves",
  "/observatory/detect",
  "/observatory/compare",
  "/observatory/training",
  "/observatory/performance",
  "/observatory/about",
];

const WIDTHS = [1440, 1024, 768, 390];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const report = [];

  for (const route of routes) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      let navOk = true, navErr = "";
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30000 });
      } catch (e) { navOk = false; navErr = e.message.slice(0, 120); }

      if (navOk) {
        await page.waitForTimeout(1500);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();
        const critical = results.violations.filter(v => v.impact === "critical" || v.impact === "serious");
        report.push({
          route, width,
          violations: results.violations.length,
          critical: critical.map(v => ({ id: v.id, help: v.help, nodes: v.nodes.length, impact: v.impact })),
          navErr,
        });
        console.log(`${route} @ ${width}px: ${results.violations.length} violations, ${critical.length} critical/serious`);
      } else {
        report.push({ route, width, navErr, violations: null });
        console.log(`${route} @ ${width}px: NAV FAILED ${navErr}`);
      }
    }
  }

  await browser.close();
  fs.writeFileSync("tests/axe-report.json", JSON.stringify(report, null, 2));
  console.log("\nTotal critical/serious violations across all routes/widths:",
    report.reduce((s, r) => s + (r.critical?.length || 0), 0));
})();