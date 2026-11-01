const modes = ['svg', 'bitmap', 'none', 'bitmap', 'svg', 'none'];
const duration = 12000, warmup = 1500;
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const p = q => +(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] || 0).toFixed(3);
  const median = p(.5);
  return { samples: sorted.length, medianMs: median, p95Ms: p(.95), p99Ms: p(.99), maxMs: p(1), over25ms: sorted.filter(v => v >= 25).length, over33ms: sorted.filter(v => v >= 33).length, latePercent: +(100 * sorted.filter(v => v > median * 1.5).length / (sorted.length || 1)).toFixed(2) };
}
export async function setupDiagnostics({ svg, rotors, spec, gearImages }) {
  if (new URLSearchParams(location.search).get('diagnostics') !== '1') return null;
  const originals = {}, bitmaps = {};
  for (const [i, gear] of spec.gears.entries()) {
    const raster = document.createElement('canvas'), r = gear.z * 8 + 40;
    raster.width = raster.height = 2 * r;
    raster.getContext('2d').drawImage(gearImages[i], 0, 0);
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('x', -r); image.setAttribute('y', -r); image.setAttribute('width', 2 * r); image.setAttribute('height', 2 * r);
    const dataURL = raster.toDataURL('image/png'), ready = new Image(); ready.src = dataURL; await ready.decode();
    image.setAttribute('href', dataURL); bitmaps[gear.id] = image;
    originals[gear.id] = [...rotors[gear.id].childNodes];
  }
  const panel = document.createElement('section'); panel.id = 'render-diagnostics';
  panel.style.cssText = 'max-width:1500px;margin:20px auto;padding:18px;border:1px solid #536774;border-radius:8px;font:12px Arial;line-height:1.6;color:#dce5e9;background:#18232b';
  panel.innerHTML = '<strong>Rendering investigation</strong><p>72-second comparison: SVG, cached pixels, and stationary baseline; two passes each. Identical constant shaft speed. Controls pause during the test.</p><button id="run-diagnostic">Run comparison</button><p id="diagnostic-status" role="status">Ready.</p><pre id="diagnostic-results" style="white-space:pre-wrap"></pre>';
  document.body.append(panel);
  const saveButton = document.createElement('button'); saveButton.textContent = 'Save diagnostic report'; saveButton.disabled = true; saveButton.style.marginLeft = '8px';
  panel.querySelector('button').after(saveButton);
  const output = panel.querySelector('#diagnostic-status');
  const result = panel.querySelector('#diagnostic-results');
  let active = false, started = null, phaseStart = null, index = -1, phase = null, pending = false;
  let report, frames, work, delays, longFrames, longTasks;
  const observers = [];
  for (const type of ['long-animation-frame', 'longtask']) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    const observer = new PerformanceObserver(list => {
      if (!active || !phase) return;
      for (const entry of list.getEntries()) {
        if (entry.startTime < phaseStart + warmup) continue;
        if (type === 'longtask') longTasks.push({ startMs: entry.startTime, durationMs: entry.duration });
        else longFrames.push({ startMs: entry.startTime, durationMs: entry.duration, blockingMs: entry.blockingDuration, renderStart: entry.renderStart, styleAndLayoutStart: entry.styleAndLayoutStart, scripts: (entry.scripts || []).map(s => ({ durationMs: s.duration, sourceURL: s.sourceURL, invoker: s.invoker })) });
      }
    });
    observer.observe({ type, buffered: false }); observers.push(observer);
  }
  function display(mode) {
    for (const gear of spec.gears) rotors[gear.id].replaceChildren(...(mode === 'bitmap' ? [bitmaps[gear.id]] : originals[gear.id]));
  }
  function savePhase() {
    if (!phase) return;
    report.phases.push({ mode: phase, intervals: distribution(frames), callbackWork: distribution(work), callbackDelay: distribution(delays), longFrames, longTasks });
  }
  function finish() {
    savePhase(); active = false; pending = true; display('svg');
    document.querySelector('aside').inert = false;
    document.querySelector('.take-controls').inert = false;
    document.querySelector('.parameter-panel').inert = false;
    panel.querySelector('button').disabled = false;
    panel.dataset.report = JSON.stringify(report);
    saveButton.disabled = false;
    output.textContent = 'Comparison complete. Original SVG view and controls restored.';
    result.textContent = report.phases.map((p, i) => `${i + 1}. ${p.mode}: frame p95 ${p.intervals.p95Ms} ms; max ${p.intervals.maxMs} ms; ≥25 ms ${p.intervals.over25ms}/${p.intervals.samples}; JS p95 ${p.callbackWork.p95Ms} ms; long tasks ${p.longTasks.length}`).join('\n');
  }
  panel.querySelector('button').addEventListener('click', () => {
    report = { userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, date: new Date().toISOString(), durationPerPhaseMs: duration, discardedWarmupMs: warmup, supportedObservers: PerformanceObserver.supportedEntryTypes, phases: [] };
    index = -1; started = phaseStart = null; phase = null; active = true; result.textContent = ''; panel.querySelector('button').disabled = true; saveButton.disabled = true;
    document.querySelector('aside').inert = true; document.querySelector('.take-controls').inert = true;
    document.querySelector('.parameter-panel').inert = true;
    document.querySelector('main').scrollIntoView({ block: 'start' });
  });
  saveButton.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'gear-render-diagnostic.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  document.addEventListener('visibilitychange', () => {
    if (active && document.hidden) { finish(); output.textContent = 'Test interrupted because the tab was hidden. Keep the tab visible and run again.'; }
  });
  return {
    get active() { return active; },
    get skipDrawing() { return active && phase === 'none'; },
    consumeFinished() { const value = pending; pending = false; return value; },
    tick(time) {
      if (!active) return null;
      if (started === null) started = time;
      if (phaseStart === null || time - phaseStart >= duration) {
        savePhase(); index++;
        if (index >= modes.length) { phase = null; finish(); return null; }
        phase = modes[index]; phaseStart = time; frames = []; work = []; delays = []; longFrames = []; longTasks = [];
        display(phase === 'bitmap' ? 'bitmap' : 'svg');
        output.textContent = `Pass ${index + 1}/${modes.length}: ${phase === 'none' ? 'stationary rendering baseline' : phase === 'bitmap' ? 'cached pixel gears' : 'SVG vector gears'} — 12 seconds. Keep this tab visible.`;
      }
      return (time - started) / 1000 * .6;
    },
    sample(time, interval, delay, cost) {
      if (active && time - phaseStart >= warmup && interval !== null) { frames.push(interval); delays.push(delay); work.push(cost); }
    }
  };
}
