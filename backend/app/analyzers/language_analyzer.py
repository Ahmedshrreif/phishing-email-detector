from __future__ import annotations

import re
from html import escape

PHRASE_CATEGORIES: dict[str, list[str]] = {
    "urgency": ["urgent", "immediately", "within 24 hours", "today only", "act now", "expires today"],
    "fear": ["suspended", "terminated", "locked", "unauthorized access", "legal action"],
    "authority_pressure": ["security department", "administrator", "ceo", "it support", "compliance team"],
    "credential_request": ["verify your account", "confirm your password", "login to restore", "password expires"],
    "financial_request": ["wire transfer", "payment overdue", "invoice attached", "bank account", "gift card"],
    "account_suspension": ["account will be suspended", "account suspension", "restore access"],
    "prize_or_reward": ["winner", "claim your prize", "reward", "lottery"],
    "confidentiality_pressure": ["confidential", "do not share", "keep this private"],
    "unusual_greeting": ["dear customer", "dear user", "hello friend"],
    "poor_grammar": ["kindly urgent", "verify informations", "your account have"],
}


def analyze_language(text: str) -> tuple[dict, float, list[dict]]:
    lowered = (text or "").lower()
    matches: list[dict] = []
    indicators: list[dict] = []
    score = 0.0
    for category, phrases in PHRASE_CATEGORIES.items():
        found = [phrase for phrase in phrases if phrase in lowered]
        if not found:
            continue
        contribution = min(25.0, 6.0 * len(found))
        score += contribution
        matches.append({"category": category, "phrases": found, "score": contribution})
        severity = "high" if category in {"credential_request", "financial_request", "account_suspension"} else "medium"
        indicators.append(
            {
                "type": category,
                "title": category.replace("_", " ").title(),
                "severity": severity,
                "explanation": "The message contains language commonly seen in social-engineering emails.",
                "evidence": ", ".join(found[:5]),
                "score_contribution": min(8.0, contribution / 2),
            }
        )
    if sum(1 for char in text if char.isupper()) > max(30, len(text) * 0.20):
        score += 8
        indicators.append(
            {
                "type": "excessive_capitalization",
                "title": "Excessive capitalization",
                "severity": "low",
                "explanation": "The message uses unusual capitalization, which can indicate pressure tactics.",
                "evidence": "High uppercase ratio",
                "score_contribution": 3,
            }
        )
    if text.count("!") >= 3:
        score += 5
    highlighted = _highlight_phrases(text, [phrase for item in matches for phrase in item["phrases"]])
    return {"matches": matches, "highlighted_text": highlighted}, min(100.0, score), indicators


def _highlight_phrases(text: str, phrases: list[str]) -> str:
    escaped = escape(text or "")
    for phrase in sorted(set(phrases), key=len, reverse=True):
        pattern = re.compile(re.escape(escape(phrase)), re.I)
        escaped = pattern.sub(lambda m: f"<mark>{m.group(0)}</mark>", escaped)
    return escaped.replace("\n", "<br />")
