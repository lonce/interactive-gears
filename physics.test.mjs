import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, SETTINGS, validateTake, visualAngle, interpolateAngle } from './physics.mjs';
function run(state, value, seconds) { for (let i = 0; i < Math.round(seconds / SETTINGS.step); i++) state = advance(state, value); return state; }
test('zero torque stays at rest', () => assert.deepEqual(run({ angle: 0, velocity: 0 }, 0, 10), { angle: 0, velocity: 0 }));
test('positive torque turns B counterclockwise; negative is symmetric', () => {
  const a = run({ angle: 0, velocity: 0 }, 1, 2), b = run({ angle: 0, velocity: 0 }, -1, 2);
  assert(a.angle > 0 && a.velocity > 0); assert.equal(a.angle, -b.angle); assert.equal(a.velocity, -b.velocity);
});
test('release coasts then stops without reversing', () => {
  let state = run({ angle: 0, velocity: 0 }, 1, 2), angle = state.angle;
  state = run(state, 0, .5); assert(state.angle > angle && state.velocity > 0);
  state = run(state, 0, 20); assert.equal(state.velocity, 0); assert.deepEqual(run(state, 0, 2), state);
});
test('opposing torque brakes and then reverses', () => {
  let state = run({ angle: 0, velocity: 0 }, 1, 2), speed = state.velocity;
  state = run(state, -1, .5); assert(state.velocity < speed && state.velocity > 0);
  assert(run(state, -1, 4).velocity < 0);
});
test('half input supplies less acceleration, and out-of-range input is clamped', () => {
  const start = { angle: 0, velocity: 0 };
  assert(advance(start, .5).velocity < advance(start, 1).velocity);
  assert.deepEqual(advance(start, 100), advance(start, 1));
});
test('recorded events reproduce the same end state exactly', () => {
  const events = [{ tick: 0, value: .8 }, { tick: 120, value: 0 }, { tick: 240, value: -1 }];
  const replay = () => { let s = { angle: 0, velocity: 0 }, input = 0, cursor = 0; for (let tick = 0; tick < 480; tick++) { while (cursor < events.length && events[cursor].tick <= tick) input = events[cursor++].value; s = advance(s, input); } return s; };
  assert.deepEqual(replay(), replay());
});
test('malformed recording is rejected', () => assert.throws(() => validateTake({ format: 'gears-take', version: 1, step: SETTINGS.step, ticks: -1 })));
test('screen rotation is CCW for B under positive torque and preserves mesh ratios', () => {
  assert.equal(visualAngle({ id: 'b', z: 36, phase: 0 }, 1), -1);
  assert.equal(visualAngle({ id: 'a', z: 24, phase: 0 }, 1), 1.5);
  assert.equal(visualAngle({ id: 'c', z: 18, phase: 0 }, 1), 2);
});
test('display interpolation is continuous, clamps bounds and leaves simulation states unchanged', () => {
  const previous = { angle: 2, velocity: 1 }, current = { angle: 4, velocity: 2 };
  assert.equal(interpolateAngle(previous, current, .25), 2.5);
  assert.equal(interpolateAngle(previous, current, -1), 2);
  assert.equal(interpolateAngle(previous, current, 2), 4);
  assert.equal(interpolateAngle(current, current, .8), 4);
  assert.deepEqual(previous, { angle: 2, velocity: 1 });
  assert.deepEqual(current, { angle: 4, velocity: 2 });
});
