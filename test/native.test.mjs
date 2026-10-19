import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextEngine } from '../context/engine.mjs';
import { createNativeAdapter, STATE, SOURCE } from '../context/native.mjs';
import { createBridge } from '../context/bridge.mjs';

function fixture(options = {}) {
  const events = new Map(), prompts = new Map();
  let disk, calls = 0, failSave = false, malformed = false, bridge;
  const names = ['GENERATION_AFTER_COMMANDS', 'MESSAGE_SENT', 'MESSAGE_RECEIVED', 'WORLDINFO_ENTRIES_LOADED', 'CHAT_COMPLETION_PROMPT_READY', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED'];
  const c = {
    characters: [{ avatar: 'plain.png', name: '普通角色' }], characterId: 0, groupId: null, id: 'chat', getCurrentChatId: () => c.id,
    mainApi: 'openai', chatCompletionSettings: { openai_max_context: 20000, openai_max_tokens: 1000 },
    chat: Array.from({ length: 10 }, (_, i) => ({ mes: `对话 ${i} ${'细节detail '.repeat(220)}`, name: i % 2 ? '角色' : '玩家', is_user: i % 2 === 0, extra: { preserved: i } })),
    chatMetadata: { other: { keep: 1 } }, getTokenCountAsync: async text => text.length,
    saveChat: async () => { if (failSave) throw new Error('保存失败'); disk = [{ chat_metadata: structuredClone(c.chatMetadata) }, ...structuredClone(c.chat)]; },
    eventTypes: Object.fromEntries(names.map(name => [name, name])),
    eventSource: { on(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); }, removeListener(name, fn) { events.get(name)?.delete(fn); } },
    setExtensionPrompt: (name, text) => prompts.set(name, text), stopGeneration: () => { c.stopped = true; },
  };
  const engine = createContextEngine({ context: () => c, bridge: () => bridge, settings: () => ({ recentTurns: 2, maxCalls: 1 }), readDisk: async () => structuredClone(disk), ...options });
  bridge = createBridge({ context: () => c, fallback: () => engine.available() ? engine.client : null, auxiliary: async input => {
    calls++;
    const data = JSON.parse(input.messages[1].content), ids = data.messages.map(row => row.sourceId);
    return { text: malformed ? '{}' : JSON.stringify({ covered: ids, items: [{ kind: '未结事项', text: '约定尚未完成。', sourceIds: ids }] }), usage: { source: 'unavailable' } };
  } });
  return {
    c, engine, bridge, prompts, calls: () => calls, disk: () => disk,
    failSave: value => { failSave = value; }, malformed: value => { malformed = value; },
    async emit(name, ...args) { for (const fn of events.get(name) || []) await fn(...args); },
    async prepare() { await this.emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false); return structuredClone(c.chat); },
    destroy() { bridge.destroy(); engine.destroy(); assert([...events.values()].every(set => set.size === 0)); },
  };
}

test('plain card compresses without MVU, persists sources and summaries, preserves original chat and complete recent turns', async () => {
  const f = fixture();
  try {
    const originals = f.c.chat.map(row => row.mes), rows = await f.prepare();
    await f.bridge.intercept(rows, 20000, () => assert.fail(f.bridge.status().error?.message), 'normal');
    assert.equal(f.calls(), 1); assert.equal(rows.length, 4);
    assert.equal(f.disk()[0].chat_metadata[STATE].compactions.length, 1);
    assert.deepEqual(f.c.chat.map(row => row.mes), originals); assert.equal(f.c.chatMetadata.variables, undefined);
    const payload = { chat: [{ role: 'system', content: [...f.prompts.values()].join('') }, ...rows.map(row => ({ role: row.is_user ? 'user' : 'assistant', content: row.mes }))] };
    const unrelated = { chat: [{ role: 'user', content: '独立辅助请求' }] };
    await f.emit('CHAT_COMPLETION_PROMPT_READY', unrelated); assert.equal(unrelated.chat[0].content, '独立辅助请求');
    await f.emit('CHAT_COMPLETION_PROMPT_READY', payload);
    assert(!JSON.stringify(payload).includes('TRSCTX_')); assert.equal(f.engine.status().lastRun.finalInputEstimate, JSON.stringify(payload.chat).length);
    await f.emit('GENERATION_ENDED'); const next = await f.prepare();
    await f.bridge.intercept(next, 20000, () => assert.fail(), 'normal'); assert.equal(f.calls(), 1); assert.equal(next.length, 4);
    assert.deepEqual(f.c.chatMetadata.other, { keep: 1 }); assert.equal(f.c.chat.at(-1).extra.preserved, 9);
  } finally { f.destroy(); }
});

test('new input receives a source before native history is copied; images and system messages remain complete', async () => {
  const f = fixture();
  try {
    await f.emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false);
    f.c.chat.push({ mes: '系统提示保持原样', is_system: true, name: 'system' });
    f.c.chat.push({ mes: '下一句', is_user: true, name: '玩家', extra: { media: [{ url: 'image.png' }] } });
    await f.emit('MESSAGE_SENT', 11); assert(f.c.chat.at(-1)[SOURCE]);
    const rows = structuredClone(f.c.chat); await f.bridge.intercept(rows, 20000, () => assert.fail(), 'normal');
    assert.equal(rows.at(-1).extra.media[0].url, 'image.png');
    assert(rows.some(row => row.is_system && row.mes === '系统提示保持原样'));
    const payload = { chat: [{ role: 'system', content: [...f.prompts.values()].join('') }, ...rows.map(row => ({ role: row.is_user ? 'user' : row.is_system ? 'system' : 'assistant', content: [{ type: 'text', text: row.mes }, { type: 'image_url', image_url: { url: 'image.png' } }] }))] };
    await f.emit('CHAT_COMPLETION_PROMPT_READY', payload); assert(!JSON.stringify(payload).includes('TRSCTX_')); assert(payload.chat.at(-1).content[1].image_url.url === 'image.png');
  } finally { f.destroy(); }
});

