"""Generate the shared pilot-name character table.

The generated JSON file must be committed to Git.
Run only for an intentional table rebuild or Unicode policy upgrade,
using the Unicode version specified by EXPECTED_UNICODE_VERSION.
"""

import json
import unicodedata
from pathlib import Path

EXPECTED_UNICODE_VERSION = "15.0.0"

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "shared" / "pilot_name_ranges.json"


def main():
    actual = unicodedata.unidata_version

    if actual != EXPECTED_UNICODE_VERSION:
        raise SystemExit(
            f"Expected Unicode {EXPECTED_UNICODE_VERSION}, "
            f"but Python provides {actual}. "
            "Use the pinned generator environment or "
            "upgrade the policy intentionally."
        )

    ranges = []
    start = None
    previous = None

    for codepoint in range(0x110000):
        category = unicodedata.category(chr(codepoint))
        allowed = category.startswith(("L", "M"))

        if allowed:
            if start is None:
                start = codepoint
            elif codepoint != previous + 1:
                ranges.append([start, previous])
                start = codepoint

            previous = codepoint

        elif start is not None:
            ranges.append([start, previous])
            start = None
            previous = None

    if start is not None:
        ranges.append([start, previous])

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    OUTPUT.write_text(
        json.dumps(
            {
                "unicodeVersion": EXPECTED_UNICODE_VERSION,
                "ranges": ranges,
            },
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"Generated {len(ranges)} ranges: {OUTPUT}")


if __name__ == "__main__":
    main()
