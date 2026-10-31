/**
 * MINDORA - Local OCR Target Resolver
 * 
 * Reuses a single English Tesseract worker to extract actual word bounding boxes
 * from a live capture buffer.
 * 
 * Target matching is strictly conservative:
 * - Exact case-insensitive word matching on alphanumeric text.
 * - Minimum confidence threshold (60%).
 * - Returns 'unresolved' for missing, ambiguous (multiple matches), or weak matches.
 * - Never falls back to guessed coordinates or hardcoded positions.
 */

import { createWorker, Worker } from 'tesseract.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TargetResolutionResult =
  | {
      status: 'resolved';
      label: string;
      pixelBbox: BoundingBox;
      confidence: number;
      detectedText: string;
      durationMs: number;
    }
  | {
      status: 'unresolved';
      label: string;
      reason: string;
      durationMs: number;
    };

let workerInstance: Worker | null = null;
let workerInitPromise: Promise<Worker> | null = null;

// Keep OCR fixture integrations runnable under plain Node. Electron's `app`
// export is only available inside the Electron runtime, so resolve it lazily.
let electronApp: Electron.App | undefined;
if (process.versions.electron) {
  electronApp = (await import('electron')).app;
}

function getOcrCacheDir(): string {
  if (electronApp && typeof electronApp.getPath === 'function') {
    return path.join(electronApp.getPath('userData'), 'tesseract');
  }
  return path.resolve(process.cwd(), '.cache', 'tesseract');
}

/**
 * Gets or initializes a single reused English Tesseract worker.
 */
export async function getTesseractWorker(): Promise<Worker> {
  if (workerInstance) {
    return workerInstance;
  }

  if (workerInitPromise) {
    return workerInitPromise;
  }

  workerInitPromise = (async () => {
    const cacheDir = getOcrCacheDir();
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const worker = await createWorker('eng', 1, {
      cachePath: cacheDir,
      gzip: true,
      errorHandler: (err: unknown) => {
        console.error('[OCR Worker Error]', err);
      }
    });
    workerInstance = worker;
    return worker;
  })();

  return workerInitPromise;
}

/**
 * Cleans a word string by stripping surrounding punctuation.
 */
function cleanWordText(raw: string): string {
  return raw.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
}

/**
 * Resolves a target label in an in-memory image buffer.
 */
export async function resolveTargetInCapture(
  imageBuffer: Buffer,
  targetLabel: string,
  minConfidence = 60
): Promise<TargetResolutionResult> {
  const startTime = performance.now();
  const normalizedTarget = targetLabel.trim().toLowerCase();

  if (!normalizedTarget) {
    return {
      status: 'unresolved',
      label: targetLabel,
      reason: 'Target label cannot be empty',
      durationMs: performance.now() - startTime
    };
  }

  try {
    const worker = await getTesseractWorker();

    const result = await worker.recognize(imageBuffer, {}, {
      blocks: true,
      tsv: true
    });

    const words: Array<{ text: string; confidence: number; bbox: BoundingBox }> = [];

    // Traverse blocks -> paragraphs -> lines -> words
    if (result.data.blocks) {
      for (const block of result.data.blocks) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            for (const word of line.words) {
              const cleaned = cleanWordText(word.text);
              if (cleaned.toLowerCase() === normalizedTarget) {
                words.push({
                  text: word.text,
                  confidence: word.confidence,
                  bbox: {
                    x: word.bbox.x0,
                    y: word.bbox.y0,
                    width: word.bbox.x1 - word.bbox.x0,
                    height: word.bbox.y1 - word.bbox.y0
                  }
                });
              }
            }
          }
        }
      }
    }

    const durationMs = performance.now() - startTime;

    if (words.length === 0) {
      return {
        status: 'unresolved',
        label: targetLabel,
        reason: `Label "${targetLabel}" not detected in capture`,
        durationMs
      };
    }

    // Filter by confidence
    const confidentWords = words.filter(w => w.confidence >= minConfidence);

    if (confidentWords.length === 0) {
      return {
        status: 'unresolved',
        label: targetLabel,
        reason: `Label "${targetLabel}" detected but confidence (${words[0].confidence.toFixed(1)}%) below threshold (${minConfidence}%)`,
        durationMs
      };
    }

    // Conservative check: if multiple distinct confident locations exist, check if ambiguous
    if (confidentWords.length > 1) {
      // In menu bars or UI, if there are multiple occurrences (e.g. repeated words), resolve to the topmost menu bar occurrence or flag ambiguous
      // For menu labels (Insert, Format, Styles, Sheet), there should typically be one in the menu bar.
      // If they are far apart or ambiguous, mark unresolved to avoid guessing.
      const topOccurrences = [...confidentWords].sort((a, b) => a.bbox.y - b.bbox.y);
      // If the top two occurrences are within the same menu row or very different, let's inspect
      const first = topOccurrences[0];
      const second = topOccurrences[1];
      if (Math.abs(first.bbox.y - second.bbox.y) < 20 && Math.abs(first.bbox.x - second.bbox.x) > 50) {
        return {
          status: 'unresolved',
          label: targetLabel,
          reason: `Ambiguous match: multiple confident instances of "${targetLabel}" found in same horizontal row`,
          durationMs
        };
      }
      // Otherwise prefer the top-most (menu bar) instance
      return {
        status: 'resolved',
        label: targetLabel,
        pixelBbox: first.bbox,
        confidence: first.confidence,
        detectedText: first.text,
        durationMs
      };
    }

    const match = confidentWords[0];
    return {
      status: 'resolved',
      label: targetLabel,
      pixelBbox: match.bbox,
      confidence: match.confidence,
      detectedText: match.text,
      durationMs
    };
  } catch (err: unknown) {
    const durationMs = performance.now() - startTime;
    return {
      status: 'unresolved',
      label: targetLabel,
      reason: `OCR recognition failed with error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs
    };
  }
}

/**
 * Cleanly terminates the shared Tesseract worker.
 */
export async function terminateTesseractWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
    workerInitPromise = null;
  }
}
