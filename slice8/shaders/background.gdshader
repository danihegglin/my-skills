// Animated, fully procedural backdrops for the eight worlds.
// The rect lives in world space, so every effect is laid out in playfield pixels (720 x 1280).
shader_type canvas_item;

uniform int theme = 0;
varying vec2 world;

void vertex() {
	world = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
}

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
		mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		v += a * noise(p);
		p = p * 2.03 + vec2(17.1, 9.2);
		a *= 0.5;
	}
	return v;
}

float edge(float y, float h) {
	return smoothstep(h - 1.2, h + 1.2, y);
}

vec3 twinkle(vec2 p, float t, float cell_size, float density, float rad) {
	vec2 cell = floor(p / cell_size);
	float h = hash(cell + cell_size);
	vec2 sp = (cell + 0.2 + 0.6 * vec2(hash(cell + 1.7), hash(cell + 4.3))) * cell_size;
	float tw = 0.55 + 0.45 * sin(t * (1.3 + h * 3.0) + h * 60.0);
	return vec3(0.95, 0.97, 1.0) * smoothstep(rad + 1.0, 0.0, length(p - sp)) * step(1.0 - density, h) * tw;
}

// ---------------------------------------------------------------- 0 meadow
float meadow_h2(float x) {
	return 905.0 + 60.0 * sin(x * 0.006 + 3.0) - 90.0 * noise(vec2(x * 0.005, 7.0));
}

vec3 meadow(vec2 p, float t) {
	vec3 col = mix(vec3(0.30, 0.55, 0.93), vec3(1.0, 0.84, 0.64), smoothstep(-400.0, 950.0, p.y));
	vec2 sun = vec2(560.0, 560.0);
	float d = length(p - sun);
	float ang = atan(p.y - sun.y, p.x - sun.x);
	col += vec3(1.0, 0.75, 0.45) * 0.55 * exp(-d / 260.0);
	col += vec3(1.0, 0.92, 0.7) * 0.07 * (0.5 + 0.5 * sin(ang * 12.0 + t * 0.25)) * exp(-d / 520.0);
	col = mix(col, vec3(1.0, 0.97, 0.86), smoothstep(76.0, 72.0, d));
	float c = fbm(vec2(p.x * 0.0035 + t * 0.012, p.y * 0.009));
	float band = smoothstep(-200.0, 100.0, p.y) * smoothstep(720.0, 320.0, p.y);
	col = mix(col, vec3(1.0, 0.97, 0.95), smoothstep(0.5, 0.72, c) * band * 0.92);
	float h1 = 800.0 + 60.0 * sin(p.x * 0.004 + 1.0) - 120.0 * noise(vec2(p.x * 0.003, 1.0));
	col = mix(col, vec3(0.58, 0.76, 0.78), edge(p.y, h1));
	float h2 = meadow_h2(p.x);
	float cx = (floor(p.x / 46.0) + 0.5) * 46.0;
	float th = meadow_h2(cx) - 8.0;
	float tree = step(0.55, hash(vec2(floor(p.x / 46.0), 3.0)));
	float tri = step(abs(p.x - cx), (p.y - (th - 58.0)) * 0.36) * step(p.y, th + 6.0) * step(th - 58.0, p.y) * tree;
	vec3 hill2 = mix(vec3(0.40, 0.66, 0.40), vec3(0.30, 0.52, 0.32), smoothstep(h2, h2 + 380.0, p.y));
	col = mix(col, vec3(0.22, 0.45, 0.28), tri);
	col = mix(col, hill2, edge(p.y, h2));
	float h3 = 1040.0 + 40.0 * sin(p.x * 0.01) - 60.0 * noise(vec2(p.x * 0.008, 4.0));
	col = mix(col, mix(vec3(0.27, 0.52, 0.27), vec3(0.18, 0.38, 0.2), smoothstep(h3, h3 + 260.0, p.y)), edge(p.y, h3));
	col = mix(col, vec3(1.0, 0.9, 0.78), 0.18 * exp(-abs(p.y - 800.0) / 110.0));
	return col;
}

// ---------------------------------------------------------------- 1 canyon
float mesa(float x, float seed, float base, float amp, float freq) {
	float m = noise(vec2(x * freq, seed));
	float h = base - amp * smoothstep(0.40, 0.47, m) - amp * 0.55 * smoothstep(0.64, 0.69, m);
	return h + 8.0 * noise(vec2(x * 0.06, seed + 3.0));
}

