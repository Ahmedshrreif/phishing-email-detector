export type User = {
  id: string;
  full_name: string;
  email: string;
  role: "user" | "analyst" | "admin";
  is_active: boolean;
  created_at: string;
  last_login_at?: string | null;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  user: User;
};

export type Indicator = {
  type: string;
  title: string;
  severity: string;
  explanation: string;
  evidence: string;
  score_contribution: number;
};

export type UrlResult = {
  original_url: string;
  display_text?: string | null;
  actual_destination: string;
  domain?: string | null;
  subdomain?: string | null;
  top_level_domain?: string | null;
  uses_https: boolean;
  uses_ip_address: boolean;
  url_length: number;
  number_of_subdomains: number;
  suspicious_characters: string[];
  punycode_detected: boolean;
  shortening_detected: boolean;
  risk_score: number;
  risk_level: string;
  safety_verdict?: string;
  risk_explanation: string;
  live_checked?: boolean;
  reachable?: boolean | null;
  http_status?: number | null;
  final_url?: string | null;
  redirect_chain?: Array<{ url?: string; status?: number; location?: string }>;
  content_type?: string | null;
  tls_valid?: boolean | null;
  probe_error?: string | null;
  blocked_reason?: string | null;
};

export type Analysis = {
  analysis_id: string;
  classification: string;
  risk_score: number;
  confidence: number;
  severity: string;
  model_version: string;
  summary: string;
  recommended_action: string;
  components: Record<string, Record<string, number>>;
  indicators: Indicator[];
  urls: UrlResult[];
  attachments: Array<{ filename: string; mime_type?: string | null; extension?: string | null; file_size: number; sha256?: string | null; risk_level: string; findings: Record<string, unknown> }>;
  header_findings: Record<string, unknown>;
  sender_analysis: Record<string, unknown>;
  language_analysis: { highlighted_text?: string; matches?: Array<{ category: string; phrases: string[]; score: number }> };
  top_model_factors: Array<{ feature: string; direction: string; contribution: number }>;
  sanitized_preview: string;
  remote_content_blocked: boolean;
  created_at: string;
};

export type AnalysisListItem = {
  id: string;
  subject?: string | null;
  sender?: string | null;
  reply_to?: string | null;
  classification: string;
  risk_score: number;
  confidence: number;
  model_version: string;
  analysis_source: string;
  summary: string;
  created_at: string;
};

export type DashboardSummary = {
  total_analyses: number;
  safe_emails: number;
  low_risk_emails: number;
  suspicious_emails: number;
  phishing_emails: number;
  critical_threats: number;
  average_risk_score: number;
  recent_analyses: AnalysisListItem[];
  classification_distribution: Array<{ classification: string; count: number }>;
  trend: Array<{ date: string; average_risk: number; count: number }>;
  common_indicators: Array<{ indicator: string; count: number }>;
  malicious_domains: Array<{ domain: string; count: number; max_risk?: number }>;
};

export type Feedback = {
  id: string;
  analysis_id: string;
  feedback_type: string;
  suggested_label?: string | null;
  notes?: string | null;
  status: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
};

export type ModelVersion = {
  id: string;
  version: string;
  model_path: string;
  dataset_version: string;
  metrics_json: string;
  hyperparameters_json: string;
  is_active: boolean;
  created_at: string;
};
