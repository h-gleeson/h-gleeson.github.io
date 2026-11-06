import { CanvasTexture, Color, LinearFilter, LinearMipmapLinearFilter, NoBlending, ShaderMaterial, Vector2, Vector3, type Texture, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { charsOf, type EffectsSettings } from '../state/effects';

/**
 * Image effects in two full-screen passes:
 *  1. stylize: adjust the drawing, apply one effect, colour it, mix with the original;
 *  2. finish: chromatic aberration, bloom, scanlines, vignette, grain.
 *
 * Coordinates. A pass draws into a target whose pixel (0,0) is `fragToFrame`
 * device px from the frame centre (bottom-up), so `(gl_FragCoord + fragToFrame) / scale`
 * is the "drawing" position in px at the reference width, the same space hatches
 * and lineweights use. Source texel for a drawing position d is
 * `(d * scale - fragToFrame + srcOffset) / srcSize`. In the viewport the source
 * is the whole canvas (offset 0); in the export it is the tile plus a margin.
 */

const EFFECT_INDEX: Record<EffectsSettings['effect'], number> = { none: 0, dither: 1, halftone: 2, ascii: 3, crosshatch: 4, contour: 5, edges: 6, pixelate: 7, wave: 8, voronoi: 9 };
const DITHER_INDEX = { none: 0, bayer2: 1, bayer4: 2, bayer8: 3, noise: 4 } as const;
const SHAPE_INDEX = { circle: 0, square: 1, diamond: 2, line: 3 } as const;

const COMMON = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tSrc;
uniform vec2 uSrcSize;
uniform vec2 uSrcOffset;
uniform vec2 uFragToFrame;
uniform float uScale;
uniform float uTransparent;

vec2 drawPos() { return (gl_FragCoord.xy + uFragToFrame) / uScale; }
vec2 uvAt(vec2 d) { return (d * uScale - uFragToFrame + uSrcOffset) / uSrcSize; }
vec4 unpremul(vec4 c) {
  if (uTransparent > 0.5 && c.a > 0.0 && c.a < 1.0) c.rgb /= c.a;
  return c;
}
vec4 rawAt(vec2 d) { return unpremul(texture(tSrc, uvAt(d))); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
// Coverage of a shape edge, anti-aliased over one device pixel. dist and r are in drawing px.
float cover(float r, float dist) { return clamp((r - dist) * uScale + 0.5, 0.0, 1.0); }
`;

const STYLIZE = /* glsl */ `
${COMMON}
uniform int uEffect;
uniform float uBrightness, uContrast, uSaturation, uHue, uGamma, uBlur, uInvert;
uniform int uDitherPattern;
uniform float uDitherLevels, uDitherScale;
uniform int uDotShape;
uniform float uDotHex, uDotSpacing, uDotAngle, uDotScale;
uniform sampler2D tGlyphs;
uniform float uGlyphCount, uCharSize;
uniform float uHatchSpacing, uHatchWidth, uHatchAngle, uHatchJitter;
uniform int uHatchLayers;
uniform float uContourLevels, uContourWidth, uContourFill;
uniform float uEdgeThreshold, uEdgeWidth, uEdgeOverlay;
uniform float uPixelSize, uPixelGap;
uniform float uWaveSpacing, uWaveAmplitude, uWaveFrequency, uWaveWidth, uWaveVertical;
uniform float uCellSize, uCellEdge, uCellJitter;
uniform float uMono;
uniform vec3 uInk, uPaper, uBg;
uniform float uMix;
uniform sampler2D tMask;
uniform float uUseMask;
uniform vec3 uMaskChannel;
uniform sampler2D tBase; // the result so far, same size as this target
uniform float uUseBase;
uniform vec2 uTargetSize;

vec3 adjust(vec3 c) {
  c += uBrightness;
  c = (c - 0.5) * (uContrast >= 0.0 ? 1.0 + uContrast * 3.0 : 1.0 + uContrast) + 0.5;
  // Hue rotation in YIQ.
  if (uHue != 0.0) {
    vec3 yiq = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c;
    float h = radians(uHue);
    yiq.yz = mat2(cos(h), sin(h), -sin(h), cos(h)) * yiq.yz;
    c = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * yiq;
  }
  float l = luma(c);
  c = mix(vec3(l), c, 1.0 + uSaturation);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / uGamma));
  if (uInvert > 0.5) c = 1.0 - c;
  return clamp(c, 0.0, 1.0);
}

