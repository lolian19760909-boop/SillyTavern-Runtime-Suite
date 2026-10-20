import { createMotion } from './runtime/motion.mjs';
import { createProjectRuntime } from './runtime/projects.mjs';
import { createProjectStore } from './project/store.mjs';
import { importProjectFiles } from './project/import.mjs';
import { mountManager } from './ui/manager.mjs';
import { bindProjectSlots } from './runtime/declarative.mjs';

const ID = 'cxx-motion';
let engine = null;
let settingsNode = null;
let projects, store, manager, visualAPI, eventSource, chatEvent, activation, slots;
let settingsHost = null;
export function setSettingsHost(value) { settingsHost = value; }

const context = () => globalThis.SillyTavern.getContext();
const read = () => ({ enabled: true, reducedMotion: false, maxDpr: 2, maxFps: 60, ...context().extensionSettings[ID] });

function save(patch) {
  const host = context();
  host.extensionSettings[ID] = { ...host.extensionSettings[ID], ...patch };
  host.saveSettingsDebounced();
  engine.refresh();
  void projects.refresh();
}

function mountSettings() {
  const target = settingsHost || document.getElementById('extensions_settings');
  if (!target || settingsNode) return;
  settingsNode = document.createElement('details');
  settingsNode.id = `${ID}-settings`;
  const title = document.createElement('summary');
  title.textContent = 'Tavern Visual · 视觉运行环境';
  settingsNode.append(title);
  for (const [key, label] of [['enabled', '启用已适配页面的动效'], ['reducedMotion', '减少动态效果']]) {
    const row = document.createElement('label');
    row.className = 'checkbox_label';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = read()[key] === true;
    input.addEventListener('change', () => save({ [key]: input.checked }));
    const text = document.createElement('span');
    text.textContent = label;
    row.append(input, text);
    settingsNode.append(row);
  }
  const note = document.createElement('p');
  note.className = 'text_muted';
  note.textContent = '页面动效只作用于明确接入的页面；视觉作品使用独立播放器。';
  settingsNode.append(note);
  for (const [key, title, values] of [['maxDpr', 'GPU场景像素倍率上限', [1, 1.5, 2, 3]], ['maxFps', 'GPU场景帧率上限', [30, 60, 90, 120]]]) {
    const row = document.createElement('label'), text = document.createElement('span'), select = document.createElement('select');
    text.textContent = title;
    for (const value of values) { const option = document.createElement('option'); option.value = String(value); option.textContent = String(value); select.append(option); }
    select.value = String(read()[key]);
    select.addEventListener('change', () => save({ [key]: Number(select.value) }));
    row.append(text, select); settingsNode.append(row);
  }
  const qualityNote = document.createElement('p'); qualityNote.textContent = '画质参数在下次打开GPU场景时生效。较低像素倍率可减轻高分屏负担；实际帧率取决于设备与作品。'; settingsNode.append(qualityNote);
  manager = mountManager(settingsNode, { runtime: projects, store });
  target.append(settingsNode);
}

export function onActivate() {
  if (engine) return;
  const host = context();
  if (!host.extensionSettings || typeof host.saveSettingsDebounced !== 'function') throw new Error('Tavern Motion需要宿主的扩展设置接口。');
  if (typeof host.eventSource?.on !== 'function' || typeof host.eventSource?.removeListener !== 'function' || !host.eventTypes?.CHAT_CHANGED) throw new Error('视觉环境需要宿主的聊天切换事件接口。');
  engine = createMotion({ settings: read });
  projects = createProjectRuntime({ settings: read });
  projects.register({ id: 'shader-webgl2', version: '1', title: 'GPU着色器场景', load: () => import('./providers/shader.mjs') });
  projects.register({ id: 'web-bundle', version: '1', title: '网页视觉项目', load: () => import('./providers/web.mjs') });
  projects.register({ id: 'unity-web', version: '1', title: 'Unity Web导出接口', load: () => import('./providers/unity.mjs') });
  projects.register({ id: 'rive-webgl2', version: '2.44.2', title: 'Rive WebGL2', load: () => import('./providers/rive.mjs') });
  for (const backend of ['canvas', 'webgl']) projects.register({
    id: `dotlottie-${backend}`, version: '0.81.0', title: `dotLottie ${backend}`,
    load: async () => {
      const [{ createLottieProvider }, { DotLottie }] = await Promise.all([
        import('./providers/lottie.mjs'), import(`./vendor/dotlottie-${backend}-0.81.0.mjs`),
      ]);
      return createLottieProvider(DotLottie, new URL(`./vendor/dotlottie-${backend}-0.81.0.wasm`, import.meta.url).href);
    },
  });
  store = createProjectStore();
  activation = new AbortController();
  const library = store;
  const signal = activation.signal;
  visualAPI = Object.freeze({
    api: 1, version: '0.2.0', mount: projects.mount, register: projects.register,
    inspect: projects.inspect, diagnostics: projects.diagnostics, providers: projects.providers,
    importFiles: async selection => {
      const project = await importProjectFiles(selection, { signal });
      signal.throwIfAborted();
      await library.put(project);
      signal.throwIfAborted();
      await manager?.refresh();
      await slots?.reset();
      return project;
    },
    getProject: id => library.get(id),
  });
  globalThis.TavernMotion = engine;
  globalThis.TavernVisual = visualAPI;
  const chat = document.getElementById('chat');
  if (chat) slots = bindProjectSlots(chat, { getProject: visualAPI.getProject, mount: projects.mount });
  eventSource = host.eventSource;
  chatEvent = host.eventTypes?.CHAT_CHANGED;
  if (eventSource?.on && chatEvent) eventSource.on(chatEvent, closeProjects);
  globalThis.addEventListener('pagehide', clean);
  mountSettings();
}

function closeProjects() {
  void manager?.close().catch(console.error);
  void projects?.closeAll().then(() => slots?.reset()).catch(console.error);
}

export async function clean() {
  const previous = engine;
  activation?.abort();
  activation = null;
  if (eventSource?.removeListener && chatEvent) eventSource.removeListener(chatEvent, closeProjects);
  eventSource = chatEvent = null;
  globalThis.removeEventListener('pagehide', clean);
  const closing = [slots?.dispose(), manager?.dispose(), projects?.dispose(), store?.close()];
  slots = null;
  manager = projects = store = null;
  if (globalThis.TavernVisual === visualAPI) delete globalThis.TavernVisual;
  visualAPI = null;
  engine?.dispose();
  engine = null;
  settingsNode?.remove();
  settingsNode = null;
  if (globalThis.TavernMotion === previous) delete globalThis.TavernMotion;
  await Promise.allSettled(closing);
}

