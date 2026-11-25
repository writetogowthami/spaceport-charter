import os
import sqlite3
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[1] / "backend"),
)

# Isolate test resets from development data and concurrent test processes.
_test_db_directory = tempfile.TemporaryDirectory(prefix="spaceport_tests_")

# Select the database before importing main, which initializes its schema.
os.environ["SPACEPORT_DB"] = str(Path(_test_db_directory.name) / "spaceport_test.db")

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def post(start, end, ship=1, pilot="Alex"):
    return client.post(
        "/api/bookings",
        json={
            "shipId": ship,
            "pilotName": pilot,
            "startTime": start,
            "endTime": end,
        },
    )


def setup_function():
    with main.connection() as db:
        db.execute("DELETE FROM bookings")
        db.execute("DELETE FROM ships")
        db.execute(
            """
            INSERT INTO ships(id, name)
            VALUES
                (1, 'Wanderer'),
                (2, 'Serenity')
            """
        )


def test_buffer_and_availability():
    assert (
        post(
            "2027-01-02T09:00:00-06:00",
            "2027-01-02T10:00:00-06:00",
        ).status_code
        == 201
    )

    assert (
        post(
            "2027-01-02T10:29:00-06:00",
            "2027-01-02T11:00:00-06:00",
        ).status_code
        == 409
    )

    assert (
        post(
            "2027-01-02T10:30:00-06:00",
            "2027-01-02T11:00:00-06:00",
        ).status_code
        == 201
    )

    assert (
        post(
            "2027-01-02T09:00:00-06:00",
            "2027-01-02T10:00:00-06:00",
            ship=2,
        ).status_code
        == 201
    )

    data = client.get("/api/availability?shipId=1&date=2027-01-02").json()

    assert len(data["unavailable"]) == 1
    assert data["unavailable"][0]["startTime"].endswith("08:30:00-06:00")
    assert data["unavailable"][0]["endTime"].endswith("11:30:00-06:00")


def test_boundaries():
    assert (
        post(
            "2027-01-03T06:00:00-06:00",
            "2027-01-03T06:30:00-06:00",
        ).status_code
        == 201
    )

    assert (
        post(
            "2027-01-03T21:30:00-06:00",
            "2027-01-03T22:00:00-06:00",
        ).status_code
        == 201
    )

    assert (
        post(
            "2027-01-03T05:59:00-06:00",
            "2027-01-03T07:00:00-06:00",
        ).status_code
        == 422
    )

    assert (
        post(
            "2027-01-03T21:30:00-06:00",
            "2027-01-03T22:01:00-06:00",
        ).status_code
        == 422
    )

    assert (
        post(
            "2027-01-03T09:00:00-06:00",
            "2027-01-03T09:00:00-06:00",
        ).status_code
        == 422
    )

    assert (
        post(
            "2027-01-03T09:00:00-06:00",
            "2027-01-03T10:00:00-06:00",
            ship=999,
        ).status_code
        == 404
    )


def test_daylight_saving():
    assert (
        post(
            "2027-07-01T09:00:00-05:00",
            "2027-07-01T10:00:00-05:00",
        ).status_code
        == 201
    )

    assert (
        post(
            "2027-12-01T09:00:00-06:00",
            "2027-12-01T10:00:00-06:00",
        ).status_code
        == 201
    )


def test_empty_name_and_missing_timezone():
    response = post(
        "2027-01-04T09:00:00-06:00",
        "2027-01-04T10:00:00-06:00",
        pilot="   ",
    )

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any(
        error["loc"] == ["body", "pilotName"] and "Pilot name" in error["msg"]
        for error in errors
    )

    response = post(
        "2027-01-04T09:00:00",
        "2027-01-04T10:00:00",
    )

    assert response.status_code == 422
    assert "UTC offset" in response.json()["detail"]


