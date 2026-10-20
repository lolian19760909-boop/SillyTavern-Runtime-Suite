// Explicit project slots in native message HTML; never execute inline card code.
export function bindProjectSlots(root, { getProject, mount, report = () => {} }) {
  const view = root.ownerDocument.defaultView, slots = new Map();
  let disposed = false, scheduled = null;
  const selector = '[data-tavern-visual]';
  async function attach(node, id, token) {
    try {
      const project = await getProject(id);
      if (disposed || slots.get(node) !== token || !root.contains(node)) return;
      if (!project) throw new Error(`未导入视觉作品：${id}`);
      token.session = mount(project, node, { onError: error => report(error.message) });
      await token.session.ready;
    } catch (error) {
      if (!disposed && slots.get(node) === token) { node.setAttribute('data-tavern-visual-error', error.message); report(error.message); }
    }
  }
  function scan() {
    scheduled = null;
    if (disposed) return;
    for (const [node, token] of slots) if (!root.contains(node) || node.getAttribute('data-tavern-visual') !== token.id) {
      slots.delete(node); void token.session?.dispose();
    }
    for (const node of root.querySelectorAll(selector)) {
      if (slots.has(node)) continue;
      const id = node.getAttribute('data-tavern-visual');
      const token = { id }; slots.set(node, token); node.removeAttribute('data-tavern-visual-error');
      void attach(node, id, token);
    }
  }
  const refresh = () => { if (!disposed && scheduled === null) scheduled = view.requestAnimationFrame(scan); };
  const observer = new view.MutationObserver(refresh);
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tavern-visual'] });
  refresh();
  return {
    refresh,
    async reset() { const old = [...slots.values()]; slots.clear(); await Promise.allSettled(old.map(token => token.session?.dispose())); refresh(); },
    async dispose() { disposed = true; observer.disconnect(); if (scheduled !== null) view.cancelAnimationFrame(scheduled); await this.reset(); },
  };
}
