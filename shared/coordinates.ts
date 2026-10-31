/**
 * MINDORA - Coordinate Conversion Module
 * 
 * Maps normalized model coordinates [ymin, xmin, ymax, xmax] (range 0..1000)
 * into:
 * 1. Capture pixel coordinates (in the raw captured image space)
 * 2. Display logical coordinates (in the OS desktop coordinate space)
 * 3. Overlay-local rectangles (relative to the overlay window's top-left origin)
 */

export type NormalizedBox = [number, number, number, number];

export interface CaptureDimensions {
  width: number;
  height: number;
}

export interface DisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TargetConversionResult {
  capturePixels: Rect;
  displayLogical: Rect;
  overlayLocal: Rect;
}

export type CoordinateValidationSuccess<T> = { valid: true; value: T };
export type CoordinateValidationFailure = { valid: false; error: string };
export type CoordinateValidationResult<T> = CoordinateValidationSuccess<T> | CoordinateValidationFailure;

/**
 * Validates a normalized bounding box [ymin, xmin, ymax, xmax] from Gemini.
 * Rejects non-finite values, out-of-range values, inverted order, and zero area.
 */
export function validateNormalizedBox(box: unknown): CoordinateValidationResult<NormalizedBox> {
  if (!Array.isArray(box)) {
    return { valid: false, error: 'Target box must be an array of 4 numbers [ymin, xmin, ymax, xmax]' };
  }

  if (box.length !== 4) {
    return { valid: false, error: `Target box must have exactly 4 numbers, got ${box.length}` };
  }

  const [ymin, xmin, ymax, xmax] = box;

  for (let i = 0; i < 4; i++) {
    const val = box[i];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return { valid: false, error: `Coordinate at index ${i} is not a finite number: ${val}` };
    }
    if (val < 0 || val > 1000) {
      return { valid: false, error: `Coordinate at index ${i} (${val}) is outside normalised range [0, 1000]` };
    }
  }

  if (ymin >= ymax) {
    return { valid: false, error: `Invalid vertical ordering: ymin (${ymin}) must be strictly less than ymax (${ymax})` };
  }

  if (xmin >= xmax) {
    return { valid: false, error: `Invalid horizontal ordering: xmin (${xmin}) must be strictly less than xmax (${xmax})` };
  }

  return { valid: true, value: [ymin, xmin, ymax, xmax] };
}

/**
 * Validates capture dimensions and display bounds, including aspect ratio compatibility.
 * Prevents drawing misaligned targets on distorted captures.
 */
export function validateCaptureAndDisplay(
  capture: CaptureDimensions,
  display: DisplayBounds,
  aspectRatioTolerance = 0.02
): CoordinateValidationResult<void> {
  if (!capture || typeof capture.width !== 'number' || typeof capture.height !== 'number') {
    return { valid: false, error: 'Invalid capture dimensions: width and height must be numbers' };
  }

  if (capture.width <= 0 || capture.height <= 0) {
    return { valid: false, error: `Capture dimensions must be positive, got ${capture.width}x${capture.height}` };
  }

  if (!display || typeof display.width !== 'number' || typeof display.height !== 'number') {
    return { valid: false, error: 'Invalid display bounds: width and height must be numbers' };
  }

  if (display.width <= 0 || display.height <= 0) {
    return { valid: false, error: `Display bounds width and height must be positive, got ${display.width}x${display.height}` };
  }

  if (!Number.isFinite(display.x) || !Number.isFinite(display.y)) {
    return { valid: false, error: `Display origins must be finite numbers, got (${display.x}, ${display.y})` };
  }

  const captureAspect = capture.width / capture.height;
  const displayAspect = display.width / display.height;
  const aspectDiff = Math.abs(captureAspect - displayAspect) / displayAspect;

  if (aspectDiff > aspectRatioTolerance) {
    return {
      valid: false,
      error: `Capture aspect ratio (${captureAspect.toFixed(3)}) does not match display aspect ratio (${displayAspect.toFixed(3)}) within tolerance`
    };
  }

  return { valid: true, value: undefined };
}

/**
 * Maps a normalized box into capture pixel coordinates.
 */
export function mapToCapturePixels(box: NormalizedBox, capture: CaptureDimensions): Rect {
  const [ymin, xmin, ymax, xmax] = box;
  const x = (xmin / 1000) * capture.width;
  const y = (ymin / 1000) * capture.height;
  const width = ((xmax - xmin) / 1000) * capture.width;
  const height = ((ymax - ymin) / 1000) * capture.height;

  return { x, y, width, height };
}

