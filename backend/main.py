
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict


CENTRAL = ZoneInfo("America/Chicago")
DB = Path(
    os.environ.get(
        "SPACEPORT_DB",
        Path(__file__).resolve().parent / "spaceport.db",
    )
)
BUFFER = timedelta(minutes=30)

app = FastAPI(title="Pacific Spaceport Charter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


def utc_string(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(
            "Timestamps must include a UTC offset"
        )

    if value.microsecond:
        raise ValueError(
            "Timestamps must have whole-second precision"
        )

    return value.astimezone(timezone.utc).isoformat(
        timespec="seconds"
    )


def day_bounds(day: date):
    return (
        datetime.combine(day, time(6), CENTRAL),
        datetime.combine(day, time(22), CENTRAL),
    )


def time_error(start, end, check_past=False):
    if (
        start.tzinfo is None
        or end.tzinfo is None
        or start.utcoffset() is None
        or end.utcoffset() is None
    ):
        return (
            "Timezone validation error: Start and end "
            "timestamps must include a UTC offset."
        )

    if start.microsecond or end.microsecond:
        return (
            "Timestamp precision error: Use whole-second "
            "timestamps (no fractional seconds)."
        )

    start_utc = start.astimezone(timezone.utc)
    end_utc = end.astimezone(timezone.utc)

    if start_utc >= end_utc:
        return (
            "Invalid mission duration: The return time "
            "must be later than the launch time."
        )

    start_local = start.astimezone(CENTRAL)
    end_local = end.astimezone(CENTRAL)

    opening, closing = day_bounds(start_local.date())

    if (
        start_local.date() != end_local.date()
        or start_utc < opening.astimezone(timezone.utc)
        or end_utc > closing.astimezone(timezone.utc)
    ):
        return (
            "Operating hours violation: Missions must "
            "start and finish between 06:00 and 22:00 "
            "America/Chicago on the same calendar date."
        )

    if check_past and start_utc <= datetime.now(timezone.utc):
        return (
            "Past booking violation: Launch time "
            "must be in the future."
        )

    return None


def sqlite_valid_times(start_text, end_text):
    try:
        start = datetime.fromisoformat(start_text)
        end = datetime.fromisoformat(end_text)

        return int(
            time_error(start, end) is None
            and utc_string(start) == start_text
            and utc_string(end) == end_text
        )
    except (TypeError, ValueError, OverflowError):
        return 0


@contextmanager
def connection():
    db = sqlite3.connect(
        DB,
        timeout=15,
        isolation_level=None,
    )

    try:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=15000")
        db.execute("PRAGMA foreign_keys=ON")

        # Required by the database validation triggers.
        db.create_function(
            "spaceport_valid_times",
            2,
            sqlite_valid_times,
        )

        yield db

    finally:
        db.close()


def init_db():
    with connection() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS ships (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ship_id INTEGER NOT NULL
                    REFERENCES ships(id),
                pilot_name TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS bookings_ship_time
            ON bookings(ship_id, start_time);

            CREATE TRIGGER IF NOT EXISTS bookings_guard_insert
            BEFORE INSERT ON bookings
            BEGIN
                SELECT RAISE(
                    ABORT,
                    'Pilot name is required'
                )
                WHERE
                    NEW.pilot_name IS NULL
                    OR length(trim(NEW.pilot_name)) = 0
                    OR length(NEW.pilot_name) > 120;

                SELECT RAISE(
                    ABORT,
                    'Invalid mission times or operating hours'
                )
                WHERE spaceport_valid_times(
                    NEW.start_time,
                    NEW.end_time
                ) != 1;

                SELECT RAISE(
                    ABORT,
                    'Booking overlaps an existing mission or refueling buffer'
                )
                WHERE EXISTS (
                    SELECT 1
                    FROM bookings b
                    WHERE b.ship_id = NEW.ship_id
                      AND unixepoch(b.start_time)
                          < unixepoch(NEW.end_time) + 1800
                      AND unixepoch(b.end_time)
                          > unixepoch(NEW.start_time) - 1800
                );
            END;

            CREATE TRIGGER IF NOT EXISTS bookings_guard_update
            BEFORE UPDATE OF
                ship_id,
                pilot_name,
                start_time,
                end_time
            ON bookings
            BEGIN
                SELECT RAISE(
                    ABORT,
                    'Pilot name is required'
                )
                WHERE
                    NEW.pilot_name IS NULL
                    OR length(trim(NEW.pilot_name)) = 0
                    OR length(NEW.pilot_name) > 120;

                SELECT RAISE(
                    ABORT,
                    'Invalid mission times or operating hours'
                )
                WHERE spaceport_valid_times(
                    NEW.start_time,
                    NEW.end_time
                ) != 1;

                SELECT RAISE(
                    ABORT,
                    'Booking overlaps an existing mission or refueling buffer'
                )
                WHERE EXISTS (
                    SELECT 1
                    FROM bookings b
                    WHERE b.ship_id = NEW.ship_id
                      AND b.id != OLD.id
                      AND unixepoch(b.start_time)
                          < unixepoch(NEW.end_time) + 1800
                      AND unixepoch(b.end_time)
                          > unixepoch(NEW.start_time) - 1800
                );
            END;
            """
        )


init_db()


class BookingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    shipId: int = Field(gt=0)
    pilotName: str = Field(min_length=1, max_length=120)
    startTime: datetime
    endTime: datetime


class BookingResponse(BaseModel):
    id: int
    shipId: int
    pilotName: str
    startTime: datetime
    endTime: datetime


def serialize(row):
    return {
        "id": row["id"],
        "shipId": row["ship_id"],
        "pilotName": row["pilot_name"],
        "startTime": row["start_time"],
        "endTime": row["end_time"],
    }


def validate_times(start, end, check_past=True):
    error = time_error(
        start,
        end,
        check_past=check_past,
    )

    if error:
        raise HTTPException(
            status_code=422,
            detail=error,
        )


def find_booking_conflict(db, ship_id, start, end):
    rows = db.execute(
        """
        SELECT start_time, end_time
        FROM bookings
        WHERE ship_id = ?
        ORDER BY start_time
        """,
        (ship_id,),
    ).fetchall()

    start = start.astimezone(timezone.utc)
    end = end.astimezone(timezone.utc)

    matches = []

    for row in rows:
        existing_start = datetime.fromisoformat(
            row["start_time"]
        ).astimezone(timezone.utc)

        existing_end = datetime.fromisoformat(
            row["end_time"]
        ).astimezone(timezone.utc)

        if (
            start < existing_end
            and end > existing_start
        ):
            matches.append(
                (
                    "overlap",
                    existing_start,
                    existing_end,
                )
            )

        elif (
            end <= existing_start
            and end > existing_start - BUFFER
        ):
            matches.append(
                (
                    "buffer_before",
                    existing_start,
                    existing_end,
                )
            )

        elif (
            start >= existing_end
            and start < existing_end + BUFFER
        ):
            matches.append(
                (
                    "buffer_after",
                    existing_start,
                    existing_end,
                )
            )

    # Prefer actual overlaps over buffer-only conflicts.
    matches.sort(
        key=lambda item: (
            item[0] != "overlap",
            item[1],
        )
    )

    return matches[0] if matches else None


def conflict_message(conflict, ship_name):
    reason, start, end = conflict

    date_label = start.astimezone(CENTRAL).strftime(
        "%b %d, %Y"
    )

    window = (
        f"{start.astimezone(CENTRAL):%H:%M}–"
        f"{end.astimezone(CENTRAL):%H:%M} CT"
    )

    if reason == "overlap":
        return (
            f"Booking conflict: {ship_name} is already "
            f"reserved on {date_label} from {window}. "
            "Choose a launch window that does not "
            "overlap this reservation."
        )

    if reason == "buffer_before":
        latest_return = (
            start - BUFFER
        ).astimezone(CENTRAL)

        return (
            f"Refueling buffer conflict: {ship_name} "
            "requires 30 minutes of refueling before "
            f"its {date_label} reservation at {window}. "
            "Your mission must finish by "
            f"{latest_return:%H:%M} CT."
        )

    earliest_launch = (
        end + BUFFER
    ).astimezone(CENTRAL)

    return (
        f"Refueling buffer conflict: {ship_name} "
        "requires 30 minutes of refueling after "
        f"its {date_label} reservation at {window}. "
        "The next mission can start at "
        f"{earliest_launch:%H:%M} CT."
    )


@app.get("/api/ships")
def ships():
    with connection() as db:
        return [
            dict(row)
            for row in db.execute(
                "SELECT id, name FROM ships ORDER BY id"
            )
        ]


@app.get("/api/availability")
def availability(
    shipId: int = Query(gt=0),
    day: date = Query(alias="date"),
):
    opening, closing = day_bounds(day)

    with connection() as db:
        exists = db.execute(
            "SELECT 1 FROM ships WHERE id=?",
            (shipId,),
        ).fetchone()

        if not exists:
            raise HTTPException(
                404,
                "Spacecraft not found: "
                f"No spacecraft exists with ID {shipId}.",
            )

        rows = db.execute(
            """
            SELECT start_time, end_time
            FROM bookings
            WHERE ship_id=?
            ORDER BY start_time
            """,
            (shipId,),
        ).fetchall()

    blocked = []

    for row in rows:
        start = max(
            opening.astimezone(timezone.utc),
            datetime.fromisoformat(
                row["start_time"]
            ).astimezone(timezone.utc) - BUFFER,
        )

        end = min(
            closing.astimezone(timezone.utc),
            datetime.fromisoformat(
                row["end_time"]
            ).astimezone(timezone.utc) + BUFFER,
        )

        if start >= end:
            continue

        if blocked and start <= blocked[-1][1]:
            blocked[-1] = (
                blocked[-1][0],
                max(end, blocked[-1][1]),
            )
        else:
            blocked.append((start, end))

    return {
        "shipId": shipId,
        "date": day.isoformat(),
        "opensAt": opening.isoformat(),
        "closesAt": closing.isoformat(),
        "unavailable": [
            {
                "startTime": a.astimezone(
                    CENTRAL
                ).isoformat(),
                "endTime": b.astimezone(
                    CENTRAL
                ).isoformat(),
            }
            for a, b in blocked
        ],
    }


@app.get(
    "/api/bookings",
    response_model=list[BookingResponse],
)
def bookings():
    with connection() as db:
        return [
            serialize(row)
            for row in db.execute(
                """
                SELECT *
                FROM bookings
                ORDER BY ship_id, start_time
                """
            )
        ]


@app.post(
    "/api/bookings",
    status_code=201,
    response_model=BookingResponse,
    responses={
        404: {
            "description": "Spacecraft does not exist"
        },
        409: {
            "description": (
                "Overlapping mission or 30-minute "
                "refueling buffer violation"
            )
        },
        422: {
            "description": (
                "Invalid booking details, past launch, "
                "duration, or operating hours"
            )
        },
        503: {
            "description": "Database temporarily unavailable"
        },
    },
)
def create_booking(payload: BookingRequest):
    name = payload.pilotName.strip()

    if not name:
        raise HTTPException(
            422,
            "Pilot name validation error: "
            "Pilot name is required.",
        )

    validate_times(
        payload.startTime,
        payload.endTime,
    )

    try:
        with connection() as db:
            try:
                # Prevent simultaneous conflicting writes.
                db.execute("BEGIN IMMEDIATE")

                ship = db.execute(
                    "SELECT name FROM ships WHERE id=?",
                    (payload.shipId,),
                ).fetchone()

                if not ship:
                    raise HTTPException(
                        404,
                        "Spacecraft not found: "
                        f"No spacecraft exists with ID "
                        f"{payload.shipId}.",
                    )

                conflict = find_booking_conflict(
                    db,
                    payload.shipId,
                    payload.startTime,
                    payload.endTime,
                )

                if conflict:
                    raise HTTPException(
                        409,
                        conflict_message(
                            conflict,
                            ship["name"],
                        ),
                    )

                # Recheck after obtaining the write lock.
                validate_times(
                    payload.startTime,
                    payload.endTime,
                )

                cursor = db.execute(
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
                        payload.shipId,
                        name,
                        utc_string(payload.startTime),
                        utc_string(payload.endTime),
                    ),
                )

                row = db.execute(
                    "SELECT * FROM bookings WHERE id=?",
                    (cursor.lastrowid,),
                ).fetchone()

                db.commit()
                return serialize(row)

            except Exception:
                db.rollback()
                raise

    except sqlite3.OperationalError as exc:
        message = str(exc).lower()

        if "locked" in message or "busy" in message:
            raise HTTPException(
                503,
                "Booking service is temporarily busy. "
                "Please try again.",
            ) from exc

        raise
