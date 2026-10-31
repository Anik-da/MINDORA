/**
 * MINDORA Web - Image Validation & Dimension Inspection Module
 * 
 * Validates screenshot upload buffers without heavy dependencies:
 * - Detects PNG and JPEG magic bytes.
 * - Extracts physical pixel dimensions (width x height) from binary headers.
 * - Enforces minimum and maximum dimension bounds (e.g. 200 to 4096 px).
 * - Enforces payload size limits (max 8 MiB).
 * - Rejects non-image, corrupted, or SVG/executable inputs.
 */

export interface ImageValidationResult {
  valid: boolean;
  mimeType?: 'image/png' | 'image/jpeg';
  width?: number;
  height?: number;
  sizeBytes: number;
  error?: string;
}

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MiB
const MIN_IMAGE_SIZE_BYTES = 100;
const MIN_DIMENSION = 200;
const MAX_DIMENSION = 4096;

/**
 * Validates an image buffer and extracts its dimensions.
 */
export function validateImageBuffer(buffer: Buffer): ImageValidationResult {
  const sizeBytes = buffer.length;

  if (sizeBytes < MIN_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      sizeBytes,
      error: 'Image file is too small or empty (minimum 100 bytes).'
    };
  }

  if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      sizeBytes,
      error: `Image file exceeds maximum allowed size of 8 MiB (got ${(sizeBytes / (1024 * 1024)).toFixed(2)} MiB).`
    };
  }

  // Check PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  if (isPng) {
    // In PNG, IHDR begins at byte 12. Width is at 16..19, Height is at 20..23 (big endian).
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
      return {
        valid: false,
        sizeBytes,
        error: `Screenshot dimensions too small (${width}x${height}). Minimum is ${MIN_DIMENSION}x${MIN_DIMENSION}px.`
      };
    }

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      return {
        valid: false,
        sizeBytes,
        error: `Screenshot dimensions too large (${width}x${height}). Maximum is ${MAX_DIMENSION}x${MAX_DIMENSION}px.`
      };
    }

    return {
      valid: true,
      mimeType: 'image/png',
      width,
      height,
      sizeBytes
    };
  }

  // Check JPEG magic bytes: FF D8 FF
  const isJpeg =
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  if (isJpeg) {
    const dimensions = parseJpegDimensions(buffer);
    if (!dimensions) {
      return {
        valid: false,
        sizeBytes,
        error: 'Invalid or corrupt JPEG screenshot header.'
      };
    }

    const { width, height } = dimensions;

    if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
      return {
        valid: false,
        sizeBytes,
        error: `Screenshot dimensions too small (${width}x${height}). Minimum is ${MIN_DIMENSION}x${MIN_DIMENSION}px.`
      };
    }

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      return {
        valid: false,
        sizeBytes,
        error: `Screenshot dimensions too large (${width}x${height}). Maximum is ${MAX_DIMENSION}x${MAX_DIMENSION}px.`
      };
    }

    return {
      valid: true,
      mimeType: 'image/jpeg',
      width,
      height,
      sizeBytes
    };
  }

  return {
    valid: false,
    sizeBytes,
    error: 'Unsupported image format. Please upload a PNG or JPEG screenshot.'
  };
}

/**
 * Scans JPEG chunks for SOF (Start of Frame) marker to extract dimensions.
 */
function parseJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2; // Skip SOI (FF D8)

  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = buffer[offset + 1];

    // SOF0 (0xC0) or SOF2 (0xC2)
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      // Chunk format: 2 bytes length, 1 byte precision, 2 bytes height, 2 bytes width
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }

    // Skip to next chunk
    if (marker === 0xd9 || marker === 0xda) {
      // End of image or start of scan
      break;
    }

    const chunkLength = buffer.readUInt16BE(offset + 2);
    offset += 2 + chunkLength;
  }

  return null;
}
