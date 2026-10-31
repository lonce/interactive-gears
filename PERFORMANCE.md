# Rendering investigation — 31 October 2026

## Finding

The separate Brave browser reproduced intermittent >=25 ms callback gaps with moving SVG vectors. Replacing each gear's internal vector geometry with a cached PNG image removed those gaps in both measured passes, with the same positions, rotation updates and artwork. The default renderer remains SVG; try `?renderer=bitmap` for the cached renderer.

This strongly implicates the SVG rendering path rather than the gear calculations or clock selection. It does not identify the exact raster, GPU, compositor or OS scheduling operation responsible; a native browser trace would be needed for that distinction.

## Method

Six consecutive 12-second phases in order SVG, bitmap, stationary, bitmap, SVG, stationary. First 1.5 seconds of every phase discarded. Both moving renderers use the same constant shaft speed and existing transform updates, without changing physics settings. Stationary phases skip rotor updates. This isolates the render path; it is not a measurement of the full interactive input/physics workload. The test runs locally and sends no results elsewhere.

Measurements are callback-entry intervals from performance.now(), callback JavaScript work, callback delay relative to rAF timestamp, and PerformanceObserver long tasks/long animation frames where available. Callback intervals are not direct display-presentation measurements. All three SVG gear bodies are kept as the editable source. No software, security, extension or hardware-acceleration settings were changed.

## Brave results, port 8081

Read from the completed diagnostic page through the browser accessibility interface. Window displayed the app at 75% browser zoom. The run completed before subsequent user window interaction. A raw JSON download was not captured because user interaction interrupted attempts to save it.

| Pass | Renderer | Samples | p95 interval ms | Max interval ms | Intervals >=25 ms | Callback work p95 ms | Long tasks |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | SVG | 586 | 22.1 | 28.5 | 14 | 0.2 | 0 |
| 2 | Cached bitmap | 630 | 17.2 | 18.4 | 0 | 0.2 | 0 |
| 3 | Stationary | 630 | 17.7 | 22.2 | 0 | 0.1 | 0 |
| 4 | Cached bitmap | 629 | 17.1 | 19.7 | 0 | 0.2 | 0 |
| 5 | SVG | 599 | 20.0 | 60.6 | 5 | 0.1 | 0 |
| 6 | Stationary | 630 | 17.3 | 20.4 | 0 | 0.0 | 0 |

SVG had 19/1185 intervals >=25 ms (1.60%). Bitmap had 0/1259; stationary had 0/1260. Both moving modes had callback work p95 <=0.2 ms. The repeated SVG-versus-bitmap difference supports using cached gear images. These short samples cannot guarantee the absence of occasional future stalls or rule out all browser/system contributors.

## In-app browser control

Raw results: `render-report-iab.json`, Chrome/156, 428 × 806 CSS pixels at device pixel ratio 2. This smaller view gave noisy results: SVG had 0 and 28 intervals >=25 ms; bitmap had 5 and 5; stationary had 0 and 17. One bitmap phase had a 187.4 ms interval and a long-animation-frame entry with no attributed scripts. No long tasks were recorded. That run alone could not isolate the cause, and it does not establish behavior in the separate Brave browser.

## Reproduce

Open `http://localhost:8081/?diagnostics=1`, click **Run comparison**, keep the tab visible and do not resize/interact for 72 seconds. **Save diagnostic report** downloads raw data. The normal SVG renderer and controls are restored after completion. A browser performance recording over the same comparison is the next step if exact rendering-stage attribution is required.

Try `http://localhost:8081/?renderer=bitmap` for normal interaction using cached gear images. The normal URL preserves SVG rendering for comparison. Cached images can soften when zoomed well beyond their original raster resolution; SVG source remains editable and movies retain their existing export path.
