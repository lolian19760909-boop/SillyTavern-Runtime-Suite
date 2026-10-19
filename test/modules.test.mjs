import test from 'node:test';
import assert from 'node:assert/strict';
import { createModuleSwitch } from '../runtime/modules.mjs';

test('rapid module enable and disable releases a late load exactly once', async () => {
  let resolve, starts = 0, closes = 0;
  const module = createModuleSwitch(async () => { starts++; await new Promise(done => { resolve = done; }); return { dispose: async () => { closes++; } }; });
  const start = module.set(true); await new Promise(done => setImmediate(done));
  const stop = module.set(false); resolve(); await Promise.all([start, stop]);
  assert.equal(starts, 1); assert.equal(closes, 1); assert.equal(module.status().active, false);
  await module.dispose(); assert.equal(closes, 1);
});
test('repeated enable reuses one instance and disabling one module leaves the other running', async () => {
  let starts = 0, closes = 0;
  const make = () => createModuleSwitch(async () => { starts++; return { dispose: async () => { closes++; } }; });
  const a = make(), b = make(); await Promise.all([a.set(true), a.set(true), b.set(true)]); assert.equal(starts, 2);
  await a.set(false); assert.equal(a.status().active, false); assert.equal(b.status().active, true); assert.equal(closes, 1);
  await Promise.all([a.dispose(), b.dispose()]); assert.equal(closes, 2);
});
test('failed module can retry after its dependency is fixed', async () => {
  let fail = true, closes = 0;
  const module = createModuleSwitch(async () => { if (fail) throw new Error('冲突'); return { dispose: async () => { closes++; } }; });
  await assert.rejects(module.set(true), /冲突/); assert.equal(module.status().active, false);
  fail = false; await module.set(true); assert.equal(module.status().active, true); await module.dispose(); assert.equal(closes, 1);
});
