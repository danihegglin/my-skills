extends Control
## The SLICE8 wordmark. It is rendered once into a viewport, then drawn as two halves
## that slide apart along an animated slash.

var font: Font
var t := 0.0
var vp: SubViewport
var text_node: Control
var x0 := 0.0
var base := 0.0
var w1 := 0.0
var w2 := 0.0


func _ready() -> void:
	vp = SubViewport.new()
	vp.transparent_bg = true
	vp.size = Vector2i(size)
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(vp)
	text_node = Control.new()
	text_node.size = size
	text_node.draw.connect(_draw_text)
	vp.add_child(text_node)
	w1 = font.get_string_size("SLICE", HORIZONTAL_ALIGNMENT_LEFT, -1, 150).x
	w2 = font.get_string_size("8", HORIZONTAL_ALIGNMENT_LEFT, -1, 180).x
	x0 = (size.x - w1 - w2 - 10.0) * 0.5
	base = size.y * 0.5 + 52.0


func _draw_text() -> void:
	var c := text_node
	for pass_i in 3:
		var p := Vector2(x0, base)
		var p8 := Vector2(x0 + w1 + 10.0, base + 12.0)
		if pass_i == 0:
			c.draw_string_outline(font, p + Vector2(0, 9), "SLICE", HORIZONTAL_ALIGNMENT_LEFT, -1, 150, 22, Color(0.05, 0.0, 0.12, 0.55))
			c.draw_string_outline(font, p8 + Vector2(0, 9), "8", HORIZONTAL_ALIGNMENT_LEFT, -1, 180, 22, Color(0.05, 0.0, 0.12, 0.55))
		elif pass_i == 1:
			c.draw_string_outline(font, p, "SLICE", HORIZONTAL_ALIGNMENT_LEFT, -1, 150, 14, Color(0.12, 0.03, 0.2))
			c.draw_string_outline(font, p8, "8", HORIZONTAL_ALIGNMENT_LEFT, -1, 180, 14, Color(0.12, 0.03, 0.2))
		else:
			c.draw_string(font, p, "SLICE", HORIZONTAL_ALIGNMENT_LEFT, -1, 150, Color.WHITE)
			c.draw_string(font, p8, "8", HORIZONTAL_ALIGNMENT_LEFT, -1, 180, Color(1.0, 0.32, 0.72))


func _process(delta: float) -> void:
	t += delta
	queue_redraw()


func _draw() -> void:
	var cycle := fposmod(t, 3.6)
	var split := clampf((cycle - 0.35) / 0.18, 0.0, 1.0) * (1.0 - clampf((cycle - 2.6) / 0.7, 0.0, 1.0))
	var a := Vector2(x0 - 40.0, base + 20.0)
	var b := Vector2(x0 + w1 + w2 + 60.0, base - 150.0)
	var dir := (b - a).normalized()
	var n := Vector2(dir.y, -dir.x)
	var far := 3000.0
	var rect := PackedVector2Array([Vector2.ZERO, Vector2(size.x, 0), size, Vector2(0, size.y)])
	var tex := vp.get_texture()
	for side in 2:
		var s := 1.0 if side == 0 else -1.0
		var half := PackedVector2Array([a - dir * far, b + dir * far, b + dir * far + n * far * s, a - dir * far + n * far * s])
		var off := (dir * 8.0 + n * 7.0) * split if side == 0 else (-dir * 5.0 - n * 4.0) * split
		for poly in Geometry2D.intersect_polygons(rect, half):
			var uvs := PackedVector2Array()
			var pts := PackedVector2Array()
			for v in poly:
				uvs.append(v / size)
				pts.append(v + off)
			draw_polygon(pts, PackedColorArray([Color.WHITE]), uvs, tex)
	var sweep := clampf((cycle - 0.15) / 0.25, 0.0, 1.0)
	var fade := 1.0 - clampf((cycle - 0.45) / 0.6, 0.0, 1.0)
	if sweep > 0.0 and fade > 0.0:
		var e := a.lerp(b, sweep)
		draw_line(a, e, Color(0.6, 0.95, 1.0, 0.25 * fade), 26.0, true)
		draw_line(a, e, Color(0.8, 1.0, 1.0, 0.7 * fade), 9.0, true)
		draw_line(a, e, Color(1, 1, 1, fade), 3.0, true)