/**
 * Maps a normalized box into OS display logical coordinates.
 * Supports arbitrary monitor origins (including non-zero or negative origins).
 */
export function mapToDisplayLogical(box: NormalizedBox, display: DisplayBounds): Rect {
  const [ymin, xmin, ymax, xmax] = box;
  const x = display.x + (xmin / 1000) * display.width;
  const y = display.y + (ymin / 1000) * display.height;
  const width = ((xmax - xmin) / 1000) * display.width;
  const height = ((ymax - ymin) / 1000) * display.height;

  return { x, y, width, height };
}

/**
 * Maps display logical coordinates to overlay-local coordinates relative to the overlay window's origin.
 */
export function mapLogicalToOverlay(logicalRect: Rect, overlayOrigin: Point = { x: 0, y: 0 }): Rect {
  return {
    x: logicalRect.x - overlayOrigin.x,
    y: logicalRect.y - overlayOrigin.y,
    width: logicalRect.width,
    height: logicalRect.height
  };
}

/**
 * Full conversion utility: validates input and maps to all coordinate spaces.
 */
export function convertTargetBox(
  rawBox: unknown,
  capture: CaptureDimensions,
  display: DisplayBounds,
  overlayOrigin: Point = { x: display.x, y: display.y }
): CoordinateValidationResult<TargetConversionResult> {
  const boxValidation = validateNormalizedBox(rawBox);
  if (!boxValidation.valid) {
    return boxValidation;
  }

  const layoutValidation = validateCaptureAndDisplay(capture, display);
  if (!layoutValidation.valid) {
    return layoutValidation;
  }

  const box = boxValidation.value;
  const capturePixels = mapToCapturePixels(box, capture);
  const displayLogical = mapToDisplayLogical(box, display);
  const overlayLocal = mapLogicalToOverlay(displayLogical, overlayOrigin);

  return {
    valid: true,
    value: {
      capturePixels,
      displayLogical,
      overlayLocal
    }
  };
}

/**
 * Converts a raw capture pixel rectangle into a normalized bounding box [ymin, xmin, ymax, xmax].
 */
export function pixelRectToNormalizedBox(
  pixelRect: Rect,
  capture: CaptureDimensions
): CoordinateValidationResult<NormalizedBox> {
  if (
    !pixelRect ||
    typeof pixelRect.x !== 'number' ||
    typeof pixelRect.y !== 'number' ||
    typeof pixelRect.width !== 'number' ||
    typeof pixelRect.height !== 'number' ||
    !Number.isFinite(pixelRect.x) ||
    !Number.isFinite(pixelRect.y) ||
    !Number.isFinite(pixelRect.width) ||
    !Number.isFinite(pixelRect.height)
  ) {
    return { valid: false, error: 'Invalid pixel rect: x, y, width, and height must be finite numbers' };
  }

  if (pixelRect.width <= 0 || pixelRect.height <= 0) {
    return { valid: false, error: `Pixel rect dimensions must be positive, got ${pixelRect.width}x${pixelRect.height}` };
  }

  if (!capture || capture.width <= 0 || capture.height <= 0) {
    return { valid: false, error: 'Invalid capture dimensions' };
  }

  const ymin = Math.max(0, Math.min(1000, (pixelRect.y / capture.height) * 1000));
  const xmin = Math.max(0, Math.min(1000, (pixelRect.x / capture.width) * 1000));
  const ymax = Math.max(0, Math.min(1000, ((pixelRect.y + pixelRect.height) / capture.height) * 1000));
  const xmax = Math.max(0, Math.min(1000, ((pixelRect.x + pixelRect.width) / capture.width) * 1000));

  return validateNormalizedBox([ymin, xmin, ymax, xmax]);
}

/**
 * Converts a capture pixel rectangle directly into capture pixels, display logical, and overlay local coordinates.
 */
export function convertCapturePixelRect(
  pixelRect: Rect,
  capture: CaptureDimensions,
  display: DisplayBounds,
  overlayOrigin: Point = { x: display.x, y: display.y }
): CoordinateValidationResult<TargetConversionResult> {
  const normResult = pixelRectToNormalizedBox(pixelRect, capture);
  if (!normResult.valid) {
    return normResult;
  }
  return convertTargetBox(normResult.value, capture, display, overlayOrigin);
}
