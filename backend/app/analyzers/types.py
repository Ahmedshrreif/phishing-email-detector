from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ParsedAttachment:
    filename: str
    mime_type: str | None
    payload: bytes


@dataclass
class ParsedEmail:
    subject: str | None = None
    sender_name: str | None = None
    sender_email: str | None = None
    reply_to: str | None = None
    return_path: str | None = None
    recipients: list[str] = field(default_factory=list)
    date: str | None = None
    message_id: str | None = None
    plain_text: str = ""
    html_text: str = ""
    sanitized_html: str = ""
    headers_raw: str = ""
    headers: dict[str, Any] = field(default_factory=dict)
    received: list[str] = field(default_factory=list)
    authentication_results: str | None = None
    urls: list[dict[str, str | None]] = field(default_factory=list)
    attachments: list[ParsedAttachment] = field(default_factory=list)
    remote_content_blocked: bool = False
    source: str = "paste"

    @property
    def analysis_text(self) -> str:
        parts = [self.subject or "", self.plain_text or "", self.html_text or ""]
        return "\n".join(part for part in parts if part)
