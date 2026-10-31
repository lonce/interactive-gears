# Interactive Gear Works

Interactive metallic gears with a spring-centered torque control, inertia, friction, take recording and browser movie export. SVG and cached bitmap renderers are available for comparison. No external runtime dependencies or build step.

```sh
git clone https://github.com/lonce/interactive-gears.git
cd interactive-gears
node server.mjs 8080
```

Open http://localhost:8080 . Try `/?renderer=bitmap` for cached images, or `/?diagnostics=1` for the rendering comparison. Node.js 22+ is needed only for the included server, generator and tests. The browser app can also be hosted as static files.

See [server and phone deployment](DEPLOYMENT.md) for putting it on a VPS.

Local, buildless HTML and SVG. Serve this folder with `node server.mjs`, then open http://localhost:3018 . No npm install or external browser libraries are needed.

Choose a different port with `node server.mjs 8080`, then open http://localhost:8080 . The default remains 3018; valid ports are 1–65535. The gear pane and exported movie have a pure black background and show only the a, b and c labels.

B is the driver. Positive slider values apply counterclockwise torque; negative values apply clockwise torque. Pointer release, cancellation, lost capture, keyboard release and window blur return torque immediately to zero. The thumb returns visually in 65 ms without overshoot. A and C have angular displacement `-36/24` and `-36/18` times B, preserving the original tooth phases.

The normalized physics uses a fixed 1/120-second step, inertia 10, maximum torque 3, viscous drag 1.7 and dry friction 0.45. There is no imposed speed limit; drag gives a terminal speed. The mechanism pauses while the tab is hidden. These are illustrative units rather than measured steel masses.

Animation is scheduled with `requestAnimationFrame`, but elapsed time is measured with `performance.now()` at callback entry, rather than using the frame timestamp supplied by the browser. The fixed-step accumulator and display interpolation use that actual execution time. Diagnostics also report the maximum callback interval and callback delay relative to the supplied frame timestamp; missed rendering opportunities can still cause visible stutter. The 100 ms catch-up cap applies only to longer stalls.

Display angles interpolate between fixed physics steps, keeping recorded simulation ticks unchanged. The numeric readout updates at most 10 times per second without rebuilding HTML. Gear art uses thin tooth outlines with no blurred shadows or rotating offset depth silhouettes, in both the live view and movie capture. Idle rotors do not rewrite their transforms. Browser QA can read the rolling moving-frame interval statistics from `#artwork`'s `data-frame-timing` attribute; these describe animation callback timing, not a guarantee of GPU presentation timing. A local 142-frame sample measured median 16.7 ms, p95 16.9 ms, and no intervals exceeding 1.5 times the median.

Record take captures the initial state and torque events by simulation tick. Save take downloads JSON; Load take restores it; Replay re-simulates the performance. Save movie exports a silent browser-encoded WebM (or MP4 where supported) at 1920 × 1080 and 30 fps by replaying onto a canvas. Keep the tab visible. Browser capture can drop frames under load; retain the JSON for a future offline deterministic HyperFrames render. No data is uploaded.

Edit `physics.mjs` for physics and `app.mjs` for input/recording. `gears.svg` is standalone editable SVG artwork. `node build-artwork.mjs` regenerates it from `artwork/gear-source.html` and `gear-spec.json`, both included here. Regeneration overwrites direct edits to `gears.svg`.

Run `node --test physics.test.mjs` for physical behavior checks.

## Rendering investigation

Open `/?diagnostics=1` and click **Run comparison** for a 72-second SVG / cached bitmap / stationary-baseline test with two passes each. Keep the tab visible and avoid resizing or interacting during the run. Each 12-second pass discards its first 1.5 seconds. Results include callback intervals, JavaScript callback work, callback delay, long tasks and long animation frames when supported. Save diagnostic report downloads the raw data. The original SVG renderer is restored after the test. These measurements do not directly measure GPU presentation or replace a browser performance trace.

Try `/?renderer=bitmap` for the cached-image renderer with the regular interactive controls. SVG remains the default and the editable artwork source. Include `diagnostics.mjs` alongside the other app files when deploying.
