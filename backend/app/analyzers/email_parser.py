from __future__ import annotations

import io
import json
import mimetypes
import re
import zipfile
from email import message_from_bytes, message_from_string, policy
from email.message import EmailMessage, Message
from email.utils import getaddresses, parseaddr
from html import escape
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree

from bs4 import BeautifulSoup

from app.analyzers.types import ParsedAttachment, ParsedEmail

URL_RE = re.compile(r"(?i)\b((?:https?://|www\.)[^\s<>'\"]+)")
DANGEROUS_TAGS = {"script", "iframe", "object", "embed", "form", "input", "button", "style", "link", "meta"}
SUPPORTED_UPLOAD_EXTENSIONS = {
    ".7z",
    ".apk",
    ".avi",
    ".bat",
    ".bmp",
    ".cmd",
    ".conf",
    ".csv",
    ".css",
    ".dmg",
    ".doc",
    ".docm",
    ".docx",
    ".dll",
    ".eml",
    ".exe",
    ".gif",
    ".gz",
    ".hta",
    ".htm",
    ".html",
    ".ico",
    ".ini",
    ".img",
    ".iso",
    ".jar",
    ".jpeg",
    ".jpg",
    ".js",
    ".json",
    ".jsx",
    ".lnk",
    ".log",
    ".md",
    ".mkv",
    ".mov",
    ".mp3",
    ".mp4",
    ".msi",
    ".msg",
    ".odp",
    ".ods",
    ".odt",
    ".pdf",
    ".php",
    ".png",
    ".ps1",
    ".ppt",
    ".pptm",
    ".pptx",
    ".py",
    ".rar",
    ".rb",
    ".rtf",
    ".scr",
    ".sh",
    ".svg",
    ".tar",
    ".text",
    ".tif",
    ".tiff",
    ".tsv",
    ".ts",
    ".tsx",
    ".txt",
    ".vbs",
    ".wav",
    ".webm",
    ".webp",
    ".xls",
    ".xlsm",
    ".xlsx",
    ".xml",
    ".yaml",
    ".yml",
    ".zip",
}
TEXT_UPLOAD_EXTENSIONS = {
    ".bat",
    ".cmd",
    ".conf",
    ".csv",
    ".css",
    ".ini",
    ".js",
    ".json",
    ".jsx",
    ".log",
    ".md",
    ".php",
    ".ps1",
    ".py",
    ".rb",
    ".sh",
    ".text",
    ".ts",
    ".tsx",
    ".tsv",
    ".txt",
    ".vbs",
    ".yaml",
    ".yml",
}
HTML_UPLOAD_EXTENSIONS = {".htm", ".html", ".svg"}
ZIP_XML_UPLOAD_EXTENSIONS = {".docx", ".odp", ".ods", ".odt", ".pptx", ".xlsx"}
LEGACY_BINARY_UPLOAD_EXTENSIONS = {".doc", ".ppt", ".xls"}
BINARY_METADATA_UPLOAD_EXTENSIONS = (
    SUPPORTED_UPLOAD_EXTENSIONS
    - TEXT_UPLOAD_EXTENSIONS
    - HTML_UPLOAD_EXTENSIONS
    - ZIP_XML_UPLOAD_EXTENSIONS
    - LEGACY_BINARY_UPLOAD_EXTENSIONS
    - {".eml", ".msg", ".pdf", ".rtf", ".xml"}
)
MAX_EXTRACTED_TEXT_CHARS = 120_000


def _clean_url(url: str) -> str:
    return url.rstrip(").,;]}>\"'")


def extract_urls_from_text(text: str) -> list[dict[str, str | None]]:
    urls = []
    seen = set()
    for match in URL_RE.findall(text or ""):
        cleaned = _clean_url(match)
        if cleaned not in seen:
            seen.add(cleaned)
            urls.append({"original_url": cleaned, "display_text": cleaned})
    return urls


