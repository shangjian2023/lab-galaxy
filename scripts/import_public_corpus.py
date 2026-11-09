#!/usr/bin/env python3
"""Download and parse a traceable public document corpus into SQLite.

The source manifest is data, never executable input. Only PDF and DOCX files are
accepted; archives are inspected in place and nothing from a document is run.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MAX_FILE_BYTES = 30 * 1024 * 1024
CHUNK_SIZE = 1400
CHUNK_OVERLAP = 180
USER_AGENT = "LabGalaxyPublicCorpus/1.0 (local research import)"
SECTION_PATTERN = re.compile(
    r"^\s*(?:第[一二三四五六七八九十\d]+[章节部分]|[一二三四五六七八九十]+[、.]|\d+(?:\.\d+){0,2}\s+)?"
    r"(实验(?:目的|原理|内容|步骤|过程|结果|分析|总结|报告|名称|设备|环境)|"
    r"实验目的|实验原理|实验步骤|实验结果|结果与分析|结论|总结|讨论|参考文献)\s*[:：]?\s*$"
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_id(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]


def normalize_source(raw: dict[str, Any]) -> dict[str, str]:
    url = str(raw.get("url") or raw.get("direct_url") or "").strip()
    if not url.startswith(("https://", "http://")):
        raise ValueError("source URL must use HTTP(S)")
    source_id = str(raw.get("id") or stable_id(url))
    return {
        "id": source_id,
        "title": str(raw.get("title") or f"Public CS lab report {source_id[:8]}").strip(),
        "url": url,
        "source_page": str(raw.get("source_page") or "").strip(),
        "institution": str(raw.get("institution") or raw.get("source") or "").strip(),
        "format": str(raw.get("format") or Path(url.split("?", 1)[0]).suffix).lower().lstrip("."),
        "license_note": str(raw.get("license_note") or raw.get("license") or "公开可访问；未发现明确开放许可证").strip(),
        "blob_api": str(raw.get("blob_api") or "").strip(),
        "course": str(raw.get("course") or "").strip(),
        "content_type": str(raw.get("content_type") or "lab_report").strip(),
        "repository": str(raw.get("repository") or "").strip(),
        "expected_size": str(raw.get("expected_size") or ""),
    }


def download_file(url: str, destination: Path, timeout: int = 45) -> tuple[str, int]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    digest = hashlib.sha256()
    size = 0
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response, destination.open("wb") as output:
            while True:
                block = response.read(64 * 1024)
                if not block:
                    break
                size += len(block)
                if size > MAX_FILE_BYTES:
                    raise ValueError("file exceeds 30 MiB safety limit")
                digest.update(block)
                output.write(block)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    if size == 0:
        destination.unlink(missing_ok=True)
        raise ValueError("empty download")
    return digest.hexdigest(), size


def download_github_blob(blob_api: str, destination: Path) -> tuple[str, int]:
    if not re.fullmatch(r"repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/git/blobs/[0-9a-f]{40}", blob_api):
        raise ValueError("invalid GitHub blob API identifier")
    try:
        result = subprocess.run(
            ["gh", "api", blob_api, "--jq", ".content"],
            capture_output=True,
            check=True,
            timeout=75,
        )
        if len(result.stdout) > MAX_FILE_BYTES * 2:
            raise ValueError("encoded GitHub blob exceeds safety limit")
        data = base64.b64decode(result.stdout, validate=False)
        if not data or len(data) > MAX_FILE_BYTES:
            raise ValueError("GitHub blob is empty or exceeds 30 MiB")
        destination.write_bytes(data)
        return hashlib.sha256(data).hexdigest(), len(data)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def download_with_retries(url: str, destination: Path, attempts: int = 4, blob_api: str = "") -> tuple[str, int]:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            if blob_api:
                return download_github_blob(blob_api, destination)
            return download_file(url, destination)
        except (urllib.error.URLError, TimeoutError, ConnectionError, subprocess.SubprocessError) as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(1.5 * (2 ** attempt))
    assert last_error is not None
    raise last_error


def validate_document(data: bytes, extension: str) -> None:
    if extension == "pdf":
        if b"%PDF-" not in data[:1024]:
            raise ValueError("downloaded content is not a PDF")
        return
    if extension == "docx":
        if not data.startswith(b"PK\x03\x04"):
            raise ValueError("downloaded content is not a DOCX")
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names = set(archive.namelist())
                if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                    raise ValueError("DOCX package is missing required document parts")
        except zipfile.BadZipFile as error:
            raise ValueError("invalid DOCX ZIP package") from error
        return
    raise ValueError(f"unsupported document format: {extension}")


def clean_text(value: str) -> str:
    value = value.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    raw_lines = [re.sub(r"[\t\f\v ]+", " ", line).strip() for line in value.split("\n")]
    merged: list[str] = []
    for line in raw_lines:
        if not line:
            continue
        if not merged:
            merged.append(line)
            continue
        previous = merged[-1]
        starts_structure = bool(
            SECTION_PATTERN.match(line)
            or re.match(r"^(?:[一二三四五六七八九十]+[、.]|\d+(?:\.\d+)*[、.]?\s+|[a-zA-Z]\)|[ivxlcdm]+\))", line)
        )
        previous_is_heading = len(previous) <= 60 and bool(SECTION_PATTERN.match(previous))
        if starts_structure or previous_is_heading:
            merged.append(line)
            continue
        # PDF 排版会在任意位置换行，中文甚至逐字换行。按字符系统合并，
        # 英文词之间保留空格，避免把排版噪声当成真实段落存入检索库。
        separator = " " if previous[-1].isascii() and previous[-1].isalnum() and line[0].isascii() and line[0].isalnum() else ""
        merged[-1] = previous + separator + line
    return "\n".join(merged).strip()


def parse_pdf(data: bytes) -> list[dict[str, Any]]:
    import pymupdf as fitz

    pages: list[dict[str, Any]] = []
    with fitz.open(stream=data, filetype="pdf") as document:
        if document.needs_pass:
            raise ValueError("encrypted PDF is not supported")
        if len(document) > 300:
            raise ValueError("PDF exceeds 300-page safety limit")
        for index, page in enumerate(document):
            text = clean_text(page.get_text("text"))
            pages.append({"page_number": index + 1, "text": text})
    return pages


def parse_docx(data: bytes) -> list[dict[str, Any]]:
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    document = Document(io.BytesIO(data))
    blocks: list[str] = []
    for child in document.element.body.iterchildren():
        if child.tag.endswith("}p"):
            text = Paragraph(child, document).text
            if text.strip():
                blocks.append(text)
        elif child.tag.endswith("}tbl"):
            table = Table(child, document)
            for row in table.rows:
                cells = [clean_text(cell.text) for cell in row.cells]
                if any(cells):
                    blocks.append(" | ".join(cells))
    # DOCX has no reliable page mapping without a rendering engine; null is honest.
    return [{"page_number": None, "text": clean_text("\n".join(blocks))}]


def parse_document(data: bytes, extension: str) -> tuple[str, list[dict[str, Any]]]:
    validate_document(data, extension)
    if extension == "pdf":
        return "PyMuPDF", parse_pdf(data)
    if extension == "docx":
        return "python-docx", parse_docx(data)
    raise ValueError(f"unsupported document format: {extension}")


def split_sections(text: str) -> list[dict[str, str]]:
    headings: list[tuple[int, str]] = []
    offset = 0
    for line in text.splitlines(keepends=True):
        candidate = line.strip()
        if len(candidate) <= 60 and SECTION_PATTERN.match(candidate):
            headings.append((offset, candidate.rstrip(":：")))
        offset += len(line)
    if not headings:
        return []
    sections: list[dict[str, str]] = []
    if headings[0][0] > 0 and text[: headings[0][0]].strip():
        sections.append({"title": "文档开头", "text": text[: headings[0][0]].strip()})
    for index, (start, title) in enumerate(headings):
        end = headings[index + 1][0] if index + 1 < len(headings) else len(text)
        sections.append({"title": title, "text": text[start:end].strip()})
    return sections


def chunk_pages(pages: list[dict[str, Any]], size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for page in pages:
        text = page["text"]
        if not text:
            continue
        start = 0
        while start < len(text):
            end = min(len(text), start + size)
            if end < len(text):
                paragraph = text.rfind("\n", start + size // 2, end)
                sentence = max(text.rfind("。", start + size // 2, end), text.rfind(". ", start + size // 2, end))
                boundary = max(paragraph, sentence)
                if boundary > start:
                    end = boundary + 1
            chunk_text = text[start:end].strip()
            if chunk_text:
                chunks.append({
                    "page_start": page["page_number"],
                    "page_end": page["page_number"],
                    "text": chunk_text,
                })
            if end >= len(text):
                break
            start = max(start + 1, end - overlap)
    return chunks


def connect_database(path: Path, schema_path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.executescript(schema_path.read_text(encoding="utf-8"))
    return connection


def save_failure(connection: sqlite3.Connection, run_id: str, source: dict[str, str], error: Exception) -> None:
    now = utc_now()
    document_id = stable_id(source["url"])
    connection.execute(
        """INSERT INTO documents (id, ingestion_run_id, title, source_url, source_page, institution,
           format, license_note, status, error_message, metadata_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?, ?, ?, ?)
           ON CONFLICT(source_url) DO UPDATE SET ingestion_run_id=excluded.ingestion_run_id,
           title=excluded.title, status='failed', error_message=excluded.error_message, updated_at=excluded.updated_at""",
        (document_id, run_id, source["title"][:255], source["url"], source["source_page"], source["institution"],
         source["format"], source["license_note"], str(error)[:2000], json.dumps(source, ensure_ascii=False), now, now),
    )
    connection.commit()


def save_parsed(
    connection: sqlite3.Connection,
    run_id: str,
    source: dict[str, str],
    local_path: Path,
    sha256: str,
    byte_size: int,
    parser: str,
    pages: list[dict[str, Any]],
) -> dict[str, int]:
    document_id = stable_id(source["url"])
    now = utc_now()
    full_text = clean_text("\n\n".join(page["text"] for page in pages if page["text"]))
    if len(full_text) < 200:
        raise ValueError(f"insufficient extractable text ({len(full_text)} characters)")
    sections = split_sections(full_text)
    chunks = chunk_pages(pages)
    if not chunks:
        raise ValueError("no non-empty chunks produced")
    page_count = len(pages) if source["format"] == "pdf" else None
    with connection:
        connection.execute(
            """INSERT INTO documents (id, ingestion_run_id, title, source_url, source_page, institution,
               format, license_note, local_path, sha256, byte_size, status, parser, page_count,
               text_length, error_message, metadata_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'parsed', ?, ?, ?, NULL, ?, ?, ?)
               ON CONFLICT(source_url) DO UPDATE SET ingestion_run_id=excluded.ingestion_run_id,
               title=excluded.title, source_page=excluded.source_page, institution=excluded.institution,
               license_note=excluded.license_note, local_path=excluded.local_path, sha256=excluded.sha256,
               byte_size=excluded.byte_size, status='parsed', parser=excluded.parser,
               page_count=excluded.page_count, text_length=excluded.text_length, error_message=NULL,
               metadata_json=excluded.metadata_json, updated_at=excluded.updated_at""",
            (document_id, run_id, source["title"][:255], source["url"], source["source_page"], source["institution"],
             source["format"], source["license_note"], str(local_path), sha256, byte_size, parser, page_count,
             len(full_text), json.dumps(source, ensure_ascii=False), now, now),
        )
        connection.execute("DELETE FROM document_pages WHERE document_id = ?", (document_id,))
        connection.execute("DELETE FROM document_sections WHERE document_id = ?", (document_id,))
        connection.execute("DELETE FROM document_chunks WHERE document_id = ?", (document_id,))
        connection.executemany(
            "INSERT INTO document_pages (document_id, page_number, text, text_length) VALUES (?, ?, ?, ?)",
            [(document_id, page["page_number"], page["text"], len(page["text"])) for page in pages],
        )
        connection.executemany(
            "INSERT INTO document_sections (document_id, ordinal, title, text) VALUES (?, ?, ?, ?)",
            [(document_id, index, section["title"], section["text"]) for index, section in enumerate(sections)],
        )
        connection.executemany(
            """INSERT INTO document_chunks (id, document_id, chunk_index, page_start, page_end,
               text, char_count, token_estimate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            [(f"{document_id}:{index}", document_id, index, chunk["page_start"], chunk["page_end"],
              chunk["text"], len(chunk["text"]), max(1, len(chunk["text"]) // 3)) for index, chunk in enumerate(chunks)],
        )
    return {"text_length": len(full_text), "pages": page_count or 0, "sections": len(sections), "chunks": len(chunks)}


def import_corpus(args: argparse.Namespace) -> dict[str, Any]:
    sources = [normalize_source(item) for item in json.loads(args.sources.read_text(encoding="utf-8"))]
    if len({source["url"] for source in sources}) != len(sources):
        raise ValueError("source manifest contains duplicate URLs")
    args.data_dir.mkdir(parents=True, exist_ok=True)
    connection = connect_database(args.database, args.schema)
    connection.execute(
        "UPDATE ingestion_runs SET status='incomplete', finished_at=?, error_message='interrupted by a newer import run' WHERE status='running'",
        (utc_now(),),
    )
    run_id = str(uuid.uuid4())
    connection.execute(
        "INSERT INTO ingestion_runs (id, source_manifest, target_count, status, started_at) VALUES (?, ?, ?, 'running', ?)",
        (run_id, str(args.sources), args.limit, utc_now()),
    )
    connection.commit()
    successes = 0
    failures: list[dict[str, str]] = []
    records: list[dict[str, Any]] = []
    try:
        for source in sources:
            if successes >= args.limit:
                break
            extension = source["format"]
            try:
                if extension not in {"pdf", "docx"}:
                    raise ValueError(f"unsupported source format: {extension}")
                folder = args.data_dir / source["id"]
                folder.mkdir(exist_ok=True)
                local_path = folder / f"source.{extension}"
                if local_path.exists():
                    data = local_path.read_bytes()
                    expected_size = int(source["expected_size"]) if source["expected_size"].isdigit() else 0
                    if (expected_size and len(data) != expected_size) or len(data) > MAX_FILE_BYTES:
                        local_path.unlink()
                    else:
                        validate_document(data, extension)
                        sha256 = hashlib.sha256(data).hexdigest()
                        byte_size = len(data)
                if not local_path.exists():
                    if any(folder.iterdir()):
                        raise ValueError("dedicated document folder is not empty")
                    sha256, byte_size = download_with_retries(source["url"], local_path, blob_api=source["blob_api"])
                    data = local_path.read_bytes()
                parser, pages = parse_document(data, extension)
                stats = save_parsed(connection, run_id, source, local_path, sha256, byte_size, parser, pages)
                successes += 1
                record = {"id": stable_id(source["url"]), "title": source["title"], "url": source["url"], **stats}
                records.append(record)
                print(json.dumps({"event": "parsed", "successes": successes, **record}, ensure_ascii=False), flush=True)
            except Exception as error:
                save_failure(connection, run_id, source, error)
                failures.append({"url": source["url"], "error": str(error)})
                print(json.dumps({"event": "failed", "url": source["url"], "error": str(error)}, ensure_ascii=False), flush=True)
            time.sleep(args.delay)
        status = "completed" if successes >= args.limit else "incomplete"
        connection.execute(
            "UPDATE ingestion_runs SET status=?, finished_at=?, error_message=? WHERE id=?",
            (status, utc_now(), None if status == "completed" else f"only {successes}/{args.limit} parsed", run_id),
        )
        connection.commit()
    except Exception as error:
        connection.execute("UPDATE ingestion_runs SET status='failed', finished_at=?, error_message=? WHERE id=?",
                           (utc_now(), str(error), run_id))
        connection.commit()
        raise
    summary = {"run_id": run_id, "database": str(args.database), "parsed": successes, "failed": len(failures), "records": records, "failures": failures}
    summary_path = args.data_dir / "import-summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    connection.close()
    return summary


def build_parser() -> argparse.ArgumentParser:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--database", type=Path, default=root / "data" / "lab-galaxy.db")
    parser.add_argument("--schema", type=Path, default=root / "db" / "sqlite" / "001_research_corpus.sql")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--delay", type=float, default=0.25)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.limit < 1:
        raise ValueError("limit must be positive")
    summary = import_corpus(args)
    print(json.dumps({"event": "summary", "parsed": summary["parsed"], "failed": summary["failed"], "database": summary["database"]}, ensure_ascii=False))
    return 0 if summary["parsed"] >= args.limit else 2


if __name__ == "__main__":
    sys.exit(main())
