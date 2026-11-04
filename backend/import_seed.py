
import json
import sys
from datetime import datetime
from pathlib import Path

from main import (
    connection,
    init_db,
    utc_string,
    validate_times,
)


def main(path):
    data = json.loads(Path(path).read_text())

    init_db()

    with connection() as db:
        try:
            db.execute("BEGIN IMMEDIATE")

            for ship in data["ships"]:
                db.execute(
                    """
                    INSERT INTO ships(id, name)
                    VALUES (?, ?)
                    ON CONFLICT(id)
                    DO UPDATE SET name=excluded.name
                    """,
                    (
                        ship["id"],
                        ship["name"],
                    ),
                )

            for booking in data["bookings"]:
                start_dt = datetime.fromisoformat(
                    booking["startTime"]
                )
                end_dt = datetime.fromisoformat(
                    booking["endTime"]
                )

                # Historical seed bookings are allowed.
                # All other time rules still apply.
                validate_times(
                    start_dt,
                    end_dt,
                    check_past=False,
                )

                start = utc_string(start_dt)
                end = utc_string(end_dt)

                name = booking["pilotName"].strip()

                if not name or len(name) > 120:
                    raise ValueError(
                        "Seed booking has an invalid pilot name"
                    )

                exists = db.execute(
                    """
                    SELECT 1
                    FROM bookings
                    WHERE ship_id=?
                      AND pilot_name=?
                      AND start_time=?
                      AND end_time=?
                    """,
                    (
                        booking["shipId"],
                        name,
                        start,
                        end,
                    ),
                ).fetchone()

                if not exists:
                    db.execute(
                        """
                        INSERT INTO bookings(
                            ship_id,
                            pilot_name,
                            start_time,
                            end_time
                        )
                        VALUES (?, ?, ?, ?)
                        """,
                        (
                            booking["shipId"],
                            name,
                            start,
                            end,
                        ),
                    )

            db.commit()

        except Exception:
            db.rollback()
            raise

    print(
        f"Imported {len(data['ships'])} ships "
        f"and checked {len(data['bookings'])} bookings"
    )

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(
            "Usage: python import_seed.py <seed.json>"
        )

    main(sys.argv[1])
