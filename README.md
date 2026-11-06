# Interactive Gear Works

Interactive metallic gears with a spring-centered horizontal torque control, inertia, friction, take recording and browser movie export. Cached bitmap rendering is the default; SVG is available for comparison. No install or build step. Sound loads the WG4PresetPlink synthesizer from Claudio.

```sh
git clone https://github.com/lonce/interactive-gears.git
cd interactive-gears
node server.mjs 8080
```

Open http://localhost:8080 for cached-image rendering. Use `/?renderer=svg` for vectors, or `/?diagnostics=1` for the rendering comparison. Node.js 22+ is needed only for the included server, generator and tests. The browser app can also be hosted as static files.

See [server and phone deployment](DEPLOYMENT.md) for putting it on a VPS.

Local, buildless HTML and SVG. Serve this folder with `node server.mjs`, then open http://localhost:3018 . No npm install is needed; the optional sound imports Claudio's browser modules at runtime.

Choose a different port with `node server.mjs 8080`, then open http://localhost:8080 . The default remains 3018; valid ports are 1–65535. The gear pane and exported movie have a pure black background and show only the a, b and c labels.

B is the driver. Positive slider values apply counterclockwise torque; negative values apply clockwise torque. Pointer release, cancellation, lost capture, keyboard release and window blur return torque immediately to zero. The thumb returns visually in 65 ms without overshoot. A and C have angular displacement `-36/24` and `-36/18` times B, preserving the original tooth phases.

Each gear has a red orientation line along a spoke, from the centre to a tooth tip. Phase is measured clockwise from upward vertical: up = 0, right = 0.25, down = 0.5, left = 0.75, wrapping into [0,1). The torque strip displays phases to three decimals. Startup and Reset mechanism place B at phase 0.5, with the weight straight down at stable rest. A and C retain their mesh relationship (initial phases about 0.743 and 0.981). The larger white w and trapezoid are upright in this bottom pose. Markers work in SVG, cached-image and movie modes. Positive torque turns B counterclockwise, so its clockwise phase decreases. Saved takes retain their torque timing but now use this new zero pose.

The normalized physics starts with inertia 1, maximum torque 3, viscous drag 0, dry friction 0.5 and attached weight 4. Physics uses a fixed 1/120-second step, with midpoint acceleration for gravity to reduce artificial energy gain in swings. There is no imposed speed limit; nonzero drag gives a terminal speed. The mechanism pauses while the tab is hidden. These are illustrative units rather than measured steel masses.

The bottom Mechanics panel has horizontal controls for friction (0–0.90, default 0.50), drag (0–3.40, default 0), inertia (0–2, default 1), and weight (0–4, default 4). These controls stay where released and take effect live; changing inertia changes subsequent acceleration without an instantaneous speed jump. Reset parameters restores these startup defaults; Reset mechanism resets position/speed while retaining the chosen parameters. With weight, friction and drag all at zero, the mechanism coasts indefinitely.

Weight adds a black trapezoid marked with a white w to B's marked spoke at 78% of its outer radius. The weight icon's size grows with mass; zero hides it. Gravity adds physical CCW torque `weight × 3 × 0.78 × sin(B's CCW displacement from its upward starting pose)`, and the weight adds `weight × 0.78²` to the effective inertia. Thus it pulls toward the bottom on either side, has zero torque at the exact top/bottom, and can swing and settle. Values are illustrative units. The mechanism starts at stable rest at the bottom; positive torque swings the weight right. At the exact top position gravity vanishes; dry friction can also hold small off-centre offsets. The base inertia slider excludes the attached weight's additional inertia. Weight changes are recorded and replayed with other parameters; older takes without a weight field replay with weight zero. The weight is included in SVG, cached-image and movie views.

New recordings use take format version 2, preserving the initial physics settings and tick-timed parameter changes as well as torque inputs. Replay/movie export restore those settings and disable parameter editing until playback finishes, leaving the final parameter values displayed. Legacy version 1 takes remain loadable.

Animation is scheduled with `requestAnimationFrame`, but elapsed time is measured with `performance.now()` at callback entry, rather than using the frame timestamp supplied by the browser. The fixed-step accumulator and display interpolation use that actual execution time. Diagnostics also report the maximum callback interval and callback delay relative to the supplied frame timestamp; missed rendering opportunities can still cause visible stutter. The 100 ms catch-up cap applies only to longer stalls.

Display angles interpolate between fixed physics steps, keeping recorded simulation ticks unchanged. The numeric readout updates at most 10 times per second without rebuilding HTML. Gear art uses thin tooth outlines with no blurred shadows or rotating offset depth silhouettes, in both the live view and movie capture. Idle rotors do not rewrite their transforms. Browser QA can read the rolling moving-frame interval statistics from `#artwork`'s `data-frame-timing` attribute; these describe animation callback timing, not a guarantee of GPU presentation timing. A local 142-frame sample measured median 16.7 ms, p95 16.9 ms, and no intervals exceeding 1.5 times the median.

