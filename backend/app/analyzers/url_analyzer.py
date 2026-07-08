from __future__ import annotations

import ipaddress
import socket
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
import tldextract

from app.core.config import get_settings

SHORTENERS = {
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "goo.gl",
    "ow.ly",
    "is.gd",
    "buff.ly",
    "cutt.ly",
    "rebrand.ly",
    "s.id",
}
RISKY_TLDS = {"zip", "mov", "top", "xyz", "click", "country", "gq", "tk", "ml", "cf", "work", "support"}
SUSPICIOUS_CHARS = {"@", "%", "\\", "|", "~"}
BRAND_KEYWORDS = {"paypal", "microsoft", "office365", "apple", "google", "amazon", "dhl", "fedex", "bank", "invoice"}
WEB_SCHEMES = {"http", "https"}
EXECUTABLE_EXTENSIONS = {".exe", ".scr", ".bat", ".cmd", ".com", ".msi", ".ps1", ".vbs", ".js", ".jar", ".iso"}
DANGEROUS_CONTENT_TYPES = {
    "application/java-archive",
    "application/javascript",
    "application/octet-stream",
    "application/vnd.microsoft.portable-executable",
    "application/x-msdos-program",
    "application/x-msdownload",
    "application/x-sh",
}
USER_AGENT = "PhishGuard-URL-Probe/1.0"


def _with_scheme(url: str) -> str:
    stripped = (url or "").strip()
    parsed = urlparse(stripped)
    if parsed.scheme:
        return stripped
    if stripped.startswith("//"):
        return "https:" + stripped
    return "https://" + stripped.lstrip("/")


def _is_ip(hostname: str | None) -> bool:
    if not hostname:
        return False
    try:
        ipaddress.ip_address(hostname.strip("[]"))
        return True
    except ValueError:
        return False


def _public_ip_status(hostname: str | None) -> tuple[bool, list[str], str | None]:
    if not hostname:
        return False, [], "URL does not contain a host"
    clean_host = hostname.strip("[]")
    try:
        ip = ipaddress.ip_address(clean_host)
        return ip.is_global, [str(ip)], None if ip.is_global else "Host resolves to a private, reserved, or internal IP address"
    except ValueError:
        pass
    try:
        records = socket.getaddrinfo(clean_host, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False, [], "DNS resolution failed"
    addresses = sorted({item[4][0] for item in records})
    if not addresses:
        return False, [], "DNS resolution returned no addresses"
    blocked = []
    for address in addresses:
        try:
            ip = ipaddress.ip_address(address)
        except ValueError:
            blocked.append(address)
            continue
        if not ip.is_global:
            blocked.append(str(ip))
    if blocked:
        return False, addresses, f"Host resolves to non-public address(es): {', '.join(blocked[:3])}"
    return True, addresses, None


def _risk_level(score: float) -> str:
    if score >= 80:
        return "critical"
    if score >= 60:
        return "high"
    if score >= 40:
        return "medium"
    if score >= 20:
        return "low"
    return "informational"


def _safety_verdict(score: float, probe: dict[str, Any]) -> str:
    if score >= 60:
        return "unsafe"
    if score >= 20:
        return "suspicious"
    if probe.get("live_checked") and probe.get("reachable"):
        return "safe"
    return "unknown"


def _content_type_base(value: str | None) -> str:
    return (value or "").split(";", 1)[0].strip().lower()


def _path_extension(url: str) -> str:
    path = urlparse(url).path.lower()
    dot = path.rfind(".")
    return path[dot:] if dot != -1 else ""


def _probe_not_run(reason: str) -> dict[str, Any]:
    return {
        "live_checked": False,
        "reachable": None,
        "http_status": None,
        "final_url": None,
        "redirect_chain": [],
        "content_type": None,
        "tls_valid": None,
        "probe_error": reason,
        "blocked_reason": None,
        "resolved_ips": [],
    }


def _probe_blocked(url: str, reason: str, resolved_ips: list[str] | None = None) -> dict[str, Any]:
    return {
        "live_checked": True,
        "reachable": False,
        "http_status": None,
        "final_url": url,
        "redirect_chain": [],
        "content_type": None,
        "tls_valid": None,
        "probe_error": reason,
        "blocked_reason": reason,
        "resolved_ips": resolved_ips or [],
    }


def _stream_headers(client: httpx.Client, method: str, url: str) -> tuple[int, dict[str, str], bool | None]:
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}
    if method == "GET":
        headers["Range"] = "bytes=0-2048"
    with client.stream(method, url, headers=headers, follow_redirects=False) as response:
        tls_valid = urlparse(str(response.url)).scheme.lower() == "https"
        return response.status_code, dict(response.headers), tls_valid