def sanitize_html(html: str) -> tuple[str, str, list[dict[str, str | None]], bool]:
    soup = BeautifulSoup(html or "", "html.parser")
    remote_content_blocked = False
    urls: list[dict[str, str | None]] = []
    for tag in soup.find_all(list(DANGEROUS_TAGS)):
        tag.decompose()
    for tag in soup.find_all(True):
        for attr in list(tag.attrs):
            attr_l = attr.lower()
            if attr_l.startswith("on"):
                del tag.attrs[attr]
            if attr_l in {"srcdoc", "style"}:
                del tag.attrs[attr]
        if tag.name == "img":
            src = str(tag.get("src", ""))
            if src.startswith("http://") or src.startswith("https://") or src.startswith("//"):
                tag["data-blocked-src"] = src
                tag["alt"] = tag.get("alt", "Remote image blocked")
                del tag["src"]
                remote_content_blocked = True
        if tag.name == "a":
            href = str(tag.get("href", "")).strip()
            if href:
                urls.append({"original_url": href, "display_text": tag.get_text(" ", strip=True) or href})
                tag["rel"] = "noreferrer noopener"
                tag["target"] = "_blank"
    text = soup.get_text(" ", strip=True)
    return str(soup), text, urls, remote_content_blocked


def _payload_text(part: Message) -> str:
    payload = part.get_payload(decode=True)
    if payload is None:
        raw = part.get_payload()
        return raw if isinstance(raw, str) else ""
    charset = part.get_content_charset() or "utf-8"
    return payload.decode(charset, errors="replace")


def _header_dict(msg: Message) -> dict[str, str | list[str]]:
    headers: dict[str, str | list[str]] = {}
    for key, value in msg.items():
        lk = key.lower()
        if lk in headers:
            existing = headers[lk]
            if isinstance(existing, list):
                existing.append(str(value))
            else:
                headers[lk] = [existing, str(value)]
        else:
            headers[lk] = str(value)
    return headers


def _header_value(headers: dict[str, str | list[str]], name: str) -> str | None:
    value = headers.get(name.lower())
    if isinstance(value, list):
        return value[-1] if value else None
    return value


def _header_values(headers: dict[str, str | list[str]], name: str) -> list[str]:
    value = headers.get(name.lower())
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _parse_sender(value: str | None) -> tuple[str | None, str | None]:
    display, address = parseaddr(value or "")
    return display or None, address.lower() or None


def _attachments_from_message(msg: Message) -> list[ParsedAttachment]:
    attachments: list[ParsedAttachment] = []
    for part in msg.walk():
        filename = part.get_filename()
        content_disposition = part.get_content_disposition()
        if filename or content_disposition == "attachment":
            payload = part.get_payload(decode=True) or b""
            attachments.append(
                ParsedAttachment(
                    filename=Path(filename or "attachment.bin").name,
                    mime_type=part.get_content_type(),
                    payload=payload,
                )
            )
    return attachments


