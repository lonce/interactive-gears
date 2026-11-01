export const SETTINGS = Object.freeze({ step: 1 / 120, inertia: 10, maxTorque: 3, viscous: 1.7, friction: 0.45 });
export const clamp = value => Math.max(-1, Math.min(1, value));
// SVG/canvas angles increase clockwise, whereas physical positive torque is CCW.
export const visualAngle = (gear, angle) => gear.phase + (gear.id === 'b' ? -angle : 36 / gear.z * angle);
export const interpolateAngle = (previous, current, fraction) => previous.angle + (current.angle - previous.angle) * Math.max(0, Math.min(1, fraction));
export const clockwisePhase = (rotation, markerAngle = Math.PI / 3) => {
  const turns = (rotation + markerAngle + Math.PI / 2) / (2 * Math.PI);
  return ((turns % 1) + 1) % 1;
};
export function orientGears(gears) {
  const result = gears.map(gear => ({ ...gear, markerAngle: Math.PI / 3 }));
  const driver = result.find(gear => gear.id === 'b');
  driver.phase = -Math.PI / 2 - driver.markerAngle;
  for (const gear of result) {
    if (gear === driver) continue;
    const contact = Math.atan2(gear.y - driver.y, gear.x - driver.x);
    const meshingPhase = contact + Math.PI - (Math.PI - driver.z * (contact - driver.phase)) / gear.z;
    const pitch = 2 * Math.PI / gear.z, target = -Math.PI / 2 - gear.markerAngle;
    gear.phase = meshingPhase + Math.round((target - meshingPhase) / pitch) * pitch;
  }
  return result;
}
export function advance(state, input, dt = SETTINGS.step, settings = SETTINGS) {
  const torque = clamp(input) * settings.maxTorque;
  const w = state.velocity;
  if (Math.abs(w) < 1e-10 && Math.abs(torque) <= settings.friction) return { angle: state.angle, velocity: 0 };
  const resistance = settings.viscous * w + settings.friction * Math.sign(w || torque);
  let velocity = w + (torque - resistance) / settings.inertia * dt;
  // Friction cannot carry the shaft through rest into reverse motion.
  if (w && Math.sign(velocity) !== Math.sign(w)) velocity = 0;
  return { angle: state.angle + (w + velocity) * dt / 2, velocity };
}
export function validateTake(take) {
  if (take?.format !== 'gears-take' || take.version !== 1 || take.step !== SETTINGS.step ||
      !Number.isInteger(take.ticks) || take.ticks < 1 || take.ticks > 120 * 60 * 30 ||
      !Number.isFinite(take.initial?.angle) || !Number.isFinite(take.initial?.velocity) || !Array.isArray(take.events)) throw new Error('This is not a supported gear recording.');
  let previous = -1;
  for (const event of take.events) {
    if (!Number.isInteger(event.tick) || event.tick < previous || event.tick < 0 || event.tick > take.ticks || !Number.isFinite(event.value) || Math.abs(event.value) > 1) throw new Error('The recording contains invalid torque events.');
    previous = event.tick;
  }
  return take;
}
