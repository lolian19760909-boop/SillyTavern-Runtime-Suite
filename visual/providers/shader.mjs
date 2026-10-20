import { createFrameLoop } from '../runtime/frame-loop.mjs';
const vertex = '#version 300 es\nin vec2 position;\nvoid main(){gl_Position=vec4(position,0.,1.);}';
export function mount({ manifest, resources, target, signal, quality = {}, fail }) {
  const doc = target.ownerDocument, view = doc.defaultView, canvas = doc.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block';
  canvas.setAttribute('aria-label', manifest.title);
  target.append(canvas);
  let gl, program, buffer, loop, observer, disposed = false, drawOnce = () => {};
  const shaders = [], inputs = new Map(), locations = new Map();
  function dispose() {
    if (disposed) return; disposed = true;
    signal.removeEventListener('abort', dispose); canvas.removeEventListener('webglcontextlost', lost);
    observer?.disconnect(); loop?.dispose();
    if (gl) { for (const shader of shaders) gl.deleteShader(shader); if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
    canvas.remove();
  }
  function lost(event) { event.preventDefault(); if (!disposed) fail(new Error('GPU场景的WebGL上下文已丢失，请重新打开作品。')); }
  function check() { signal.throwIfAborted(); if (disposed) throw new DOMException('场景已关闭。', 'AbortError'); }
  function compile(type, code) {
    const shader = gl.createShader(type); shaders.push(shader); gl.shaderSource(shader, code); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || '着色器编译失败。');
    return shader;
  }
  function resize() {
    const dpr = Math.min(view.devicePixelRatio || 1, Math.max(0.5, Math.min(3, quality.maxDpr || 2)));
    const rect = target.getBoundingClientRect();
    canvas.width = Math.max(1, Math.min(4096, Math.round(rect.width * dpr)));
    canvas.height = Math.max(1, Math.min(4096, Math.round(rect.height * dpr)));
    drawOnce();
  }
  const ready = (async () => {
    const bytes = await resources.bytes(manifest.scene.file); check();
    gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('此设备没有可用的WebGL2。');
    canvas.addEventListener('webglcontextlost', lost);
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, new TextDecoder().decode(bytes)));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || '着色器链接失败。');
    gl.useProgram(program);
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    for (const input of manifest.inputs || []) {
      if (!['number','boolean'].includes(input.type) || !/^[a-zA-Z_]\w*$/.test(input.name || input.id) || ['u_time','u_resolution'].includes(input.name || input.id)) throw new Error('GPU输入须为独立命名的number或boolean uniform。');
      inputs.set(input.id, { ...input, value: input.type === 'boolean' ? input.default === true : Number.isFinite(input.default) ? input.default : 0 });
    }
    for (const name of ['u_time','u_resolution', ...[...inputs.values()].map(input => input.name || input.id)]) locations.set(name, gl.getUniformLocation(program, name));
    let seconds = 0;
    const draw = time => {
      if (disposed || gl.isContextLost()) return;
      seconds = time; gl.useProgram(program); gl.viewport(0,0,canvas.width,canvas.height);
      gl.uniform1f(locations.get('u_time'), time); gl.uniform2f(locations.get('u_resolution'), canvas.width, canvas.height);
      for (const input of inputs.values()) {
        const location = locations.get(input.name || input.id);
        if (input.type === 'boolean') gl.uniform1i(location, input.value ? 1 : 0); else gl.uniform1f(location, input.value);
      }
      gl.drawArrays(gl.TRIANGLES,0,3);
    };
    drawOnce = () => draw(seconds);
    loop = createFrameLoop({ view, draw, maxFps: quality.maxFps });
    observer = new view.ResizeObserver(resize); observer.observe(target); resize();
    if (manifest.scene.autoplay !== false) loop.play();
  })().catch(error => { dispose(); throw error; });
  signal.addEventListener('abort', dispose, { once: true });
  return {
    ready, capabilities: ['play','pause','seek','setInput'],
    play() { check(); loop.play(); }, pause() { loop?.pause(); },
    seek(seconds) { check(); loop.seek(seconds); },
    setInput(id, value) { check(); const input = inputs.get(id); if (!input || typeof value !== input.type || input.type === 'number' && !Number.isFinite(value)) throw new Error('GPU输入的名称或类型不匹配。'); input.value = value; drawOnce(); },
    diagnostics: () => ({ backend: 'webgl2', width: canvas.width, height: canvas.height, disposed, timing: loop?.diagnostics() }),
    dispose,
  };
}
