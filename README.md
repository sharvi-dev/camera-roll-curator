# Camera Roll Curator

On-device photo curation pipeline for iOS built with Expo SDK 54 + React Native. Pick a date range, and the app scores your entire camera roll and picks the best 1–10 shots for a photo dump — no backend, no API calls, everything runs on-device.

## How it works

1. **Fetch** — pulls all photos in the selected date range from your camera roll via `expo-media-library`
2. **Score** — resizes each photo to 180×180 and decodes JPEG pixels with `jpeg-js`, then computes:
   - **Sharpness** — Laplacian variance
   - **Exposure** — luminance histogram spread
   - **Composition** — Sobel edge energy weighted by rule-of-thirds intersections
   - **Colorfulness** — HSV saturation variance
3. **Deduplicate** — groups burst shots into 5-minute clusters and keeps only the top scorer per cluster
4. **Balance** — splits picks between people and scenery using a skin-tone HSV heuristic
5. **Cohesion** — penalises photos whose dominant hue deviates >80° from the selection median to keep the dump visually consistent
6. **Output** — returns up to 10 ranked picks with a swipeable cover carousel

## Features

- Date range picker with quick presets (7 days, 30 days, 3 months)
- Adjustable photo count (1–10)
- People/scenery ratio control
- Swipeable cover photo carousel — pick your favourite as the lead
- Long-press any selected photo to swap it with a rejected one
- Dark theme throughout

## Tech stack

- Expo SDK 54, React Native 0.81.5
- TypeScript (strict)
- expo-router (file-based routing)
- expo-media-library, expo-image-manipulator, expo-haptics, expo-sharing
- jpeg-js (pure-JS JPEG decoder for pixel analysis)
- No backend. No AI API. No persistent storage.

## Getting started

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go on your iPhone.

## Project structure

```
app/
  _layout.tsx         root layout
  index.tsx           single screen
hooks/
  useCuration.ts      all state + pipeline orchestration
services/
  photoLibrary.ts     expo-media-library wrapper
  photoScorer.ts      scoring + curation logic
types/
  index.ts            shared TypeScript types
```

## License

MIT
