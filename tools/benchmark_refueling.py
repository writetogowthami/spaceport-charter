#!/usr/bin/env python3
"""Benchmark refueling policy updates using disposable SQLite databases.

Run from the project root:
    python tools/benchmark_refueling.py

No production database is modified.
"""

import argparse
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"

BOOKING_COUNTS = (600, 1200, 2400)
SHIP_ID = 9999


def utc_text(value):
    """Format UTC exactly as the application stores timestamps."""
    return value.strftime("%Y-%m-%dT%H:%M:%S+00:00")


def make_bookings(count):
    """Create valid bookings with one deliberately narrow 75-minute gap.

    A 60-minute refueling policy is allowed.
    A 90-minute policy must be rejected.
    """
    first_start = datetime(2030, 1, 15, 15, 0, tzinfo=timezone.utc)

    # A 75-minute gap accepts a 60-minute policy but rejects a 90-minute policy.
    starts = [
        first_start,
        first_start + timedelta(hours=2, minutes=15),
    ]

    for index in range(2, count):
        starts.append(first_start + timedelta(days=index))

    for start in starts:
        end = start + timedelta(hours=1)
        yield (
            SHIP_ID,
            "Alex Nova",
            utc_text(start),
            utc_text(end),
        )


def worker(count, database):
    """Run one benchmark in an isolated process and database."""
    # Importing main initializes the selected database.
    os.environ["SPACEPORT_DB"] = str(database)
    sys.path.insert(0, str(BACKEND))

    from main import connection

    with connection() as db:
        db.execute(
            """
            INSERT INTO ships (id, name, refuel_minutes)
            VALUES (?, ?, 30)
            """,
            (SHIP_ID, "Benchmark Ship"),
        )
        db.commit()

        started = time.perf_counter()

        for record in make_bookings(count):
            db.execute(
                """
                INSERT INTO bookings (
                    ship_id,
                    pilot_name,
                    start_time,
                    end_time
                )
                VALUES (?, ?, ?, ?)
                """,
                record,
            )

        db.commit()
        insert_seconds = time.perf_counter() - started

        actual_count = db.execute(
            """
            SELECT COUNT(*)
            FROM bookings
            WHERE ship_id = ?
              AND status = 'confirmed'
            """,
            (SHIP_ID,),
        ).fetchone()[0]

        assert actual_count == count, (
            f"Expected {count} confirmed bookings, found {actual_count}"
        )

        started = time.perf_counter()

        db.execute(
            """
            UPDATE ships
            SET refuel_minutes = 60
            WHERE id = ?
            """,
            (SHIP_ID,),
        )
        db.commit()

        valid_seconds = time.perf_counter() - started

        policy = db.execute(
            "SELECT refuel_minutes FROM ships WHERE id = ?",
            (SHIP_ID,),
        ).fetchone()[0]

        assert policy == 60, "Valid refueling-policy update was not saved"

        rejected = False
        started = time.perf_counter()

        try:
            db.execute(
                """
                UPDATE ships
                SET refuel_minutes = 90
                WHERE id = ?
                """,
                (SHIP_ID,),
            )
            db.commit()
        except sqlite3.IntegrityError:
            rejected = True
            db.rollback()

        invalid_seconds = time.perf_counter() - started

        assert rejected, "ERROR: A conflicting 90-minute policy was accepted"

        policy_after = db.execute(
            "SELECT refuel_minutes FROM ships WHERE id = ?",
            (SHIP_ID,),
        ).fetchone()[0]

        assert policy_after == 60, "ERROR: Rejected update changed the stored policy"

    return {
        "bookings": count,
        "insert_seconds": insert_seconds,
        "valid_update_seconds": valid_seconds,
        "invalid_update_seconds": invalid_seconds,
        "invalid_rejected": rejected,
        "policy_after_rejection": policy_after,
    }


def run_parent():
    print("Refueling policy benchmark")
    print("All databases are temporary.", flush=True)
    print()

    results = []

    for count in BOOKING_COUNTS:
        print(f"Running {count:,} bookings...", flush=True)

        with tempfile.TemporaryDirectory(prefix="spaceport-refuel-") as temp:
            database = Path(temp) / "benchmark.db"

            completed = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).resolve()),
                    "--worker",
                    str(count),
                    str(database),
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=240,
            )

            if completed.returncode != 0:
                print(completed.stdout)
                print(completed.stderr, file=sys.stderr)
                raise RuntimeError(f"Benchmark failed at {count} bookings")

            result = json.loads(completed.stdout.strip())
            results.append(result)

            print(f"  Insert: {result['insert_seconds']:.4f} s")
            print(f"  Valid update: {result['valid_update_seconds']:.6f} s")
            print(f"  Invalid update rejected: {result['invalid_rejected']}")
            print(f"  Invalid update time: {result['invalid_update_seconds']:.6f} s")
            print(f"  Policy after rejection: {result['policy_after_rejection']} min")
            print()

    print("SUMMARY")
    print("Bookings | Insert (s) | Valid update (s) | Rejected update (s)")
    print("-" * 66)

    for result in results:
        print(
            f"{result['bookings']:8} | "
            f"{result['insert_seconds']:10.4f} | "
            f"{result['valid_update_seconds']:16.6f} | "
            f"{result['invalid_update_seconds']:19.6f}"
        )

    print()
    print("PASS: All refueling policy checks succeeded; temporary databases removed.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--worker",
        type=int,
        choices=BOOKING_COUNTS,
    )
    parser.add_argument(
        "database",
        nargs="?",
        type=Path,
    )
    args = parser.parse_args()

    if args.worker is not None:
        if args.database is None:
            parser.error("Worker requires a database path")

        result = worker(args.worker, args.database)
        print(json.dumps(result))
    else:
        run_parent()


if __name__ == "__main__":
    main()
