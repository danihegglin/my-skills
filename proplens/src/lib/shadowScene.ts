// A three.js scene drawn inside MapLibre as a custom layer: the buildings around an address extruded to
// their heights, lit by the sun so they cast real shadows onto the map, plus an optional sun-hours overlay.

import type { CustomLayerInterface, Map as MapLibreMap } from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import * as THREE from "three";
import type { LatLon } from "./geo";
import type { Building } from "./skyline";

export type ShadowScene = {
  layer: CustomLayerInterface;
  /** Sun direction in degrees (azimuth from north, altitude); `lit` false when it is down or behind the hills. */
  setSun(azimuth: number, altitude: number, lit: boolean): void;
  /** The day's sun path, and its positions at each full hour, as [azimuth, altitude] pairs. */
  setSunPath(path: [number, number][], hours: [number, number][]): void;
  /** Shows or hides the sun, its ray, its path and the ground arrow (the compass stays). */
  setSunMarkers(visible: boolean): void;
  /** Where a point in the sky (or on the ground at altitude 0) seen from the address lands on screen, in CSS pixels; null behind the camera. */
  project(azimuth: number, altitude: number, radius?: number): { x: number; y: number } | null;
  /** A sun-hours texture over the grid (row 0 at the top = north), or null to hide it. */
  setHeatmap(canvas: HTMLCanvasElement | null): void;
  /** Roof colours by building id, or null for the normal colours. */
  setRoofColors(colors: Map<number, string> | null): void;
  dispose(): void;
};

/** How far from the address the sun and its path are drawn, metres: inside the default view. */
export const SKY_RADIUS = 100;
const SUN = 0xffd23f;
const SUN_DEEP = 0xf59e0b;
export const COMPASS_RADIUS = 60;

/** A point in the sky (or on the ground at altitude 0) seen from the address, in scene metres. */
function skyPoint(azimuth: number, altitude: number, r = SKY_RADIUS) {
  const az = (azimuth * Math.PI) / 180;
  const alt = (altitude * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)).multiplyScalar(r);
}

/** A thin rod between two points (WebGL lines are one pixel wide; rods stay visible at any zoom). */
function rod(material: THREE.Material, radius: number) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 8, 1, true), material);
  mesh.frustumCulled = false;
  return Object.assign(mesh, {
    span(a: THREE.Vector3, b: THREE.Vector3) {
      const d = new THREE.Vector3().subVectors(b, a);
      mesh.position.copy(a).addScaledVector(d, 0.5);
      mesh.scale.set(1, d.length(), 1);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    },
  });
}

const WALL = 0xeeebe4;
const ROOF = 0xf8f6f1;
const OWN = 0xd4f26a;

/**
 * `half` is the half-size of the area in metres that gets shadows and the heatmap. The scene is authored in
 * metres east (x), north (y) and up (z) of the address; one matrix places it on the map.
 */
