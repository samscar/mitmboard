import { test, expect, type Page } from "@playwright/test";

async function openExclude(page: Page) {
  await page.getByRole("menuitem", { name: "Proxy", exact: true }).click();
  await page.getByRole("menuitem", { name: /SSL Proxying Settings/ }).click();
  const dialog = page.getByRole("dialog", { name: "SSL Proxying Settings" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ request }) => {
  await request.post("/api/__ssl-reset");
});

test("long raw regexes are shown in full, never truncated to '1…'", async ({ page }) => {
  await page.goto("/");
  const dialog = await openExclude(page);
  const code = dialog.getByText("^.*\\.example\\.com(:\\d+)?$", { exact: true });
  await expect(code).toBeVisible();
  const truncated = await code.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(truncated).toBe(false);
});

test("entering 10.53.*.* writes the canonical regex to the server", async ({ page, request }) => {
  await page.goto("/");
  const dialog = await openExclude(page);
  await dialog.getByLabel("Exclude pattern").fill("10.53.*.*");
  await expect(dialog.getByText("^10\\.53\\..*\\..*(:\\d+)?$").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText(/已同步/);
  await expect(dialog.getByText("^10\\.53\\..*\\..*(:\\d+)?$")).toBeVisible();

  const state = await (await request.get("/api/ssl-proxying")).json();
  expect(state.exclude).toContain("^10\\.53\\..*\\..*(:\\d+)?$");
});

test("an external config.yaml edit is picked up after a page refresh", async ({ page, request }) => {
  await page.goto("/");
  await request.post("/api/__ssl-external", {
    data: { exclude: ["^external\\.test(:\\d+)?$"] },
  });
  await page.reload();
  const dialog = await openExclude(page);
  await expect(dialog.getByText("^external\\.test(:\\d+)?$")).toBeVisible();
  await expect(dialog.getByText("(?i)google")).toHaveCount(0);
});
