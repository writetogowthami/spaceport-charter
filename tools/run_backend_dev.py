
#!/usr/bin/env python3
"""Start the development backend with an explicitly selected database."""

import argparse
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def main():
    parser = argparse.ArgumentParser(
        description="Start Spaceport backend using an explicit database."
    )
    parser.add_argument(
        "--db",
        required=True,
        type=Path,
        help="Path to an existing development or QA SQLite database",
    )
    args = parser.parse_args()

    database = args.db.expanduser().resolve()
    protected = (BACKEND / "spaceport.db").resolve()

    if database == protected:
        parser.error(
            "Refusing to start the development server against "
            "backend/spaceport.db"
        )

    if not database.is_file():
        parser.error(
            f"Database does not exist: {database}. "
            "Initialize and seed a separate database first."
        )

    env = os.environ.copy()
    env["SPACEPORT_DB"] = str(database)

    print(f"Using database: {database}", flush=True)

    subprocess.run(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "main:app",
            "--reload",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
        ],
        cwd=BACKEND,
        env=env,
        check=True,
    )


if __name__ == "__main__":
    main()
