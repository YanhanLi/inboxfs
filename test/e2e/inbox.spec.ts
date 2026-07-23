import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe.serial("InboxFS workspace", () => {
  test("meets desktop, theme, mobile, and accessibility baselines", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Watching", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rules 1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reading 1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Local AI 1", exact: true })).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);

    await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.getByRole("button", { name: "Use light theme", exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Edit classification rules", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review unmatched files with local AI", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("previews, reorders, and saves multi-condition rules", async ({ page }) => {
    await page.route("**/api/config", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Configuration service unavailable" }) });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Rules 1", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Custom rules", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toContainText("Configuration service unavailable");
    await expect(dialog.getByRole("button", { name: "Replace configuration", exact: true })).toHaveCount(0);
    await page.unroute("**/api/config");
    await dialog.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Add rule", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Add rule", exact: true }).click();
    const secondRule = dialog.getByRole("group", { name: "Priority 2", exact: true });
    await secondRule.getByLabel("Name", { exact: true }).fill("Books");
    await secondRule.getByLabel("Destination", { exact: true }).fill("Books");
    await secondRule.getByLabel("Extensions", { exact: true }).fill("epub");
    await secondRule.getByLabel("File name globs", { exact: true }).fill("chapter*");
    await secondRule.getByLabel("Maximum bytes", { exact: true }).fill("10");
    await secondRule.getByLabel("Enabled", { exact: true }).uncheck();
    await expect(secondRule.getByText("Disabled", { exact: true })).toBeVisible();
    await secondRule.getByLabel("Enabled", { exact: true }).check();
    await expect(secondRule.getByText("fully shadowed", { exact: false })).toBeVisible();
    await secondRule.getByRole("button", { name: "Move Books up", exact: true }).click();
    const firstRule = dialog.getByRole("group", { name: "Priority 1", exact: true });
    await expect(firstRule.getByLabel("Name", { exact: true })).toHaveValue("Books");
    await expect(firstRule.getByText("1 match", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1 destination change", { exact: true })).toBeVisible();
    const unsavedConfig = await page.request.get("/api/config");
    expect((await unsavedConfig.json()).rules).toHaveLength(1);
    const unsavedScan = await page.request.get("/api/scan");
    expect((await unsavedScan.json()).suggestions.find((item: { name: string }) => item.name === "chapter.epub").category).toBe("Reading");
    const accessibility = await new AxeBuilder({ page }).include(".rules-dialog").analyze();
    expect(accessibility.violations).toEqual([]);
    await dialog.getByRole("button", { name: "Save rules", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("2 custom rules saved.");
    await expect(page.getByRole("button", { name: "Rules 2", exact: true })).toBeVisible();
  });

  test("rejects unsafe globs without losing the rule draft", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Rules 2", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Custom rules", exact: true });
    const firstRule = dialog.getByRole("group", { name: "Priority 1", exact: true });
    await expect(firstRule.getByLabel("Name", { exact: true })).toHaveValue("Books");
    await firstRule.getByLabel("File name globs", { exact: true }).fill("../*.epub");
    await expect(dialog.getByText("not a supported file name glob", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Save rules", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("not a supported file name glob");
    await expect(firstRule.getByLabel("Name", { exact: true })).toHaveValue("Books");
    await firstRule.getByLabel("File name globs", { exact: true }).fill("chapter*");
    await expect(firstRule.getByText("1 match", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Save rules", exact: true }).click();
    await expect(page.locator(".notice")).toContainText("2 custom rules saved.");
  });

  test("keeps the rule editor operable at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Edit classification rules", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Custom rules", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("group", { name: "Priority 1", exact: true }).getByLabel("Name", { exact: true })).toHaveValue("Books");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).include(".rules-dialog").analyze();
    expect(accessibility.violations).toEqual([]);
    await dialog.getByRole("button", { name: "Close custom rules", exact: true }).click();
  });

  test("configures, cancels, reviews, and applies local AI suggestions without moving files", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Local AI 1", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Review unmatched files", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("1 local model ready", { exact: true })).toBeVisible();
    await dialog.getByLabel("Enabled", { exact: true }).check();
    await dialog.getByLabel("Allowed destinations", { exact: true }).fill("Projects, Archive");
    await dialog.getByLabel("Read supported text locally", { exact: false }).check();
    await dialog.getByRole("button", { name: "Save configuration", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Analyze", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Analyze", exact: true }).click();
    await expect(dialog.getByText("Analyzing locally", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Stop analysis", exact: true }).click();
    await expect(dialog.getByText("Analysis cancelled", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Close local AI review", exact: true }).click();

    await page.getByRole("button", { name: "Local AI 1", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Review unmatched files", exact: true });
    await dialog.getByRole("button", { name: "Analyze", exact: true }).click();
    await expect(dialog.getByText("Review suggestions", { exact: true })).toBeVisible();
    await expect(dialog.getByText("92%", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Use suggestion for project-plan.unknown", { exact: true })).toBeChecked();
    await dialog.getByLabel("Destination for project-plan.unknown", { exact: true }).selectOption("Archive");
    const accessibility = await new AxeBuilder({ page }).include(".ai-dialog").analyze();
    expect(accessibility.violations).toEqual([]);
    await dialog.getByRole("button", { name: "Add to plan", exact: true }).click();
    await expect(page.locator(".notice")).toContainText("Local suggestions added to the plan.");
    await expect(page.locator(".row", { hasText: "project-plan.unknown" })).toContainText("Archive");
    const source = await page.request.get("/api/scan");
    expect((await source.json()).suggestions.find((item: { name: string }) => item.name === "project-plan.unknown").category).toBe("Other");
  });

  test("keeps local AI review operable at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Review unmatched files with local AI", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Review unmatched files", exact: true });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await dialog.locator(".ai-footer").evaluate((footer) => footer.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).include(".ai-dialog").analyze();
    expect(accessibility.violations).toEqual([]);
    await dialog.getByRole("button", { name: "Close local AI review", exact: true }).click();
  });

  test("inspects, organizes an AI plan, loads history, and undoes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Local AI 1", exact: true }).click();
    const aiDialog = page.getByRole("dialog", { name: "Review unmatched files", exact: true });
    await aiDialog.getByRole("button", { name: "Analyze", exact: true }).click();
    await expect(aiDialog.getByText("Review suggestions", { exact: true })).toBeVisible();
    await expect(aiDialog.getByText("Metadata only · cached", { exact: true })).toBeVisible();
    await aiDialog.getByRole("button", { name: "Create rule", exact: true }).click();
    const rulesDialog = page.getByRole("dialog", { name: "Custom rules", exact: true });
    const seededRule = rulesDialog.getByRole("group", { name: "Priority 3", exact: true });
    await expect(seededRule.getByLabel("Name", { exact: true })).toHaveValue("project-plan.unknown files");
    await expect(seededRule.getByLabel("File name globs", { exact: true })).toHaveValue("project-plan.unknown");
    await expect(seededRule.getByLabel("Destination", { exact: true })).toHaveValue("Projects");
    page.once("dialog", (confirmation) => confirmation.accept());
    await rulesDialog.getByRole("button", { name: "Close custom rules", exact: true }).click();

    await page.getByRole("button", { name: "Local AI 1", exact: true }).click();
    const planDialog = page.getByRole("dialog", { name: "Review unmatched files", exact: true });
    await planDialog.getByRole("button", { name: "Analyze", exact: true }).click();
    await expect(planDialog.getByText("Metadata only · cached", { exact: true })).toBeVisible();
    await planDialog.getByRole("button", { name: "Add to plan", exact: true }).click();

    await page.getByRole("button", { name: "Inspect project-plan.unknown", exact: true }).click();
    let details = page.getByRole("dialog", { name: "Details", exact: true });
    await expect(details).toContainText("Local AI");
    await expect(details).toContainText("fixture-model:1b · Ollama · 127.0.0.1");
    await details.getByRole("button", { name: "Close file details", exact: true }).click();

    await page.getByRole("button", { name: "Inspect chapter.epub", exact: true }).click();
    details = page.getByRole("dialog", { name: "Details", exact: true });
    await expect(details).toContainText("Custom rule “Books”");
    await details.getByRole("button", { name: "Close file details", exact: true }).click();

    await page.getByRole("button", { name: "Organize 3", exact: true }).click();
    await expect(page.locator(".notice")).toContainText("3 files organized.");
    const undoProject = page.getByRole("button", { name: "Undo move of project-plan.unknown", exact: true });
    await expect(undoProject).toBeVisible();
    await undoProject.click();
    await expect(page.locator(".notice")).toContainText("File returned to its original location.");
    await expect(undoProject).toBeDisabled();
  });

  test("recovers when lazy summary and panel chunks fail", async ({ page }) => {
    await page.route(/Summary-.*\.js$/, async (route) => route.abort());
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText("Panel unavailable");
    await page.unroute(/Summary-.*\.js$/);
    await page.getByRole("button", { name: "Reload workspace", exact: true }).click();
    await expect(page.getByRole("region", { name: "Inbox summary", exact: true })).toBeVisible();

    let failed = false;
    await page.route(/RulesDialog-.*\.js$/, async (route) => {
      if (!failed) {
        failed = true;
        await route.abort();
      } else {
        await route.continue();
      }
    });
    await page.getByRole("button", { name: "Rules 2", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Panel unavailable");
    await page.unroute(/RulesDialog-.*\.js$/);
    await page.getByRole("button", { name: "Reload workspace", exact: true }).click();
    await page.getByRole("button", { name: "Rules 2", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Custom rules", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close custom rules", exact: true }).click();

    let aiFailed = false;
    await page.route(/AiDialog-.*\.js$/, async (route) => {
      if (!aiFailed) { aiFailed = true; await route.abort(); } else await route.continue();
    });
    await page.getByRole("button", { name: "Local AI 1", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Panel unavailable");
    await page.unroute(/AiDialog-.*\.js$/);
    await page.getByRole("button", { name: "Reload workspace", exact: true }).click();
    await page.getByRole("button", { name: "Local AI 1", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Review unmatched files", exact: true })).toBeVisible();
  });
});
