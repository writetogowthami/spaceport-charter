"""Versioned pilot-name validation shared with the frontend."""

import json
from bisect import bisect_right
from pathlib import Path

MIN_LENGTH = 2
MAX_LENGTH = 100

POLICY_FILE = Path(__file__).resolve().parents[1] / "shared" / "pilot_name_ranges.json"

with POLICY_FILE.open(encoding="utf-8") as file:
    _policy = json.load(file)

UNICODE_VERSION = _policy["unicodeVersion"]

_RANGES = tuple((int(start), int(end)) for start, end in _policy["ranges"])

_RANGE_STARTS = tuple(start for start, _ in _RANGES)

# Match the frontend where native trimming differs (notably U+0085 and U+FEFF).
BOUNDARY_WHITESPACE = frozenset(
    chr(value)
    for value in (
        *range(0x0009, 0x000E),
        0x0020,
        0x0085,
        0x00A0,
        0x1680,
        *range(0x2000, 0x200B),
        0x2028,
        0x2029,
        0x202F,
        0x205F,
        0x3000,
        0xFEFF,
    )
)

ALLOWED_SEPARATORS = frozenset(" '-")


def trim_pilot_name(value: str) -> str:
    return value.strip("".join(BOUNDARY_WHITESPACE))


def is_allowed_letter_or_mark(character: str) -> bool:
    codepoint = ord(character)
    index = bisect_right(_RANGE_STARTS, codepoint) - 1

    return index >= 0 and codepoint <= _RANGES[index][1]


def is_valid_pilot_name(value: object) -> bool:
    if not isinstance(value, str):
        return False

    length = len(value)

    if not MIN_LENGTH <= length <= MAX_LENGTH:
        return False

    if not is_allowed_letter_or_mark(value[0]):
        return False

    return all(
        is_allowed_letter_or_mark(character) or character in ALLOWED_SEPARATORS
        for character in value
    )


def validate_pilot_name(value: str) -> str:
    name = trim_pilot_name(value)

    if not is_valid_pilot_name(name):
        raise ValueError(
            "Pilot name must contain 2–100 characters "
            "using letters, combining marks, spaces, "
            "apostrophes, or hyphens."
        )

    return name
