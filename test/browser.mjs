import { checkMessages } from './messages.browser.mjs';
const events = new Map(), prompts = new Map(), results = [], errors = [];
const status = document.getElementById('status'), report = document.getElementById('report'), checkButton = document.getElementById('check');
const names = ['GENERATION_AFTER_COMMANDS', 'MESSAGE_SENT', 'MESSAGE_RECEIVED', 'WORLDINFO_ENTRIES_LOADED', 'CHAT_COMPLETION_PROMPT_READY', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED'];
const data = Array.from({ length: 10 }, (_, i) => ({ mes: `第${i}段 ${'普通聊天的细节。'.repeat(220)}`, name: i % 2 ? '角色' : '玩家', is_user: i % 2 === 0, extra: { preserved: i } }));
const c = {
  characters: [{ avatar: 'fixture.png', name: '普通角色' }], characterId: 0, groupId: null, id: 'chat', getCurrentChatId: () => c.id,
  chat: structuredClone(data), chatMetadata: { keep: { value: 1 } }, mainApi: 'openai',
  chatCompletionSettings: { openai_max_context: 20000, openai_max_tokens: 1000, chat_completion_source: 'fixture' },
  extensionSettings: { 'tavern-runtime-suite': { context: true, visual: true, recentTurns: 2, maxCalls: 1 } },
  getTokenCountAsync: async text => text.length, getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
  extractMessageFromData: result => result.choices[0].message.content,
  saveChat: async () => { const response = await fetch('/fixture/save', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify([{ chat_metadata: c.chatMetadata }, ...c.chat]) }); if (!response.ok) throw new Error('fixture save failed'); },
  saveSettingsDebounced() {}, setExtensionPrompt: (name, text) => prompts.set(name, text), stopGeneration() { c.stopped = true; },
  eventTypes: Object.fromEntries(names.map(name => [name, name])),
  eventSource: { on(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); }, removeListener(name, fn) { events.get(name)?.delete(fn); } },
};
globalThis.SillyTavern = { getContext: () => c };
globalThis.toastr = { error: message => errors.push(message) };
globalThis.addEventListener('error', event => errors.push(event.message));
globalThis.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const assert = (value, text) => { if (!value) throw new Error(text); };
const until = async fn => { const end = Date.now() + 10000; while (!fn()) { if (Date.now() > end) throw new Error('检查等待超时'); await new Promise(resolve => setTimeout(resolve, 20)); } };
const emit = async (name, ...args) => { for (const fn of events.get(name) || []) await fn(...args); };
const countListeners = () => [...events.values()].reduce((n, values) => n + values.size, 0);
const output = text => { status.textContent = text; report.textContent = JSON.stringify({ status: text, checks: results, errors, listeners: countListeners(), suite: globalThis.TavernRuntimeSuite?.status() }, null, 2); };
const suite = await import('../index.js');
await until(() => globalThis.TavernRuntimeSuite?.status().context.active && globalThis.TavernRuntimeSuite?.status().visual.active);
document.querySelector('#tavern-runtime-suite').open = true;
checkButton.disabled = false; output('准备就绪');

