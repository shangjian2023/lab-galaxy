"""In-memory statistics collector for pipeline metrics."""

import threading
from collections import deque
from dataclasses import dataclass


@dataclass
class PipelineRecord:
    document_id: str
    filename: str
    parse_time: float
    extract_time: float
    total_time: float
    entity_count: int
    relation_count: int


class StatsCollector:
    def __init__(self, max_records: int = 1000):
        self._records: deque[PipelineRecord] = deque(maxlen=max_records)
        self._lock = threading.Lock()

    def record_pipeline(self, doc_id: str, filename: str, parse_time: float,
                        extract_time: float, total_time: float,
                        entity_count: int, relation_count: int):
        rec = PipelineRecord(doc_id, filename, parse_time, extract_time,
                             total_time, entity_count, relation_count)
        with self._lock:
            self._records.append(rec)

    def get_summary(self) -> dict:
        with self._lock:
            if not self._records:
                return {"total_documents": 0}
            recs = list(self._records)
        n = len(recs)
        return {
            "total_documents": n,
            "avg_parse_time": round(sum(r.parse_time for r in recs) / n, 3),
            "avg_extract_time": round(sum(r.extract_time for r in recs) / n, 3),
            "avg_total_time": round(sum(r.total_time for r in recs) / n, 3),
            "avg_entities_per_doc": round(sum(r.entity_count for r in recs) / n, 1),
            "avg_relations_per_doc": round(sum(r.relation_count for r in recs) / n, 1),
        }

    def get_accuracy(self) -> dict:
        with self._lock:
            if not self._records:
                return {"total_documents": 0}
            recs = list(self._records)
        n = len(recs)
        zero_entity = sum(1 for r in recs if r.entity_count == 0)
        return {
            "total_documents": n,
            "avg_entities_per_doc": round(sum(r.entity_count for r in recs) / n, 1),
            "avg_relations_per_doc": round(sum(r.relation_count for r in recs) / n, 1),
            "empty_extraction_count": zero_entity,
            "empty_extraction_ratio": round(zero_entity / n, 3) if n else 0,
        }


stats_collector = StatsCollector()
