import test from 'node:test';
import assert from 'node:assert/strict';
import { GearSound, clickRateForVelocity, clickerHighPassCoefficients } from './gear-sound.mjs';

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
      indices: { b: 0 }, hits: { b: 0 }, stateElement: { dataset: {} }, onCrossing: () => events.push('flash'),
    });
    sound.follow(-.6 * 2 * Math.PI); sound.follow(-.4 * 2 * Math.PI);
    assert.deepEqual(events, ['flash', 'one:play', 'one:pluck', 'flash', 'two:play', 'two:pluck']);
    assert.equal(sound.hits.b, 2);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
});

test('only explicit lever activation unlocks audio, preserving the context during loading', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = {}, contexts = [], voices = [];
  let finishModules;
  const modules = new Promise(resolve => { finishModules = resolve; });
  class Context {
    constructor() { this.state = 'suspended'; this.destination = {}; this.currentTime = 0; this.resumeCalls = 0; this.primeCalls = 0; this.sampleRate = 48000; contexts.push(this); }
    addEventListener() {}
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
    createIIRFilter(feedforward,feedback) { this.filter = {feedforward,feedback,connect(destination){this.destination=destination;}}; return this.filter; }
    createBuffer() { return {}; }
    createBufferSource() {
      const context = this;
      return { connect() {}, disconnect() {}, start() { context.primeCalls++; this.onended(); } };
    }
    async resume() { this.resumeCalls++; this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  class AudioSystem {
    constructor() { this.context = new Context(); this.masterGainNode = this.context.createGain(); }
    async createSound(SoundClass, name) {
      const voice = { name, context: this.context, getParameter: () => ({min:70,max:90}), setParameterNormalized() {}, play() { this.played = true; }, event() {}, kill() {}, workletNode: { parameters: new Map(['active','clickRate'].map(key => [key,{setValueAtTime(){},setTargetAtTime(){}}])) } };
      voice.outputNode = { connect(destination){this.destination=destination;},disconnect(){this.disconnected=true;} };
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
    assert.deepEqual(Object.keys(listeners), ['visibilitychange'], 'no legacy touch, pointer, key or click audio-unlock listeners');
    listeners.visibilitychange();
    assert.equal(sound.context.resumeCalls,0,'returning to an unstarted page does not unlock audio');
    await sound.unlock(); // Called only by the completed lever click in the app.
    await Promise.resolve();
    assert.equal(sound.context.state,'running');
    assert.equal(sound.context.primeCalls,1,'primes output even when resume immediately reports running');
    finishModules([{AudioSystem},{WG4PresetPlink:class {}},{ClickerWorkletSoundModel:class {}}]);
    assert.equal(await sound.loading,true);
    assert.equal(sound.system.context,contexts[0]);
    assert.equal(contexts[1].state,'closed');
    assert(voices.every(voice => voice.context === contexts[0]));
    assert.equal(voices.filter(voice => voice.name === 'gear-b-clicker').length,1,'one clicker instance for the whole mechanism');
    assert.equal(sound.clicker.outputNode.destination,contexts[0].filter);
    assert.equal(contexts[0].filter.destination,sound.system.masterGainNode);
    assert(voices.filter(voice=>voice.name!=='gear-b-clicker').every(voice=>!voice.outputNode.disconnected),'plinks are not rerouted through the filter');
    sound.follow(-.4*2*Math.PI); sound.follow(-.6*2*Math.PI);
    assert.equal(sound.hits.b,1,'rings on a crossing without a second touch');
    assert.equal(voices[0].played,true);
    sound.enabled = false;
    const count = sound.context.resumeCalls;
    sound.started = true; listeners.visibilitychange();
    assert.equal(sound.context.resumeCalls,count,'a release does not undo an explicit mute');
  } finally {
    if (originalDocument) Object.defineProperty(globalThis,'document',originalDocument); else delete globalThis.document;
    if (originalWindow) Object.defineProperty(globalThis,'window',originalWindow); else delete globalThis.window;
  }
});

test('click rate follows absolute B speed at 36 clicks per turn, capped at 20 Hz', () => {
  assert.equal(clickRateForVelocity(0),0);
  assert.equal(clickRateForVelocity(Math.PI),18);
  assert.equal(clickRateForVelocity(-Math.PI),18);
  assert.equal(clickRateForVelocity(2*Math.PI),20);
  assert(clickRateForVelocity(.01)>0 && clickRateForVelocity(.01)<1);
  assert.equal(clickRateForVelocity(NaN),0);
});

test('one clicker runs continuously while moving and is silent at rest, while muted, or hidden', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis,'document');
  const documentState = {hidden:false};
  Object.defineProperty(globalThis,'document',{configurable:true,value:documentState});
  try {
    const events = [], context = {state:'running',currentTime:0};
    const parameter = name => ({setValueAtTime(value){events.push([name,value]);},setTargetAtTime(value){events.push([name,value]);}});
    const clicker = {play(){events.push(['play']);},kill(){events.push(['kill']);},workletNode:{parameters:new Map([['active',parameter('active')],['clickRate',parameter('rate')]])}};
    const sound = Object.assign(Object.create(GearSound.prototype),{clicker,context,ready:true,enabled:true,voices:{},clickerActive:false,lastClickUpdate:-Infinity,lastClickRate:0,stateElement:{dataset:{}}});
    sound.updateClicker(.1,false);
    assert.equal(events.filter(e=>e[0]==='play').length,1);
    assert.deepEqual(events.find(e=>e[0]==='active'),['active',1]);
    assert(events.find(e=>e[0]==='rate')[1]<1,'slow rates use the worklet range below the model UI minimum');
    context.currentTime=1; sound.updateClicker(-.2,false);
    assert.equal(events.filter(e=>e[0]==='play').length,1,'speed changes reuse the running voice');
    assert.equal(events.filter(e=>e[0]==='rate').at(-1)[1],clickRateForVelocity(.2));
    sound.updateClicker(0,false); assert.deepEqual(events.at(-1),['active',0]);
    const stoppedLength=events.length; sound.updateClicker(1,true); assert.equal(events.length,stoppedLength);
    sound.updateClicker(1,false); documentState.hidden=true; sound.updateClicker(1,false);
    assert.deepEqual(events.at(-1),['active',0]);
    documentState.hidden=false; sound.updateClicker(1,false); sound.reset(0);
    assert.deepEqual(events.at(-1),['kill']);
    assert.equal(sound.stateElement.dataset.clickRate,'0.00');
    assert.equal(sound.clicker,clicker);
  } finally {
    if(original) Object.defineProperty(globalThis,'document',original); else delete globalThis.document;
  }
});

test('clicker filter has one pole, rejects DC and is -3 dB at 800 Hz', () => {
  for (const sampleRate of [44100,48000,96000]) {
    const {feedforward:b,feedback:a}=clickerHighPassCoefficients(sampleRate);
    assert.equal(a.length,2); assert.equal(b.length,2);
    assert(Math.abs(a[1])<1,'pole is stable');
    const magnitude = frequency => {
      const w=2*Math.PI*frequency/sampleRate, c=Math.cos(w), s=Math.sin(w);
      return Math.hypot(b[0]+b[1]*c,b[1]*s)/Math.hypot(a[0]+a[1]*c,a[1]*s);
    };
    assert.equal(magnitude(0),0);
    assert(Math.abs(magnitude(800)-Math.SQRT1_2)<1e-12);
    assert(Math.abs(magnitude(sampleRate/2)-1)<1e-12);
    assert(magnitude(100)<magnitude(400) && magnitude(400)<magnitude(1600));
  }
});
