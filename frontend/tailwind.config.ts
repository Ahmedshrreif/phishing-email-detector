import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#05070d",
        panel: "rgba(13, 23, 42, 0.76)",
        line: "rgba(148, 163, 184, 0.18)",
        cyan: "#22d3ee",
        blue: "#38bdf8",
        emerald: "#34d399",
        amber: "#fbbf24",
        danger: "#fb7185"
      },
      boxShadow: {
        glow: "0 0 34px rgba(34, 211, 238, 0.18)",
        danger: "0 0 34px rgba(251, 113, 133, 0.18)"
      },
      animation: {
        scan: "scan 2.8s ease-in-out infinite",
        pulseGlow: "pulseGlow 2.4s ease-in-out infinite"
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-110%)", opacity: "0" },
          "30%": { opacity: "1" },
          "100%": { transform: "translateY(120%)", opacity: "0" }
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(34,211,238,.12)" },
          "50%": { boxShadow: "0 0 45px rgba(34,211,238,.28)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