def test_buffer_before_existing_and_exact_boundary():
    assert (
        post(
            "2027-01-05T10:00:00-06:00",
            "2027-01-05T11:00:00-06:00",
        ).status_code
        == 201
    )

    response = post(
        "2027-01-05T08:30:00-06:00",
        "2027-01-05T09:31:00-06:00",
    )

    assert response.status_code == 409
    assert "Refueling buffer conflict" in (response.json()["detail"])

    assert (
        post(
            "2027-01-05T08:30:00-06:00",
            "2027-01-05T09:30:00-06:00",
        ).status_code
        == 201
    )


def test_availability_unknown_ship_and_empty_day():
    assert client.get("/api/availability?shipId=999&date=2027-01-06").status_code == 404

    response = client.get("/api/availability?shipId=1&date=2027-01-06")

    assert response.status_code == 200
    assert response.json()["unavailable"] == []


def test_wrong_offset_does_not_change_central_operating_hours():
    assert (
        post(
            "2027-07-01T06:00:00-06:00",
            "2027-07-01T07:00:00-06:00",
        ).status_code
        == 201
    )

    response = post(
        "2027-07-02T05:00:00-05:00",
        "2027-07-02T05:30:00-05:00",
    )

    assert response.status_code == 422
    assert "Operating hours violation" in (response.json()["detail"])


def test_dashboard_includes_pilot_and_ship():
    assert (
        post(
            "2027-01-07T12:00:00-06:00",
            "2027-01-07T13:00:00-06:00",
            pilot="Captain Nova",
        ).status_code
        == 201
    )

    result = client.get("/api/bookings")

    assert result.status_code == 200
    assert len(result.json()) == 1
    assert result.json()[0]["pilotName"] == "Captain Nova"
    assert result.json()[0]["shipId"] == 1


def test_specific_booking_overlap_message():
    assert (
        post(
            "2027-01-08T18:00:00-06:00",
            "2027-01-08T19:00:00-06:00",
            ship=2,
        ).status_code
        == 201
    )

    response = post(
        "2027-01-08T18:30:00-06:00",
        "2027-01-08T19:30:00-06:00",
        ship=2,
    )

    assert response.status_code == 409
    assert "Booking conflict" in response.json()["detail"]
    assert "Serenity" in response.json()["detail"]
    assert len(client.get("/api/bookings").json()) == 1


def test_specific_buffer_after_message():
    assert (
        post(
            "2027-01-08T18:00:00-06:00",
            "2027-01-08T19:00:00-06:00",
            ship=2,
        ).status_code
        == 201
    )

    response = post(
        "2027-01-08T19:15:00-06:00",
        "2027-01-08T20:15:00-06:00",
        ship=2,
    )

    assert response.status_code == 409
    assert "19:30" in response.json()["detail"]


def test_specific_buffer_before_message():
    assert (
        post(
            "2027-01-08T18:00:00-06:00",
            "2027-01-08T19:00:00-06:00",
            ship=2,
        ).status_code
        == 201
    )

    response = post(
        "2027-01-08T16:30:00-06:00",
        "2027-01-08T17:45:00-06:00",
        ship=2,
    )

    assert response.status_code == 409
    assert "17:30" in response.json()["detail"]


def test_specific_operating_hours_message():
    response = post(
        "2027-01-08T21:30:00-06:00",
        "2027-01-08T22:30:00-06:00",
    )

    assert response.status_code == 422
    assert "Operating hours violation" in (response.json()["detail"])


def test_specific_invalid_duration_message():
    response = post(
        "2027-01-08T15:00:00-06:00",
        "2027-01-08T14:00:00-06:00",
    )

    assert response.status_code == 422
    assert "Invalid mission duration" in (response.json()["detail"])


def test_swagger_documents_conflict_responses():
    schema = client.get("/openapi.json").json()

    responses = schema["paths"]["/api/bookings"]["post"]["responses"]

    assert all(code in responses for code in ("201", "404", "409", "422", "503"))

    assert responses["201"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "BookingResponse"
    )


def test_past_booking_rejected():
    response = post(
        "2026-01-08T15:00:00-06:00",
        "2026-01-08T16:00:00-06:00",
    )

    assert response.status_code == 422
    assert "Past booking violation" in (response.json()["detail"])


