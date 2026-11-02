// Procedural gold Rotary wheel geometry (24 teeth, 6 spokes, keyway hub) and small canvas textures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];

function extrude(shape, depth, bevel) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.7,
    bevelSegments: 3,
    curveSegments: 32,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

function gearShape(teeth, rRoot, rTip, rHole) {
  const shape = new THREE.Shape();
  const p = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * p;
    const pts = [
      polar(rRoot, a),
      polar(rRoot, a + p * 0.18),
      polar(rRoot, a + p * 0.36),
      polar(rTip, a + p * 0.45),
      polar(rTip, a + p * 0.68),
      polar(rTip, a + p * 0.91),
    ];
    pts.forEach(([x, y], j) => (i === 0 && j === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, rHole, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

function ringShape(rOut, rIn) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

// Hub disc with a round bore and a rectangular keyway notch pointing up.
function hubShape(rOut, rBore, keyHalfWidth, keyDepth) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const theta = Math.asin(keyHalfWidth / rBore);
  const yEdge = Math.sqrt(rBore * rBore - keyHalfWidth * keyHalfWidth);
  const hole = new THREE.Path();
  hole.moveTo(-keyHalfWidth, yEdge);
  hole.absarc(0, 0, rBore, Math.PI / 2 + theta, Math.PI / 2 - theta + Math.PI * 2, false);
  hole.lineTo(keyHalfWidth, rBore + keyDepth);
  hole.lineTo(-keyHalfWidth, rBore + keyDepth);
  hole.closePath();
  shape.holes.push(hole);
  return shape;
}

function spokeShape(rFrom, rTo, halfIn, halfOut) {
  const shape = new THREE.Shape();
  shape.moveTo(rFrom, -halfIn);
  shape.lineTo(rTo, -halfOut);
  shape.lineTo(rTo, halfOut);
  shape.lineTo(rFrom, halfIn);
  shape.closePath();
  return shape;
}

export function buildWheelGeometry() {
  const parts = [
    extrude(gearShape(24, 0.9, 1.0, 0.79), 0.14, 0.03),
    extrude(ringShape(0.68, 0.61), 0.12, 0.02),
    extrude(hubShape(0.26, 0.095, 0.03, 0.05), 0.22, 0.03),
  ];
  for (let k = 0; k < 6; k++) {
    const spoke = extrude(spokeShape(0.2, 0.83, 0.055, 0.04), 0.1, 0.02);
    spoke.rotateZ(Math.PI / 6 + (k * Math.PI) / 3);
    parts.push(spoke);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}

export function radialTexture(stops) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([at, color]) => grad.addColorStop(at, color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