checkButton.addEventListener('click', async () => {
  checkButton.disabled = true;
  try {
    assert(typeof globalThis.TavernRuntimeSuite_intercept === 'function', '宿主拦截器未发布');
    const original = c.chat.map(row => row.mes);
    await emit('GENERATION_AFTER_COMMANDS', 'normal', {}, false);
    const rows = structuredClone(c.chat);
    await globalThis.TavernRuntimeSuite_intercept(rows, 20000, () => { throw new Error(globalThis.CxxContextBridge.status().error?.message); }, 'normal');
    const payload = { chat: [{ role: 'system', content: [...prompts.values()].join('') }, ...rows.map(row => ({ role: row.is_user ? 'user' : 'assistant', content: row.mes }))] };
    await emit('CHAT_COMPLETION_PROMPT_READY', payload); await emit('GENERATION_ENDED');
    assert(rows.length === 4 && !JSON.stringify(payload).includes('TRSCTX_'), '压缩或临时标记错误');
    assert(JSON.stringify(c.chat.map(row => row.mes)) === JSON.stringify(original), '原文被改变');
    assert(globalThis.TavernContext.status().records.length === 1 && c.chatMetadata.keep.value === 1, '摘要或未知字段未保存');
    results.push({ name: '普通卡实际发送链、保存读回、最终预算和原文', pass: true, kept: rows.length });
    results.push(await checkMessages({ context: c, assert, until }));
    const labels = [...document.querySelectorAll('#tavern-runtime-suite>label')], contextToggle = labels[0].querySelector('input'), visualToggle = labels[1].querySelector('input');
    visualToggle.click(); await until(() => !globalThis.TavernRuntimeSuite.status().visual.active);
    assert(globalThis.TavernRuntimeSuite.status().context.active && !globalThis.TavernVisual, '动画开关影响上下文或未清理');
    visualToggle.click(); await until(() => globalThis.TavernRuntimeSuite.status().visual.active);
    const manifest = await (await fetch('../examples/graphic-web/project.json')).json();
    const files = [new File([JSON.stringify(manifest)], 'project.json', { type: 'application/json' })];
    for (const resource of manifest.resources) files.push(new File([await (await fetch('../examples/graphic-web/' + resource.path)).arrayBuffer()], resource.path, { type: resource.type }));
    const project = await globalThis.TavernVisual.importFiles(files);
    const stage = document.getElementById('stage'); stage.style.colorScheme = 'dark';
    const playback = globalThis.TavernVisual.mount(project, document.getElementById('stage'));
    await playback.ready; await playback.trigger('reveal');
    const projectFrame = stage.querySelector('iframe');
    assert(projectFrame.style.colorScheme === 'dark', '网页作品初始配色未跟随容器');
    for (const scheme of ['light', 'dark']) {
      stage.style.colorScheme = scheme;
      await until(() => projectFrame.style.colorScheme === scheme);
    }
    results.push({ name: '网页作品初始透明配色与播放中的深浅切换', pass: true });
    assert(globalThis.TavernVisual.diagnostics().sessions.length === 1, '网页作品未运行');
    contextToggle.click(); await until(() => !globalThis.TavernRuntimeSuite.status().context.active);
    assert(globalThis.TavernRuntimeSuite.status().visual.active && globalThis.TavernVisual.diagnostics().sessions.length === 1, '上下文开关中断作品');
    contextToggle.click(); await until(() => globalThis.TavernRuntimeSuite.status().context.active);
    await playback.trigger('dissolve'); await playback.trigger('reveal');
    results.push({ name: '两个模块分别启停，真实网页作品显现与消散', pass: true });
    const oldChat = c.chat, oldMetadata = c.chatMetadata;
    c.id = 'another'; c.chat = [{ mes: '另一个聊天', is_user: true, name: '玩家' }]; c.chatMetadata = {};
    await emit('CHAT_CHANGED'); await until(() => globalThis.TavernVisual.diagnostics().sessions.length === 0);
    assert(document.getElementById('stage').querySelectorAll('iframe').length === 0, '切聊天未清理作品');
    c.id = 'chat'; c.chat = oldChat; c.chatMetadata = oldMetadata; await emit('CHAT_CHANGED');
    for (let i = 0; i < 6; i++) { visualToggle.click(); visualToggle.click(); }
    await until(() => globalThis.TavernRuntimeSuite.status().visual.active && !!globalThis.TavernVisual);
    assert(document.querySelectorAll('#cxx-motion-settings').length === 1, '重复视觉设置');
    await suite.clean(); assert(countListeners() === 0 && !globalThis.CxxContextBridge && !globalThis.TavernVisual, '卸载未清理');
    suite.onActivate(); await until(() => globalThis.TavernRuntimeSuite.status().context.active && globalThis.TavernRuntimeSuite.status().visual.active);
    assert(document.querySelectorAll('#tavern-runtime-suite').length === 1, '重复套件设置');
    document.querySelector('#tavern-runtime-suite').open = true;
    results.push({ name: '聊天切换、反向开关、卸载归零与重建', pass: true });
    const again = await globalThis.TavernVisual.getProject('graphic-web-example@1');
    const finalPlayback = globalThis.TavernVisual.mount(again, document.getElementById('stage')); await finalPlayback.ready; await finalPlayback.trigger('reveal');
    document.querySelectorAll('#tavern-runtime-suite button')[0].click();
    output('完整检查通过');
  } catch (failure) { errors.push(failure.stack || failure.message); output('检查失败'); }
});
