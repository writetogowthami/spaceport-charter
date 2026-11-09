"""Exercise the real importer CLI against disposable SQLite databases."""

import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def seed_importer(tmp_path):
    database = tmp_path / "seed-test.db"
    source = tmp_path / "seed.json"

    def run(bookings, ships=None):
        source.write_text(
            json.dumps(
                {
                    "ships": ships or [{"id": 1, "name": "Test Ship"}],
                    "bookings": bookings,
                }
            ),
            encoding="utf-8",
        )
        return subprocess.run(
            [sys.executable, str(ROOT / "backend" / "import_seed.py"), str(source)],
            env={**os.environ, "SPACEPORT_DB": str(database)},
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )

    return run, database


def booking(pilot="Alex Nova", start="09:00:00", end="10:00:00", ship=1):
    return {
        "shipId": ship,
        "pilotName": pilot,
        "startTime": f"2000-01-15T{start}-06:00",
        "endTime": f"2000-01-15T{end}-06:00",
    }


def test_historical_import_is_normalized_and_idempotent(seed_importer):
    run, database = seed_importer
    records = [booking("\u0085\ufeffJosé Álvarez\ufeff\u0085")]
    for _ in range(2):
        result = run(records)
        assert result.returncode == 0, result.stderr

    with sqlite3.connect(database) as db:
        rows = db.execute(
            "SELECT pilot_name, start_time, end_time, status FROM bookings"
        ).fetchall()
    assert rows == [
        (
            "José Álvarez",
            "2000-01-15T15:00:00+00:00",
            "2000-01-15T16:00:00+00:00",
            "confirmed",
        )
    ]


def test_normalized_names_are_deduplicated(seed_importer):
    run, database = seed_importer
    result = run(
        [
            booking(" Alex Nova "),
            booking("\u0085Alex Nova\ufeff"),
        ]
    )
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        rows = db.execute("SELECT pilot_name FROM bookings").fetchall()
    assert rows == [("Alex Nova",)]


@pytest.mark.parametrize("pilot", ["A", "Alex123", "A" * 101, "\U00011380lex"])
def test_invalid_pilot_rolls_back_entire_import(seed_importer, pilot):
    run, database = seed_importer
    result = run([booking(), booking(pilot, "11:00:00", "12:00:00")])
    assert result.returncode != 0
    assert "Seed booking #2: Pilot name" in result.stderr
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT COUNT(*) FROM ships").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM bookings").fetchone()[0] == 0


def test_import_accepts_maximum_length_name(seed_importer):
    run, _ = seed_importer
    result = run([booking("A" * 100)])
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    "second, message",
    [
        (booking("Other Pilot", "10:29:00", "11:00:00"), "refueling buffer"),
        (booking("Other Pilot", "11:00:00", "10:00:00"), "return time"),
        (booking("Other Pilot", "05:30:00", "06:00:00"), "Operating hours"),
        (booking("Other Pilot", "11:00:00", "12:00:00", ship=2), "FOREIGN KEY"),
    ],
)
def test_invalid_booking_rolls_back_import(seed_importer, second, message):
    run, database = seed_importer
    result = run([booking(), second])
    assert result.returncode != 0
    assert message in result.stderr
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT COUNT(*) FROM bookings").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM ships").fetchone()[0] == 0


def test_reimport_preserves_policy_and_cancelled_history(seed_importer):
    run, database = seed_importer
    result = run([booking()])
    assert result.returncode == 0, result.stderr
    cancelled_at = "2000-01-01T00:00:00+00:00"
    with sqlite3.connect(database) as db:
        db.execute("UPDATE ships SET refuel_minutes = 60 WHERE id = 1")
        db.execute(
            "UPDATE bookings SET status = 'cancelled', cancelled_at = ?",
            (cancelled_at,),
        )
        before = db.execute("SELECT * FROM bookings").fetchall()

    result = run([booking()], ships=[{"id": 1, "name": "Renamed Ship"}])
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT * FROM bookings").fetchall() == before
        assert db.execute("SELECT name, refuel_minutes FROM ships").fetchall() == [
            ("Renamed Ship", 60),
        ]


def test_import_uses_existing_spacecraft_refueling_policy(seed_importer):
    run, database = seed_importer
    result = run([booking()])
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        db.execute("UPDATE ships SET refuel_minutes = 60 WHERE id = 1")

    result = run([booking("Other Pilot", "10:30:00", "11:00:00")])
    assert result.returncode != 0
    assert "refueling buffer" in result.stderr
    with sqlite3.connect(database) as db:
        assert db.execute("SELECT COUNT(*) FROM bookings").fetchone()[0] == 1


def test_import_preserves_pilot_capitalization(seed_importer):
    run, database = seed_importer

    result = run(
        [
            booking("de la Cruz"),
        ]
    )

    assert result.returncode == 0, result.stderr

    with sqlite3.connect(database) as db:
        name = db.execute("SELECT pilot_name FROM bookings").fetchone()[0]

    assert name == "de la Cruz"
