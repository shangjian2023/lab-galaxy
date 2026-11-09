import importlib.util
import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import pymupdf as fitz
from docx import Document

MODULE_PATH = Path(__file__).resolve().parents[1] / "import_public_corpus.py"
SPEC = importlib.util.spec_from_file_location("import_public_corpus", MODULE_PATH)
corpus = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(corpus)


class CorpusParsingTests(unittest.TestCase):
    def test_pdf_layout_line_breaks_are_normalized(self):
        self.assertEqual(corpus.clean_text("电\n子\n科\n技\n大\n学"), "电子科技大学")
        self.assertEqual(corpus.clean_text("Transmission\nControl\nProtocol"), "Transmission Control Protocol")
        self.assertEqual(corpus.clean_text("一、实验目的：\n验证\nTCP\n连接"), "一、实验目的：\n验证TCP连接")

    def test_pdf_magic_validation_rejects_html(self):
        with self.assertRaisesRegex(ValueError, "not a PDF"):
            corpus.validate_document(b"<html>not a report</html>", "pdf")

    def test_docx_validation_rejects_generic_zip(self):
        import zipfile

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("hello.txt", "not a document")
        with self.assertRaisesRegex(ValueError, "missing required"):
            corpus.validate_document(buffer.getvalue(), "docx")

    def test_pdf_text_pages_and_chunks_are_real(self):
        document = fitz.open()
        page = document.new_page()
        page.insert_textbox(fitz.Rect(72, 72, 520, 760), "Experiment purpose\n" + "Computer architecture " * 100)
        data = document.tobytes()
        document.close()
        parser, pages = corpus.parse_document(data, "pdf")
        self.assertEqual(parser, "PyMuPDF")
        self.assertEqual(pages[0]["page_number"], 1)
        self.assertIn("Experiment purpose", pages[0]["text"])
        self.assertGreater(len(corpus.chunk_pages(pages, size=200, overlap=20)), 1)

    def test_docx_paragraphs_and_tables_are_parsed(self):
        document = Document()
        document.add_heading("实验目的", level=1)
        document.add_paragraph("验证双指针算法的正确性。")
        table = document.add_table(rows=1, cols=2)
        table.cell(0, 0).text = "输入"
        table.cell(0, 1).text = "输出"
        buffer = io.BytesIO()
        document.save(buffer)
        parser, pages = corpus.parse_document(buffer.getvalue(), "docx")
        self.assertEqual(parser, "python-docx")
        self.assertIsNone(pages[0]["page_number"])
        self.assertIn("验证双指针算法", pages[0]["text"])
        self.assertIn("输入 | 输出", pages[0]["text"])

    def test_save_parsed_persists_source_pages_sections_and_chunks(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            connection = corpus.connect_database(root / "corpus.db", MODULE_PATH.parents[1] / "db" / "sqlite" / "001_research_corpus.sql")
            run_id = "test-run"
            connection.execute(
                "INSERT INTO ingestion_runs (id, source_manifest, target_count, status, started_at) VALUES (?, ?, ?, 'running', ?)",
                (run_id, "test.json", 1, corpus.utc_now()),
            )
            source = {
                "id": "one", "title": "算法实验报告", "url": "https://example.test/report.pdf",
                "source_page": "https://example.test/", "institution": "Example University",
                "format": "pdf", "license_note": "test",
            }
            pages = [{"page_number": 1, "text": "实验目的\n验证索引结构。\n\n实验步骤\n创建索引并比较查询。" + "补充实验记录。" * 100}]
            stats = corpus.save_parsed(connection, run_id, source, root / "report.pdf", "abc", 123, "PyMuPDF", pages)
            self.assertGreater(stats["chunks"], 0)
            row = connection.execute("SELECT status, source_url, text_length FROM documents").fetchone()
            self.assertEqual(row["status"], "parsed")
            self.assertEqual(row["source_url"], source["url"])
            self.assertGreaterEqual(connection.execute("SELECT COUNT(*) FROM document_sections").fetchone()[0], 2)
            self.assertGreater(connection.execute("SELECT COUNT(*) FROM document_chunks").fetchone()[0], 0)
            connection.close()

    def test_download_retries_transient_disconnect(self):
        from unittest.mock import patch

        with patch.object(corpus, "download_file", side_effect=[ConnectionError("closed"), ("sha", 123)]) as download, patch.object(corpus.time, "sleep"):
            self.assertEqual(corpus.download_with_retries("https://example.test/report.pdf", Path("unused")), ("sha", 123))
            self.assertEqual(download.call_count, 2)

    def test_manifest_rejects_non_http_urls(self):
        with self.assertRaisesRegex(ValueError, "HTTP"):
            corpus.normalize_source({"url": "file:///etc/passwd", "format": "pdf"})


if __name__ == "__main__":
    unittest.main()
