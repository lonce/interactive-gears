import { halfPhaseCrossings } from './physics.mjs';

const SOURCE = 'https://claudio.sonicthings.org/soundlib/';
const NOTES = { a: 79, b: 72, c: 84 }; // G5, C5, C6, within the preset's MIDI 70–90 range.
export class GearSound {
  constructor(gears, button, onCrossing = () => {}) {
    this.onCrossing = onCrossing;
    this.gears = gears; this.button = button; this.enabled = true; this.previousAngle = null;
    this.system = null; this.voices = {}; this.indices = {}; this.ready = false; this.hits = { a: 0, b: 0, c: 0 };
    this.loading = this.load();
    button.addEventListener('click', () => {
      if (!this.ready) { this.unlock(); return; }
      if (!this.enabled || this.context.state !== 'running') { this.enabled = true; this.unlock(); }
      else { this.enabled = false; this.silence(); this.update(); }
    });
    this.automaticUnlock = true;
    const unlock = event => { if (this.automaticUnlock && event.isTrusted && event.target !== button && this.enabled) this.unlock(); };
    // Native touchstart matters: a touch pointerdown alone may not unlock
    // mobile audio. Handle it before the slider's gesture cancellation, and
    // keep release/click as fallbacks rather than requiring a finger lift.
    for (const type of ['pointerdown', 'touchstart', 'pointerup', 'touchend', 'keydown', 'click']) document.addEventListener(type, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.silence(); this.context?.suspend().catch(() => {}); this.previousAngle = null; } });
    window.addEventListener('pagehide', () => this.silence());
  }
  async load() {
    try {
      // Create before the first await: the first gesture must have a context
      // to unlock even while the remote modules/worklets are still loading.
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.context.addEventListener('statechange', () => this.update());
      const [{ AudioSystem }, { WG4PresetPlink }] = await this.loadModules();
      this.system = new AudioSystem();
      // Claudio's constructor creates its own context and master gain, with
      // no context-injection option. Adopt the already-unlocked context before
      // creating any voices; dispose of the unused graph immediately.
      const unusedContext = this.system.context;
      this.system.masterGainNode.disconnect();
      this.system.context = this.context;
      this.system.masterGainNode = this.context.createGain();
      this.system.masterGainNode.gain.value = .25;
      this.system.masterGainNode.connect(this.context.destination);
      unusedContext.close().catch(() => {});
      for (const gear of this.gears) {
        this.voices[gear.id] = []; this.indices[gear.id] = 0;
        for (let i = 0; i < 3; i++) {
          const voice = await this.system.createSound(WG4PresetPlink, `gear-${gear.id}-plink-${i}`, 0);
          const pitch = voice.getParameter('midiNote');
          voice.setParameterNormalized('midiNote', (NOTES[gear.id] - pitch.min) / (pitch.max - pitch.min));
          this.voices[gear.id].push(voice);
        }
      }
      this.ready = true; this.button.disabled = false; this.update();
      return true;
    } catch (error) {
      console.error('WG4PresetPlink could not load:', error);
      this.button.textContent = 'Sound unavailable'; this.button.title = `Claudio sound could not load: ${error.message}. The gears still work.`;
      this.button.disabled = true; this.enabled = false; return false;
    }
  }
  loadModules() {
    return Promise.all([import(`${SOURCE}AudioSystem.js`), import(`${SOURCE}models/WG4PresetPlink.js`)]);
  }
  update() {
    if (!this.ready) return;
    const on = this.enabled && this.system.context.state === 'running';
    this.button.textContent = on ? 'Sound on · Plink' : this.enabled ? 'Enable sound' : 'Sound off';
    this.button.setAttribute('aria-pressed', String(on));
    this.button.dataset.audioState = this.system.context.state;
    this.button.title = 'WG4PresetPlink — A: G5, B: C5, C: C6. Sounds at phase 0.5 in either direction.';
  }
  async resume() {
    if (!this.context || !this.enabled) return false;
    try {
      if (this.context.state !== 'running') await this.context.resume();
      this.update(); return this.context.state === 'running';
    }
    catch (error) { this.button.title = `Tap to enable audio: ${error.message}`; return false; }
  }
  unlock() {
    if (!this.context || !this.enabled) return;
    const resumed = this.resume(); // Invoke resume inside the gesture, before awaiting anything.
    if (!this.primed || this.context.state !== 'running') {
      // Prime on the first press even if resume() already reports running:
      // that state alone does not prove mobile output has been unlocked.
      const source = this.context.createBufferSource();
      source.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
      source.connect(this.context.destination);
      source.onended = () => { this.primed = true; source.disconnect(); };
      source.start();
    }
    return resumed;
  }
  silence() { for (const voices of Object.values(this.voices)) for (const voice of voices) { try { voice.kill(); } catch {} } }
  reset(angle) { this.previousAngle = angle; this.silence(); }
  follow(angle, muted = false) {
    const previous = this.previousAngle; this.previousAngle = angle;
    if (previous === null || muted || document.hidden) return;
    for (const gear of this.gears) {
      const count = halfPhaseCrossings(previous, angle, gear);
      if (count) this.onCrossing(gear.id);
      if (!this.ready || !this.enabled || this.system.context.state !== 'running') continue;
      for (let hit = 0; hit < Math.min(count, 8); hit++) {
        const pool = this.voices[gear.id], index = this.indices[gear.id];
        const voice = pool[index]; this.indices[gear.id] = (index + 1) % pool.length;
        voice.play(); voice.event('pluck');
        this.hits[gear.id]++; this.button.dataset[`hits${gear.id.toUpperCase()}`] = this.hits[gear.id];
      }
    }
  }
  recordingTrack() {
    if (!this.ready || !this.enabled || this.system.context.state !== 'running') return null;
    if (!this.capture) { this.capture = this.system.context.createMediaStreamDestination(); this.system.masterGainNode.connect(this.capture); }
    return this.capture.stream.getAudioTracks()[0].clone();
  }
}
