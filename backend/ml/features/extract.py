from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlparse

import pandas as pd
import tldextract

NUMERIC_COLUMNS = [
    "url_count",
    "suspicious_url_count",
    "domain_count",
    "max_url_length",
    "avg_subdomain_count",
    "ip_url_count",
    "punycode_url_count",
    "shortener_url_count",
    "attachment_count",
    "suspicious_attachment_count",
    "html_to_text_ratio",
    "form_count",
    "hidden_element_count",
    "capitalized_word_count",
    "exclamation_count",
    "currency_symbol_count",
    "urgency_term_count",
    "credential_term_count",
    "sender_reply_mismatch",
    "sender_return_path_mismatch",
    "display_name_brand_impersonation",
    "free_email_claiming_company",
    "message_id_domain_mismatch",
    "spf_fail",
    "spf_missing",
    "dkim_fail",
    "dkim_missing",
    "dmarc_fail",
    "dmarc_missing",
]

SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "cutt.ly", "rebrand.ly"}
URGENCY_TERMS = ["urgent", "immediately", "act now", "expires", "suspended", "locked", "within 24 hours"]
CREDENTIAL_TERMS = ["verify", "password", "login", "sign in", "credentials", "account"]
BRANDS = ["paypal", "microsoft", "apple", "google", "amazon", "dhl", "fedex", "bank"]
FREE_EMAIL = {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"}
URL_RE = re.compile(r"(?i)\b((?:https?://|www\.)[^\s<>'\"]+)")
CURRENCY_SYMBOLS = ("$", "\u00a3", "\u20ac", "\u00a5")


def _maybe_json(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


def _urls(value: Any, text: str) -> list[str]:
    parsed = _maybe_json(value)
    items: list[str] = []
    if isinstance(parsed, list):
        for item in parsed:
            if isinstance(item, dict):
                url = item.get("original_url") or item.get("url")
            else:
                url = str(item)
            if url:
                items.append(str(url))
    if not items:
        items.extend(match.rstrip(").,;]}>\"'") for match in URL_RE.findall(text or ""))
    return list(dict.fromkeys(items))


def _domain(address: str | None) -> str | None:
    if not address or "@" not in address:
        return None
    host = address.rsplit("@", 1)[1].lower().strip(" <>")
    ext = tldextract.extract(host)
    return ".".join(part for part in [ext.domain, ext.suffix] if part) or host


def _url_stats(urls: list[str]) -> dict[str, float]:
    domains = set()
    sub_counts: list[int] = []
    ip_count = 0
    punycode = 0
    shorteners = 0
    suspicious = 0
    max_len = 0
    for raw in urls:
        raw_with_scheme = raw if raw.startswith(("http://", "https://")) else "http://" + raw
        parsed = urlparse(raw_with_scheme)
        host = parsed.hostname or ""
        ext = tldextract.extract(host)
        registered = ".".join(part for part in [ext.domain, ext.suffix] if part) or host
        domains.add(registered)
        sub_count = len([part for part in ext.subdomain.split(".") if part])
        sub_counts.append(sub_count)
        max_len = max(max_len, len(raw))
        if re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", host):
            ip_count += 1
            suspicious += 1
        if "xn--" in host:
            punycode += 1
            suspicious += 1
        if registered in SHORTENERS:
            shorteners += 1
            suspicious += 1
        if parsed.scheme != "https" or "@" in raw or len(raw) > 100 or sub_count >= 3:
            suspicious += 1
    return {
        "url_count": float(len(urls)),
        "suspicious_url_count": float(suspicious),
        "domain_count": float(len(domains)),
        "max_url_length": float(max_len),
        "avg_subdomain_count": float(sum(sub_counts) / len(sub_counts)) if sub_counts else 0.0,
        "ip_url_count": float(ip_count),
        "punycode_url_count": float(punycode),
        "shortener_url_count": float(shorteners),
    }


def _auth_value(headers: str, name: str) -> tuple[float, float]:
    match = re.search(rf"{name}=(pass|fail|softfail|neutral|none|temperror|permerror)", headers or "", re.I)
    if not match:
        return 0.0, 1.0
    result = match.group(1).lower()
    return (1.0 if result in {"fail", "permerror"} else 0.0, 0.0)


def row_to_features(row: dict[str, Any]) -> dict[str, Any]:
    subject = str(row.get("subject") or "")
    body = str(row.get("body") or row.get("plain_text") or "")
    headers = str(row.get("headers") or row.get("headers_raw") or "")
    html = str(row.get("html") or row.get("sanitized_html") or "")
    text = f"{subject}\n{body}\n{html}".strip()
    urls = _urls(row.get("urls", []), text)
    sender = str(row.get("sender") or row.get("sender_email") or "")
    reply_to = str(row.get("reply_to") or "")
    return_path = str(row.get("return_path") or "")
    sender_domain = _domain(sender)
    reply_domain = _domain(reply_to)
    return_domain = _domain(return_path)
    display_name = str(row.get("sender_name") or "")
    lower = text.lower()
    attachments = _maybe_json(row.get("attachments", []))
    if not isinstance(attachments, list):
        attachments = []
    attachment_count = len(attachments)
    suspicious_attachment_count = 0
    for item in attachments:
        name = str(item.get("filename", item) if isinstance(item, dict) else item).lower()
        if re.search(r"\.(exe|scr|js|vbs|bat|cmd|ps1|msi|jar|hta|lnk|iso|img|docm|xlsm|pptm)(?:$|\.)", name):
            suspicious_attachment_count += 1
    auth_headers = headers.lower()
    spf_fail, spf_missing = _auth_value(auth_headers, "spf")
    dkim_fail, dkim_missing = _auth_value(auth_headers, "dkim")
    dmarc_fail, dmarc_missing = _auth_value(auth_headers, "dmarc")
    url_features = _url_stats(urls)
    brand_claims = [brand for brand in BRANDS if brand in display_name.lower()]
    feature_row: dict[str, Any] = {
        "text": text,
        **url_features,
        "attachment_count": float(attachment_count),
        "suspicious_attachment_count": float(suspicious_attachment_count),
        "html_to_text_ratio": float(len(html) / max(1, len(body))),
        "form_count": float(len(re.findall(r"<form\b", html, re.I))),
        "hidden_element_count": float(len(re.findall(r"display\s*:\s*none|visibility\s*:\s*hidden", html, re.I))),
        "capitalized_word_count": float(len(re.findall(r"\b[A-Z]{4,}\b", text))),
        "exclamation_count": float(text.count("!")),
        "currency_symbol_count": float(sum(text.count(symbol) for symbol in CURRENCY_SYMBOLS)),
        "urgency_term_count": float(sum(lower.count(term) for term in URGENCY_TERMS)),
        "credential_term_count": float(sum(lower.count(term) for term in CREDENTIAL_TERMS)),
        "sender_reply_mismatch": float(bool(sender_domain and reply_domain and sender_domain != reply_domain)),
        "sender_return_path_mismatch": float(bool(sender_domain and return_domain and sender_domain != return_domain)),
        "display_name_brand_impersonation": float(bool(brand_claims and sender_domain and all(brand not in sender_domain for brand in brand_claims))),
        "free_email_claiming_company": float(bool(sender_domain in FREE_EMAIL and brand_claims)),
        "message_id_domain_mismatch": 0.0,
        "spf_fail": spf_fail,
        "spf_missing": spf_missing,
        "dkim_fail": dkim_fail,
        "dkim_missing": dkim_missing,
        "dmarc_fail": dmarc_fail,
        "dmarc_missing": dmarc_missing,
    }
    for column in NUMERIC_COLUMNS:
        feature_row.setdefault(column, 0.0)
    return feature_row


def build_feature_frame(records: list[dict[str, Any]]) -> pd.DataFrame:
    rows = [row_to_features(record) for record in records]
    return pd.DataFrame(rows, columns=["text", *NUMERIC_COLUMNS])
