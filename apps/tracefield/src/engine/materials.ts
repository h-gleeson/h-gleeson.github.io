import {
  Color,
  DoubleSide,
  Float32BufferAttribute,
  GreaterDepth,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  LessEqualDepth,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
} from 'three';
import type { EdgeData } from '../import/registry';

/** Uniforms shared by every material, updated once per frame. */
export const shared = {
  uLightDir: { value: new Vector3(0.4, 0.8, 0.3).normalize() },
  uAmbient: { value: 0.6 },
  uFlat: { value: 1 },
  uHighlight: { value: new Color('#2f48d8') },
  uResolution: { value: new Vector2(1, 1) },
  uLineScale: { value: 1 },
  uPersp: { value: 0 },
  uViewDirOrtho: { value: new Vector3(0, 0, 1) },
};

// ---------------------------------------------------------------- fills

const fillVertex = /* glsl */ `
varying vec3 vWorldPos;
#ifdef HAS_NORMAL
varying vec3 vNormal;
#endif
#ifdef HAS_UV
varying vec2 vUv;
#endif
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
#ifdef HAS_NORMAL
  vNormal = normalize(mat3(modelMatrix) * normal);
#endif
#ifdef HAS_UV
  vUv = uv;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const fillFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uToning;
uniform float uSelected;
uniform float uHasMap;
uniform sampler2D uMap;
uniform vec3 uLightDir;
uniform float uAmbient;
uniform float uFlat;
uniform vec3 uHighlight;
varying vec3 vWorldPos;
#ifdef HAS_NORMAL
varying vec3 vNormal;
#endif
#ifdef HAS_UV
varying vec2 vUv;
#endif
void main() {
  vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
#ifdef HAS_NORMAL
  if (uFlat < 0.5) n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
#endif
  float ndl = max(dot(n, uLightDir), 0.0);
  float tone = mix(1.0, uAmbient + (1.0 - uAmbient) * ndl, uToning);
  vec4 base = vec4(uColor, 1.0);
#ifdef HAS_UV
  if (uHasMap > 0.5) base *= texture2D(uMap, vUv);
#endif
  vec3 col = base.rgb * tone;
  col = mix(col, uHighlight, uSelected * 0.2);
  gl_FragColor = vec4(col, uOpacity * base.a);
}`;

export type FillMaterial = ShaderMaterial & {
  uniforms: {
    uColor: { value: Color };
    uOpacity: { value: number };
    uToning: { value: number };
    uSelected: { value: number };
    uHasMap: { value: number };
    uMap: { value: Texture | null };
  };
};

export function createFillMaterial(hasNormal: boolean, hasUv: boolean): FillMaterial {
  const defines: Record<string, string> = {};
  if (hasNormal) defines.HAS_NORMAL = '';
  if (hasUv) defines.HAS_UV = '';
  return new ShaderMaterial({
    vertexShader: fillVertex,
    fragmentShader: fillFragment,
    defines,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
    uniforms: {
      uColor: { value: new Color('#ffffff') },
      uOpacity: { value: 1 },
      uToning: { value: 0.35 },
      uSelected: { value: 0 },
      uHasMap: { value: 0 },
      uMap: { value: null },
      uLightDir: shared.uLightDir,
      uAmbient: shared.uAmbient,
      uFlat: shared.uFlat,
      uHighlight: shared.uHighlight,
    },
  }) as FillMaterial;
}

// ---------------------------------------------------------------- lines

