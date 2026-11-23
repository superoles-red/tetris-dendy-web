#!/usr/bin/env python3
"""Fingerprint the game in place, or create the static Pages deployment."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, help="Create the deployable site in a new or empty folder.")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
worker = root / "sw.js"


def public_files(directory):
    return {
        path.relative_to(root).as_posix()
        for path in directory.rglob("*")
        if path.is_file() and not any(part.startswith(".") for part in path.relative_to(root).parts)
    }


files = {"index.html", "manifest.webmanifest", "game.nes", "vendor/jsnes.js"}
root_extensions = {".js", ".mjs", ".css", ".nes", ".json", ".woff2", ".woff", ".ttf", ".otf",
                   ".png", ".gif", ".svg", ".webp", ".jpg", ".jpeg", ".avif"}
for path in root.iterdir():
    if path.is_file() and path != worker and not path.name.startswith(".") and path.suffix.lower() in root_extensions:
        files.add(path.name)
for directory in ("assets", "locales", "fonts"):
    files.update(public_files(root / directory))

entries = []
for name in sorted(files):
    digest = hashlib.sha256((root / name).read_bytes()).digest()
    entries.append([name, "sha256-" + base64.b64encode(digest).decode("ascii")])

manifest = ",\n".join("  " + json.dumps(pair, ensure_ascii=False) for pair in entries)
version = hashlib.sha256(manifest.encode()).hexdigest()[:20]
start = "// BEGIN GENERATED OFFLINE BUNDLE"
end = "// END GENERATED OFFLINE BUNDLE"
before, remainder = worker.read_text().split(start, 1)
_, after = remainder.split(end, 1)
source = f"{before}{start}\nconst BUILD = '{version}';\nconst FILES = [\n{manifest}\n];\n{end}{after}"

if args.output:
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        parser.error(f"Output folder contains files: {output}")
    output.mkdir(parents=True, exist_ok=True)
    companion_files = public_files(root / "screenshots") | public_files(root / "vendor") | {"README.md", ".nojekyll"}
    for name in sorted(files | companion_files):
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / name, target)
    (output / "sw.js").write_text(source)
else:
    worker.write_text(source)
print(f"Offline build {version}, {len(entries)} files.")
