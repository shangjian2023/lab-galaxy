#!/usr/bin/env python3
"""Parse one persisted upload task into the existing corpus SQLite schema."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any


def load_corpus_parser() -> Any:
    source = Path(__file__).resolve().with_name("import_public_corpus.py")
    specification = importlib.util.spec_from_file_location("_lab_galaxy_corpus_parser", source)
    if specification is None or specification.loader is None:
        raise RuntimeError("cannot load the corpus parser")
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def utc_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def print_result(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def fail(connection: sqlite3.Connection, task_id: str, document_id: str, message: str) -> None:
    timestamp = utc_now()
    with connection:
        connection.execute(
            """UPDATE upload_tasks
               SET status = 'failed', progress = MAX(progress, 20), error_message = ?,
                   updated_at = ?, finished_at = ?
               WHERE id = ? AND status = 'processing'""",
            (message[:2000], timestamp, timestamp, task_id),
        )
        connection.execute(
            "UPDATE documents SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?",
            (message[:2000], timestamp, document_id),
        )
    print_result({"event": "failed", "taskId": task_id, "documentId": document_id, "error": message[:500]})


def process(args: argparse.Namespace) -> None:
    database_path = args.database.resolve(strict=True)
    source_path = args.source.resolve(strict=True)
    connection = sqlite3.connect(database_path, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 15000")
    try:
        task = connection.execute(
            "SELECT * FROM upload_tasks WHERE id = ?", (args.task_id,)
        ).fetchone()
        document = connection.execute(
            "SELECT * FROM documents WHERE id = ?", (args.document_id,)
        ).fetchone()
        if task is None or document is None or task["document_id"] != document["id"]:
            raise ValueError("upload task or document does not exist")
        if task["status"] != "processing":
            raise ValueError(f"upload task is not processing (current status: {task['status']})")
        if Path(task["local_path"]).resolve() != source_path or Path(document["local_path"]).resolve() != source_path:
            raise ValueError("source path does not match the persisted upload")

        data = source_path.read_bytes()
        if len(data) > 30 * 1024 * 1024:
            raise ValueError("source file exceeds 30 MiB")
        digest = hashlib.sha256(data).hexdigest()
        if digest != task["sha256"] or digest != document["sha256"]:
            raise ValueError("source file checksum does not match the persisted upload")

        connection.execute(
            """UPDATE upload_tasks SET progress = 40, updated_at = ?
               WHERE id = ? AND status = 'processing'""",
            (utc_now(), args.task_id),
        )
        connection.commit()
        corpus = load_corpus_parser()
        parser_name, pages = corpus.parse_document(data, task["format"])
        full_text = corpus.clean_text("\n\n".join(page["text"] for page in pages if page["text"]))
        if len(full_text) < 200:
            raise ValueError(f"insufficient extractable text ({len(full_text)} characters)")
        sections = corpus.split_sections(full_text)
        chunks = corpus.chunk_pages(pages)
        if not chunks:
            raise ValueError("no non-empty chunks produced")

        timestamp = utc_now()
        page_count = len(pages) if task["format"] == "pdf" else None
        metadata = json.loads(document["metadata_json"] or "{}")
        metadata["uploadTaskId"] = args.task_id
        metadata["originalFilename"] = task["original_filename"]
        with connection:
            current = connection.execute(
                "SELECT status FROM upload_tasks WHERE id = ?", (args.task_id,)
            ).fetchone()
            if current is None or current["status"] != "processing":
                raise RuntimeError("upload task changed during parsing")
            connection.execute(
                """UPDATE documents SET status = 'parsed', parser = ?, page_count = ?,
                   text_length = ?, error_message = NULL, metadata_json = ?, updated_at = ?
                   WHERE id = ?""",
                (parser_name, page_count, len(full_text), json.dumps(metadata, ensure_ascii=False), timestamp, args.document_id),
            )
            connection.execute("DELETE FROM document_pages WHERE document_id = ?", (args.document_id,))
            connection.execute("DELETE FROM document_sections WHERE document_id = ?", (args.document_id,))
            connection.execute("DELETE FROM document_chunks WHERE document_id = ?", (args.document_id,))
            connection.executemany(
                "INSERT INTO document_pages (document_id, page_number, text, text_length) VALUES (?, ?, ?, ?)",
                [(args.document_id, page["page_number"], page["text"], len(page["text"])) for page in pages],
            )
            connection.executemany(
                "INSERT INTO document_sections (document_id, ordinal, title, text) VALUES (?, ?, ?, ?)",
                [(args.document_id, index, section["title"], section["text"]) for index, section in enumerate(sections)],
            )
            connection.executemany(
                """INSERT INTO document_chunks (id, document_id, chunk_index, page_start, page_end,
                   text, char_count, token_estimate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        f"{args.document_id}:{index}", args.document_id, index, chunk["page_start"],
                        chunk["page_end"], chunk["text"], len(chunk["text"]), len(chunk["text"]) // 2 + 1,
                    )
                    for index, chunk in enumerate(chunks)
                ],
            )
            connection.execute(
                """UPDATE upload_tasks SET status = 'completed', progress = 100,
                   error_message = NULL, updated_at = ?, finished_at = ?
                   WHERE id = ? AND status = 'processing'""",
                (timestamp, timestamp, args.task_id),
            )
        print_result(
            {
                "event": "completed",
                "taskId": args.task_id,
                "documentId": args.document_id,
                "parser": parser_name,
                "pageCount": page_count,
                "textLength": len(full_text),
                "chunkCount": len(chunks),
                "sectionCount": len(sections),
            }
        )
    except Exception as error:
        fail(connection, args.task_id, args.document_id, str(error))
        raise SystemExit(1)
    finally:
        connection.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--document-id", required=True)
    parser.add_argument("--source", type=Path, required=True)
    return parser


def main() -> int:
    process(build_parser().parse_args())
    return 0


if __name__ == "__main__":
    sys.exit(main())