// The adjusted drawing at a drawing position (optionally blurred).
vec3 at(vec2 d) {
  if (uBlur <= 0.0) return adjust(rawAt(d).rgb);
  vec3 s = rawAt(d).rgb;
  float n = 1.0;
  for (int i = 0; i < 12; i++) {
    float r = sqrt((float(i) + 0.5) / 12.0) * uBlur;
    float a = float(i) * 2.39996;
    s += rawAt(d + vec2(cos(a), sin(a)) * r).rgb;
    n += 1.0;
  }
  return adjust(s / n);
}
float darkAt(vec2 d) { return 1.0 - luma(at(d)); }

// Darkness measured from the drawing background, so empty paper gets no ink.
// (On a dark background, plain darkness: the drawing is light-on-dark there.)
float tone(vec3 c) {
  float k = 1.0 - luma(c);
  float bg = 1.0 - luma(adjust(uBg));
  if (bg >= 0.5) return k;
  return clamp((k - bg) / max(1.0 - bg, 1e-3), 0.0, 1.0);
}

float bayer(ivec2 p, int bits) {
  int m = (1 << bits) - 1;
  p &= m;
  int v = 0;
  for (int i = 0; i < 3; i++) {
    if (i >= bits) break;
    int x = (p.x >> i) & 1, y = (p.y >> i) & 1;
    v |= (((x ^ y) << 1) | y) << (2 * (bits - 1 - i));
  }
  return (float(v) + 0.5) / float(1 << (2 * bits));
}

// Each effect returns rgb = the result in Original colour, a = ink coverage for Mono.
vec4 fxNone(vec2 d) { vec3 c = at(d); return vec4(c, tone(c)); }

vec4 fxDither(vec2 d) {
  vec2 cell = floor(d / uDitherScale);
  vec3 c = at((cell + 0.5) * uDitherScale);
  float t = 0.5;
  if (uDitherPattern >= 1 && uDitherPattern <= 3) t = bayer(ivec2(cell), uDitherPattern);
  else if (uDitherPattern == 4) t = hash12(cell + 17.0);
  float L = max(uDitherLevels - 1.0, 1.0);
  vec3 q = clamp(floor(c * L + t) / L, 0.0, 1.0);
  float k = clamp(floor(tone(c) * L + t) / L, 0.0, 1.0);
  return vec4(q, k);
}

vec4 fxHalftone(vec2 d) {
  float s = uDotSpacing;
  mat2 R = rot(radians(uDotAngle));
  vec2 r = transpose(R) * d; // screen space
  vec2 g = vec2(s, s * (uDotHex > 0.5 ? 0.8660254 : 1.0));
  float best = 0.0;
  vec3 col = vec3(1.0);
  vec2 base = floor(r / g);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cell = base + vec2(float(i), float(j));
    vec2 ce = (cell + 0.5) * g;
    if (uDotHex > 0.5 && mod(cell.y, 2.0) > 0.5) ce.x += 0.5 * s;
    vec3 c = at(R * ce);
    float k = tone(c);
    vec2 p = r - ce;
    float cov;
    if (uDotShape == 0) cov = cover(sqrt(k) * s * 0.7071 * uDotScale, length(p));
    else if (uDotShape == 1) cov = cover(sqrt(k) * s * 0.5 * uDotScale, max(abs(p.x), abs(p.y)));
    else if (uDotShape == 2) cov = cover(sqrt(k) * s * 0.7071 * uDotScale, (abs(p.x) + abs(p.y)) * 0.7071);
    else cov = i == 0 ? cover(k * s * 0.5 * uDotScale, abs(p.y)) : 0.0;
    if (cov > best) { best = cov; col = c; }
  }
  return vec4(col, best);
}