const lineVertex = /* glsl */ `
attribute vec3 iStart;
attribute vec3 iEnd;
attribute vec3 iN1;
attribute vec3 iN2;
attribute float iKind;
uniform vec2 uResolution;
uniform float uLineScale;
uniform float uPersp;
uniform vec3 uViewDirOrtho;
uniform float uSilW;
uniform float uCreaseW;
uniform float uOpenW;
uniform float uMatW;
uniform float uAllW;
uniform float uCurveW;
uniform float uCreaseCos;
uniform float uHidden;
uniform float uHiddenW;
uniform float uDepthBias;
varying float vAlong;
varying float vSide;
varying float vHalfW;
varying float vAlpha;

void hide() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }

void main() {
  // Classify for this view. Kinds: 0 smooth pair, 1 open, 2 hard, 3 curve, 4 coplanar.
  float w = 0.0;
  if (iKind > 3.5) w = uAllW;
  else if (iKind > 2.5) w = uCurveW;
  else if (iKind > 1.5) w = max(uMatW, uAllW);
  else if (iKind > 0.5) w = max(uOpenW, uAllW);
  else {
    vec3 n1 = normalize(normalMatrix * iN1);
    vec3 n2 = normalize(normalMatrix * iN2);
    vec3 v = uViewDirOrtho;
    if (uPersp > 0.5) v = -normalize((modelViewMatrix * vec4((iStart + iEnd) * 0.5, 1.0)).xyz);
    if (dot(n1, v) * dot(n2, v) < 0.0) w = uSilW;
    else if (dot(normalize(iN1), normalize(iN2)) < uCreaseCos) w = uCreaseW;
    w = max(w, uAllW);
  }
  if (uHidden > 0.5 && w > 0.0) w = uHiddenW;
  w *= uLineScale;
  if (w <= 0.0) { hide(); return; }

  vec4 cs = projectionMatrix * modelViewMatrix * vec4(iStart, 1.0);
  vec4 ce = projectionMatrix * modelViewMatrix * vec4(iEnd, 1.0);
  // Clip against the near plane so perspective segments behind the eye do not explode.
  float ds = cs.z + cs.w, de = ce.z + ce.w;
  if (ds < 0.0 && de < 0.0) { hide(); return; }
  if (ds < 0.0) cs = mix(cs, ce, ds / (ds - de));
  if (de < 0.0) ce = mix(ce, cs, de / (de - ds));

  vec2 ps = (cs.xy / cs.w * 0.5 + 0.5) * uResolution;
  vec2 pe = (ce.xy / ce.w * 0.5 + 0.5) * uResolution;
  vec2 d = pe - ps;
  float len = length(d);
  vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float drawW = max(w, 1.0);
  vAlpha = min(w, 1.0); // sub-pixel weights draw one pixel wide, fainter
  float halfW = drawW * 0.5;
  float t = position.x;
  vec2 p = mix(ps, pe, t) + dir * (t * 2.0 - 1.0) * halfW + nrm * position.y * (halfW + 1.0);
  vAlong = t * len;
  vSide = position.y * (halfW + 1.0);
  vHalfW = halfW;
  float z = mix(cs.z / cs.w, ce.z / ce.w, t) - uDepthBias;
  gl_Position = vec4(p / uResolution * 2.0 - 1.0, z, 1.0);
}`;

const lineFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uDash;
uniform float uGap;
uniform float uDotted;
uniform float uLineScale;
varying float vAlong;
varying float vSide;
varying float vHalfW;
varying float vAlpha;
void main() {
  float a = clamp(vHalfW + 0.5 - abs(vSide), 0.0, 1.0) * vAlpha * uOpacity;
  if (uDotted > 0.5) {
    float period = max(vHalfW * 2.0 + uGap * uLineScale, 2.0);
    float c = mod(vAlong, period) - vHalfW;
    a = clamp(vHalfW + 0.5 - length(vec2(c, vSide)), 0.0, 1.0) * vAlpha * uOpacity;
  } else if (uDash > 0.0) {
    float period = (uDash + uGap) * uLineScale;
    if (mod(vAlong, period) > uDash * uLineScale) discard;
  }
  if (a <= 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export type LineMaterial = ShaderMaterial & { uniforms: Record<string, { value: any }> };

export function createLineMaterial(hidden: boolean): LineMaterial {
  return new ShaderMaterial({
    vertexShader: lineVertex,
    fragmentShader: lineFragment,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    depthFunc: hidden ? GreaterDepth : LessEqualDepth,
    side: DoubleSide,
    uniforms: {
      uResolution: shared.uResolution,
      uLineScale: shared.uLineScale,
      uPersp: shared.uPersp,
      uViewDirOrtho: shared.uViewDirOrtho,
      uSilW: { value: 1.5 },
      uCreaseW: { value: 0.8 },
      uOpenW: { value: 1 },
      uMatW: { value: 0.8 },
      uAllW: { value: 0 },
      uCurveW: { value: 0.7 },
      uCreaseCos: { value: Math.cos(Math.PI / 6) },
      uHidden: { value: hidden ? 1 : 0 },
      uHiddenW: { value: 0.5 },
      uDepthBias: { value: hidden ? -2e-4 : 2e-5 },
      uColor: { value: new Color('#000000') },
      uOpacity: { value: 1 },
      uDash: { value: hidden ? 4 : 0 },
      uGap: { value: hidden ? 3 : 0 },
      uDotted: { value: 0 },
    },
  }) as LineMaterial;
}

/** One instanced screen-space quad per edge. */
export function createEdgeGeometry(e: EdgeData): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  const ib = new InstancedInterleavedBuffer(e.segments, 6, 1);
  g.setAttribute('iStart', new InterleavedBufferAttribute(ib, 3, 0));
  g.setAttribute('iEnd', new InterleavedBufferAttribute(ib, 3, 3));
  g.setAttribute('iN1', new InstancedBufferAttribute(e.n1, 3, true));
  g.setAttribute('iN2', new InstancedBufferAttribute(e.n2, 3, true));
  g.setAttribute('iKind', new InstancedBufferAttribute(e.kind, 1, false));
  g.instanceCount = e.count;
  return g;
}
