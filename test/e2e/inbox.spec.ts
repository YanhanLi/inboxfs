import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe.serial("InboxFS workspace", () => {
  test("meets desktop, theme, mobile, and accessibility baselines", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Watching", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rules 1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reading 1", exact: true })).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);

    await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.getByRole("button", { name: "Use light theme", exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Edit classification rules", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("validates and saves custom rules", async ({ page }) => {
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
    const secondRule = dialog.getByRole("group", { name: "Rule 2", exact: true });
    await secondRule.getByLabel("Name", { exact: true }).fill("Books");
    await secondRule.getByLabel("Destination", { exact: true }).fill("Books");
    await secondRule.getByLabel("Extensions", { exact: true }).fill("epub");
    await dialog.getByRole("button", { name: "Save rules", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("assigned to both");

    await secondRule.getByLabel("Extensions", { exact: true }).fill("cbz");
    await dialog.getByRole("button", { name: "Save rules", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("2 custom rules saved.");
    await expect(page.getByRole("button", { name: "Rules 2", exact: true })).toBeVisible();
  });

  test("inspects, organizes, loads history, and undoes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Inspect chapter.epub", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Details", exact: true });
    await expect(details).toContainText("Custom rule “Reading”");
    await details.getByRole("button", { name: "Close file details", exact: true }).click();

    await page.getByRole("button", { name: "Organize 2", exact: true }).click();
    await expect(page.locator(".notice")).toContainText("2 files organized.");
    const undoNotes = page.getByRole("button", { name: "Undo move of notes.txt", exact: true });
    await expect(undoNotes).toBeVisible();
    await undoNotes.click();
    await expect(page.locator(".notice")).toContainText("File returned to its original location.");
    await expect(undoNotes).toBeDisabled();
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
  });
});
