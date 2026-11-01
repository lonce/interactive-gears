import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, SETTINGS, PARAMETERS, validateTake, visualAngle, interpolateAngle, clockwisePhase, orientGears } from './physics.mjs';
function run(state, value, seconds, settings = SETTINGS) { for (let i = 0; i < Math.round(seconds / SETTINGS.step); i++) state = advance(state, value, SETTINGS.step, settings); return state; }
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
test('phase is zero up, increases clockwise, and wraps into [0,1)', () => {
  for (const [rotation, expected] of [[-Math.PI/2,0],[0,.25],[Math.PI/2,.5],[Math.PI,.75],[Math.PI*1.5,0]]) {
    assert(Math.abs(clockwisePhase(rotation,0)-expected)<1e-12);
  }
  assert(clockwisePhase(-100,0)>=0 && clockwisePhase(-100,0)<1);
});
test('initial markers are nearest vertical while both meshes remain locked', () => {
  const gears = orientGears([{id:'a',z:24,x:0,y:0},{id:'b',z:36,x:480,y:0},{id:'c',z:18,x:480,y:-432}]);
  const b = gears.find(g=>g.id==='b'), tau=2*Math.PI;
  const distance = p => Math.min(p,1-p);
  assert.equal(clockwisePhase(b.phase,b.markerAngle),0);
  for (const gear of gears.filter(g=>g.id!=='b')) {
    const error = distance(clockwisePhase(gear.phase,gear.markerAngle));
    for (const offset of [-1,1]) assert(error <= distance(clockwisePhase(gear.phase+offset*tau/gear.z,gear.markerAngle))+1e-12);
    const contact = Math.atan2(gear.y-b.y,gear.x-b.x);
    for (const angle of [0,.7,-.7,13]) {
      const residual = b.z*(contact-visualAngle(b,angle))+gear.z*(contact+Math.PI-visualAngle(gear,angle))-Math.PI;
      assert(Math.abs(residual/tau-Math.round(residual/tau))<1e-10);
    }
  }
});
test('each parameter default is the exact slider midpoint', () => {
  for (const [key, range] of Object.entries(PARAMETERS)) assert.equal((range.min + range.max) / 2, SETTINGS[key]);
});
test('inertia changes acceleration; friction and drag independently slow coasting', () => {
  const rest = { angle: 0, velocity: 0 }, moving = { angle: 0, velocity: .5 };
  assert(run(rest,1,.5,{...SETTINGS,inertia:1}).velocity > run(rest,1,.5,{...SETTINGS,inertia:19}).velocity);
  const free = {...SETTINGS,friction:0,viscous:0};
  assert.equal(run(moving,0,2,free).velocity,.5);
  assert(run(moving,0,2,{...free,friction:.9}).velocity < .5);
  assert(run(moving,0,2,{...free,viscous:3.4}).velocity < .5);
});
test('take validation accepts old settings and timed parameter changes, rejecting invalid inertia and timing', () => {
  const legacy = { format:'gears-take',version:1,step:SETTINGS.step,settings:{...SETTINGS},initial:{angle:0,velocity:0},ticks:240,events:[{tick:0,value:1},{tick:120,value:0}] };
  assert.equal(validateTake(legacy),legacy);
  const modern = {...legacy,version:2,settingsEvents:[{tick:120,settings:{...SETTINGS,friction:0,viscous:0,inertia:19}}]};
  assert.equal(validateTake(modern),modern);
  let state = run(legacy.initial,1,1,modern.settings), speed = state.velocity;
  state = run(state,0,1,modern.settingsEvents[0].settings); assert.equal(state.velocity,speed);
  assert.throws(()=>validateTake({...modern,settingsEvents:[{tick:120,settings:{...SETTINGS,inertia:0}}]}));
  assert.throws(()=>validateTake({...modern,settingsEvents:[{tick:241,settings:SETTINGS}]}));
});
