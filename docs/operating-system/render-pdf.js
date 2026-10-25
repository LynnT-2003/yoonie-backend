// Renders yoonie-operating-system.html (with its Mermaid diagrams) to PDF in headless Chrome.
// Usage: npx -y -p playwright@1.48.2 node render-pdf.js <html path> <pdf path>
const path = require("path");
const { createRequire } = require("module");

/** Playwright isn't a backend dependency: find the copy `npx -p playwright` put on PATH. */
function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    for (const dir of (process.env.PATH || "").split(path.delimiter)) {
      if (!dir.endsWith(path.join("node_modules", ".bin"))) continue;
      try {
        return createRequire(path.join(dir, "..", "noop.js"))("playwright");
      } catch {
        // not in this one
      }
    }
    throw new Error("Playwright not found. Run with: npx -y -p playwright@1.48.2 node render-pdf.js …");
  }
}

(async () => {
  const [html, pdf] = process.argv.slice(2);
  if (!html || !pdf) throw new Error("Usage: node render-pdf.js <html path> <pdf path>");
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.resolve(html), { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.dataset.ready === "1", null, { timeout: 60000 });
  const unrendered = await page.$$eval(".mermaid", (els) => els.filter((e) => !e.querySelector("svg")).length);
  if (unrendered) throw new Error(`${unrendered} diagram(s) failed to render`);
  await page.pdf({ path: path.resolve(pdf), format: "A4", printBackground: true, preferCSSPageSize: true });
  console.log("wrote", path.resolve(pdf));
  await browser.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
