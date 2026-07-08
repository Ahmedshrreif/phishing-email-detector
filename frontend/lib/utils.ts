import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function riskColor(score: number) {
  if (score > 80) return "text-rose-500";
  if (score > 60) return "text-red-400";
  if (score > 40) return "text-amber-300";
  if (score > 20) return "text-cyan";
  return "text-emerald-300";
}

export function riskHex(score: number) {
  if (score > 80) return "#be123c";
  if (score > 60) return "#f87171";
  if (score > 40) return "#fbbf24";
  if (score > 20) return "#22d3ee";
  return "#34d399";
}

export function riskBorderColor(score: number) {
  if (score > 80) return "border-rose-600/50 text-rose-200";
  if (score > 60) return "border-red-400/50 text-red-200";
  if (score > 40) return "border-amber/50 text-amber";
  if (score > 20) return "border-cyan/50 text-cyan";
  return "border-emerald/50 text-emerald";
}

export function riskClassification(score: number) {
  if (score > 80) return { label: "Critical", severity: "Critical", color: "text-rose-500", border: "border-rose-600/50 text-rose-200" };
  if (score > 60) return { label: "Phishing", severity: "High", color: "text-red-400", border: "border-red-400/50 text-red-200" };
  if (score > 40) return { label: "Suspicious", severity: "Medium", color: "text-amber-300", border: "border-amber/50 text-amber" };
  if (score > 20) return { label: "Low Risk", severity: "Low", color: "text-cyan", border: "border-cyan/50 text-cyan" };
  return { label: "Safe", severity: "Informational", color: "text-emerald-300", border: "border-emerald/50 text-emerald" };
}

export function riskLabel(value: string) {
  return securityLabel(value);
}

const SECURITY_LABELS: Record<string, string> = {
  authentication: "Authentication",
  failed_spf: "Failed SPF",
  failed_dkim: "Failed DKIM",
  failed_dmarc: "Failed DMARC",
  spf: "SPF",
  dkim: "DKIM",
  dmarc: "DMARC",
  reply_to_mismatch: "Reply-To Mismatch",
  reply_to: "Reply-To",
  urls: "URLs",
  url: "URL",
  low_risk: "Low Risk",
  suspicious: "Suspicious",
  phishing: "Phishing",
  safe: "Safe",
  critical_threat: "Critical",
  critical: "Critical",
  risk_override: "Risk Override",
  display_name_impersonation: "Display-Name Impersonation",
  brand_impersonation: "Brand Impersonation",
  urgency: "Urgency",
  fear: "Fear",
  credential_request: "Credential Request",
  financial_request: "Financial Request",
  authority_impersonation: "Authority Impersonation",
  account_suspension_threat: "Account Suspension Threat",
  not_evaluated: "Not Evaluated",
  not_configured: "Not Configured",
  ok: "Operational",
  operational: "Operational",
  unavailable: "Unavailable",
  degraded: "Degraded",
  recorded: "Recorded",
  pending: "Pending Review",
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  false_positive: "False Positive",
  false_negative: "False Negative",
  not_sure: "Not Sure",
  correct: "Correct",
  admin_user_updated: "User Updated",
  admin_user_password_reset: "Password Reset",
  admin_user_analyses_deleted: "User Analyses Deleted",
  admin_user_deleted: "User Deleted",
  model_activated: "Model Activated",
  auth_login: "User Login",
  auth_registered: "User Registered",
  analysis_created: "Analysis Created",
  settings_account_deleted: "Account Deleted",
  html: "HTML",
  api: "API",
  ml: "ML",
};

export function securityLabel(value: string | null | undefined) {
  if (!value) return "Unknown";
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (SECURITY_LABELS[normalized]) return SECURITY_LABELS[normalized];
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bUrl(s)?\b/g, "URL$1")
    .replace(/\bSpf\b/g, "SPF")
    .replace(/\bDkim\b/g, "DKIM")
    .replace(/\bDmarc\b/g, "DMARC");
}

export function containsArabic(value: string | null | undefined) {
  return /[\u0600-\u06FF]/.test(value || "");
}

export function textDirectionClass(value: string | null | undefined) {
  return containsArabic(value) ? "font-arabic text-right [direction:rtl] [unicode-bidi:plaintext]" : "";
}

export function formatReadableDateTime(value: string | Date | null | undefined) {
  if (!value) return "Not available";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  const day = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${day} - ${time}`;
}

export function downloadBlob(data: BlobPart, filename: string, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
