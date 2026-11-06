import test from 'node:test';
import assert from 'node:assert/strict';
import { GearSound } from './gear-sound.mjs';

test('phase flashes work before audio loads and while muted; reset does not create crossings', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  try {
    const flashes = [], gear = { id: 'b', phase: -Math.PI / 2, markerAngle: 0, z: 36 };
    const sound = Object.assign(Object.create(GearSound.prototype), {
      gears: [gear], previousAngle: null, ready: false, enabled: false,
      onCrossing: id => flashes.push(id), voices: {},
    });
    const angle = phase => -phase * 2 * Math.PI;
    sound.follow(angle(.4)); sound.follow(angle(.6));
    assert.deepEqual(flashes, ['b']);
    sound.ready = true; sound.follow(angle(.4));
    assert.deepEqual(flashes, ['b', 'b']);
    sound.reset(angle(.9)); sound.follow(angle(.95));
    assert.equal(flashes.length, 2);
    sound.follow(angle(.4), true); // Diagnostic runs are silent visually too.
    assert.equal(flashes.length, 2);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
});

test('audible crossings flash once and use the next reusable voice', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  try {
    const events = [], voice = name => ({ play: () => events.push(`${name}:play`), event: type => events.push(`${name}:${type}`) });
    const sound = Object.assign(Object.create(GearSound.prototype), {
      gears: [{ id: 'b', phase: -Math.PI / 2, markerAngle: 0, z: 36 }],
      previousAngle: -.4 * 2 * Math.PI, ready: true, enabled: true,
      system: { context: { state: 'running' } }, voices: { b: [voice('one'), voice('two')] },
      indices: { b: 0 }, hits: { b: 0 }, button: { dataset: {} }, onCrossing: () => events.push('flash'),
    });
    sound.follow(-.6 * 2 * Math.PI); sound.follow(-.4 * 2 * Math.PI);
    assert.deepEqual(events, ['flash', 'one:play', 'one:pluck', 'flash', 'two:play', 'two:pluck']);
    assert.equal(sound.hits.b, 2);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
});

test('first touch unlocks during module loading and the loaded voices keep that context', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = {}, contexts = [], voices = [];
  let finishModules;
  const modules = new Promise(resolve => { finishModules = resolve; });
  class Context {
    constructor() { this.state = 'suspended'; this.destination = {}; this.resumeCalls = 0; contexts.push(this); }
    addEventListener() {}
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
    async resume() { this.resumeCalls++; this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  class AudioSystem {
    constructor() { this.context = new Context(); this.masterGainNode = this.context.createGain(); }
    async createSound() {
      const voice = { context: this.context, getParameter: () => ({min:70,max:90}), setParameterNormalized() {}, play() { this.played = true; }, event() {}, kill() {} };
      voices.push(voice); return voice;
    }
  }
  class LoadingSound extends GearSound { loadModules() { return modules; } }
  const button = { dataset: {}, addEventListener() {}, setAttribute() {} };
  Object.defineProperty(globalThis, 'document', {configurable:true,value:{hidden:false,addEventListener(type, handler) { listeners[type] = handler; }}});
  Object.defineProperty(globalThis, 'window', {configurable:true,value:{AudioContext:Context,addEventListener() {}}});
  try {
    const gear = {id:'b',z:36,phase:-Math.PI/2,markerAngle:0};
    const sound = new LoadingSound([gear], button);
    assert(sound.context, 'context exists synchronously, before module download finishes');
    assert.equal(sound.ready,false);
    listeners.touchend({isTrusted:true,target:{}}); // The first and only physical touch.
    await Promise.resolve();
    assert.equal(sound.context.state,'running');
    finishModules([{AudioSystem},{WG4PresetPlink:class {}}]);
    assert.equal(await sound.loading,true);
    assert.equal(sound.system.context,contexts[0]);
    assert.equal(contexts[1].state,'closed');
    assert(voices.every(voice => voice.context === contexts[0]));
    sound.follow(-.4*2*Math.PI); sound.follow(-.6*2*Math.PI);
    assert.equal(sound.hits.b,1,'rings on a crossing without a second touch');
    assert.equal(voices[0].played,true);
    sound.enabled = false;
    const count = sound.context.resumeCalls;
    listeners.pointerup({isTrusted:true,target:{}});
    assert.equal(sound.context.resumeCalls,count,'a release does not undo an explicit mute');
  } finally {
    if (originalDocument) Object.defineProperty(globalThis,'document',originalDocument); else delete globalThis.document;
    if (originalWindow) Object.defineProperty(globalThis,'window',originalWindow); else delete globalThis.window;
  }
});
