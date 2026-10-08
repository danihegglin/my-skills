extends Control
## Live "percent collected" bar with the three star thresholds marked on it.

const Geom := preload("res://scripts/geom.gd")

var value := 0.0
var target := 0.0
var stars: Array = [40, 60, 80]
var font: Font
var accent := Color(0.4, 1.0, 0.6)
var bump := 0.0


func set_target(v: float, animate := true) -> void:
	if v > target + 0.01 and animate:
		bump = 1.0
	target = v
	if not animate:
		value = v
	queue_redraw()


func _process(delta: float) -> void:
	var dirty := false
	if absf(target - value) > 0.01:
		value = move_toward(value, target, delta * maxf(30.0, absf(target - value) * 5.0))
		dirty = true
	if bump > 0.0:
		bump = maxf(0.0, bump - delta * 3.0)
		dirty = true
	if dirty:
		queue_redraw()


func _draw() -> void:
	var w := size.x - 128.0
	var h := 24.0
	var r := Rect2(0, size.y - h - 8.0, w, h)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.03, 0.02, 0.06, 0.6)
	bg.set_corner_radius_all(12)
	bg.set_border_width_all(2)
	bg.border_color = Color(1, 1, 1, 0.3)
	draw_style_box(bg, r.grow(3))
	var fw := w * clampf(value / 100.0, 0.0, 1.0)
	if fw > 4.0:
		var fill := StyleBoxFlat.new()
		fill.bg_color = accent
		fill.set_corner_radius_all(12)
		draw_style_box(fill, Rect2(r.position, Vector2(fw, h)))
		var shine := StyleBoxFlat.new()
		shine.bg_color = Color(1, 1, 1, 0.35)
		shine.set_corner_radius_all(6)
		draw_style_box(shine, Rect2(r.position + Vector2(4, 3), Vector2(maxf(fw - 8.0, 0.0), h * 0.32)))
	for i in stars.size():
		var x := w * float(stars[i]) / 100.0
		var got := value >= float(stars[i]) - 0.001
		draw_line(Vector2(x, r.position.y - 2), Vector2(x, r.end.y + 2), Color(1, 1, 1, 0.65), 2.0)
		var c := Vector2(x, r.position.y - 16.0)
		var pts := Geom.star(11.0 + (2.0 if got else 0.0), 5.0, 5)
		for k in pts.size():
			pts[k] += c
		var closed := pts.duplicate()
		closed.append(pts[0])
		draw_colored_polygon(pts, Color(1.0, 0.82, 0.2) if got else Color(0, 0, 0, 0.35))
		draw_polyline(closed, Color(0.35, 0.2, 0.0) if got else Color(1, 1, 1, 0.6), 2.0, true)
	var txt := "%d%%" % int(floor(value + 0.0001))
	var fs := int(46.0 + bump * 10.0)
	var pos := Vector2(w + 18.0, size.y - 6.0)
	draw_string_outline(font, pos, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 10, Color(0.05, 0.02, 0.08, 0.85))
	draw_string(font, pos, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.WHITE)
