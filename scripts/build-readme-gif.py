"""Build/check the README GIF from bounded excerpts of an existing real video.

No browser capture or synthetic Agent content. --check works in a clean clone
without the large local MP4 or FFmpeg; rebuilding requires both.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "examples/topics/03-satellite-visual-inspection/media"
STORYBOARD = MEDIA / "core-workflow.storyboard.json"
AUDIT = MEDIA / "core-workflow.manifest.json"
REQUIRED_ROLES = {"input", "plan", "flight", "boundary", "inspection", "layers", "report", "visibility_opacity", "result"}


def read_storyboard():
    story = json.loads(STORYBOARD.read_text(encoding="utf-8"))
    assert story["schema_version"] == "1.0"
    assert story["size"] == [960, 540]
    assert 32 <= story["palette_colors"] <= 256
    assert 0 < story["max_bytes"] <= 6_000_000
    for key in ("source_video", "source_manifest", "output"):
        assert Path(story[key]).name == story[key]
    assert REQUIRED_ROLES <= {s["role"] for s in story["segments"]}
    previous_end = 0
    source = json.loads((MEDIA / story["source_manifest"]).read_text(encoding="utf-8"))
    for segment in story["segments"]:
        assert previous_end <= segment["start"] < segment["end"] <= source["duration_seconds"]
        assert .5 <= segment["duration"] <= 8
        assert 1 <= segment["fps"] <= 8
        previous_end = segment["end"]
    return story, source


def frame_delays(duration, count):
    # GIF time is integral centiseconds. Distribute rounding, avoiding a speed
    # error from repeatedly rounding 125 ms or 166.67 ms to a single delay.
    total = round(duration * 100)
    return [10 * (round((i + 1) * total / count) - round(i * total / count)) for i in range(count)]


def build(story, source):
    video = MEDIA / story["source_video"]
    digest = hashlib.sha256(video.read_bytes()).hexdigest()
    if digest != source["sha256"]:
        raise ValueError("Source video does not match its real-session audit")
    width, height = story["size"]
    frames, durations, timeline = [], [], []
    for segment in story["segments"]:
        count = round(segment["duration"] * segment["fps"])
        rate = count / (segment["end"] - segment["start"])
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(segment["start"]),
                   "-i", str(video), "-t", str(segment["end"] - segment["start"]),
                   "-vf", f"fps={rate:.9f},scale={width}:{height}:flags=lanczos,setsar=1",
                   "-frames:v", str(count), "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
        result = subprocess.run(command, check=True, capture_output=True)
        stride = width * height * 3
        if len(result.stdout) != count * stride:
            raise ValueError(f"Incomplete decoded excerpt: {segment['role']}")
        start_ms = sum(durations)
        frames.extend(Image.frombytes("RGB", (width, height), result.stdout[i * stride:(i + 1) * stride])
                      for i in range(count))
        durations.extend(frame_delays(segment["duration"], count))
        timeline.append({**segment, "sampled_frames": count, "gif_start_ms": start_ms, "gif_end_ms": sum(durations)})
        print(f"Decoded {segment['role']}: {count} real source frames", flush=True)

    # One palette across all scenes prevents color flicker. No dithering keeps
    # neutral UI text crisp and avoids noisy satellite textures inflating GIFs.
    samples = frames[::max(1, len(frames) // 40)]
    sheet = Image.new("RGB", (240 * 8, 135 * ((len(samples) + 7) // 8)), "white")
    for i, frame in enumerate(samples):
        sheet.paste(frame.resize((240, 135), Image.Resampling.LANCZOS), ((i % 8) * 240, (i // 8) * 135))
    palette = sheet.quantize(colors=story["palette_colors"], method=Image.Quantize.MEDIANCUT)
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    output = MEDIA / story["output"]
    indexed[0].save(output, save_all=True, append_images=indexed[1:], duration=durations,
                    loop=story["loop"], disposal=1, optimize=True)
    with Image.open(output) as gif:
        audit = {
            "schema_version": "1.0", "source_video": story["source_video"], "source_sha256": digest,
            "source_manifest": story["source_manifest"], "source_session": source["session_id"],
            "storyboard_sha256": hashlib.sha256(STORYBOARD.read_text(encoding="utf-8").encode("utf-8")).hexdigest(),
            "output": story["output"], "size": story["size"], "frames": gif.n_frames,
            "duration_ms": sum(durations), "sampled_frames": len(frames),
            "palette_colors": story["palette_colors"], "bytes": output.stat().st_size,
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "segments": timeline,
            "source_limitations": source["capture_limitations"],
            "edits": "Chronological excerpts, shorter waits, Lanczos downscale, shared palette and duplicate-frame optimization only. No synthetic motion. Not a recording of the newer continuous-flight code.",
            "analysis_limitations": "RGB heuristic visual screening, not a trained segmentation model or measured area. Real cached geocoding/OSM boundary; newly acquired imagery and recomputed classification in the source run.",
        }
    AUDIT.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def check(story, source):
    output = MEDIA / story["output"]
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    assert audit["source_sha256"] == source["sha256"]
    assert audit["source_session"] == source["session_id"]
    assert audit["storyboard_sha256"] == hashlib.sha256(STORYBOARD.read_text(encoding="utf-8").encode("utf-8")).hexdigest()
    assert audit["sha256"] == hashlib.sha256(output.read_bytes()).hexdigest()
    assert output.stat().st_size == audit["bytes"] <= story["max_bytes"]
    duration = 0
    with Image.open(output) as gif:
        assert gif.format == "GIF" and list(gif.size) == story["size"]
        assert gif.info.get("loop") == story["loop"]
        assert gif.n_frames == audit["frames"] and gif.n_frames >= 40
        for index in range(gif.n_frames):
            gif.seek(index)
            gif.load()
            delay = gif.info.get("duration", 0)
            assert delay > 0
            duration += delay
    assert duration == audit["duration_ms"] == round(sum(s["duration"] for s in story["segments"]) * 1000)
    print(f"Verified README GIF: {audit['frames']} frames, {duration / 1000:g} s, {audit['bytes']:,} bytes")


def contact_sheet(path):
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    selections = [(s["role"], (s["gif_start_ms"] + s["gif_end_ms"]) // 2) for s in audit["segments"]]
    sheet = Image.new("RGB", (960, 298 * ((len(selections) + 1) // 2)), "#e7edf2")
    with Image.open(MEDIA / audit["output"]) as gif:
        elapsed, cursor = 0, 0
        for index in range(gif.n_frames):
            gif.seek(index)
            elapsed += gif.info["duration"]
            while cursor < len(selections) and elapsed > selections[cursor][1]:
                role, time = selections[cursor]
                x, y = (cursor % 2) * 480, (cursor // 2) * 298
                sheet.paste(gif.convert("RGB").resize((480, 270), Image.Resampling.LANCZOS), (x, y))
                ImageDraw.Draw(sheet).text((x + 8, y + 277), f"{role} | {time / 1000:g}s", fill="#172b46")
                cursor += 1
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--contact-sheet", type=Path)
    args = parser.parse_args()
    story, source = read_storyboard()
    if not args.check:
        build(story, source)
    check(story, source)
    if args.contact_sheet:
        contact_sheet(args.contact_sheet)
