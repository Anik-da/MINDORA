/**
 * MINDORA - OCR Candidate Extraction & Grounding Module
 * 
 * Extracts recognizable text controls from a screen capture, filters them to the
 * active LibreOffice Calc window bounds, and assigns capture-unique candidate IDs (c_1, c_2, ...).
 * 
 * Provides the grounding basis for Gemini:
 * - Gemini selects an existing candidate ID instead of guessing coordinates.
 * - The overlay highlight geometry is retrieved exclusively from the selected candidate's
 *   actual OCR pixel box.
 */

import { Worker } from 'tesseract.js';
import { getTesseractWorker } from './target-resolver.js';
import { isBoxWithinWindow, WindowBounds } from './window-scoping.js';
import { NormalizedBox } from '../shared/coordinates.js';

export interface OcrCandidate {
  id: string;
  text: string;
  confidence: number;
  pixelBbox: { x: number; y: number; width: number; height: number };
  normalizedBox: NormalizedBox;
}

export interface CandidateExtractionResult {
  candidates: OcrCandidate[];
  candidateMap: Map<string, OcrCandidate>;
  durationMs: number;
}

/**
 * Extracts candidate text controls from an in-memory image buffer.
 */
export async function extractOcrCandidates(
  imageBuffer: Buffer,
  windowBounds?: WindowBounds,
  scaleFactor = 1.25,
  minConfidence = 50
): Promise<CandidateExtractionResult> {
  const startTime = performance.now();
  const worker: Worker = await getTesseractWorker();

  const result = await worker.recognize(imageBuffer, {}, {
    blocks: true,
    tsv: true
  });

  const rawCandidates: Array<{
    text: string;
    confidence: number;
    pixelBbox: { x: number; y: number; width: number; height: number };
  }> = [];

  const pageData = result.data as unknown as { blocks?: any[]; image_width?: number; image_height?: number };
  const imgWidth = pageData.image_width || 2560;
  const imgHeight = pageData.image_height || 1600;

  if (result.data.blocks) {
    for (const block of result.data.blocks) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          for (const word of line.words) {
            const cleanText = word.text.trim();
            // Filter out empty or single punctuation characters
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

            // Window boundary filter
            if (windowBounds && !isBoxWithinWindow(pixelBbox, windowBounds, scaleFactor)) {
              continue;
            }

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

  // Deduplicate and assign stable capture-specific IDs: c_1, c_2, ...
  const candidates: OcrCandidate[] = [];
  const candidateMap = new Map<string, OcrCandidate>();

  let counter = 1;
  for (const raw of rawCandidates) {
    const id = `c_${counter++}`;
    const ymin = Math.round((raw.pixelBbox.y / imgHeight) * 1000);
    const xmin = Math.round((raw.pixelBbox.x / imgWidth) * 1000);
    const ymax = Math.round(((raw.pixelBbox.y + raw.pixelBbox.height) / imgHeight) * 1000);
    const xmax = Math.round(((raw.pixelBbox.x + raw.pixelBbox.width) / imgWidth) * 1000);

    const candidate: OcrCandidate = {
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
    durationMs: performance.now() - startTime
  };
}
