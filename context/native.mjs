import { Clone, Crypto } from './core.mjs';

export const STATE = 'tavern_runtime_context';
export const SOURCE = 'tavern_runtime_source';
export const initial = () => ({ schema: 1, revision: 0, enabled: true, compactions: [], receipts: [], retryRevision: 0 });
const copy = value => Clone.clone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const semantic = row => [row.mes, row.name ?? null, row.is_user === true, row.is_system === true, row.swipe_id ?? 0, row.role ?? null, row.tool_calls ?? null, row.tool_call_id ?? null, row.extra?.media ?? null, row.extra?.files ?? null, row.extra?.reasoning ?? null];
const proof = rows => JSON.stringify(rows.map(row => [row[SOURCE], ...semantic(row), row.swipes ?? null]));
const hash = async value => Array.from(new Uint8Array(await Crypto.digest(new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');

export function createNativeAdapter({ context, readDisk, fetcher = (...args) => fetch(...args) }) {
  let disposed = false, index = null, pending = null, queue = Promise.resolve();
  const cache = new WeakMap();
  const scope = () => {
    const host = context();
    return { character: host.characters?.[host.characterId]?.avatar || null, chat: host.getCurrentChatId(), group: host.groupId || null };
  };
  const capture = () => ({ scope: scope(), stamp: proof(context().chat) });
  const assert = expected => {
    if (disposed || !same(capture(), expected)) throw new Error('整理期间聊天或前文已变化，本次结果未采用。');
  };
  const available = () => {
    const host = context(), current = scope();
    return !disposed && current.character && current.chat && !current.group && host.mainApi === 'openai' && typeof host.saveChat === 'function' && typeof host.getTokenCountAsync === 'function' && !host.chatMetadata?.__cxx_story_profile;
  };
  const read = () => {
    const value = context().chatMetadata?.[STATE] ?? initial();
    if (value.schema !== 1 || !Number.isSafeInteger(value.revision) || !Array.isArray(value.compactions) || !Array.isArray(value.receipts)) throw new Error('上下文保存格式不受支持，已有记录保留。');
    return copy(value);
  };
  const disk = readDisk || (async current => {
    const host = context();
    const response = await fetcher('/api/chats/get', {
      method: 'POST', headers: host.getRequestHeaders(), credentials: 'same-origin', cache: 'no-cache', signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ avatar_url: current.character, file_name: current.chat, ch_name: host.characters[host.characterId].name }),
    });
    if (!response.ok) throw new Error(`上下文保存读回失败（HTTP ${response.status}）。`);
    return response.json();
  });
  async function persist(expected, state) {
    assert(expected);
    await context().saveChat();
    assert(expected);
    const saved = await disk(expected.scope);
    assert(expected);
    if (!Array.isArray(saved) || proof(saved.slice(1)) !== expected.stamp) throw new Error('聊天来源尚未保存一致，请重试。');
    if (state && (!same(saved[0]?.chat_metadata?.[STATE], state) || !same(read(), state))) throw new Error('摘要尚未保存一致，请重试保存。');
  }
  function enqueue(task) {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }
  async function ensureSources() {
    return enqueue(async () => {
      if (!available()) throw new Error('当前聊天尚不能使用通用压缩。');
      const used = new Set();
      for (const row of context().chat) {
        if (!Object.hasOwn(row, SOURCE)) row[SOURCE] = { schema: 1, id: Crypto.uuid() };
        const value = row[SOURCE];
        if (value?.schema !== 1 || typeof value.id !== 'string' || !value.id || used.has(value.id)) throw new Error('聊天来源编号无效或重复，已有记录保留。');
        used.add(value.id);
      }
      await persist(capture());
    });
  }
  async function snapshot({ allowUnregistered = false } = {}) {
    const expected = capture(), rows = [], seen = new Set();
    let ancestry = await hash(JSON.stringify(expected.scope));
    for (const [floor, row] of context().chat.entries()) {
      const id = row[SOURCE]?.id;
      if (typeof id !== 'string' || !id) {
        if (!allowUnregistered) throw new Error('消息来源尚未登记，将在下次发送时登记。');
        ancestry = await hash(ancestry + '\n' + JSON.stringify(semantic(row)));
        continue;
      }
      if (seen.has(id)) throw new Error('消息来源编号重复。');
      seen.add(id);
      const text = JSON.stringify([id, ...semantic(row)]), old = cache.get(row);
      const digest = old?.text === text ? old.digest : await hash(text);
      const chain = old?.text === text && old.parent === ancestry ? old.ancestry : await hash(ancestry + '\n' + digest);
      cache.set(row, { text, digest, parent: ancestry, ancestry: chain });
      ancestry = chain;
      rows.push({ floor, id, ref: { scope: copy(expected.scope), messageId: id, variantId: `s${row.swipe_id ?? 0}_${digest}`, digest, ancestry } });
    }
    assert(expected);
    index = { expected, rows: new Map(rows.map(row => [row.id, row])) };
    return index;
  }
  function validSources(refs) {
    if (!index || !same(capture(), index.expected)) return refs.map(() => false);
    return refs.map(ref => { const current = index.rows.get(ref?.messageId)?.ref; return !!current && same(current, ref); });
  }
  const validSource = ref => validSources([ref])[0];
  async function project(nativeRows) {
    await ensureSources();
    const current = await snapshot(), host = context(), seen = new Set(), rows = [];
    for (const native of nativeRows) {
      if (host.chat.includes(native)) throw new Error('宿主没有提供独立发送副本，已保留原聊天。');
      const id = native[SOURCE]?.id, mapped = current.rows.get(id);
      if (!mapped || seen.has(id)) throw new Error('发送消息缺少可核对的来源，本次保留原文。');
      seen.add(id);
      const protectedContent = native.is_system || native.extra?.media?.length || native.extra?.files?.length || native.tool_calls || native.tool_call_id;
      rows.push({ ref: copy(mapped.ref), native, role: native.is_user ? 'user' : native.is_system ? 'system' : 'assistant', text: String(native.mes), pending: !!protectedContent });
    }
    return rows;
  }
  const store = {
    read: () => pending && same(pending.expected.scope, scope()) ? copy(pending.before) : read(),
    update(change) {
      const expected = capture();
      return enqueue(async () => {
        assert(expected);
        if (pending && same(pending.expected.scope, scope())) throw new Error('上一份摘要尚未确认保存，请先重试保存。');
        pending = null;
        const before = read(), next = copy(before);
        change(next); next.revision = before.revision + 1;
        context().chatMetadata[STATE] = next;
        pending = { expected, before, value: copy(next) };
        await persist(expected, next);
        pending = null;
        return copy(next);
      });
    },
    retry() {
      return enqueue(async () => {
        if (!pending) return read();
        const value = pending;
        assert(value.expected);
        if (!same(read(), value.value)) throw new Error('待保存内容已有变化，不能覆盖。');
        await persist(value.expected, value.value); pending = null;
        return copy(value.value);
      });
    },
    status: () => ({ pending: !!pending && same(pending.expected.scope, scope()) }),
  };
  return { scope, capture, available, ensureSources, snapshot, project, validSource, validSources, store, destroy() { disposed = true; index = pending = null; } };
}
