export const SETTINGS = Object.freeze({ step: 1 / 120, inertia: 2, maxTorque: 3, viscous: 0, friction: 0.4, weight: 4 });
export const PARAMETERS = Object.freeze({ friction: { min: 0, max: .9, step: .01 }, viscous: { min: 0, max: 3.4, step: .02 }, inertia: { min: 1, max: 19, step: .1 }, weight: { min: 0, max: 4, step: .05 } });
export const WEIGHT_RADIUS = .78;
export const INITIAL_ANGLE = Math.PI; // B's marked spoke and weight point down.
export function gravityTorque(angle, weight = 0) {
  const sine = Math.sin(angle);
  return weight * 3 * WEIGHT_RADIUS * (Math.abs(sine) < 1e-12 ? 0 : sine);
}
export const weightSize = weight => weight > 0 ? 9 + 15 * Math.sqrt(weight) : 0;
export function validateSettings(settings) {
  if (!settings || settings.step !== SETTINGS.step || settings.maxTorque !== SETTINGS.maxTorque ||
      Object.entries(PARAMETERS).some(([key, range]) => { const value = key === 'weight' && settings[key] === undefined ? 0 : settings[key]; return !Number.isFinite(value) || value < range.min || value > range.max; })) throw new Error('The recording contains unsupported physics settings.');
  return settings;
}
export const clamp = value => Math.max(-1, Math.min(1, value));
// SVG/canvas angles increase clockwise, whereas physical positive torque is CCW.
export const visualAngle = (gear, angle) => gear.phase + (gear.id === 'b' ? -angle : 36 / gear.z * angle);
export const interpolateAngle = (previous, current, fraction) => previous.angle + (current.angle - previous.angle) * Math.max(0, Math.min(1, fraction));
export const clockwisePhase = (rotation, markerAngle = Math.PI / 3) => {
  const turns = (rotation + markerAngle + Math.PI / 2) / (2 * Math.PI);
  return ((turns % 1) + 1) % 1;
};
export function halfPhaseCrossings(previousAngle, currentAngle, gear) {
  const phase = angle => (visualAngle(gear, angle) + gear.markerAngle + Math.PI / 2) / (2 * Math.PI);
  const previous = phase(previousAngle) - .5, current = phase(currentAngle) - .5;
  return current > previous ? Math.floor(current) - Math.floor(previous) : Math.ceil(previous) - Math.ceil(current);
}
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
  const weight = settings.weight ?? 0;
  const torque = clamp(input) * settings.maxTorque + gravityTorque(state.angle, weight);
  const w = state.velocity;
  if (Math.abs(w) < 1e-10 && Math.abs(torque) <= settings.friction) return { angle: state.angle, velocity: 0 };
  const resistance = settings.viscous * w + settings.friction * Math.sign(w || torque);
  const inertia = settings.inertia + weight * WEIGHT_RADIUS ** 2;
  let velocity = w + (torque - resistance) / inertia * dt;
  // Friction cannot carry the shaft through rest into reverse motion.
  if (w && Math.sign(velocity) !== Math.sign(w)) velocity = 0;
  else if (weight > 0) {
    // Midpoint acceleration avoids artificial energy gain in faster weighted swings.
    const midVelocity = (w + velocity) / 2, midAngle = state.angle + w * dt / 2;
    const midTorque = clamp(input) * settings.maxTorque + gravityTorque(midAngle, weight);
    const midResistance = settings.viscous * midVelocity + settings.friction * Math.sign(midVelocity || midTorque);
    velocity = w + (midTorque - midResistance) / inertia * dt;
    if (w && Math.sign(velocity) !== Math.sign(w)) velocity = 0;
  }
  return { angle: state.angle + (w + velocity) * dt / 2, velocity };
}
export function validateTake(take) {
  if (take?.format !== 'gears-take' || ![1, 2].includes(take.version) || take.step !== SETTINGS.step ||
      !Number.isInteger(take.ticks) || take.ticks < 1 || take.ticks > 120 * 60 * 30 ||
      !Number.isFinite(take.initial?.angle) || !Number.isFinite(take.initial?.velocity) || !Array.isArray(take.events)) throw new Error('This is not a supported gear recording.');
  let previous = -1;
  for (const event of take.events) {
    if (!Number.isInteger(event.tick) || event.tick < previous || event.tick < 0 || event.tick > take.ticks || !Number.isFinite(event.value) || Math.abs(event.value) > 1) throw new Error('The recording contains invalid torque events.');
    previous = event.tick;
  }
  validateSettings(take.settings);
  if (take.version === 2) {
    if (!Array.isArray(take.settingsEvents)) throw new Error('The recording is missing parameter changes.');
    previous = -1;
    for (const event of take.settingsEvents) {
      if (!Number.isInteger(event.tick) || event.tick < previous || event.tick < 0 || event.tick > take.ticks) throw new Error('The recording contains invalid parameter timing.');
      validateSettings(event.settings); previous = event.tick;
    }
  }
  return take;
}
