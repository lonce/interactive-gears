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

Each gear has a red orientation line along a spoke, from the centre to a tooth tip. Phase is measured clockwise from upward vertical: up = 0, right = 0.25, down = 0.5, left = 0.75, wrapping into [0,1). The sidebar displays phases to three decimals. Reset starts B exactly at phase 0, with A and C at the nearest mesh-compatible orientations (about 0.993 and 0.981 respectively; these are just counterclockwise of zero). Markers work in SVG, cached-image and movie modes. Positive torque turns B counterclockwise, so its clockwise phase decreases. Saved takes retain their torque timing but now use this new zero pose.

The normalized physics uses a fixed 1/120-second step, inertia 10, maximum torque 3, viscous drag 1.7 and dry friction 0.45. There is no imposed speed limit; drag gives a terminal speed. The mechanism pauses while the tab is hidden. These are illustrative units rather than measured steel masses.

The bottom Mechanics panel has horizontal controls for friction (0–0.90, default 0.45), drag (0–3.40, default 1.70), inertia (1–19, default 10), and weight (0–4, default 0). Friction, drag and inertia defaults are the exact slider midpoints. These controls stay where released and take effect live; changing inertia changes subsequent acceleration without an instantaneous speed jump. Reset parameters restores all defaults; Reset mechanism resets position/speed while retaining the chosen parameters. With weight, friction and drag all at zero, the mechanism coasts indefinitely.

Weight adds a brass hexagon to B's marked spoke at 78% of its outer radius. The hexagon's size grows with mass; zero hides it. Gravity adds physical CCW torque `weight × 3 × 0.78 × sin(B's CCW displacement from its upward starting pose)`, and the weight adds `weight × 0.78²` to the effective inertia. Thus it pulls toward the bottom on either side, has zero torque at the exact top/bottom, and can swing and settle. Values are illustrative units. At the exact initial top position, give it a nudge with the torque control; dry friction can also hold small off-centre offsets. The base inertia slider excludes the attached weight's additional inertia. Weight changes are recorded and replayed with other parameters; older takes without a weight field replay with weight zero. The weight is included in SVG, cached-image and movie views.

New recordings use take format version 2, preserving the initial physics settings and tick-timed parameter changes as well as torque inputs. Replay/movie export restore those settings and disable parameter editing until playback finishes, leaving the final parameter values displayed. Legacy version 1 takes remain loadable.

Animation is scheduled with `requestAnimationFrame`, but elapsed time is measured with `performance.now()` at callback entry, rather than using the frame timestamp supplied by the browser. The fixed-step accumulator and display interpolation use that actual execution time. Diagnostics also report the maximum callback interval and callback delay relative to the supplied frame timestamp; missed rendering opportunities can still cause visible stutter. The 100 ms catch-up cap applies only to longer stalls.

Display angles interpolate between fixed physics steps, keeping recorded simulation ticks unchanged. The numeric readout updates at most 10 times per second without rebuilding HTML. Gear art uses thin tooth outlines with no blurred shadows or rotating offset depth silhouettes, in both the live view and movie capture. Idle rotors do not rewrite their transforms. Browser QA can read the rolling moving-frame interval statistics from `#artwork`'s `data-frame-timing` attribute; these describe animation callback timing, not a guarantee of GPU presentation timing. A local 142-frame sample measured median 16.7 ms, p95 16.9 ms, and no intervals exceeding 1.5 times the median.

Record take captures the initial state and torque events by simulation tick. Save take downloads JSON; Load take restores it; Replay re-simulates the performance. Save movie exports a silent browser-encoded WebM (or MP4 where supported) at 1920 × 1080 and 30 fps by replaying onto a canvas. Keep the tab visible. Browser capture can drop frames under load; retain the JSON for a future offline deterministic HyperFrames render. No data is uploaded.

Edit `physics.mjs` for physics and `app.mjs` for input/recording. `gears.svg` is standalone editable SVG artwork. `node build-artwork.mjs` regenerates it from `artwork/gear-source.html` and `gear-spec.json`, both included here. Regeneration overwrites direct edits to `gears.svg`.

Run `node --test physics.test.mjs` for physical behavior checks.

## Rendering investigation

Open `/?diagnostics=1` and click **Run comparison** for a 72-second SVG / cached bitmap / stationary-baseline test with two passes each. Keep the tab visible and avoid resizing or interacting during the run. Each 12-second pass discards its first 1.5 seconds. Results include callback intervals, JavaScript callback work, callback delay, long tasks and long animation frames when supported. Save diagnostic report downloads the raw data. The original SVG renderer is restored after the test. These measurements do not directly measure GPU presentation or replace a browser performance trace.

Try `/?renderer=bitmap` for the cached-image renderer with the regular interactive controls. SVG remains the default and the editable artwork source. Include `diagnostics.mjs` alongside the other app files when deploying.
