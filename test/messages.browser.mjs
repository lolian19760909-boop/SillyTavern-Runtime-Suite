export async function checkMessages({ context: c, assert, until }) {
  const messages = globalThis.TavernVisual.messages, doc = document;
  const chat = doc.createElement('div'); chat.id = 'chat';
  chat.innerHTML = '<div class="mes" mesid="0"><div class="mes_text">host</div></div>';
  doc.body.append(chat);
  const original = JSON.stringify(c.chat), savedFormatter = c.messageFormatting;
  c.messageFormatting = text => { const n = doc.createElement('p'); n.textContent = text; return n.outerHTML; };
  let value = 'first', releaseLate, cleaned = 0;
  const stop = messages.register({ id: 'browser-fixture', priority: 100, matches: ({ floor }) => floor === 0,
    revision: () => value,
    render: ({ format }) => value === 'late' ? new Promise(resolve => { releaseLate = resolve; }) : { content: format('text', value), dispose: () => cleaned++ },
  });
  try {
    await until(() => chat.querySelector('[data-trs-message]')?.textContent === 'first');
    const before = messages.diagnostics().rendered; messages.refresh();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert(messages.diagnostics().rendered === before, '同一版本重复渲染');
    const remove = messages.registerFormat('fixture-format', source => doc.createTextNode('format:' + source));
    assert(messages.format('fixture-format', 'ok').textContent === 'format:ok', '格式扩展失效'); remove();
    value = 'late'; messages.refresh(); await until(() => !!releaseLate);
    const editor = doc.createElement('textarea'); editor.className = 'edit_textarea'; chat.querySelector('.mes').append(editor);
    messages.refresh(); await until(() => messages.diagnostics().mounted === 0);
    releaseLate({ content: doc.createTextNode('late result'), dispose: () => cleaned++ });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert(!chat.textContent.includes('late result') && editor.isConnected, '迟到显示覆盖编辑器');
    editor.remove(); value = 'final'; messages.refresh(); await until(() => chat.querySelector('[data-trs-message]')?.textContent === 'final');
    const panel = messages.status({ title: '正在准备正文' }), mark = panel.querySelector('.trs-reading-mark');
    chat.querySelector('[data-trs-message]').replaceChildren(panel);
    assert(getComputedStyle(panel).display === 'flex' && getComputedStyle(mark).animationName === 'trs-reading-turn', '加载样式或动画未生效');
    assert(JSON.stringify(c.chat) === original, '渲染修改了聊天记录');
    stop(); assert(!chat.querySelector('[data-trs-message]') && messages.diagnostics().mounted === 0 && cleaned >= 2, '解除适配未恢复与清理');
    return { name: '消息所有权、格式扩展、编辑让出、迟到丢弃、真实加载动画与原文保持', pass: true };
  } finally { stop(); chat.remove(); c.messageFormatting = savedFormatter; }
}
