# Photo Dump Curator

Expo SDK 51 / React Native 0.74 app (TypeScript strict) that curates a camera roll date range
into the best 1–10 photos for an Instagram photo dump. Everything runs on-device.

## Commands

```bash
npm install                                    # install deps
npx expo start                                 # Metro bundler + dev server
npx expo start --ios                           # open iOS simulator directly
eas build --platform ios --profile preview     # build for TestFlight
eas submit --platform ios                      # submit to App Store
```

## Project layout

```
app/
  _layout.tsx       expo-router root layout (dark, no header)
  index.tsx         single screen — renders setup or results
hooks/
  useCuration.ts    all state, orchestrates the pipeline
services/
  photoLibrary.ts   expo-media-library wrapper (pure functions)
  photoScorer.ts    pixel analysis + curation logic (pure functions)
types/
  index.ts          shared TypeScript interfaces
```

## Architecture rules

- **Services are pure functions** — no React, no hooks.
- **useCuration owns all state** — the screen just calls the hook and renders.
- **No new files** — this project is intentionally small. Add a file only if it
  genuinely cannot live in an existing one.
- **No `any`** — model every type explicitly.

## Scoring weights (do not change without visual testing across 50+ photos)

sharpness 0.30 · exposure 0.25 · composition 0.25 · colorfulness 0.20

## Pixel analysis

All image analysis goes through `getPixels(uri)` in `photoScorer.ts`:
resize to 180×180 JPEG via expo-image-manipulator → decode base64 → Uint8Array →
jpeg-js decode → Uint8ClampedArray RGBA. Never analyse full-resolution images.

## Scoring pipeline order (do not reorder)

1. scorePhoto + detectCategory (concurrent, batches of 8)
2. clusterByTime (5-minute windows)
3. pickBestPerCluster (dedup burst shots)
4. People/scenery split to hit peopleSceneryRatio
5. applyCohesionFilter (−10 pts if dominantHue differs >80° from median)
6. Final sort → select top N → coverCandidates = top 5

## What not to do

- Do not add a backend or call any external API.
- Do not use AsyncStorage — the app is stateless between sessions.
- Do not add React Navigation — expo-router handles routing.
- Do not use `StyleSheet.absoluteFill` — use `StyleSheet.absoluteFillObject`.
- Do not render full-res images in the grid.
- Do not add Redux, Zustand, or any state library.
