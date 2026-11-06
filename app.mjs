import { SETTINGS, PARAMETERS, WEIGHT_RADIUS, INITIAL_ANGLE, weightSize, advance, clamp, validateTake, visualAngle, interpolateAngle, clockwisePhase } from './physics.mjs';
import { setupDiagnostics } from './diagnostics.mjs';
import { GearSound } from './gear-sound.mjs';
const $ = id => document.getElementById(id);
const [art, spec] = await Promise.all([fetch('gears.svg').then(r => r.text()), fetch('gear-spec.json').then(r => r.json())]);
$('artwork').innerHTML = art;
const svg = $('artwork').querySelector('svg');
svg.setAttribute('role', 'group'); // Keep the integrated lock button accessible.
// Fit the live stage to the mechanism rather than the movie's 16:9 canvas.
const bounds = spec.gears.map(g => ({ x: g.x, y: g.y, r: spec.module * (g.z / 2 + 1) + 24 }));
const left = Math.min(...bounds.map(g => g.x - g.r)), top = Math.min(...bounds.map(g => g.y - g.r));
svg.setAttribute('viewBox', `${left} ${top} ${Math.max(...bounds.map(g => g.x + g.r)) - left} ${Math.max(...bounds.map(g => g.y + g.r)) - top}`);
const rotors = Object.fromEntries(spec.gears.map(g => [g.id, svg.querySelector(`#rotor-${g.id}`)]));
const markers = Object.fromEntries(spec.gears.map(g => [g.id, svg.querySelector(`#marker-${g.id}`)]));
const driverGear = spec.gears.find(gear => gear.id === 'b');
// Put the lock in the same coordinate space as the gears: its tapered tip
// enters the gap five degrees right of B's uppermost tooth in the start pose.
const mechanismLock = document.createElementNS('http://www.w3.org/2000/svg', 'g');
mechanismLock.id = 'mechanism-lock';
mechanismLock.setAttribute('transform', `translate(${driverGear.x} ${driverGear.y})`);
mechanismLock.innerHTML = `<defs><linearGradient id="lock-steel" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#536976"/><stop offset=".45" stop-color="#d6e0e4"/><stop offset=".65" stop-color="#8195a0"/><stop offset="1" stop-color="#364d5b"/></linearGradient></defs>
 <g aria-hidden="true"><path d="M 25 -283 L 12 -303 L 26 -326 L 132 -444 L 155 -423 L 48 -306 Z" fill="url(#lock-steel)" stroke="#c0cdd4" stroke-width="4" stroke-linejoin="round"/>
 <path d="M 30 -305 L 139 -432" fill="none" stroke="#344c5b" stroke-width="3"/>
 <rect x="117" y="-457" width="134" height="54" rx="10" fill="#263943" stroke="#879ba6" stroke-width="4"/>
 <circle cx="134" cy="-431" r="6" fill="#aab9c2"/><circle cx="233" cy="-431" r="6" fill="#aab9c2"/></g>`;
