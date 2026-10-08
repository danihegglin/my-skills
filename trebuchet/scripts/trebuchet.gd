extends Node2D
## The siege engine. Purely visual; the game spawns projectiles at release_point().

const PIVOT := Vector2(0, -150)
const LONG := 175.0
const SHORT := 55.0
const SLING := 34.0
const REST_ANGLE := 2.62
const RELEASE_ANGLE := 4.95
const GRAVITY := 980.0

var arm_angle := REST_ANGLE
var aim_angle := 0.75
var speed := 1000.0
var show_aim := true
var loaded := true
var ammo_type := "stone"
var tween: Tween


func _process(_delta: float) -> void:
	queue_redraw()


func release_point() -> Vector2:
	return global_position + PIVOT + Vector2.from_angle(RELEASE_ANGLE) * LONG


func fire(on_release: Callable) -> void:
	if tween:
		tween.kill()
	arm_angle = REST_ANGLE
	loaded = true
	tween = create_tween()
	tween.tween_property(self, "arm_angle", RELEASE_ANGLE, 0.42).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(_do_release.bind(on_release))
	tween.tween_property(self, "arm_angle", RELEASE_ANGLE + 0.55, 0.18).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.tween_property(self, "arm_angle", RELEASE_ANGLE + 0.12, 0.3).set_trans(Tween.TRANS_SINE)
	tween.tween_interval(0.3)
	tween.tween_property(self, "arm_angle", REST_ANGLE, 1.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_callback(_reloaded)


func _do_release(cb: Callable) -> void:
	loaded = false
	cb.call()


func _reloaded() -> void:
	loaded = true


func _draw() -> void:
	var wood := Color(0.6, 0.39, 0.19)
	var wood_dark := Color(0.4, 0.25, 0.12)
	var iron := Color(0.3, 0.3, 0.34)
	var rope := Color(0.85, 0.75, 0.55)

	# rear A-frame
	draw_line(Vector2(-62, -26), PIVOT, wood_dark, 12)
	draw_line(Vector2(62, -26), PIVOT, wood_dark, 12)
	draw_line(Vector2(-38, -82), Vector2(38, -82), wood_dark, 8)

	# throwing arm and counterweight
	var dir := Vector2.from_angle(arm_angle)
	var tip := PIVOT + dir * LONG
	var back := PIVOT - dir * SHORT
	draw_line(back, tip, wood, 10)
	draw_line(back, tip, wood_dark, 2)
	draw_line(back, back + Vector2(0, 22), iron, 4)
	var cw := Rect2(back + Vector2(-25, 20), Vector2(50, 42))
	draw_rect(cw, iron)
	draw_rect(cw, Color(0.18, 0.18, 0.2), false, 2.0)
	for rv in [Vector2(6, 6), Vector2(44, 6), Vector2(6, 36), Vector2(44, 36)]:
		draw_circle(cw.position + rv, 2.2, Color(0.5, 0.5, 0.55))

	# front A-frame and base
	draw_line(Vector2(-52, -26), PIVOT, wood, 10)
	draw_line(Vector2(52, -26), PIVOT, wood, 10)
	draw_rect(Rect2(-92, -36, 184, 16), wood)
	draw_rect(Rect2(-92, -36, 184, 16), wood_dark, false, 2.0)
	for wx in [-64.0, 64.0]:
		var c := Vector2(wx, -15)
		draw_circle(c, 15, wood_dark)
		for k in 4:
			var a := k * PI / 4.0
			draw_line(c - Vector2.from_angle(a) * 13, c + Vector2.from_angle(a) * 13, wood, 2.5)
		draw_circle(c, 4.5, iron)
	draw_circle(PIVOT, 7, iron)

	# sling with the loaded shot
	if loaded:
		var t := clampf((arm_angle - REST_ANGLE) / (RELEASE_ANGLE - REST_ANGLE), 0.0, 1.0)
		var sa := lerpf(PI * 0.5, RELEASE_ANGLE + 0.3, t)
		var pp := tip + Vector2.from_angle(sa) * SLING
		draw_line(tip, pp, rope, 2.0)
		_draw_ammo(pp)

	# trajectory preview
	if show_aim and loaded:
		var origin := PIVOT + Vector2.from_angle(RELEASE_ANGLE) * LONG
		var v := Vector2(cos(aim_angle), -sin(aim_angle)) * speed
		for i in range(1, 15):
			var tt := i * 0.075
			var p := origin + v * tt + Vector2(0, 0.5 * GRAVITY * tt * tt)
			draw_circle(p, 7.0 - i * 0.3, Color(1, 1, 1, 0.9 - i * 0.055))


func _draw_ammo(p: Vector2) -> void:
	match ammo_type:
		"fire":
			draw_circle(p, 14, Color(0.36, 0.2, 0.1))
			draw_circle(p + Vector2(0, -18), 5, Color(1.0, 0.6, 0.1))
		"cluster":
			for o in [Vector2(-6, 4), Vector2(6, 4), Vector2(0, -6)]:
				draw_circle(p + o, 7.5, Color(0.45, 0.44, 0.42))
		_:
			draw_circle(p, 14, Color(0.45, 0.44, 0.42))
			draw_circle(p + Vector2(-4, -4), 5, Color(0.62, 0.61, 0.58))
