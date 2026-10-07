extends Control
## Three big result stars that pop in one by one.

const Geom := preload("res://scripts/geom.gd")

var scales := [0.0, 0.0, 0.0]
var earned := 0


func reset(count: int) -> void:
	earned = count
	scales = [0.0, 0.0, 0.0]
	queue_redraw()


func pop(i: int) -> void:
	var tw := create_tween()
	tw.tween_method(func(v: float) -> void:
		scales[i] = v
		queue_redraw(), 0.0, 1.0, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _draw() -> void:
	for i in 3:
		var big := i == 1
		var c := Vector2(size.x * 0.5 + (i - 1) * 130.0, size.y * 0.5 + (0.0 if big else 14.0))
		var ro := 52.0 if big else 42.0
		var sp := Geom.star(ro, ro * 0.45, 5)
		for k in sp.size():
			sp[k] += c
		draw_colored_polygon(sp, Color(0, 0, 0, 0.35))
		var cl := sp.duplicate()
		cl.append(sp[0])
		draw_polyline(cl, Color(1, 1, 1, 0.35), 3.0, true)
		var s: float = scales[i]
		if i < earned and s > 0.01:
			var gp := Geom.star(ro * s, ro * 0.45 * s, 5)
			for k in gp.size():
				gp[k] += c
			draw_colored_polygon(gp, Color(1.0, 0.82, 0.2))
			var inner := Geom.star(ro * s * 0.6, ro * 0.27 * s, 5)
			for k in inner.size():
				inner[k] += c + Vector2(0, -3)
			draw_colored_polygon(inner, Color(1.0, 0.93, 0.55))
			var gc := gp.duplicate()
			gc.append(gp[0])
			draw_polyline(gc, Color(0.55, 0.3, 0.0), 3.0, true)
