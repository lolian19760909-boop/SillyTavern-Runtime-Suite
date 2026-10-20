import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mount = '/scripts/extensions/third-party/tavern-runtime-suite';
let saved = [];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
async function body(request) {
  let text = '';
  for await (const part of request) { text += part; if (text.length > 2000000) throw new Error('Fixture body too large.'); }
  return JSON.parse(text);
}
http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1'), pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '/test/browser.html') { response.writeHead(302, { Location: mount + '/test/browser.html' }).end(); return; }
    const send = value => response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(value));
    if (request.method === 'POST') {
      const data = await body(request);
      if (pathname === '/fixture/save') { saved = data; send({ ok: true }); return; }
      if (pathname === '/api/chats/get') { send(saved); return; }
      if (pathname === '/api/backends/chat-completions/generate') {
        const input = JSON.parse(data.messages[1].content), ids = input.messages.map(row => row.sourceId);
        send({ choices: [{ message: { content: JSON.stringify({ covered: ids, items: [{ kind: '未结事项', text: '双方约好次日回访，尚未履行。', sourceIds: ids }] }) } }], usage: { prompt_tokens: 1000, completion_tokens: 160, total_tokens: 1160 } }); return;
      }
      response.writeHead(404).end(); return;
    }
    const relative = pathname.startsWith(mount + '/') ? pathname.slice(mount.length) : pathname;
    if (pathname === '/scripts/world-info.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }).end('export const world_info_budget=25; export const world_info_budget_cap=0;'); return; }
    const target = pathname === '/scripts/openai.js' ? path.join(root, 'test/backend.mjs') : path.resolve(root, '.' + relative);
    if (!target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const data = await fs.readFile(target);
    response.writeHead(200, { 'Content-Type': `${types[path.extname(target)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' }).end(data);
  } catch (failure) { response.writeHead(500, { 'Content-Type': 'text/plain' }).end(failure.message); }
}).listen(Number(process.env.TRS_TEST_PORT || 8873), '127.0.0.1', () => console.log('http://127.0.0.1:' + (process.env.TRS_TEST_PORT || 8873) + mount + '/test/browser.html'));
