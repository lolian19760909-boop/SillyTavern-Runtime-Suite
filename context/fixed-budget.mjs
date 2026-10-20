// Pre-assembly reserve. The final assembled request remains the measured authority.
export async function estimateFixed({ context, type = 'normal', contextSize, worldInfo = {} }) {
  const c = context(), s = c.chatCompletionSettings || {}, card = c.characters?.[c.characterId] || {};
  const data = card.data || card, parts = [];
  const order = s.prompt_order?.find(row => String(row.character_id) === '100001')?.order
    || s.prompt_order?.find(row => String(row.character_id) === String(c.characterId))?.order;
  const enabled = order && new Set(order.filter(row => row.enabled).map(row => row.identifier));
  for (const prompt of s.prompts || []) {
    if (prompt.marker || enabled && !enabled.has(prompt.identifier) || !enabled && prompt.enabled === false) continue;
    if (prompt.injection_trigger?.length && !prompt.injection_trigger.includes(type || 'normal')) continue;
    if (prompt.content) parts.push(prompt.content);
  }
  // Include card overrides and examples as well as preset bodies: these may be
  // selected by the host after the interceptor. Counting both is a reserve.
  for (const key of ['description', 'personality', 'scenario', 'mes_example', 'system_prompt', 'post_history_instructions']) {
    if (data[key] || card[key]) parts.push(data[key] || card[key]);
  }
  if (c.powerUserSettings?.persona_description) parts.push(c.powerUserSettings.persona_description);
  for (const [id, prompt] of Object.entries(c.extensionPrompts || {})) {
    if (id !== 'cxx-context-bridge-v1' && prompt?.value) parts.push(prompt.value);
  }
  for (const key of ['new_chat_prompt', 'new_group_chat_prompt', 'continue_nudge_prompt', 'assistant_prefill', 'assistant_impersonation']) {
    if (s[key]) parts.push(s[key]);
  }
  const text = parts.map(value => typeof c.substituteParams === 'function' ? c.substituteParams(String(value)) : String(value)).join('\n');
  const promptTokens = text ? await c.getTokenCountAsync(text) : 0;
  if (!Number.isFinite(promptTokens) || promptTokens < 0) throw new Error('固定提示长度暂时无法估算。');
  const window = Number(contextSize || s.openai_max_context);
  const percentage = Number(worldInfo.world_info_budget ?? 25), cap = Number(worldInfo.world_info_budget_cap ?? 0);
  if (!Number.isFinite(window) || window <= 0 || !Number.isFinite(percentage) || percentage < 0 || !Number.isFinite(cap) || cap < 0) throw new Error('世界书输入预算无效。');
  let loreReserve = Math.round(window * percentage / 100) || 1;
  if (cap > 0) loreReserve = Math.min(loreReserve, cap);
  return {
    tokens: Math.ceil(promptTokens) + loreReserve,
    promptTokens: Math.ceil(promptTokens), loreReserve, source: 'current-config-reserve',
    key: JSON.stringify([c.characters?.[c.characterId]?.avatar, c.getCurrentChatId?.(), s, type, text, loreReserve]),
  };
}
