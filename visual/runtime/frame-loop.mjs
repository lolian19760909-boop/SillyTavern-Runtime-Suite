export function createFrameLoop({ view, draw, maxFps = 60, sampleSize = 180 }) {
  const period = 1000 / Math.max(1, Math.min(120, Number(maxFps) || 60));
  let frame = null, running = false, disposed = false, previous = null, clock = 0, frames = 0;
  const intervals = [], submissions = [];
  const sample = (list, value) => { list.push(value); if (list.length > sampleSize) list.shift(); };
  function tick(now) {
    frame = null;
    if (!running || disposed) return;
    if (previous === null || now - previous >= period - 0.5) {
      const delta = previous === null ? 0 : now - previous;
      if (previous !== null) sample(intervals, delta);
      previous = now; clock += delta / 1000;
      const started = view.performance.now();
      draw(clock, delta / 1000);
      sample(submissions, view.performance.now() - started); frames++;
    }
    if (running && !disposed) frame = view.requestAnimationFrame(tick);
  }
  const percentile = list => list.length ? [...list].sort((a,b) => a-b)[Math.min(list.length-1, Math.floor(list.length*.95))] : null;
  return {
    play() { if (running || disposed) return; running = true; previous = null; frame = view.requestAnimationFrame(tick); },
    pause() { running = false; previous = null; if (frame !== null) view.cancelAnimationFrame(frame); frame = null; },
    seek(seconds) { if (!Number.isFinite(seconds) || seconds < 0) throw new Error('时间必须为非负秒数。'); clock = seconds; previous = null; draw(clock, 0); },
    diagnostics: () => ({ running, frames, seconds: clock, maxFps: 1000 / period, sampleFrames: intervals.length, fps: intervals.length ? 1000 * intervals.length / intervals.reduce((a,b)=>a+b,0) : null, intervalP95: percentile(intervals), submitP95: percentile(submissions) }),
    dispose() { this.pause(); disposed = true; },
  };
}
