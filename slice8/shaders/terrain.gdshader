// Texture for level geometry; the vertex colour carries the base gradient.
shader_type canvas_item;

#include "res://shaders/common.gdshaderinc"

uniform int style = 0;
uniform vec4 accent : source_color = vec4(1.0);
varying vec2 world;

void vertex() {
	world = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
}

void fragment() {
	vec4 base = COLOR;
	vec2 p = world;
	vec3 col = base.rgb;
	float n = fbm(p * 0.02);
	if (style == 0) {
		col *= 0.82 + 0.35 * n;
		vec2 cell = floor(p / 14.0);
		col = mix(col, col * 0.62, smoothstep(0.24, 0.16, length(fract(p / 14.0) - 0.5)) * step(0.82, hash(cell)));
	} else if (style == 1) {
		col *= 0.84 + 0.12 * sin(p.y * 0.16 + n * 5.0) + 0.12 * n;
	} else if (style == 2) {
		col *= 0.88 + 0.22 * n;
		col += vec3(1.0) * 0.14 * smoothstep(0.92, 1.0, sin((p.x + p.y) * 0.035));
	} else if (style == 3) {
		col *= 0.78 + 0.45 * n;
		col = mix(col, accent.rgb, smoothstep(0.62, 0.68, noise(p * 0.07)) * 0.55);
	} else if (style == 4) {
		col *= 0.86 + 0.14 * noise(vec2(p.x * 0.01, p.y * 0.4));
		col *= 1.0 - 0.35 * step(fract(p.x / 90.0), 0.025);
		vec2 rp = mod(p, vec2(45.0)) - 22.5;
		col = mix(col, col * 1.35, smoothstep(3.5, 2.0, length(rp)));
	} else if (style == 5) {
		col *= 0.7 + 0.6 * n;
		float v = abs(fbm(p * 0.012) - 0.5);
		col += accent.rgb * smoothstep(0.035, 0.0, v) * (0.75 + 0.25 * sin(TIME * 2.0 + p.x * 0.02));
	} else if (style == 6) {
		vec2 panel = floor(p / vec2(60.0, 30.0));
		col *= 0.84 + 0.16 * hash(panel);
		vec2 pf = fract(p / vec2(60.0, 30.0));
		col *= 1.0 - 0.4 * (step(pf.x, 0.03) + step(pf.y, 0.05));
	} else {
		col *= 0.9 + 0.15 * n;
		vec2 g = abs(fract(p / 30.0) - 0.5);
		col += accent.rgb * smoothstep(0.47, 0.5, max(g.x, g.y)) * 0.35;
	}
	COLOR = vec4(col, base.a);
}