def test_arbitrary_minutes_and_duration_allowed():
    assert (
        post(
            "2027-01-09T14:07:00-06:00",
            "2027-01-09T14:44:00-06:00",
        ).status_code
        == 201
    )


def test_fractional_seconds_rejected():
    response = post(
        "2027-01-09T14:07:00.500-06:00",
        "2027-01-09T14:44:00-06:00",
    )

    assert response.status_code == 422
    assert "precision" in response.json()["detail"]


def test_database_triggers_protect_direct_writes():
    assert (
        post(
            "2027-01-10T14:00:00-06:00",
            "2027-01-10T15:00:00-06:00",
        ).status_code
        == 201
    )

    with main.connection() as db:
        try:
            db.execute(
                """
                INSERT INTO bookings(
                    ship_id,
                    pilot_name,
                    start_time,
                    end_time
                )
                VALUES (
                    1,
                    'Bypass',
                    '2027-01-10T21:15:00+00:00',
                    '2027-01-10T22:00:00+00:00'
                )
                """
            )

            assert False, "DB accepted conflicting booking"

        except sqlite3.IntegrityError:
            pass

        try:
            db.execute(
                """
                INSERT INTO bookings(
                    ship_id,
                    pilot_name,
                    start_time,
                    end_time
                )
                VALUES (
                    1,
                    'Bypass',
                    '2027-01-11T04:00:00+00:00',
                    '2027-01-11T05:00:00+00:00'
                )
                """
            )

            assert False, "DB accepted out-of-hours booking"

        except sqlite3.IntegrityError:
            pass


def test_simultaneous_conflicting_requests():
    def submit(_):
        response = post(
            "2027-01-11T14:00:00-06:00",
            "2027-01-11T15:00:00-06:00",
        )
        return response.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(submit, range(2)))

    assert sorted(statuses) == [201, 409]

    bookings = client.get("/api/bookings").json()
    assert len(bookings) == 1


@pytest.mark.parametrize(
    "start,end,expected",
    [
        (
            "2028-01-15T06:00:00-06:00",
            "2028-01-15T06:01:00-06:00",
            201,
        ),
        (
            "2028-01-15T05:59:00-06:00",
            "2028-01-15T06:30:00-06:00",
            422,
        ),
        (
            "2028-01-15T21:59:00-06:00",
            "2028-01-15T22:00:00-06:00",
            201,
        ),
        (
            "2028-01-15T21:59:00-06:00",
            "2028-01-15T22:01:00-06:00",
            422,
        ),
        (
            "2028-01-15T22:00:00-06:00",
            "2028-01-15T22:01:00-06:00",
            422,
        ),
    ],
)
def test_operating_hour_edges(start, end, expected):
    response = post(start, end)
    assert response.status_code == expected, response.text


@pytest.mark.parametrize(
    "start,end,expected",
    [
        (
            "2028-01-16T10:00:00-06:00",
            "2028-01-16T11:00:00-06:00",
            409,
        ),
        (
            "2028-01-16T10:29:00-06:00",
            "2028-01-16T11:00:00-06:00",
            409,
        ),
        (
            "2028-01-16T10:30:00-06:00",
            "2028-01-16T11:30:00-06:00",
            201,
        ),
        (
            "2028-01-16T08:00:00-06:00",
            "2028-01-16T08:30:00-06:00",
            201,
        ),
        (
            "2028-01-16T08:00:00-06:00",
            "2028-01-16T08:31:00-06:00",
            409,
        ),
    ],
)
def test_exact_refueling_boundaries(start, end, expected):
    assert (
        post(
            "2028-01-16T09:00:00-06:00",
            "2028-01-16T10:00:00-06:00",
        ).status_code
        == 201
    )

    response = post(start, end)

    assert response.status_code == expected, response.text


