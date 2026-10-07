extends Button
## A world tile on the level select screen.

const Geom := preload("res://scripts/geom.gd")

var index := 0
var title_text := ""
var stars := 0
var locked := false
var best := 0
var sky_a := Color.BLACK
var sky_b := Color.WHITE
var accent := Color.WHITE
var font: Font
var font_small: Font


func _ready() -> void:
	focus_mode = Control.FOCUS_NONE
	for st in ["normal", "hover", "pressed", "disabled", "focus"]:
		add_theme_stylebox_override(st, StyleBoxEmpty.new())
	mouse_entered.connect(queue_redraw)
	mouse_exited.connect(queue_redraw)
	button_down.connect(queue_redraw)
	button_up.connect(queue_redraw)


func _rounded(r: Rect2, rad: float) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var corners := [r.position + Vector2(rad, rad), Vector2(r.end.x - rad, r.position.y + rad), r.end - Vector2(rad, rad), Vector2(r.position.x + rad, r.end.y - rad)]
	for k in 4:
		for j in 7:
			var a := PI + k * PI * 0.5 + j * PI * 0.5 / 6.0
			pts.append(corners[k] + Vector2.from_angle(a) * rad)
	return pts


func _draw() -> void:
	var hover := is_hovered() and not locked
	var down := button_pressed or (is_pressed() and hover)
	var r := Rect2(Vector2(4, 4), size - Vector2(8, 12))
	if hover:
		r.position.y -= 3
	var shadow := _rounded(Rect2(r.position + Vector2(0, 8), r.size), 22.0)
	draw_colored_polygon(shadow, Color(0, 0, 0, 0.35))
	var pts := _rounded(r, 22.0)
	var cols := PackedColorArray()
	for p in pts:
		var t := clampf((p.y - r.position.y) / r.size.y, 0.0, 1.0)
		var c := sky_a.lerp(sky_b, t)
		if hover:
			c = c.lightened(0.12)
		if down:
			c = c.darkened(0.15)
		cols.append(c)
	draw_polygon(pts, cols)
	var closed := pts.duplicate()
	closed.append(pts[0])
	draw_polyline(closed, Color(1, 1, 1, 0.65 if hover else 0.4), 3.0, true)
	var num := str(index + 1)
	var np := r.position + Vector2(22, 92)
	draw_string_outline(font, np, num, HORIZONTAL_ALIGNMENT_LEFT, -1, 84, 12, Color(0, 0, 0, 0.45))
	draw_string(font, np, num, HORIZONTAL_ALIGNMENT_LEFT, -1, 84, Color.WHITE)
	var tp := r.position + Vector2(22, r.size.y - 26)
	draw_string_outline(font, tp, title_text.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 40, 25, 8, Color(0, 0, 0, 0.5))
	draw_string(font, tp, title_text.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 40, 25, Color.WHITE)
	for i in 3:
		var c := r.position + Vector2(r.size.x - 108 + i * 36, 40)
		var sp := Geom.star(15.0, 6.5, 5)
		for k in sp.size():
			sp[k] += c
		var got := i < stars
		draw_colored_polygon(sp, Color(1.0, 0.84, 0.22) if got else Color(0, 0, 0, 0.3))
		var sc := sp.duplicate()
		sc.append(sp[0])
		draw_polyline(sc, Color(0.4, 0.22, 0.0) if got else Color(1, 1, 1, 0.5), 2.0, true)
	if best > 0:
		var bp := r.position + Vector2(r.size.x - 108, 92)
		draw_string(font_small, bp, "best %d%%" % best, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color(1, 1, 1, 0.85))
	if locked:
		draw_colored_polygon(pts, Color(0.02, 0.01, 0.05, 0.62))
		var c := r.get_center() + Vector2(0, -6)
		draw_arc(c + Vector2(0, -14), 15.0, PI, TAU, 16, Color(1, 1, 1, 0.85), 6.0, true)
		draw_line(c + Vector2(-15, -14), c + Vector2(-15, -2), Color(1, 1, 1, 0.85), 6.0)
		draw_line(c + Vector2(15, -14), c + Vector2(15, -2), Color(1, 1, 1, 0.85), 6.0)
		var body := StyleBoxFlat.new()
		body.bg_color = Color(1, 1, 1, 0.9)
		body.set_corner_radius_all(6)
		draw_style_box(body, Rect2(c + Vector2(-24, -4), Vector2(48, 38)))
		draw_circle(c + Vector2(0, 12), 5.0, Color(0.1, 0.05, 0.15))
