# Photo Feature Implementation Tasks

Based on the photo-feature-audit.md, implement the following tasks in order of priority.

## High Priority Backend Changes

### Photo Cleanup Service
- [ ] Add fast/slow quality mode toggle for retailers
- [ ] Pre-warm Python pipeline to reduce cold-start latency
- [ ] Improve local dev fallback error handling (currently just a warning)

### Virtual Try-On
- [ ] Add GPU detection on V-Tone box with auto-fallback
- [ ] Implement exponential backoff polling (2s → 4s → 8s → 16s max)
- [ ] Add 24-hour expiration countdown timer in TryOnModal UI

### AI Studio Shoots (F-032 Phase A)
- [ ] Optimize polling with adaptive backoff: 1s × 10 polls, then 3s → 5s → 10s → 15s
- [ ] Add progress percentage and ETA to Redis job status
- [ ] Track BFL credit consumption per generation in job metadata
- [ ] Add image size validation (<20MB, <20MP) before BFL submit

## Medium Priority UI Improvements

### Product Gallery
- [ ] Add lazy loading for non-priority images using IntersectionObserver
- [ ] Add disabled/visual state for SOLD color chips
- [ ] Make aspect ratio responsive instead of fixed 3:4

### All Async Systems
- [ ] Add progress/ETA indicators to polling endpoints
- [ ] Implement credit/metering display for retailers

## Plan Gate Considerations
- [ ] AI Studio Shoots: Growth/Pro only (STARTER → 402)
- [ ] Virtual Try-On: Monthly quota (STARTER=0, GROWTH=100, PRO=500)
- [ ] Photo Cleanup: Already sidecar-separated, no plan gate needed

## Notes
- Start by implementing the high-priority backend changes, then tackle the UI improvements.
- All changes should maintain the "new row preserves old" data pattern already established in the codebase.