def _probe_url(url: str) -> dict[str, Any]:
    settings = get_settings()
    current = _with_scheme(url)
    redirects: list[dict[str, str | int]] = []
    timeout = httpx.Timeout(settings.url_probe_timeout_seconds)
    try:
        with httpx.Client(timeout=timeout, verify=True, trust_env=False) as client:
            for _ in range(settings.url_probe_max_redirects + 1):
                parsed = urlparse(current)
                scheme = parsed.scheme.lower()
                if scheme not in WEB_SCHEMES:
                    return _probe_blocked(current, f"Unsupported URL scheme: {parsed.scheme or 'missing'}")
                public, resolved_ips, reason = _public_ip_status(parsed.hostname)
                if not public:
                    return _probe_blocked(current, reason or "URL host is not publicly reachable", resolved_ips)
                status_code, headers, tls_valid = _stream_headers(client, "HEAD", current)
                if status_code in {403, 405, 501}:
                    status_code, headers, tls_valid = _stream_headers(client, "GET", current)
                location = headers.get("location")
                if 300 <= status_code < 400 and location:
                    next_url = urljoin(current, location)
                    redirects.append({"url": current, "status": status_code, "location": next_url})
                    current = next_url
                    continue
                return {
                    "live_checked": True,
                    "reachable": True,
                    "http_status": status_code,
                    "final_url": current,
                    "redirect_chain": redirects,
                    "content_type": headers.get("content-type"),
                    "tls_valid": tls_valid,
                    "probe_error": None,
                    "blocked_reason": None,
                    "resolved_ips": resolved_ips,
                }
            return {
                "live_checked": True,
                "reachable": False,
                "http_status": None,
                "final_url": current,
                "redirect_chain": redirects,
                "content_type": None,
                "tls_valid": None,
                "probe_error": "Redirect limit exceeded",
                "blocked_reason": None,
                "resolved_ips": [],
            }
    except httpx.TransportError as exc:
        message = str(exc) or exc.__class__.__name__
        tls_valid = False if "certificate" in message.lower() or "ssl" in message.lower() else None
        return {
            "live_checked": True,
            "reachable": False,
            "http_status": None,
            "final_url": current,
            "redirect_chain": redirects,
            "content_type": None,
            "tls_valid": tls_valid,
            "probe_error": message[:240],
            "blocked_reason": None,
            "resolved_ips": [],
        }


