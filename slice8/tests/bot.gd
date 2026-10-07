extends Node
## Plays a level many times with random slices and prints the scores.

var game
var lvl := 0
var trials := 60
var trial := 0
var results: Array = []
var wait := 0.0
var t := 0.0
var rng := RandomNumberGenerator.new()
var trial_t := 0.0


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("level="):
			lvl = int(a.substr(6))
		if a.begins_with("trials="):
			trials = int(a.substr(7))
		if a.begins_with("seed="):
			rng.seed = int(a.substr(5))
	game = load("res://main.tscn").instantiate()
	game.bot_mode = true
	add_child(game)
	await get_tree().process_frame
	game.sfx.muted = true
	_next()


func _next() -> void:
	if trial >= trials:
		results.sort()
		var s := 0.0
		for r in results:
			s += r
		print("LEVEL %d best=%.1f p90=%.1f median=%.1f mean=%.1f" % [lvl, results[-1], results[int(results.size() * 0.9)], results[results.size() / 2], s / results.size()])
		get_tree().quit()
		return
	trial += 1
	game.start_level(lvl)
	wait = rng.randf_range(0.0, 0.3)
	trial_t = 0.0


func _physics_process(delta: float) -> void:
	if game == null or game.level.is_empty():
		return
	trial_t += delta
	if game.state == game.State.RESULT or trial_t > 40.0:
		results.append(game.percent())
		_next()
		return
	if game.state != game.State.PLAY:
		return
	wait -= delta
	if wait > 0.0:
		return
	wait = rng.randf_range(0.0, 0.9)
	var cands: Array = game.pieces.filter(func(p): return not p.dead and p.area > 600.0)
	if cands.is_empty():
		game._begin_settle()
		return
	var p = cands[rng.randi() % cands.size()]
	var wp: PackedVector2Array = p.world_poly()
	var bb := Rect2(wp[0], Vector2.ZERO)
	for v in wp:
		bb = bb.expand(v)
	var pt := bb.get_center()
	for k in 30:
		var c := Vector2(rng.randf_range(bb.position.x, bb.end.x), rng.randf_range(bb.position.y, bb.end.y))
		if Geometry2D.is_point_in_polygon(c, wp):
			pt = c
			break
	var d := Vector2.from_angle(rng.randf() * PI)
	var r: float = p.radius * 2.2 + 20.0
	var n: int = game.slice(pt - d * r, pt + d * r)
	if n > 0:
		game.slices_left -= 1
		if game.slices_left <= 0:
			game._begin_settle()
