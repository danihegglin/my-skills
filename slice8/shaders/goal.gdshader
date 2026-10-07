// Energy chute that collects pieces.
shader_type canvas_item;
render_mode blend_add;

uniform vec4 glow : source_color = vec4(0.3, 1.0, 0.6, 1.0);

void fragment() {
	vec2 uv = UV;
	float v = smoothstep(0.0, 0.62, uv.y) * (1.0 - smoothstep(0.85, 1.0, uv.y) * 0.5);
	float edges = smoothstep(0.1, 0.0, uv.x) + smoothstep(0.9, 1.0, uv.x);
	float streak = 0.5 + 0.5 * sin(uv.x * 37.0 + sin(uv.x * 13.0) * 2.0);
	float flow = 0.5 + 0.5 * sin(uv.y * 28.0 - TIME * 6.0 + streak * 3.0);
	float a = v * v * (0.3 + 0.45 * flow * streak) + edges * v * 0.7;
	COLOR = vec4(glow.rgb * a, 1.0);
}
