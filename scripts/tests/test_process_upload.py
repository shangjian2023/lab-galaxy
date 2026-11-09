#!/usr/bin/env python3

import sqlite3
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "db" / "sqlite" / "001_research_corpus.sql"
SCRIPT = ROOT / "scripts" / "process_upload.py"


def create_pdf(path: Path, text: str) -> None:
    import pymupdf

    document = pymupdf.open()
    page = document.new_page()
    page.insert_textbox(page.rect + (36, 36, -36, -36), text, fontname="china-s", fontsize=10)
    document.save(path)
    document.close()


def create_docx(path: Path, text: str) -> None:
    from docx import Document

    document = Document()
    document.add_paragraph(text)
    document.save(path)


def seed(path: Path, source: Path, filename: str, format_name: str) -> tuple[str, str]:
    connection = sqlite3.connect(path)
    connection.executescript(SCHEMA.read_text(encoding="utf8"))
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS upload_tasks (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            original_filename TEXT NOT NULL,
            format TEXT NOT NULL,
            visibility TEXT NOT NULL,
            team_id TEXT,
            source_url TEXT NOT NULL,
            license_note TEXT,
            local_path TEXT NOT NULL,
            sha256 TEXT NOT NULL,
            status TEXT NOT NULL,
            progress INTEGER NOT NULL,
            attempts INTEGER NOT NULL,
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            UNIQUE (owner_id, sha256)
        );
        """
    )
    timestamp = "2026-01-01T00:00:00+00:00"
    owner = str(uuid.uuid4())
    document_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    with connection:
        connection.execute(
            "INSERT INTO users VALUES (?, ?, ?, ?, 'member', 'active', ?, ?, NULL)",
            (owner, "owner@test.invalid", "Owner", "unused", timestamp, timestamp),
        )
        connection.execute(
            """INSERT INTO documents (id, title, source_url, format, local_path, sha256,
               byte_size, status, metadata_json, owner_id, visibility, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'downloaded', '{}', ?, 'private', ?, ?)""",
            (document_id, filename, f"upload://{owner}", format_name, str(source),
             "pending", source.stat().st_size, owner, timestamp, timestamp),
        )
        connection.execute(
            """INSERT INTO upload_tasks (id, owner_id, document_id, original_filename, format,
               visibility, source_url, local_path, sha256, status, progress, attempts, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'private', ?, ?, ?, 'processing', 10, 1, ?, ?)""",
            (task_id, owner, document_id, filename, format_name, f"upload://{owner}", str(source),
             "pending", timestamp, timestamp),
        )
    connection.close()
    return owner, task_id


def update_digests(path: Path, owner: str, task_id: str, document_id: str) -> None:
    import hashlib

    connection = sqlite3.connect(path)
    source = Path(connection.execute("SELECT local_path FROM documents WHERE id = ?", (document_id,)).fetchone()[0])
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    with connection:
        connection.execute("UPDATE documents SET sha256 = ? WHERE id = ?", (digest, document_id))
        connection.execute("UPDATE upload_tasks SET sha256 = ? WHERE id = ?", (digest, task_id))
    connection.close()


def test_processes_pdf_and_docx() -> None:
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        text = "实验目的 " + "可靠解析的持久上传测试。" * 50
        cases = [("source.pdf", "pdf", create_pdf), ("source.docx", "docx", create_docx)]
        for filename, format_name, factory in cases:
            database = root / f"{format_name}.db"
            source = root / filename
            factory(source, text)
            owner, task_id = seed(database, source, filename, format_name)
            document_id = sqlite3.connect(database).execute("SELECT document_id FROM upload_tasks WHERE id = ?", (task_id,)).fetchone()[0]
            update_digests(database, owner, task_id, document_id)
            result = subprocess.run(
                [sys.executable, "-I", str(SCRIPT), "--database", str(database), "--task-id", task_id,
                 "--document-id", document_id, "--source", str(source)],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            assert result.returncode == 0, result.stdout + result.stderr
            connection = sqlite3.connect(database)
            task = connection.execute("SELECT status, progress FROM upload_tasks WHERE id = ?", (task_id,)).fetchone()
            chunks = connection.execute("SELECT COUNT(*) FROM document_chunks WHERE document_id = ?", (document_id,)).fetchone()[0]
            document = connection.execute("SELECT status, parser, text_length FROM documents WHERE id = ?", (document_id,)).fetchone()
            connection.close()
            assert task == ("completed", 100)
            assert document[0] == "parsed"
            assert document[2] >= 200
            assert chunks > 0
            assert '"event":"completed"' in result.stdout


if __name__ == "__main__":
    test_processes_pdf_and_docx()
