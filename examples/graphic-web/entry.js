(() => {
  const api = window.TavernVisualProject;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  api.root.append(canvas);
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
  if (!gl) throw new Error('此环境没有可用的WebGL2。');
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, `#version 300 es
      out vec2 uv;
      void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`],
    [gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      in vec2 uv;out vec4 color;
      uniform vec2 size;uniform float progress;uniform vec3 accent;
      float random(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec2 p=uv*size;vec2 grid=floor(p/18.);float noise=random(grid);
        float threshold=uv.x*.75+uv.y*.15+noise*.1;
        float reveal=progress>=1.?1.:smoothstep(threshold,threshold+.045,progress*1.05);
        float lines=step(.94,fract((p.x+p.y*.45)/52.))*.12;
        vec2 center=(uv-vec2(.5))*vec2(size.x/size.y,1.);
        float ring=1.-smoothstep(.002,.006,abs(length(center)-.25));
        float inner=1.-smoothstep(.001,.004,abs(max(abs(center.x),abs(center.y))-.14));
        float ticks=step(.90,fract(atan(center.y,center.x)*9.55))*ring;
        float border=1.-smoothstep(1.,2.,min(min(p.x,p.y),min(size.x-p.x,size.y-p.y)));
        float edge=1.-smoothstep(.0,.04,abs(progress*1.05-threshold));
        float particles=step(.88,noise)*step(.76,fract(p.x/18.))*step(.76,fract(p.y/18.))*edge;
        vec3 base=vec3(.045,.055,.075)+accent*(lines+ring*.30+inner*.40+ticks*.6+border*.6);
        color=vec4(base+accent*(particles+edge*.15),reveal);
      }`],
  ]) {
    const shader = gl.createShader(type);gl.shaderSource(shader, source);gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  const size = gl.getUniformLocation(program, 'size'), progress = gl.getUniformLocation(program, 'progress'), accent = gl.getUniformLocation(program, 'accent');
  const tint = api.manifest.scene.accent ?? [0.3, 0.85, 0.88];
  let value = 1, animation = 0, disposed = false;
  function draw() {
    if (disposed) return;
    const ratio = devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio)), height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width;canvas.height = height; }
    gl.viewport(0, 0, width, height);gl.useProgram(program);
    gl.uniform2f(size, width, height);gl.uniform1f(progress, value);gl.uniform3fv(accent, tint);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function stop() { cancelAnimationFrame(animation);animation = 0; }
  function transition(target) {
    stop();const start = performance.now(), from = value;
    function step(now) {
      const phase = Math.min(1, (now - start) / 340);
      value = from + (target - from) * (1 - Math.pow(1 - phase, 3));draw();
      if (phase < 1) animation = requestAnimationFrame(step);
      else { animation = 0;api.emit('complete', { progress: value }); }
    }
    animation = requestAnimationFrame(step);
  }
  const observer = new ResizeObserver(draw);observer.observe(canvas);
  api.onCommand((action, args) => {
    if (action === 'play') { value = 0;transition(1); }
    else if (action === 'pause') stop();
    else if (action === 'trigger') transition(args[0] === 'reveal' ? 1 : 0);
    else if (action === 'setInput') { if (args[0] !== 'progress' || args[1] < 0 || args[1] > 1) throw new Error('progress需在0到1之间。');stop();value = args[1];draw(); }
    else if (action === 'dispose') { disposed = true;stop();observer.disconnect();gl.deleteProgram(program);canvas.remove(); }
  });
  draw();api.ready(['play', 'pause', 'trigger', 'setInput']);
})();
