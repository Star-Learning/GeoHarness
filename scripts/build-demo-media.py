"""Build multi-keyframe Demo GIFs from real Harness Web screenshots."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


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
HARNESS_SIZE = (1280, 720)
GIF_SIZE = (960, 540)
TRANSITION_DURATION_MS = 110
REQUIRED_ROLES = {"initial", "input", "plan", "layers", "map", "result", "complete"}

# Each crop preserves 16:9. They highlight real regions of the 1280x720
# Harness screenshots; no step state, result number or layer is synthesized.
FOCUS_BOXES = {
    "full": (0, 0, 1280, 720),
    "input": (320, 180, 1280, 720),
    "agent_plan": (800, 45, 1280, 315),
    "layers": (280, 170, 760, 440),
    "map": (400, 85, 1200, 535),
    "agent_result": (800, 330, 1280, 600),
}


def storyboard_path(scenario: str) -> Path:
    return ROOT / "examples" / "scenarios" / scenario / "media" / "gif-storyboard.json"


def read_storyboard(scenario: str) -> dict[str, Any]:
    path = storyboard_path(scenario)
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schema_version") != "1.0":
        raise ValueError(f"{path}: unsupported schema_version")
    transition_frames = value.get("transition_frames")
    if not isinstance(transition_frames, int) or not 1 <= transition_frames <= 6:
        raise ValueError(f"{path}: transition_frames must be an integer from 1 to 6")
    keyframes = value.get("keyframes")
    if not isinstance(keyframes, list) or len(keyframes) < 7:
        raise ValueError(f"{path}: at least seven semantic keyframes are required")

    roles: set[str] = set()
    for index, keyframe in enumerate(keyframes, start=1):
        if not isinstance(keyframe, dict):
            raise ValueError(f"{path}: keyframe {index} must be an object")
        source = keyframe.get("source")
        focus = keyframe.get("focus")
        role = keyframe.get("role")
        label = keyframe.get("label")
        hold_ms = keyframe.get("hold_ms")
        if not isinstance(source, str) or Path(source).name != source or not source.endswith(".jpg"):
            raise ValueError(f"{path}: keyframe {index} has an invalid screenshot source")
        if focus not in FOCUS_BOXES:
            raise ValueError(f"{path}: keyframe {index} has an unknown focus {focus!r}")
        if not isinstance(role, str) or not role:
            raise ValueError(f"{path}: keyframe {index} has no role")
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f"{path}: keyframe {index} has no label")
        if not isinstance(hold_ms, int) or not 500 <= hold_ms <= 5_000:
            raise ValueError(f"{path}: keyframe {index} hold_ms must be 500..5000")
        roles.add(role)

    missing = sorted(REQUIRED_ROLES - roles)
    if missing:
        raise ValueError(f"{path}: missing required keyframe roles {missing}")
    return value


def load_screenshot(scenario: str, name: str) -> Image.Image:
    path = ROOT / "examples" / "scenarios" / scenario / "screenshots" / name
    with Image.open(path) as source:
        if source.format != "JPEG" or source.size != HARNESS_SIZE:
            raise ValueError(
                f"{scenario}/{name}: expected a {HARNESS_SIZE[0]}x{HARNESS_SIZE[1]} Harness JPEG, "
                f"got {source.format} {source.size}"
            )
        return source.convert("RGB")


def label_font() -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype("DejaVuSans.ttf", 20)
    except OSError:
        return ImageFont.load_default()


def add_label(frame: Image.Image, label: str) -> Image.Image:
    canvas = frame.convert("RGBA")
    draw = ImageDraw.Draw(canvas, "RGBA")
    font = label_font()
    left, top = 16, 15
    box = draw.textbbox((left, top), label, font=font)
    right = box[2] + 13
    bottom = box[3] + 10
    draw.rounded_rectangle((left - 9, top - 7, right, bottom), radius=8, fill=(18, 28, 38, 218))
    draw.text((left, top), label, font=font, fill=(255, 255, 255, 255))
    return canvas.convert("RGB")


def render_keyframe(scenario: str, keyframe: dict[str, Any]) -> Image.Image:
    screenshot = load_screenshot(scenario, keyframe["source"])
    focused = screenshot.crop(FOCUS_BOXES[keyframe["focus"]])
    resized = focused.resize(GIF_SIZE, Image.Resampling.LANCZOS)
    return add_label(resized, keyframe["label"])


def timeline(scenario: str, storyboard: dict[str, Any]) -> tuple[list[Image.Image], list[int]]:
    keyframes = storyboard["keyframes"]
    rendered = [render_keyframe(scenario, keyframe) for keyframe in keyframes]
    transition_count = storyboard["transition_frames"]
    frames: list[Image.Image] = []
    durations: list[int] = []

    for index, frame in enumerate(rendered):
        frames.append(frame)
        durations.append(keyframes[index]["hold_ms"])
        if index == len(rendered) - 1:
            continue
        next_frame = rendered[index + 1]
        for transition in range(1, transition_count + 1):
            alpha = transition / (transition_count + 1)
            frames.append(Image.blend(frame, next_frame, alpha))
            durations.append(TRANSITION_DURATION_MS)
    return frames, durations


def expected_frame_count(storyboard: dict[str, Any]) -> int:
    keyframe_count = len(storyboard["keyframes"])
    return keyframe_count + (keyframe_count - 1) * storyboard["transition_frames"]


def build_scenario(scenario: str) -> Path:
    storyboard = read_storyboard(scenario)
    frames, durations = timeline(scenario, storyboard)
    # Harness screenshots are mostly neutral UI surfaces and vector colors. A
    # shared 128-color palette keeps labels/text legible while avoiding multi-
    # megabyte-per-scene GIFs after the extra transition frames are added.
    palette = frames[-1].quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    indexed = [
        frame.quantize(palette=palette, dither=Image.Dither.NONE)
        for frame in frames
    ]
    output = ROOT / "examples" / "scenarios" / scenario / "media" / "demo.gif"
    output.parent.mkdir(parents=True, exist_ok=True)
    indexed[0].save(
        output,
        save_all=True,
        append_images=indexed[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=True,
    )
    return output


def check_scenario(scenario: str) -> Path:
    storyboard = read_storyboard(scenario)
    for source in {keyframe["source"] for keyframe in storyboard["keyframes"]}:
        load_screenshot(scenario, source)
    output = ROOT / "examples" / "scenarios" / scenario / "media" / "demo.gif"
    with Image.open(output) as image:
        if image.format != "GIF" or image.size != GIF_SIZE:
            raise ValueError(f"{scenario}: invalid demo GIF format or dimensions")
        expected = expected_frame_count(storyboard)
        if image.n_frames != expected:
            raise ValueError(f"{scenario}: expected {expected} GIF frames, got {image.n_frames}")
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate existing media without rewriting it")
    parser.add_argument("--scenario", choices=SCENARIOS, help="build only one Scenario")
    args = parser.parse_args()
    selected = (args.scenario,) if args.scenario else SCENARIOS
    for scenario in selected:
        output = check_scenario(scenario) if args.check else build_scenario(scenario)
        print(f"{'verified' if args.check else 'built'} {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
