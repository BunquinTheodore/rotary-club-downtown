// GPU particle field: static positions, drift and pointer trail push computed in the vertex shader.
// Replaces the old per-frame CPU loop over every particle plus a buffer upload.
import * as THREE from 'three';
import { TRAIL_POINTS } from './trail3d.js';

const GOLD = 0xf7a81b;
const SKY = 0x00a2e0;
const AZURE = 0x0067c8;
const POINT_SIZE = 0.07; // world units, same as the previous PointsMaterial

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uCalm;
  uniform float uPulse;
  uniform float uSize;
  uniform float uScale;
  uniform float uAspect;
  uniform vec3 uTrail[TRAIL_POINTS];
  attribute vec3 aColor;
  attribute float aSeed;
  varying vec3 vColor;
  varying float vGlow;
  void main() {
    float ph = aSeed * 6.2832;
    vec3 p = position;
    p.x += sin(uTime * 0.21 + ph) * 0.3 * uCalm;
    p.y += cos(uTime * 0.17 + ph * 1.3) * 0.3 * uCalm + sin(uTime * 0.05 + ph) * 0.15;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 clip = projectionMatrix * mv;
    vec2 ndc = clip.xy / clip.w;
    vec2 push = vec2(0.0);
    float glow = 0.0;
    for (int i = 0; i < TRAIL_POINTS; i++) {
      vec3 tp = uTrail[i];
      vec2 d = vec2((ndc.x - tp.x) * uAspect, ndc.y - tp.y);
      float f = tp.z * exp(-dot(d, d) / 0.075);
      push += d / max(length(d), 0.001) * f;
      glow += f;
    }
    push.x /= uAspect;
    clip.xy = (ndc + push * 0.12) * clip.w;
    gl_Position = clip;
    vColor = aColor;
    vGlow = clamp(glow, 0.0, 1.0);
    gl_PointSize = uSize * uScale / -mv.z * (1.0 + uPulse * 0.7) * (0.85 + aSeed * 0.3);
  }
`;

// Same radial falloff as the old canvas sprite: 1 at the center, 0.55 at 35%, 0 at the rim.
const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vGlow;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float a = r < 0.35 ? mix(1.0, 0.55, r / 0.35) : mix(0.55, 0.0, (r - 0.35) / 0.65);
    vec3 col = vColor + vGlow * vec3(1.0, 0.72, 0.28) * 0.55;
    gl_FragColor = vec4(col, a * uOpacity * (1.0 + vGlow * 0.8));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * @param {number} count particle count
 * @param {THREE.Vector3[]} trailUniform the PointerTrail slots, shared by reference
 */
export function buildField(count, trailUniform) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const palette = [new THREE.Color(GOLD), new THREE.Color(SKY), new THREE.Color(0xffffff), new THREE.Color(AZURE)];
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 11;
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * 7;
    pos[i * 3 + 2] = -9 + Math.random() * 9.5;
    const r = Math.random();
    const pick = r < 0.55 ? 0 : r < 0.85 ? 1 : r < 0.95 ? 2 : 3;
    tmp.copy(palette[pick]).multiplyScalar(0.55 + Math.random() * 0.45);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const uniforms = {
    uTime: { value: 0 },
    uCalm: { value: 1 },
    uPulse: { value: 0 },
    uSize: { value: POINT_SIZE },
    uScale: { value: 400 },
    uAspect: { value: 1 },
    uOpacity: { value: 0.85 },
    uTrail: { value: trailUniform },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
    defines: { TRAIL_POINTS },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;

  return {
    points,
    uniforms,
    /** Matches PointsMaterial size attenuation: pixels = size * pixelRatio * (cssHeight / 2) / depth. */
    setViewport(pixelRatio, cssHeight, aspect) {
      uniforms.uScale.value = pixelRatio * cssHeight * 0.5;
      uniforms.uAspect.value = aspect;
    },
  };
}