def _message_to_parsed(msg: Message, source: str) -> ParsedEmail:
    headers = _header_dict(msg)
    sender_name, sender_email = _parse_sender(_header_value(headers, "from"))
    _, reply_to = _parse_sender(_header_value(headers, "reply-to"))
    _, return_path = _parse_sender(_header_value(headers, "return-path"))
    recipients = [address for _, address in getaddresses(_header_values(headers, "to") + _header_values(headers, "cc"))]
    plain_parts: list[str] = []
    html_parts: list[str] = []
    sanitized_html_parts: list[str] = []
    extracted_urls: list[dict[str, str | None]] = []
    remote_content_blocked = False

    if msg.is_multipart():
        parts: Iterable[Message] = msg.walk()
    else:
        parts = [msg]

    for part in parts:
        if part.is_multipart():
            continue
        if part.get_filename() or part.get_content_disposition() == "attachment":
            continue
        content_type = part.get_content_type()
        if content_type == "text/plain":
            plain = _payload_text(part)
            plain_parts.append(plain)
            extracted_urls.extend(extract_urls_from_text(plain))
        elif content_type == "text/html":
            html = _payload_text(part)
            sanitized, html_text, urls, blocked = sanitize_html(html)
            html_parts.append(html_text)
            sanitized_html_parts.append(sanitized)
            extracted_urls.extend(urls)
            remote_content_blocked = remote_content_blocked or blocked

    plain_text = "\n".join(plain_parts).strip()
    html_text = "\n".join(html_parts).strip()
    headers_raw = "\n".join(f"{key}: {value}" for key, value in msg.items())
    return ParsedEmail(
        subject=_header_value(headers, "subject"),
        sender_name=sender_name,
        sender_email=sender_email,
        reply_to=reply_to,
        return_path=return_path,
        recipients=[item.lower() for item in recipients if item],
        date=_header_value(headers, "date"),
        message_id=_header_value(headers, "message-id"),
        plain_text=plain_text,
        html_text=html_text,
        sanitized_html="\n".join(sanitized_html_parts) or f"<pre>{escape(plain_text)}</pre>",
        headers_raw=headers_raw,
        headers=headers,
        received=_header_values(headers, "received"),
        authentication_results=_header_value(headers, "authentication-results"),
        urls=_dedupe_url_records(extracted_urls),
        attachments=_attachments_from_message(msg),
        remote_content_blocked=remote_content_blocked,
        source=source,
    )


def _dedupe_url_records(records: list[dict[str, str | None]]) -> list[dict[str, str | None]]:
    seen = set()
    deduped = []
    for record in records:
        url = record.get("original_url")
        if not url or url in seen:
            continue
        seen.add(url)
        deduped.append(record)
    return deduped


def parse_eml_bytes(content: bytes) -> ParsedEmail:
    msg = message_from_bytes(content, policy=policy.default)
    return _message_to_parsed(msg, "file")


def parse_msg_bytes_best_effort(content: bytes) -> ParsedEmail:
    # Outlook .msg is a compound binary format. This best-effort path extracts printable text
    # without executing embedded content, then parses any RFC822-like headers that are present.
    decoded = content.decode("utf-16", errors="ignore")
    if decoded.count("\x00") > len(decoded) // 4:
        decoded = content.decode("utf-8", errors="ignore")
    printable = "".join(ch if ch.isprintable() or ch in "\r\n\t" else " " for ch in decoded)
    if "Subject:" in printable and "From:" in printable:
        return parse_raw_email(printable.encode("utf-8"))
    urls = extract_urls_from_text(printable)
    return ParsedEmail(
        subject="Uploaded Outlook message",
        plain_text=printable[:50_000],
        sanitized_html=f"<pre>{escape(printable[:50_000])}</pre>",
        urls=urls,
        source="file",
    )


def parse_uploaded_file_bytes(filename: str, content: bytes, content_type: str | None = None) -> ParsedEmail:
    safe_name = Path(filename or "uploaded-file").name
    suffix = Path(safe_name).suffix.lower()
    if suffix == ".eml":
        parsed = parse_eml_bytes(content)
        parsed.source = "file"
        return parsed
    if suffix == ".msg":
        return parse_msg_bytes_best_effort(content)
    if suffix in HTML_UPLOAD_EXTENSIONS:
        return _parse_html_document(safe_name, content, content_type)
    if suffix == ".pdf":
        return _parse_text_document(safe_name, _extract_pdf_text(content), content, content_type)
    if suffix in ZIP_XML_UPLOAD_EXTENSIONS:
        return _parse_text_document(safe_name, _extract_zip_xml_text(suffix, content), content, content_type)
    if suffix == ".rtf":
        return _parse_text_document(safe_name, _extract_rtf_text(_decode_text(content)), content, content_type)
    if suffix == ".xml":
        return _parse_text_document(safe_name, _extract_xml_text(_decode_text(content)), content, content_type)
    if suffix in TEXT_UPLOAD_EXTENSIONS:
        return _parse_text_document(safe_name, _decode_structured_text(suffix, content), content, content_type)
    if suffix in LEGACY_BINARY_UPLOAD_EXTENSIONS:
        return _parse_text_document(safe_name, _extract_printable_sequences(content), content, content_type)
    if suffix in BINARY_METADATA_UPLOAD_EXTENSIONS:
        return _parse_binary_metadata_document(safe_name, content, content_type)
    return _parse_text_document(safe_name, _decode_text(content), content, content_type)


