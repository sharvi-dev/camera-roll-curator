import * as ImageManipulator from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';
import { CurationOptions, Photo, PhotoCategory, PhotoScore } from '../types';

// ─── Pixel helpers ───────────────────────────────────────────────────────────

interface PixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

async function getPixels(uri: string): Promise<PixelData> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 180, height: 180 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );

  const b64 = result.base64;
  if (!b64) throw new Error(`No base64 output for ${uri}`);

  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const decoded = jpeg.decode(bytes, { useTArray: true });
  return {
    data: new Uint8ClampedArray(decoded.data.buffer),
    width: decoded.width,
    height: decoded.height,
  };
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;

  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = h * 60;
    if (h < 0) h += 360;
  }

  return [h, s, v];
}

// ─── Individual metrics ──────────────────────────────────────────────────────

function computeSharpness(px: PixelData): number {
  const { data, width, height } = px;
  const gray = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  let sumSq = 0;
  let sum = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const c = gray[y * width + x];
      const n = gray[(y - 1) * width + x];
      const s = gray[(y + 1) * width + x];
      const e = gray[y * width + (x + 1)];
      const w = gray[y * width + (x - 1)];
      const lap = 4 * c - n - s - e - w;
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  // Typical blurry: variance ~50-200; sharp: ~1000-8000
  return Math.min(100, Math.round(Math.sqrt(Math.max(0, variance)) / 8));
}

function computeExposure(px: PixelData): number {
  const { data, width, height } = px;
  const pixelCount = width * height;
  const hist = new Uint32Array(256);

  for (let i = 0; i < pixelCount; i++) {
    const lum = Math.round(
      0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2],
    );
    hist[lum]++;
  }

  let lumSum = 0;
  for (let i = 0; i < 256; i++) lumSum += i * hist[i];
  const mean = lumSum / pixelCount;

  let varSum = 0;
  for (let i = 0; i < 256; i++) varSum += hist[i] * (i - mean) ** 2;
  const stddev = Math.sqrt(varSum / pixelCount);

  // Well-exposed: mean ~128, high contrast (stddev ~60+)
  const meanScore = 1 - Math.abs(mean - 128) / 128;
  const spreadScore = Math.min(1, stddev / 64);
  return Math.round((meanScore * 0.45 + spreadScore * 0.55) * 100);
}

function computeComposition(px: PixelData): number {
  const { data, width, height } = px;
  const gray = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // Rule-of-thirds intersection points (normalised coords)
  const rotPts = [
    { x: 1 / 3, y: 1 / 3 },
    { x: 2 / 3, y: 1 / 3 },
    { x: 1 / 3, y: 2 / 3 },
    { x: 2 / 3, y: 2 / 3 },
  ];

  let weightedEdge = 0;
  let totalEdge = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        -gray[(y - 1) * width + (x - 1)] +
        gray[(y - 1) * width + (x + 1)] -
        2 * gray[y * width + (x - 1)] +
        2 * gray[y * width + (x + 1)] -
        gray[(y + 1) * width + (x - 1)] +
        gray[(y + 1) * width + (x + 1)];
      const gy =
        -gray[(y - 1) * width + (x - 1)] -
        2 * gray[(y - 1) * width + x] -
        gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] +
        2 * gray[(y + 1) * width + x] +
        gray[(y + 1) * width + (x + 1)];
      const edge = Math.sqrt(gx * gx + gy * gy);

      const nx = x / width;
      const ny = y / height;
      let minDist = Infinity;
      for (const pt of rotPts) {
        const d = Math.sqrt((nx - pt.x) ** 2 + (ny - pt.y) ** 2);
        if (d < minDist) minDist = d;
      }
      // Proximity weight: 1 at point, 0 at 0.28+ units away
      const weight = Math.max(0, 1 - minDist / 0.28);

      weightedEdge += edge * weight;
      totalEdge += edge;
    }
  }

  if (totalEdge < 1) return 50;
  const ratio = weightedEdge / totalEdge;
  return Math.min(100, Math.round(ratio * 350));
}

function computeColorfulness(px: PixelData): number {
  const { data, width, height } = px;
  const pixelCount = width * height;
  let satSum = 0;
  let satSumSq = 0;

  for (let i = 0; i < pixelCount; i++) {
    const [, s] = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    satSum += s;
    satSumSq += s * s;
  }

  const mean = satSum / pixelCount;
  const variance = satSumSq / pixelCount - mean * mean;
  // Combine mean saturation and its spread
  return Math.round(Math.min(100, (mean * 0.65 + Math.sqrt(Math.max(0, variance)) * 0.35) * 100));
}

function computeDominantHue(px: PixelData): number {
  const { data, width, height } = px;
  const pixelCount = width * height;
  // 36 bins × 10° each
  const hueHist = new Float32Array(36);

  for (let i = 0; i < pixelCount; i++) {
    const [h, s, v] = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (s > 0.2 && v > 0.2) {
      const bin = Math.min(35, Math.floor(h / 10));
      hueHist[bin] += s; // weight by saturation
    }
  }

  let maxBin = 0;
  let maxVal = 0;
  for (let i = 0; i < 36; i++) {
    if (hueHist[i] > maxVal) {
      maxVal = hueHist[i];
      maxBin = i;
    }
  }

  return maxBin * 10 + 5;
}

// ─── Per-photo analysis ──────────────────────────────────────────────────────

