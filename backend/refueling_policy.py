"""Database-enforced spacecraft refueling policy."""

MIN_REFUEL_MINUTES = 30
MAX_REFUEL_MINUTES = 240


def buffer_minutes(ship):
    """Read a validated spacecraft policy."""
    minutes = int(ship["refuel_minutes"])

    if not MIN_REFUEL_MINUTES <= minutes <= MAX_REFUEL_MINUTES:
        raise ValueError("Invalid spacecraft refueling policy")

    return minutes


def migrate_refueling_policy(db):
    """Upgrade existing databases without deleting bookings.

    Caller must use a connection with foreign keys enabled
    and the spaceport validation functions registered.
    """
    db.execute("BEGIN IMMEDIATE")

    try:
        columns = {row["name"] for row in db.execute("PRAGMA table_info(ships)")}

        if "refuel_minutes" not in columns:
            db.execute(
                """
                ALTER TABLE ships
                ADD COLUMN refuel_minutes INTEGER NOT NULL
                DEFAULT 30
                CHECK (
                    typeof(refuel_minutes) = 'integer'
                    AND refuel_minutes BETWEEN 30 AND 240
                )
                """
            )

        # Canonical UTC timestamps sort chronologically.
        # The partial index contains confirmed bookings only.
        db.execute(
            """
            CREATE INDEX IF NOT EXISTS
                bookings_active_ship_time
            ON bookings(ship_id, start_time, end_time)
            WHERE status = 'confirmed'
            """
        )

        db.execute("DROP TRIGGER IF EXISTS bookings_guard_insert")
        db.execute("DROP TRIGGER IF EXISTS bookings_guard_update")

        for action, event, self_exclusion in (
            ("insert", "INSERT", ""),
            (
                "update",
                "UPDATE OF ship_id, pilot_name, start_time, end_time",
                "AND b.id != OLD.id",
            ),
        ):
            db.execute(
                f"""
                CREATE TRIGGER bookings_guard_{action}
                BEFORE {event} ON bookings
                BEGIN
                    SELECT RAISE(
                        ABORT,
                        'Invalid pilot name'
                    )
                    WHERE
                        spaceport_valid_pilot_name(
                            NEW.pilot_name
                        ) != 1
                        OR NEW.pilot_name IS NOT
                            spaceport_trim_pilot_name(NEW.pilot_name);

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
                          AND b.status = 'confirmed'
                          {self_exclusion}

                          -- Bound the indexed start-time range.
                          -- A mission is at most 16 hours,
                          -- plus at most 4 hours of refueling.
                          -- One day is a conservative bound.
                          AND b.start_time >= strftime(
                              '%Y-%m-%dT%H:%M:%S+00:00',
                              NEW.start_time,
                              '-1 day'
                          )

                          AND b.start_time < strftime(
                              '%Y-%m-%dT%H:%M:%S+00:00',
                              NEW.end_time,
                              '+' || (
                                  SELECT refuel_minutes
                                  FROM ships
                                  WHERE id = NEW.ship_id
                              ) || ' minutes'
                          )

                          AND b.end_time > strftime(
                              '%Y-%m-%dT%H:%M:%S+00:00',
                              NEW.start_time,
                              '-' || (
                                  SELECT refuel_minutes
                                  FROM ships
                                  WHERE id = NEW.ship_id
                              ) || ' minutes'
                          )
                    );
                END
                """
            )

        db.execute("DROP TRIGGER IF EXISTS ships_guard_refuel_update")

        db.execute(
            """
            CREATE TRIGGER ships_guard_refuel_update
            BEFORE UPDATE OF refuel_minutes ON ships
            WHEN NEW.refuel_minutes IS NOT OLD.refuel_minutes
            BEGIN
                SELECT RAISE(
                    ABORT,
                    'Refueling policy must be an integer from 30 to 240'
                )
                WHERE
                    typeof(NEW.refuel_minutes) != 'integer'
                    OR NEW.refuel_minutes NOT BETWEEN 30 AND 240;

                -- Only adjacent confirmed bookings can violate
                -- the required gap in a valid schedule.
                SELECT RAISE(
                    ABORT,
                    'Refueling policy conflicts with existing bookings'
                )
                WHERE EXISTS (
                    SELECT 1
                    FROM (
                        SELECT
                            end_time,
                            LEAD(start_time) OVER (
                                ORDER BY start_time, id
                            ) AS next_start_time
                        FROM bookings
                        WHERE ship_id = NEW.id
                          AND status = 'confirmed'
                    ) consecutive
                    WHERE next_start_time IS NOT NULL
                      AND unixepoch(next_start_time)
                          < unixepoch(end_time)
                            + NEW.refuel_minutes * 60
                );
            END
            """
        )

        db.commit()

    except Exception:
        db.rollback()
        raise
