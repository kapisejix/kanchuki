"""Unit tests for services/photo-cleanup/app.py build_args — the pure
multipart-form -> CLI-args mapping. No torch/rembg imports (app.py only
imports fastapi at module level; the pipeline runs in a subprocess).

Run: python services/photo-cleanup/test_app.py
"""
import importlib.util
import sys
from pathlib import Path

_spec = importlib.util.spec_from_file_location("cleanup_app", Path(__file__).parent / "app.py")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
build_args = _module.build_args
_to_bool = _module._to_bool


def check(name, opts, expect):
    got = build_args(opts)
    ok = got == expect
    print(f"{'PASS' if ok else 'FAIL'}: {name}")
    if not ok:
        print(f"      got      {got}")
        print(f"      expected {expect}")
        sys.exit(1)


# Composite mode (default)
check("plain composite, no flags", {"bg_image": None}, [])

# Background image
check("bg image", {"bg_image": "/tmp/background.jpg"}, ["--bg-image", "/tmp/background.jpg"])

# Hardware removal + tight crop + bg
check(
    "remove-hardware + tight-crop + bg",
    {"bg_image": "/tmp/background.jpg", "remove_hardware": "true", "tight_crop": "true"},
    ["--bg-image", "/tmp/background.jpg", "--remove-hardware", "--tight-crop"],
)

# Tap-to-fix points pass through as normalized strings
check(
    "prompt points + excludes",
    {"prompt_points": "0.5,0.35;0.6,0.25", "prompt_excludes": "0.5,0.6"},
    ["--prompt-points", "0.5,0.35;0.6,0.25", "--prompt-excludes", "0.5,0.6"],
)

# Crop rect
check(
    "crop",
    {"crop": "10,20,300,400"},
    ["--crop", "10,20,300,400"],
)

# Ghost mannequin forces composite (blur ignored when both present)
check(
    "ghost-mannequin + blur -> composite wins",
    {"bg_image": "/tmp/bg.jpg", "blur": 25, "ghost_mannequin": "true"},
    ["--bg-image", "/tmp/bg.jpg", "--ghost-mannequin"],
)

# Blur (portrait) mode wins over bg-image unless ghost-mannequin
check(
    "blur mode",
    {"bg_image": "/tmp/bg.jpg", "blur": 25},
    ["--blur", "25"],
)

# Shine rides along in blur mode
check(
    "blur + shine",
    {"bg_image": "/tmp/bg.jpg", "blur": 12, "shine": "true"},
    ["--blur", "12", "--shine"],
)

# Empty-ish flags -> []
check("all empty", {}, [])

# _to_bool edge cases
assert _to_bool("true") is True
assert _to_bool("false") is False
assert _to_bool("1") is True
assert _to_bool(None) is False

print("\n9/9 build_args tests passed")
