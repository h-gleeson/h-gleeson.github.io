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

const EFFECT_INDEX: Record<EffectsSettings['effect'], number> = { none: 0, dither: 1, halftone: 2, ascii: 3, crosshatch: 4, contour: 5, edges: 6, pixelate: 7, wave: 8, voronoi: 9, shatter: 10, threshold: 11, smear: 12 };
const COLOR_INDEX: Record<EffectsSettings['colorMode'], number> = { original: 0, mono: 1, gradient: 2, palette: 3, spot: 4 };
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
float valueNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), e = hash12(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
}
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
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
uniform float uShardSize, uShardStretch, uShardAngle, uShardOffset, uShardShade, uShardEdge;
uniform float uThreshLevel, uThreshGrit, uThreshGritSize;
uniform float uSmearLength, uSmearAngle, uSmearThreshold, uSmearBright, uSmearBand;
uniform float uMono;
uniform int uColorMode;
uniform vec3 uGradShadow, uGradMid, uGradHigh;
uniform float uGradMidpoint, uGradBands;
uniform vec3 uPal[5];
uniform int uPalCount;
uniform float uPalDither;
uniform vec3 uSpotColor;
uniform float uSpotThreshold;
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

// Broken glass: Voronoi shards stretched along an angle; each slides the picture and shades it a little.
vec4 fxShatter(vec2 d) {
  mat2 R = rot(radians(uShardAngle));
  vec2 p = transpose(R) * d;
  p.x /= uShardStretch;
  vec2 g = p / uShardSize;
  vec2 base = floor(g);
  float f1 = 1e9, f2 = 1e9;
  vec2 seed = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cell = base + vec2(float(i), float(j));
    vec2 s = cell + 0.5 + (hash22(cell + 3.7) - 0.5) * 0.95;
    float dd = length(g - s);
    if (dd < f1) { f2 = f1; f1 = dd; seed = s; }
    else if (dd < f2) f2 = dd;
  }
  vec2 off = (hash22(seed * 7.13 + 1.9) - 0.5) * 2.0 * uShardOffset;
  vec3 c = at(d + R * off);
  float shade = 1.0 + (hash12(seed * 3.31 + 8.2) - 0.5) * uShardShade;
  c = clamp(c * shade, 0.0, 1.0);
  float edgeDist = (f2 - f1) * 0.5 * uShardSize;
  float e = uShardEdge > 0.0 ? cover(uShardEdge * 0.5, edgeDist) : 0.0;
  return vec4(c, tone(c)) * (1.0 - e) + vec4(uInk, 1.0) * e;
}

// Photocopy: a hard threshold whose edge is roughened by toner grit (coarse noise plus per-pixel speckle).
vec4 fxThreshold(vec2 d) {
  vec3 c = at(d);
  float k = tone(c);
  float n = 0.0;
  if (uThreshGrit > 0.0) n = (valueNoise(d / max(uThreshGritSize, 0.25)) * 0.65 + hash12(floor(d * uScale) + 3.1) * 0.35 - 0.5) * uThreshGrit;
  float ink = k > 0.02 ? step(1.0 - uThreshLevel, k + n) : 0.0;
  return vec4(mix(uPaper, uInk, ink), ink);
}

// Smear: each pixel looks back along the streak direction and keeps the lightest
// (or darkest) tone past the threshold, so those tones drag. Every band of rows
// gets its own streak length, like pixel sorting.
vec4 fxSmear(vec2 d) {
  float a = radians(uSmearAngle);
  vec2 dir = vec2(cos(a), sin(a));
  vec2 perp = vec2(-dir.y, dir.x);
  float row = floor(dot(d, perp) / max(uSmearBand, 0.5));
  float len = uSmearLength * (0.2 + 0.8 * hash12(vec2(row, 7.3)));
  vec3 best = at(d);
  float bl = luma(best);
  for (int i = 1; i <= 24; i++) {
    vec3 c = at(d - dir * len * float(i) / 24.0);
    float l = luma(c);
    bool take = uSmearBright > 0.5 ? (l > uSmearThreshold && l > bl) : (l < uSmearThreshold && l < bl);
    if (take) { best = c; bl = l; }
  }
  return vec4(best, tone(best));
}