vec3 canyon(vec2 p, float t) {
	vec3 col = mix(vec3(0.15, 0.10, 0.32), vec3(0.86, 0.36, 0.34), smoothstep(-300.0, 560.0, p.y));
	col = mix(col, vec3(1.0, 0.76, 0.42), smoothstep(560.0, 960.0, p.y));
	col += twinkle(p, t, 34.0, 0.1, 1.1) * smoothstep(420.0, -150.0, p.y);
	vec2 sun = vec2(360.0, 860.0);
	float d = length(p - sun);
	col += vec3(1.0, 0.6, 0.3) * 0.5 * exp(-d / 300.0);
	col = mix(col, vec3(1.0, 0.9, 0.58), smoothstep(150.0, 146.0, d));
	float strata = 0.93 + 0.07 * sin(p.y * 0.09 + 2.0 * noise(p * 0.01));
	float h1 = mesa(p.x, 1.0, 980.0, 230.0, 0.0035);
	col = mix(col, vec3(0.66, 0.30, 0.36) * strata, edge(p.y, h1));
	float h2 = mesa(p.x + 300.0, 5.0, 1070.0, 260.0, 0.0046);
	col = mix(col, vec3(0.44, 0.17, 0.22) * strata, edge(p.y, h2));
	float h3 = mesa(p.x + 900.0, 9.0, 1160.0, 210.0, 0.006);
	col = mix(col, vec3(0.25, 0.08, 0.13) * strata, edge(p.y, h3));
	return col;
}

// ---------------------------------------------------------------- 2 ice
vec3 ice(vec2 p, float t) {
	vec3 col = mix(vec3(0.02, 0.05, 0.14), vec3(0.04, 0.19, 0.33), smoothstep(-300.0, 1300.0, p.y));
	col += twinkle(p, t, 40.0, 0.08, 1.0) * 0.7;
	for (int k = 0; k < 3; k++) {
		float fk = float(k);
		float yc = 250.0 + fk * 115.0 + 60.0 * sin(p.x * 0.005 + t * 0.35 + fk * 2.0) + 28.0 * sin(p.x * 0.013 - t * 0.5);
		float curtain = exp(-pow((p.y - yc) / 34.0, 2.0)) + 0.7 * step(yc, p.y) * exp(-(p.y - yc) / 130.0);
		float streak = 0.45 + 0.55 * noise(vec2(p.x * 0.045 + fk * 10.0, t * 0.6));
		vec3 ac = k == 0 ? vec3(0.2, 1.0, 0.6) : (k == 1 ? vec3(0.25, 0.7, 1.0) : vec3(0.75, 0.35, 1.0));
		col += ac * curtain * streak * 0.32;
	}
	float id = floor(p.x / 90.0);
	float jag = abs(fract(p.x / 90.0) - 0.5) * 2.0;
	float sh = 1010.0 - (1.0 - jag) * (120.0 + 170.0 * hash(vec2(id, 2.0)));
	col = mix(col, mix(vec3(0.16, 0.38, 0.55), vec3(0.08, 0.2, 0.32), smoothstep(sh, sh + 300.0, p.y)), edge(p.y, sh));
	col += vec3(0.6, 0.9, 1.0) * 0.25 * smoothstep(3.0, 0.0, abs(p.y - sh)) ;
	float sid = floor(p.x / 64.0);
	float s = abs(fract(p.x / 64.0) - 0.5) * 2.0;
	float len = 70.0 + 190.0 * hash(vec2(sid, 3.0));
	float tip = -240.0 + len * (1.0 - s);
	float stal = 1.0 - edge(p.y, tip);
	col = mix(col, mix(vec3(0.75, 0.92, 1.0), vec3(0.3, 0.55, 0.75), s) * (0.75 + 0.25 * smoothstep(-240.0, tip, p.y)), stal);
	return col;
}