test('editing or swiping an ancestor invalidates summaries while an appended unregistered reply retains prior sources', async () => {
  const f = fixture();
  try {
    const rows = await f.prepare(); await f.bridge.intercept(rows, 20000, () => assert.fail(), 'normal'); await f.emit('GENERATION_ENDED');
    f.c.chat.push({ mes: '新回复', name: '角色', is_user: false }); await f.engine.refresh(); assert(f.engine.status().records.every(row => row.status === 'ready'));
    f.c.chat[0].mes += '修改'; await f.engine.refresh(); assert(f.engine.status().records.every(row => row.status === 'unverified'));
  } finally { f.destroy(); }
});

test('failed summary save is never activated; retry saves the same result without another model request', async () => {
  const f = fixture();
  try {
    const rows = await f.prepare(), save = f.c.saveChat; let saves = 0;
    f.c.saveChat = async () => { if (++saves === 2) throw new Error('摘要保存失败'); await save(); };
    let aborted = false; await f.bridge.intercept(rows, 20000, () => { aborted = true; }, 'normal');
    assert(aborted); assert.equal(rows.length, 10); assert(f.engine.status().pendingSave); assert.equal(f.engine.status().records.length, 0);
    await f.emit('GENERATION_STOPPED'); await f.engine.retrySave(); assert.equal(f.calls(), 1); assert.equal(f.engine.status().records.length, 1);
  } finally { f.destroy(); }
});

test('repeated malformed responses stop automatic attempts and exclusion keeps original source messages', async () => {
  const f = fixture();
  try {
    f.malformed(true);
    for (let i = 0; i < 3; i++) { const rows = await f.prepare(); let aborted = false; await f.bridge.intercept(rows, 20000, () => { aborted = true; }, 'normal'); assert(aborted); await f.emit('GENERATION_STOPPED'); }
    assert.equal(f.calls(), 2);
    f.malformed(false); await f.engine.allowRetry();
    const rows = await f.prepare(); await f.bridge.intercept(rows, 20000, () => assert.fail(), 'normal'); await f.emit('GENERATION_ENDED');
    await f.engine.exclude(f.engine.status().records[0].id);
    const next = await f.prepare(); await f.bridge.intercept(next, 20000, () => assert.fail(), 'normal'); assert.equal(next.length, 10); assert.equal(f.calls(), 3);
  } finally { f.destroy(); }
});

test('a card adapter replaces the ordinary engine and disconnect returns to the default engine without duplicate requests', async () => {
  const f = fixture();
  try {
    let cardCalls = 0;
    const disconnect = f.bridge.connect({ scope: { character: 'plain.png', chat: 'chat', group: null }, before: ({ rows }) => { cardCalls++; return { rows }; } });
    let rows = await f.prepare(); await f.bridge.intercept(rows, 20000, () => assert.fail(), 'normal'); assert.equal(cardCalls, 1); assert.equal(f.calls(), 0); assert.equal(f.bridge.status().mode, 'card');
    await f.emit('GENERATION_ENDED'); disconnect(); rows = await f.prepare(); await f.bridge.intercept(rows, 20000, () => assert.fail(), 'normal'); assert.equal(f.calls(), 1);
  } finally { f.destroy(); }
});

test('ordinary adapter does not attach to a group or take over a 2051 story before its own adapter is ready', async () => {
  const f = fixture();
  try {
    for (const kind of ['group', 'card']) {
      if (kind === 'group') f.c.groupId = 'g'; else { f.c.groupId = null; f.c.chatMetadata.__cxx_story_profile = { schema: 1 }; }
      const rows = await f.prepare(); await f.bridge.intercept(rows, 20000, () => assert.fail(), 'normal'); assert.equal(f.calls(), 0); assert.equal(rows.length, 10);
    }
  } finally { f.destroy(); }
});

test('native store preserves unknown fields and cannot retry a pending save into another branch', async () => {
  const f = fixture(), adapter = createNativeAdapter({ context: () => f.c, readDisk: async () => structuredClone(f.disk()) });
  try {
    await adapter.ensureSources(); f.failSave(true); let mutations = 0;
    await assert.rejects(adapter.store.update(value => { mutations++; value.extra = { keep: true }; })); assert(adapter.store.status().pending);
    f.failSave(false); await adapter.store.retry(); assert.equal(mutations, 1); assert.deepEqual(adapter.store.read().extra, { keep: true });
    f.failSave(true); await assert.rejects(adapter.store.update(value => { value.enabled = false; })); f.failSave(false); f.c.chat[0].mes += '改变'; await assert.rejects(adapter.store.retry(), /变化/);
  } finally { adapter.destroy(); f.destroy(); }
});
