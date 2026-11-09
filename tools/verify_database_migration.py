#!/usr/bin/env python3
"""Verify migrations on a temporary SQLite backup, never the source."""

import argparse
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def snapshot(db):
    """Capture existing column values for both application tables."""
    result = {}

    for table in ("ships", "bookings"):
        columns = [row[1] for row in db.execute(f"PRAGMA table_info({table})")]
        rows = db.execute(f"SELECT * FROM {table} ORDER BY id").fetchall()

        result[table] = {
            "columns": columns,
            "rows": rows,
        }

    return result


def verify_preserved(db, original):
    for table, data in original.items():
        columns = data["columns"]
        quoted = ", ".join(f'"{column}"' for column in columns)

        current = db.execute(f"SELECT {quoted} FROM {table} ORDER BY id").fetchall()

        if current != data["rows"]:
            raise AssertionError(f"{table}: original records changed during migration")


def verify_schema(db):
    columns = {
        table: {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
        for table in ("ships", "bookings")
    }

    assert "refuel_minutes" in columns["ships"]
    assert {"status", "cancelled_at"} <= columns["bookings"]

    triggers = dict(
        db.execute("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'")
    )

    for name in ("bookings_guard_insert", "bookings_guard_update"):
        assert name in triggers, f"Missing trigger: {name}"
        assert "spaceport_trim_pilot_name" in triggers[name], (
            f"Outdated trigger: {name}"
        )

    assert "ships_guard_refuel_update" in triggers

    indexes = {
        row[0]
        for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'index'")
    }

    assert "bookings_active_ship_time" in indexes

    integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
    assert integrity == "ok", f"Integrity check failed: {integrity}"

    foreign_keys = db.execute("PRAGMA foreign_key_check").fetchall()
    assert not foreign_keys, f"Foreign key violations: {foreign_keys}"

    return len(triggers)


def migrate(db_path):
    """Initialize the copied database in a separate Python process."""
    code = "import sys; sys.path.insert(0, sys.argv[1]); import main"
    env = os.environ.copy()
    env["SPACEPORT_DB"] = str(db_path)

    subprocess.run(
        [sys.executable, "-c", code, str(BACKEND)],
        cwd=ROOT,
        env=env,
        check=True,
        timeout=120,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        required=True,
        help="Original SQLite database path (read-only)",
    )
    args = parser.parse_args()

    source = Path(args.source).resolve()

    if not source.is_file():
        raise SystemExit(f"Database not found: {source}")

    with tempfile.TemporaryDirectory(prefix="spaceport-migration-") as temp:
        target = Path(temp) / "migration-test.db"

        # Create one consistent disposable SQLite backup.
        with sqlite3.connect(
            f"{source.as_uri()}?mode=ro",
            uri=True,
        ) as source_db:
            with sqlite3.connect(target) as copied_db:
                source_db.backup(copied_db)

        # Compare migrations against the exact database copy
        # that will be migrated, not a separate source read
        with sqlite3.connect(target) as copied_db:
            original = snapshot(copied_db)

        for run_number in (1, 2):
            migrate(target)

            with sqlite3.connect(target) as db:
                verify_preserved(db, original)
                trigger_count = verify_schema(db)

                counts = {table: len(data["rows"]) for table, data in original.items()}

                print(f"Migration run {run_number}: PASS")
                print(f"  Original rows preserved: {counts}")
                print(f"  Installed triggers: {trigger_count}")

    print("\nPASS: Original database was not written to; temporary copy removed.")


if __name__ == "__main__":
    main()
