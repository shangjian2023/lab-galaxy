#!/usr/bin/env python3
"""Verify persisted corpus counts, source traceability and local file hashes."""

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


def verify(database: Path) -> dict:
    connection = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    documents = connection.execute("SELECT * FROM documents ORDER BY created_at, id").fetchall()
    parsed = [row for row in documents if row["status"] == "parsed"]
    failed = [row for row in documents if row["status"] == "failed"]
    errors = []
    chunk_count = 0
    section_count = 0
    page_count = 0
    character_count = 0
    for row in parsed:
        file_path = Path(row["local_path"])
        if not file_path.is_file():
            errors.append(f"missing file: {row['id']}")
            continue
        digest = hashlib.sha256(file_path.read_bytes()).hexdigest()
        if digest != row["sha256"]:
            errors.append(f"hash mismatch: {row['id']}")
        chunks = connection.execute("SELECT COUNT(*) FROM document_chunks WHERE document_id=?", (row["id"],)).fetchone()[0]
        sections = connection.execute("SELECT COUNT(*) FROM document_sections WHERE document_id=?", (row["id"],)).fetchone()[0]
        pages = connection.execute("SELECT COUNT(*) FROM document_pages WHERE document_id=?", (row["id"],)).fetchone()[0]
        if chunks == 0 or pages == 0 or not row["source_url"].startswith(("https://", "http://")):
            errors.append(f"incomplete traceability: {row['id']}")
        chunk_count += chunks
        section_count += sections
        page_count += pages
        character_count += row["text_length"] or 0
    duplicate_urls = connection.execute("SELECT COUNT(*) FROM (SELECT source_url FROM documents GROUP BY source_url HAVING COUNT(*) > 1)").fetchone()[0]
    if duplicate_urls:
        errors.append(f"duplicate source URLs: {duplicate_urls}")
    result = {
        "database": str(database),
        "parsed_documents": len(parsed),
        "failed_documents": len(failed),
        "chunks": chunk_count,
        "sections": section_count,
        "stored_pages": page_count,
        "characters": character_count,
        "institutions": len({row["institution"] for row in parsed if row["institution"]}),
        "errors": errors,
    }
    connection.close()
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    result = verify(args.database)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
