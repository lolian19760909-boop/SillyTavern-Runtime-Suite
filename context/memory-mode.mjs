// Memory ownership is selected once per narrative round. No database writes.
export function createMemoryModes({ settings = () => ({}), global = globalThis } = {}) {
  const providers = new Map();
  function register(provider) {
    if (!provider?.id || typeof provider.probe !== 'function' || providers.has(provider.id)) throw new Error('数据库适配器编号或检测接口无效。');
    providers.set(provider.id, provider);
    return () => { if (providers.get(provider.id) === provider) providers.delete(provider.id); };
  }
  register({
    id: 'shujuku', title: '龙血玄黄·数据库',
    probe() {
      const api = global.AutoCardUpdaterAPI;
      if (typeof api?.exportTableAsJson !== 'function' || typeof api?.registerTableUpdateCallback !== 'function') return null;
      // exportTableAsJson returns live references in the audited upstream version.
      // Read counts only. Never annotate, normalize or persist returned objects.
      const data = api.exportTableAsJson();
      const sheets = Object.values(data || {}).filter(sheet => Array.isArray(sheet?.content));
      return { tables: sheets.length, rows: sheets.reduce((sum, sheet) => sum + Math.max(0, sheet.content.length - 1), 0) };
    },
  });
  function status() {
    const requested = ['auto', 'summary', 'database'].includes(settings().memoryMode) ? settings().memoryMode : 'auto';
    let found = null, error = '';
    for (const provider of providers.values()) {
      try {
        const snapshot = provider.probe();
        if (snapshot) { found = { id: provider.id, title: provider.title, ...snapshot }; break; }
      } catch (failure) { error = failure.message; }
    }
    const mode = requested === 'summary' ? 'summary' : requested === 'database' || found ? 'database' : 'summary';
    return { requested, mode, provider: found, error, available: mode !== 'database' || !!found };
  }
  return Object.freeze({
    register, status,
    resolve() {
      const value = status();
      if (!value.available || value.error && value.requested !== 'summary') throw new Error(value.error || '数据库模式尚未找到可用数据库，请启用数据库插件或改用套件摘要。');
      return structuredClone(value);
    },
  });
}
