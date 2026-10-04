import * as THREE from 'three';
import { R, toVector } from './sphere';

/**
 * Where the sun is straight overhead right now (the subsolar point), from the standard low-precision
 * solar formulas (good to a fraction of a degree, plenty for shading a globe).
 */
function subsolarPoint(date = new Date()) {
  const days = date.getTime() / 86_400_000 - 10_957.5; // days since J2000 (2000-01-01 12:00 UTC)
  const rad = Math.PI / 180;
  const meanLong = (280.46 + 0.9856474 * days) % 360;
  const anomaly = ((357.528 + 0.9856003 * days) % 360) * rad;
  const eclipticLong = (meanLong + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * rad;
  const obliquity = (23.439 - 0.0000004 * days) * rad;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLong));
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLong), Math.cos(eclipticLong));
  // Greenwich sidereal time tells us which longitude faces the sun.
  const gmst = (280.46061837 + 360.98564736629 * days) % 360;
  let lng = (rightAscension / rad - gmst) % 360;
  if (lng > 180) lng -= 360;
  if (lng < -180) lng += 360;
  return { lat: declination / rad, lng };
}

/** Unit vector toward the sun, in globe coordinates. */
export function sunDirection(date = new Date()) {
  const { lat, lng } = subsolarPoint(date);
  return toVector(lat, lng, 0).normalize();
}

/** Night side shading strength: darker zoomed out, lighter up close so the map stays readable. */
const DARKNESS_FAR = 0.62;
const DARKNESS_NEAR = 0.3;

/**
 * A see-through shell just above the (raised) land that darkens the night side with a soft twilight edge.
 * It only shades (no lighting of its own) and draws after everything below it.
 */
export function buildNightShade() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      sunDir: { value: sunDirection() },
      darkness: { value: DARKNESS_FAR },
      nightColor: { value: new THREE.Color('#1d2236') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform float darkness;
      uniform vec3 nightColor;
      varying vec3 vNormal;
      void main() {
        // 0 in daylight, 1 at night, with a soft band around the terminator (dusk/dawn).
        float night = smoothstep(0.08, -0.12, dot(normalize(vNormal), sunDir));
        gl_FragColor = vec4(nightColor, night * darkness);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.0165, 128, 96), material);
  mesh.renderOrder = 10; // after land, lakes and borders, so it shades them all
  return {
    mesh,
    /** Move the terminator to the current time. */
    updateSun() {
      material.uniforms.sunDir.value.copy(sunDirection());
    },
    /** altitude: camera height as a fraction of the radius. */
    setZoom(altitude: number) {
      const k = THREE.MathUtils.smoothstep(altitude, 0.25, 2.3);
      material.uniforms.darkness.value = THREE.MathUtils.lerp(DARKNESS_NEAR, DARKNESS_FAR, k);
    },
  };
}

/** Whether it is night (sun below the horizon) at a point. */
export function isNightAt(lat: number, lng: number, sun: THREE.Vector3) {
  return toVector(lat, lng, 0).normalize().dot(sun) < -0.02;
}
