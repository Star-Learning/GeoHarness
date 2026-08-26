"""Build the six Phase 10 demo GIFs from real Harness Web screenshots."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCENARIOS: dict[str, tuple[list[str], list[int]]] = {
    "01-building-data-inspection": (["initial.jpg", "result.jpg"], [1300, 2600]),
    "02-river-building-query": (["initial.jpg", "result.jpg"], [1300, 2600]),
    "03-building-statistics-by-district": (["initial.jpg", "result.jpg"], [1300, 2600]),
    "04-road-accessibility": (["initial.jpg", "result.jpg"], [1300, 2600]),
    "05-parameter-revision": (
        ["initial.jpg", "result-500m.jpg", "result-1km.jpg"],
        [1100, 1900, 2800],
    ),
    "06-multi-constraint-selection": (["initial.jpg", "result.jpg"], [1300, 2800]),
}
GIF_SIZE = (960, 540)


def screenshot_frames(scenario: str, names: list[str]) -> list[Image.Image]:
    root = ROOT / "examples" / "scenarios" / scenario / "screenshots"
    frames: list[Image.Image] = []
    for name in names:
        with Image.open(root / name) as source:
            if source.size != (1280, 720):
                raise ValueError(f"{scenario}/{name}: expected a 1280x720 Harness screenshot, got {source.size}")
            frames.append(source.convert("RGB").resize(GIF_SIZE, Image.Resampling.LANCZOS))
    return frames


def build_scenario(scenario: str, names: list[str], durations: list[int]) -> Path:
    frames = screenshot_frames(scenario, names)
    palette = frames[0].quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    indexed = [palette]
    indexed.extend(
        frame.quantize(palette=palette, dither=Image.Dither.FLOYDSTEINBERG)
        for frame in frames[1:]
    )
    output = ROOT / "examples" / "scenarios" / scenario / "media" / "demo.gif"
    output.parent.mkdir(parents=True, exist_ok=True)
    indexed[0].save(
        output,
        save_all=True,
        append_images=indexed[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )
    return output


def check_scenario(scenario: str, names: list[str]) -> Path:
    screenshot_frames(scenario, names)
    output = ROOT / "examples" / "scenarios" / scenario / "media" / "demo.gif"
    with Image.open(output) as image:
        if image.format != "GIF" or image.size != GIF_SIZE:
            raise ValueError(f"{scenario}: invalid demo GIF format or dimensions")
        if image.n_frames != len(names):
            raise ValueError(f"{scenario}: expected {len(names)} GIF frames, got {image.n_frames}")
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate existing media without rewriting it")
    args = parser.parse_args()
    for scenario, (names, durations) in SCENARIOS.items():
        output = check_scenario(scenario, names) if args.check else build_scenario(scenario, names, durations)
        print(f"{'verified' if args.check else 'built'} {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
