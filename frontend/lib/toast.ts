export type ToastTone = "success" | "error" | "info";

export type ToastPayload = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

export const TOAST_EVENT = "phishguard:toast";

export function showToast(payload: ToastPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
}