Record take captures the initial state and torque events by simulation tick. Save take downloads JSON; Load take restores it; Replay re-simulates the performance. Save movie exports browser-encoded WebM (or MP4 where supported) at 1920 × 1080 and 30 fps by replaying onto a canvas, including synthesized plinks and speed-driven clicks when sound is enabled and ready. Keep the tab visible. Browser capture can drop frames under load; retain the JSON for a future offline deterministic HyperFrames render. No take data is uploaded.

## Phase sounds

The app imports `AudioSystem.js` and `models/WG4PresetPlink.js` from https://claudio.sonicthings.org/soundlib/ and uses the same `play()` then `event("pluck")` pattern as [wand.html](https://claudio.sonicthings.org/wand.html). Three reusable voices per gear allow overlapping decays. Pitches: A = G5 (MIDI 79), B = C5 (72), C = C6 (84). A plink sounds whenever the marked spoke crosses phase 0.5, in either direction. Unwrapped phases handle wraparound and skipped frames, while reset, backgrounding and diagnostic runs do not create catch-up note bursts. Extreme crossings are capped at eight notes per gear per displayed frame.

A steel locking pawl is drawn between B's upper teeth at startup, with a red Sound on handle attached. It shares the SVG coordinate system and scales with the gears. Complete one tap to enable audio and release the mechanism; the lever then disappears and leaves no permanent sound button. Torque, parameter and take controls remain locked until audio is running and the voices are ready. A failed audio load offers Continue without sound. This avoids relying on a first touch-and-hold to unlock audio, which Chromium on Android can defer until release. The lock stays hidden in the initial HTML until the SVG and first gear pose are ready, preventing an oversized startup flash. Removing it does not change panel sizes. Switching tabs kills active voices and suspends audio; returning resumes it only if the lever has already been released. No global touch, pointer, keyboard or click audio-unlock handlers remain. Sound needs internet access and HTTPS or localhost; no microphone is used. Audio-context state and trigger counts remain on the hidden sound-state element for QA.

Edit `physics.mjs` for physics and `app.mjs` for input/recording. `gears.svg` is standalone editable SVG artwork. `node build-artwork.mjs` regenerates it from `artwork/gear-source.html` and `gear-spec.json`, both included here. Regeneration overwrites direct edits to `gears.svg`.

Run `node --test physics.test.mjs gear-sound.test.mjs` for physical behavior checks.

## Rendering investigation

Open `/?diagnostics=1` and click **Run comparison** for a 72-second SVG / cached bitmap / stationary-baseline test with two passes each. Keep the tab visible and avoid resizing or interacting during the run. Each 12-second pass discards its first 1.5 seconds. Results include callback intervals, JavaScript callback work, callback delay, long tasks and long animation frames when supported. Save diagnostic report downloads the raw data. The original SVG renderer is restored after the test. These measurements do not directly measure GPU presentation or replace a browser performance trace.

Cached images are the default, and `/?renderer=bitmap` remains supported. Use `/?renderer=svg` for the vector renderer. SVG remains the editable artwork source. Include `diagnostics.mjs` and `gear-sound.mjs` alongside the other app files when deploying.

The torque control sits above Mechanics with its own metal styling and gold divider. Right / → applies positive counterclockwise torque; left / ← applies clockwise torque. The layout uses the available viewport height and gives remaining space to the gear stage. Small screens retain all control readouts and compact parameter rows. A 170 ms pale-gold flash of each orientation line marks a phase-0.5 crossing, even with audio muted or unavailable; it also appears in movie export. No blurred shadows are used for the flash.

Zero base inertia still includes any attached weight's inertia. If both base inertia and weight are zero, the integrator uses a 0.05 numerical floor to avoid division by zero. Older takes can still replay their original inertia values up to 19, even though the live control now spans 0–2.

One Claudio ClickerWorkletSoundModel instance adds a click train driven by B's absolute angular speed: 36 clicks per revolution, capped at the worklet's maximum of 20 clicks per second. Rates below 1 Hz use the worklet AudioParam directly (its model UI starts at 1 Hz). Rate changes are smoothed in audio time; the worklet clocks the pulses, without JavaScript click timers. Rest, reset, hidden tabs and diagnostics silence the clicker. The existing phase plinks remain. The clicker alone passes through a first-order 800 Hz high-pass filter (6 dB/octave, -3 dB at cutoff); the plinks bypass it. Both sounds share the movie audio mix, including the filtered clicker. The hidden sound-state output exposes the current requested click rate for QA.
