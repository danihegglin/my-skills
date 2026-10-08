extends Node2D
## Static backdrop: mountains, hills, trees, clouds and the ground.


func _ready() -> void:
	z_index = -5


func _draw() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 7

	draw_circle(Vector2(2900, -1350), 110, Color(1.0, 0.95, 0.75, 0.35))
	draw_circle(Vector2(2900, -1350), 80, Color(1.0, 0.95, 0.75))

	for i in 14:
		var c := Vector2(rng.randf_range(-2500, 6500), rng.randf_range(-1700, -900))
		var w := rng.randf_range(120, 260)
		var col := Color(1, 1, 1, 0.85)
		draw_circle(c, w * 0.32, col)
		draw_circle(c + Vector2(-w * 0.35, w * 0.08), w * 0.24, col)
		draw_circle(c + Vector2(w * 0.35, w * 0.1), w * 0.22, col)
		draw_rect(Rect2(c.x - w * 0.55, c.y + w * 0.05, w * 1.1, w * 0.25), col)

	var pts := PackedVector2Array([Vector2(-4000, 10)])
	var x := -4000.0
	while x < 7700.0:
		pts.append(Vector2(x, -380.0 - rng.randf() * 520.0))
		x += 260.0 + rng.randf() * 240.0
	pts.append(Vector2(8000, 10))
	draw_colored_polygon(pts, Color(0.56, 0.63, 0.76))

	pts = PackedVector2Array([Vector2(-4000, 200)])
	for i in 241:
		var xx := -4000.0 + i * 50.0
		pts.append(Vector2(xx, -110.0 - 80.0 * sin(xx * 0.0021) - 45.0 * sin(xx * 0.0057 + 1.3)))
	pts.append(Vector2(8000, 200))
	draw_colored_polygon(pts, Color(0.45, 0.62, 0.38))

	for i in 90:
		var tx := rng.randf_range(-3500, 7500)
		var ty := -110.0 - 80.0 * sin(tx * 0.0021) - 45.0 * sin(tx * 0.0057 + 1.3) + rng.randf_range(10, 60)
		var h := rng.randf_range(40, 80)
		draw_colored_polygon(PackedVector2Array([
			Vector2(tx - h * 0.3, ty), Vector2(tx, ty - h), Vector2(tx + h * 0.3, ty)]), Color(0.25, 0.42, 0.26))

	draw_rect(Rect2(-4000, 0, 12000, 3000), Color(0.47, 0.34, 0.21))
	draw_rect(Rect2(-4000, 0, 12000, 16), Color(0.38, 0.62, 0.26))
	draw_rect(Rect2(-4000, 16, 12000, 6), Color(0.3, 0.5, 0.2))
	for i in 220:
		var gx := rng.randf_range(-3500, 7500)
		draw_line(Vector2(gx, 2), Vector2(gx + rng.randf_range(-5, 5), -rng.randf_range(6, 14)), Color(0.32, 0.56, 0.22), 2.0)
	for i in 120:
		var sx := rng.randf_range(-3500, 7500)
		draw_circle(Vector2(sx, rng.randf_range(40, 400)), rng.randf_range(4, 12), Color(0.4, 0.29, 0.18))
