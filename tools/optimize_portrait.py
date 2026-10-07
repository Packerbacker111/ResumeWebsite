"""Generate the site's portrait variants. Replace images/pfp3.jpg, then rerun.

The original is read-only. Generated files contain pixels, not source metadata.
Requires Pillow (install with: python -m pip install -r tools/requirements.txt).
"""
import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "images" / "pfp3.jpg"
OUTPUT = ROOT / "images" / "portrait"
WIDTHS = (96, 192, 360, 720, 1080)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def generate():
    source = SOURCE.read_bytes()
    with Image.open(BytesIO(source)) as image:
        image = ImageOps.exif_transpose(image)
        # A fresh RGB canvas removes EXIF, GPS, comments, and profile metadata.
        clean = Image.new("RGB", image.size, "#101819")
        if "A" in image.getbands():
            rgba = image.convert("RGBA")
            clean.paste(rgba, mask=rgba.getchannel("A"))
        else:
            clean.paste(image.convert("RGB"))
    outputs = {}
    for width in WIDTHS:
        portrait = ImageOps.fit(clean, (width, width), Image.Resampling.LANCZOS)
        buffer = BytesIO()
        portrait.save(buffer, "WEBP", quality=82, method=6)
        outputs[f"portrait-{width}.webp"] = buffer.getvalue()
        if width in (192, 720):
            buffer = BytesIO()
            portrait.save(buffer, "JPEG", quality=84, optimize=True, progressive=True)
            outputs[f"portrait-{width}.jpg"] = buffer.getvalue()
    manifest = {
        "source_sha256": digest(source),
        "source_bytes": len(source),
        "source_dimensions": list(clean.size),
        "crop": "Centered square, after applying EXIF orientation",
        "variants": {
            name: {"bytes": len(data), "sha256": digest(data)}
            for name, data in outputs.items()
        },
    }
    outputs["manifest.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    return outputs, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify existing output without writing files")
    args = parser.parse_args()
    outputs, manifest = generate()
    if args.check:
        stale = [name for name, data in outputs.items() if not (OUTPUT / name).is_file() or (OUTPUT / name).read_bytes() != data]
        if stale:
            parser.exit(1, "Portrait variants need rebuilding. Run python tools/optimize_portrait.py\n")
        print("Portrait variants are current.")
        return
    OUTPUT.mkdir(parents=True, exist_ok=True)
    # Render everything before replacing any output; the source is never written.
    for name, data in outputs.items():
        pending = OUTPUT / (name + ".tmp")
        pending.write_bytes(data)
        pending.replace(OUTPUT / name)
    for name, info in manifest["variants"].items():
        print(f"{name}: {info['bytes'] / 1024:.1f} KB")
    print(f"Original preserved: {manifest['source_bytes'] / 1024:.1f} KB")


if __name__ == "__main__":
    main()
