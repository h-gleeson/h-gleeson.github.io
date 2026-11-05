import { Euler, MathUtils, Matrix4, OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { CameraState } from '../state/types';

/**
 * Orthographic camera with an optional oblique shear. Oblique projections
 * (cabinet, cavalier, plan oblique) keep one plane true to scale and slide the
 * receding axis across the screen — a shear of view-space x/y by depth.
 */
export class ObliqueCamera extends OrthographicCamera {
  shearX = 0;
  shearY = 0;
  override updateProjectionMatrix() {
    super.updateProjectionMatrix();
    if (this.shearX || this.shearY) {
      const shear = new Matrix4().set(1, 0, -this.shearX, 0, 0, 1, -this.shearY, 0, 0, 0, 1, 0, 0, 0, 0, 1);
      this.projectionMatrix.multiply(shear);
      this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
    }
  }
}

export function orientation(c: Pick<CameraState, 'azimuth' | 'elevation'>): Quaternion {
  return new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(-c.elevation), MathUtils.degToRad(c.azimuth), 0, 'YXZ'));
}

export function basis(c: Pick<CameraState, 'azimuth' | 'elevation'>) {
  const q = orientation(c);
  return {
    right: new Vector3(1, 0, 0).applyQuaternion(q),
    up: new Vector3(0, 1, 0).applyQuaternion(q),
    back: new Vector3(0, 0, 1).applyQuaternion(q),
  };
}

/** Oblique shear actually in effect (perspective never shears). */
export function shearOf(c: CameraState): [number, number] {
  if (c.projection !== 'ortho' || !c.oblique.enabled) return [0, 0];
  const a = MathUtils.degToRad(c.oblique.angle);
  return [c.oblique.scale * Math.cos(a), c.oblique.scale * Math.sin(a)];
}

export function perspDistance(c: CameraState) {
  return c.height / 2 / Math.tan(MathUtils.degToRad(c.fov) / 2);
}

/**
 * Apply the document camera to live three.js cameras. `c.height` is the height of the
 * drawing frame; `viewScale` (= viewport height / frame height) widens the view so the
 * viewport shows the frame plus its surroundings. `depth` = scene radius for clip planes.
 */
export function applyCamera(c: CameraState, ortho: ObliqueCamera, persp: PerspectiveCamera, aspect: number, depth: number, viewScale = 1) {
  const q = orientation(c);
  const target = new Vector3(...c.target);
  if (c.projection === 'ortho') {
    const h = (c.height / 2) * viewScale;
    ortho.left = -h * aspect;
    ortho.right = h * aspect;
    ortho.top = h;
    ortho.bottom = -h;
    ortho.near = -depth;
    ortho.far = depth;
    ortho.position.copy(target);
    ortho.quaternion.copy(q);
    [ortho.shearX, ortho.shearY] = shearOf(c);
    ortho.updateMatrixWorld(true);
    ortho.updateProjectionMatrix();
    return ortho;
  }
  const dist = perspDistance(c);
  persp.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(c.fov) / 2) * viewScale));
  persp.aspect = aspect;
  persp.position.copy(target).add(new Vector3(0, 0, dist).applyQuaternion(q));
  persp.quaternion.copy(q);
  persp.near = Math.max(dist / 1000, dist - depth * 2, 1e-4);
  persp.far = dist + depth * 2;
  persp.updateMatrixWorld(true);
  persp.updateProjectionMatrix();
  return persp;
}

/** Project world points to the camera's 2D drawing plane (world units, centred on the target). */
export function toPlane(c: CameraState, pts: Vector3[]): { x: number; y: number }[] {
  const { right, up, back } = basis(c);
  const t = new Vector3(...c.target);
  const [sx, sy] = shearOf(c);
  const d = new Vector3();
  return pts.map((p) => {
    d.copy(p).sub(t);
    const z = d.dot(back);
    return { x: d.dot(right) - sx * z, y: d.dot(up) - sy * z };
  });
}

/** Camera target/height that frames the given world points with a margin. */
export function framePoints(c: CameraState, pts: Vector3[], aspect: number, margin = 1.15): Pick<CameraState, 'target' | 'height'> | null {
  if (!pts.length) return null;
  const plane = toPlane(c, pts);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of plane) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const { right, up, back } = basis(c);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const [sx, sy] = shearOf(c);
  // Re-centre along the view direction too, so orbiting pivots around the model.
  let depthMid = 0;
  const t = new Vector3(...c.target);
  for (const p of pts) depthMid += new Vector3().subVectors(p, t).dot(back);
  depthMid /= pts.length;
  const target = t
    .addScaledVector(right, cx + sx * depthMid)
    .addScaledVector(up, cy + sy * depthMid)
    .addScaledVector(back, depthMid);
  let height = Math.max(maxY - minY, (maxX - minX) / aspect, 1e-6) * margin;
  if (c.projection === 'persp') height *= 1.2;
  return { target: [target.x, target.y, target.z], height };
}
