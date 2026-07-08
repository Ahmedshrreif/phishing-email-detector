from __future__ import annotations

from email.utils import parseaddr

import tldextract

FREE_EMAIL_DOMAINS = {
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
    "aol.com",
}
BRANDS = {"paypal", "microsoft", "apple", "google", "amazon", "dhl", "fedex", "dropbox", "bank"}


def _domain(address: str | None) -> str | None:
    if not address:
        return None
    _, parsed = parseaddr(address)
    if "@" not in parsed:
        return None
    host = parsed.rsplit("@", 1)[1].lower()
    ext = tldextract.extract(host)
    return ".".join(part for part in [ext.domain, ext.suffix] if part) or host


def analyze_sender(
    display_name: str | None,
    sender_email: str | None,
    reply_to: str | None,
    return_path: str | None,
    body: str,
    message_id: str | None,
) -> tuple[dict, float, list[dict]]:
    sender_domain = _domain(sender_email)
    reply_domain = _domain(reply_to)
    return_domain = _domain(return_path)
    indicators: list[dict] = []
    score = 0.0

    if sender_domain and reply_domain and sender_domain != reply_domain:
        score += 35
        indicators.append(
            {
                "type": "reply_to_mismatch",
                "title": "Reply-to address mismatch",
                "severity": "high",
                "explanation": "The reply-to domain differs from the visible sender domain.",
                "evidence": f"{sender_domain} -> {reply_domain}",
                "score_contribution": 12,
            }
        )
    if sender_domain and return_domain and sender_domain != return_domain:
        score += 20
        indicators.append(
            {
                "type": "return_path_mismatch",
                "title": "Return-path mismatch",
                "severity": "medium",
                "explanation": "The return-path domain differs from the sender domain.",
                "evidence": f"{sender_domain} -> {return_domain}",
                "score_contribution": 7,
            }
        )
    display_l = (display_name or "").lower()
    claimed_brands = [brand for brand in BRANDS if brand in display_l]
    if claimed_brands and sender_domain and all(brand not in sender_domain for brand in claimed_brands):
        score += 25
        indicators.append(
            {
                "type": "display_name_impersonation",
                "title": "Display-name impersonation",
                "severity": "high",
                "explanation": "The display name references a known brand but the sender domain does not match it.",
                "evidence": f"{display_name} via {sender_domain}",
                "score_contribution": 10,
            }
        )
    if sender_domain in FREE_EMAIL_DOMAINS and claimed_brands:
        score += 15
    message_domain = _domain(message_id.strip("<>") if message_id else None)
    if message_domain and sender_domain and message_domain != sender_domain:
        score += 10
        indicators.append(
            {
                "type": "message_id_mismatch",
                "title": "Message-ID domain mismatch",
                "severity": "low",
                "explanation": "The Message-ID domain is different from the sender domain.",
                "evidence": f"{sender_domain} -> {message_domain}",
                "score_contribution": 4,
            }
        )

    return (
        {
            "display_name": display_name,
            "sender_address": sender_email,
            "reply_to_address": reply_to,
            "return_path": return_path,
            "sender_domain": sender_domain,
            "reply_to_domain": reply_domain,
            "return_path_domain": return_domain,
            "domain_mismatch": bool(sender_domain and reply_domain and sender_domain != reply_domain),
            "possible_brand_impersonation": bool(claimed_brands and sender_domain and all(brand not in sender_domain for brand in claimed_brands)),
            "message_id_domain": message_domain,
            "risk_level": "high" if score >= 60 else "medium" if score >= 35 else "low" if score >= 15 else "informational",
        },
        min(100.0, score),
        indicators,
    )
