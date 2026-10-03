import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';

/** Camera tilt away from straight-down at the closest zoom: 28° ≈ a 62° view of the surface. */
const MAX_TILT = THREE.MathUtils.degToRad(28);
/** Above this altitude (fraction of the radius) the camera looks straight down. */
const TILT_START_ALT = 1.6;
/** The closest the controls allow (minDistance = 1.25 R). */
const TILT_FULL_ALT = 0.25;

/**
 * Tilts the camera as it zooms in: straight down when zoomed out, gradually looking ahead (toward the
 * top of the screen) when close, like flying over the spot instead of hovering above it.
 *
 * The orbit controls keep owning an un-tilted camera: every frame the tilt is undone before the controls
 * update and re-applied right after, so spinning, zooming and the controls' maths are unchanged, while
 * rendering, markers and pointer picking all see the tilted view.
 */
export function installCameraTilt(globe: GlobeMethods) {
  const R = globe.getGlobeRadius();
  const camera = globe.camera() as THREE.PerspectiveCamera;
  const controls = globe.controls();
  const untilted = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  const tiltedAt = new THREE.Vector3();
  let active = false;

  const restore = () => {
    if (!active) return;
    active = false;
    // Something else (e.g. a fly-to animation) moved the camera since we tilted it: keep its move.
    if (!camera.position.equals(tiltedAt)) return;
    camera.position.copy(untilted.position);
    camera.quaternion.copy(untilted.quaternion);
    camera.updateMatrixWorld();
  };

  const n = new THREE.Vector3();
  const screenUp = new THREE.Vector3();
  const ground = new THREE.Vector3();
  const savedUp = new THREE.Vector3();
  const apply = () => {
    const dist = camera.position.length();
    const k = THREE.MathUtils.smoothstep(TILT_START_ALT - (dist / R - 1), 0, TILT_START_ALT - TILT_FULL_ALT);
    const tilt = MAX_TILT * k;
    if (tilt < 0.001) return;
    untilted.position.copy(camera.position);
    untilted.quaternion.copy(camera.quaternion);
    n.copy(camera.position).normalize();
    ground.copy(n).multiplyScalar(R); // the spot straight below
    screenUp.set(0, 1, 0).applyQuaternion(camera.quaternion); // tangent at that spot, pointing up-screen
    const h = dist - R;
    // Swing back (down-screen) around the spot, keeping the same distance to it, and look at it.
    camera.position.copy(ground).addScaledVector(n, h * Math.cos(tilt)).addScaledVector(screenUp, -h * Math.sin(tilt));
    savedUp.copy(camera.up);
    camera.up.copy(screenUp);
    camera.lookAt(ground);
    camera.up.copy(savedUp);
    camera.updateMatrixWorld();
    tiltedAt.copy(camera.position);
    active = true;
  };

  const update = controls.update.bind(controls);
  controls.update = (...args: Parameters<typeof controls.update>) => {
    restore();
    const changed = update(...args);
    apply();
    return changed;
  };
  apply();

  return {
    /** The camera's point of view without the tilt (what the controls and saved views use). */
    untiltedPov() {
      restore();
      const pov = globe.pointOfView();
      apply();
      return pov;
    },
  };
}