vec4 fxAscii(vec2 d) {
  vec2 cell = floor(d / uCharSize);
  vec3 c = at((cell + 0.5) * uCharSize);
  float k = tone(c);
  float idx = min(floor(k * uGlyphCount), uGlyphCount - 1.0);
  vec2 f = fract(d / uCharSize);
  float m = texture(tGlyphs, vec2((idx + f.x) / uGlyphCount, f.y)).a;
  return vec4(c, m);
}

float hatchLayer(vec2 d, float angle, float k, float th, float seed) {
  if (k <= th) return 0.0;
  vec2 n = vec2(cos(angle), sin(angle));
  float u = dot(d, n) / uHatchSpacing;
  float line = floor(u + 0.5);
  float along = dot(d, vec2(-n.y, n.x));
  // Jitter: each line shifts and wobbles a little.
  u += uHatchJitter * ((hash12(vec2(line, seed)) - 0.5) * 0.5 + 0.12 * sin(along * 0.07 + line * 1.7));
  float dist = abs(u - floor(u + 0.5)) * uHatchSpacing;
  float w = uHatchWidth * (0.55 + 0.9 * clamp((k - th) / max(1.0 - th, 0.05), 0.0, 1.0));
  return cover(w * 0.5, dist);
}

vec4 fxCrosshatch(vec2 d) {
  vec3 c = at(d);
  float k = tone(c);
  float m = 0.0;
  float a0 = radians(uHatchAngle);
  float offs[4] = float[4](0.0, 1.5707963, 0.7853982, -0.7853982);
  for (int i = 0; i < 4; i++) {
    if (i >= uHatchLayers) break;
    float th = float(i + 1) / float(uHatchLayers + 1);
    m = max(m, hatchLayer(d, a0 + offs[i], k, th * 0.9, float(i) * 13.0));
  }
  return vec4(c * 0.55, m);
}

vec4 fxContour(vec2 d) {
  vec3 c = at(d);
  float l = luma(c);
  float v = l * uContourLevels;
  float fw = max(fwidth(v), 1e-4);
  float dist = abs(fract(v + 0.5) - 0.5) / fw; // device px to the nearest iso-line
  float line = clamp(uContourWidth * uScale * 0.5 - dist + 0.5, 0.0, 1.0);
  if (uContourFill > 0.5) {
    float L = max(uContourLevels - 1.0, 1.0);
    vec3 q = floor(c * L + 0.5) / L;
    float k = 1.0 - floor(l * L + 0.5) / L;
    return vec4(mix(q, q * 0.45, line), max(k * 0.85, line));
  }
  return vec4(c * 0.6, line);
}

vec4 fxEdges(vec2 d) {
  float e = max(uEdgeWidth, 0.5 / uScale);
  float tl = darkAt(d + vec2(-e, e)), t = darkAt(d + vec2(0, e)), tr = darkAt(d + vec2(e, e));
  float l = darkAt(d + vec2(-e, 0)), r = darkAt(d + vec2(e, 0));
  float bl = darkAt(d + vec2(-e, -e)), b = darkAt(d + vec2(0, -e)), br = darkAt(d + vec2(e, -e));
  float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
  float gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
  float g = length(vec2(gx, gy)) * 0.25;
  float m = smoothstep(uEdgeThreshold, uEdgeThreshold + 0.08, g);
  vec3 c = at(d);
  return vec4(uEdgeOverlay > 0.5 ? c : c * 0.5, m);
}

vec4 fxPixelate(vec2 d) {
  vec2 cell = floor(d / uPixelSize);
  vec3 c = at((cell + 0.5) * uPixelSize);
  return vec4(c, tone(c));
}

vec4 fxWave(vec2 d) {
  vec2 p = uWaveVertical > 0.5 ? vec2(d.y, d.x) : d;
  vec3 c = at(d);
  float k = tone(c);
  float y = p.y - uWaveAmplitude * k * sin(6.2831853 * p.x * uWaveFrequency / 100.0 + floor(p.y / uWaveSpacing) * 0.9);
  float dist = abs(fract(y / uWaveSpacing + 0.5) - 0.5) * uWaveSpacing;
  float hw = 0.5 * uWaveSpacing * uWaveWidth * k;
  float m = k > 0.02 ? cover(max(hw, 0.25 / uScale), dist) : 0.0;
  return vec4(c * 0.55, m);
}

