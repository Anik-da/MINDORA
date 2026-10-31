/**
 * MINDORA Web - Reused OCR Extraction & Candidate Grounding Service
 * 
 * Reuses a single English Tesseract worker for the web server with controlled concurrency:
 * - Never spawns uncontrolled workers per upload.
 * - Concurrency queue ensures 1 OCR task executes at a time.
 * - Extracts visible words, assigns stable candidate IDs (c_1, c_2, ...).
 * - Computes normalized bounding boxes [ymin, xmin, ymax, xmax] in [0, 1000].
 * - Clean termination for graceful server shutdown.
 */

import { createWorker, Worker } from 'tesseract.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { NormalizedBox } from '../shared/coordinates.js';

export interface WebOcrCandidate {
  id: string;
  text: string;
  confidence: number;
  pixelBbox: { x: number; y: number; width: number; height: number };
  normalizedBox: NormalizedBox;
}

export interface WebCandidateExtractionResult {
  candidates: WebOcrCandidate[];
  candidateMap: Map<string, WebOcrCandidate>;
  imgWidth: number;
  imgHeight: number;
  durationMs: number;
}

let workerInstance: Worker | null = null;
let workerInitPromise: Promise<Worker> | null = null;

// Concurrency mutex queue: ensure only 1 OCR run at a time
let ocrQueue: Promise<any> = Promise.resolve();

const CACHE_DIR = path.resolve(process.cwd(), '.cache', 'tesseract');

/**
 * Gets or initializes a single reused English Tesseract worker.
 */
export async function getWebOcrWorker(): Promise<Worker> {
  if (workerInstance) {
    return workerInstance;
  }

  if (workerInitPromise) {
    return workerInitPromise;
  }

  workerInitPromise = (async () => {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const worker = await createWorker('eng', 1, {
      cachePath: CACHE_DIR,
      gzip: true,
      errorHandler: (err: unknown) => {
        console.error('[Web OCR Worker Error]', err);
      }
    });
    workerInstance = worker;
    return worker;
  })();

  return workerInitPromise;
}

/**
 * Queues and executes OCR candidate extraction on an in-memory image buffer.
 */
export async function extractCandidatesFromBuffer(
  imageBuffer: Buffer,
  imgWidthHint?: number,
  imgHeightHint?: number,
  minConfidence = 50
): Promise<WebCandidateExtractionResult> {
  // Queue through mutex
  return new Promise<WebCandidateExtractionResult>((resolve, reject) => {
    ocrQueue = ocrQueue.then(async () => {
      try {
        const result = await runOcrExtraction(imageBuffer, imgWidthHint, imgHeightHint, minConfidence);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function runOcrExtraction(
  imageBuffer: Buffer,
  imgWidthHint?: number,
  imgHeightHint?: number,
  minConfidence = 50
): Promise<WebCandidateExtractionResult> {
  const startTime = performance.now();
  const worker = await getWebOcrWorker();

  const result = await worker.recognize(imageBuffer, {}, {
    blocks: true,
    tsv: true
  });

  const pageData = result.data as unknown as { blocks?: any[]; image_width?: number; image_height?: number };
  const imgWidth = pageData.image_width || imgWidthHint || 1920;
  const imgHeight = pageData.image_height || imgHeightHint || 1080;

  const rawCandidates: Array<{
    text: string;
    confidence: number;
    pixelBbox: { x: number; y: number; width: number; height: number };
  }> = [];

  if (result.data.blocks) {
    for (const block of result.data.blocks) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          for (const word of line.words) {
            const cleanText = word.text.trim();
            if (cleanText.length === 0 || /^[^a-zA-Z0-9]+$/.test(cleanText)) {
              continue;
            }

            if (word.confidence < minConfidence) {
              continue;
            }

            const pixelBbox = {
              x: word.bbox.x0,
              y: word.bbox.y0,
              width: word.bbox.x1 - word.bbox.x0,
              height: word.bbox.y1 - word.bbox.y0
            };

            rawCandidates.push({
              text: cleanText,
              confidence: word.confidence,
              pixelBbox
            });
          }
        }
      }
    }
  }

  // Deduplicate and assign stable candidate IDs: c_1, c_2, ...
  const candidates: WebOcrCandidate[] = [];
  const candidateMap = new Map<string, WebOcrCandidate>();

  let counter = 1;
  for (const raw of rawCandidates) {
    const id = `c_${counter++}`;
    const ymin = Math.max(0, Math.min(1000, Math.round((raw.pixelBbox.y / imgHeight) * 1000)));
    const xmin = Math.max(0, Math.min(1000, Math.round((raw.pixelBbox.x / imgWidth) * 1000)));
    const ymax = Math.max(0, Math.min(1000, Math.round(((raw.pixelBbox.y + raw.pixelBbox.height) / imgHeight) * 1000)));
    const xmax = Math.max(0, Math.min(1000, Math.round(((raw.pixelBbox.x + raw.pixelBbox.width) / imgWidth) * 1000)));

    const candidate: WebOcrCandidate = {
      id,
      text: raw.text,
      confidence: raw.confidence,
      pixelBbox: raw.pixelBbox,
      normalizedBox: [ymin, xmin, ymax, xmax]
    };

    candidates.push(candidate);
    candidateMap.set(id, candidate);
  }

  return {
    candidates,
    candidateMap,
    imgWidth,
    imgHeight,
    durationMs: performance.now() - startTime
  };
}

/**
 * Cleanly terminates the shared OCR worker.
 */
export async function terminateWebOcrWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
    workerInitPromise = null;
  }
}