// ---------------------------------------------------------------- 3 reef
vec3 reef(vec2 p, float t) {
	vec3 col = mix(vec3(0.08, 0.62, 0.78), vec3(0.01, 0.10, 0.28), smoothstep(-300.0, 1300.0, p.y));
	float r1 = sin((p.x + p.y * 0.4) * 0.018 + t * 0.35) * 0.5 + 0.5;
	float r2 = sin((p.x + p.y * 0.25) * 0.011 - t * 0.22) * 0.5 + 0.5;
	col += vec3(0.55, 0.9, 1.0) * pow(r1 * r2, 3.0) * 0.4 * smoothstep(1200.0, -200.0, p.y);
	vec2 q = p * 0.012;
	float c = noise(q + vec2(t * 0.25, t * 0.1)) + noise(q * 1.7 - vec2(t * 0.2, -t * 0.15));
	col += vec3(0.6, 0.95, 1.0) * pow(1.0 - abs(c - 1.0), 8.0) * 0.3 * smoothstep(750.0, -200.0, p.y);
	float rh = 1010.0 - 170.0 * fbm(vec2(p.x * 0.004, 2.0));
	col = mix(col, vec3(0.04, 0.24, 0.38), edge(p.y, rh) * 0.85);
	float id = floor(p.x / 95.0);
	float hk = hash(vec2(id, 9.0));
	float bx = (id + 0.5) * 95.0 + (hk - 0.5) * 40.0;
	float sway = 22.0 * sin(p.y * 0.008 + t * 0.9 + hk * 6.0) * smoothstep(1250.0, 500.0, p.y);
	float top = 430.0 + hk * 380.0;
	float w = 9.0 * smoothstep(top, top + 90.0, p.y);
	float leaf = 6.0 * max(0.0, sin(p.y * 0.06 + hk * 4.0));
	float kelp = smoothstep(w + leaf + 1.5, w + leaf - 1.5, abs(p.x - bx - sway)) * step(top, p.y) * step(0.3, hk);
	col = mix(col, vec3(0.03, 0.26, 0.22), kelp * 0.9);
	float sy = 1150.0 + 20.0 * sin(p.x * 0.012);
	col = mix(col, mix(vec3(0.5, 0.46, 0.34), vec3(0.24, 0.22, 0.2), smoothstep(sy, sy + 220.0, p.y)), edge(p.y, sy));
	return col;
}

// ---------------------------------------------------------------- 4 foundry
float gear(vec2 p, vec2 c, float r, float teeth, float ang) {
	vec2 d = p - c;
	float rr = length(d);
	float a = atan(d.y, d.x) + ang;
	float tooth = smoothstep(-0.25, 0.25, sin(a * teeth));
	float R = r + tooth * r * 0.13;
	float body = smoothstep(R + 1.5, R - 1.5, rr);
	float hole = smoothstep(r * 0.16 - 1.5, r * 0.16 + 1.5, rr);
	float spokes = 1.0 - smoothstep(0.35, 0.5, sin(a * 5.0)) * step(r * 0.34, rr) * step(rr, r * 0.72);
	return body * hole * spokes;
}

vec3 foundry(vec2 p, float t) {
	vec3 col = mix(vec3(0.11, 0.09, 0.08), vec3(0.32, 0.14, 0.05), smoothstep(200.0, 1400.0, p.y));
	col = mix(col, vec3(0.17, 0.13, 0.10), gear(p, vec2(-120.0, 380.0), 260.0, 18.0, t * 0.15));
	col = mix(col, vec3(0.17, 0.13, 0.10), gear(p, vec2(830.0, 640.0), 300.0, 20.0, -t * 0.12));
	col = mix(col, vec3(0.26, 0.19, 0.12), gear(p, vec2(140.0, 430.0), 150.0, 12.0, -t * 0.3));
	col = mix(col, vec3(0.26, 0.19, 0.12), gear(p, vec2(372.0, 262.0), 105.0, 9.0, t * 0.43));
	col = mix(col, vec3(0.26, 0.19, 0.12), gear(p, vec2(600.0, 560.0), 170.0, 14.0, t * 0.26));
	col = mix(col, vec3(0.22, 0.16, 0.11), gear(p, vec2(250.0, 960.0), 130.0, 11.0, t * 0.35));
	float py = abs(p.y - 790.0);
	col = mix(col, vec3(0.42, 0.30, 0.18) * (0.45 + 0.6 * (1.0 - py / 24.0)), step(py, 24.0) * 0.9);
	float px = abs(p.x - 665.0);
	col = mix(col, vec3(0.40, 0.29, 0.18) * (0.45 + 0.6 * (1.0 - px / 20.0)), step(px, 20.0) * step(790.0, p.y) * 0.9);
	float s = fbm(vec2(p.x * 0.006, p.y * 0.004 + t * 0.15));
	col += vec3(0.9, 0.85, 0.8) * smoothstep(0.55, 0.85, s) * 0.09;
	col += vec3(1.0, 0.42, 0.1) * 0.38 * smoothstep(700.0, 1350.0, p.y) * (0.85 + 0.15 * sin(t * 2.0));
	return col;
}

