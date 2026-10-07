// Surface patterns for sliceable objects. UV is the position inside the *original*
// object's bounding box, so a pattern stays continuous across every cut piece.
shader_type canvas_item;

#include "res://shaders/common.gdshaderinc"

uniform int pattern = 0;
uniform vec4 color_a : source_color = vec4(1.0);
uniform vec4 color_b : source_color = vec4(0.5, 0.5, 0.5, 1.0);
uniform vec4 color_c : source_color = vec4(1.0);
uniform float seed = 0.0;

void fragment() {
	vec4 tint = COLOR;
	vec2 q = (UV - 0.5) * 2.0;
	float d = length(q);
	vec3 col = color_a.rgb;
	float alpha = 1.0;
	if (pattern == 0) {
		// watermelon
		vec3 flesh = mix(color_a.rgb * 1.18, color_a.rgb * 0.82, d);
		vec2 g = q * 5.0 + seed;
		vec2 cell = floor(g);
		vec2 f = fract(g) - 0.5 + (vec2(hash(cell + 1.3), hash(cell + 2.9)) - 0.5) * 0.4;
		float seedm = smoothstep(0.14, 0.1, length(f * vec2(1.0, 0.62))) * step(0.5, hash(cell)) * step(d, 0.72) * step(0.2, d);
		flesh = mix(flesh, vec3(0.12, 0.06, 0.05), seedm);
		float rind = smoothstep(0.86, 0.88, d);
		float white = smoothstep(0.79, 0.82, d) * (1.0 - rind);
		float stripe = smoothstep(-0.1, 0.4, sin(atan(q.y, q.x) * 16.0 + noise(q * 4.0) * 3.0));
		vec3 rindc = mix(color_b.rgb, color_b.rgb * 1.7, stripe);
		col = mix(mix(flesh, color_c.rgb, white), rindc, rind);
	} else if (pattern == 1) {
		// wooden crate
		float py = q.y * 3.0 + 3.0;
		float plank = floor(py);
		float fy = fract(py);
		float grain = noise(vec2(q.x * 2.5 + plank * 7.0, q.y * 30.0)) * 0.55 + noise(vec2(q.x * 9.0, q.y * 70.0)) * 0.25;
		vec3 w = color_a.rgb * (0.8 + 0.35 * grain) * (0.88 + 0.22 * hash(vec2(plank, seed)));
		w = mix(w, color_b.rgb * 0.55, (smoothstep(0.05, 0.0, fy) + smoothstep(0.95, 1.0, fy)) * 0.8);
		float frame = step(0.76, max(abs(q.x), abs(q.y)));
		float brace = step(abs(q.x - q.y), 0.12) * (1.0 - frame);
		col = mix(w, color_b.rgb * (0.85 + 0.35 * grain), max(frame, brace));
		col = mix(col, vec3(0.22), smoothstep(0.06, 0.035, length(abs(q) - vec2(0.88))));
	} else if (pattern == 2) {
		// crystal
		vec3 v = voronoi(q * 2.2 + seed);
		col = mix(color_a.rgb, color_b.rgb, v.z) * (0.72 + 0.5 * v.z);
		col += vec3(1.0) * smoothstep(0.07, 0.0, v.y) * 0.45;
		float sweep = fract(TIME * 0.18 + seed * 0.1) * 4.0 - 2.0;
		col += vec3(1.0) * smoothstep(0.18, 0.0, abs((q.x + q.y) * 0.5 - sweep)) * 0.5;
		col += vec3(1.0) * 0.3 * smoothstep(0.6, 0.0, length(q - vec2(-0.35, -0.45)));
		alpha = 0.96;
	} else if (pattern == 3) {
		// jelly
		col = mix(color_b.rgb, color_a.rgb, smoothstep(-1.0, 1.0, q.y + q.x * 0.3));
		col *= 0.85 + 0.25 * (1.0 - d);
		vec2 g = q * 4.0 + seed;
		vec2 cell = floor(g);
		float h = hash(cell);
		float r = 0.1 + 0.16 * h;
		float bl = length(fract(g) - 0.5);
		float bub = (smoothstep(r, r - 0.04, bl) - smoothstep(r - 0.05, r - 0.09, bl)) * step(0.55, h);
		col += vec3(1.0) * bub * 0.3;
		col += vec3(1.0) * 0.5 * smoothstep(0.35, 0.0, length((q - vec2(-0.35, -0.45)) * vec2(1.0, 1.8)));
		col += 0.05 * sin(TIME * 3.0 + q.x * 6.0);
		alpha = 0.94;
	} else if (pattern == 4) {
		// ice block
		vec3 v = voronoi(q * 3.0 + seed);
		col = mix(color_a.rgb, color_b.rgb, v.z * 0.6 + 0.4 * noise(q * 5.0));
		col += vec3(1.0) * smoothstep(0.045, 0.0, v.y) * 0.65;
		col += vec3(1.0) * smoothstep(0.6, 1.0, noise(q * 14.0)) * 0.2;
		col += vec3(1.0) * 0.25 * smoothstep(0.5, 0.0, length(q - vec2(-0.4, -0.4)));
		alpha = 0.9;
	} else if (pattern == 5) {
		// cheese
		col = color_a.rgb * (0.9 + 0.15 * noise(q * 6.0));
		vec2 g = q * 3.4 + seed;
		vec2 cell = floor(g);
		float h = hash(cell);
		vec2 f = fract(g) - 0.5 + (vec2(hash(cell + 3.3), hash(cell + 8.8)) - 0.5) * 0.3;
		float r = 0.12 + 0.2 * h;
		float hole = smoothstep(r, r - 0.03, length(f)) * step(0.4, h);
		col = mix(col, color_b.rgb * (0.75 + 0.5 * clamp(f.y / r, -1.0, 1.0)), hole);
	} else if (pattern == 6) {
		// lava rock
		float n = fbm(q * 2.5 + seed);
		col = color_b.rgb * (0.7 + 0.7 * n);
		float vein = abs(noise(q * 3.0 + seed) - 0.5);
		float glow = smoothstep(0.07, 0.0, vein) * (0.75 + 0.25 * sin(TIME * 3.0 + q.x * 4.0));
		col = mix(col, color_a.rgb * 1.4, glow) + color_a.rgb * 0.18 * glow;
	} else if (pattern == 7) {
		// brushed metal
		col = color_a.rgb * (0.75 + 0.25 * noise(vec2(q.x * 1.5, q.y * 90.0)));
		col *= 0.78 + 0.38 * smoothstep(1.2, -0.6, q.y + q.x * 0.5);
		col += vec3(1.0) * 0.28 * smoothstep(0.12, 0.0, abs(q.x * 0.7 - q.y * 0.7 + 0.3));
		col = mix(col, color_b.rgb, smoothstep(0.1, 0.08, length(abs(q) - vec2(0.62))) * (1.0 - smoothstep(0.05, 0.03, length(abs(q) - vec2(0.62)))));
	} else if (pattern == 8) {
		// neon glass
		col = color_b.rgb;
		float gx = abs(fract(q.x * 3.0 + 0.5) - 0.5);
		float gy = abs(fract(q.y * 3.0 + 0.5) - 0.5);
		float grid = smoothstep(0.07, 0.0, min(gx, gy));
		float pulse = 0.6 + 0.4 * sin(TIME * 2.5 + (q.x + q.y) * 3.0);
		col += color_a.rgb * grid * pulse + color_a.rgb * 0.22 * (1.0 - d * 0.6);
	} else if (pattern == 9) {
		// candy swirl with sprinkles
		float a = atan(q.y, q.x);
		col = mix(color_a.rgb, color_b.rgb, smoothstep(-0.15, 0.15, sin(a * 5.0 + d * 9.0)));
		vec2 g = q * 6.0 + seed;
		vec2 cell = floor(g);
		float h = hash(cell);
		vec2 f = fract(g) - 0.5;
		float ang = h * 6.28;
		vec2 rf = vec2(f.x * cos(ang) - f.y * sin(ang), f.x * sin(ang) + f.y * cos(ang));
		float spr = step(abs(rf.x), 0.2) * step(abs(rf.y), 0.05) * step(0.6, h);
		vec3 sc = h > 0.86 ? vec3(0.3, 0.8, 1.0) : (h > 0.73 ? vec3(1.0, 0.9, 0.2) : vec3(0.5, 1.0, 0.5));
		col = mix(col, sc, spr);
		col += vec3(1.0) * 0.3 * smoothstep(0.4, 0.0, length((q - vec2(-0.35, -0.45)) * vec2(1.0, 1.6)));
	} else {
		// marble
		float n = fbm(q * 1.8 + seed);
		float vein = abs(sin((q.x + q.y * 0.6 + n * 2.5) * 5.0));
		col = mix(color_b.rgb, color_a.rgb, smoothstep(0.0, 0.35, vein)) * (0.9 + 0.15 * n);
	}
	col *= 1.06 - 0.12 * q.y;
	COLOR = vec4(col * tint.rgb, alpha * tint.a);
}
