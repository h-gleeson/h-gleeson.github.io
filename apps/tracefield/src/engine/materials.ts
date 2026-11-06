import {
  Color,
  CustomBlending,
  DoubleSide,
  Float32BufferAttribute,
  GreaterDepth,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  LessEqualDepth,
  Matrix4,
  OneFactor,
  OneMinusSrcAlphaFactor,
  AlwaysStencilFunc,
  InvertStencilOp,
  NotEqualStencilFunc,
  ShaderMaterial,
  SrcAlphaFactor,
  Vector4,
  ZeroStencilOp,
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
  /** Pixel position of the frame centre in the current render target; hatches are anchored to it. */
  uHatchOrigin: { value: new Vector2(0, 0) },
  // Shadows
  uShadowOn: { value: 0 },
  uShadowMode: { value: 0 }, // 0 graphic, 1 soft
  uShadowMap: { value: null as Texture | null },
  uShadowMatrix: { value: new Matrix4() },
  uShadowColor: { value: new Color('#6f7280') },
  uShadowOpacity: { value: 0.45 },
  uShadowRadius: { value: 0 }, // soft blur radius in shadow-map uv
  uShadowTexel: { value: 0.01 }, // world units per shadow texel
  uShadowBias: { value: 0.0005 },
  uShadeFaces: { value: 1 },
  // Section cut: discard where dot(n, p) + w > 0 (xyz = n, w = -offset).
  uClipOn: { value: 0 },
  uClipPlane: { value: new Vector4(0, 1, 0, 0) },
};

const clipPars = /* glsl */ `
uniform float uClipOn;
uniform vec4 uClipPlane;`;
const clipTest = /* glsl */ `
  if (uClipOn > 0.5 && dot(uClipPlane.xyz, vWorldPos) + uClipPlane.w > 0.0) discard;`;

/** Shadow lookup shared by object fills and the ground. Returns 0 lit … 1 fully in shadow. */
const shadowChunk = /* glsl */ `
uniform float uShadowOn;
uniform float uShadowMode;
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowRadius;
uniform float uShadowTexel;
uniform float uShadowBias;
const vec2 VOGEL[16] = vec2[16](
  vec2(0.177, 0.000), vec2(-0.225, 0.208), vec2(0.035, -0.395), vec2(0.288, 0.338),
  vec2(-0.495, -0.101), vec2(0.460, -0.300), vec2(-0.159, 0.586), vec2(-0.297, -0.565),
  vec2(0.647, 0.153), vec2(-0.664, 0.275), vec2(0.240, -0.693), vec2(0.331, 0.701),
  vec2(-0.769, -0.226), vec2(0.775, -0.320), vec2(-0.307, 0.828), vec2(-0.258, -0.894)
);
float shadowAt(vec3 worldPos, vec3 n, float ndl) {
  if (uShadowOn < 0.5) return 0.0;
  // Normal offset: lift the lookup off the surface, more for surfaces grazing the light.
  vec3 p = worldPos + n * uShadowTexel * (1.5 + 2.5 * (1.0 - clamp(ndl, 0.0, 1.0)));
  vec4 sc = uShadowMatrix * vec4(p, 1.0);
  vec3 uvz = sc.xyz / sc.w;
  if (uvz.x <= 0.0 || uvz.x >= 1.0 || uvz.y <= 0.0 || uvz.y >= 1.0) return 0.0;
  float z = min(uvz.z, 1.0) - uShadowBias;
  if (uShadowMode < 0.5) return 1.0 - texture(uShadowMap, vec3(uvz.xy, z));
  float lit = 0.0;
  for (int i = 0; i < 16; i++) lit += texture(uShadowMap, vec3(uvz.xy + VOGEL[i] * uShadowRadius, z));
  return 1.0 - lit / 16.0;
}`;

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
${shadowChunk}
${clipPars}
uniform vec3 uShadowColor;
uniform float uShadowOpacity;
uniform float uShadeFaces;
uniform float uReceive;
uniform float uHatch;
uniform vec3 uHatchColor;
uniform float uHatchSpacing;
uniform float uHatchWidth;
uniform vec2 uHatchDir;
uniform vec2 uHatchOrigin;
uniform float uLineScale;
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
#ifndef NO_CLIP
${clipTest}
#endif
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

  // Hatch, in drawing space: anchored to the frame centre and scaled like lineweights.
  if (uHatch > 0.5) {
    vec2 q = (gl_FragCoord.xy - uHatchOrigin) / uLineScale;
    vec2 r = vec2(dot(q, uHatchDir), dot(q, vec2(-uHatchDir.y, uHatchDir.x)));
    float sp = max(uHatchSpacing, 0.5);
    float wpx = uHatchWidth * uLineScale;
    float cover;
    if (uHatch > 2.5) {
      vec2 c = (fract(r / sp + 0.5) - 0.5) * sp * uLineScale;
      cover = clamp(max(wpx * 0.8, 0.7) - length(c) + 0.5, 0.0, 1.0) * min(wpx / 0.7, 1.0);
    } else {
      float d = abs(fract(r.y / sp + 0.5) - 0.5) * sp;
      if (uHatch > 1.5) d = min(d, abs(fract(r.x / sp + 0.5) - 0.5) * sp);
      // Hatches thinner than a pixel draw one pixel wide and fainter, instead of breaking up.
      cover = clamp(max(wpx, 1.0) * 0.5 - d * uLineScale + 0.5, 0.0, 1.0) * min(wpx, 1.0);
    }
    col = mix(col, uHatchColor, cover);
  }

  // Shade and shadow.
  if (uShadowOn > 0.5 && uReceive > 0.5) {
    float sh = shadowAt(vWorldPos, n, ndl);
    if (uShadeFaces > 0.5) sh = max(sh, 1.0 - smoothstep(0.0, 0.04, dot(n, uLightDir)));
    float k = sh * uShadowOpacity;
    col = uShadowMode < 0.5 ? mix(col, uShadowColor, k) : mix(col, col * uShadowColor, k);
  }
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
    uReceive: { value: number };
    uHatch: { value: number };
    uHatchColor: { value: Color };
    uHatchSpacing: { value: number };
    uHatchWidth: { value: number };
    uHatchDir: { value: Vector2 };
  };
};

