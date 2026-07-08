import { riskClassification, riskColor, riskHex } from "@/lib/utils";

export function RiskGauge({ score }: { score: number; classification: string }) {
  const angle = Math.max(0, Math.min(100, score)) * 3.6;
  const color = riskHex(score);
  const risk = riskClassification(score);
  return (
    <div className="grid place-items-center">
      <div
        className="relative grid aspect-square w-full max-w-64 place-items-center rounded-full border border-line"
        style={{
          background: `conic-gradient(${color} 0deg ${angle}deg, rgba(148,163,184,.14) ${angle}deg 360deg)`
        }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-label={`Risk score ${score}`}
      >
        <div className="grid h-[78%] w-[78%] place-items-center rounded-full border border-line bg-slate-950 text-center shadow-inner">
          <div>
            <p className={`text-4xl font-black ${riskColor(score)}`}>{Math.round(score)} <span className="text-lg text-slate-500">/ 100</span></p>
            <p className="mt-1 text-sm font-semibold text-slate-100">{risk.label}</p>
            <p className="text-xs text-slate-500">Risk Score</p>
          </div>
        </div>
      </div>
    </div>
  );
}
