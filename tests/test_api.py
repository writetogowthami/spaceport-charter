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

# Create a private temporary directory for this test process.
_test_db_directory = tempfile.TemporaryDirectory(
    prefix="spaceport_tests_"
)

# Every test process gets its own SQLite database.
os.environ["SPACEPORT_DB"] = str(
    Path(_test_db_directory.name) / "spaceport_test.db"
)

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
    assert post(
        "2027-01-02T09:00:00-06:00",
        "2027-01-02T10:00:00-06:00",
    ).status_code == 201

    assert post(
        "2027-01-02T10:29:00-06:00",
        "2027-01-02T11:00:00-06:00",
    ).status_code == 409

    assert post(
        "2027-01-02T10:30:00-06:00",
        "2027-01-02T11:00:00-06:00",
    ).status_code == 201

    assert post(
        "2027-01-02T09:00:00-06:00",
        "2027-01-02T10:00:00-06:00",
        ship=2,
    ).status_code == 201

    data = client.get(
        "/api/availability?shipId=1&date=2027-01-02"
    ).json()

    assert len(data["unavailable"]) == 1
    assert data["unavailable"][0]["startTime"].endswith(
        "08:30:00-06:00"
    )
    assert data["unavailable"][0]["endTime"].endswith(
        "11:30:00-06:00"
    )


def test_boundaries():
    assert post(
        "2027-01-03T06:00:00-06:00",
        "2027-01-03T06:30:00-06:00",
    ).status_code == 201

    assert post(
        "2027-01-03T21:30:00-06:00",
        "2027-01-03T22:00:00-06:00",
    ).status_code == 201

    assert post(
        "2027-01-03T05:59:00-06:00",
        "2027-01-03T07:00:00-06:00",
    ).status_code == 422

    assert post(
        "2027-01-03T21:30:00-06:00",
        "2027-01-03T22:01:00-06:00",
    ).status_code == 422

    assert post(
        "2027-01-03T09:00:00-06:00",
        "2027-01-03T09:00:00-06:00",
    ).status_code == 422

    assert post(
        "2027-01-03T09:00:00-06:00",
        "2027-01-03T10:00:00-06:00",
        ship=999,
    ).status_code == 404


def test_daylight_saving():
    assert post(
        "2027-07-01T09:00:00-05:00",
        "2027-07-01T10:00:00-05:00",
    ).status_code == 201

    assert post(
        "2027-12-01T09:00:00-06:00",
        "2027-12-01T10:00:00-06:00",
    ).status_code == 201


def test_empty_name_and_missing_timezone():
    response = post(
        "2027-01-04T09:00:00-06:00",
        "2027-01-04T10:00:00-06:00",
        pilot="   ",
    )

    assert response.status_code == 422
    assert "Pilot name" in response.json()["detail"]

    response = post(
        "2027-01-04T09:00:00",
        "2027-01-04T10:00:00",
    )

    assert response.status_code == 422
    assert "UTC offset" in response.json()["detail"]


def test_buffer_before_existing_and_exact_boundary():
    assert post(
        "2027-01-05T10:00:00-06:00",
        "2027-01-05T11:00:00-06:00",
    ).status_code == 201

    response = post(
        "2027-01-05T08:30:00-06:00",
        "2027-01-05T09:31:00-06:00",
    )

    assert response.status_code == 409
    assert "Refueling buffer conflict" in (
        response.json()["detail"]
    )

    assert post(
        "2027-01-05T08:30:00-06:00",
        "2027-01-05T09:30:00-06:00",
    ).status_code == 201


def test_availability_unknown_ship_and_empty_day():
    assert client.get(
        "/api/availability?shipId=999&date=2027-01-06"
    ).status_code == 404

    response = client.get(
        "/api/availability?shipId=1&date=2027-01-06"
    )

    assert response.status_code == 200
    assert response.json()["unavailable"] == []


def test_wrong_offset_does_not_change_central_operating_hours():
    assert post(
        "2027-07-01T06:00:00-06:00",
        "2027-07-01T07:00:00-06:00",
    ).status_code == 201

    response = post(
        "2027-07-02T05:00:00-05:00",
        "2027-07-02T05:30:00-05:00",
    )

    assert response.status_code == 422
    assert "Operating hours violation" in (
        response.json()["detail"]
    )


def test_dashboard_includes_pilot_and_ship():
    assert post(
        "2027-01-07T12:00:00-06:00",
        "2027-01-07T13:00:00-06:00",
        pilot="Captain Nova",
    ).status_code == 201

    result = client.get("/api/bookings")

    assert result.status_code == 200
    assert len(result.json()) == 1
    assert result.json()[0]["pilotName"] == "Captain Nova"
    assert result.json()[0]["shipId"] == 1


