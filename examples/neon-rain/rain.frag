#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float intensity;
out vec4 color;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
  vec3 base = mix(vec3(0.01,0.025,0.07), vec3(0.12,0.015,0.14), uv.y);
  float lane = floor(uv.x * 95.0);
  float speed = 0.2 + hash(lane) * 0.6;
  float head = fract(uv.y + u_time * speed + hash(lane + 13.0));
  float streak = pow(head, 35.0) * (1.0-smoothstep(0.0,0.1,abs(fract(uv.x*95.0)-0.5)));
  float glow = 0.04 / (0.03 + abs(uv.y - 0.2 - sin(uv.x*9.0+u_time*.5)*.04));
  base += vec3(0.05,0.55,0.8) * streak * clamp(intensity,0.0,2.0);
  base += vec3(0.13,0.015,0.1) * glow;
  color = vec4(base,1.0);
}
