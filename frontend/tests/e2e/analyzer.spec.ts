import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

test.setTimeout(90_000);

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    full_name: string;
    email: string;
    role: "user" | "admin";
    is_active: boolean;
    created_at: string;
  };
};

async function createTestSession(request: APIRequestContext): Promise<TokenResponse> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await request.post(`${backendUrl}/api/auth/register`, {
    data: {
      full_name: "Analyzer E2E User",
      email: `analyzer.e2e.${unique}@gmail.com`,
      password: "AnalyzerPass123!",
      accept_terms: true,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as TokenResponse;
}

async function installSession(page: Page, session: TokenResponse) {
  await page.addInitScript((tokens) => {
    localStorage.setItem("phishguard.access", tokens.access_token);
    localStorage.setItem("phishguard.refresh", tokens.refresh_token);
    localStorage.setItem("phishguard.user", JSON.stringify(tokens.user));
  }, session);
}

async function cleanupSession(request: APIRequestContext, session?: TokenResponse) {
  if (!session) return;
  await request.delete(`${backendUrl}/api/settings/account`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
}

async function expectResultPage(page: Page) {
  await expect(page).toHaveURL(/\/analyses\/[a-f0-9-]+/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Analysis Result" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Executive Summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Why this result?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Detailed Analysis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sanitized Email Preview" })).toBeVisible();
}

async function openAnalyzer(page: Page) {
  await page.goto("/analyzer");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Email Analyzer" })).toBeVisible();
}

async function selectAnalyzerTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

test("analyzer page supports every input method", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Detailed analyzer coverage runs once on desktop.");

  let session: TokenResponse | undefined;
  try {
    session = await createTestSession(request);
    await installSession(page, session);

    await openAnalyzer(page);
    await expect(page.getByRole("tab", { name: "Paste Email" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Upload File" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Analyze URL" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Raw Headers" })).toBeVisible();

    await page.getByLabel("Sender Email").fill("security@accounts-example.com");
    await page.getByLabel("Subject").fill("Security notice for your account");
    await page.getByLabel("Email Body").fill(
      "Hello, please review your account security notice at HTTPS://WWW.GOOGLE.COM/ and ignore unexpected payment requests.",
    );
    await page.getByRole("button", { name: "Advanced Options" }).click();
    await page.getByLabel("Reply-To Email").fill("support@accounts-example.com");
    await page.getByLabel("Raw Headers").fill(
      [
        "From: Account Security <security@accounts-example.com>",
        "Return-Path: <bounce@accounts-example.com>",
        "Authentication-Results: mx.example.com; spf=pass smtp.mailfrom=accounts-example.com; dkim=pass; dmarc=pass",
      ].join("\n"),
    );
    await page.getByLabel("Additional URLs").fill("HTTPS://WWW.GOOGLE.COM/");
    await page.getByRole("button", { name: "Analyze Email" }).click();
    await expectResultPage(page);
    await expect(page.getByText("HTTPS://WWW.GOOGLE.COM/").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Authentication" })).toBeVisible();

    await openAnalyzer(page);
    await selectAnalyzerTab(page, "Analyze URL");
    await expect(page.getByLabel("URLs")).toBeVisible();
    await page.getByLabel("URLs").fill("HTTPS://WWW.GOOGLE.COM/");
    await page.getByRole("button", { name: "Analyze URLs" }).click();
    await expectResultPage(page);
    await page.getByRole("button", { name: "URL Analysis" }).click();
    await expect(page.getByText("Live URL probe completed").first()).toBeVisible();

    await openAnalyzer(page);
    await selectAnalyzerTab(page, "Raw Headers");
    await expect(page.getByLabel("Raw headers")).toBeVisible();
    await page.getByLabel("Raw headers").fill(
      [
        "From: Login Alert <alerts@example.com>",
        "Reply-To: review@example.net",
        "Return-Path: <bounce@example.com>",
        "Authentication-Results: mx.example.com; spf=fail smtp.mailfrom=example.net; dkim=fail; dmarc=fail",
        "Received: from unknown.example.net by mx.example.com",
      ].join("\n"),
    );
    await page.getByRole("button", { name: "Analyze Headers" }).click();
    await expectResultPage(page);
    await expect(page.getByRole("button", { name: "Authentication" })).toBeVisible();

    await openAnalyzer(page);
    await selectAnalyzerTab(page, "Upload File");
    await expect(page.getByText("No file selected")).toBeVisible();
    await expect(page.getByRole("button", { name: "Analyze File" })).toBeDisabled();
    await page.locator('input[type="file"]').setInputFiles({
      name: "sample.eml",
      mimeType: "message/rfc822",
      buffer: Buffer.from(
        [
          "From: Security Team <security@example.com>",
          "To: user@example.com",
          "Subject: Account security notice",
          "Authentication-Results: mx.example.com; spf=pass; dkim=pass; dmarc=pass",
          "",
          "Review the notice at HTTPS://WWW.GOOGLE.COM/.",
        ].join("\r\n"),
      ),
    });
    await expect(page.getByText(/sample\.eml - \d+\.\d KB/)).toBeVisible();
    await page.getByRole("button", { name: "Analyze File" }).click();
    await expectResultPage(page);
  } finally {
    await cleanupSession(request, session);
  }
});
