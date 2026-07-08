import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "chart-user",
  full_name: "Chart Analyst",
  email: "chart.analyst@phishguard.test",
  role: "user",
  is_active: true,
  created_at: "2026-07-01T00:00:00Z",
};

const rows = [
  analysisRow("a1", "2026-06-29T10:00:00Z", "safe", 8),
  analysisRow("a2", "2026-07-05T10:00:00Z", "phishing", 72),
  analysisRow("a3", "2026-07-06T10:00:00Z", "safe", 4),
  analysisRow("a4", "2026-07-07T10:00:00Z", "safe", 9),
  analysisRow("a5", "2026-07-08T10:00:00Z", "safe", 6),
];

test("dashboard and reports use operational chart presentations", async ({ page }) => {
  await installSession(page);
  await mockApis(page);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Last 7 Days Activity" })).toBeVisible();
  await expect(page.getByText("Daily analysis volume, focused on what is happening now.")).toBeVisible();
  await expect(page.getByText("Daily analysis volume over the last 7 days.")).toBeVisible();
  await expect(page.locator('[role="img"][aria-label*="Seven-day activity"]')).toBeVisible();

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Weekly Analysis Volume and Phishing Results" })).toBeVisible();
  await expect(page.getByText("Grouped weekly totals compare analysis volume with confirmed phishing results.")).toBeVisible();
  await expect(page.getByText("Total analyses")).toBeVisible();
  await expect(page.getByText("Phishing analyses")).toBeVisible();
  await expect(page.locator('[role="img"][aria-label*="Weekly report chart"]')).toBeVisible();
  await expect(page.getByText("Analysis Volume vs Phishing Rate")).toHaveCount(0);
});

async function installSession(page: Page) {
  await page.addInitScript((sessionUser) => {
    localStorage.setItem("phishguard.access", "chart-token");
    localStorage.setItem("phishguard.refresh", "chart-refresh");
    localStorage.setItem("phishguard.user", JSON.stringify(sessionUser));
  }, user);
}

async function mockApis(page: Page) {
  await page.route("**/api/auth/me", async (route) => route.fulfill({ json: user }));
  await page.route("**/api/admin/system-health", async (route) =>
    route.fulfill({
      json: {
        status: "ok",
        database: "ok",
        model: { available: true, version: "test" },
        optional_reputation_apis: { safe_browsing: false, virustotal: false },
      },
    })
  );
  await page.route("**/api/dashboard/summary", async (route) =>
    route.fulfill({
      json: {
        total_analyses: 5,
        safe_emails: 4,
        low_risk_emails: 0,
        suspicious_emails: 0,
        phishing_emails: 1,
        critical_threats: 0,
        average_risk_score: 19.8,
        recent_analyses: rows,
        classification_distribution: [
          { classification: "safe", count: 4 },
          { classification: "phishing", count: 1 },
        ],
        trend: [
          { date: "2026-07-02", average_risk: 0, count: 0 },
          { date: "2026-07-05", average_risk: 72, count: 1 },
          { date: "2026-07-07", average_risk: 9, count: 1 },
          { date: "2026-07-08", average_risk: 6, count: 1 },
        ],
        common_indicators: [{ indicator: "risk_override", count: 1 }],
        malicious_domains: [],
      },
    })
  );
  await page.route("**/api/feedback/my-feedback", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/analyses/*", async (route) =>
    route.fulfill({
      json: {
        analysis_id: "detail",
        classification: "safe",
        risk_score: 8,
        confidence: 0.8,
        severity: "informational",
        model_version: "test",
        summary: "Safe",
        recommended_action: "Review normally.",
        components: {},
        indicators: [{ type: "risk_override", title: "Risk Override", severity: "low", explanation: "Test", evidence: "Test", score_contribution: 1 }],
        urls: [{ original_url: "https://example.com", actual_destination: "https://example.com", domain: "example.com", uses_https: true, uses_ip_address: false, url_length: 19, number_of_subdomains: 0, suspicious_characters: [], punycode_detected: false, shortening_detected: false, risk_score: 10, risk_level: "low", risk_explanation: "Test" }],
        attachments: [],
        header_findings: {},
        sender_analysis: {},
        language_analysis: {},
        top_model_factors: [],
        sanitized_preview: "Test",
        remote_content_blocked: true,
        created_at: "2026-07-08T10:00:00Z",
      },
    })
  );
  await page.route("**/api/analyses?**", async (route) => route.fulfill({ json: rows }));
}

function analysisRow(id: string, created_at: string, classification: string, risk_score: number) {
  return {
    id,
    subject: `Chart analysis ${id}`,
    sender: "sender@example.com",
    reply_to: null,
    classification,
    risk_score,
    confidence: 0.8,
    model_version: "test",
    analysis_source: "email",
    summary: "Test analysis",
    created_at,
  };
}