function computeScore(px: PixelData): PhotoScore {
  const sharpness = computeSharpness(px);
  const exposure = computeExposure(px);
  const composition = computeComposition(px);
  const colorfulness = computeColorfulness(px);
  const dominantHue = computeDominantHue(px);

  const total = Math.round(
    sharpness * 0.3 + exposure * 0.25 + composition * 0.25 + colorfulness * 0.2,
  );

  return {
    total,
    sharpness,
    exposure,
    composition,
    colorfulness,
    uniqueness: 50, // refined during cluster step
    dominantHue,
  };
}

function detectCategoryFromPixels(px: PixelData): PhotoCategory {
  const { data, width, height } = px;
  const pixelCount = width * height;
  let skinCount = 0;

  for (let i = 0; i < pixelCount; i++) {
    const [h, s, v] = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    // Skin-tone HSV range
    if (h >= 0 && h <= 50 && s >= 0.15 && s <= 0.85 && v >= 0.3) {
      skinCount++;
    }
  }

  return skinCount / pixelCount > 0.08 ? 'people' : 'scenery';
}

// ─── Cluster utilities ───────────────────────────────────────────────────────

const CLUSTER_WINDOW_MS = 5 * 60 * 1000;

function clusterByTime(photos: Photo[]): Photo[] {
  return photos.map((photo) => ({
    ...photo,
    clusterKey: String(Math.floor(photo.creationTime / CLUSTER_WINDOW_MS)),
  }));
}

function pickBestPerCluster(photos: Photo[]): Photo[] {
  const best = new Map<string, Photo>();

  for (const photo of photos) {
    const key = photo.clusterKey ?? photo.id;
    const existing = best.get(key);
    if (!existing || (photo.score?.total ?? 0) > (existing.score?.total ?? 0)) {
      best.set(key, photo);
    }
  }

  // Assign uniqueness based on how many photos competed in the cluster
  const clusterSizes = new Map<string, number>();
  for (const photo of photos) {
    const key = photo.clusterKey ?? photo.id;
    clusterSizes.set(key, (clusterSizes.get(key) ?? 0) + 1);
  }

  return Array.from(best.values()).map((photo) => {
    const size = clusterSizes.get(photo.clusterKey ?? photo.id) ?? 1;
    const uniqueness = Math.round(Math.min(100, 100 / size));
    return photo.score
      ? { ...photo, score: { ...photo.score, uniqueness } }
      : photo;
  });
}

// ─── Cohesion helpers ────────────────────────────────────────────────────────

function circularDiff(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function medianHue(hues: number[]): number {
  if (hues.length === 0) return 180;
  const sorted = [...hues].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function applyCohesionFilter(photos: Photo[]): Photo[] {
  const hues = photos.map((p) => p.score?.dominantHue ?? 180);
  const pivot = medianHue(hues);

  return photos.map((photo) => {
    if (!photo.score) return photo;
    const diff = circularDiff(photo.score.dominantHue, pivot);
    if (diff > 80) {
      return {
        ...photo,
        score: { ...photo.score, total: Math.max(0, photo.score.total - 10) },
      };
    }
    return photo;
  });
}

// ─── Main export ─────────────────────────────────────────────────────────────

const BATCH_SIZE = 8;

export async function curateSelection(
  photos: Photo[],
  options: CurationOptions,
  onProgress: (progress: number, label: string) => void,
): Promise<{
  selected: Photo[];
  coverCandidates: Photo[];
  rejected: Photo[];
  paletteHues: number[];
}> {
  const total = photos.length;
  const scored: Photo[] = [];

  // Steps 1 & 2 — score + categorise concurrently in batches
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = photos.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (photo) => {
        const px = await getPixels(photo.uri);
        return {
          ...photo,
          score: computeScore(px),
          category: detectCategoryFromPixels(px),
        };
      }),
    );
    scored.push(...results);
    onProgress(
      Math.round((scored.length / total) * 60),
      `Analyzing ${scored.length} of ${total} photos…`,
    );
  }

  // Step 3 — cluster by time
  onProgress(62, 'Grouping burst shots…');
  const clustered = clusterByTime(scored);

  // Step 4 — keep best per cluster
  onProgress(68, 'Removing duplicates…');
  const deduped = pickBestPerCluster(clustered);

  // Step 5 — people / scenery split to hit ratio target
  onProgress(74, 'Balancing people and scenery…');
  const target = Math.min(options.maxCount, deduped.length);
  const peopleTarget = Math.round(target * options.peopleSceneryRatio);
  const sceneryTarget = target - peopleTarget;

  const people = deduped
    .filter((p) => p.category === 'people')
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
  const scenery = deduped
    .filter((p) => p.category !== 'people')
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));

  let preSelected = [
    ...people.slice(0, peopleTarget),
    ...scenery.slice(0, sceneryTarget),
  ];

  // Fill shortfall from whichever pool has leftovers
  if (preSelected.length < target) {
    const usedIds = new Set(preSelected.map((p) => p.id));
    const overflow = deduped
      .filter((p) => !usedIds.has(p.id))
      .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
    preSelected = [...preSelected, ...overflow.slice(0, target - preSelected.length)];
  }

  // Step 6 — palette cohesion penalty
  onProgress(82, 'Checking visual cohesion…');
  const cohesionApplied = applyCohesionFilter(preSelected).sort(
    (a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0),
  );

  // Step 7 — final selection
  onProgress(90, 'Finalising your dump…');
  const selected = cohesionApplied.slice(0, target);
  const selectedIds = new Set(selected.map((p) => p.id));
  const rejected = deduped.filter((p) => !selectedIds.has(p.id));
  const coverCandidates = selected.slice(0, Math.min(5, selected.length));

  const paletteHues = Array.from(
    new Set(selected.map((p) => p.score?.dominantHue ?? 0)),
  );

  onProgress(100, 'Done!');
  return { selected, coverCandidates, rejected, paletteHues };
}