function sharedFillUniforms() {
  return {
    uLightDir: shared.uLightDir,
    uHatchOrigin: shared.uHatchOrigin,
    uLineScale: shared.uLineScale,
    uShadowOn: shared.uShadowOn,
    uShadowMode: shared.uShadowMode,
    uShadowMap: shared.uShadowMap,
    uShadowMatrix: shared.uShadowMatrix,
    uShadowColor: shared.uShadowColor,
    uShadowOpacity: shared.uShadowOpacity,
    uShadowRadius: shared.uShadowRadius,
    uShadowTexel: shared.uShadowTexel,
    uShadowBias: shared.uShadowBias,
    uShadeFaces: shared.uShadeFaces,
    uClipOn: shared.uClipOn,
    uClipPlane: shared.uClipPlane,
  };
}

export function createFillMaterial(hasNormal: boolean, hasUv: boolean, noClip = false): FillMaterial {
  const defines: Record<string, string> = {};
  if (noClip) defines.NO_CLIP = '';
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
      uReceive: { value: 1 },
      uHatch: { value: 0 },
      uHatchColor: { value: new Color('#555555') },
      uHatchSpacing: { value: 8 },
      uHatchWidth: { value: 0.6 },
      uHatchDir: { value: new Vector2(1, 0) },
      uAmbient: shared.uAmbient,
      uFlat: shared.uFlat,
      uHighlight: shared.uHighlight,
      ...sharedFillUniforms(),
    },
  }) as FillMaterial;
}

// ---------------------------------------------------------------- ground

const groundFragment = /* glsl */ `
${shadowChunk}
${clipPars}
uniform vec3 uShadowColor;
uniform float uShadowOpacity;
uniform vec3 uColor;
uniform float uShadowOnly;
uniform vec3 uLightDir;
varying vec3 vWorldPos;
void main() {
${clipTest}
  float sh = shadowAt(vWorldPos, vec3(0.0, 1.0, 0.0), max(uLightDir.y, 0.0));
  float k = sh * uShadowOpacity;
  if (uShadowOnly > 0.5) {
    if (k <= 0.002) discard;
    gl_FragColor = vec4(uShadowColor, k);
  } else {
    gl_FragColor = vec4(uShadowMode < 0.5 ? mix(uColor, uShadowColor, k) : mix(uColor, uColor * uShadowColor, k), 1.0);
  }
}`;