def test_adjacent_buffered_windows_are_merged():
    assert (
        post(
            "2028-01-17T09:00:00-06:00",
            "2028-01-17T10:00:00-06:00",
        ).status_code
        == 201
    )

    assert (
        post(
            "2028-01-17T10:30:00-06:00",
            "2028-01-17T11:30:00-06:00",
        ).status_code
        == 201
    )

    response = client.get(
        "/api/availability",
        params={"shipId": 1, "date": "2028-01-17"},
    )

    assert response.status_code == 200

    windows = response.json()["unavailable"]

    assert len(windows) == 1
    assert windows[0]["startTime"].endswith("08:30:00-06:00")
    assert windows[0]["endTime"].endswith("12:00:00-06:00")


def test_same_time_allowed_on_different_spacecraft():
    start = "2028-01-18T14:00:00-06:00"
    end = "2028-01-18T15:00:00-06:00"

    assert post(start, end, ship=1).status_code == 201
    assert post(start, end, ship=2).status_code == 201

    bookings = client.get("/api/bookings").json()

    assert len(bookings) == 2
    assert {b["shipId"] for b in bookings} == {1, 2}


def test_availability_clipped_to_operating_hours():
    assert (
        post(
            "2028-01-19T06:00:00-06:00",
            "2028-01-19T07:00:00-06:00",
        ).status_code
        == 201
    )

    assert (
        post(
            "2028-01-19T21:00:00-06:00",
            "2028-01-19T22:00:00-06:00",
        ).status_code
        == 201
    )

    response = client.get(
        "/api/availability",
        params={"shipId": 1, "date": "2028-01-19"},
    )

    assert response.status_code == 200

    windows = response.json()["unavailable"]

    assert len(windows) == 2
    assert windows[0]["startTime"].endswith("06:00:00-06:00")
    assert windows[0]["endTime"].endswith("07:30:00-06:00")
    assert windows[1]["startTime"].endswith("20:30:00-06:00")
    assert windows[1]["endTime"].endswith("22:00:00-06:00")


def test_invalid_times_precede_unknown_spacecraft():
    response = post(
        "2028-02-01T22:30:00-06:00",
        "2028-02-01T23:00:00-06:00",
        ship=999,
    )

    assert response.status_code == 422
    assert "Operating hours violation" in (response.json()["detail"])

    # An unknown spacecraft with valid times still returns 404.
    response = post(
        "2028-02-01T09:00:00-06:00",
        "2028-02-01T10:00:00-06:00",
        ship=999,
    )

    assert response.status_code == 404


def test_conflict_query_uses_bounded_time_range():
    first = post(
        "2027-02-10T09:00:00-06:00",
        "2027-02-10T10:00:00-06:00",
    )
    assert first.status_code == 201

    # A mission inside the 30-minute refueling gap is rejected.
    conflict = post(
        "2027-02-10T10:29:00-06:00",
        "2027-02-10T11:00:00-06:00",
    )
    assert conflict.status_code == 409

    # Exactly 30 minutes of separation is permitted.
    valid = post(
        "2027-02-10T10:30:00-06:00",
        "2027-02-10T11:00:00-06:00",
    )
    assert valid.status_code == 201

    # An unrelated reservation on another day remains valid.
    unrelated = post(
        "2027-02-11T09:00:00-06:00",
        "2027-02-11T10:00:00-06:00",
    )
    assert unrelated.status_code == 201


def test_spacecraft_specific_refueling_policy():
    with main.connection() as db:
        db.execute(
            """
            UPDATE ships
            SET refuel_minutes = 45
            WHERE id = 1
            """
        )

    ships = client.get("/api/ships").json()
    wanderer = next(ship for ship in ships if ship["id"] == 1)
    serenity = next(ship for ship in ships if ship["id"] == 2)

    assert wanderer["refuelMinutes"] == 45
    assert serenity["refuelMinutes"] == 30

    assert (
        post(
            "2027-02-12T09:00:00-06:00",
            "2027-02-12T10:00:00-06:00",
        ).status_code
        == 201
    )

    # 44 minutes is insufficient for Wanderer.
    assert (
        post(
            "2027-02-12T10:44:00-06:00",
            "2027-02-12T11:30:00-06:00",
        ).status_code
        == 409
    )

    # Exactly 45 minutes is allowed.
    assert (
        post(
            "2027-02-12T10:45:00-06:00",
            "2027-02-12T11:30:00-06:00",
        ).status_code
        == 201
    )

    # Serenity retains its independent 30-minute policy.
    assert (
        post(
            "2027-02-12T09:00:00-06:00",
            "2027-02-12T10:00:00-06:00",
            ship=2,
        ).status_code
        == 201
    )

    assert (
        post(
            "2027-02-12T10:30:00-06:00",
            "2027-02-12T11:00:00-06:00",
            ship=2,
        ).status_code
        == 201
    )


