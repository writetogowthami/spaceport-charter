import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from pilot_name_policy import (
    is_valid_pilot_name,
    trim_pilot_name,
)

CASES = json.loads(
    (ROOT / "shared" / "pilot_name_cases.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("case", CASES)
def test_shared_pilot_name_cases(case):
    name = case["name"]

    normalized = trim_pilot_name(name)

    assert is_valid_pilot_name(normalized) is case["valid"]

    if case["valid"]:
        assert normalized == case["normalized"]


def test_name_length_boundaries():
    assert is_valid_pilot_name("A" * 100)
    assert not is_valid_pilot_name("A" * 101)
