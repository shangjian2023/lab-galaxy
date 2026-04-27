"""Custom exception hierarchy for structured error responses."""


class AIServiceError(Exception):
    error_code: str = "AI_SERVICE_ERROR"

    def __init__(self, detail: str, error_code: str | None = None):
        self.detail = detail
        if error_code:
            self.error_code = error_code
        super().__init__(detail)


class ParsingError(AIServiceError):
    error_code = "PARSING_ERROR"


class ExtractionError(AIServiceError):
    error_code = "EXTRACTION_ERROR"


class GraphWriteError(AIServiceError):
    error_code = "GRAPH_WRITE_ERROR"


class VectorIndexError(AIServiceError):
    error_code = "VECTOR_INDEX_ERROR"


class ModelNotFoundError(AIServiceError):
    error_code = "MODEL_NOT_FOUND"
