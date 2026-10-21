// Display ownership only. The host continues to own chat, swipes and the editor.
export function createMessageRenderer({ document: doc, context, sanitize, markdown, settings = () => ({}) }) {
  const view = doc.defaultView, adapters = new Map(), formats = new Map(), mounted = new Map();
  const dirty = new Set(), errors = [], listeners = [];
  let disposed = false, frame = null, full = true, chatRoot = null, revision = 0;
  const counts = { rendered: 0, stale: 0, failed: 0 };
  const html = value => {
    const template = doc.createElement('template');
    template.innerHTML = sanitize(String(value));
    return template.content;
  };
  formats.set('text', source => doc.createTextNode(String(source)));
  formats.set('markdown', source => html(markdown(String(source))));
  formats.set('host', (source, meta = {}) => {
    const c = context();
    if (typeof c.messageFormatting !== 'function') throw new Error('宿主没有提供消息格式接口，可改用 markdown 或 text。');
    // Already sanitized by the host. Do not remove its approved media attributes.
    const template = doc.createElement('template');
    template.innerHTML = c.messageFormatting(String(source), meta.name || '', !!meta.isSystem, !!meta.isUser, meta.floor);
    return template.content;
  });
  function format(id, source, meta) {
    const render = formats.get(id);
    if (!render) throw new Error(`尚未登记显示格式：${id}`);
    const result = render(source, meta);
    if (!result || typeof result.nodeType !== 'number') throw new TypeError('显示格式必须返回 DOM 节点。');
    return result;
  }
  function registerFormat(id, render) {
    if (disposed || !/^[a-z][a-z0-9-]*$/.test(id) || typeof render !== 'function' || formats.has(id)) throw new Error('显示格式登记无效或重复。');
    formats.set(id, render);
    return () => { if (formats.get(id) === render) { formats.delete(id); refresh(); } };
  }
  function report(error, id, floor) {
    counts.failed++;
    errors.push({ adapter: id, floor, message: error.message || String(error) });
    if (errors.length > 12) errors.shift();
  }
  function release(node, token, restore = false) {
    mounted.delete(node); token.controller.abort();
    try { token.cleanup?.(); } catch (error) { report(error, token.adapter.id, token.floor); }
    // Restore the current host display only when our own surface is still here.
    if (restore && node.contains(token.surface)) {
      try {
        const c = context(), row = c.chat?.[token.floor];
        if (row && c.getCurrentChatId?.() === token.chat && !node.closest('.mes')?.querySelector('.edit_textarea,#curEditTextarea')) {
          node.replaceChildren(format('host', row.mes || '', { floor: token.floor, name: row.name, isUser: row.is_user, isSystem: row.is_system }));
        }
      } catch (error) { report(error, token.adapter.id, token.floor); }
    }
  }
  function normalizeClasses(surface, prefixes) {
    if (!prefixes?.length) return;
    for (const node of surface.querySelectorAll('[class]')) for (const name of [...node.classList]) {
      if (name.startsWith('custom-') && prefixes.some(prefix => name.slice(7).startsWith(prefix))) {
        node.classList.add(name.slice(7));
      }
    }
  }
  function renderMessage(mes, ordered) {
    const floor = Number(mes.getAttribute('mesid')), node = mes.querySelector('.mes_text'), c = context(), row = c.chat?.[floor];
    const previous = mounted.get(node);
    if (!node || !Number.isInteger(floor) || !row) return;
    if (mes.querySelector('.edit_textarea,#curEditTextarea') || mes.classList.contains('mes_editing')) {
      if (previous) release(node, previous); return;
    }
    const meta = { floor, row, raw: row.mes || '', swipe: row.swipe_id || 0, chat: c.getCurrentChatId?.(), character: c.characters?.[c.characterId]?.avatar };
    let adapter, key;
    try {
      adapter = ordered.find(candidate => candidate.matches(meta));
      if (!adapter) { if (previous) release(node, previous, true); return; }
      key = JSON.stringify([meta.chat, meta.character, meta.swipe, meta.raw, adapter.revision?.(meta) ?? '', revision]);
    } catch (error) { report(error, adapter?.id || 'match', floor); return; }
    if (previous?.adapter === adapter && previous.key === key && (previous.pending || node.contains(previous.surface))) return;
    if (previous) release(node, previous);
    const controller = new AbortController(), surface = doc.createElement('div');
    surface.dataset.trsMessage = adapter.id;
    surface.style.cssText = 'min-width:0;max-width:100%;display:flow-root';
    const token = { adapter, key, surface, controller, floor, chat: meta.chat, cleanup: null, pending: true };
    // Track in-flight work too. A swipe, edit, deletion or chat switch invalidates it.
    mounted.set(node, token);
    const current = () => !disposed && !controller.signal.aborted && mounted.get(node) === token && node.isConnected &&
      context().getCurrentChatId?.() === meta.chat && context().chat?.[floor] === row && row.mes === meta.raw && (row.swipe_id || 0) === meta.swipe &&
      !mes.querySelector('.edit_textarea,#curEditTextarea');
    const commit = result => {
      if (!current()) { counts.stale++; result?.dispose?.(); return; }
      const content = result?.content || result;
      if (!content || typeof content.nodeType !== 'number') throw new TypeError('消息渲染必须返回 DOM 节点或 {content,dispose}。');
      surface.append(content); normalizeClasses(surface, adapter.classPrefixes);
      token.cleanup = result?.dispose;
      node.replaceChildren(surface); token.pending = false; counts.rendered++;
      adapter.mounted?.({ ...meta, surface, signal: controller.signal });
    };
    try {
      const result = adapter.render({ ...meta, document: doc, signal: controller.signal, format, status: createStatus });
      if (result?.then) result.then(commit).catch(error => { if (current()) { report(error, adapter.id, floor); release(node, token); } });
      else commit(result);
    } catch (error) { report(error, adapter.id, floor); release(node, token); }
  }
  function scan() {
    frame = null; if (disposed) return;
    const chat = doc.getElementById('chat');
    if (chat !== chatRoot) { chatRoot = chat; full = true; }
    for (const [node, token] of mounted) if (!chat?.contains(node)) release(node, token);
    const ordered = [...adapters.values()].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const nodes = full ? chat?.querySelectorAll('.mes[mesid]') || [] : [...dirty].map(id => chat?.querySelector(`.mes[mesid="${id}"]`)).filter(Boolean);
    dirty.clear(); full = false;
    for (const mes of nodes) renderMessage(mes, ordered);
  }
  function refresh(floors) {
    if (disposed) return;
    if (Array.isArray(floors)) floors.forEach(id => { if (Number.isInteger(id)) dirty.add(id); });
    else full = true;
    if (frame === null) frame = view.requestAnimationFrame(scan);
  }
  function register(adapter) {
    if (disposed || !adapter?.id || typeof adapter.matches !== 'function' || typeof adapter.render !== 'function' || adapters.has(adapter.id)) throw new Error('消息渲染适配登记无效或重复。');
    adapters.set(adapter.id, adapter); refresh();
    return () => {
      if (adapters.get(adapter.id) !== adapter) return;
      adapters.delete(adapter.id);
      for (const [node, token] of mounted) if (token.adapter === adapter) release(node, token, true);
      refresh();
    };
  }
  function createStatus({ state = 'loading', title = '正在准备正文', description = '', detail = '', action, actionLabel = '重新读取' } = {}) {
    const surface = doc.createElement('section'); surface.className = 'trs-reading-state'; surface.dataset.state = state;
    surface.setAttribute('role', 'status'); surface.setAttribute('aria-live', 'polite');
    const mark = doc.createElement('span'); mark.className = 'trs-reading-mark'; mark.setAttribute('aria-hidden', 'true');
    const copy = doc.createElement('div'), heading = doc.createElement('strong'); heading.textContent = title; copy.append(heading);
    if (description) { const p = doc.createElement('p'); p.textContent = description; copy.append(p); }
    if (action) {
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = actionLabel;
      let failure;
      button.addEventListener('click', async () => { if (button.disabled) return; button.disabled = true; try { await action(); } catch (error) { failure ||= doc.createElement('p'); failure.textContent = error.message || String(error); copy.append(failure); } finally { button.disabled = false; } });
      copy.append(button);
    }
    if (detail) { const details = doc.createElement('details'), summary = doc.createElement('summary'), p = doc.createElement('p'); summary.textContent = '查看原因'; p.textContent = detail; details.append(summary, p); copy.append(details); }
    surface.append(mark, copy); return surface;
  }
  const style = doc.createElement('style'); style.dataset.trsRenderer = '1';
  style.textContent = `
    .trs-reading-state{display:flex;align-items:flex-start;gap:16px;margin:8px 0;padding:20px 0;max-width:560px;color:var(--cxx-text,#e7e8e9);font:15px/1.65 var(--cxx-font-ui,sans-serif);text-align:start}
    .trs-reading-mark{box-sizing:border-box;flex:0 0 20px;height:20px;margin-top:4px;border:2px solid #61c7ce35;border-top-color:var(--cxx-cyan,#61c7ce);border-radius:50%;animation:trs-reading-turn 1s linear infinite}
    .trs-reading-state>div{min-width:0}.trs-reading-state strong{display:block;font-size:17px;font-weight:600;letter-spacing:.02em;text-wrap:balance}
    .trs-reading-state p{margin:5px 0 0;color:var(--cxx-muted,#a2a8aa);font-size:14px;overflow-wrap:anywhere;text-wrap:pretty}
    .trs-reading-state button{min-height:44px;margin:12px 0 0;padding:6px 16px;border:1px solid var(--cxx-cyan,#61c7ce);background:transparent;color:var(--cxx-cyan,#61c7ce);font:inherit;cursor:pointer}
    .trs-reading-state button:focus-visible{outline:2px solid #61c7ce;outline-offset:3px}.trs-reading-state details{margin-top:10px;font-size:14px}.trs-reading-state summary{cursor:pointer}
    .trs-reading-state[data-state=error] .trs-reading-mark{animation:none;border-color:var(--cxx-red-soft,#ef7177);border-radius:3px}
    @keyframes trs-reading-turn{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.trs-reading-mark{animation:none}}
    [data-trs-reduced-motion=true] .trs-reading-mark{animation:none}
  `;
  doc.head.append(style);
  const observer = new view.MutationObserver(records => {
    for (const record of records) {
      const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (node?.closest('[data-trs-message]')) continue;
      const mes = node?.closest('.mes[mesid]');
      if (mes) refresh([Number(mes.getAttribute('mesid'))]);
      else if ([...record.addedNodes || [], ...record.removedNodes || []].some(n => n.nodeType === 1 && (n.id === 'chat' || n.matches?.('.mes') || n.querySelector?.('#chat,.mes')))) refresh();
    }
  });
  observer.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['mesid', 'class'] });
  const c = context();
  for (const name of ['CHAT_CHANGED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'GENERATION_ENDED']) {
    const event = c.eventTypes?.[name]; if (!event || !c.eventSource?.on) continue;
    const fn = id => refresh(Number.isInteger(id) && name !== 'MESSAGE_DELETED' && name !== 'CHAT_CHANGED' ? [id] : undefined);
    c.eventSource.on(event, fn); listeners.push(() => c.eventSource.removeListener(event, fn));
  }
  function applySettings() { revision++; doc.documentElement.dataset.trsReducedMotion = String(settings().reducedMotion === true || settings().enabled === false); refresh(); }
  applySettings();
  return Object.freeze({
    api: 1, register, registerFormat, format, status: createStatus, refresh, applySettings,
    diagnostics: () => ({ adapters: [...adapters.keys()], formats: [...formats.keys()], mounted: mounted.size, ...counts, errors: errors.map(x => ({ ...x })) }),
    dispose() {
      if (disposed) return; disposed = true; observer.disconnect(); if (frame !== null) view.cancelAnimationFrame(frame);
      listeners.splice(0).forEach(stop => stop());
      for (const [node, token] of mounted) release(node, token, true);
      adapters.clear(); formats.clear(); style.remove(); delete doc.documentElement.dataset.trsReducedMotion;
    },
  });
}