def test_availability_uses_spacecraft_policy():
    with main.connection() as db:
        db.execute("UPDATE ships SET refuel_minutes = 45 WHERE id = 1")

    assert (
        post(
            "2027-02-13T09:00:00-06:00",
            "2027-02-13T10:00:00-06:00",
        ).status_code
        == 201
    )

    response = client.get("/api/availability?shipId=1&date=2027-02-13")

    assert response.status_code == 200

    data = response.json()
    assert data["refuelMinutes"] == 45

    assert data["unavailable"] == [
        {
            "startTime": "2027-02-13T08:15:00-06:00",
            "endTime": "2027-02-13T10:45:00-06:00",
        }
    ]


def test_policy_increase_cannot_invalidate_existing_bookings():
    assert (
        post(
            "2027-02-14T09:00:00-06:00",
            "2027-02-14T10:00:00-06:00",
        ).status_code
        == 201
    )

    assert (
        post(
            "2027-02-14T10:30:00-06:00",
            "2027-02-14T11:00:00-06:00",
        ).status_code
        == 201
    )

    with main.connection() as db:
        try:
            db.execute("UPDATE ships SET refuel_minutes = 45 WHERE id = 1")
            assert False, "Expected conflicting policy update to fail"
        except sqlite3.IntegrityError as exc:
            assert "conflicts with existing bookings" in str(exc)

        minutes = db.execute(
            "SELECT refuel_minutes FROM ships WHERE id = 1"
        ).fetchone()["refuel_minutes"]

    assert minutes == 30


def test_direct_database_insert_respects_ship_refueling_policy():
    with main.connection() as db:
        db.execute("UPDATE ships SET refuel_minutes = 45 WHERE id = 1")

    assert (
        post(
            "2027-02-15T09:00:00-06:00",
            "2027-02-15T10:00:00-06:00",
        ).status_code
        == 201
    )

    with main.connection() as db:
        try:
            db.execute(
                """
                INSERT INTO bookings(
                    ship_id, pilot_name, start_time, end_time
                )
                VALUES (?, ?, ?, ?)
                """,
                (
                    1,
                    "Direct SQL Pilot",
                    "2027-02-15T16:30:00+00:00",
                    "2027-02-15T17:00:00+00:00",
                ),
            )
            assert False, "Expected database trigger to reject insert"
        except sqlite3.IntegrityError as exc:
            assert "refueling buffer" in str(exc)


