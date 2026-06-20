export type PhotoCategory = 'people' | 'scenery' | 'food' | 'other';

export interface PhotoScore {
  total: number;
  sharpness: number;
  exposure: number;
  composition: number;
  colorfulness: number;
  uniqueness: number;
  dominantHue: number; // 0–360
}

export interface Photo {
  id: string;
  uri: string;
  filename: string;
  creationTime: number; // ms since epoch
  width: number;
  height: number;
  score?: PhotoScore;
  category?: PhotoCategory;
  clusterKey?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
  label?: string;
}

export interface CurationOptions {
  dateRange: DateRange;
  maxCount: number; // 1–10
  peopleSceneryRatio: number; // 0.0–1.0, fraction that should be "people"
}

export interface CurationResult {
  selected: Photo[];
  coverCandidates: Photo[]; // top 5 for the cover carousel
  coverIndex: number; // which candidate is currently active
  rejected: Photo[];
  totalAnalyzed: number;
  options: CurationOptions;
  paletteHues: number[];
}

export type CurationStatus =
  | 'idle'
  | 'requesting'
  | 'fetching'
  | 'scoring'
  | 'done'
  | 'error';