export type GroundMaterial = ShaderMaterial & { uniforms: { uColor: { value: Color }; uShadowOnly: { value: number } } };

/** The ground plane: a solid colour, or invisible except for the shadows it catches. */
export function createGroundMaterial(): GroundMaterial {
  return new ShaderMaterial({
    vertexShader: /* glsl */ `varying vec3 vWorldPos;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: groundFragment,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 4,
    polygonOffsetUnits: 8,
    uniforms: {
      uColor: { value: new Color('#ffffff') },
      uShadowOnly: { value: 0 },
      ...sharedFillUniforms(),
    },
  }) as GroundMaterial;
}

const clippedVertex = /* glsl */ `varying vec3 vWorldPos;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const clippedOnlyFragment = /* glsl */ `${clipPars}
varying vec3 vWorldPos;
void main() {
${clipTest}
  gl_FragColor = vec4(1.0);
}`;

/** Depth-only material for the shadow-map pass (cut-away geometry casts no shadow). */
export function createShadowDepthMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: clippedVertex,
    fragmentShader: clippedOnlyFragment,
    side: DoubleSide,
    colorWrite: false,
    uniforms: { uClipOn: shared.uClipOn, uClipPlane: shared.uClipPlane },
  });
}

/**
 * Section caps, pass 1: every remaining face of one object flips the stencil.
 * Behind each pixel of the cut plane, an odd number of faces means the pixel
 * is inside the solid. Parity ignores face winding, so it works on imported
 * meshes with inconsistent normals (they must be closed).
 */
export function createCapStencilMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: clippedVertex,
    fragmentShader: clippedOnlyFragment,
    side: DoubleSide,
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    stencilWrite: true,
    stencilFunc: AlwaysStencilFunc,
    stencilFail: InvertStencilOp,
    stencilZFail: InvertStencilOp,
    stencilZPass: InvertStencilOp,
    uniforms: { uClipOn: shared.uClipOn, uClipPlane: shared.uClipPlane },
  });
}

/** Section caps, pass 2: a quad on the cut plane, drawn where the stencil is odd, which also resets it. */
export function createCapMaterial(): FillMaterial {
  const m = createFillMaterial(false, false, true);
  m.stencilWrite = true;
  m.stencilRef = 0;
  m.stencilFunc = NotEqualStencilFunc;
  m.stencilFail = ZeroStencilOp;
  m.stencilZFail = ZeroStencilOp;
  m.stencilZPass = ZeroStencilOp;
  m.polygonOffsetFactor = 0;
  m.polygonOffsetUnits = 1;
  m.uniforms.uToning.value = 0;
  m.uniforms.uReceive.value = 0;
  return m;
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
uniform float uClipOn;
uniform vec4 uClipPlane;
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

  // Section cut: drop the cut-away part of the segment (trimmed exactly at the plane).
  vec3 p0 = iStart, p1 = iEnd;
  if (uClipOn > 0.5) {
    float d0 = dot(uClipPlane.xyz, (modelMatrix * vec4(p0, 1.0)).xyz) + uClipPlane.w;
    float d1 = dot(uClipPlane.xyz, (modelMatrix * vec4(p1, 1.0)).xyz) + uClipPlane.w;
    if (d0 > 0.0 && d1 > 0.0) { hide(); return; }
    if (d0 > 0.0) p0 = mix(p0, p1, d0 / (d0 - d1));
    else if (d1 > 0.0) p1 = mix(p1, p0, d1 / (d1 - d0));
  }
  vec4 cs = projectionMatrix * modelViewMatrix * vec4(p0, 1.0);
  vec4 ce = projectionMatrix * modelViewMatrix * vec4(p1, 1.0);
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
    // Custom blending keeps anti-aliased edges even when the material is drawn in
    // the opaque pass (lines set to draw behind every fill).
    blending: CustomBlending,
    blendSrc: SrcAlphaFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
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
      uClipOn: shared.uClipOn,
      uClipPlane: shared.uClipPlane,
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
