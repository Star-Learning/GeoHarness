"""Encode and verify seven real GeoHarness Agent recordings as 1080p H.264 MP4."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = (
    "01-building-data-inspection",
    "02-river-building-query",
    "03-building-statistics-by-district",
    "04-road-accessibility",
    "05-parameter-revision",
    "06-multi-constraint-selection",
    "07-official-nyc-building-inspection",
)
FRAME_SIZE = (1920, 1080)
CAPTURE_FPS = 4
OUTPUT_FPS = 30


def read_manifest(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    required = {
        "schema_version",
        "scenario_id",
        "session_id",
        "prompt_sha256",
        "started_at",
        "finished_at",
        "capture_fps",
        "frame_count",
        "final_status",
    }
    missing = sorted(required - value.keys())
    if missing:
        raise ValueError(f"{path}: missing manifest fields {missing}")
    if value["scenario_id"] != path.parents[1].name:
        raise ValueError(f"{path}: scenario_id does not match its Scenario folder")
    if value["capture_fps"] != CAPTURE_FPS:
        raise ValueError(f"{path}: expected capture_fps {CAPTURE_FPS}")
    if value["final_status"] != "success":
        raise ValueError(f"{path}: recording is not a successful real Agent run")
    if not isinstance(value["session_id"], str) or len(value["session_id"]) < 8:
        raise ValueError(f"{path}: missing real Harness session id")
    if not isinstance(value["prompt_sha256"], str) or len(value["prompt_sha256"]) != 64:
        raise ValueError(f"{path}: invalid prompt SHA256")
    return value


def recording_paths(scenario: str, frames_root: Path) -> tuple[Path, Path, Path]:
    scenario_root = ROOT / "examples" / "scenarios" / scenario
    frames = frames_root / scenario / "frames"
    manifest = scenario_root / "media" / "agent-demo-1080p.manifest.json"
    output = scenario_root / "media" / "agent-demo-1080p.mp4"
    return frames, manifest, output


def validate_frames(frames: Path, expected_count: int) -> str:
    names = sorted(path for path in frames.glob("frame-*.*") if path.suffix.lower() in {".png", ".jpg", ".jpeg"})
    if len(names) != expected_count:
        raise ValueError(f"{frames}: expected {expected_count} frames, found {len(names)}")
    if expected_count < CAPTURE_FPS * 10:
        raise ValueError(f"{frames}: recording must contain at least ten seconds of real UI frames")
    suffixes = {path.suffix.lower() for path in names}
    if len(suffixes) != 1:
        raise ValueError(f"{frames}: every frame must use one consistent image extension")
    suffix = names[0].suffix.lower()
    for index, path in enumerate(names, start=1):
        if path.name != f"frame-{index:06d}{suffix}":
            raise ValueError(f"{frames}: frames must be contiguous from frame-000001{suffix}")
        with Image.open(path) as image:
            expected_format = "PNG" if suffix == ".png" else "JPEG"
            if image.format != expected_format or image.size != FRAME_SIZE:
                raise ValueError(
                    f"{path}: expected a {FRAME_SIZE[0]}x{FRAME_SIZE[1]} {expected_format} whose extension matches its bytes"
                )
    return suffix


def encode(frames: Path, frame_suffix: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp.mp4")
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-framerate",
        str(CAPTURE_FPS),
        "-i",
        str(frames / f"frame-%06d{frame_suffix}"),
        "-vf",
        f"fps={OUTPUT_FPS},format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "18",
        "-movflags",
        "+faststart",
        "-an",
        str(temporary),
    ]
    subprocess.run(command, check=True)
    temporary.replace(output)


def probe(path: Path) -> dict[str, Any]:
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name,width,height,pix_fmt,avg_frame_rate,duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    streams = json.loads(completed.stdout).get("streams", [])
    if len(streams) != 1:
        raise ValueError(f"{path}: expected one video stream")
    stream = streams[0]
    if stream.get("codec_name") != "h264":
        raise ValueError(f"{path}: expected H.264")
    if (stream.get("width"), stream.get("height")) != FRAME_SIZE:
        raise ValueError(f"{path}: expected 1920x1080")
    if stream.get("pix_fmt") != "yuv420p" or stream.get("avg_frame_rate") != "30/1":
        raise ValueError(f"{path}: expected yuv420p at 30 fps")
    return stream


def process_scenario(scenario: str, frames_root: Path, check_only: bool) -> Path:
    frames, manifest_path, output = recording_paths(scenario, frames_root)
    manifest = read_manifest(manifest_path)
    frame_suffix = validate_frames(frames, int(manifest["frame_count"]))
    if not check_only:
        encode(frames, frame_suffix, output)
    if not output.is_file() or output.stat().st_size < 100_000:
        raise ValueError(f"{output}: missing or unexpectedly small video")
    stream = probe(output)
    print(
        f"{'verified' if check_only else 'built'} {output.relative_to(ROOT)} "
        f"({stream.get('duration', '?')}s, {output.stat().st_size} bytes)"
    )
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify recordings without re-encoding")
    parser.add_argument(
        "--frames-root",
        type=Path,
        default=ROOT / ".tmp" / "agent-video-recordings",
        help="root containing <scenario>/frames/frame-000001.png or frame-000001.jpg",
    )
    parser.add_argument("--scenario", choices=SCENARIOS, help="build only one Scenario")
    args = parser.parse_args()
    selected = (args.scenario,) if args.scenario else SCENARIOS
    for scenario in selected:
        process_scenario(scenario, args.frames_root.resolve(), args.check)


if __name__ == "__main__":
    main()
