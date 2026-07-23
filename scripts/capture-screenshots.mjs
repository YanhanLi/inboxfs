import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.INBOXFS_SCREENSHOT_URL ?? "http://127.0.0.1:4179";
const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch(existsSync(systemChrome) ? { executablePath: systemChrome } : {});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.getByRole("heading", { name: "All files" }).waitFor();
  await page.screenshot({ path: path.resolve("docs/inboxfs-workspace.png"), fullPage: true });

  const rulesButton = page.getByRole("button", { name: /^Rules/ });
  await rulesButton.click();
  await page.getByRole("dialog", { name: "Custom rules" }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve("docs/inboxfs-rules.png") });

  await page.getByRole("button", { name: "Close custom rules" }).click();
  const aiButton = page.getByRole("button", { name: /^Local AI/ });
  await aiButton.click();
  const aiDialog = page.getByRole("dialog", { name: "Review unmatched files" });
  await aiDialog.getByLabel("Enabled", { exact: true }).check();
  await aiDialog.getByLabel("Allowed destinations", { exact: true }).fill("Projects, Archive");
  await aiDialog.getByRole("button", { name: "Save configuration" }).click();
  await aiDialog.getByRole("button", { name: "Analyze", exact: true }).click();
  await aiDialog.getByText("Review suggestions", { exact: true }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve("docs/inboxfs-ai.png") });

  await aiDialog.getByRole("button", { name: "Close local AI review" }).click();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.screenshot({ path: path.resolve("docs/inboxfs-workspace-dark.png"), fullPage: true });

  await rulesButton.click();
  await page.getByRole("dialog", { name: "Custom rules" }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve("docs/inboxfs-rules-dark.png") });
  await page.getByRole("button", { name: "Close custom rules" }).click();

  await aiButton.click();
  await page.getByRole("dialog", { name: "Review unmatched files" }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve("docs/inboxfs-ai-dark.png") });
} finally {
  await browser.close();
}
