extends Control
## Shows the remaining slices as glowing blades.

var total := 3
var left := 3
var pulse := 0.0


func set_counts(p_total: int, p_left: int) -> void:
	if p_left < left:
		pulse = 1.0
	total = p_total
	left = p_left
	queue_redraw()


func _process(delta: float) -> void:
	if pulse > 0.0:
		pulse = maxf(0.0, pulse - delta * 3.0)
		queue_redraw()


func _draw() -> void:
	var step := 40.0
	for i in total:
		var c := Vector2(22.0 + i * step, size.y * 0.5)
		var on := i < left
		var col := Color(0.82, 0.97, 1.0) if on else Color(1, 1, 1, 0.16)
		if on:
			draw_circle(c, 17.0, Color(0.5, 0.9, 1.0, 0.16))
		if i == left and pulse > 0.0:
			draw_circle(c, 17.0 + 10.0 * (1.0 - pulse), Color(1, 1, 1, 0.5 * pulse))
		var blade := PackedVector2Array([c + Vector2(-9, 9), c + Vector2(9, -13), c + Vector2(13, -15), c + Vector2(11, -9), c + Vector2(-5, 13)])
		draw_colored_polygon(blade, col)
		draw_line(c + Vector2(-9, 9), c + Vector2(-15, 15), Color(0.95, 0.4, 0.55) if on else Color(1, 1, 1, 0.16), 5.0, true)