const lockHandle = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
lockHandle.setAttribute('x', '75'); lockHandle.setAttribute('y', '-493');
lockHandle.setAttribute('width', '240'); lockHandle.setAttribute('height', '230');
lockHandle.append($('start-lock'));
mechanismLock.append(lockHandle); svg.append(mechanismLock);
const weightRadius = spec.module * (driverGear.z / 2 + 1) * WEIGHT_RADIUS;
const weightIcon = document.createElementNS('http://www.w3.org/2000/svg', 'g');
weightIcon.id = 'weight-icon';
weightIcon.innerHTML = '<path fill="#050505" stroke="#ff3434" stroke-width="2.5" d="M -0.45 -0.75 L 0.45 -0.75 L 1 0.8 L -1 0.8 Z"/><text text-anchor="middle" dominant-baseline="central" fill="white" font-family="Arial,sans-serif" font-weight="700" font-size="1.35">w</text>';
// Scale the silhouette and lettering together, upright in the initial bottom pose.
weightIcon.firstElementChild.setAttribute('vector-effect', 'non-scaling-stroke');
markers.b.append(weightIcon);
const phaseValues = Object.fromEntries(spec.gears.map(g => [g.id, $(`phase-${g.id}`)]));
const flashes = new Map();
const sound = new GearSound(spec.gears, $('sound-toggle'), id => {
  flashes.set(id, performance.now() + 170);
  markers[id].querySelector('line').setAttribute('stroke', '#fff4bc');
  markers[id].querySelector('line').setAttribute('stroke-width', '10');
  if (id === 'b') weightIcon.firstElementChild.setAttribute('stroke', '#fff4bc');
  markers[id].dataset.flash = 'true';
});
sound.automaticUnlock = false;
let mechanismLocked = true, starting = false;
function releaseStartLock() {
  mechanismLocked = false; sound.automaticUnlock = true;
  for (const panel of document.querySelectorAll('[data-controls]')) panel.inert = false;
  $('start-lock').hidden = true;
  mechanismLock.setAttribute('display', 'none');
  updateButtons();
  $('torque-slider').focus({ preventScroll: true });
}
async function startWithSound() {
  if (starting || !mechanismLocked) return;
  starting = true; $('sound-start').disabled = true;
  $('start-lock').classList.add('starting'); $('start-label').textContent = 'Starting sound…';
  // A completed tap supplies browser activation. Resume synchronously here,
  // before waiting for any remotely loaded voices.
  const unlocked = sound.unlock();
  try {
    const running = await unlocked;
    if (!await sound.loading) return;
    if (!running || sound.context.state !== 'running') throw new Error('Tap the lever again to enable audio.');
    releaseStartLock(); status('Sound is on. Push and hold the torque slider.');
  } catch (error) {
    $('start-label').textContent = 'Sound on'; $('start-hint').textContent = error.message;
  } finally {
    starting = false; $('sound-start').disabled = !sound.enabled;
    $('start-lock').classList.remove('starting');
  }
}
$('sound-start').addEventListener('click', startWithSound);
$('start-silent').addEventListener('click', () => {
  sound.enabled = false; sound.silence(); releaseStartLock();
  status('Sound unavailable. The gears are ready.');
});
sound.loading.then(loaded => {
  if (!loaded && mechanismLocked) {
    $('start-label').textContent = 'Sound unavailable'; $('sound-start').disabled = true;
    $('start-hint').textContent = 'Audio could not load. You can still release the gears.';
    $('start-silent').hidden = false;
  }
});
let state = { angle: INITIAL_ANGLE, velocity: 0 }, torque = 0, pointer = null, keys = new Set();
let previousState = state;
let take = null, recording = null, playback = null, accumulator = 0, previousTime = null;
let physicsSettings = { ...SETTINGS };
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
// Cached images are the default for normal interactive use. Keep the SVG source
// editable, but rotate a single cached raster per gear instead of its paths.
if (new URLSearchParams(location.search).get('renderer') !== 'svg' && !diagnostics) {
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
function setParameters(values, log = true) {
  physicsSettings = { ...physicsSettings, ...values };
  for (const key of Object.keys(PARAMETERS)) {
    $(`parameter-${key}`).value = physicsSettings[key];
    $(`value-${key}`).textContent = physicsSettings[key].toFixed(key === 'inertia' ? 1 : 2);
  }
  const size = weightSize(physicsSettings.weight), x = weightRadius * Math.cos(driverGear.markerAngle), y = weightRadius * Math.sin(driverGear.markerAngle);
  weightIcon.setAttribute('transform', `translate(${x} ${y}) rotate(${driverGear.markerAngle * 180 / Math.PI + 270}) scale(${size})`);
  weightIcon.setAttribute('visibility', size > 0 ? 'visible' : 'hidden');
  weightIcon.setAttribute('data-weight', physicsSettings.weight);
  if (recording && log) {
    const event = { tick: recording.ticks, settings: { ...physicsSettings } };
    if (recording.settingsEvents.at(-1)?.tick === event.tick) recording.settingsEvents[recording.settingsEvents.length - 1] = event;
    else recording.settingsEvents.push(event);
  }
}
for (const [key, range] of Object.entries(PARAMETERS)) {
  const control = $(`parameter-${key}`);
  control.min = range.min; control.max = range.max; control.step = range.step;
  control.addEventListener('input', () => {
    if (!playback && !diagnostics?.active) setParameters({ [key]: Number(control.value) });
  });
}
$('parameter-defaults').addEventListener('click', () => { if (!playback && !diagnostics?.active) setParameters(SETTINGS); });
setParameters(SETTINGS, false);
function status(message) { $('status').textContent = message; }
function setTorque(value, log = true) {
  torque = clamp(Number(value) || 0);
  $('torque-value').textContent = `${torque > 0 ? '+' : ''}${torque.toFixed(2)}`;
  $('torque-slider').setAttribute('aria-valuenow', torque.toFixed(3));
  $('thumb').style.left = `${(1 + torque) * 50}%`;
  $('torque-fill').style.left = `${torque > 0 ? 50 : (1 + torque) * 50}%`;
  $('torque-fill').style.width = `${Math.abs(torque) * 50}%`;
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
  setTorque(2 * (event.clientX - rect.left) / rect.width - 1);
}
$('torque-slider').addEventListener('pointerdown', event => {
  if (mechanismLocked || playback || pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault(); pointer = event.pointerId; $('torque-slider').focus();
  $('torque-slider').setPointerCapture(pointer); $('torque-slider').classList.add('dragging'); pointerValue(event);
});
$('torque-slider').addEventListener('pointermove', event => { if (event.pointerId === pointer) pointerValue(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('torque-slider').addEventListener(type, event => { if (event.pointerId === pointer) release(); });
$('torque-slider').addEventListener('keydown', event => {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'Escape'].includes(event.key)) return;
  event.preventDefault(); if (mechanismLocked || playback) return;
  if (event.key === 'Escape' || event.key === 'Home') { release(); return; }
  keys.add(event.key); keyboardTorque();
});
$('torque-slider').addEventListener('keyup', event => {
  if (!keys.has(event.key)) return;
  keys.delete(event.key); keyboardTorque();
});
function keyboardTorque() {
  const positive = keys.has('ArrowRight') || keys.has('ArrowUp'), negative = keys.has('ArrowLeft') || keys.has('ArrowDown');
  setTorque(positive === negative ? 0 : positive ? 1 : -1);
}
$('torque-slider').addEventListener('blur', () => { if (!playback) release(); });
window.addEventListener('blur', () => { if (!playback) release(); });
document.addEventListener('visibilitychange', () => { if (!playback) release(); previousTime = null; accumulator = 0; previousState = state; });
function updateButtons() {
  const busy = mechanismLocked || !!playback;
  $('record').disabled = busy;
  $('record').classList.toggle('recording', !!recording);
  $('record').innerHTML = `<span class="record-dot"></span>${recording ? 'Stop recording' : 'Record take'}`;
  for (const id of ['replay', 'save', 'movie']) $(id).disabled = !take || !!recording || busy;
  $('reset').disabled = !!recording || busy;
  $('load').disabled = !!recording || busy;
  $('torque-slider').setAttribute('aria-disabled', String(busy));
  for (const key of Object.keys(PARAMETERS)) $(`parameter-${key}`).disabled = busy;
  $('parameter-defaults').disabled = busy;
}
function angles(angle = state.angle) { return spec.gears.map(g => visualAngle(g, angle)); }
function paint(angle = state.angle, time = Infinity) {
  sound.follow(angle, !!diagnostics?.active);
  for (const [id, until] of flashes) if (performance.now() >= until) {
    const line = markers[id].querySelector('line');
    line.setAttribute('stroke', '#ff3434'); line.setAttribute('stroke-width', '5');
    if (id === 'b') weightIcon.firstElementChild.setAttribute('stroke', '#ff3434');
    delete markers[id].dataset.flash; flashes.delete(id);
  }
  const rotations = angles(angle);
  if (angle !== lastPaintedAngle) {
    spec.gears.forEach((g, i) => {
      const transform = `rotate(${rotations[i] * 180 / Math.PI})`;
      rotors[g.id].setAttribute('transform', transform);
      markers[g.id].setAttribute('transform', transform);
    });
    lastPaintedAngle = angle;
  }
  // Keep the numeric UI out of the per-frame drawing work.
  if (time === Infinity || time - lastReadoutTime >= 100) {
    const rpm = (Math.abs(state.velocity) * 60 / (2 * Math.PI)).toFixed(2);
    const direction = state.velocity > 1e-8 ? 'Counterclockwise ↶' : state.velocity < -1e-8 ? 'Clockwise ↷' : 'At rest';
    if (speedValue.textContent !== rpm) speedValue.textContent = rpm;
    if (directionValue.textContent !== direction) directionValue.textContent = direction;
    spec.gears.forEach((gear, i) => {
      const value = ((Math.round(clockwisePhase(rotations[i], gear.markerAngle) * 1000) % 1000) / 1000).toFixed(3);
      if (phaseValues[gear.id].textContent !== value) phaseValues[gear.id].textContent = value;
    });
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
    const bearing = rotations[i] + g.markerAngle, markerRadius = spec.module * (g.z / 2 + 1);
    ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + markerRadius * Math.cos(bearing), g.y + markerRadius * Math.sin(bearing));
    ctx.strokeStyle = flashes.has(g.id) ? '#fff4bc' : '#ff3434'; ctx.lineWidth = flashes.has(g.id) ? 10 : 5; ctx.lineCap = 'round'; ctx.stroke();
    if (g.id === 'b' && physicsSettings.weight > 0) {
      const x = g.x + weightRadius * Math.cos(bearing), y = g.y + weightRadius * Math.sin(bearing), size = weightSize(physicsSettings.weight);
      ctx.save(); ctx.translate(x, y); ctx.rotate(bearing + 3 * Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(-.45 * size, -.75 * size); ctx.lineTo(.45 * size, -.75 * size); ctx.lineTo(size, .8 * size); ctx.lineTo(-size, .8 * size);
      ctx.closePath(); ctx.fillStyle = '#050505'; ctx.fill(); ctx.strokeStyle = flashes.has('b') ? '#fff4bc' : '#ff3434'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${size * 1.35}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('w', 0, 0); ctx.restore();
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#f1f5f6'; ctx.font = 'bold 36px Arial'; ctx.fillText(g.id, g.x, g.y + 12);
  });
}
function step() {
  previousState = state;
  if (playback) {
    const changes = take.settingsEvents || [];
    while (playback.settingsCursor < changes.length && changes[playback.settingsCursor].tick <= playback.tick) setParameters({ ...SETTINGS, weight: 0, ...changes[playback.settingsCursor++].settings }, false);
    while (playback.cursor < take.events.length && take.events[playback.cursor].tick <= playback.tick) setTorque(take.events[playback.cursor++].value, false);
    state = advance(state, torque, SETTINGS.step, physicsSettings); playback.tick++;
    if (playback.tick >= take.ticks) finishReplay();
  } else {
    state = advance(state, torque, SETTINGS.step, physicsSettings);
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
  if (diagnostics?.consumeFinished()) { sound.reset(state.angle); previousTime = time; previousState = state; lastPaintedAngle = null; accumulator = 0; }
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
  recording = { format: 'gears-take', version: 2, step: SETTINGS.step, settings: { ...physicsSettings }, settingsEvents: [], initial: { ...state }, ticks: 0, events: [{ tick: 0, value: 0 }] };
  status('Recording torque and parameter changes. Click Stop recording when finished.'); updateButtons();
});
function startReplay() {
  release(); setParameters({ ...SETTINGS, weight: 0, ...take.settings }, false); state = { ...take.initial }; sound.reset(state.angle); previousState = state; playback = { tick: 0, cursor: 0, settingsCursor: 0 }; accumulator = 0; previousTime = null;
  updateButtons(); paint();
}
function finishReplay() {
  paint(); playback = null; setTorque(0, false);
  if (movieRecorder?.state === 'recording') movieRecorder.stop();
  status('Replay complete. The controls are live again.'); updateButtons();
}
$('replay').addEventListener('click', () => { startReplay(); status('Replaying the recorded torque inputs.'); });
$('save').addEventListener('click', () => download(new Blob([JSON.stringify(take, null, 2)], { type: 'application/json' }), 'gear-take.json'));
$('reset').addEventListener('click', () => { release(); state = { angle: INITIAL_ANGLE, velocity: 0 }; sound.reset(INITIAL_ANGLE); previousState = state; accumulator = 0; paint(); status('Mechanism reset. Saved take is retained.'); });
$('load').addEventListener('change', async event => {
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a take smaller than 10 MB.');
    const candidate = validateTake(JSON.parse(await file.text()));
    take = candidate; status(`Loaded ${(take.ticks * SETTINGS.step).toFixed(2)} second take.`); updateButtons();
  } catch (error) { status(error.message); }
  event.target.value = '';
});
$('movie').addEventListener('click', async () => {
  try {
    if (!window.MediaRecorder || !canvas.captureStream) throw new Error('Movie capture is unavailable in this browser. Save the take for a later frame-by-frame render.');
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('No supported movie encoder. Save the take for a later render.');
    await sound.resume();
    movieChunks = []; movieStream = canvas.captureStream(30);
    const audioTrack = sound.recordingTrack(); if (audioTrack) movieStream.addTrack(audioTrack);
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
