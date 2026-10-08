extends Button
## Round button with a vector icon.

var kind := "back"


func _ready() -> void:
	focus_mode = Control.FOCUS_NONE
	for st in ["normal", "hover", "pressed", "disabled", "focus"]:
		add_theme_stylebox_override(st, StyleBoxEmpty.new())
	mouse_entered.connect(queue_redraw)
	mouse_exited.connect(queue_redraw)
	button_down.connect(queue_redraw)
	button_up.connect(queue_redraw)


func _draw() -> void:
	var c := size * 0.5
	var r := minf(size.x, size.y) * 0.5 - 2.0
	var hover := is_hovered()
	draw_circle(c + Vector2(0, 3), r, Color(0, 0, 0, 0.3))
	draw_circle(c, r, Color(0.08, 0.05, 0.14, 0.75) if not hover else Color(0.2, 0.14, 0.3, 0.85))
	draw_arc(c, r, 0, TAU, 40, Color(1, 1, 1, 0.5), 2.5, true)
	var col := Color.WHITE
	var s := r * 0.42
	match kind:
		"back":
			draw_polyline(PackedVector2Array([c + Vector2(s * 0.4, -s), c + Vector2(-s * 0.6, 0), c + Vector2(s * 0.4, s)]), col, 5.0, true)
		"restart":
			draw_arc(c, s, -PI * 0.35, PI * 1.45, 24, col, 4.5, true)
			var tip := c + Vector2.from_angle(-PI * 0.35) * s
			draw_colored_polygon(PackedVector2Array([tip + Vector2(-7, -6), tip + Vector2(7, -2), tip + Vector2(-1, 8)]), col)
		"sound":
			draw_colored_polygon(PackedVector2Array([c + Vector2(-s, -s * 0.4), c + Vector2(-s * 0.4, -s * 0.4), c + Vector2(s * 0.2, -s), c + Vector2(s * 0.2, s), c + Vector2(-s * 0.4, s * 0.4), c + Vector2(-s, s * 0.4)]), col)
			if not button_pressed:
				draw_arc(c + Vector2(s * 0.2, 0), s * 0.6, -0.8, 0.8, 10, col, 3.0, true)
				draw_arc(c + Vector2(s * 0.2, 0), s * 1.0, -0.8, 0.8, 12, col, 3.0, true)
			else:
				draw_line(c + Vector2(s * 0.5, -s * 0.4), c + Vector2(s * 1.2, s * 0.4), col, 3.5, true)
				draw_line(c + Vector2(s * 1.2, -s * 0.4), c + Vector2(s * 0.5, s * 0.4), col, 3.5, true)
