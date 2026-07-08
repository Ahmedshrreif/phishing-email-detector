from __future__ import annotations

from app.analyzers.email_parser import sanitize_html
from app.analyzers.url_analyzer import _probe_url, analyze_url
from app.schemas.analysis import EmailAnalyzeRequest, UrlAnalyzeRequest


def test_html_sanitization_blocks_remote_content_and_scripts():
    sanitized, text, urls, blocked = sanitize_html(
        '<script>alert(1)</script><img src="https://tracker.example.test/pixel.png" onerror="x"><a href="http://bad.test">login</a>'
    )
    assert "<script" not in sanitized
    assert "onerror" not in sanitized
    assert "data-blocked-src" in sanitized
    assert blocked is True
    assert urls[0]["original_url"] == "http://bad.test"
    assert "login" in text


def test_url_analyzer_scores_shortener_and_ip_urls():
    short = analyze_url({"original_url": "http://bit.ly/a", "display_text": "http://bit.ly/a"})
    ip = analyze_url({"original_url": "http://192.0.2.10/login", "display_text": "http://192.0.2.10/login"})
    assert short["shortening_detected"] is True
    assert short["risk_score"] >= 30
    assert short["live_checked"] is False
    assert ip["uses_ip_address"] is True
    assert ip["risk_score"] >= 40


def test_url_live_probe_blocks_private_destinations_before_request():
    probe = _probe_url("http://127.0.0.1/admin")
    assert probe["live_checked"] is True
    assert probe["reachable"] is False
    assert probe["blocked_reason"]


def test_url_inputs_extract_uppercase_urls_from_freeform_text():
    request = UrlAnalyzeRequest(urls=["Please check HTTPS://www.google.com/ I typed it with a capital I"])
    assert request.urls == ["HTTPS://www.google.com/"]
    email_request = EmailAnalyzeRequest(body="hello", urls=["visit HTTPS://www.google.com/, then stop"])
    assert email_request.urls == ["HTTPS://www.google.com/"]
