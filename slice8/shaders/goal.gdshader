// Landing zone: a wide energy field that pieces drop into. Pulses whenever it catches one.
shader_type canvas_item;
render_mode blend_add;

uniform vec4 glow : source_color = vec4(0.3, 1.0, 0.6, 1.0);
uniform float width_px = 400.0;
uniform float pulse = 0.0;

void fragment() {
	vec2 uv = UV;
	float x = uv.x * width_px;
	// rises toward the opening (uv.y ~ 0.43 is the floor line), then fades into the pit
	float v = smoothstep(0.0, 0.43, uv.y) * (1.0 - smoothstep(0.55, 1.0, uv.y) * 0.6);
	float edges = smoothstep(28.0, 0.0, x) + smoothstep(width_px - 28.0, width_px, x);
	float streak = 0.5 + 0.5 * sin(x * 0.17 + sin(x * 0.05) * 2.0);
	float flow = 0.5 + 0.5 * sin(uv.y * 30.0 - TIME * 6.0 + streak * 3.0);
	float band = smoothstep(0.03, 0.0, abs(uv.y - 0.43));
	float a = v * v * (0.3 + 0.45 * flow * streak) + edges * v * 0.6 + band * 0.5;
	a *= 1.0 + pulse * 1.2;
	COLOR = vec4(glow.rgb * a, 1.0);
}
