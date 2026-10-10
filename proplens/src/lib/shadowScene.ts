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
  /** A sun-hours texture over the grid (row 0 at the top = north), or null to hide it. */
  setHeatmap(canvas: HTMLCanvasElement | null): void;
  /** Roof colours by building id, or null for the normal colours. */
  setRoofColors(colors: Map<number, string> | null): void;
  dispose(): void;
};

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
      if (renderer) renderer.shadowMap.needsUpdate = true;
      repaint();
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
