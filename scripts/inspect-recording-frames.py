"""Inspect local, already-recorded browser frames; never capture the desktop."""
from pathlib import Path
import argparse
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument("frames", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--indices", default="")
parser.add_argument("--allow-mixed", action="store_true")
args = parser.parse_args()
paths = sorted(args.frames.glob("frame-*.jpg"))
indices = [int(item) for item in args.indices.split(",")] if args.indices else list(range(1, len(paths) + 1, max(1, len(paths)//40)))
sheet = Image.new("RGB", (1280, ((len(indices)+3)//4)*204), "#e9edf2")
draw = ImageDraw.Draw(sheet)
for i, index in enumerate(indices):
    with Image.open(paths[index-1]) as frame:
        if frame.size != (1920, 1080) and not args.allow_mixed:
            raise ValueError(f"Incorrect source size: {paths[index-1]} {frame.size}")
        frame.thumbnail((320,180))
        x, y = (i%4)*320, (i//4)*204
        sheet.paste(frame,(x,y))
        draw.text((x+8,y+182),f"Frame {index}",fill="#111827")
args.output.parent.mkdir(parents=True,exist_ok=True)
sheet.save(args.output)
print(f"Contact sheet: {args.output}; recorded frames: {len(paths)}")
