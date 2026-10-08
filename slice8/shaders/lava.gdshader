// Molten pool with a wobbling, glowing surface.
shader_type canvas_item;

#include "res://shaders/common.gdshaderinc"

uniform vec4 hot : source_color = vec4(1.0, 0.6, 0.12, 1.0);
uniform vec4 dark : source_color = vec4(0.45, 0.05, 0.02, 1.0);
uniform float top_y = 1180.0;
varying vec2 world;

void vertex() {
	world = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
}

void fragment() {
	vec2 p = world;
	float t = TIME;
	float surf = top_y + 6.0 * sin(p.x * 0.05 + t * 2.0) + 4.0 * sin(p.x * 0.11 - t * 1.3);
	if (p.y < surf) {
		float g = exp(-(surf - p.y) / 22.0) * (0.8 + 0.2 * sin(t * 4.0 + p.x * 0.1));
		COLOR = vec4(hot.rgb, g * 0.55);
	} else {
		float n = fbm(p * 0.02 + vec2(t * 0.15, t * 0.05));
		vec3 col = mix(dark.rgb, hot.rgb, smoothstep(0.35, 0.8, n));
		col += hot.rgb * exp(-(p.y - surf) / 12.0) * 0.9;
		col += vec3(1.0, 0.95, 0.6) * smoothstep(0.78, 0.9, n) * 0.5;
		COLOR = vec4(col, 1.0);
	}
}