// ---------------------------------------------------------------- 5 volcano
vec3 volcano(vec2 p, float t) {
	vec3 col = mix(vec3(0.06, 0.02, 0.03), vec3(0.52, 0.11, 0.04), smoothstep(-200.0, 1000.0, p.y));
	float s = fbm(vec2(p.x * 0.003 + t * 0.01, p.y * 0.004 - t * 0.025));
	col = mix(col, vec3(0.13, 0.05, 0.05), smoothstep(0.42, 0.75, s) * smoothstep(850.0, 0.0, p.y));
	float pulse = 0.8 + 0.2 * sin(t * 1.7);
	vec2 cr = vec2(360.0, 560.0);
	col += vec3(1.0, 0.4, 0.08) * 0.75 * exp(-length(p - cr) / 170.0) * pulse;
	float ridge = 930.0 - 160.0 * fbm(vec2(p.x * 0.004, 8.0));
	col = mix(col, vec3(0.14, 0.05, 0.05), edge(p.y, ridge));
	float cone = 560.0 + max(0.0, abs(p.x - 360.0) - 70.0) * 0.85 + 22.0 * noise(vec2(p.x * 0.02, 1.0));
	vec3 m = mix(vec3(0.17, 0.06, 0.05), vec3(0.07, 0.03, 0.03), smoothstep(cone, cone + 500.0, p.y));
	for (int k = 0; k < 3; k++) {
		float fk = float(k) - 1.0;
		float sx = 360.0 + fk * 40.0 + (p.y - 560.0) * fk * 0.55 + 14.0 * sin(p.y * 0.03 + fk * 2.0);
		float stream = smoothstep(8.0, 2.0, abs(p.x - sx)) * exp(-(p.y - 560.0) / (380.0 + fk * fk * 120.0));
		m += vec3(1.0, 0.45, 0.1) * stream * (1.0 + 0.3 * sin(t * 3.0 + p.y * 0.05)) * 1.3;
	}
	col = mix(col, m, edge(p.y, cone));
	col += vec3(1.0, 0.35, 0.05) * 0.5 * smoothstep(950.0, 1350.0, p.y);
	return col;
}

// ---------------------------------------------------------------- 6 space
vec3 space(vec2 p, float t) {
	vec3 col = vec3(0.01, 0.01, 0.035);
	float n1 = fbm(p * 0.0022 + vec2(t * 0.004, 0.0));
	float n2 = fbm(p * 0.0035 + vec2(5.2, 1.3) - vec2(0.0, t * 0.003));
	col += vec3(0.45, 0.12, 0.55) * pow(n1, 2.5) * 1.7;
	col += vec3(0.05, 0.40, 0.58) * pow(n2, 3.0) * 1.9;
	col += twinkle(p, t, 30.0, 0.18, 0.9);
	col += twinkle(p + 13.0, t, 85.0, 0.25, 1.8);
	vec2 pc = vec2(610.0, 1060.0);
	vec2 d = (p - pc) / 290.0;
	float l = length(d);
	float ca = cos(0.3);
	float sa = sin(0.3);
	vec2 rd = vec2(d.x * ca + d.y * sa, -d.x * sa + d.y * ca);
	float re = length(vec2(rd.x, rd.y * 3.4));
	float ring = smoothstep(0.03, 0.0, abs(re - 1.6) - 0.2) * (0.65 + 0.35 * sin(re * 70.0));
	vec3 rc = vec3(0.9, 0.75, 0.55);
	col = mix(col, rc, ring * 0.6 * step(rd.y, 0.0));
	if (l < 1.0) {
		vec3 n = vec3(d, sqrt(1.0 - l * l));
		float diff = clamp(dot(n, normalize(vec3(-0.6, -0.6, 0.55))), 0.0, 1.0);
		float bands = sin(d.y * 20.0 + 3.0 * fbm(d * 3.0 + t * 0.02)) * 0.5 + 0.5;
		vec3 pcol = mix(vec3(0.82, 0.42, 0.25), vec3(0.96, 0.8, 0.58), bands);
		col = pcol * (0.06 + 0.98 * diff);
	}
	col = mix(col, rc * (0.4 + 0.6 * step(0.0, rd.x)), ring * 0.75 * step(0.0, rd.y));
	col += vec3(0.3, 0.6, 1.0) * smoothstep(1.13, 1.0, l) * smoothstep(0.9, 1.0, l) * 0.9;
	return col;
}

