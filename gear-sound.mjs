import { halfPhaseCrossings } from './physics.mjs';

const SOURCE = 'https://claudio.sonicthings.org/soundlib/';
const NOTES = { a: 79, b: 72, c: 84 }; // G5, C5, C6, within the preset's MIDI 70–90 range.
export class GearSound {
  constructor(gears, button) {
    this.gears = gears; this.button = button; this.enabled = true; this.previousAngle = null;
    this.system = null; this.voices = {}; this.indices = {}; this.ready = false; this.hits = { a: 0, b: 0, c: 0 };
    this.loading = this.load();
    button.addEventListener('click', () => {
      if (!this.ready) { this.loading.then(() => this.resume()); return; }
      if (!this.enabled || this.system.context.state !== 'running') { this.enabled = true; this.resume(); }
      else { this.enabled = false; this.silence(); this.update(); }
    });
    const unlock = event => { if (event.isTrusted && event.target !== button && this.enabled) this.resume(); };
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.silence(); this.system?.context.suspend().catch(() => {}); this.previousAngle = null; } });
    window.addEventListener('pagehide', () => this.silence());
  }
  async load() {
    try {
      const [{ AudioSystem }, { WG4PresetPlink }] = await Promise.all([
        import(`${SOURCE}AudioSystem.js`), import(`${SOURCE}models/WG4PresetPlink.js`)
      ]);
      this.system = new AudioSystem(); this.system.masterGainNode.gain.value = .25;
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
      this.system.context.addEventListener('statechange', () => this.update());
      return true;
    } catch (error) {
      console.error('WG4PresetPlink could not load:', error);
      this.button.textContent = 'Sound unavailable'; this.button.title = `Claudio sound could not load: ${error.message}. The gears still work.`;
      this.button.disabled = true; this.enabled = false; return false;
    }
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
    if (!this.system || !this.enabled) return false;
    try { await this.system.resume(); this.update(); return this.system.context.state === 'running'; }
    catch (error) { this.button.title = `Tap to enable audio: ${error.message}`; return false; }
  }
  silence() { for (const voices of Object.values(this.voices)) for (const voice of voices) { try { voice.kill(); } catch {} } }
  reset(angle) { this.previousAngle = angle; this.silence(); }
  follow(angle, muted = false) {
    const previous = this.previousAngle; this.previousAngle = angle;
    if (previous === null || muted || !this.ready || !this.enabled || this.system.context.state !== 'running' || document.hidden) return;
    for (const gear of this.gears) {
      const count = halfPhaseCrossings(previous, angle, gear);
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