def _file_mime_type(filename: str, content_type: str | None) -> str | None:
    if content_type and content_type != "application/octet-stream":
        return content_type
    return mimetypes.guess_type(filename)[0] or content_type


def _parse_text_document(filename: str, text: str, content: bytes, content_type: str | None) -> ParsedEmail:
    text = _limit_text(text.strip() or _extract_printable_sequences(content))
    urls = extract_urls_from_text(text)
    return ParsedEmail(
        subject=f"Uploaded file: {filename}",
        plain_text=text,
        sanitized_html=f"<pre>{escape(text)}</pre>",
        urls=urls,
        attachments=[ParsedAttachment(filename=filename, mime_type=_file_mime_type(filename, content_type), payload=content)],
        source="file",
    )


def _parse_html_document(filename: str, content: bytes, content_type: str | None) -> ParsedEmail:
    html = _decode_text(content)
    sanitized, html_text, html_urls, blocked = sanitize_html(html)
    text = _limit_text(html_text or BeautifulSoup(html, "html.parser").get_text(" ", strip=True))
    urls = _dedupe_url_records(html_urls + extract_urls_from_text(text))
    return ParsedEmail(
        subject=f"Uploaded file: {filename}",
        plain_text=text,
        html_text=text,
        sanitized_html=sanitized or f"<pre>{escape(text)}</pre>",
        urls=urls,
        attachments=[ParsedAttachment(filename=filename, mime_type=_file_mime_type(filename, content_type), payload=content)],
        remote_content_blocked=blocked,
        source="file",
    )


def _parse_binary_metadata_document(filename: str, content: bytes, content_type: str | None) -> ParsedEmail:
    mime_type = _file_mime_type(filename, content_type) or "unknown"
    text = (
        f"Uploaded file: {filename}\n"
        f"Type: {mime_type}\n"
        f"Size: {len(content)} bytes\n\n"
        "This binary file type was accepted for attachment metadata and risk analysis. "
        "Its contents were not executed, unpacked, or rendered."
    )
    return ParsedEmail(
        subject=f"Uploaded file: {filename}",
        plain_text=text,
        sanitized_html=f"<pre>{escape(text)}</pre>",
        attachments=[ParsedAttachment(filename=filename, mime_type=mime_type, payload=content)],
        source="file",
    )


def _decode_text(content: bytes) -> str:
    candidates = []
    for encoding in ("utf-8-sig", "utf-16", "cp1252", "latin-1"):
        try:
            text = content.decode(encoding, errors="replace")
        except LookupError:
            continue
        replacement_count = text.count("\ufffd")
        candidates.append((replacement_count, _clean_extracted_text(text)))
    if not candidates:
        return ""
    return min(candidates, key=lambda item: item[0])[1]


def _decode_structured_text(suffix: str, content: bytes) -> str:
    text = _decode_text(content)
    if suffix == ".json":
        try:
            return json.dumps(json.loads(text), indent=2, ensure_ascii=False)
        except json.JSONDecodeError:
            return text
    return text


