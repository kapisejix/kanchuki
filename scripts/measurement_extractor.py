"""
Body measurement extraction from front+back photos via MediaPipe Pose.

Feeds docs/DATABASE.md::CustomerMeasurement (source=PHOTO).
Requires: pip install mediapipe opencv-python numpy

Accuracy: +/-3-5cm typical (2D single-angle limitation, see docs/PRO-REQUIREMENTS.md F-102b).
Height must be supplied by user -- pixels alone carry no absolute scale.
"""
import argparse
import json
import math
import os
import sys
from dataclasses import dataclass

import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import PoseLandmarker, PoseLandmarkerOptions, RunningMode

# ponytail: ellipse correction factor is a flat heuristic (body cross-section
# isn't a true ellipse, and single-angle photos give no depth measurement).
# 2.6 approximates circumference from width-only via elliptical perimeter.
# Upgrade path: per-body-type regression model once enough labelled
# photo+tape-measure pairs exist to fit one.
CIRCUMFERENCE_FACTOR = 2.6  # width_px * scale -> circumference_cm multiplier
WAIST_NARROWING = 0.85       # no MediaPipe waist landmark; waist ~= shoulder/hip avg * this

# mediapipe 0.10.x dropped the legacy `mp.solutions.pose` API on this platform
# build (Tasks API only) -- indices below match the same 33-point BlazePose
# topology the legacy API used, so they carry over unchanged.
LANDMARK_INDEX = {
    "nose": 0,
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_hip": 23,
    "right_hip": 24,
    "left_ankle": 27,
    "right_ankle": 28,
}

MODEL_PATH = os.environ.get(
    "POSE_LANDMARKER_MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "models", "pose_landmarker_lite.task"),
)

_detector = None


def _get_detector() -> PoseLandmarker:
    global _detector
    if _detector is None:
        options = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=RunningMode.IMAGE,
        )
        _detector = PoseLandmarker.create_from_options(options)
    return _detector


@dataclass
class Point:
    x: float
    y: float


def pixel_distance(p1: Point, p2: Point) -> float:
    return math.hypot(p1.x - p2.x, p1.y - p2.y)


def get_landmarks(image_path: str) -> dict[str, Point]:
    """Run MediaPipe Pose on one image, return named landmarks in pixel coords."""
    if not os.path.isfile(image_path):
        raise FileNotFoundError(image_path)

    image = mp.Image.create_from_file(image_path)
    result = _get_detector().detect(image)

    if not result.pose_landmarks:
        raise ValueError(f"no person detected in {image_path}")

    lm = result.pose_landmarks[0]  # first detected person
    w, h = image.width, image.height
    return {name: Point(lm[idx].x * w, lm[idx].y * h) for name, idx in LANDMARK_INDEX.items()}


def estimate_measurements(
    front: dict[str, Point], back: dict[str, Point], height_cm: float
) -> dict:
    """Pure math over landmark dicts -- no image I/O, unit-testable in isolation."""
    # scale: pixel height (nose -> ankle midpoint) maps to user-entered height_cm
    ankle_mid_front = Point(
        (front["left_ankle"].x + front["right_ankle"].x) / 2,
        (front["left_ankle"].y + front["right_ankle"].y) / 2,
    )
    height_px = pixel_distance(front["nose"], ankle_mid_front)
    scale = height_cm / height_px  # cm per pixel

    shoulder_w_px = pixel_distance(front["left_shoulder"], front["right_shoulder"])
    hip_w_px_front = pixel_distance(front["left_hip"], front["right_hip"])
    hip_w_px_back = pixel_distance(back["left_hip"], back["right_hip"])
    hip_w_px = (hip_w_px_front + hip_w_px_back) / 2  # average both views

    shoulder_w_cm = shoulder_w_px * scale
    hip_w_cm = hip_w_px * scale
    waist_w_cm = (shoulder_w_cm + hip_w_cm) / 2 * WAIST_NARROWING

    inseam_cm = pixel_distance(
        Point((front["left_hip"].x + front["right_hip"].x) / 2, front["left_hip"].y),
        ankle_mid_front,
    ) * scale

    return {
        "height_cm": round(height_cm, 1),
        "bust_cm": round(shoulder_w_cm * CIRCUMFERENCE_FACTOR, 1),
        "waist_cm": round(waist_w_cm * CIRCUMFERENCE_FACTOR, 1),
        "hip_cm": round(hip_w_cm * CIRCUMFERENCE_FACTOR, 1),
        "pant_waist_cm": round(waist_w_cm * CIRCUMFERENCE_FACTOR, 1),
        "pant_hip_cm": round(hip_w_cm * CIRCUMFERENCE_FACTOR, 1),
        "inseam_cm": round(inseam_cm, 1),
        "confidence_score": 0.7,  # heuristic flat value; not model-derived
    }


def extract_measurements(front_path: str, back_path: str, height_cm: float) -> dict:
    front = get_landmarks(front_path)
    back = get_landmarks(back_path)
    return estimate_measurements(front, back, height_cm)


def _demo():
    """ponytail: one runnable self-check for the math, no camera/photos needed."""
    # synthetic landmarks: 180cm-tall stick figure, 400px tall in image
    front = {
        "nose": Point(100, 20),
        "left_shoulder": Point(80, 60),
        "right_shoulder": Point(120, 60),
        "left_hip": Point(85, 220),
        "right_hip": Point(115, 220),
        "left_ankle": Point(90, 420),
        "right_ankle": Point(110, 420),
    }
    back = {
        "left_hip": Point(85, 220),
        "right_hip": Point(115, 220),
    }
    result = estimate_measurements(front, back, height_cm=180.0)
    assert result["height_cm"] == 180.0
    assert 0 < result["bust_cm"] < 200
    assert 0 < result["waist_cm"] < 200
    assert 0 < result["inseam_cm"] < 180
    print("self-check passed:", result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--front", help="front photo path")
    parser.add_argument("--back", help="back photo path")
    parser.add_argument("--height-cm", type=float, help="user-entered height in cm")
    parser.add_argument("--demo", action="store_true", help="run synthetic self-check")
    args = parser.parse_args()

    if args.demo or not (args.front and args.back and args.height_cm):
        _demo()
    else:
        try:
            result = extract_measurements(args.front, args.back, args.height_cm)
        except (FileNotFoundError, ValueError) as exc:
            print(json.dumps({"error": str(exc)}), file=sys.stderr)
            sys.exit(1)
        print(json.dumps(result))
