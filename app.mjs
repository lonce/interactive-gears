import { SETTINGS, advance, clamp, validateTake, visualAngle, interpolateAngle } from './physics.mjs';
import { setupDiagnostics } from './diagnostics.mjs';
const $ = id => document.getElementById(id);
const [art, spec] = await Promise.all([fetch('gears.svg').then(r => r.text()), fetch('gear-spec.json').then(r => r.json())]);
$('artwork').innerHTML = art;
const svg = $('artwork').querySelector('svg');
const rotors = Object.fromEntries(spec.gears.map(g => [g.id, svg.querySelector(`#rotor-${g.id}`)]));
let state = { angle: 0, velocity: 0 }, torque = 0, pointer = null, keys = new Set();
let previousState = state;
let take = null, recording = null, playback = null, accumulator = 0, previousTime = null;
const speedValue = $('speed-value'), directionValue = $('direction');
let lastReadoutTime = -Infinity, lastPaintedAngle = null;
const frameSamples = []; let lastDiagnosticsTime = 0;
let movieRecorder = null, movieChunks = [], movieStream = null;
const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
const ctx = canvas.getContext('2d');
const gearImages = await Promise.all(spec.gears.map(async g => {
  const rotor = rotors[g.id];
  const standalone = `<svg xmlns="http://www.w3.org/2000/svg" width="${g.z * 16 + 80}" height="${g.z * 16 + 80}" viewBox="${-g.z * 8 - 40} ${-g.z * 8 - 40} ${g.z * 16 + 80} ${g.z * 16 + 80}">${rotor.innerHTML}</svg>`;
  const url = URL.createObjectURL(new Blob([standalone], { type: 'image/svg+xml' }));
  try { const image = new Image(); image.src = url; await image.decode(); return image; } finally { URL.revokeObjectURL(url); }
}));
const diagnostics = await setupDiagnostics({ svg, rotors, spec, gearImages });
// Opt-in rendering comparison for normal interactive use. Keep the SVG source
// editable, but rotate a single cached raster per gear instead of its paths.
if (new URLSearchParams(location.search).get('renderer') === 'bitmap' && !diagnostics) {
  for (const [i, gear] of spec.gears.entries()) {
    const r = gear.z * 8 + 40, raster = document.createElement('canvas');
    raster.width = raster.height = 2 * r;
    raster.getContext('2d').drawImage(gearImages[i], 0, 0);
    const dataURL = raster.toDataURL('image/png'), ready = new Image(); ready.src = dataURL; await ready.decode();
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('x', -r); image.setAttribute('y', -r); image.setAttribute('width', 2 * r); image.setAttribute('height', 2 * r); image.setAttribute('href', dataURL);
    rotors[gear.id].replaceChildren(image);
  }
  $('artwork').dataset.renderer = 'bitmap';
} else $('artwork').dataset.renderer = 'svg';
function status(message) { $('status').textContent = message; }
function setTorque(value, log = true) {
  torque = clamp(Number(value) || 0);
  $('torque-value').textContent = `${torque > 0 ? '+' : ''}${torque.toFixed(2)}`;
  $('torque-slider').setAttribute('aria-valuenow', torque.toFixed(3));
  $('thumb').style.top = `${(1 - torque) * 50}%`;
  $('torque-fill').style.top = `${torque > 0 ? (1 - torque) * 50 : 50}%`;
  $('torque-fill').style.height = `${Math.abs(torque) * 50}%`;
  if (recording && log) {
    const last = recording.events.at(-1);
    if (last.tick === recording.ticks) last.value = torque;
    else if (last.value !== torque) recording.events.push({ tick: recording.ticks, value: torque });
  }
}
function release() {
  const held = pointer; pointer = null; keys.clear();
  $('torque-slider').classList.remove('dragging');
  setTorque(0);
  if (held !== null && $('torque-slider').hasPointerCapture(held)) $('torque-slider').releasePointerCapture(held);
}
function pointerValue(event) {
  const rect = $('torque-slider').getBoundingClientRect();
  setTorque(1 - 2 * (event.clientY - rect.top) / rect.height);
}
$('torque-slider').addEventListener('pointerdown', event => {
  if (playback || pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault(); pointer = event.pointerId; $('torque-slider').focus();
  $('torque-slider').setPointerCapture(pointer); $('torque-slider').classList.add('dragging'); pointerValue(event);
});
$('torque-slider').addEventListener('pointermove', event => { if (event.pointerId === pointer) pointerValue(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('torque-slider').addEventListener(type, event => { if (event.pointerId === pointer) release(); });
$('torque-slider').addEventListener('keydown', event => {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'Escape'].includes(event.key)) return;
  event.preventDefault(); if (playback) return;
  if (event.key === 'Escape' || event.key === 'Home') { release(); return; }
  keys.add(event.key); setTorque(keys.has('ArrowUp') === keys.has('ArrowDown') ? 0 : keys.has('ArrowUp') ? 1 : -1);
});
$('torque-slider').addEventListener('keyup', event => {
  if (!keys.has(event.key)) return;
  keys.delete(event.key); setTorque(keys.has('ArrowUp') === keys.has('ArrowDown') ? 0 : keys.has('ArrowUp') ? 1 : -1);
});
$('torque-slider').addEventListener('blur', () => { if (!playback) release(); });
window.addEventListener('blur', () => { if (!playback) release(); });
document.addEventListener('visibilitychange', () => { if (!playback) release(); previousTime = null; accumulator = 0; previousState = state; });
function updateButtons() {
  const busy = !!playback;
  $('record').disabled = busy;
  $('record').classList.toggle('recording', !!recording);
  $('record').innerHTML = `<span class="record-dot"></span>${recording ? 'Stop recording' : 'Record take'}`;
  for (const id of ['replay', 'save', 'movie']) $(id).disabled = !take || !!recording || busy;
  $('reset').disabled = !!recording || busy;
  $('load').disabled = !!recording || busy;
  $('torque-slider').setAttribute('aria-disabled', String(busy));
}
function angles(angle = state.angle) { return spec.gears.map(g => visualAngle(g, angle)); }
function paint(angle = state.angle, time = Infinity) {
  const rotations = angles(angle);
  if (angle !== lastPaintedAngle) {
    spec.gears.forEach((g, i) => rotors[g.id].setAttribute('transform', `rotate(${rotations[i] * 180 / Math.PI})`));
    lastPaintedAngle = angle;
  }
  // Keep the numeric UI out of the per-frame drawing work.
  if (time === Infinity || time - lastReadoutTime >= 100) {
    const rpm = (Math.abs(state.velocity) * 60 / (2 * Math.PI)).toFixed(2);
    const direction = state.velocity > 1e-8 ? 'Counterclockwise ↶' : state.velocity < -1e-8 ? 'Clockwise ↷' : 'At rest';
    if (speedValue.textContent !== rpm) speedValue.textContent = rpm;
    if (directionValue.textContent !== direction) directionValue.textContent = direction;
    if (time !== Infinity) lastReadoutTime = time;
  }
  if (movieRecorder) drawMovie(rotations);
}
function drawMovie(rotations) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
  spec.gears.forEach((g, i) => {
    const r = g.z * 8 + 40;
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(rotations[i]);
    ctx.drawImage(gearImages[i], -r, -r, 2 * r, 2 * r); ctx.restore();
    const gradient = ctx.createLinearGradient(g.x - 25, g.y - 25, g.x + 25, g.y + 25); gradient.addColorStop(0, '#b3c3ca'); gradient.addColorStop(1, '#2a414f');
    ctx.beginPath(); ctx.arc(g.x, g.y, 29, 0, Math.PI * 2); ctx.fillStyle = gradient; ctx.fill(); ctx.strokeStyle = g.id === 'b' ? '#d6b275' : '#9aabb5'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = '#f1f5f6'; ctx.font = 'bold 36px Arial'; ctx.fillText(g.id, g.x, g.y + 12);
  });
}
function step() {
  previousState = state;
  if (playback) {
    while (playback.cursor < take.events.length && take.events[playback.cursor].tick <= playback.tick) setTorque(take.events[playback.cursor++].value, false);
    state = advance(state, torque); playback.tick++;
    if (playback.tick >= take.ticks) finishReplay();
  } else {
    state = advance(state, torque);
    if (recording) {
      recording.ticks++;
      if (recording.ticks >= 120 * 60 * 30) stopRecording();
    }
  }
}
function frame(frameTimestamp) {
  // rAF's timestamp belongs to the browser frame; sample actual callback entry
  // so a late callback advances the mechanism to the time it really executes.
  const time = performance.now();
  const callbackDelay = Math.max(0, time - frameTimestamp);
  const measuredInterval = previousTime === null ? null : time - previousTime;
  const testAngle = diagnostics?.tick(time);
  if (testAngle !== undefined && testAngle !== null) {
    previousTime = time; accumulator = 0;
    if (!diagnostics.skipDrawing) paint(testAngle, time);
    diagnostics.sample(time, measuredInterval, callbackDelay, performance.now() - time);
    requestAnimationFrame(frame); return;
  }
  if (diagnostics?.consumeFinished()) { previousTime = time; previousState = state; lastPaintedAngle = null; accumulator = 0; }
  if (previousTime !== null && !document.hidden) {
    const interval = time - previousTime;
    accumulator += Math.min(interval / 1000, .1);
    if (Math.abs(state.velocity) > .001) {
      frameSamples.push({ interval, callbackDelay }); if (frameSamples.length > 300) frameSamples.shift();
    }
  }
  previousTime = time;
  while (accumulator >= SETTINGS.step) { step(); accumulator -= SETTINGS.step; }
  paint(interpolateAngle(previousState, state, accumulator / SETTINGS.step), time);
  // DOM-readable diagnostics for browser QA, without adding text to the gear pane.
  if (time - lastDiagnosticsTime >= 1000 && frameSamples.length >= 20) {
    const sorted = frameSamples.map(sample => sample.interval).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
    const delays = frameSamples.map(sample => sample.callbackDelay).sort((a, b) => a - b);
    $('artwork').dataset.frameTiming = JSON.stringify({ samples: sorted.length, medianMs: +median.toFixed(2), p95Ms: +sorted[Math.floor(sorted.length * .95)].toFixed(2), maxMs: +sorted.at(-1).toFixed(2), lateFrames: sorted.filter(ms => ms > median * 1.5).length, callbackDelayP95Ms: +delays[Math.floor(delays.length * .95)].toFixed(2), callbackDelayMaxMs: +delays.at(-1).toFixed(2) });
    lastDiagnosticsTime = time;
  }
  requestAnimationFrame(frame);
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function stopRecording() {
  release(); recording.ticks = Math.max(1, recording.ticks); take = recording; recording = null;
  status(`Take captured: ${(take.ticks * SETTINGS.step).toFixed(2)} seconds. Replay it, save the editable take, or export a movie.`); updateButtons();
}
$('record').addEventListener('click', () => {
  if (recording) { stopRecording(); return; }
  release(); accumulator = 0; previousState = state;
  recording = { format: 'gears-take', version: 1, step: SETTINGS.step, settings: SETTINGS, initial: { ...state }, ticks: 0, events: [{ tick: 0, value: 0 }] };
  status('Recording your torque gestures. Click Stop recording when finished.'); updateButtons();
});
function startReplay() {
  release(); state = { ...take.initial }; previousState = state; playback = { tick: 0, cursor: 0 }; accumulator = 0; previousTime = null;
  updateButtons(); paint();
}
function finishReplay() {
  paint(); playback = null; setTorque(0, false);
  if (movieRecorder?.state === 'recording') movieRecorder.stop();
  status('Replay complete. The controls are live again.'); updateButtons();
}
$('replay').addEventListener('click', () => { startReplay(); status('Replaying the recorded torque inputs.'); });
$('save').addEventListener('click', () => download(new Blob([JSON.stringify(take, null, 2)], { type: 'application/json' }), 'gear-take.json'));
$('reset').addEventListener('click', () => { release(); state = { angle: 0, velocity: 0 }; previousState = state; accumulator = 0; paint(); status('Mechanism reset. Saved take is retained.'); });
$('load').addEventListener('change', async event => {
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a take smaller than 10 MB.');
    const candidate = validateTake(JSON.parse(await file.text()));
    if (JSON.stringify(candidate.settings) !== JSON.stringify(SETTINGS)) throw new Error('This take uses different physics settings.');
    take = candidate; status(`Loaded ${(take.ticks * SETTINGS.step).toFixed(2)} second take.`); updateButtons();
  } catch (error) { status(error.message); }
  event.target.value = '';
});
$('movie').addEventListener('click', async () => {
  try {
    if (!window.MediaRecorder || !canvas.captureStream) throw new Error('Movie capture is unavailable in this browser. Save the take for a later frame-by-frame render.');
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('No supported movie encoder. Save the take for a later render.');
    movieChunks = []; movieStream = canvas.captureStream(30);
    movieRecorder = new MediaRecorder(movieStream, { mimeType, videoBitsPerSecond: 10000000 });
    movieRecorder.ondataavailable = event => { if (event.data.size) movieChunks.push(event.data); };
    movieRecorder.onstop = () => {
      download(new Blob(movieChunks, { type: mimeType }), `gear-take.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`);
      movieStream.getTracks().forEach(track => track.stop()); movieRecorder = null; movieStream = null;
      status('Movie exported at 1920 × 1080, 30 fps. Save the take too for a deterministic frame-by-frame render.');
    };
    movieRecorder.onerror = () => { movieStream?.getTracks().forEach(track => track.stop()); movieRecorder = null; playback = null; release(); updateButtons(); status('Movie capture failed. Your take is still available to save.'); };
    startReplay(); drawMovie(angles()); movieRecorder.start(); status('Exporting the movie by replaying your take. Keep this tab visible until it finishes.');
  } catch (error) { movieStream?.getTracks().forEach(track => track.stop()); movieRecorder = null; status(error.message); }
});
updateButtons(); paint(); requestAnimationFrame(frame);
window.addEventListener('pagehide', () => { movieStream?.getTracks().forEach(track => track.stop()); });
