import { Compact, Requests, Clone } from './core.mjs';
import { createNativeAdapter } from './native.mjs';

const copy = value => Clone.clone(value);
export function createContextEngine({ context, bridge, settings = () => ({}), readDisk, fetcher } = {}) {
  const adapter = createNativeAdapter({ context, readDisk, fetcher });
  const countTokens = text => context().getTokenCountAsync(text);
  const queue = Requests.create({ bridge, capture: adapter.capture, countTokens });
  const requests = {
    ...queue,
    async run(input) {
      try { return await queue.run(input); }
      catch (failure) {
        const record = queue.status().records.at(-1);
        if (record?.status === 'failed' && record.attempts > 0 && JSON.stringify(record.scope) === JSON.stringify(adapter.scope())) {
          await adapter.store.update(state => { if (!state.receipts.some(row => row.id === record.id)) state.receipts.push(record); });
        }
        throw failure;
      }
    },
  };
  let compact, round = null, lastRun = null, lastFixed = null, error = '', destroyed = false;
  const modelKey = () => JSON.stringify(context().chatCompletionSettings);
  const busy = () => !!round || !!compact?.status().busy;
  const assertIdle = () => { if (busy()) throw new Error('请等当前回复结束后再调整上下文。'); };
  function createPolicy() {
    return Compact.create({
      source: { capture: adapter.capture, validSource: adapter.validSource, validSources: adapter.validSources },
      store: adapter.store, requests, countTokens, settings: settings(),
      project: async request => {
        const rows = await adapter.project(request.rows), host = context();
        return {
          rows, nativeRows: request.rows, actorId: 'chat', contextSize: host.chatCompletionSettings.openai_max_context,
          outputTokens: host.chatCompletionSettings.openai_max_tokens, sessionId: request.id,
          fixedTokens: lastFixed?.key === modelKey() ? lastFixed.tokens : 0,
        };
      },
    });
  }
  const client = {
    get scope() { return adapter.scope(); },
    async prepare() {
      error = ''; round = null;
      if (adapter.store.read().enabled !== false) await adapter.ensureSources();
    },
    async message({ kind }) {
      if (kind === 'user' && adapter.available() && adapter.store.read().enabled !== false) await adapter.ensureSources();
    },
    async before(request) {
      if (destroyed) throw new Error('上下文模块已关闭。');
      if (adapter.store.read().enabled === false) return { rows: request.rows };
      compact = createPolicy();
      try {
        const current = round = { id: request.id, markers: [], capture: adapter.capture() };
        const result = await compact.before(request);
        if (round !== current) throw new Error('本轮整理已停止。');
        current.historyTokens = await countTokens(JSON.stringify(result.rows.map(row => ({ role: row.is_user ? 'user' : row.is_system ? 'system' : 'assistant', content: row.mes }))));
        current.summaryTokens = await countTokens(result.prompt || '');
        if (round !== current) throw new Error('本轮整理已停止。');
        const prefix = `TRSCTX_${request.id}_${Date.now()}_`;
        current.anchor = `[${prefix}MAIN]`;
        result.prompt = `${result.prompt ? result.prompt + '\n' : ''}${current.anchor}`;
        result.rows.forEach((row, index) => {
          if (row.is_system) return;
          const begin = `[${prefix}${index}_BEGIN]`, end = `[${prefix}${index}_END]`;
          current.markers.push({ begin, end, role: row.is_user ? 'user' : 'assistant', content: row.mes });
          row.mes = `${begin}\n${row.mes}\n${end}`;
        });
        lastRun = { ...compact.status().lastRun, estimateScope: lastFixed?.key === modelKey() ? 'history-plus-previous-fixed' : 'history-only' };
        return result;
      } catch (failure) { error = failure.message; throw failure; }
    },
    async final({ id, payload }) {
      const current = round;
      if (!current?.anchor || current.id !== id || !Array.isArray(payload?.chat)) return;
      const slots = [], anchorOnly = new Set();
      for (const row of payload.chat) {
        if (typeof row.content === 'string') {
          if (row.content.trim() === current.anchor) anchorOnly.add(row);
          slots.push({ read: () => row.content, write: value => { row.content = value; } });
        } else if (Array.isArray(row.content)) for (const part of row.content) {
          if (typeof part?.text === 'string') slots.push({ read: () => part.text, write: value => { part.text = value; } });
        }
      }
      const combined = slots.map(slot => slot.read()).join('\0');
      if (!combined.includes(current.anchor) && !current.markers.some(marker => combined.includes(marker.begin) || combined.includes(marker.end))) return;
      const present = current.markers.filter(marker => combined.split(marker.begin).length === 2 && combined.split(marker.end).length === 2);
      const anchors = combined.split(current.anchor).length - 1;
      for (const slot of slots) {
        let value = slot.read();
        for (const marker of current.markers) value = value.split(marker.begin + '\n').join('').split('\n' + marker.end).join('').split(marker.begin).join('').split(marker.end).join('');
        slot.write(value.split(current.anchor).join(''));
      }
      for (let i = payload.chat.length - 1; i >= 0; i--) if (anchorOnly.has(payload.chat[i]) && !payload.chat[i].content.trim()) payload.chat.splice(i, 1);
      const value = await countTokens(JSON.stringify(payload.chat));
      if (round !== current || JSON.stringify(adapter.capture()) !== JSON.stringify(current.capture)) throw new Error('最终计量期间聊天已变化。');
      if (!Number.isFinite(value) || value < 0) throw new Error('完整提示长度暂时无法估算。');
      const host = context(), budget = Compact.budget({ contextSize: host.chatCompletionSettings.openai_max_context, responseTokens: host.chatCompletionSettings.openai_max_tokens, settings: settings() });
      lastRun = { ...lastRun, finalInputEstimate: Math.ceil(value), budget, tokenSource: 'host-estimate' };
      lastFixed = { key: modelKey(), tokens: Math.max(0, Math.ceil(value - current.historyTokens - current.summaryTokens)) };
      if (anchors !== 1 || present.length !== current.markers.length) throw new Error('宿主裁掉或改写了需要保留的对话，本次已停止发送。');
      if (value > budget.input) throw new Error('完整提示超过预留输入预算，请重新发送以使用更新后的固定提示估算。');
    },
    finish() { round = null; requests.cancel(); },
  };
  function records() {
    const values = adapter.store.read().compactions, refs = values.flatMap(record => record.sources || []), checks = adapter.validSources(refs), validity = new Map(refs.map((ref, i) => [Compact.key(ref), checks[i]]));
    return values.map(record => ({ ...copy(record), status: record.status === 'excluded' ? 'excluded' : record.sources?.every(ref => validity.get(Compact.key(ref))) ? 'ready' : 'unverified' }));
  }
  return {
    client,
    available: adapter.available,
    status: () => ({ available: !!adapter.available(), enabled: adapter.store.read().enabled !== false, busy: busy(), pendingSave: adapter.store.status().pending, error: error || compact?.status().error || '', lastRun: copy(lastRun), records: records(), receipts: copy(adapter.store.read().receipts), requests: requests.status() }),
    async refresh() { if (context().chat.length) await adapter.snapshot({ allowUnregistered: true }); return records(); },
    async setEnabled(value) { assertIdle(); return adapter.store.update(state => { state.enabled = value === true; }); },
    async exclude(id) { assertIdle(); return adapter.store.update(state => { const record = state.compactions.find(row => row.id === id); if (!record) throw new Error('摘要不存在。'); record.status = 'excluded'; }); },
    async include(id) { assertIdle(); await adapter.snapshot(); return adapter.store.update(state => { const record = state.compactions.find(row => row.id === id); if (!record?.sources.every(adapter.validSource)) throw new Error('原文已变化，不能恢复该摘要。'); record.status = 'ready'; }); },
    async allowRetry() { assertIdle(); return adapter.store.update(state => { state.retryRevision = (state.retryRevision || 0) + 1; }); },
    retrySave: () => { assertIdle(); return adapter.store.retry(); },
    cancel: () => requests.cancel(),
    destroy() { destroyed = true; round = null; requests.destroy(); adapter.destroy(); },
  };
}