export function createShadowScene(origin: LatLon, buildings: Building[], ownId: number | null, half: number): ShadowScene {
  const mc = MercatorCoordinate.fromLngLat([origin.lon, origin.lat], 0);
  const s = mc.meterInMercatorCoordinateUnits();
  // Mercator y grows southwards, hence the flip.
  const model = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(s, -s, s));

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 2));
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.4);
  sun.castShadow = true;
  const shadowSize = Math.min(4096, (globalThis.devicePixelRatio ?? 1) > 1.5 ? 4096 : 2048);
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -(half + 60);
  sc.right = sc.top = half + 60;
  sc.near = 1;
  sc.far = 6000;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.9;
  scene.add(sun, sun.target);

  // Only the shadows show on the ground; the map stays visible everywhere else.
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(2 * half + 120, 2 * half + 120), new THREE.ShadowMaterial({ color: 0x16202e, opacity: 0.34 }));
  catcher.position.z = 0.02;
  catcher.receiveShadow = true;
  scene.add(catcher);

  // When the sun is behind the hills, everything is in their shadow.
  const dusk = new THREE.Mesh(new THREE.PlaneGeometry(2 * half + 120, 2 * half + 120), new THREE.MeshBasicMaterial({ color: 0x16202e, transparent: true, opacity: 0.3, depthWrite: false }));
  dusk.position.z = 0.03;
  dusk.visible = false;
  scene.add(dusk);

  const heatMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.82, depthWrite: false });
  const heat = new THREE.Mesh(new THREE.PlaneGeometry(2 * half, 2 * half), heatMaterial);
  heat.position.z = 0.04;
  heat.visible = false;
  scene.add(heat);

  const roofs = new Map<number, THREE.MeshLambertMaterial>();
  for (const b of buildings) {
    const pts = b.ring.slice(0, -1).map((p) => new THREE.Vector2(p.x, p.y));
    if (pts.length < 3) continue;
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: Math.max(1, b.height), bevelEnabled: false });
    const own = b.id === ownId;
    const roof = new THREE.MeshLambertMaterial({ color: own ? OWN : ROOF });
    const wall = new THREE.MeshLambertMaterial({ color: own ? OWN : WALL });
    roofs.set(b.id, roof);
    // ExtrudeGeometry puts the caps in group 0 and the sides in group 1.
    const mesh = new THREE.Mesh(geometry, [roof, wall]);
    mesh.castShadow = b.solid || b.height > 2;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  for (const o of [catcher, dusk, heat]) o.frustumCulled = false;

  // The sun: a bright disc with a soft halo, drawn in the sky where it stands.
  const sunGroup = new THREE.Group();
  const discMaterial = new THREE.MeshBasicMaterial({ color: SUN });
  sunGroup.add(new THREE.Mesh(new THREE.SphereGeometry(7, 32, 16), discMaterial));
  for (const [r, opacity] of [[12, 0.35], [19, 0.14]] as const)
    sunGroup.add(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshBasicMaterial({ color: SUN, transparent: true, opacity, depthWrite: false })));
  scene.add(sunGroup);

  // Its light falling on the address.
  const ray = rod(new THREE.MeshBasicMaterial({ color: SUN_DEEP, transparent: true, opacity: 0.75, depthWrite: false }), 0.6);
  scene.add(ray);

  // The day's path across the sky, with a bead at every full hour.
  const pathMaterial = new THREE.MeshBasicMaterial({ color: SUN_DEEP, transparent: true, opacity: 0.55, depthWrite: false });
  const beadMaterial = new THREE.MeshBasicMaterial({ color: SUN_DEEP });
  const path = new THREE.Group();
  scene.add(path);

  // A compass on the ground around the address, with an arrow pointing to the sun.
  const compass = new THREE.Group();
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  compass.add(new THREE.Mesh(new THREE.RingGeometry(COMPASS_RADIUS - 1.2, COMPASS_RADIUS, 128), white));
  for (let deg = 0; deg < 360; deg += 45) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(deg % 90 ? 1 : 1.6, deg % 90 ? 5 : 9), white);
    const a = (deg * Math.PI) / 180;
    tick.position.set(Math.sin(a) * (COMPASS_RADIUS - 2), Math.cos(a) * (COMPASS_RADIUS - 2), 0);
    tick.rotation.z = -a;
    compass.add(tick);
  }
  const north = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-4, COMPASS_RADIUS + 1), new THREE.Vector2(4, COMPASS_RADIUS + 1), new THREE.Vector2(0, COMPASS_RADIUS + 9)])),
    new THREE.MeshBasicMaterial({ color: 0x10140f, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  compass.add(north);
  const arrowShape = new THREE.Shape([
    new THREE.Vector2(-1.6, 10),
    new THREE.Vector2(1.6, 10),
    new THREE.Vector2(1.6, COMPASS_RADIUS - 16),
    new THREE.Vector2(6, COMPASS_RADIUS - 16),
    new THREE.Vector2(0, COMPASS_RADIUS - 4),
    new THREE.Vector2(-6, COMPASS_RADIUS - 16),
    new THREE.Vector2(-1.6, COMPASS_RADIUS - 16),
  ]);
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: SUN_DEEP, transparent: true, opacity: 0.95, depthWrite: false }));
  compass.add(arrow);
  compass.position.z = 0.25;
  compass.traverse((o) => (o.frustumCulled = false));
  scene.add(compass);
  sunGroup.traverse((o) => (o.frustumCulled = false));
  let markers = true;
  let up = false;

  let renderer: THREE.WebGLRenderer | null = null;
  let map: MapLibreMap | null = null;

  const layer: CustomLayerInterface = {
    id: "proplens-shadows",
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      // The shadow map only needs redrawing when the sun moves.
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
    },
    render(gl, args) {
      if (!renderer) return;
      camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(model);
      renderer.resetState();
      renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.render(scene, camera);
    },
    onRemove() {
      renderer?.dispose();
      renderer = null;
    },
  };

  const repaint = () => map?.triggerRepaint();

  return {
    layer,
    setSun(azimuth, altitude, lit) {
      const az = (azimuth * Math.PI) / 180;
      const alt = (Math.max(altitude, 0.5) * Math.PI) / 180;
      sun.position.set(Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)).multiplyScalar(2000);
      sun.intensity = lit ? 2.4 : 0;
      sun.castShadow = lit;
      dusk.visible = !lit;
      // The drawn sun: dimmed when it is behind the hills, gone at night.
      up = altitude > 0;
      const at = skyPoint(azimuth, Math.max(altitude, 0));
      sunGroup.position.copy(at);
      discMaterial.color.set(lit ? SUN : 0xd9c48a);
      ray.span(new THREE.Vector3(0, 0, 3), at);
      arrow.rotation.z = -az;
      sunGroup.visible = ray.visible = arrow.visible = markers && up;
      if (renderer) renderer.shadowMap.needsUpdate = true;
      repaint();
    },
    setSunPath(points, hours) {
      for (const c of [...path.children]) {
        path.remove(c);
        if (c instanceof THREE.Mesh) c.geometry.dispose();
      }
      const above = points.filter(([, alt]) => alt > 0).map(([az, alt]) => skyPoint(az, alt));
      if (above.length > 1) {
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(above), Math.max(16, above.length * 2), 0.7, 6, false), pathMaterial);
        path.add(tube);
      }
      for (const [az, alt] of hours) {
        if (alt <= 0) continue;
        const bead = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), beadMaterial);
        bead.position.copy(skyPoint(az, alt));
        path.add(bead);
      }
      path.traverse((o) => (o.frustumCulled = false));
      repaint();
    },
    setSunMarkers(visible) {
      markers = visible;
      sunGroup.visible = ray.visible = arrow.visible = visible && up;
      path.visible = visible;
      repaint();
    },
    project(azimuth, altitude, radius = SKY_RADIUS) {
      if (!map) return null;
      const p = skyPoint(azimuth, altitude, radius);
      const v = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(camera.projectionMatrix);
      if (v.w <= 0) return null;
      const canvas = map.getCanvas();
      return { x: ((v.x / v.w + 1) / 2) * canvas.clientWidth, y: ((1 - v.y / v.w) / 2) * canvas.clientHeight };
    },
    setHeatmap(canvas) {
      heatMaterial.map?.dispose();
      heatMaterial.map = canvas ? new THREE.CanvasTexture(canvas) : null;
      if (heatMaterial.map) heatMaterial.map.colorSpace = THREE.SRGBColorSpace;
      heatMaterial.needsUpdate = true;
      heat.visible = !!canvas;
      catcher.visible = !canvas;
      repaint();
    },
    setRoofColors(colors) {
      for (const [id, m] of roofs) m.color.set(colors?.get(id) ?? (id === ownId ? OWN : ROOF));
      repaint();
    },
    dispose() {
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        }
      });
      heatMaterial.map?.dispose();
    },
  };
}

/** Colour ramp for sun hours, as a share of the day's possible hours: deep blue for none, warm yellow for all. */
const RAMP: [number, [number, number, number]][] = [
  [0, [38, 52, 102]],
  [0.25, [96, 76, 156]],
  [0.5, [205, 86, 112]],
  [0.75, [247, 150, 70]],
  [1, [253, 226, 112]],
];

export function rampColor(share: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, share));
  for (let i = 1; i < RAMP.length; i++) {
    const [b, cb] = RAMP[i];
    const [a, ca] = RAMP[i - 1];
    if (x <= b) {
      const t = (x - a) / (b - a);
      return [0, 1, 2].map((k) => Math.round(ca[k] + (cb[k] - ca[k]) * t)) as [number, number, number];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export const RAMP_CSS = `linear-gradient(90deg, ${RAMP.map(([at, [r, g, b]]) => `rgb(${r} ${g} ${b}) ${at * 100}%`).join(", ")})`;
