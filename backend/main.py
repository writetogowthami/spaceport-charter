import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from booking_cancellation import migrate_booking_cancellation
from pilot_name_policy import (
    is_valid_pilot_name,
    trim_pilot_name,
    validate_pilot_name,
)
from refueling_policy import buffer_minutes, migrate_refueling_policy

CENTRAL = ZoneInfo("America/Chicago")
DB = Path(
    os.environ.get(
        "SPACEPORT_DB",
        Path(__file__).resolve().parent / "spaceport.db",
    )
)

app = FastAPI(title="Pacific Spaceport Charter API")

logger = logging.getLogger(__name__)


@app.exception_handler(sqlite3.OperationalError)
async def database_operational_error(request: Request, exc: sqlite3.OperationalError):
    """Translate known database availability failures without masking other SQL errors."""
    error_name = getattr(exc, "sqlite_errorname", "")
    message = str(exc).lower()
    unavailable_codes = {
        "SQLITE_BUSY",
        "SQLITE_LOCKED",
        "SQLITE_READONLY",
        "SQLITE_CANTOPEN",
        "SQLITE_IOERR",
        "SQLITE_FULL",
    }
    unavailable_messages = (
        "database is locked",
        "database table is locked",
        "database is busy",
        "readonly database",
        "read-only database",
        "unable to open database file",
        "disk i/o error",
        "database or disk is full",
    )
    if (
        error_name in unavailable_codes
        or any(error_name.startswith(code + "_") for code in unavailable_codes)
        or (
            not error_name
            and any(fragment in message for fragment in unavailable_messages)
        )
    ):
        logger.error(
            "Database temporarily unavailable on %s %s",
            request.method,
            request.url.path,
            exc_info=(type(exc), exc, exc.__traceback__),
        )
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Booking service is temporarily unavailable. Please try again."
            },
        )
    logger.error(
        "Unexpected SQLite operational error on %s %s",
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


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
        raise ValueError("Timestamps must include a UTC offset")

    if value.microsecond:
        raise ValueError("Timestamps must have whole-second precision")

    return value.astimezone(timezone.utc).isoformat(timespec="seconds")


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
        return "Past booking violation: Launch time must be in the future."

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

        db.create_function(
            "spaceport_valid_pilot_name",
            1,
            lambda value: int(is_valid_pilot_name(value)),
        )

        db.create_function(
            "spaceport_trim_pilot_name",
            1,
            lambda value: trim_pilot_name(value) if isinstance(value, str) else None,
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
            """
        )

        migrate_booking_cancellation(db)
        migrate_refueling_policy(db)


init_db()


class BookingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    shipId: int = Field(gt=0)
    pilotName: str
    startTime: datetime
    endTime: datetime

    @field_validator("pilotName")
    @classmethod
    def check_pilot_name(cls, value: str) -> str:
        return validate_pilot_name(value)


class BookingResponse(BaseModel):
    id: int
    shipId: int
    pilotName: str
    startTime: datetime
    endTime: datetime
    status: str
    cancelledAt: datetime | None = None


def serialize(row):
    return {
        "id": row["id"],
        "shipId": row["ship_id"],
        "pilotName": row["pilot_name"],
        "startTime": row["start_time"],
        "endTime": row["end_time"],
        "status": row["status"],
        "cancelledAt": row["cancelled_at"],
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
    ship = db.execute(
        "SELECT refuel_minutes FROM ships WHERE id = ?",
        (ship_id,),
    ).fetchone()

    if ship is None:
        raise HTTPException(404, "Spacecraft not found")

    buffer = timedelta(minutes=buffer_minutes(ship))

    start_utc = start.astimezone(timezone.utc)
    end_utc = end.astimezone(timezone.utc)

    rows = db.execute(
        """
        SELECT start_time, end_time
        FROM bookings
        WHERE ship_id = ?
          AND status = 'confirmed'
          AND start_time < ?
          AND end_time > ?
        ORDER BY start_time
        """,
        (
            ship_id,
            utc_string(end_utc + buffer),
            utc_string(start_utc - buffer),
        ),
    ).fetchall()

    matches = []

    for row in rows:
        existing_start = datetime.fromisoformat(row["start_time"]).astimezone(
            timezone.utc
        )

        existing_end = datetime.fromisoformat(row["end_time"]).astimezone(timezone.utc)

        if start_utc < existing_end and end_utc > existing_start:
            matches.append(("overlap", existing_start, existing_end))

        elif end_utc <= existing_start and end_utc > existing_start - buffer:
            matches.append(("buffer_before", existing_start, existing_end))

        elif start_utc >= existing_end and start_utc < existing_end + buffer:
            matches.append(("buffer_after", existing_start, existing_end))

    matches.sort(
        key=lambda item: (
            item[0] != "overlap",
            item[1],
        )
    )

    return matches[0] if matches else None


def conflict_message(conflict, ship_name, refuel_minutes):
    reason, start, end = conflict
    buffer = timedelta(minutes=refuel_minutes)

    date_label = start.astimezone(CENTRAL).strftime("%b %d, %Y")

    window = f"{start.astimezone(CENTRAL):%H:%M}–{end.astimezone(CENTRAL):%H:%M} CT"

    if reason == "overlap":
        return (
            f"Booking conflict: {ship_name} is already "
            f"reserved on {date_label} from {window}. "
            "Choose a launch window that does not "
            "overlap this reservation."
        )

    if reason == "buffer_before":
        latest_return = (start - buffer).astimezone(CENTRAL)

        return (
            f"Refueling buffer conflict: {ship_name} "
            f"requires {refuel_minutes} minutes of refueling before "
            f"its {date_label} reservation at {window}. "
            "Your mission must finish by "
            f"{latest_return:%H:%M} CT."
        )

    earliest_launch = (end + buffer).astimezone(CENTRAL)

    return (
        f"Refueling buffer conflict: {ship_name} "
        f"requires {refuel_minutes} minutes of refueling after "
        f"its {date_label} reservation at {window}. "
        "The next mission can start at "
        f"{earliest_launch:%H:%M} CT."
    )


@app.get("/api/ships")
def ships():
    with connection() as db:
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "refuelMinutes": row["refuel_minutes"],
            }
            for row in db.execute(
                """
                SELECT id, name, refuel_minutes
                FROM ships
                ORDER BY id
                """
            )
        ]


@app.get("/api/availability")
def availability(
    shipId: int = Query(gt=0, le=2147483647),
    day: date = Query(alias="date"),
):
    opening, closing = day_bounds(day)
    opening_utc = opening.astimezone(timezone.utc)
    closing_utc = closing.astimezone(timezone.utc)

    with connection() as db:
        ship = db.execute(
            """
            SELECT refuel_minutes
            FROM ships
            WHERE id = ?
            """,
            (shipId,),
        ).fetchone()

        if ship is None:
            raise HTTPException(
                404,
                f"Spacecraft not found: No spacecraft exists with ID {shipId}.",
            )

        minutes = buffer_minutes(ship)
        buffer = timedelta(minutes=minutes)

        # Fetch only reservations capable of blocking this day.
        rows = db.execute(
            """
            SELECT start_time, end_time
            FROM bookings
            WHERE ship_id = ?
              AND status = 'confirmed'
              AND start_time < ?
              AND end_time > ?
            ORDER BY start_time
            """,
            (
                shipId,
                utc_string(closing_utc + buffer),
                utc_string(opening_utc - buffer),
            ),
        ).fetchall()

    blocked = []

    for row in rows:
        mission_start = datetime.fromisoformat(row["start_time"]).astimezone(
            timezone.utc
        )

        mission_end = datetime.fromisoformat(row["end_time"]).astimezone(timezone.utc)

        start = max(opening_utc, mission_start - buffer)
        end = min(closing_utc, mission_end + buffer)

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
        "refuelMinutes": minutes,
        "opensAt": opening.isoformat(),
        "closesAt": closing.isoformat(),
        "unavailable": [
            {
                "startTime": start.astimezone(CENTRAL).isoformat(),
                "endTime": end.astimezone(CENTRAL).isoformat(),
            }
            for start, end in blocked
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
        404: {"description": "Spacecraft does not exist"},
        409: {
            "description": (
                "Overlapping mission or spacecraft-specific refueling buffer violation"
            )
        },
        422: {
            "description": (
                "Invalid booking details, past launch, duration, or operating hours"
            )
        },
        503: {"description": "Database temporarily unavailable"},
    },
)
def create_booking(payload: BookingRequest):
    name = payload.pilotName

    if not name:
        raise HTTPException(
            422,
            "Pilot name validation error: Pilot name is required.",
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
                    """
                    SELECT name, refuel_minutes
                    FROM ships
                    WHERE id = ?
                    """,
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
                            buffer_minutes(ship),
                        ),
                    )

                # Lock contention may have delayed the request past launch time.
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
                "Booking service is temporarily busy. Please try again.",
            ) from exc

        raise


@app.post(
    "/api/bookings/{booking_id}/cancel",
    response_model=BookingResponse,
    responses={
        404: {"description": "Booking not found"},
        409: {"description": ("Booking already cancelled or mission has started")},
        503: {"description": "Database temporarily unavailable"},
    },
)
def cancel_booking(booking_id: int):
    if booking_id <= 0:
        raise HTTPException(422, "Invalid booking ID")

    try:
        with connection() as db:
            try:
                db.execute("BEGIN IMMEDIATE")

                row = db.execute(
                    "SELECT * FROM bookings WHERE id = ?",
                    (booking_id,),
                ).fetchone()

                if row is None:
                    raise HTTPException(
                        404,
                        f"Reservation #{booking_id} was not found.",
                    )

                if row["status"] == "cancelled":
                    raise HTTPException(
                        409,
                        f"Reservation #{booking_id} is already cancelled.",
                    )

                now = datetime.now(timezone.utc)
                launch = datetime.fromisoformat(row["start_time"]).astimezone(
                    timezone.utc
                )

                if launch <= now:
                    raise HTTPException(
                        409,
                        "This mission has already started and cannot be cancelled.",
                    )

                cancelled_at = utc_string(now.replace(microsecond=0))

                db.execute(
                    """
                    UPDATE bookings
                    SET status = 'cancelled',
                        cancelled_at = ?
                    WHERE id = ?
                      AND status = 'confirmed'
                    """,
                    (cancelled_at, booking_id),
                )

                updated = db.execute(
                    "SELECT * FROM bookings WHERE id = ?",
                    (booking_id,),
                ).fetchone()

                db.commit()
                return serialize(updated)

            except Exception:
                db.rollback()
                raise

    except sqlite3.OperationalError as exc:
        if "locked" in str(exc).lower() or "busy" in str(exc).lower():
            raise HTTPException(
                503,
                "Booking service is temporarily busy. Please try again.",
            ) from exc
        raise