vec4 fxVoronoi(vec2 d) {
  vec2 g = d / uCellSize;
  vec2 base = floor(g);
  float f1 = 1e9, f2 = 1e9;
  vec2 seed = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cell = base + vec2(float(i), float(j));
    vec2 s = cell + 0.5 + (hash22(cell) - 0.5) * uCellJitter;
    float dd = length(g - s);
    if (dd < f1) { f2 = f1; f1 = dd; seed = s; }
    else if (dd < f2) f2 = dd;
  }
  vec3 c = at(seed * uCellSize);
  float edgeDist = (f2 - f1) * 0.5 * uCellSize;
  float e = uCellEdge > 0.0 ? cover(uCellEdge * 0.5, edgeDist) : 0.0;
  return vec4(c, tone(c)) * (1.0 - e) + vec4(uInk, 1.0) * e;
}

void main() {
  vec2 d = drawPos();
  vec4 raw = rawAt(d);
  vec4 r;
  if (uEffect == 1) r = fxDither(d);
  else if (uEffect == 2) r = fxHalftone(d);
  else if (uEffect == 3) r = fxAscii(d);
  else if (uEffect == 4) r = fxCrosshatch(d);
  else if (uEffect == 5) r = fxContour(d);
  else if (uEffect == 6) r = fxEdges(d);
  else if (uEffect == 7) r = fxPixelate(d);
  else if (uEffect == 8) r = fxWave(d);
  else if (uEffect == 9) r = fxVoronoi(d);
  else r = fxNone(d);

  vec3 col;
  bool continuous = uEffect == 0 || uEffect == 1 || uEffect == 7 || uEffect == 9 || (uEffect == 5 && uContourFill > 0.5);
  if (uMono > 0.5) col = mix(uPaper, uInk, clamp(r.a, 0.0, 1.0));
  else if (continuous) col = r.rgb;
  else if (uEffect == 6 && uEdgeOverlay > 0.5) col = mix(r.rgb, uInk, r.a);
  else col = mix(uPaper, r.rgb, r.a);
  if (uMono > 0.5 && uEffect == 6 && uEdgeOverlay > 0.5) col = mix(vec3(luma(at(d))) * 0.25 + uPaper * 0.75, uInk, r.a);
  // Pixelate grid lines are paper.
  if (uEffect == 7 && uPixelGap > 0.0) {
    vec2 f = d - floor(d / uPixelSize) * uPixelSize;
    float edge = min(min(f.x, f.y), min(uPixelSize - f.x, uPixelSize - f.y));
    col = mix(col, uPaper, cover(uPixelGap * 0.5, edge));
  }
  // The look's amount blends with the plain drawing. A layer look then goes over
  // the result so far where its layers are the visible surface (mask = 1).
  col = mix(raw.rgb, col, uMix);
  if (uUseMask > 0.5) {
    vec3 base = uUseBase > 0.5 ? unpremul(texture(tBase, gl_FragCoord.xy / uTargetSize)).rgb : raw.rgb;
    col = mix(base, col, dot(texture(tMask, uvAt(d)).rgb, uMaskChannel));
  }
  // Premultiplied, like the scene render it replaces.
  float a = uTransparent > 0.5 ? raw.a : 1.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * a, a);
}
`;

const FINISH = /* glsl */ `
${COMMON}
uniform vec2 uFrameHalf; // drawing px
uniform float uGrain, uGrainSize;
uniform float uBloom, uBloomThreshold, uBloomRadius;
uniform float uChromatic;
uniform float uScanlines, uScanlineSpacing;
uniform float uVignette;
uniform sampler2D tMask;
uniform float uUseMask;
uniform vec3 uMaskChannel;
uniform vec2 uMaskOffset, uMaskSize;
uniform sampler2D tBase; // the result so far, aligned with tSrc
uniform float uUseBase;

float valueNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), e = hash12(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
}

