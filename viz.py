"""Debug overlay: the fastest way to spot mistakes is to look at them.

Draw bbox + track_id, age/gender, a head-pose arrow, and colour the box by
attention (green = looking, grey = not).
"""

from __future__ import annotations

import cv2
import numpy as np

GREEN = (0, 200, 0)
GREY = (150, 150, 150)
ORANGE = (0, 140, 255)
CYAN = (255, 200, 0)


def draw_head_pose_arrow(frame_bgr: np.ndarray, bbox: tuple[int, int, int, int], yaw: float, pitch: float, length: int = 50) -> None:
    """Draw a 2D projected arrow from face center indicating 3D gaze/head direction."""
    x1, y1, x2, y2 = bbox
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

    # Project 3D angles (yaw, pitch) onto 2D image coordinates
    yaw_rad = np.radians(yaw)
    pitch_rad = np.radians(pitch)

    dx = int(length * np.sin(yaw_rad))
    dy = int(-length * np.sin(pitch_rad))

    end_point = (cx + dx, cy + dy)
    cv2.arrowedLine(frame_bgr, (cx, cy), end_point, (0, 255, 255), 2, tipLength=0.3)


def draw_person(frame_bgr: np.ndarray, meta) -> None:
    """Draw one PersonMeta onto the frame in place."""
    x1, y1, x2, y2 = meta.bbox
    colour = GREEN if meta.attention else GREY
    cv2.rectangle(frame_bgr, (x1, y1), (x2, y2), colour, 2)

    label_parts = [f"#{meta.track_id}"]
    if getattr(meta, "age", None) is not None and meta.age_group:
        label_parts.append(f"~{meta.age}y ({meta.age_group})")
    elif meta.age_group:
        label_parts.append(f"Age:{meta.age_group}")
    if meta.gender:
        label_parts.append(f"G:{meta.gender}")
    if getattr(meta, "has_pet", False) and getattr(meta, "pet_type", None):
        label_parts.append(f"Pet:{meta.pet_type}")
    if getattr(meta, "clothing_color", None):
        col_str = f"Col:{meta.clothing_color}"
        if getattr(meta, "clothing_style", None):
            col_str += f"({meta.clothing_style})"
        label_parts.append(col_str)
    if meta.yaw is not None and meta.pitch is not None:
        label_parts.append(f"Y:{meta.yaw:.0f} P:{meta.pitch:.0f}")
    if meta.dwell_time:
        label_parts.append(f"{meta.dwell_time:.1f}s")

    label = " | ".join(label_parts)
    cv2.putText(frame_bgr, label, (x1, max(0, y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, colour, 1, cv2.LINE_AA)

    if meta.yaw is not None and meta.pitch is not None:
        draw_head_pose_arrow(frame_bgr, meta.bbox, meta.yaw, meta.pitch)

    # Draw linking line to associated pet if present
    if getattr(meta, "has_pet", False) and getattr(meta, "pet_box", None):
        px1, py1, px2, py2 = meta.pet_box
        cx, cy = (x1 + x2) // 2, y2
        pet_cx, pet_cy = (px1 + px2) // 2, (py1 + py2) // 2
        cv2.line(frame_bgr, (cx, cy), (pet_cx, pet_cy), ORANGE, 1, cv2.LINE_AA)


def draw_pet(frame_bgr: np.ndarray, pet) -> None:
    """Draw one PetDetection onto the frame in place."""
    x1, y1, x2, y2 = pet.bbox
    is_dog = pet.pet_type == "dog"
    colour = ORANGE if is_dog else CYAN
    cv2.rectangle(frame_bgr, (x1, y1), (x2, y2), colour, 2)

    type_str = "Dog" if is_dog else "Cat"
    label = f"{type_str} {pet.confidence:.2f}"
    if getattr(pet, "owner_track_id", None) is not None:
        label += f" -> #{pet.owner_track_id}"

    cv2.putText(frame_bgr, label, (x1, max(0, y1 - 6)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, colour, 1, cv2.LINE_AA)





def draw_detection(frame_bgr: np.ndarray, detection) -> None:
    """Draw a raw FaceDetector detection onto the frame."""
    x1, y1, x2, y2 = detection.bbox
    cv2.rectangle(frame_bgr, (x1, y1), (x2, y2), GREEN, 2)
    label = f"Face {detection.confidence:.2f}"
    cv2.putText(frame_bgr, label, (x1, max(0, y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, GREEN, 1, cv2.LINE_AA)


def draw_fps(frame_bgr: np.ndarray, fps: float) -> None:
    cv2.putText(frame_bgr, f"{fps:.1f} FPS", (10, 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2, cv2.LINE_AA)


def draw_ambient_hud(canvas: np.ndarray, context: any) -> None:
    """Draw semi-transparent Ambient Context (VLM) HUD table on canvas in place.
    
    Displays weather, crowd activity, and detected salient objects.
    """
    if context is None:
        return
    weather = getattr(context, "weather", None)
    crowd_activity = getattr(context, "crowd_activity", None)
    objects = getattr(context, "objects", []) or []

    # Only draw if there is at least some ambient info
    if not weather and not crowd_activity and not objects:
        return

    overlay = canvas.copy()
    cv2.rectangle(overlay, (10, 30), (330, 145), (40, 40, 40), -1)
    cv2.addWeighted(overlay, 0.65, canvas, 0.35, 0, canvas)

    cv2.putText(
        canvas, "AMBIENT CONTEXT (VLM):", (20, 52),
        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1, cv2.LINE_AA
    )
    cv2.putText(
        canvas, f"Weather: {weather or 'N/A'}", (20, 75),
        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA
    )
    cv2.putText(
        canvas, f"Activity: {crowd_activity or 'N/A'}", (20, 98),
        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA
    )
    objs_str = ", ".join(objects) if objects else "none"
    cv2.putText(
        canvas, f"Objects: {objs_str[:32]}", (20, 121),
        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA
    )


def draw_tracking_hud(
    canvas: np.ndarray,
    metas: list[any] | None = None,
    pets: list[any] | None = None,
    context: any = None,
    fps: float | None = None,
) -> np.ndarray:
    """Consolidated visualization entry point (Single Source of Truth).
    
    Draws all tracking annotations onto canvas:
    1. Pets (Dog, Cat, confidence, owner link)
    2. Persons (BBox, Track ID, Age/Gender, Head Pose, Clothing, Dwell time)
    3. Ambient Context HUD (VLM)
    4. FPS counter
    
    Args:
        canvas: The frame BGR image to draw on (modified in place and returned).
        metas: List of PersonMeta detections.
        pets: List of PetDetection detections.
        context: SceneContext from VLM.
        fps: Optional frames per second float.
        
    Returns:
        The annotated canvas.
    """
    if pets:
        for pet in pets:
            draw_pet(canvas, pet)

    if metas:
        for m in metas:
            draw_person(canvas, m)

    if context:
        draw_ambient_hud(canvas, context)

    if fps is not None and fps > 0:
        draw_fps(canvas, fps)

    return canvas
