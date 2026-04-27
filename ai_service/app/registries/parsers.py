"""Registry for document parsers — one per file extension."""

from app.core.registry import Registry

parser_registry = Registry("document_parser")
