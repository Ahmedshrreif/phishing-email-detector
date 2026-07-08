import { expect, test } from "@playwright/test";

test("landing page exposes primary actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "PhishGuard", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Analyze an Email/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /API Docs/i })).toBeVisible();
});
