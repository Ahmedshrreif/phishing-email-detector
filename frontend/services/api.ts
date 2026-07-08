"use client";

import axios from "axios";
import type { Analysis, AnalysisListItem, DashboardSummary, Feedback, ModelVersion, TokenResponse, User } from "@/types/api";

export const api = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:8000` : "http://localhost:8000")
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("phishguard.access");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function saveTokens(response: TokenResponse) {
  localStorage.setItem("phishguard.access", response.access_token);
  localStorage.setItem("phishguard.refresh", response.refresh_token);
  localStorage.setItem("phishguard.user", JSON.stringify(response.user));
}

export function clearTokens() {
  localStorage.removeItem("phishguard.access");
  localStorage.removeItem("phishguard.refresh");
  localStorage.removeItem("phishguard.user");
}

export function currentUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("phishguard.user");
  return raw ? (JSON.parse(raw) as User) : null;
}

export function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown }; message?: string })?.response?.data;
  const detail = typeof data === "object" && data !== null && "detail" in data ? (data as { detail?: unknown }).detail : data;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null && "msg" in item) return String((item as { msg?: unknown }).msg);
        return "";
      })
      .filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  if (detail && typeof detail === "object" && "msg" in detail) return String((detail as { msg?: unknown }).msg);
  return (error as { message?: string })?.message || fallback;
}

export const client = {
  register: (payload: { full_name: string; email: string; password: string; accept_terms: boolean }) =>
    api.post<TokenResponse>("/api/auth/register", payload).then((r) => r.data),
  login: (payload: { email: string; password: string; remember_me: boolean }) =>
    api.post<TokenResponse>("/api/auth/login", payload).then((r) => r.data),
  me: () => api.get<User>("/api/auth/me").then((r) => r.data),
  forgotPassword: (email: string) => api.post<{ message: string }>("/api/auth/forgot-password", { email }).then((r) => r.data),
  changePassword: (payload: { current_password: string; new_password: string }) =>
    api.post<{ message: string }>("/api/auth/change-password", payload).then((r) => r.data),
  updateProfile: (full_name: string) => api.patch<User>("/api/settings/profile", { full_name }).then((r) => r.data),
  exportPersonalData: () => api.get("/api/settings/export").then((r) => r.data),
  deleteAllAnalyses: () => api.delete<{ message: string }>("/api/settings/analyses").then((r) => r.data),
  deleteAccount: () => api.delete<{ message: string }>("/api/settings/account").then((r) => r.data),
  dashboard: () => api.get<DashboardSummary>("/api/dashboard/summary").then((r) => r.data),
  analyzeEmail: (payload: unknown) => api.post<Analysis>("/api/analyze/email", payload).then((r) => r.data),
  analyzeUrl: (urls: string[]) => api.post<Analysis>("/api/analyze/url", { urls }).then((r) => r.data),
  analyzeHeaders: (headers: string) => api.post<Analysis>("/api/analyze/headers", { headers }).then((r) => r.data),
  analyzeFile: (file: File, onUploadProgress?: (progress: number) => void) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post<Analysis>("/api/analyze/file", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => onUploadProgress?.(Math.round((event.loaded / Math.max(1, event.total || event.loaded)) * 100))
      })
      .then((r) => r.data);
  },
  analyses: (params?: Record<string, string | number>) => api.get<AnalysisListItem[]>("/api/analyses", { params }).then((r) => r.data),
  analysis: (id: string) => api.get<Analysis>(`/api/analyses/${id}`).then((r) => r.data),
  deleteAnalysis: (id: string) => api.delete<{ message: string }>(`/api/analyses/${id}`).then((r) => r.data),
  submitFeedback: (id: string, payload: { feedback_type: string; suggested_label?: string; notes?: string }) =>
    api.post<Feedback>(`/api/analyses/${id}/feedback`, payload).then((r) => r.data),
  myFeedback: () => api.get<Feedback[]>("/api/feedback/my-feedback").then((r) => r.data),
  users: () => api.get<User[]>("/api/admin/users").then((r) => r.data),
  updateUser: (id: string, payload: Partial<Pick<User, "full_name" | "email" | "role" | "is_active">>) =>
    api.patch<User>(`/api/admin/users/${id}`, payload).then((r) => r.data),
  resetUserPassword: (id: string, new_password: string) =>
    api.post<{ message: string }>(`/api/admin/users/${id}/reset-password`, { new_password }).then((r) => r.data),
  clearUserAnalyses: (id: string) => api.delete<{ message: string }>(`/api/admin/users/${id}/analyses`).then((r) => r.data),
  deleteUser: (id: string) => api.delete<{ message: string }>(`/api/admin/users/${id}`).then((r) => r.data),
  adminFeedback: () => api.get<Feedback[]>("/api/admin/feedback").then((r) => r.data),
  approveFeedback: (id: string, dataset_version = "verified-feedback") => api.post<Feedback>(`/api/admin/feedback/${id}/approve`, { dataset_version }).then((r) => r.data),
  rejectFeedback: (id: string, notes: string) => api.post<Feedback>(`/api/admin/feedback/${id}/reject`, { notes }).then((r) => r.data),
  models: () => api.get<ModelVersion[]>("/api/admin/models").then((r) => r.data),
  trainModel: () => api.post<ModelVersion>("/api/admin/models/train", { dataset_version: "verified-feedback" }).then((r) => r.data),
  activateModel: (version: string) => api.post<{ message: string }>(`/api/admin/models/${version}/activate`).then((r) => r.data),
  health: () => api.get("/api/admin/system-health").then((r) => r.data),
  auditLogs: () => api.get<Array<Record<string, unknown>>>("/api/admin/audit-logs").then((r) => r.data)
};
