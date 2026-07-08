from __future__ import annotations

import re
from email.utils import parseaddr
from typing import Any

AUTH_RE = {
    "spf": re.compile(r"spf=(pass|fail|softfail|neutral|none|temperror|permerror)", re.I),
    "dkim": re.compile(r"dkim=(pass|fail|none|temperror|permerror)", re.I),
    "dmarc": re.compile(r"dmarc=(pass|fail|bestguesspass|none|temperror|permerror)", re.I),
}


def _extract_domain(address: str | None) -> str | None:
    _, parsed = parseaddr(address or "")
    if "@" not in parsed:
        return None
    return parsed.rsplit("@", 1)[1].lower()


def analyze_headers(headers: dict[str, Any], received: list[str], auth_results: str | None) -> tuple[dict[str, Any], float, list[dict]]:
    auth_text = auth_results or str(headers.get("authentication-results") or "")
    findings: dict[str, Any] = {
        "spf": "missing",
        "dkim": "missing",
        "dmarc": "missing",
        "authentication_results": auth_text or None,
        "received_path": received,
        "message_id_domain": None,
        "from_domain": _extract_domain(str(headers.get("from") or "")),
        "reply_to_domain": _extract_domain(str(headers.get("reply-to") or "")),
        "return_path_domain": _extract_domain(str(headers.get("return-path") or "")),
        "mismatches": [],
        "missing_security_information": [],
    }
    indicators: list[dict] = []
    score = 0.0

    for name, pattern in AUTH_RE.items():
        match = pattern.search(auth_text or "")
        if match:
            result = match.group(1).lower()
            findings[name] = result
            if result in {"fail", "permerror"}:
                score += 25 if name in {"spf", "dmarc"} else 20
                indicators.append(
                    {
                        "type": f"failed_{name}",
                        "title": f"{name.upper()} authentication failed",
                        "severity": "high" if name in {"spf", "dmarc"} else "medium",
                        "explanation": f"The Authentication-Results header reports {name.upper()}={result}.",
                        "evidence": auth_text[:500],
                        "score_contribution": 10,
                    }
                )
            elif result in {"softfail", "neutral", "temperror"}:
                score += 8
        else:
            findings["missing_security_information"].append(name.upper())
            score += 2

    msg_id = str(headers.get("message-id") or "")
    match = re.search(r"@([^>]+)", msg_id)
    if match:
        findings["message_id_domain"] = match.group(1).lower()
    for left, right, label in [
        (findings["from_domain"], findings["reply_to_domain"], "from_reply_to"),
        (findings["from_domain"], findings["return_path_domain"], "from_return_path"),
        (findings["from_domain"], findings["message_id_domain"], "from_message_id"),
    ]:
        if left and right and left != right:
            findings["mismatches"].append({"type": label, "from": left, "to": right})

    if len(findings["mismatches"]) >= 2:
        score += 10
    if not received:
        findings["missing_security_information"].append("Received path")

    return findings, min(100.0, score), indicators
