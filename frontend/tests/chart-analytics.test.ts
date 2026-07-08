import { describe, expect, it } from "vitest";
import type { AnalysisListItem } from "@/types/api";
import { buildSevenDayActivity, buildWeeklyThreatData, makeCountTicks, phishingRateForRows } from "@/lib/chart-analytics";

function row(id: string, created_at: string, classification = "safe"): AnalysisListItem {
  return {
    id,
    created_at,
    classification,
    risk_score: classification === "phishing" ? 72 : 5,
    confidence: 0.8,
    model_version: "test",
    analysis_source: "email",
    summary: "test",
    sender: "sender@example.com",
    subject: "Test",
    reply_to: null,
  };
}

describe("chart analytics", () => {
  it("builds exactly seven dashboard days and preserves zero-activity days", () => {
    const points = buildSevenDayActivity(
      [
        { date: "2026-07-02", count: 1 },
        { date: "2026-07-07", count: 7 },
      ],
      new Date(2026, 6, 8)
    );

    expect(points).toHaveLength(7);
    expect(points.map((item) => item.date)).toEqual([
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
    ]);
    expect(points.map((item) => item.analysisCount)).toEqual([1, 0, 0, 0, 0, 7, 0]);
    expect(points[6].isToday).toBe(true);
  });

  it("aggregates report rows into weekly total and phishing bars", () => {
    const rows = [
      row("a", "2026-06-29T10:00:00Z", "safe"),
      row("b", "2026-07-05T10:00:00Z", "phishing"),
      row("c", "2026-07-06T10:00:00Z", "phishing"),
      row("d", "2026-07-06T11:00:00Z", "safe"),
      row("e", "2026-07-07T10:00:00Z", "safe"),
      row("f", "2026-07-08T10:00:00Z", "safe"),
      row("g", "2026-07-09T10:00:00Z", "safe"),
    ];

    const weeks = buildWeeklyThreatData(rows, { from: "2026-06-29T00:00:00", to: "2026-07-12T23:59:59" });

    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ periodStart: "2026-06-29", periodEnd: "2026-07-05", totalAnalyses: 2, phishingAnalyses: 1, phishingRate: 50, isLowVolume: true });
    expect(weeks[1]).toMatchObject({ periodStart: "2026-07-06", periodEnd: "2026-07-12", totalAnalyses: 5, phishingAnalyses: 1, phishingRate: 20, isLowVolume: false });
  });

  it("labels one-day current buckets as a partial week", () => {
    const weeks = buildWeeklyThreatData([], { from: "2026-07-08T00:00:00", to: "2026-07-08T23:59:59" });

    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({
      periodStart: "2026-07-08",
      periodEnd: "2026-07-08",
      label: "Jul 8 · Partial Week",
      isPartial: true,
      totalAnalyses: 0,
    });
  });

  it("returns no phishing rate when there are no analyses", () => {
    expect(phishingRateForRows([])).toBeNull();
  });

  it("uses whole-number count ticks for small chart values", () => {
    expect(makeCountTicks(2)).toEqual([0, 1, 2]);
    expect(makeCountTicks(7)).toEqual([0, 2, 4, 6, 8]);
  });
});
