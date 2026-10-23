import { createModuleSwitch } from './runtime/modules.mjs';
import { Compact, Requests } from './context/core.mjs';
import { createBridge } from './context/bridge.mjs';
import { createAuxiliary } from './context/auxiliary.mjs';
import { createContextEngine } from './context/engine.mjs';
import { createMemoryModes } from './context/memory-mode.mjs';

const ID = 'tavern-runtime-suite';
const host = () => globalThis.SillyTavern.getContext();
const defaults = { context: true, visual: true, recentTurns: 6, maxCalls: 2, memoryMode: 'auto' };
const memoryModes = createMemoryModes({ settings: () => settings() });
const settings = () => ({ ...defaults, ...host().extensionSettings[ID] });
let root, notice, contextView, visualView, contextModule, visualModule, publicAPI, contextAPI, eventSource, chatEvent, endEvent;
const onHostEvent = () => { void refresh(); };
const report = failure => {
  if (notice) notice.textContent = failure?.message || String(failure);
  globalThis.toastr?.error(failure?.message || String(failure), 'Tavern Runtime Suite');
};
const element = (tag, text, parent) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
};
async function action(fn) {
  try { await fn(); if (notice) notice.textContent = ''; await refresh(); }
  catch (failure) { report(failure); }
}
function button(text, parent, fn) {
  const node = element('button', text, parent); node.type = 'button';
  node.addEventListener('click', () => { void action(fn); });
  return node;
}
function renderContext() {
  if (!contextView) return;
  contextView.replaceChildren();
  const unit = contextModule?.current(), state = contextModule?.status();
  if (!unit) { element('p', state?.error || '上下文模块已关闭。', contextView); return; }
  const bridgeState = unit.bridge.status();
  const memory = bridgeState.memory;
  element('p', memory.mode === 'database' ? `数据库模式：${memory.provider?.title || '等待数据库'}。数据库负责历史与召回，套件保留原聊天，不重复摘要。` : '套件摘要模式：按来源整理较早对话。', contextView);
  if (memory.provider) element('p', `当前数据库可读表格 ${memory.provider.tables ?? '—'} 张、数据 ${memory.provider.rows ?? '—'} 行。该计数不代表历史已全部填表。`, contextView);
  if (bridgeState.mode === 'card') {
    element('p', memory.mode === 'database' ? '当前卡保留自身的视角筛选与数据库召回。记忆记录在卡内面板管理。' : '当前卡已接入专用记忆适配。请在卡内记忆／压缩面板管理摘要；使用同一套插件压缩核心。', contextView);
    if (bridgeState.error || memory.error) element('output', bridgeState.error?.message || memory.error, contextView).className = 'trs-error';
    return;
  }
  const value = unit.engine.status();
  if (memory.mode === 'database') {
    if (bridgeState.error || memory.error) element('output', bridgeState.error?.message || memory.error, contextView).className = 'trs-error';
    return;
  }
  element('p', value.available ? `当前聊天：自动压缩${value.enabled ? '已开启' : '已关闭'}。较早对话整理后使用摘要，原聊天保留。` : '请打开普通单角色聊天并使用 Chat Completion 连接。配套卡由自己的适配器接管，群聊尚未接通。', contextView);
  if (!value.available) return;
  button(value.enabled ? '关闭本聊天自动压缩' : '开启本聊天自动压缩', contextView, () => unit.engine.setEnabled(!value.enabled));
  if (value.pendingSave) button('重试保存', contextView, unit.engine.retrySave);
  button('允许重新整理', contextView, unit.engine.allowRetry);
  if (value.busy) button('取消整理', contextView, unit.engine.cancel);
  const run = value.lastRun;
  if (run) element('p', `整理范围估算：${run.beforeTokens ?? '—'} → ${run.afterTokens ?? '—'} token；额外调用 ${run.calls ?? 0} 次。完整提示估算：${run.finalInputEstimate ?? '—'} / ${run.budget?.input ?? '—'}。`, contextView);
  if (bridgeState.error || value.error) element('output', bridgeState.error?.message || value.error, contextView).className = 'trs-error';
  element('h4', `已保存摘要（${value.records.length}）`, contextView);
  for (const record of value.records) {
    const item = element('details', undefined, contextView); item.className = 'trs-record';
    const names = { ready: '可用', excluded: '已停用', unverified: '原文已变化或尚未核对' };
    element('summary', `${names[record.status] || record.status} · ${record.sources.length} 条来源 · ${new Date(record.createdAt).toLocaleString()}`, item);
    for (const line of record.items) element('p', `${line.kind}：${line.text}`, item);
    button(record.status === 'excluded' ? '恢复摘要' : '停用摘要', item, () => record.status === 'excluded' ? unit.engine.include(record.id) : unit.engine.exclude(record.id));
  }
}
async function refresh() {
  try { await contextModule?.current()?.engine.refresh(); renderContext(); }
  catch (failure) { report(failure); }
}
function mountSettings() {
  const target = document.getElementById('extensions_settings') || document.getElementById('extensions_settings2');
  if (!target) throw new Error('宿主扩展设置容器尚未就绪。');
  root = element('details', undefined, target); root.id = ID;
  element('summary', 'Tavern Runtime Suite · 上下文与视觉', root);
  notice = element('output', '', root); notice.className = 'trs-error';
  for (const [key, text, module] of [['context', '启用上下文模块（使用当前模型整理旧对话）', contextModule], ['visual', '启用动画与视觉作品模块', visualModule]]) {
    const row = element('label', undefined, root), input = element('input', undefined, row);
    input.type = 'checkbox'; input.checked = settings()[key] === true; element('span', text, row);
    input.addEventListener('change', () => { void action(async () => {
      host().extensionSettings[ID] = { ...settings(), [key]: input.checked }; host().saveSettingsDebounced();
      await module.set(input.checked);
    }); });
  }
  for (const [key, text, max] of [['recentTurns', '保留最近完整轮次', 50], ['maxCalls', '每轮最多整理次数', 5]]) {
    const row = element('label', undefined, root); element('span', text, row);
    const input = element('input', undefined, row); input.type = 'number'; input.min = '1'; input.max = String(max); input.value = String(settings()[key]);
    input.addEventListener('change', () => { void action(async () => {
      if (contextModule?.current()?.engine.status().busy || contextModule?.current()?.bridge.status().session) { input.value = String(settings()[key]); throw new Error('请等待本轮回复结束后再调整参数。'); }
      const value = Number(input.value);
      if (!Number.isSafeInteger(value) || value < 1 || value > max) { input.value = String(settings()[key]); throw new Error(`请输入1到${max}的整数。`); }
      host().extensionSettings[ID] = { ...settings(), [key]: value }; host().saveSettingsDebounced();
    }); });
  }
  const modeRow = element('label', undefined, root);
  element('span', '记忆处理', modeRow);
  const mode = element('select', undefined, modeRow);
  for (const [value, title] of [['auto', '自动：检测到数据库时交给数据库'], ['summary', '套件摘要'], ['database', '数据库模式']]) {
    const option = element('option', title, mode); option.value = value;
  }
  mode.value = settings().memoryMode;
  mode.addEventListener('change', () => { void action(async () => {
    if (contextModule?.current()?.bridge.status().session) { mode.value = settings().memoryMode; throw new Error('请等本轮回复结束后再切换记忆模式。'); }
    host().extensionSettings[ID] = { ...settings(), memoryMode: mode.value }; host().saveSettingsDebounced();
  }); });
  element('p', '上述参数用于普通聊天；接入专用记忆的卡片由卡内面板控制具体规则。', root);
  button('刷新上下文记录', root, refresh);
  contextView = element('section', undefined, root); contextView.className = 'trs-section';
  visualView = element('section', undefined, root); visualView.className = 'trs-section';
}
export function TavernRuntimeSuite_intercept(...args) {
  const unit = contextModule?.current();
  if (unit && globalThis.CxxContextBridge !== unit.bridge) {
    args[2]?.(true); report(new Error('旧上下文插件覆盖了套件接口，请停用旧插件后刷新酒馆。')); return;
  }
  return unit?.bridge.intercept(...args);
}
export function onActivate() {
  if (root) return;
  if (globalThis.TavernRuntimeSuite) throw new Error('运行套件已经加载。');
  contextModule = createModuleSwitch(async () => {
    if (globalThis.CxxContextBridge) throw new Error('请先停用旧的独立上下文桥，再启用套件上下文模块。');
    let bridge;
    const engine = createContextEngine({ context: host, bridge: () => bridge, settings });
    bridge = createBridge({ context: host, auxiliary: createAuxiliary({ context: host }), report, memoryModes, fallback: () => engine.available() ? engine.client : null, worldInfo: () => import('/scripts/world-info.js') });
    globalThis.CxxContextBridge = bridge;
    return { bridge, engine, async dispose() { bridge.destroy(); engine.destroy(); if (globalThis.CxxContextBridge === bridge) delete globalThis.CxxContextBridge; } };
  });
  visualModule = createModuleSwitch(async () => {
    if (globalThis.TavernVisual || globalThis.TavernMotion) throw new Error('请先停用旧的独立动画插件，再启用套件动画模块。');
    const visual = await import('./visual/index.js'); visual.setSettingsHost(visualView);
    try { visual.onActivate(); } catch (failure) { await visual.clean(); throw failure; }
    return { dispose: visual.clean };
  });
  mountSettings();
  contextAPI = Object.freeze({ api: 1, core: Object.freeze({ Compact, Requests }), memory: memoryModes.status, registerDatabase: memoryModes.register, status: () => contextModule?.current()?.engine.status() || { enabled: false }, bridge: () => contextModule?.current()?.bridge });
  publicAPI = Object.freeze({ api: 1, version: '0.4.0', status: () => ({ context: contextModule.status(), visual: visualModule.status(), memory: memoryModes.status() }) });
  globalThis.TavernContext = contextAPI; globalThis.TavernRuntimeSuite = publicAPI;
  globalThis.TavernRuntimeSuite_intercept = TavernRuntimeSuite_intercept;
  eventSource = host().eventSource; chatEvent = host().eventTypes.CHAT_CHANGED; endEvent = host().eventTypes.GENERATION_ENDED;
  for (const name of [chatEvent, endEvent]) eventSource.on(name, onHostEvent);
  globalThis.addEventListener('pagehide', clean);
  const owner = root;
  void Promise.allSettled([contextModule.set(settings().context), visualModule.set(settings().visual)]).then(results => {
    if (root !== owner) return;
    for (const result of results) if (result.status === 'rejected') report(result.reason);
    renderContext();
  });
}
export async function clean() {
  for (const name of [chatEvent, endEvent]) if (name) eventSource?.removeListener(name, onHostEvent);
  globalThis.removeEventListener('pagehide', clean);
  const modules = [contextModule, visualModule];
  if (globalThis.TavernContext === contextAPI) delete globalThis.TavernContext;
  if (globalThis.TavernRuntimeSuite === publicAPI) delete globalThis.TavernRuntimeSuite;
  if (globalThis.TavernRuntimeSuite_intercept === TavernRuntimeSuite_intercept) delete globalThis.TavernRuntimeSuite_intercept;
  root?.remove(); root = notice = contextView = visualView = null;
  await Promise.allSettled(modules.map(module => module?.dispose()));
}
onActivate();