def analyze_url(record: dict[str, str | None], live_probe: bool | None = None) -> dict:
    original = record.get("original_url") or ""
    display_text = record.get("display_text")
    parseable = _with_scheme(original)
    parsed = urlparse(parseable)
    scheme = parsed.scheme.lower()
    extracted = tldextract.extract(parsed.hostname or "")
    registered_domain = ".".join(part for part in [extracted.domain, extracted.suffix] if part) or parsed.hostname
    tld = extracted.suffix.split(".")[-1] if extracted.suffix else ""
    subdomain_count = len([part for part in extracted.subdomain.split(".") if part])
    uses_ip = _is_ip(parsed.hostname)
    punycode = "xn--" in (parsed.hostname or "").lower()
    shortener = (registered_domain or "").lower() in SHORTENERS
    suspicious_chars = sorted(ch for ch in SUSPICIOUS_CHARS if ch in original)
    is_web_url = scheme in WEB_SCHEMES and bool(parsed.hostname)
    score = 0.0
    reasons: list[str] = []

    if scheme and scheme not in WEB_SCHEMES:
        reasons.append(f"Non-web URL scheme was not opened: {parsed.scheme}")
    elif not parsed.hostname:
        score += 20
        reasons.append("URL is missing a valid host")
    elif scheme != "https":
        score += 10
        reasons.append("URL does not use HTTPS")
    if uses_ip:
        score += 30
        reasons.append("URL uses an IP address instead of a domain")
    if punycode:
        score += 25
        reasons.append("URL contains punycode, which can be used for impersonation")
    if shortener:
        score += 25
        reasons.append("URL uses a known shortening service")
    if len(original) > 100:
        score += 12
        reasons.append("URL is unusually long")
    if subdomain_count >= 3:
        score += 12
        reasons.append("URL contains many subdomains")
    if suspicious_chars:
        score += min(20, 6 * len(suspicious_chars))
        reasons.append("URL contains suspicious characters")
    if tld in RISKY_TLDS:
        score += 12
        reasons.append(f"Top-level domain .{tld} is commonly abused")
    host = (parsed.hostname or "").lower()
    if any(keyword in host for keyword in BRAND_KEYWORDS) and registered_domain and not host.endswith(registered_domain):
        score += 10
    display_text_lower = display_text.lower() if display_text else ""
    if display_text and display_text_lower.startswith(("http://", "https://", "www.")) and display_text != original:
        display_host = urlparse(_with_scheme(display_text)).hostname
        if display_host and display_host != parsed.hostname:
            score += 25
            reasons.append("Displayed link text points to a different destination")

    settings = get_settings()
    should_probe = settings.enable_url_live_probe if live_probe is None else live_probe
    if should_probe and is_web_url:
        probe = _probe_url(parseable)
    elif should_probe:
        probe = _probe_not_run("Live probe skipped because the URL is not an HTTP or HTTPS URL")
    else:
        probe = _probe_not_run("Live URL probe is disabled")

    if probe.get("blocked_reason"):
        score += 45
        reasons.append(f"Live probe blocked the destination: {probe['blocked_reason']}")
    elif probe.get("live_checked") and not probe.get("reachable"):
        error = str(probe.get("probe_error") or "URL could not be reached")
        if probe.get("tls_valid") is False:
            score += 25
            reasons.append("Live probe found an invalid TLS certificate")
        elif "DNS resolution failed" in error:
            score += 8
            reasons.append("Live probe could not resolve the domain")
        elif "Redirect limit exceeded" in error:
            score += 20
            reasons.append("Live probe found too many redirects")
        else:
            score += 6
            reasons.append("Live probe could not reach the URL")
    elif probe.get("reachable"):
        final_url = str(probe.get("final_url") or parseable)
        final_parsed = urlparse(final_url)
        final_extracted = tldextract.extract(final_parsed.hostname or "")
        final_domain = ".".join(part for part in [final_extracted.domain, final_extracted.suffix] if part)
        if final_domain and registered_domain and final_domain.lower() != registered_domain.lower():
            score += 15
            reasons.append(f"URL redirects to a different domain: {final_domain}")
        if final_parsed.scheme == "http":
            score += 10
            reasons.append("Final destination does not use HTTPS")
        status_code = probe.get("http_status")
        if isinstance(status_code, int) and status_code >= 500:
            score += 5
            reasons.append(f"Live probe received server error HTTP {status_code}")
        if _content_type_base(str(probe.get("content_type") or "")) in DANGEROUS_CONTENT_TYPES:
            score += 35
            reasons.append("Live probe found a downloadable or executable content type")
        if _path_extension(final_url) in EXECUTABLE_EXTENSIONS:
            score += 35
            reasons.append("Final URL points to a potentially executable file")

    score = min(100.0, score)
    risk_explanation = "; ".join(dict.fromkeys(reasons))
    if not risk_explanation:
        if probe.get("live_checked") and probe.get("reachable"):
            risk_explanation = "Live URL probe completed and no high-risk pattern was detected."
        elif probe.get("live_checked"):
            risk_explanation = str(probe.get("probe_error") or "Live URL probe could not classify this URL.")
        else:
            risk_explanation = "No high-risk URL pattern was detected by structural analysis."

    return {
        "original_url": original,
        "display_text": display_text,
        "actual_destination": probe.get("final_url") or parseable,
        "domain": registered_domain,
        "subdomain": extracted.subdomain or None,
        "top_level_domain": tld or None,
        "uses_https": scheme == "https",
        "uses_ip_address": uses_ip,
        "url_length": len(original),
        "number_of_subdomains": subdomain_count,
        "suspicious_characters": suspicious_chars,
        "punycode_detected": punycode,
        "shortening_detected": shortener,
        "risk_score": score,
        "risk_level": _risk_level(score),
        "safety_verdict": _safety_verdict(score, probe),
        "risk_explanation": risk_explanation,
        "live_checked": bool(probe.get("live_checked")),
        "reachable": probe.get("reachable"),
        "http_status": probe.get("http_status"),
        "final_url": probe.get("final_url"),
        "redirect_chain": probe.get("redirect_chain") or [],
        "content_type": probe.get("content_type"),
        "tls_valid": probe.get("tls_valid"),
        "probe_error": probe.get("probe_error"),
        "blocked_reason": probe.get("blocked_reason"),
    }


def analyze_urls(records: list[dict[str, str | None]]) -> tuple[list[dict], float]:
    settings = get_settings()
    results = [
        analyze_url(record, live_probe=settings.enable_url_live_probe and index < settings.url_probe_max_urls_per_analysis)
        for index, record in enumerate(records)
    ]
    if not results:
        return [], 0.0
    max_score = max(result["risk_score"] for result in results)
    avg_score = sum(result["risk_score"] for result in results) / len(results)
    return results, min(100.0, max_score * 0.7 + avg_score * 0.3)