def test_specific_booking_overlap_message():
    assert post(
        "2027-01-08T18:00:00-06:00",
        "2027-01-08T19:00:00-06:00",
        ship=2,
    ).status_code == 201

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
    assert post(
        "2027-01-08T18:00:00-06:00",
        "2027-01-08T19:00:00-06:00",
        ship=2,
    ).status_code == 201

    response = post(
        "2027-01-08T19:15:00-06:00",
        "2027-01-08T20:15:00-06:00",
        ship=2,
    )

    assert response.status_code == 409
    assert "19:30" in response.json()["detail"]


def test_specific_buffer_before_message():
    assert post(
        "2027-01-08T18:00:00-06:00",
        "2027-01-08T19:00:00-06:00",
        ship=2,
    ).status_code == 201

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
    assert "Operating hours violation" in (
        response.json()["detail"]
    )


def test_specific_invalid_duration_message():
    response = post(
        "2027-01-08T15:00:00-06:00",
        "2027-01-08T14:00:00-06:00",
    )

    assert response.status_code == 422
    assert "Invalid mission duration" in (
        response.json()["detail"]
    )


def test_swagger_documents_conflict_responses():
    schema = client.get("/openapi.json").json()

    responses = schema["paths"][
        "/api/bookings"
    ]["post"]["responses"]

    assert all(
        code in responses
        for code in ("201", "404", "409", "422", "503")
    )

    assert responses["201"]["content"][
        "application/json"
    ]["schema"]["$ref"].endswith("BookingResponse")


def test_past_booking_rejected():
    response = post(
        "2026-01-08T15:00:00-06:00",
        "2026-01-08T16:00:00-06:00",
    )

    assert response.status_code == 422
    assert "Past booking violation" in (
        response.json()["detail"]
    )


def test_arbitrary_minutes_and_duration_allowed():
    assert post(
        "2027-01-09T14:07:00-06:00",
        "2027-01-09T14:44:00-06:00",
    ).status_code == 201


def test_fractional_seconds_rejected():
    response = post(
        "2027-01-09T14:07:00.500-06:00",
        "2027-01-09T14:44:00-06:00",
    )

    assert response.status_code == 422
    assert "precision" in response.json()["detail"]


def test_database_triggers_protect_direct_writes():
    assert post(
        "2027-01-10T14:00:00-06:00",
        "2027-01-10T15:00:00-06:00",
    ).status_code == 201

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
        statuses = list(
            pool.map(submit, range(2))
        )

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
def test_exact_refueling_boundaries(
    start, end, expected
):
    assert post(
        "2028-01-16T09:00:00-06:00",
        "2028-01-16T10:00:00-06:00",
    ).status_code == 201

    response = post(start, end)

    assert response.status_code == expected, response.text


def test_adjacent_buffered_windows_are_merged():
    assert post(
        "2028-01-17T09:00:00-06:00",
        "2028-01-17T10:00:00-06:00",
    ).status_code == 201

    assert post(
        "2028-01-17T10:30:00-06:00",
        "2028-01-17T11:30:00-06:00",
    ).status_code == 201

    response = client.get(
        "/api/availability",
        params={"shipId": 1, "date": "2028-01-17"},
    )

    assert response.status_code == 200

    windows = response.json()["unavailable"]

    assert len(windows) == 1
    assert windows[0]["startTime"].endswith(
        "08:30:00-06:00"
    )
    assert windows[0]["endTime"].endswith(
        "12:00:00-06:00"
    )


def test_same_time_allowed_on_different_spacecraft():
    start = "2028-01-18T14:00:00-06:00"
    end = "2028-01-18T15:00:00-06:00"

    assert post(start, end, ship=1).status_code == 201
    assert post(start, end, ship=2).status_code == 201

    bookings = client.get("/api/bookings").json()

    assert len(bookings) == 2
    assert {b["shipId"] for b in bookings} == {1, 2}


def test_availability_clipped_to_operating_hours():
    assert post(
        "2028-01-19T06:00:00-06:00",
        "2028-01-19T07:00:00-06:00",
    ).status_code == 201

    assert post(
        "2028-01-19T21:00:00-06:00",
        "2028-01-19T22:00:00-06:00",
    ).status_code == 201

    response = client.get(
        "/api/availability",
        params={"shipId": 1, "date": "2028-01-19"},
    )

    assert response.status_code == 200

    windows = response.json()["unavailable"]

    assert len(windows) == 2
    assert windows[0]["startTime"].endswith(
        "06:00:00-06:00"
    )
    assert windows[0]["endTime"].endswith(
        "07:30:00-06:00"
    )
    assert windows[1]["startTime"].endswith(
        "20:30:00-06:00"
    )
    assert windows[1]["endTime"].endswith(
        "22:00:00-06:00"
    )

def test_invalid_times_precede_unknown_spacecraft():
    response = post(
        "2028-02-01T22:30:00-06:00",
        "2028-02-01T23:00:00-06:00",
        ship=999,
    )

    assert response.status_code == 422
    assert "Operating hours violation" in (
        response.json()["detail"]
    )

    # An unknown spacecraft with valid times still returns 404.
    response = post(
        "2028-02-01T09:00:00-06:00",
        "2028-02-01T10:00:00-06:00",
        ship=999,
    )

    assert response.status_code == 404