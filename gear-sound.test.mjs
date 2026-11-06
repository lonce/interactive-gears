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