def test_cancel_booking_releases_mission_and_buffer():
    created = post(
        "2028-04-10T09:00:00-05:00",
        "2028-04-10T10:00:00-05:00",
    )
    assert created.status_code == 201

    booking_id = created.json()["id"]

    # Before cancellation, the refueling window blocks this mission.
    assert (
        post(
            "2028-04-10T10:15:00-05:00",
            "2028-04-10T11:00:00-05:00",
        ).status_code
        == 409
    )

    response = client.post(f"/api/bookings/{booking_id}/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert response.json()["cancelledAt"] is not None

    # Cancelled history remains visible.
    bookings = client.get("/api/bookings").json()
    cancelled = next(b for b in bookings if b["id"] == booking_id)
    assert cancelled["status"] == "cancelled"

    # The old mission and its buffer no longer block scheduling.
    availability = client.get("/api/availability?shipId=1&date=2028-04-10").json()

    assert availability["unavailable"] == []

    replacement = post(
        "2028-04-10T09:30:00-05:00",
        "2028-04-10T10:30:00-05:00",
    )
    assert replacement.status_code == 201


def test_cancellation_cannot_be_repeated():
    created = post(
        "2028-04-11T09:00:00-05:00",
        "2028-04-11T10:00:00-05:00",
    )
    assert created.status_code == 201

    booking_id = created.json()["id"]

    first = client.post(f"/api/bookings/{booking_id}/cancel")
    second = client.post(f"/api/bookings/{booking_id}/cancel")

    assert first.status_code == 200
    assert second.status_code == 409


def test_cancellation_of_unknown_booking():
    response = client.post("/api/bookings/999999/cancel")
    assert response.status_code == 404


def test_cancelled_booking_cannot_be_reactivated():
    created = post(
        "2028-04-12T09:00:00-05:00",
        "2028-04-12T10:00:00-05:00",
    )
    assert created.status_code == 201

    booking_id = created.json()["id"]

    assert client.post(f"/api/bookings/{booking_id}/cancel").status_code == 200

    with main.connection() as db:
        try:
            db.execute(
                """
                UPDATE bookings
                SET status = 'confirmed',
                    cancelled_at = NULL
                WHERE id = ?
                """,
                (booking_id,),
            )
            assert False, "Cancelled booking was reactivated"
        except sqlite3.IntegrityError:
            pass


def test_concurrent_cancellation_only_succeeds_once():
    created = post(
        "2028-04-13T09:00:00-05:00",
        "2028-04-13T10:00:00-05:00",
    )
    assert created.status_code == 201

    booking_id = created.json()["id"]

    def cancel():
        return client.post(f"/api/bookings/{booking_id}/cancel").status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: cancel(), range(2)))

    assert sorted(results) == [200, 409]


def test_cancelled_booking_does_not_block_policy_change():
    first = post(
        "2028-05-10T09:00:00-05:00",
        "2028-05-10T10:00:00-05:00",
    )
    second = post(
        "2028-05-10T10:30:00-05:00",
        "2028-05-10T11:30:00-05:00",
    )

    assert first.status_code == 201
    assert second.status_code == 201

    with main.connection() as db:
        with pytest.raises(
            sqlite3.IntegrityError,
            match="conflicts with existing bookings",
        ):
            db.execute(
                "UPDATE ships SET refuel_minutes = ? WHERE id = ?",
                (45, 1),
            )

        # A failed policy update must leave the old policy intact.
        current = db.execute(
            "SELECT refuel_minutes FROM ships WHERE id = ?",
            (1,),
        ).fetchone()

    assert current["refuel_minutes"] == 30

    response = client.post(f"/api/bookings/{second.json()['id']}/cancel")
    assert response.status_code == 200

    with main.connection() as db:
        db.execute(
            "UPDATE ships SET refuel_minutes = ? WHERE id = ?",
            (45, 1),
        )

    ships = client.get("/api/ships").json()
    ship = next(s for s in ships if s["id"] == 1)
    assert ship["refuelMinutes"] == 45

    # The remaining confirmed mission enforces the new buffer.
    assert (
        post(
            "2028-05-10T10:44:00-05:00",
            "2028-05-10T11:30:00-05:00",
        ).status_code
        == 409
    )

    assert (
        post(
            "2028-05-10T10:45:00-05:00",
            "2028-05-10T11:30:00-05:00",
        ).status_code
        == 201
    )


