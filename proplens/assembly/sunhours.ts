// Sun hours on a height grid, compiled to WebAssembly (AssemblyScript).
//
// The caller lays out three f32 arrays in this module's memory, at or above heapBase():
//   heights  w*h cells, row-major with row 0 at the south edge: ground 0, roofs at building height (m)
//   suns     n samples of (dx, dy, tanAlt, hours): the unit direction towards the sun (x east, y north),
//            the tangent of its altitude, and the hours that sample stands for
//   out      w*h cells, filled with the hours of direct sun each cell gets
//
// For each sun position the grid is swept in lines parallel to the light, starting on the side facing the
// sun. Along a line the kernel carries the top of the shadow cast so far: it drops by tanAlt for every metre
// travelled and rises to any roof that is taller. A cell is lit when its surface is at or above that shadow.
// Every cell is visited once per sun position, so the cost doesn't depend on how tall the buildings are.

export function heapBase(): usize {
  return __heap_base;
}

@inline function at(ptr: usize, i: i32): f32 {
  return load<f32>(ptr + (<usize>i << 2));
}

export function sunHours(hPtr: usize, w: i32, h: i32, cell: f32, maxH: f32, sPtr: usize, n: i32, oPtr: usize): void {
  for (let i = 0; i < w * h; i++) store<f32>(oPtr + (<usize>i << 2), 0);
  for (let s = 0; s < n; s++) {
    const base = sPtr + (<usize>s << 4);
    const dx = load<f32>(base);
    const dy = load<f32>(base, 4);
    const tanAlt = load<f32>(base, 8);
    const hours = load<f32>(base, 12);
    // March away from the sun along the longer axis, one cell per step; the other axis follows the light.
    const alongX = Mathf.abs(dx) >= Mathf.abs(dy);
    const major = alongX ? w : h;
    const minor = alongX ? h : w;
    const dMajor = alongX ? dx : dy;
    const dMinor = alongX ? dy : dx;
    const step: i32 = dMajor > 0 ? -1 : 1;
    const start: i32 = dMajor > 0 ? major - 1 : 0;
    const slope: f32 = -dMinor / Mathf.abs(dMajor);
    const drop: f32 = tanAlt * cell * Mathf.sqrt(1 + slope * slope);
    // Line l visits (start + k*step, l + floor(k*slope)); together the lines cover every cell exactly once.
    const reach = <i32>Mathf.ceil(Mathf.abs(slope) * <f32>major) + 1;
    for (let l = -reach; l < minor + reach; l++) {
      let shadow: f32 = -1e9;
      for (let k = 0; k < major; k++) {
        const m = l + <i32>Mathf.floor(<f32>k * slope);
        if (m < 0 || m >= minor) {
          // Outside the grid nothing is known: start afresh where the line comes back in.
          shadow = -1e9;
          continue;
        }
        const a = start + k * step;
        const i = alongX ? m * w + a : a * w + m;
        const z = at(hPtr, i);
        shadow -= drop;
        if (z + 0.05 >= shadow) {
          const o = oPtr + (<usize>i << 2);
          store<f32>(o, load<f32>(o) + hours);
        }
        if (z > shadow) shadow = z;
      }
    }
  }
}