void main() {
  vec2 d = drawPos();
  vec4 base = rawAt(d);
  vec3 col = base.rgb;
  if (uChromatic > 0.0) {
    vec2 off = d / uFrameHalf.x * uChromatic;
    col.r = rawAt(d + off).r;
    col.b = rawAt(d - off).b;
  }
  if (uBloom > 0.0) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      float r = sqrt((float(i) + 0.5) / 24.0) * uBloomRadius;
      float a = float(i) * 2.39996;
      vec3 s = rawAt(d + vec2(cos(a), sin(a)) * r).rgb;
      acc += s * smoothstep(uBloomThreshold, 1.0, luma(s));
    }
    col += acc / 24.0 * uBloom;
  }
  if (uScanlines > 0.0) {
    float s = 0.5 + 0.5 * cos(6.2831853 * d.y / uScanlineSpacing);
    col *= 1.0 - uScanlines * (1.0 - s);
  }
  if (uVignette > 0.0) {
    vec2 q = d / uFrameHalf;
    float v = smoothstep(1.6, 0.35, length(q * vec2(1.0, uFrameHalf.y / uFrameHalf.x)) * 1.25);
    col *= mix(1.0, v, uVignette);
  }
  if (uGrain > 0.0) {
    float n = valueNoise(d / max(uGrainSize, 0.1)) + valueNoise(d / max(uGrainSize, 0.1) * 2.03 + 7.1) * 0.5;
    col += (n / 1.5 - 0.5) * uGrain * 0.6;
  }
  if (uUseMask > 0.5) {
    vec3 prev = uUseBase > 0.5 ? unpremul(texture(tBase, uvAt(d))).rgb : base.rgb;
    col = mix(prev, col, dot(texture(tMask, (gl_FragCoord.xy + uMaskOffset) / uMaskSize).rgb, uMaskChannel));
  }
  col = clamp(col, 0.0, 1.0);
  float a = uTransparent > 0.5 ? base.a : 1.0;
  gl_FragColor = vec4(col * a, a);
}
`;

export interface PassGeometry {
  /** Source texture size and the position of the target's pixel (0,0) in it. */
  srcSize: [number, number];
  srcOffset: [number, number];
  /** Device px from the target's pixel (0,0) to the frame centre (bottom-up). */
  fragToFrame: [number, number];
  /** Device px per drawing px. */
  scale: number;
}

/** A layer look's pass: its mask texture and channel, and the result so far to draw over. */
export interface LayerPass {
  mask: Texture;
  channel: number; // 0, 1 or 2
  base: Texture | null;
}

const CHANNELS: [number, number, number][] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export class PostFX {
  private stylizeMat: ShaderMaterial;
  private finishMat: ShaderMaterial;
  private quad = new FullScreenQuad();
  private glyphs: CanvasTexture | null = null;
  private glyphKey = '';

  constructor() {
    const common = () => ({
      tSrc: { value: null as Texture | null },
      uSrcSize: { value: new Vector2(1, 1) },
      uSrcOffset: { value: new Vector2() },
      uFragToFrame: { value: new Vector2() },
      uScale: { value: 1 },
      uTransparent: { value: 0 },
    });
    const u = (names: string[], v = 0) => Object.fromEntries(names.map((n) => [n, { value: v }]));
    this.stylizeMat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: STYLIZE,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ...common(),
        ...u(['uEffect', 'uBrightness', 'uContrast', 'uSaturation', 'uHue', 'uGamma', 'uBlur', 'uInvert', 'uDitherPattern', 'uDitherLevels', 'uDitherScale', 'uDotShape', 'uDotHex', 'uDotSpacing', 'uDotAngle', 'uDotScale', 'uGlyphCount', 'uCharSize', 'uHatchSpacing', 'uHatchWidth', 'uHatchAngle', 'uHatchJitter', 'uHatchLayers', 'uContourLevels', 'uContourWidth', 'uContourFill', 'uEdgeThreshold', 'uEdgeWidth', 'uEdgeOverlay', 'uPixelSize', 'uPixelGap', 'uWaveSpacing', 'uWaveAmplitude', 'uWaveFrequency', 'uWaveWidth', 'uWaveVertical', 'uCellSize', 'uCellEdge', 'uCellJitter', 'uMono', 'uMix']),
        tGlyphs: { value: null as Texture | null },
        uInk: { value: new Color() },
        uPaper: { value: new Color() },
        tMask: { value: null as Texture | null },
        uUseMask: { value: 0 },
        uMaskChannel: { value: new Vector3(1, 0, 0) },
        tBase: { value: null as Texture | null },
        uUseBase: { value: 0 },
        uTargetSize: { value: new Vector2(1, 1) },
        uBg: { value: new Color() },
      },
    });
    this.finishMat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FINISH,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ...common(),
        uFrameHalf: { value: new Vector2(1, 1) },
        tMask: { value: null as Texture | null },
        uUseMask: { value: 0 },
        uMaskChannel: { value: new Vector3(1, 0, 0) },
        tBase: { value: null as Texture | null },
        uUseBase: { value: 0 },
        uMaskOffset: { value: new Vector2() },
        uMaskSize: { value: new Vector2(1, 1) },
        ...u(['uGrain', 'uGrainSize', 'uBloom', 'uBloomThreshold', 'uBloomRadius', 'uChromatic', 'uScanlines', 'uScanlineSpacing', 'uVignette']),
      },
    });
  }

  dispose() {
    this.stylizeMat.dispose();
    this.finishMat.dispose();
    this.quad.dispose();
    this.glyphs?.dispose();
  }

  private glyphTexture(e: EffectsSettings): CanvasTexture {
    const chars = [...charsOf(e)];
    const key = chars.join('');
    if (this.glyphs && key === this.glyphKey) return this.glyphs;
    this.glyphs?.dispose();
    const S = 64;
    const c = document.createElement('canvas');
    c.width = S * chars.length;
    c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(S * 0.82)}px "JetBrains Mono", "SF Mono", Consolas, Menlo, monospace`;
    chars.forEach((ch, i) => ctx.fillText(ch, i * S + S / 2, S * 0.54));
    const t = new CanvasTexture(c);
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.generateMipmaps = true;
    this.glyphs = t;
    this.glyphKey = key;
    return t;
  }

  private setCommon(m: ShaderMaterial, src: Texture, g: PassGeometry, transparent: boolean) {
    const u = m.uniforms;
    u.tSrc.value = src;
    u.uSrcSize.value.set(...g.srcSize);
    u.uSrcOffset.value.set(...g.srcOffset);
    u.uFragToFrame.value.set(...g.fragToFrame);
    u.uScale.value = g.scale;
    u.uTransparent.value = transparent ? 1 : 0;
  }

  /** Pass 1 into `target`. `paper` is the drawing background when the effect uses it. */
  /**
   * Pass 1 into `target`. With `layer`, the look applies only where its mask
   * channel is set (the mask has the size and placement of `src`) and goes over
   * `layer.base` (the result so far, the size of `target`) elsewhere.
   */
  stylize(renderer: WebGLRenderer, src: Texture, target: WebGLRenderTarget, g: PassGeometry, e: EffectsSettings, background: string, transparent: boolean, layer: LayerPass | null = null) {
    const m = this.stylizeMat;
    this.setCommon(m, src, g, transparent);
    const u = m.uniforms;
    u.uUseMask.value = layer ? 1 : 0;
    u.tMask.value = layer?.mask ?? null;
    u.uUseBase.value = layer?.base ? 1 : 0;
    u.tBase.value = layer?.base ?? null;
    if (layer) u.uMaskChannel.value.set(...CHANNELS[layer.channel]);
    u.uTargetSize.value.set(target.width, target.height);
    const set = (k: string, v: number) => (u[k].value = v);
    set('uEffect', EFFECT_INDEX[e.effect] ?? 0);
    set('uBrightness', e.brightness * 0.5);
    set('uContrast', e.contrast);
    set('uSaturation', e.saturation);
    set('uHue', e.hue);
    set('uGamma', Math.max(0.1, e.gamma));
    set('uBlur', e.blur);
    set('uInvert', e.invert ? 1 : 0);
    set('uDitherPattern', DITHER_INDEX[e.ditherPattern] ?? 0);
    set('uDitherLevels', Math.max(2, Math.round(e.ditherLevels)));
    set('uDitherScale', Math.max(0.25, e.ditherScale));
    set('uDotShape', SHAPE_INDEX[e.dotShape] ?? 0);
    set('uDotHex', e.dotGrid === 'hex' ? 1 : 0);
    set('uDotSpacing', Math.max(1, e.dotSpacing));
    set('uDotAngle', e.dotAngle);
    set('uDotScale', e.dotScale);
    if (e.effect === 'ascii') {
      u.tGlyphs.value = this.glyphTexture(e);
      set('uGlyphCount', [...charsOf(e)].length);
    }
    set('uCharSize', Math.max(2, e.charSize));
    set('uHatchSpacing', Math.max(1, e.hatchSpacing));
    set('uHatchWidth', e.hatchWidth);
    set('uHatchAngle', e.hatchAngle);
    set('uHatchJitter', e.hatchJitter);
    set('uHatchLayers', Math.max(1, Math.min(4, Math.round(e.hatchLayers))));
    set('uContourLevels', Math.max(2, Math.round(e.contourLevels)));
    set('uContourWidth', e.contourWidth);
    set('uContourFill', e.contourFill ? 1 : 0);
    set('uEdgeThreshold', e.edgeThreshold);
    set('uEdgeWidth', e.edgeWidth);
    set('uEdgeOverlay', e.edgeOverlay ? 1 : 0);
    set('uPixelSize', Math.max(1, e.pixelSize));
    set('uPixelGap', e.pixelGap);
    set('uWaveSpacing', Math.max(1, e.waveSpacing));
    set('uWaveAmplitude', e.waveAmplitude);
    set('uWaveFrequency', e.waveFrequency);
    set('uWaveWidth', e.waveWidth);
    set('uWaveVertical', e.waveVertical ? 1 : 0);
    set('uCellSize', Math.max(2, e.cellSize));
    set('uCellEdge', e.cellEdge);
    set('uCellJitter', e.cellJitter);
    set('uMono', e.colorMode === 'mono' ? 1 : 0);
    set('uMix', e.mix);
    u.uInk.value.set(e.ink);
    u.uPaper.value.set(e.paperFromBackground ? background : e.paper);
    u.uBg.value.set(background);
    this.draw(renderer, m, target);
  }

  /** Pass 2 into `target` (null = the canvas). `frameHalf` is half the frame in drawing px. */
  /**
   * Pass 2 into `target` (null = the canvas). With `layer`, the finish applies
   * only on the look's layers and keeps `layer.base` (aligned with `src`)
   * elsewhere; `maskSize` / `maskOffset` place this target in the mask.
   */
  finish(renderer: WebGLRenderer, src: Texture, target: WebGLRenderTarget | null, g: PassGeometry, e: EffectsSettings, frameHalf: [number, number], transparent: boolean, layer: (LayerPass & { maskSize: [number, number]; maskOffset: [number, number] }) | null = null) {
    const m = this.finishMat;
    this.setCommon(m, src, g, transparent);
    const u = m.uniforms;
    u.uUseMask.value = layer ? 1 : 0;
    u.tMask.value = layer?.mask ?? null;
    u.uUseBase.value = layer?.base ? 1 : 0;
    u.tBase.value = layer?.base ?? null;
    if (layer) {
      u.uMaskChannel.value.set(...CHANNELS[layer.channel]);
      u.uMaskSize.value.set(...layer.maskSize);
      u.uMaskOffset.value.set(...layer.maskOffset);
    }
    u.uFrameHalf.value.set(...frameHalf);
    u.uGrain.value = e.grain;
    u.uGrainSize.value = e.grainSize;
    u.uBloom.value = e.bloom;
    u.uBloomThreshold.value = e.bloomThreshold;
    u.uBloomRadius.value = e.bloomRadius;
    u.uChromatic.value = e.chromatic;
    u.uScanlines.value = e.scanlines;
    u.uScanlineSpacing.value = Math.max(1, e.scanlineSpacing);
    u.uVignette.value = e.vignette;
    this.draw(renderer, m, target);
  }

  private draw(renderer: WebGLRenderer, m: ShaderMaterial, target: WebGLRenderTarget | null) {
    this.quad.material = m;
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
    renderer.setRenderTarget(was);
  }
}

const VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