def test_migrations_preserve_policy_and_cancellation():
    created = post(
        "2028-05-11T09:00:00-05:00",
        "2028-05-11T10:00:00-05:00",
    )
    assert created.status_code == 201

    booking_id = created.json()["id"]

    cancelled = client.post(f"/api/bookings/{booking_id}/cancel")
    assert cancelled.status_code == 200

    with main.connection() as db:
        db.execute(
            "UPDATE ships SET refuel_minutes = ? WHERE id = ?",
            (45, 1),
        )

    # Simulate repeated startup/migration execution.
    main.init_db()
    main.init_db()

    with main.connection() as db:
        booking = db.execute(
            """
            SELECT status, cancelled_at
            FROM bookings
            WHERE id = ?
            """,
            (booking_id,),
        ).fetchone()

        ship = db.execute(
            """
            SELECT refuel_minutes
            FROM ships
            WHERE id = ?
            """,
            (1,),
        ).fetchone()

    assert booking is not None
    assert booking["status"] == "cancelled"
    assert booking["cancelled_at"] is not None
    assert ship["refuel_minutes"] == 45

    # Cancelled history must not regain its scheduling lock.
    replacement = post(
        "2028-05-11T09:00:00-05:00",
        "2028-05-11T10:00:00-05:00",
    )
    assert replacement.status_code == 201


def test_cancelled_booking_history_is_immutable():
    created = post(
        "2028-05-12T09:00:00-05:00",
        "2028-05-12T10:00:00-05:00",
    )
    assert created.status_code == 201

    booking_id = created.json()["id"]

    assert client.post(f"/api/bookings/{booking_id}/cancel").status_code == 200

    with main.connection() as db:
        original = db.execute(
            """
            SELECT pilot_name, status, cancelled_at
            FROM bookings
            WHERE id = ?
            """,
            (booking_id,),
        ).fetchone()

        invalid_updates = (
            ("pilot_name = NULL", (booking_id,)),
            ("cancelled_at = NULL", (booking_id,)),
            ("status = 'confirmed'", (booking_id,)),
        )

        for assignment, params in invalid_updates:
            with pytest.raises(sqlite3.IntegrityError):
                db.execute(
                    f"UPDATE bookings SET {assignment} WHERE id = ?",
                    params,
                )

        current = db.execute(
            """
            SELECT pilot_name, status, cancelled_at
            FROM bookings
            WHERE id = ?
            """,
            (booking_id,),
        ).fetchone()

    assert dict(current) == dict(original)


@pytest.mark.parametrize(
    "name",
    [
        "Alex Nova",
        "José Álvarez",
        "O'Connor",
        "Anne-Marie",
        "de la Cruz",
        "McDonald",
        "A\u0301lex",
        "A" * 100,
    ],
)
def test_valid_pilot_names(name):
    response = post(
        "2028-06-10T09:00:00-05:00",
        "2028-06-10T10:00:00-05:00",
        pilot=name,
    )

    assert response.status_code == 201, response.text
    assert response.json()["pilotName"] == name


def test_pilot_name_is_trimmed_without_capitalization():
    response = post(
        "2028-06-11T09:00:00-05:00",
        "2028-06-11T10:00:00-05:00",
        pilot="  de la Cruz  ",
    )

    assert response.status_code == 201, response.text
    assert response.json()["pilotName"] == "de la Cruz"


@pytest.mark.parametrize(
    "name",
    [
        "",
        " ",
        "A",
        "A" * 101,
        "Alex123",
        "Alex!",
        "Alex_Nova",
        "Alex\tNova",
        "Alex\nNova",
        "Alex\x00Nova",
        "Alex🚀",
    ],
)
def test_invalid_pilot_names_return_422(name):
    response = post(
        "2028-06-12T09:00:00-05:00",
        "2028-06-12T10:00:00-05:00",
        pilot=name,
    )

    assert response.status_code == 422, response.text
    assert client.get("/api/bookings").json() == []


def test_database_rejects_invalid_pilot_name():
    with main.connection() as db:
        with pytest.raises(
            sqlite3.IntegrityError,
            match="Invalid pilot name",
        ):
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
                (
                    1,
                    "Alex123",
                    "2028-06-13T14:00:00+00:00",
                    "2028-06-13T15:00:00+00:00",
                ),
            )


