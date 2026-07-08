import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RiskGauge } from "@/components/risk-gauge";
import { riskLabel } from "@/lib/utils";

describe("risk presentation", () => {
  it("formats risk labels", () => {
    expect(riskLabel("critical_threat")).toBe("Critical");
  });

  it("renders an accessible risk meter", () => {
    render(<RiskGauge score={84} classification="critical_threat" />);
    expect(screen.getByRole("meter", { name: /risk score 84/i })).toBeInTheDocument();
    expect(screen.getByText("84")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });
});
