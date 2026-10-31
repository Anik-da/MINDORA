/**
 * MINDORA - Crop Geometry & Coordinate Offset Mapping
 * 
 * Accurately crops screen captures to the active application window bounds,
 * tracks physical pixel crop offsets, and maps identified candidates back
 * into full-capture and display coordinates.
 */

import { Rect } from './coordinates.js';

export interface WindowLogicalBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropCalculation {
  isCropped: boolean;
  cropRect: CropRect;
  offsetX: number;
  offsetY: number;
}

const MIN_CROP_DIMENSION_PX = 100;

/**
 * Calculates physical pixel crop rectangle for a window within a desktop capture.
 */
export function calculateWindowCrop(
  windowBounds: WindowLogicalBounds,
  captureDims: { width: number; height: number },
  scaleFactor: number
): CropCalculation {
  // If window bounds are missing or invalid, fall back to full capture
  if (
    windowBounds.width <= 0 ||
    windowBounds.height <= 0 ||
    captureDims.width <= 0 ||
    captureDims.height <= 0
  ) {
    return {
      isCropped: false,
      cropRect: { x: 0, y: 0, width: captureDims.width, height: captureDims.height },
      offsetX: 0,
      offsetY: 0
    };
  }

  // Convert logical window coordinates to physical capture pixels
  const rawX = Math.round(windowBounds.left * scaleFactor);
  const rawY = Math.round(windowBounds.top * scaleFactor);
  const rawW = Math.round(windowBounds.width * scaleFactor);
  const rawH = Math.round(windowBounds.height * scaleFactor);

  // Clamp within capture boundaries
  const clampedX = Math.max(0, Math.min(rawX, captureDims.width - 1));
  const clampedY = Math.max(0, Math.min(rawY, captureDims.height - 1));
  const maxPossibleW = captureDims.width - clampedX;
  const maxPossibleH = captureDims.height - clampedY;
  const clampedW = Math.max(0, Math.min(rawW, maxPossibleW));
  const clampedH = Math.max(0, Math.min(rawH, maxPossibleH));

  // If clamped region is smaller than minimum supported dimension, do not crop
  if (clampedW < MIN_CROP_DIMENSION_PX || clampedH < MIN_CROP_DIMENSION_PX) {
    return {
      isCropped: false,
      cropRect: { x: 0, y: 0, width: captureDims.width, height: captureDims.height },
      offsetX: 0,
      offsetY: 0
    };
  }

  return {
    isCropped: true,
    cropRect: { x: clampedX, y: clampedY, width: clampedW, height: clampedH },
    offsetX: clampedX,
    offsetY: clampedY
  };
}

/**
 * Maps a bounding box defined relative to a cropped region back into full capture pixel space.
 */
export function mapCroppedBoxToFullCapture(
  croppedBox: Rect,
  offsetX: number,
  offsetY: number
): Rect {
  return {
    x: croppedBox.x + offsetX,
    y: croppedBox.y + offsetY,
    width: croppedBox.width,
    height: croppedBox.height
  };
}
