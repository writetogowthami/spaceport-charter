"""Soft-cancellation schema and database integrity rules."""


def migrate_booking_cancellation(db):
    db.execute("BEGIN IMMEDIATE")
    try:
        columns = {row["name"] for row in db.execute("PRAGMA table_info(bookings)")}

        if "status" not in columns:
            db.execute(
                """
                ALTER TABLE bookings
                ADD COLUMN status TEXT NOT NULL
                DEFAULT 'confirmed'
                CHECK (status IN ('confirmed', 'cancelled'))
                """
            )

        if "cancelled_at" not in columns:
            db.execute(
                """
                ALTER TABLE bookings
                ADD COLUMN cancelled_at TEXT
                """
            )

        db.execute("DROP TRIGGER IF EXISTS bookings_guard_status_insert")
        db.execute(
            """
            CREATE TRIGGER bookings_guard_status_insert
            BEFORE INSERT ON bookings
            WHEN NEW.status != 'confirmed'
                 OR NEW.cancelled_at IS NOT NULL
            BEGIN
                SELECT RAISE(
                    ABORT,
                    'New bookings must be confirmed'
                );
            END
            """
        )

        db.execute("DROP TRIGGER IF EXISTS bookings_guard_status_update")

        db.execute(
            """
            CREATE TRIGGER bookings_guard_status_update
            BEFORE UPDATE ON bookings
            WHEN
                NEW.ship_id IS NOT OLD.ship_id
                OR NEW.pilot_name IS NOT OLD.pilot_name
                OR NEW.start_time IS NOT OLD.start_time
                OR NEW.end_time IS NOT OLD.end_time
                OR (
                    OLD.status = 'cancelled'
                    AND (
                        NEW.status IS NOT OLD.status
                        OR NEW.cancelled_at IS NOT OLD.cancelled_at
                    )
                )
                OR (
                    OLD.status = 'confirmed'
                    AND (
                        NEW.status NOT IN ('confirmed', 'cancelled')
                        OR (
                            NEW.status = 'confirmed'
                            AND NEW.cancelled_at IS NOT NULL
                        )
                        OR (
                            NEW.status = 'cancelled'
                            AND (
                                NEW.cancelled_at IS NULL
                                OR NEW.cancelled_at IS NOT
                                    strftime(
                                        '%Y-%m-%dT%H:%M:%S+00:00',
                                        NEW.cancelled_at
                                    )
                                OR unixepoch(NEW.cancelled_at) IS NULL
                                OR unixepoch(NEW.cancelled_at)
                                    >= unixepoch(OLD.start_time)
                            )
                        )
                    )
                )
            BEGIN
                SELECT RAISE(
                    ABORT,
                    'Invalid booking status transition'
                );
            END
            """
        )

        db.commit()
    except Exception:
        db.rollback()
        raise
