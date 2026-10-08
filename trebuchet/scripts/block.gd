extends "res://scripts/destructible.gd"
## A rectangular building block made of wood or stone.

const MATERIALS := {
	"wood": {"density": 0.7, "hp": 90.0, "points": 10,
		"color": Color(0.66, 0.45, 0.24), "dark": Color(0.4, 0.25, 0.11)},
	"stone": {"density": 1.8, "hp": 220.0, "points": 25,
		"color": Color(0.67, 0.66, 0.62), "dark": Color(0.4, 0.39, 0.37)},
}

var size := Vector2(40, 40)
var mat := "stone"
var fill := Color.GRAY
var dark := Color.DIM_GRAY
var cracks: Array[PackedVector2Array] = []


func setup(p_size: Vector2, p_mat: String) -> void:
	size = p_size
	mat = p_mat
	var m: Dictionary = MATERIALS[mat]
	var area_factor := clampf(size.x * size.y / 1600.0, 0.5, 2.5)
	max_hp = m.hp * area_factor
	hp = max_hp
	points = m.points
	mass = maxf(0.15, size.x * size.y / 1600.0 * m.density)
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var tint := rng.randf_range(-0.04, 0.04)
	fill = (m.color as Color).lightened(tint) if tint > 0 else (m.color as Color).darkened(-tint)
	dark = m.dark
	debris_color = m.color

	var shape := RectangleShape2D.new()
	shape.size = size
	var cs := CollisionShape2D.new()
	cs.shape = shape
	add_child(cs)
	var pm := PhysicsMaterial.new()
	pm.friction = 0.85
	pm.bounce = 0.02
	physics_material_override = pm
	_init_body()

	for i in 2:
		var pts := PackedVector2Array()
		var p := Vector2(rng.randf_range(-0.5, 0.5) * size.x, -size.y * 0.5 if i == 0 else size.y * 0.5)
		pts.append(p)
		for s in 4:
			p += Vector2(rng.randf_range(-0.25, 0.25) * size.x, (0.22 if i == 0 else -0.22) * size.y)
			p.x = clampf(p.x, -size.x * 0.5 + 2, size.x * 0.5 - 2)
			pts.append(p)
		cracks.append(pts)


func _draw() -> void:
	var r := Rect2(-size * 0.5, size)
	draw_rect(r, fill)
	var line_col := dark
	line_col.a = 0.55
	if mat == "stone":
		var rows := maxi(1, int(round(size.y / 16.0)))
		var rh := size.y / rows
		for i in rows:
			var y0 := -size.y * 0.5 + i * rh
			if i > 0:
				draw_line(Vector2(-size.x * 0.5, y0), Vector2(size.x * 0.5, y0), line_col, 1.5)
			var x := -size.x * 0.5 + (26.0 if i % 2 == 0 else 13.0)
			while x < size.x * 0.5 - 5.0:
				draw_line(Vector2(x, y0), Vector2(x, y0 + rh), line_col, 1.5)
				x += 26.0
	else:
		var horiz := size.x >= size.y
		for i in range(1, 4):
			if horiz:
				var y := -size.y * 0.5 + i * size.y / 4.0
				draw_line(Vector2(-size.x * 0.5 + 3, y), Vector2(size.x * 0.5 - 3, y), line_col, 1.0)
			else:
				var x := -size.x * 0.5 + i * size.x / 4.0
				draw_line(Vector2(x, -size.y * 0.5 + 3), Vector2(x, size.y * 0.5 - 3), line_col, 1.0)
		var n := Vector2(size.x * 0.5 - 4, size.y * 0.5 - 4)
		for c in [Vector2(-n.x, -n.y), Vector2(n.x, -n.y), Vector2(-n.x, n.y), Vector2(n.x, n.y)]:
			draw_circle(c, 1.6, Color(0.2, 0.2, 0.22))
	draw_rect(r, dark, false, 2.0)
	var damage := 1.0 - hp / max_hp
	var crack_col := Color(0.12, 0.08, 0.05, 0.85)
	if damage > 0.25:
		draw_polyline(cracks[0], crack_col, 1.8)
	if damage > 0.55:
		draw_polyline(cracks[1], crack_col, 1.8)