// Palette: the nearest of up to five inks, optionally ordered-dithered first so gradients break into ink patterns.
vec3 paletteMap(vec3 c, vec2 d) {
  if (uPalDither > 0.0) c += (bayer(ivec2(floor(d / 1.5)), 2) - 0.5) * uPalDither * 0.6;
  vec3 best = uPal[0];
  float bd = 1e9;
  for (int i = 0; i < 5; i++) {
    if (i >= uPalCount) break;
    vec3 e = c - uPal[i];
    float dd = dot(e * e, vec3(2.0, 4.0, 3.0));
    if (dd < bd) { bd = dd; best = uPal[i]; }
  }
  return best;
}

float satOf(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }

// Gradient map: luminance 0 (dark) … 1 (light) through shadow → mid → highlight, optionally in flat bands.
vec3 gradientMap(vec3 c) {
  float t = clamp(luma(c), 0.0, 1.0);
  if (uGradBands >= 2.0) t = min(floor(t * uGradBands), uGradBands - 1.0) / (uGradBands - 1.0);
  float m = clamp(uGradMidpoint, 0.01, 0.99);
  return t < m ? mix(uGradShadow, uGradMid, t / m) : mix(uGradMid, uGradHigh, (t - m) / (1.0 - m));
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
  else if (uEffect == 10) r = fxShatter(d);
  else if (uEffect == 11) r = fxThreshold(d);
  else if (uEffect == 12) r = fxSmear(d);
  else r = fxNone(d);

  vec3 col;
  bool continuous = uEffect == 0 || uEffect == 1 || uEffect == 7 || uEffect == 9 || uEffect == 10 || uEffect == 11 || uEffect == 12 || (uEffect == 5 && uContourFill > 0.5);
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
  if (uColorMode == 2) col = gradientMap(col);
  else if (uColorMode == 3) col = paletteMap(col, d);
  else if (uColorMode == 4) {
    // Spot colour: greyscale, with the drawing's colourful parts (before the effect) in one spot ink.
    float w = smoothstep(uSpotThreshold, uSpotThreshold + 0.08, satOf(at(d)));
    col = mix(vec3(luma(col)), uSpotColor, w);
  }
  // (Gradient map replaces both Original and Mono colouring; Mono's ink/paper stay for outlines.)
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
uniform float uGlitch, uGlitchSlice, uGlitchShift, uGlitchSplit, uGlitchBlocks, uGlitchVertical, uGlitchSeed;
uniform vec3 uGlitchColor;
uniform float uMisprint, uMisprintAngle;
uniform float uEcho, uEchoCount, uEchoOffset, uEchoAngle;
uniform float uHud, uHudDensity, uHudWidth, uHudSeed;
uniform vec3 uHudColor;
uniform sampler2D tMask;
uniform float uUseMask;
uniform vec3 uMaskChannel;
uniform vec2 uMaskOffset, uMaskSize;
uniform sampler2D tBase; // the result so far, aligned with tSrc
uniform float uUseBase;

// HUD overlay: frame brackets, a thin frame, rulers, a centre crosshair, scattered
// circles, leader lines and a waveform strip. Drawn in drawing px from the frame
// centre, so it sits on the sheet the same way in the viewport and the export.
float hudCover(vec2 d) {
  vec2 H = uFrameHalf;
  float w = uHudWidth * 0.5;
  float m = min(H.x, H.y) * 0.06;
  vec2 q = abs(d);
  vec2 inner = H - m;
  vec2 fr = H - m * 0.45;
  float L = min(H.x, H.y) * 0.14;
  float c = 0.0;
  // Corner brackets (heavier), mirrored into all four corners.
  c = max(c, cover(w * 2.2, min(segDist(q, vec2(inner.x - L, inner.y), inner), segDist(q, vec2(inner.x, inner.y - L), inner))));
  // A thin frame just outside them.
  vec2 e = q - fr;
  float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
  c = max(c, 0.55 * cover(w * 0.6, abs(sd)));
  if (sd > 0.0) return c;
  // Rulers: along the top edge and the left edge, a long tick every 5.
  float span = inner.x - L - 6.0;
  if (d.y > inner.y - 10.0 && d.y < inner.y && abs(d.x) < span) {
    float n = floor(d.x / 10.0 + 0.5);
    float len = mod(n, 5.0) == 0.0 ? 10.0 : 4.0;
    if (d.y > inner.y - len) c = max(c, cover(w * 0.7, abs(d.x - n * 10.0)));
  }
  float spanY = inner.y - L - 6.0;
  if (d.x < -inner.x + 10.0 && d.x > -inner.x && abs(d.y) < spanY) {
    float n = floor(d.y / 10.0 + 0.5);
    float len = mod(n, 5.0) == 0.0 ? 10.0 : 4.0;
    if (d.x < -inner.x + len) c = max(c, cover(w * 0.7, abs(d.y - n * 10.0)));
  }
  // Centre crosshair: a ring and four ticks.
  c = max(c, cover(w, abs(length(d) - 11.0)));
  c = max(c, cover(w, min(segDist(q, vec2(16.0, 0.0), vec2(30.0, 0.0)), segDist(q, vec2(0.0, 16.0), vec2(0.0, 30.0)))));
  // Scattered circles, some with a dot.
  vec2 cell = floor(d / 140.0);
  if (hash12(cell + uHudSeed * 3.7 + 11.0) < uHudDensity * 0.45) {
    vec2 ctr = (cell + 0.2 + 0.6 * hash22(cell + uHudSeed * 7.1)) * 140.0;
    float rr = 4.0 + 10.0 * hash12(cell + 5.0 + uHudSeed);
    float dc = length(d - ctr);
    c = max(c, cover(w, abs(dc - rr)));
    if (hash12(cell + 9.0) < 0.4) c = max(c, cover(rr * 0.35, dc));
  }
  // Leader lines: a horizontal run, then a 45° kink, with a dot at the start.
  vec2 cl = floor(d / 220.0);
  if (hash12(cl + uHudSeed * 1.9 + 23.0) < uHudDensity * 0.5) {
    vec2 r2 = hash22(cl + uHudSeed + 3.0);
    vec2 p0 = (cl + vec2(0.1, 0.25 + 0.5 * r2.y)) * 220.0;
    vec2 p1 = p0 + vec2(40.0 + 60.0 * r2.x, 0.0);
    vec2 p2 = p1 + vec2(40.0, r2.x > 0.5 ? 40.0 : -40.0);
    c = max(c, cover(w * 0.7, min(segDist(d, p0, p1), segDist(d, p1, p2))));
    c = max(c, cover(2.0, length(d - p0)));
  }
  // Waveform strip, bottom left.
  float yb = -inner.y + 18.0;
  if (abs(d.y - yb) < 9.0 && d.x > -inner.x + 10.0 && d.x < -inner.x * 0.3) {
    float n = floor(d.x / 4.0);
    float hgt = 2.0 + 14.0 * hash12(vec2(n, uHudSeed + 0.5)) * (0.4 + 0.6 * abs(sin(n * 0.21)));
    if (abs(d.y - yb) < hgt * 0.5) c = max(c, cover(0.75, abs(d.x - (n + 0.5) * 4.0)));
  }
  // A pair of small label boxes, top left.
  vec2 b0 = vec2(-inner.x + 14.0, inner.y - 28.0);
  vec2 bq = abs(d - (b0 + vec2(26.0, -6.0))) - vec2(26.0, 6.0);
  c = max(c, cover(w * 0.7, abs(length(max(bq, 0.0)) + min(max(bq.x, bq.y), 0.0))));
  vec2 bq2 = abs(d - (b0 + vec2(70.0, -6.0))) - vec2(10.0, 6.0);
  c = max(c, cover(w * 0.7, abs(length(max(bq2, 0.0)) + min(max(bq2.x, bq2.y), 0.0))));
  return clamp(c, 0.0, 1.0);
}

// Glitch: slices of the picture (bands along x, or along y when vertical) slide sideways.
// Everything is a function of the drawing position, so export tiles join seamlessly.
vec2 glitchShift(vec2 d, out float hit) {
  float a = uGlitchVertical > 0.5 ? d.x : d.y;
  float band = floor(a / uGlitchSlice);
  // Bands of uneven height: a coarse band is split again where a second hash says so.
  float sub = floor(a / (uGlitchSlice * 0.37));
  float h = hash12(vec2(band, uGlitchSeed * 13.1));
  float hs = hash12(vec2(sub, uGlitchSeed * 5.7 + 2.0));
  hit = step(1.0 - uGlitch, h) * step(0.25, hs);
  float s = (hash12(vec2(band * 1.7 + sub * 0.13, uGlitchSeed + 9.0)) * 2.0 - 1.0) * uGlitchShift * hit;
  return uGlitchVertical > 0.5 ? vec2(0.0, s) : vec2(s, 0.0);
}

// Glitch bars: solid or barcode-striped rectangles in the glitch colour.
float glitchBars(vec2 d) {
  vec2 p = uGlitchVertical > 0.5 ? d.yx : d;
  vec2 size = vec2(uGlitchSlice * 12.0, uGlitchSlice * 1.6);
  vec2 cell = floor(p / size);
  float h = hash12(cell + uGlitchSeed * 3.3 + 40.0);
  if (h > uGlitchBlocks * 0.22) return 0.0;
  vec2 f = (p - cell * size) / size;
  // Each bar covers a random span of its cell.
  float x0 = hash12(cell + 71.0) * 0.5, x1 = x0 + 0.25 + hash12(cell + 13.0) * 0.5;
  if (f.x < x0 || f.x > x1) return 0.0;
  if (hash12(cell + 5.0) < 0.5) return 1.0;
  // Barcode: stripes of uneven width.
  float u = p.x / (uGlitchSlice * 0.45);
  return step(0.45, hash12(vec2(floor(u), cell.y + uGlitchSeed)));
}

void main() {
  vec2 d = drawPos();
  vec4 base = rawAt(d);
  vec3 col = base.rgb;
  vec2 gd = d;
  float glitched = 0.0;
  if (uGlitch > 0.0) {
    gd = d + glitchShift(d, glitched);
    col = rawAt(gd).rgb;
    if (glitched > 0.5 && uGlitchSplit > 0.0) {
      vec2 sp = uGlitchVertical > 0.5 ? vec2(0.0, uGlitchSplit) : vec2(uGlitchSplit, 0.0);
      col.r = rawAt(gd + sp).r;
      col.b = rawAt(gd - sp).b;
    }
  }
  if (uEcho > 0.0) {
    // Ghost copies show where they differ from the paper: darker ghosts on light
    // areas, lighter ghosts on dark areas, each fainter than the last.
    float ea = radians(uEchoAngle);
    vec2 dir = vec2(cos(ea), sin(ea));
    bool light = luma(col) > 0.5;
    for (int k = 1; k <= 6; k++) {
      if (float(k) > uEchoCount) break;
      vec3 g = rawAt(gd - dir * uEchoOffset * float(k)).rgb;
      float w = uEcho * pow(0.62, float(k - 1));
      if (light ? luma(g) < luma(col) - 0.02 : luma(g) > luma(col) + 0.02) col = mix(col, g, w);
    }
  }
  if (uChromatic > 0.0) {
    vec2 off = d / uFrameHalf.x * uChromatic;
    col.r = rawAt(gd + off).r;
    col.b = rawAt(gd - off).b;
  }
  if (uMisprint != 0.0) {
    // Inks out of register: red one way, blue the other, the same across the sheet.
    float ma = radians(uMisprintAngle);
    vec2 o = vec2(cos(ma), sin(ma)) * uMisprint;
    col.r = rawAt(gd + o).r;
    col.b = rawAt(gd - o).b;
  }
  if (uGlitchBlocks > 0.0) col = mix(col, uGlitchColor, glitchBars(d));
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
  if (uHud > 0.0) col = mix(col, uHudColor, hudCover(d) * uHud);
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
        ...u(['uEffect', 'uBrightness', 'uContrast', 'uSaturation', 'uHue', 'uGamma', 'uBlur', 'uInvert', 'uDitherPattern', 'uDitherLevels', 'uDitherScale', 'uDotShape', 'uDotHex', 'uDotSpacing', 'uDotAngle', 'uDotScale', 'uGlyphCount', 'uCharSize', 'uHatchSpacing', 'uHatchWidth', 'uHatchAngle', 'uHatchJitter', 'uHatchLayers', 'uContourLevels', 'uContourWidth', 'uContourFill', 'uEdgeThreshold', 'uEdgeWidth', 'uEdgeOverlay', 'uPixelSize', 'uPixelGap', 'uWaveSpacing', 'uWaveAmplitude', 'uWaveFrequency', 'uWaveWidth', 'uWaveVertical', 'uCellSize', 'uCellEdge', 'uCellJitter', 'uShardSize', 'uShardStretch', 'uShardAngle', 'uShardOffset', 'uShardShade', 'uShardEdge', 'uThreshLevel', 'uThreshGrit', 'uThreshGritSize', 'uSmearLength', 'uSmearAngle', 'uSmearThreshold', 'uSmearBright', 'uSmearBand', 'uPalCount', 'uPalDither', 'uSpotThreshold', 'uMono', 'uColorMode', 'uGradMidpoint', 'uGradBands', 'uMix']),
        uGradShadow: { value: new Color() },
        uGradMid: { value: new Color() },
        uGradHigh: { value: new Color() },
        uPal: { value: [new Color(), new Color(), new Color(), new Color(), new Color()] },
        uSpotColor: { value: new Color() },
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
        ...u(['uGrain', 'uGrainSize', 'uBloom', 'uBloomThreshold', 'uBloomRadius', 'uChromatic', 'uScanlines', 'uScanlineSpacing', 'uVignette', 'uGlitch', 'uGlitchSlice', 'uGlitchShift', 'uGlitchSplit', 'uGlitchBlocks', 'uGlitchVertical', 'uGlitchSeed', 'uMisprint', 'uMisprintAngle', 'uEcho', 'uEchoCount', 'uEchoOffset', 'uEchoAngle', 'uHud', 'uHudDensity', 'uHudWidth', 'uHudSeed']),
        uGlitchColor: { value: new Color() },
        uHudColor: { value: new Color() },
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
    set('uShardSize', Math.max(4, e.shardSize));
    set('uShardStretch', Math.max(1, e.shardStretch));
    set('uShardAngle', e.shardAngle);
    set('uShardOffset', e.shardOffset);
    set('uShardShade', e.shardShade);
    set('uShardEdge', e.shardEdge);
    set('uMono', e.colorMode === 'mono' ? 1 : 0);
    set('uColorMode', COLOR_INDEX[e.colorMode] ?? 0);
    set('uGradMidpoint', e.gradMidpoint);
    set('uGradBands', e.gradBands >= 2 ? Math.round(e.gradBands) : 0);
    u.uGradShadow.value.set(e.gradShadow);
    u.uGradMid.value.set(e.gradMid);
    u.uGradHigh.value.set(e.gradHighlight);
    set('uThreshLevel', e.threshLevel);
    set('uThreshGrit', e.threshGrit);
    set('uThreshGritSize', e.threshGritSize);
    set('uSmearLength', Math.max(0, e.smearLength));
    set('uSmearAngle', e.smearAngle);
    set('uSmearThreshold', e.smearThreshold);
    set('uSmearBright', e.smearBright ? 1 : 0);
    set('uSmearBand', Math.max(0.5, e.smearBand));
    const pal = [e.pal1, e.pal2, e.pal3, e.pal4, e.pal5];
    (u.uPal.value as Color[]).forEach((c, i) => c.set(pal[i]));
    set('uPalCount', Math.max(2, Math.min(5, Math.round(e.palCount))));
    set('uPalDither', e.palDither);
    u.uSpotColor.value.set(e.spotColor);
    set('uSpotThreshold', e.spotThreshold);
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
    u.uGlitch.value = e.glitch;
    u.uGlitchSlice.value = Math.max(1, e.glitchSlice);
    u.uGlitchShift.value = e.glitchShift;
    u.uGlitchSplit.value = e.glitchSplit;
    u.uGlitchBlocks.value = e.glitchBlocks;
    u.uGlitchVertical.value = e.glitchVertical ? 1 : 0;
    u.uGlitchSeed.value = e.glitchSeed;
    u.uGlitchColor.value.set(e.glitchColor);
    u.uMisprint.value = e.misprint;
    u.uMisprintAngle.value = e.misprintAngle;
    u.uEcho.value = e.echo;
    u.uEchoCount.value = Math.max(1, Math.min(6, Math.round(e.echoCount)));
    u.uEchoOffset.value = e.echoOffset;
    u.uEchoAngle.value = e.echoAngle;
    u.uHud.value = e.hud;
    u.uHudDensity.value = e.hudDensity;
    u.uHudWidth.value = Math.max(0.2, e.hudWidth);
    u.uHudSeed.value = e.hudSeed;
    u.uHudColor.value.set(e.hudColor);
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
