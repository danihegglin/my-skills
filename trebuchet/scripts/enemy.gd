extends "res://scripts/destructible.gd"
## A castle defender. Knock them all out to take the castle.

var size := Vector2(22, 36)
var king := false
var blink := 0.0


func setup(p_king: bool) -> void:
	king = p_king
	is_enemy = true
	size = Vector2(26, 42) if king else Vector2(22, 36)
	max_hp = 100.0 if king else 35.0
	hp = max_hp
	points = 1500 if king else 500
	mass = size.x * size.y / 1600.0 * 1.2
	debris_color = Color(0.75, 0.15, 0.15) if not king else Color(0.5, 0.2, 0.6)
	var shape := RectangleShape2D.new()
	shape.size = size
	var cs := CollisionShape2D.new()
	cs.shape = shape
	add_child(cs)
	var pm := PhysicsMaterial.new()
	pm.friction = 0.9
	physics_material_override = pm
	_init_body()
	blink = randf_range(1.0, 4.0)


func _process(delta: float) -> void:
	blink -= delta
	if blink < -0.12:
		blink = randf_range(2.0, 5.0)
	if blink < 0.0 or blink > 1.9:
		queue_redraw()


func _draw() -> void:
	var s := size.y / 36.0
	var skin := Color(0.96, 0.78, 0.62)
	var tunic := Color(0.5, 0.2, 0.6) if king else Color(0.75, 0.15, 0.15)
	var hurt := hp < max_hp
	# legs
	draw_rect(Rect2(Vector2(-8, 11) * s, Vector2(6, 7) * s), Color(0.25, 0.2, 0.15))
	draw_rect(Rect2(Vector2(2, 11) * s, Vector2(6, 7) * s), Color(0.25, 0.2, 0.15))
	# tunic
	draw_rect(Rect2(Vector2(-10, -3) * s, Vector2(20, 15) * s), tunic)
	draw_rect(Rect2(Vector2(-10, 4) * s, Vector2(20, 2.5) * s), Color(0.3, 0.2, 0.1))
	if not king:
		draw_line(Vector2(0, -3) * s, Vector2(0, 11) * s, Color(1, 0.85, 0.3), 2.0 * s)
		draw_line(Vector2(-6, 2) * s, Vector2(6, 2) * s, Color(1, 0.85, 0.3), 2.0 * s)
	# head
	var head := Vector2(0, -10) * s
	draw_circle(head, 8.0 * s, skin)
	# eyes
	var eye_col := Color(0.1, 0.08, 0.06)
	if blink < 0.0:
		draw_line(head + Vector2(-4.5, 0) * s, head + Vector2(-1.5, 0) * s, eye_col, 1.5)
		draw_line(head + Vector2(1.5, 0) * s, head + Vector2(4.5, 0) * s, eye_col, 1.5)
	else:
		draw_circle(head + Vector2(-3, 0) * s, 1.4 * s, eye_col)
		draw_circle(head + Vector2(3, 0) * s, 1.4 * s, eye_col)
	if hurt:
		draw_line(head + Vector2(-5.5, -4) * s, head + Vector2(-1.5, -2.5) * s, eye_col, 1.5)
		draw_line(head + Vector2(5.5, -4) * s, head + Vector2(1.5, -2.5) * s, eye_col, 1.5)
	draw_line(head + Vector2(-2.5, 4) * s, head + Vector2(2.5, 4) * s, eye_col, 1.2)
	if king:
		var c := head + Vector2(0, -7) * s
		var crown := PackedVector2Array([
			c + Vector2(-8, 2) * s, c + Vector2(-8, -6) * s, c + Vector2(-4, -2) * s,
			c + Vector2(0, -8) * s, c + Vector2(4, -2) * s, c + Vector2(8, -6) * s, c + Vector2(8, 2) * s])
		draw_colored_polygon(crown, Color(1.0, 0.82, 0.2))
		draw_circle(c + Vector2(0, -1) * s, 1.5 * s, Color(0.9, 0.1, 0.2))
	else:
		# helmet
		var pts := PackedVector2Array()
		for i in 13:
			var a := PI + PI * i / 12.0
			pts.append(head + Vector2(cos(a), sin(a)) * 8.8 * s + Vector2(0, -2) * s)
		draw_colored_polygon(pts, Color(0.62, 0.64, 0.68))
		draw_line(head + Vector2(-9, -2) * s, head + Vector2(9, -2) * s, Color(0.42, 0.44, 0.48), 2.0 * s)
		draw_line(head + Vector2(0, -2) * s, head + Vector2(0, 3) * s, Color(0.42, 0.44, 0.48), 1.6 * s)