def _clean_extracted_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = "".join(char if char.isprintable() or char in "\r\n\t" else " " for char in text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def _limit_text(text: str) -> str:
    if len(text) <= MAX_EXTRACTED_TEXT_CHARS:
        return text
    return text[:MAX_EXTRACTED_TEXT_CHARS] + "\n\n[Content truncated for analysis safety.]"


def _extract_xml_text(text: str) -> str:
    return _clean_extracted_text(BeautifulSoup(text, "html.parser").get_text(" ", strip=True) or text)


def _extract_rtf_text(text: str) -> str:
    text = re.sub(r"\\'[0-9a-fA-F]{2}", " ", text)
    text = re.sub(r"\\[a-zA-Z]+\d* ?", " ", text)
    text = text.replace("\\par", "\n")
    text = text.replace("{", " ").replace("}", " ").replace("\\", " ")
    return _clean_extracted_text(text)


def _extract_pdf_text(content: bytes) -> str:
    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(io.BytesIO(content))
        return _clean_extracted_text("\n".join(page.extract_text() or "" for page in reader.pages[:75]))
    except Exception:
        return _extract_printable_sequences(content)


def _extract_zip_xml_text(suffix: str, content: bytes) -> str:
    prefixes = {
        ".docx": ("word/document.xml", "word/header", "word/footer"),
        ".odp": ("content.xml",),
        ".ods": ("content.xml",),
        ".odt": ("content.xml",),
        ".pptx": ("ppt/slides/slide", "ppt/notesSlides/notesSlide"),
        ".xlsx": ("xl/sharedStrings.xml", "xl/worksheets/sheet"),
    }[suffix]
    chunks: list[str] = []
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            for name in archive.namelist():
                normalized = name.replace("\\", "/")
                if not normalized.endswith(".xml") or not any(normalized.startswith(prefix) for prefix in prefixes):
                    continue
                xml_text = archive.read(name).decode("utf-8", errors="replace")
                chunks.append(_xml_text_nodes(xml_text))
    except (zipfile.BadZipFile, OSError, KeyError):
        return _extract_printable_sequences(content)
    return _clean_extracted_text("\n".join(item for item in chunks if item)) or _extract_printable_sequences(content)


def _xml_text_nodes(xml_text: str) -> str:
    try:
        root = ElementTree.fromstring(xml_text)
        return " ".join(text.strip() for text in root.itertext() if text and text.strip())
    except ElementTree.ParseError:
        return BeautifulSoup(xml_text, "html.parser").get_text(" ", strip=True)


def _extract_printable_sequences(content: bytes) -> str:
    decoded = _decode_text(content)
    sequences = re.findall(r"[^\x00-\x1f\x7f-\x9f]{4,}", decoded)
    return _clean_extracted_text("\n".join(sequences) or decoded)


def parse_raw_email(content: bytes) -> ParsedEmail:
    return parse_eml_bytes(content)


def parse_headers_only(headers: str) -> ParsedEmail:
    msg = message_from_string(headers, policy=policy.default)
    parsed = _message_to_parsed(msg, "headers")
    parsed.plain_text = ""
    parsed.html_text = ""
    parsed.sanitized_html = "<p>No email body was supplied. Header-only confidence is reduced.</p>"
    return parsed


def parse_manual_email(
    sender_name: str | None,
    sender_email: str | None,
    reply_to: str | None,
    subject: str | None,
    body: str,
    headers: str | None,
    urls: list[str] | None,
) -> ParsedEmail:
    parsed_headers = parse_headers_only(headers or "") if headers else ParsedEmail()
    body_urls = extract_urls_from_text(body)
    explicit_urls = [{"original_url": item.strip(), "display_text": item.strip()} for item in urls or [] if item.strip()]
    sanitized_html, html_text, html_urls, blocked = sanitize_html(body) if "<" in body and ">" in body else ("", "", [], False)
    plain_text = html_text if html_text else body
    parsed_headers.subject = subject or parsed_headers.subject
    parsed_headers.sender_name = sender_name or parsed_headers.sender_name
    parsed_headers.sender_email = (sender_email or parsed_headers.sender_email or "").lower() or None
    parsed_headers.reply_to = (reply_to or parsed_headers.reply_to or "").lower() or None
    parsed_headers.plain_text = plain_text
    parsed_headers.html_text = html_text
    parsed_headers.sanitized_html = sanitized_html or f"<pre>{escape(body)}</pre>"
    parsed_headers.urls = _dedupe_url_records(parsed_headers.urls + body_urls + html_urls + explicit_urls)
    parsed_headers.remote_content_blocked = parsed_headers.remote_content_blocked or blocked
    parsed_headers.source = "paste"
    return parsed_headers
