import json
import tempfile
import unittest
from pathlib import Path

import extract_knowledge as extraction


CHUNKS = [extraction.Chunk("chunk-1", 3, 3, "TCP 通过三次握手建立连接。")]
VALID = {
    "entities": [{
        "name": "TCP", "type": "协议", "group": "knowledge",
        "summary": "原文指出 TCP 通过三次握手建立连接。", "confidence": 0.92,
        "evidenceChunkId": "chunk-1",
    }],
    "entities_extra_placeholder": None,
    "relations": [{
        "sourceName": "tcp", "targetName": "三次握手", "relation": "通过",
        "confidence": 0.88, "evidenceChunkId": "chunk-1",
    }],
}

VALID["entities"].append({
    "name": "三次握手", "type": "过程", "group": "experiment",
    "summary": "建立连接的过程。", "confidence": 0.9, "evidenceChunkId": "chunk-1",
})
del VALID["entities_extra_placeholder"]


class ExtractKnowledgeTests(unittest.TestCase):
    def test_messages_send_real_chunk_id_page_and_text(self):
        messages = extraction.build_messages([
            {"chunkId": "real-chunk", "pageStart": 7, "pageEnd": 8, "text": "实验使用随机森林。"}
        ])
        body = json.loads(messages[1]["content"])
        self.assertEqual(body["chunks"][0]["chunkId"], "real-chunk")
        self.assertEqual(body["chunks"][0]["page"], 7)
        self.assertIn("随机森林", body["chunks"][0]["text"])

    def test_valid_extraction_preserves_evidence_and_normalized_names(self):
        result = extraction.validate_content(json.dumps(VALID, ensure_ascii=False), CHUNKS)
        self.assertEqual(result["entities"][0]["evidenceChunkId"], "chunk-1")
        self.assertEqual(result["relations"][0]["targetName"], "三次握手")
        self.assertIn("三次握手", result["entities"][1]["name"])

    def test_rejects_malformed_json(self):
        with self.assertRaisesRegex(extraction.ExtractionError, "not valid JSON"):
            extraction.validate_content("{oops", CHUNKS)

    def test_rejects_fabricated_evidence_and_confidence(self):
        bad = json.loads(json.dumps(VALID))
        bad["entities"][0]["evidenceChunkId"] = "not-input"
        with self.assertRaises(extraction.ExtractionError):
            extraction.validate_content(json.dumps(bad), CHUNKS)
        bad["entities"][0]["evidenceChunkId"] = "chunk-1"
        bad["entities"][0]["confidence"] = 1.2
        with self.assertRaises(extraction.ExtractionError):
            extraction.validate_content(json.dumps(bad), CHUNKS)

    def test_rejects_unknown_fields_and_missing_relation_entity(self):
        bad = json.loads(json.dumps(VALID))
        bad["entities"][0]["extra"] = "forbidden"
        with self.assertRaises(extraction.ExtractionError):
            extraction.validate_content(json.dumps(bad), CHUNKS)
        bad = json.loads(json.dumps(VALID))
        bad["relations"][0]["targetName"] = "不存在实体"
        with self.assertRaises(extraction.ExtractionError):
            extraction.validate_content(json.dumps(bad), CHUNKS)

    def test_cli_generates_messages(self):
        with tempfile.TemporaryDirectory() as directory:
            chunk_file = Path(directory) / "chunks.json"
            chunk_file.write_text(json.dumps([{
                "chunkId": CHUNKS[0].chunk_id,
                "pageStart": CHUNKS[0].page_start,
                "pageEnd": CHUNKS[0].page_end,
                "text": CHUNKS[0].text,
            }]), encoding="utf-8")
            with self.assertRaises(SystemExit) as captured:
                extraction.main(["--chunks", str(chunk_file)])
        self.assertEqual(captured.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
