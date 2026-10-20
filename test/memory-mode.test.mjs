import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryModes } from '../context/memory-mode.mjs';
import { createBridge } from '../context/bridge.mjs';
import { createContextEngine } from '../context/engine.mjs';

test('数据库自动检测只读实时表格，空库也不创建第二套摘要', () => {
  const table = Object.freeze({ content: Object.freeze([Object.freeze(['name']), Object.freeze(['keep'])]) });
  const global = { AutoCardUpdaterAPI: { exportTableAsJson: () => ({ sheet_1: table }), registerTableUpdateCallback() {} } };
  const settings = { memoryMode: 'auto' }, modes = createMemoryModes({ global, settings: () => settings });
  assert.deepEqual(modes.resolve().provider, { id: 'shujuku', title: '龙血玄黄·数据库', tables: 1, rows: 1 });
  global.AutoCardUpdaterAPI.exportTableAsJson = () => ({});
  assert.equal(modes.resolve().mode, 'database');
  settings.memoryMode = 'summary'; assert.equal(modes.resolve().mode, 'summary');
  settings.memoryMode = 'database'; delete global.AutoCardUpdaterAPI;
  assert.throws(() => modes.resolve(), /尚未找到/);
  settings.memoryMode = 'auto'; assert.equal(modes.resolve().mode, 'summary');
});

test('第三方数据库按公开适配器登记和解除；读取故障不会静默触发收费摘要', () => {
  const modes = createMemoryModes({ global: {} });
  const off = modes.register({ id: 'example', title: '示例数据库', probe: () => ({ tables: 2 }) });
  assert.equal(modes.resolve().provider.id, 'example'); off(); assert.equal(modes.resolve().mode, 'summary');
  modes.register({ id: 'broken', probe() { throw new Error('数据库尚在切换'); } });
  assert.throws(() => modes.resolve(), /尚在切换/);
});

test('普通卡数据库模式保留原文、世界书与辅助请求，不调用摘要或写表；模式固定到回合结束', async () => {
  const listeners = new Map(), prompts = new Map(), globals = { AutoCardUpdaterAPI: { exportTableAsJson: () => ({}), registerTableUpdateCallback() {} } };
  const events = ['GENERATION_AFTER_COMMANDS','MESSAGE_SENT','MESSAGE_RECEIVED','WORLDINFO_ENTRIES_LOADED','CHAT_COMPLETION_PROMPT_READY','GENERATION_ENDED','GENERATION_STOPPED','CHAT_CHANGED'];
  const ctx = {
    characters: [{ avatar: 'plain.png' }], characterId: 0, groupId: null, getCurrentChatId: () => 'a', mainApi: 'openai',
    chat: [{ mes: 'old', is_user: true, extra: { database: 17 } }, { mes: 'reply', is_user: false }], chatMetadata: {},
    chatCompletionSettings: { openai_max_context: 16000, openai_max_tokens: 1000 },
    getTokenCountAsync: async text => text.length, saveChat: () => assert.fail('数据库模式不登记普通卡摘要来源'),
    eventTypes: Object.fromEntries(events.map(name => [name,name])),
    eventSource: { on(name, fn) { listeners.set(name, fn); }, removeListener(name) { listeners.delete(name); } },
    setExtensionPrompt: (id, text) => prompts.set(id,text), stopGeneration: () => assert.fail(),
  };
  const modes = createMemoryModes({ global: globals });
  let bridge;
  const engine = createContextEngine({ context: () => ctx, bridge: () => bridge });
  bridge = createBridge({ context: () => ctx, memoryModes: modes, fallback: () => engine.client, auxiliary: () => assert.fail('重复摘要') });
  await listeners.get('GENERATION_AFTER_COMMANDS')('normal', {}, false);
  delete globals.AutoCardUpdaterAPI; // Loading/unloading mid-round cannot switch ownership.
  await listeners.get('MESSAGE_SENT')(0);
  const rows = structuredClone(ctx.chat), before = structuredClone(rows);
  await bridge.intercept(rows,16000,() => assert.fail(),'normal');
  assert.deepEqual(rows,before); assert.equal(engine.status().lastRun.calls,0);
  assert.equal(bridge.status().memory.mode,'database');
  const lore = { chatLore: [{ world:'acu',uid:1,content:'table record' }] }, payload = { chat:[{ role:'user',content:'database fill request' }] };
  await listeners.get('WORLDINFO_ENTRIES_LOADED')(lore);
  await listeners.get('CHAT_COMPLETION_PROMPT_READY')(payload);
  assert.equal(lore.chatLore[0].content,'table record'); assert.equal(payload.chat[0].content,'database fill request');
  assert([...prompts.values()].every(value => !value));
  await listeners.get('GENERATION_ENDED')(); assert.equal(bridge.status().memory.mode,'summary');
  bridge.destroy(); engine.destroy(); assert.equal(listeners.size,0);
});
