import { halfPhaseCrossings } from './physics.mjs';

const SOURCE = 'https://claudio.sonicthings.org/soundlib/';
const NOTES = { a: 79, b: 72, c: 84 }; // G5, C5, C6, within the preset's MIDI 70–90 range.
export class GearSound {
  constructor(gears, stateElement, onCrossing = () => {}) {
    this.onCrossing = onCrossing;
    this.gears = gears; this.stateElement = stateElement; this.enabled = true; this.started = false; this.previousAngle = null;
    this.system = null; this.voices = {}; this.indices = {}; this.ready = false; this.hits = { a: 0, b: 0, c: 0 };
    this.loading = this.load();
    // Only the lever starts audio. Lifecycle handling preserves that choice
    // when returning to an already-started page; it never unlocks a fresh one.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.silence(); this.context?.suspend().catch(() => {}); this.previousAngle = null; }
      else if (this.started && this.enabled) this.resume();
    });
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
      this.ready = true; this.update();
      return true;
    } catch (error) {
      console.error('WG4PresetPlink could not load:', error);
      this.stateElement.textContent = 'Sound unavailable'; this.stateElement.title = `Claudio sound could not load: ${error.message}. The gears still work.`;
      this.enabled = false; return false;
    }
  }
  loadModules() {
    return Promise.all([import(`${SOURCE}AudioSystem.js`), import(`${SOURCE}models/WG4PresetPlink.js`)]);
  }
  update() {
    if (!this.ready) return;
    const on = this.enabled && this.system.context.state === 'running';
    this.stateElement.textContent = on ? 'Sound on · Plink' : 'Sound off';
    this.stateElement.dataset.audioState = this.context.state;
  }
  async resume() {
    if (!this.context || !this.enabled) return false;
    try {
      if (this.context.state !== 'running') await this.context.resume();
      this.update(); return this.context.state === 'running';
    }
    catch (error) { this.stateElement.title = `Audio could not resume: ${error.message}`; return false; }
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
        this.hits[gear.id]++; this.stateElement.dataset[`hits${gear.id.toUpperCase()}`] = this.hits[gear.id];
      }
    }
  }
  recordingTrack() {
    if (!this.ready || !this.enabled || this.system.context.state !== 'running') return null;
    if (!this.capture) { this.capture = this.system.context.createMediaStreamDestination(); this.system.masterGainNode.connect(this.capture); }
    return this.capture.stream.getAudioTracks()[0].clone();
  }
}