def test_policy_update_checks_adjacent_confirmed_bookings():
    first = post(
        "2028-07-10T09:00:00-05:00",
        "2028-07-10T10:00:00-05:00",
    )
    middle = post(
        "2028-07-10T10:30:00-05:00",
        "2028-07-10T11:00:00-05:00",
    )
    last = post(
        "2028-07-10T11:30:00-05:00",
        "2028-07-10T12:00:00-05:00",
    )

    assert first.status_code == 201
    assert middle.status_code == 201
    assert last.status_code == 201

    with main.connection() as db:
        with pytest.raises(
            sqlite3.IntegrityError,
            match="conflicts with existing bookings",
        ):
            db.execute(
                """
                UPDATE ships
                SET refuel_minutes = 45
                WHERE id = 1
                """
            )

    # Cancel the middle mission. The remaining two
    # missions have sufficient separation for 45 minutes.
    response = client.post(f"/api/bookings/{middle.json()['id']}/cancel")
    assert response.status_code == 200

    with main.connection() as db:
        db.execute(
            """
            UPDATE ships
            SET refuel_minutes = 45
            WHERE id = 1
            """
        )

        minutes = db.execute(
            """
            SELECT refuel_minutes
            FROM ships
            WHERE id = 1
            """
        ).fetchone()["refuel_minutes"]

    assert minutes == 45


def test_unchanged_policy_update_is_allowed():
    assert (
        post(
            "2028-07-11T09:00:00-05:00",
            "2028-07-11T10:00:00-05:00",
        ).status_code
        == 201
    )

    with main.connection() as db:
        db.execute(
            """
            UPDATE ships
            SET refuel_minutes = refuel_minutes
            WHERE id = 1
            """
        )


def test_direct_insert_respects_exact_buffer_boundary():
    assert (
        post(
            "2028-07-12T09:00:00-05:00",
            "2028-07-12T10:00:00-05:00",
        ).status_code
        == 201
    )

    # One second inside the buffer must fail.
    with main.connection() as db:
        with pytest.raises(sqlite3.IntegrityError):
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
                (
                    1,
                    "Boundary Pilot",
                    "2028-07-12T15:29:59+00:00",
                    "2028-07-12T16:00:00+00:00",
                ),
            )

    # Exactly 30 minutes after the prior mission ends.
    assert (
        post(
            "2028-07-12T10:30:00-05:00",
            "2028-07-12T11:00:00-05:00",
        ).status_code
        == 201
    )


@pytest.mark.parametrize(
    "path",
    ["/api/ships", "/api/bookings", "/api/availability?shipId=1&date=2027-01-02"],
)
def test_locked_reads_return_structured_unavailable(monkeypatch, path):
    from contextlib import contextmanager

    @contextmanager
    def locked_connection():
        raise sqlite3.OperationalError("database is locked")
        yield

    monkeypatch.setattr(main, "connection", locked_connection)
    response = client.get(path)
    assert response.status_code == 503
    assert response.headers["content-type"].startswith("application/json")
    assert "temporarily unavailable" in response.json()["detail"]


def test_readonly_write_returns_structured_unavailable(monkeypatch):
    from contextlib import contextmanager

    @contextmanager
    def readonly_connection():
        raise sqlite3.OperationalError("attempt to write a readonly database")
        yield

    monkeypatch.setattr(main, "connection", readonly_connection)
    response = post("2027-01-02T09:00:00-06:00", "2027-01-02T10:00:00-06:00")
    assert response.status_code == 503
    assert response.json() == {
        "detail": "Booking service is temporarily unavailable. Please try again."
    }


def test_unexpected_sqlite_error_not_disguised_as_unavailable(monkeypatch):
    from contextlib import contextmanager

    @contextmanager
    def broken_connection():
        raise sqlite3.OperationalError("no such table: ships")
        yield

    monkeypatch.setattr(main, "connection", broken_connection)
    response = client.get("/api/ships")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}


def test_sqlite_error_code_takes_precedence_over_message(monkeypatch):
    from contextlib import contextmanager

    @contextmanager
    def broken_connection():
        with sqlite3.connect(":memory:") as db:
            db.execute('SELECT * FROM "database is locked"')
            yield db

    monkeypatch.setattr(main, "connection", broken_connection)
    response = client.get("/api/ships")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}
