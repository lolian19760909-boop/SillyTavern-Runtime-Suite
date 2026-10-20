// Same-origin Tavern Helper iframe or ordinary card page.
// Import this file from the installed extension path; no card-specific globals.
export function connectCard({ root = document.body, host = window.parent, signal } = {}) {
  const visual = host.TavernVisual, motion = host.TavernMotion;
  if (!visual || visual.api !== 1 || !motion) throw new Error('请启用 Tavern Runtime Suite 的视觉模块。');
  const sessions = new Set(), controller = new AbortController();
  const scope = motion.mount(root);
  const view = root.ownerDocument.defaultView;
  async function dispose() {
    if (controller.signal.aborted) return;
    controller.abort(); scope.dispose();
    signal?.removeEventListener('abort', dispose); view.removeEventListener('pagehide', dispose);
    await Promise.allSettled([...sessions].map(session => session.dispose())); sessions.clear();
  }
  view.addEventListener('pagehide', dispose, { once: true });
  signal?.addEventListener('abort', dispose, { once: true });
  if (signal?.aborted) void dispose();
  return Object.freeze({
    motion: scope,
    async mount(projectId, target, options = {}) {
      controller.signal.throwIfAborted();
      if (!(target === root || root.contains(target))) throw new Error('作品容器必须位于此卡页面内。');
      const project = await visual.getProject(projectId); controller.signal.throwIfAborted();
      if (!project) throw new Error(`请先在插件设置导入视觉作品：${projectId}`);
      const session = visual.mount(project, target, { ...options, signal: controller.signal });
      sessions.add(session); await session.ready; return session;
    },
    diagnostics: () => ({ motion: scope.diagnostics(), sessions: [...sessions].map(session => session.diagnostics()) }),
    dispose,
  });
}
