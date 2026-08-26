from __future__ import annotations

import argparse
from pathlib import Path

import uvicorn

from .api import create_app


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the GeoHarness local Geo Service")
    parser.add_argument("--workspace", type=Path, required=True, help="Directory for Layer Registry state")
    parser.add_argument("--scenario-root", type=Path, action="append", default=[], help="Allowed Scenario import root")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    app = create_app(args.workspace, allowed_import_roots=args.scenario_root)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
