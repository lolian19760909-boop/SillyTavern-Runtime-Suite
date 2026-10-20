import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameLoop } from '../visual/runtime/frame-loop.mjs';
import { createPlayback } from '../visual/runtime/playback.mjs';

test('GPU循环按帧率上限调度，暂停与关闭后无残留回调，恢复不累加后台时间', () => {
  const callbacks = new Map(); let id = 0, now = 0, draws = 0;
  const view = { requestAnimationFrame(fn) { callbacks.set(++id,fn);return id; }, cancelAnimationFrame(id) { callbacks.delete(id); }, performance: { now: () => now } };
  const step = time => { now=time;const all=[...callbacks.values()];callbacks.clear();all.forEach(fn=>fn(now)); };
  const loop = createFrameLoop({view,draw:()=>draws++,maxFps:30});
  loop.play(); loop.play();
  for(let i=0;i<=120;i++)step(i*1000/120);
  assert(draws>=30&&draws<=31); assert(loop.diagnostics().fps>=29&&loop.diagnostics().fps<=31);
  loop.pause(); assert.equal(callbacks.size,0); const seconds=loop.diagnostics().seconds;
  loop.play();step(8000);assert.equal(loop.diagnostics().seconds,seconds);
  loop.seek(3);assert.equal(loop.diagnostics().seconds,3);loop.dispose();assert.equal(callbacks.size,0);
});

test('离屏、后台和减少动态共同暂停；恢复可见不能覆盖玩家手动暂停', async () => {
  const listeners = new Map(), mediaListeners = new Map(), calls = []; let intersection;
  const media = { matches:false,addEventListener:(n,f)=>mediaListeners.set(n,f),removeEventListener:n=>mediaListeners.delete(n) };
  const doc = { hidden:false,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),
    defaultView:{ matchMedia:()=>media,IntersectionObserver:class {constructor(fn){intersection=fn;}observe(){}disconnect(){calls.push('disconnect');}} } };
  const policy=createPlayback({target:{ownerDocument:doc},handle:{play:()=>calls.push('play'),pause:()=>calls.push('pause')}});
  await policy.refresh();intersection([{isIntersecting:false}]);await policy.refresh();assert.equal(calls.at(-1),'pause');
  await policy.pause();intersection([{isIntersecting:true}]);await policy.refresh();assert.equal(calls.at(-1),'pause');
  await policy.play();assert.equal(calls.at(-1),'play');
  doc.hidden=true;listeners.get('visibilitychange')();await policy.refresh();assert.equal(calls.at(-1),'pause');
  doc.hidden=false;media.matches=true;await policy.refresh();assert.equal(calls.at(-1),'pause');
  media.matches=false;await policy.refresh();assert.equal(calls.at(-1),'play');
  await policy.dispose();assert.equal(listeners.size,0);assert.equal(mediaListeners.size,0);
});