// ---------------------------------------------------------------- 7 neon
vec3 neon(vec2 p, float t) {
	float hz = 770.0;
	vec3 col = mix(vec3(0.04, 0.01, 0.10), vec3(0.56, 0.08, 0.46), smoothstep(-250.0, hz, p.y));
	col += twinkle(p, t, 42.0, 0.08, 1.0) * smoothstep(500.0, 0.0, p.y);
	vec2 sc = vec2(360.0, 620.0);
	float d = length(p - sc);
	float sunr = 200.0;
	vec3 sunc = mix(vec3(1.0, 0.9, 0.3), vec3(1.0, 0.22, 0.55), clamp((p.y - (sc.y - sunr)) / (2.0 * sunr), 0.0, 1.0));
	float cut = step(sc.y - 30.0, p.y) * step(fract((p.y - sc.y) / 26.0 - t * 0.12), clamp((p.y - sc.y + 30.0) / 230.0, 0.0, 0.85));
	col += vec3(1.0, 0.3, 0.6) * 0.35 * exp(-max(d - sunr, 0.0) / 120.0);
	col = mix(col, sunc, smoothstep(sunr + 1.5, sunr - 1.5, d) * (1.0 - cut));
	for (int k = 0; k < 2; k++) {
		float fk = float(k);
		float w = k == 0 ? 36.0 : 58.0;
		float id = floor(p.x / w);
		float h = hash(vec2(id, fk * 5.0 + 1.0));
		float top = hz - (70.0 + 240.0 * h) * (k == 0 ? 1.0 : 0.7);
		vec3 bc = k == 0 ? vec3(0.20, 0.06, 0.28) : vec3(0.07, 0.02, 0.11);
		float inb = edge(p.y, top) * step(p.y, hz);
		vec2 wc = floor(vec2(p.x / 9.0, p.y / 13.0));
		vec2 wf = fract(vec2(p.x / 9.0, p.y / 13.0));
		float lit = step(0.74, hash(wc + fk * 3.0)) * step(0.25, wf.x) * step(wf.x, 0.75) * step(0.3, wf.y) * step(wf.y, 0.7);
		vec3 wcol = k == 1 ? vec3(0.25, 0.95, 1.0) : vec3(1.0, 0.55, 0.9);
		col = mix(col, bc + wcol * lit * 0.7, inb);
	}
	col += vec3(1.0, 0.3, 0.8) * exp(-abs(p.y - hz) / 5.0) * 0.9;
	if (p.y > hz) {
		float dz = p.y - hz + 18.0;
		float gx = (p.x - 360.0) / dz * 3.0;
		float gz = 2400.0 / dz + t * 2.0;
		float lx = smoothstep(0.06 + 3.0 / dz, 0.0, abs(fract(gx + 0.5) - 0.5));
		float lz = smoothstep(0.08, 0.0, abs(fract(gz + 0.5) - 0.5));
		vec3 fl = mix(vec3(0.10, 0.02, 0.16), vec3(0.03, 0.0, 0.07), smoothstep(hz, 1300.0, p.y));
		col = fl + vec3(0.95, 0.2, 1.0) * (lx + lz) * 0.75 * smoothstep(hz, hz + 140.0, p.y);
	}
	col *= 0.93 + 0.07 * sin(p.y * 1.7);
	return col;
}

void fragment() {
	vec2 p = world;
	float t = TIME;
	vec3 col;
	if (theme == 0) {
		col = meadow(p, t);
	} else if (theme == 1) {
		col = canyon(p, t);
	} else if (theme == 2) {
		col = ice(p, t);
	} else if (theme == 3) {
		col = reef(p, t);
	} else if (theme == 4) {
		col = foundry(p, t);
	} else if (theme == 5) {
		col = volcano(p, t);
	} else if (theme == 6) {
		col = space(p, t);
	} else {
		col = neon(p, t);
	}
	float side = smoothstep(-340.0, 10.0, p.x) * smoothstep(1060.0, 710.0, p.x);
	col *= mix(0.4, 1.0, side);
	COLOR = vec4(col, 1.0);
}
