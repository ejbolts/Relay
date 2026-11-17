"""Spreadsheet-safe text, with an explicit marker for lossless Relay re-imports."""

TEXT_ENCODING_HEADER = "Relay text encoding"
TEXT_ENCODING = "apostrophe-v1"


def encode_text(value: str) -> str:
    clean = value.lstrip()
    if value.startswith(("'", "\t", "\r", "\n")) or clean.startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def decode_text(row: dict, field: str) -> str:
    value = row.get(field) or ""
    if row.get(TEXT_ENCODING_HEADER) == TEXT_ENCODING and value.startswith("'"):
        return value[1:]
    return value
