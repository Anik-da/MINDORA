import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createWorker } from 'tesseract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const cacheDir = path.resolve(projectRoot, '.cache', 'tesseract');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

const imagePath = path.resolve(projectRoot, 'captures', 'calc-test.png');
if (!fs.existsSync(imagePath)) {
  console.error(`[ERROR] Image not found at: ${imagePath}`);
  process.exit(1);
}

const TARGET_LABELS = ['Insert', 'Format', 'Styles', 'Sheet'];

console.log('=== Local Tesseract.js OCR Diagnostic Benchmark ===');
console.log(`Image: ${imagePath}`);
console.log(`Cache: ${cacheDir}`);

async function run() {
  // 1. Worker 1 Cold Initialization
  console.log('\n[1/4] Initializing Worker 1 (Cold)...');
  const t0_init1 = performance.now();
  const worker1 = await createWorker('eng', 1, {
    cachePath: cacheDir
  });
  const t_init1 = performance.now() - t0_init1;
  console.log(`Worker 1 cold initialization: ${t_init1.toFixed(1)} ms`);

  // 2. Three Sequential Recognition Passes on the Same Warmed Worker
  console.log('\n[2/4] Running 3 recognition passes on warmed worker...');
  
  const t0_rec1 = performance.now();
  const res1 = await worker1.recognize(imagePath, {}, { blocks: true, tsv: true });
  const t_rec1 = performance.now() - t0_rec1;
  console.log(`Pass 1 recognition time: ${t_rec1.toFixed(1)} ms`);

  const t0_rec2 = performance.now();
  await worker1.recognize(imagePath, {}, { blocks: true, tsv: true });
  const t_rec2 = performance.now() - t0_rec2;
  console.log(`Pass 2 recognition time: ${t_rec2.toFixed(1)} ms`);

  const t0_rec3 = performance.now();
  await worker1.recognize(imagePath, {}, { blocks: true, tsv: true });
  const t_rec3 = performance.now() - t0_rec3;
  console.log(`Pass 3 recognition time: ${t_rec3.toFixed(1)} ms`);

  // 3. Extract word-level bounding boxes from blocks
  console.log('\n[3/4] Extracting word-level positions from blocks...');
  const allWords = [];
  res1.data.blocks?.forEach(block => {
    block.paragraphs?.forEach(para => {
      para.lines?.forEach(line => {
        line.words?.forEach(word => {
          allWords.push(word);
        });
      });
    });
  });
  console.log(`Total words recognized: ${allWords.length}`);

  const detections = {};
  for (const target of TARGET_LABELS) {
    const targetLower = target.toLowerCase();
    const matched = allWords.filter(w => {
      const clean = w.text.trim().toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
      return clean === targetLower;
    });

    if (matched.length === 1) {
      const w = matched[0];
      detections[target] = {
        status: 'resolved',
        recognizedText: w.text,
        confidence: w.confidence,
        pixelRect: {
          x: w.bbox.x0,
          y: w.bbox.y0,
          width: w.bbox.x1 - w.bbox.x0,
          height: w.bbox.y1 - w.bbox.y0
        },
        bbox: w.bbox
      };
    } else if (matched.length > 1) {
      detections[target] = {
        status: 'ambiguous',
        count: matched.length,
        matches: matched.map(m => ({ text: m.text, confidence: m.confidence, bbox: m.bbox }))
      };
    } else {
      detections[target] = {
        status: 'unresolved',
        reason: 'No conservative match found'
      };
    }
  }

  console.log('\nTarget Label Detections:');
  console.log(JSON.stringify(detections, null, 2));

  // 4. Test Worker 2 Initialization from Cached Assets (Local Offline Operation)
  console.log('\n[4/4] Testing Worker 2 initialization from cached assets...');
  const t0_init2 = performance.now();
  const worker2 = await createWorker('eng', 1, {
    cachePath: cacheDir
  });
  const t_init2 = performance.now() - t0_init2;
  console.log(`Worker 2 cached initialization: ${t_init2.toFixed(1)} ms`);

  // Clean up workers
  await worker1.terminate();
  await worker2.terminate();

  const results = {
    image: {
      path: imagePath,
      width: 2557,
      height: 1536
    },
    timings: {
      workerColdInitMs: t_init1,
      workerCachedInitMs: t_init2,
      recPass1Ms: t_rec1,
      recPass2Ms: t_rec2,
      recPass3Ms: t_rec3
    },
    detections
  };

  const outPath = path.resolve(projectRoot, 'captures', 'ocr-diagnostic-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nDiagnostic results saved to: ${outPath}`);
}

run().catch(err => {
  console.error('OCR Diagnostic Error:', err);
  process.exit(1);
});
