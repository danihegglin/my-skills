extends Node2D
## Slice8: slice shapes with a swipe and let real physics drop the pieces into the glowing chute.
## Score = percentage of the total area that reaches the bottom.

const Geom := preload("res://scripts/geom.gd")
const PieceScript := preload("res://scripts/piece.gd")
const EnvScript := preload("res://scripts/env.gd")
const Levels := preload("res://scripts/levels.gd")
const Themes := preload("res://scripts/themes.gd")
const SfxScript := preload("res://scripts/sfx.gd")
const PercentMeter := preload("res://scripts/ui/percent_meter.gd")
const SliceMeter := preload("res://scripts/ui/slice_meter.gd")
const LevelCard := preload("res://scripts/ui/level_card.gd")
const IconButton := preload("res://scripts/ui/icon_button.gd")
const Logo := preload("res://scripts/ui/logo.gd")
const StarsDisplay := preload("res://scripts/ui/stars_display.gd")
const BG_SHADER := preload("res://shaders/background.gdshader")
const PIECE_SHADER := preload("res://shaders/piece.gdshader")
const FONT_BOLD := preload("res://fonts/fredoka-700.woff2")
const FONT := preload("res://fonts/fredoka-500.woff2")

const FLOOR_Y := 1200.0
const MIN_PIECE_AREA := 80.0
const SEPARATION := 40.0
const SAVE_PATH := "user://slice8.cfg"

enum State { TITLE, SELECT, PLAY, SETTLE, RESULT }

var state := State.TITLE
var bot_mode := false
var level_index := 0
var level: Dictionary
var theme: Dictionary
var pieces: Array = []
var total_area := 0.0
var collected_area := 0.0
var slices_left := 0
var slices_used := 0
var settle_t := 0.0
var calm_t := 0.0
var combo := 0
var combo_t := 0.0
var level_phys: PhysicsMaterial
var saved_stars: Array = []
var saved_best: Array = []

var bg_a: ColorRect
var bg_b: ColorRect
var bg_theme := -1
var bg_tween: Tween
var ambient: CPUParticles2D
var env: Node2D
var pieces_root: Node2D
var fx_root: Node2D
var blade: Node2D
var camera: Camera2D
var sfx: Node
var glow_tex: Texture2D
var streak_tex: Texture2D
var add_mat: CanvasItemMaterial

var dragging := false
var drag_a := Vector2.ZERO
var drag_b := Vector2.ZERO
var slashes: Array = []
var shake := 0.0
var slowmo := 0.0
var last_usec := 0

var attract := true
var attract_spawn_t := 0.0
var attract_cut_t := 1.0
var attract_theme_t := 0.0

var ui_root: Control
var col: Control
var title_ui: Control
var select_ui: Control
var play_ui: Control
var result_ui: Control
var lbl_level: Label
var meter: Control
var slice_meter: Control
var btn_done: Button
var banner: Control
var banner_title: Label
var banner_name: Label
var banner_hint: Label
var banner_tween: Tween
var toast: Label
var toast_tween: Tween
var lbl_total: Label
var cards: Array = []
var res_dim: ColorRect
var res_panel: Control
var res_title: Label
var res_pct: Label
var res_info: Label
var res_stars: Control
var btn_next: Button
var btn_sound: Button


func _ready() -> void:
	randomize()
	_load_save()
	_make_textures()
	bg_a = _make_bg()
	bg_b = _make_bg()
	bg_b.visible = false
	ambient = CPUParticles2D.new()
	ambient.z_index = -50
	add_child(ambient)
	env = EnvScript.new()
	add_child(env)
	pieces_root = Node2D.new()
	add_child(pieces_root)
	fx_root = Node2D.new()
	fx_root.z_index = 30
	add_child(fx_root)
	blade = Node2D.new()
	blade.z_index = 40
	blade.draw.connect(_draw_blade)
	add_child(blade)
	camera = Camera2D.new()
	camera.position = Vector2(360, 640)
	add_child(camera)
	camera.make_current()
	sfx = SfxScript.new()
	add_child(sfx)
	_build_ui()
	_set_theme(7, false)
	_show_screen(State.TITLE)
	last_usec = Time.get_ticks_usec()


# --- setup helpers -----------------------------------------------------------------

func _make_textures() -> void:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.25, 1.0])
	g.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, 0.55), Color(1, 1, 1, 0)])
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1.0, 0.5)
	gt.width = 64
	gt.height = 64
	glow_tex = gt
	var sg := Gradient.new()
	sg.set_color(0, Color(1, 1, 1, 0))
	sg.set_color(1, Color(1, 1, 1, 1))
	var st := GradientTexture2D.new()
	st.gradient = sg
	st.fill_from = Vector2(0.5, 0.0)
	st.fill_to = Vector2(0.5, 1.0)
	st.width = 3
	st.height = 28
	streak_tex = st
	add_mat = CanvasItemMaterial.new()
	add_mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD


func _make_bg() -> ColorRect:
	var r := ColorRect.new()
	r.position = Vector2(-2600, -1700)
	r.size = Vector2(5920, 4700)
	r.z_index = -100
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var m := ShaderMaterial.new()
	m.shader = BG_SHADER
	r.material = m
	add_child(r)
	return r


func _set_theme(i: int, fade := true) -> void:
	theme = Themes.LIST[i]
	if i == bg_theme:
		return
	bg_theme = i
	if bg_tween:
		bg_tween.kill()
	if fade and not bot_mode:
		(bg_b.material as ShaderMaterial).set_shader_parameter("theme", i)
		bg_b.visible = true
		bg_b.modulate.a = 0.0
		bg_tween = create_tween()
		bg_tween.tween_property(bg_b, "modulate:a", 1.0, 0.7)
		bg_tween.tween_callback(func() -> void:
			(bg_a.material as ShaderMaterial).set_shader_parameter("theme", i)
			bg_b.visible = false)
	else:
		(bg_a.material as ShaderMaterial).set_shader_parameter("theme", i)
		bg_b.visible = false
	_setup_ambient(theme.ambient)


func _setup_ambient(kind: String) -> void:
	var p := ambient
	p.emitting = false
	p.position = Vector2(360, 640)
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2(560, 760)
	p.texture = glow_tex
	p.material = add_mat
	p.local_coords = false
	p.preprocess = 6.0
	p.angular_velocity_min = 0.0
	p.angular_velocity_max = 0.0
	p.color_ramp = _ramp_in_out()
	p.particle_flag_align_y = false
	p.gravity = Vector2.ZERO
	p.spread = 30.0
	p.direction = Vector2.UP
	match kind:
		"pollen":
			p.amount = 50
			p.lifetime = 7.0
			p.initial_velocity_min = 8.0
			p.initial_velocity_max = 30.0
			p.scale_amount_min = 0.08
			p.scale_amount_max = 0.18
			p.color = Color(1.0, 0.95, 0.6, 0.8)
		"dust":
			p.amount = 60
			p.lifetime = 6.0
			p.direction = Vector2(1, -0.2)
			p.initial_velocity_min = 20.0
			p.initial_velocity_max = 60.0
			p.scale_amount_min = 0.04
			p.scale_amount_max = 0.1
			p.color = Color(1.0, 0.75, 0.5, 0.7)
		"snow":
			p.amount = 120
			p.lifetime = 9.0
			p.direction = Vector2.DOWN
			p.spread = 20.0
			p.initial_velocity_min = 25.0
			p.initial_velocity_max = 70.0
			p.scale_amount_min = 0.05
			p.scale_amount_max = 0.14
			p.color = Color(0.9, 0.97, 1.0, 0.9)
		"bubbles":
			p.amount = 45
			p.lifetime = 8.0
			p.initial_velocity_min = 40.0
			p.initial_velocity_max = 110.0
			p.spread = 10.0
			p.scale_amount_min = 0.1
			p.scale_amount_max = 0.3
			p.color = Color(0.7, 0.95, 1.0, 0.45)
		"sparks":
			p.amount = 40
			p.lifetime = 2.5
			p.direction = Vector2(0.2, -1)
			p.initial_velocity_min = 80.0
			p.initial_velocity_max = 200.0
			p.gravity = Vector2(0, 180)
			p.scale_amount_min = 0.04
			p.scale_amount_max = 0.1
			p.color = Color(1.0, 0.7, 0.25, 1.0)
		"embers":
			p.amount = 80
			p.lifetime = 5.0
			p.initial_velocity_min = 40.0
			p.initial_velocity_max = 120.0
			p.scale_amount_min = 0.05
			p.scale_amount_max = 0.14
			p.color = Color(1.0, 0.5, 0.15, 1.0)
		"stardust":
			p.amount = 40
			p.lifetime = 10.0
			p.direction = Vector2(1, 0.2)
			p.initial_velocity_min = 5.0
			p.initial_velocity_max = 20.0
			p.scale_amount_min = 0.04
			p.scale_amount_max = 0.1
			p.color = Color(0.7, 0.85, 1.0, 0.8)
		_:
			p.amount = 90
			p.lifetime = 1.6
			p.texture = streak_tex
			p.particle_flag_align_y = true
			p.direction = Vector2(-0.25, 1)
			p.spread = 2.0
			p.initial_velocity_min = 700.0
			p.initial_velocity_max = 900.0
			p.scale_amount_min = 0.6
			p.scale_amount_max = 1.2
			p.color = Color(0.5, 0.9, 1.0, 0.5)
			p.preprocess = 2.0
	p.emitting = not bot_mode
	p.restart()


func _ramp_in_out() -> Gradient:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.2, 0.8, 1.0])
	g.colors = PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, 1), Color(1, 1, 1, 1), Color(1, 1, 1, 0)])
	return g


# --- save data -----------------------------------------------------------------------

func _load_save() -> void:
	saved_stars = []
	saved_best = []
	for i in Levels.COUNT:
		saved_stars.append(0)
		saved_best.append(0)
	var cf := ConfigFile.new()
	if cf.load(SAVE_PATH) == OK:
		for i in Levels.COUNT:
			saved_stars[i] = int(cf.get_value("stars", str(i), 0))
			saved_best[i] = int(cf.get_value("best", str(i), 0))


func _save() -> void:
	if bot_mode:
		return
	var cf := ConfigFile.new()
	for i in Levels.COUNT:
		cf.set_value("stars", str(i), saved_stars[i])
		cf.set_value("best", str(i), saved_best[i])
	cf.save(SAVE_PATH)


func is_unlocked(i: int) -> bool:
	return i == 0 or int(saved_stars[i - 1]) > 0


# --- objects and pieces ------------------------------------------------------------

func spawn_object(o: Dictionary, frozen: bool, gscale := 1.0, ldamp := 0.0, adamp := 0.0, phys: PhysicsMaterial = null) -> RigidBody2D:
	var pts := Geom.make(o)
	var m: Dictionary = Themes.MATERIALS[o.mat]
	var sm := ShaderMaterial.new()
	sm.shader = PIECE_SHADER
	sm.set_shader_parameter("pattern", m.pattern)
	sm.set_shader_parameter("color_a", m.a)
	sm.set_shader_parameter("color_b", m.b)
	sm.set_shader_parameter("color_c", m.get("c", Color.WHITE))
	sm.set_shader_parameter("seed", randf() * 10.0)
	var bb := Geom.bbox(pts)
	var pins: Array = o.get("pins", [])
	var obj := {"mat": sm, "rim": m.rim, "cut": m.cut, "pins": pins, "cuts": [],
		"bb_pos": bb.position, "bb_size": bb.size, "phys": phys, "gscale": gscale, "ldamp": ldamp, "adamp": adamp}
	var p: RigidBody2D = PieceScript.new()
	p.setup(obj, pts, Transform2D(deg_to_rad(o.get("rot", 0.0)), o.pos), not pins.is_empty(), frozen)
	p.impact.connect(_on_piece_impact)
	pieces_root.add_child(p)
	pieces.append(p)
	return p


## Cuts every piece the segment a-b passes through. Returns how many pieces were cut.
func slice(a: Vector2, b: Vector2) -> int:
	var count := 0
	for p in pieces.duplicate():
		if not p.dead and _cut_piece(p, a, b):
			count += 1
	if count > 0:
		var dir := (b - a).normalized()
		slashes.append({"a": a - dir * 30.0, "b": b + dir * 30.0, "t": 0.0})
		sfx.play("slice", -10.0 if attract else -2.0, randf_range(0.9, 1.15))
		shake = maxf(shake, 7.0)
		if not attract and not bot_mode:
			slowmo = 0.16
	return count


func _cut_piece(p: RigidBody2D, a: Vector2, b: Vector2) -> bool:
	var M: Transform2D = p.obj_to_world()
	var inv := M.affine_inverse()
	var la := inv * a
	var lb := inv * b
	var poly: PackedVector2Array = p.poly
	var inside := Geometry2D.intersect_polyline_with_polygon(PackedVector2Array([la, lb]), poly)
	if inside.is_empty():
		return false
	var dir := (lb - la).normalized()
	var n := Vector2(-dir.y, dir.x)
	var mid := (la + lb) * 0.5
	var far := 20000.0
	var e0 := mid - dir * far
	var e1 := mid + dir * far
	var halves := [PackedVector2Array([e0, e1, e1 + n * far, e0 + n * far]), PackedVector2Array([e0, e1, e1 - n * far, e0 - n * far])]
	var parts := [[], []]
	var side_area := [0.0, 0.0]
	for s in 2:
		for r in Geometry2D.intersect_polygons(poly, halves[s]):
			var c := Geom.clean(r)
			if c.size() < 3:
				continue
			for good in Geom.sanitize(c):
				var ar := absf(Geom.area(good))
				if ar < 1.0:
					continue
				parts[s].append(good)
				side_area[s] += ar
	if side_area[0] < 30.0 or side_area[1] < 30.0:
		return false

	var obj: Dictionary = p.obj
	obj.cuts.append([mid, n])
	var v0: Vector2 = p.linear_velocity
	var w0: float = p.angular_velocity
	var n_world := M.basis_xform(n).normalized()
	for s in 2:
		var sgn := 1.0 if s == 0 else -1.0
		for part in parts[s]:
			var ar := absf(Geom.area(part))
			var wc: Vector2 = M * Geom.centroid(part)
			if ar < MIN_PIECE_AREA:
				_burst(wc, obj.cut, 6, 120.0, 0.5)
				continue
			var pinned := false
			for pin in obj.pins:
				if Geometry2D.is_point_in_polygon(pin, part):
					pinned = true
			var np: RigidBody2D = PieceScript.new()
			np.setup(obj, part, M, pinned, false)
			np.impact.connect(_on_piece_impact)
			if not pinned:
				var r := wc - p.global_position
				np.linear_velocity = v0 + Vector2(-r.y, r.x) * w0 + n_world * sgn * SEPARATION
				np.angular_velocity = w0
			pieces_root.add_child(np)
			pieces.append(np)
			if not bot_mode:
				np.flash()
	if not bot_mode:
		for seg in inside:
			var w0p: Vector2 = M * seg[0]
			var w1p: Vector2 = M * seg[seg.size() - 1]
			_juice(w0p, w1p, obj.cut, n_world)
	_remove_piece(p)
	return true


func _remove_piece(p: RigidBody2D) -> void:
	p.dead = true
	pieces.erase(p)
	p.queue_free()


func _clear_pieces() -> void:
	for p in pieces:
		p.queue_free()
	pieces.clear()
	for c in fx_root.get_children():
		c.queue_free()
	slashes.clear()


func percent() -> float:
	if total_area <= 0.0:
		return 0.0
	return clampf(collected_area / total_area * 100.0, 0.0, 100.0)


func stars_for(pct: float) -> int:
	var s := 0
	for t in level.stars:
		if pct >= float(t) - 0.0001:
			s += 1
	return s


# --- level flow ------------------------------------------------------------------------

func start_level(i: int) -> void:
	level_index = i
	level = Levels.get_level(i)
	_clear_pieces()
	attract = false
	Engine.time_scale = 1.0
	slowmo = 0.0
	_set_theme(level.theme, true)
	env.queue_free()
	env = EnvScript.new()
	add_child(env)
	env.build(level, theme, int(level.theme), glow_tex)
	env.bumped.connect(func(_pos: Vector2) -> void: sfx.play("boing", -6.0))
	level_phys = PhysicsMaterial.new()
	level_phys.friction = level.get("friction", 0.6)
	level_phys.bounce = 0.08
	total_area = 0.0
	collected_area = 0.0
	slices_left = level.slices
	slices_used = 0
	combo = 0
	for o in level.objects:
		var p := spawn_object(o, true, level.get("gscale", 1.0), level.get("ldamp", 0.0), level.get("adamp", 0.0), level_phys)
		total_area += p.area
	state = State.PLAY
	if bot_mode:
		return
	_show_screen(State.PLAY)
	lbl_level.text = "%d  ·  %s" % [i + 1, String(theme.name).to_upper()]
	meter.stars = level.stars
	meter.accent = theme.goal
	meter.set_target(0.0, false)
	slice_meter.set_counts(level.slices, slices_left)
	btn_done.visible = false
	_show_banner()


func _begin_settle() -> void:
	state = State.SETTLE
	settle_t = 0.0
	calm_t = 0.0
	if not bot_mode:
		btn_done.text = "SKIP"
		btn_done.visible = true
		_toast("Watch them fall…")


func _finish_level() -> void:
	state = State.RESULT
	var pct := percent()
	var st := stars_for(pct)
	if bot_mode:
		return
	if st > int(saved_stars[level_index]):
		saved_stars[level_index] = st
	if int(pct) > int(saved_best[level_index]):
		saved_best[level_index] = int(pct)
	_save()
	_show_results(pct, st)


func _process(delta: float) -> void:
	var now := Time.get_ticks_usec()
	var real_dt := minf((now - last_usec) / 1000000.0, 0.1)
	last_usec = now
	if slowmo > 0.0:
		slowmo -= real_dt
		Engine.time_scale = 0.25
	elif Engine.time_scale < 1.0:
		Engine.time_scale = minf(1.0, Engine.time_scale + real_dt * 3.0)

	for s in slashes:
		s.t += real_dt / 0.32
	slashes = slashes.filter(func(s: Dictionary) -> bool: return s.t < 1.0)
	if not slashes.is_empty() or dragging:
		blade.queue_redraw()
	shake = maxf(0.0, shake - real_dt * 40.0)
	camera.offset = Vector2(randf_range(-1, 1), randf_range(-1, 1)) * shake
	if combo_t > 0.0:
		combo_t -= delta
		if combo_t <= 0.0:
			combo = 0

	if attract:
		_attract_step(delta)
	elif state == State.SETTLE:
		settle_t += delta
		var calm := true
		for p in pieces:
			if not p.freeze and (p.linear_velocity.length() > 12.0 or absf(p.angular_velocity) > 0.4):
				calm = false
				break
		calm_t = calm_t + delta if calm else 0.0
		if (settle_t > 1.0 and calm_t > 0.7) or settle_t > 12.0:
			_finish_level()


func _physics_process(_delta: float) -> void:
	if attract:
		for p in pieces.duplicate():
			if p.global_position.y > 1600.0:
				_remove_piece(p)
		return
	if state != State.PLAY and state != State.SETTLE and state != State.RESULT:
		return
	var any_dynamic := false
	for p in pieces.duplicate():
		if p.dead or p.freeze:
			continue
		any_dynamic = true
		var pos: Vector2 = p.global_position
		var hz: String = env.hazard_hit(p)
		if hz != "":
			_destroy(p, hz)
		elif env.in_landing_zone(p):
			_collect(p)
		elif pos.y > 1800.0 or pos.x < -300.0 or pos.x > 1020.0:
			_remove_piece(p)
	if state == State.SETTLE and not any_dynamic and settle_t > 0.5:
		_finish_level()


func _collect(p: RigidBody2D) -> void:
	p.dead = true
	pieces.erase(p)
	collected_area += p.area
	if bot_mode:
		p.queue_free()
		return
	var share: float = p.area / total_area * 100.0
	combo += 1
	combo_t = 1.0
	sfx.play("collect", -5.0, 1.0 + 0.07 * mini(combo, 10))
	var x: float = p.global_position.x
	env.pulse_goal()
	_burst(Vector2(x, FLOOR_Y - 10.0), theme.goal, 28, 340.0, 0.8, true)
	_burst(Vector2(x, FLOOR_Y - 10.0), Color(1, 1, 1, 0.9), 10, 160.0, 0.5, true, Vector2(0, -300), 0.6)
	_popup(Vector2(x, FLOOR_Y - 80.0), ("+%d%%" % roundi(share)) if share >= 1.0 else "+1%", theme.goal)
	meter.set_target(percent())
	p.set_deferred("collision_layer", 0)
	p.set_deferred("collision_mask", 0)
	var tw := p.create_tween()
	tw.set_parallel(true)
	tw.tween_property(p, "modulate", Color(theme.goal.lightened(0.5), 0.0), 0.45)
	tw.tween_property(p, "scale", Vector2(0.3, 0.3), 0.45).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(p.queue_free)


func _destroy(p: RigidBody2D, kind: String) -> void:
	p.dead = true
	pieces.erase(p)
	if bot_mode:
		p.queue_free()
		return
	var pos: Vector2 = p.global_position
	p.set_deferred("collision_layer", 0)
	p.set_deferred("collision_mask", 0)
	var tint := Color.BLACK
	match kind:
		"lava":
			sfx.play("sizzle", -4.0)
			_burst(pos, Color(1.0, 0.5, 0.1), 26, 260.0, 0.9, true)
			_burst(pos, Color(0.25, 0.22, 0.22, 0.7), 12, 90.0, 1.6, false, Vector2(0, -80), 0.5)
			tint = Color(0.15, 0.03, 0.0, 0.0)
		"laser":
			sfx.play("zap", -4.0)
			_burst(pos, Color(1.0, 0.3, 0.4), 30, 380.0, 0.6, true)
			tint = Color(3.0, 1.0, 1.2, 0.0)
		_:
			sfx.play("crunch", -3.0)
			_burst(pos, p.obj.cut, 24, 300.0, 0.8)
			tint = Color(1, 1, 1, 0)
	var tw := p.create_tween()
	tw.set_parallel(true)
	tw.tween_property(p, "modulate", tint, 0.45)
	tw.tween_property(p, "scale", Vector2(0.6, 0.6), 0.45)
	tw.chain().tween_callback(p.queue_free)


func _on_piece_impact(_p: Node, speed: float) -> void:
	if not attract:
		sfx.play("thud", linear_to_db(clampf(speed / 900.0, 0.08, 0.6)), randf_range(0.8, 1.2))


# --- attract mode (title and level select backdrop) --------------------------------------

func _start_attract() -> void:
	attract = true
	_clear_pieces()
	env.queue_free()
	env = EnvScript.new()
	add_child(env)
	Engine.time_scale = 1.0
	attract_spawn_t = 0.2
	attract_cut_t = 1.2


func _attract_step(delta: float) -> void:
	attract_spawn_t -= delta
	if attract_spawn_t <= 0.0 and pieces.size() < 36:
		attract_spawn_t = randf_range(0.6, 1.1)
		var shapes := [
			{"shape": "circle", "r": randf_range(55, 85)},
			{"shape": "rect", "w": randf_range(90, 140), "h": randf_range(90, 140)},
			{"shape": "star", "r": randf_range(60, 85), "ri": 30.0},
			{"shape": "heart", "r": randf_range(45, 60)},
			{"shape": "ngon", "n": 6, "r": randf_range(55, 80)},
			{"shape": "tri", "r": randf_range(60, 85)},
			{"shape": "diamond", "w": 90.0, "h": 130.0},
			{"shape": "cross", "w": 140.0, "t": 50.0},
		]
		var o: Dictionary = shapes.pick_random()
		o.mat = Themes.MATERIAL_NAMES.pick_random()
		o.pos = Vector2(randf_range(110, 610), -140)
		o.rot = randf_range(0, 360)
		var p := spawn_object(o, false, 0.35)
		p.linear_velocity = Vector2(randf_range(-50, 50), randf_range(40, 140))
		p.angular_velocity = randf_range(-1.2, 1.2)
	attract_cut_t -= delta
	if attract_cut_t <= 0.0:
		attract_cut_t = randf_range(0.45, 0.9)
		var candidates := pieces.filter(func(p: RigidBody2D) -> bool:
			return not p.dead and p.area > 2500.0 and p.global_position.y > 260.0 and p.global_position.y < 1000.0)
		if not candidates.is_empty():
			var p: RigidBody2D = candidates.pick_random()
			var d := Vector2.from_angle(randf() * TAU)
			var c: Vector2 = p.global_position + Vector2(randf_range(-10, 10), randf_range(-10, 10))
			var r: float = p.radius * 1.4
			slice(c - d * r, c + d * r)
	attract_theme_t += delta
	if attract_theme_t > 9.0:
		attract_theme_t = 0.0
		_set_theme((bg_theme + 1) % 8)


# --- input ---------------------------------------------------------------------------------

func _can_slice() -> bool:
	if attract:
		return state == State.TITLE or state == State.SELECT
	return state == State.PLAY and slices_left > 0


func _world(screen_pos: Vector2) -> Vector2:
	return get_canvas_transform().affine_inverse() * screen_pos


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index != MOUSE_BUTTON_LEFT:
			return
		if mb.pressed:
			if _can_slice():
				dragging = true
				drag_a = _world(mb.position)
				drag_b = drag_a
		elif dragging:
			dragging = false
			drag_b = _world(mb.position)
			_release_slice()
			blade.queue_redraw()
	elif event is InputEventMouseMotion and dragging:
		drag_b = _world((event as InputEventMouseMotion).position)
		blade.queue_redraw()


func _release_slice() -> void:
	if drag_a.distance_to(drag_b) < 30.0 or not _can_slice():
		return
	sfx.play("swish", -12.0 if attract else -4.0)
	var n := slice(drag_a, drag_b)
	if attract:
		return
	if n > 0:
		slices_left -= 1
		slices_used += 1
		slice_meter.set_counts(level.slices, slices_left)
		_hide_banner()
		btn_done.text = "DONE"
		btn_done.visible = true
		if slices_left <= 0:
			_begin_settle()
	else:
		slashes.append({"a": drag_a, "b": drag_b, "t": 0.5, "miss": true})
		_toast("Missed! No slice used.")


func _on_done_pressed() -> void:
	if state == State.PLAY:
		_begin_settle()
	elif state == State.SETTLE:
		_finish_level()


# --- effects --------------------------------------------------------------------------------

func _draw_blade() -> void:
	if dragging and drag_a.distance_to(drag_b) > 6.0:
		var a := drag_a
		var b := drag_b
		var dir := (b - a).normalized()
		var ok := slices_left > 0 or attract
		var c := Color(0.55, 0.95, 1.0) if ok else Color(1, 0.4, 0.4)
		var dist := 0.0
		var total := 1400.0
		while dist < total:
			blade.draw_line(a - dir * dist, a - dir * (dist + 12.0), Color(c, 0.18), 2.0)
			blade.draw_line(b + dir * dist, b + dir * (dist + 12.0), Color(c, 0.18), 2.0)
			dist += 26.0
		blade.draw_line(a, b, Color(c, 0.18), 22.0, true)
		blade.draw_line(a, b, Color(c, 0.5), 8.0, true)
		blade.draw_line(a, b, Color(1, 1, 1, 0.95), 2.5, true)
		blade.draw_circle(a, 7.0, Color(1, 1, 1, 0.9))
		blade.draw_texture_rect(glow_tex, Rect2(b - Vector2(28, 28), Vector2(56, 56)), false, Color(c, 0.9))
		blade.draw_circle(b, 5.0, Color.WHITE)
	for s in slashes:
		var t: float = s.t
		var k := 1.0 - t
		var a: Vector2 = s.a
		var b: Vector2 = s.b
		if s.get("miss", false):
			blade.draw_line(a, b, Color(1, 0.4, 0.4, k * 0.8), 4.0, true)
			continue
		var w := 6.0 + 26.0 * (1.0 - pow(k, 3.0))
		blade.draw_line(a, b, Color(0.6, 0.95, 1.0, 0.22 * k), w * 1.8, true)
		blade.draw_line(a, b, Color(0.85, 1.0, 1.0, 0.65 * k), w * 0.5, true)
		blade.draw_line(a, b, Color(1, 1, 1, k), maxf(1.0, 4.0 * k), true)


func _burst(pos: Vector2, color: Color, amount: int, speed: float, lifetime := 0.8, additive := false, gravity := Vector2(0, 900), scale_mul := 1.0) -> void:
	if bot_mode:
		return
	var p := CPUParticles2D.new()
	p.position = pos
	p.one_shot = true
	p.amount = maxi(amount, 1)
	p.lifetime = lifetime
	p.explosiveness = 0.95
	p.direction = Vector2.UP
	p.spread = 180.0
	p.gravity = gravity
	p.initial_velocity_min = speed * 0.3
	p.initial_velocity_max = speed
	p.scale_amount_min = 0.12 * scale_mul
	p.scale_amount_max = 0.3 * scale_mul
	p.texture = glow_tex
	if additive:
		p.material = add_mat
	p.color = color
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1, 1, 1, 1))
	ramp.set_color(1, Color(1, 1, 1, 0))
	p.color_ramp = ramp
	fx_root.add_child(p)
	p.emitting = true
	p.finished.connect(p.queue_free)


func _juice(a: Vector2, b: Vector2, color: Color, normal: Vector2) -> void:
	var pts := PackedVector2Array()
	var n := maxi(2, int(a.distance_to(b) / 12.0))
	for i in n:
		pts.append(a.lerp(b, float(i) / (n - 1)))
	for s in [1.0, -1.0]:
		var p := CPUParticles2D.new()
		p.one_shot = true
		p.amount = n * 2
		p.lifetime = 0.7
		p.explosiveness = 1.0
		p.emission_shape = CPUParticles2D.EMISSION_SHAPE_POINTS
		p.emission_points = pts
		p.direction = normal * s
		p.spread = 35.0
		p.gravity = Vector2(0, 1100)
		p.initial_velocity_min = 80.0
		p.initial_velocity_max = 320.0
		p.scale_amount_min = 0.08
		p.scale_amount_max = 0.2
		p.texture = glow_tex
		p.color = color
		var ramp := Gradient.new()
		ramp.set_color(0, Color(1, 1, 1, 1))
		ramp.set_color(1, Color(1, 1, 1, 0))
		p.color_ramp = ramp
		fx_root.add_child(p)
		p.emitting = true
		p.finished.connect(p.queue_free)
	var sp := CPUParticles2D.new()
	sp.one_shot = true
	sp.amount = n
	sp.lifetime = 0.45
	sp.explosiveness = 1.0
	sp.emission_shape = CPUParticles2D.EMISSION_SHAPE_POINTS
	sp.emission_points = pts
	sp.spread = 180.0
	sp.gravity = Vector2.ZERO
	sp.initial_velocity_min = 100.0
	sp.initial_velocity_max = 380.0
	sp.scale_amount_min = 0.05
	sp.scale_amount_max = 0.12
	sp.texture = glow_tex
	sp.material = add_mat
	sp.color = Color(0.85, 1.0, 1.0)
	fx_root.add_child(sp)
	sp.emitting = true
	sp.finished.connect(sp.queue_free)


func _popup(pos: Vector2, text: String, color: Color) -> void:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", FONT_BOLD)
	l.add_theme_font_size_override("font_size", 40)
	l.add_theme_color_override("font_color", color.lightened(0.3))
	l.add_theme_color_override("font_outline_color", Color(0.05, 0.02, 0.08))
	l.add_theme_constant_override("outline_size", 10)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.size = Vector2(200, 60)
	l.position = pos - Vector2(100, 30)
	l.pivot_offset = Vector2(100, 30)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.scale = Vector2(0.4, 0.4)
	fx_root.add_child(l)
	var tw := l.create_tween()
	tw.tween_property(l, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(l, "position:y", l.position.y - 90.0, 1.0).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(l, "modulate:a", 0.0, 0.5).set_delay(0.5)
	tw.tween_callback(l.queue_free)


# --- UI -------------------------------------------------------------------------------------

func _label(text: String, font_size: int, bold := true, color := Color.WHITE, outline := 10) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", FONT_BOLD if bold else FONT)
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	if outline > 0:
		l.add_theme_color_override("font_outline_color", Color(0.06, 0.02, 0.1, 0.85))
		l.add_theme_constant_override("outline_size", outline)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _button(text: String, color: Color, font_size := 34, min_size := Vector2(200, 80)) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = min_size
	b.size = min_size
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", FONT_BOLD)
	b.add_theme_font_size_override("font_size", font_size)
	for st in ["normal", "hover", "pressed", "disabled"]:
		var sb := StyleBoxFlat.new()
		var c := color
		if st == "hover":
			c = color.lightened(0.15)
		elif st == "pressed":
			c = color.darkened(0.2)
		elif st == "disabled":
			c = Color(0.3, 0.3, 0.35)
		sb.bg_color = c
		sb.set_corner_radius_all(int(min_size.y * 0.5))
		sb.border_width_bottom = 6 if st != "pressed" else 2
		sb.border_color = c.darkened(0.4)
		sb.shadow_color = Color(0, 0, 0, 0.35)
		sb.shadow_size = 10
		sb.shadow_offset = Vector2(0, 5)
		sb.content_margin_left = 24
		sb.content_margin_right = 24
		b.add_theme_stylebox_override(st, sb)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	for k in ["font_color", "font_hover_color", "font_pressed_color"]:
		b.add_theme_color_override(k, Color.WHITE)
	b.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.3))
	b.add_theme_constant_override("outline_size", 6)
	b.pressed.connect(func() -> void: sfx.play("click", -6.0))
	return b


func _icon_button(kind: String, pos: Vector2) -> Button:
	var b: Button = IconButton.new()
	b.kind = kind
	b.position = pos
	b.size = Vector2(68, 68)
	b.pressed.connect(func() -> void: sfx.play("click", -6.0))
	return b


func _full(c: Control) -> void:
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	ui_root = Control.new()
	_full(ui_root)
	layer.add_child(ui_root)
	res_dim = ColorRect.new()
	_full(res_dim)
	res_dim.color = Color(0.02, 0.0, 0.05, 0.55)
	res_dim.visible = false
	ui_root.add_child(res_dim)
	col = Control.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.anchor_left = 0.5
	col.anchor_right = 0.5
	col.anchor_bottom = 1.0
	col.offset_left = -360
	col.offset_right = 360
	ui_root.add_child(col)

	# title
	title_ui = Control.new()
	_full(title_ui)
	col.add_child(title_ui)
	var logo: Control = Logo.new()
	logo.font = FONT_BOLD
	logo.position = Vector2(0, 170)
	logo.size = Vector2(720, 300)
	logo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_ui.add_child(logo)
	var tag := _label("Slice it.  Drop it.  Score it.", 34, false, Color(1, 1, 1, 0.95), 9)
	tag.position = Vector2(0, 480)
	tag.size = Vector2(720, 50)
	title_ui.add_child(tag)
	var play := _button("PLAY", Color(1.0, 0.3, 0.62), 56, Vector2(340, 112))
	play.position = Vector2(190, 700)
	play.pressed.connect(func() -> void: _show_screen(State.SELECT))
	title_ui.add_child(play)
	var tip := _label("Tip: swipe anywhere to slice!", 26, false, Color(1, 1, 1, 0.8), 8)
	tip.position = Vector2(0, 850)
	tip.size = Vector2(720, 40)
	title_ui.add_child(tip)
	var foot := _label("8 worlds  ·  real physics  ·  made with Godot", 22, false, Color(1, 1, 1, 0.6), 6)
	foot.anchor_top = 1.0
	foot.anchor_bottom = 1.0
	foot.offset_top = -70
	foot.offset_bottom = -30
	foot.size.x = 720
	title_ui.add_child(foot)

	# level select
	select_ui = Control.new()
	_full(select_ui)
	col.add_child(select_ui)
	var back := _icon_button("back", Vector2(20, 26))
	back.pressed.connect(func() -> void: _show_screen(State.TITLE))
	select_ui.add_child(back)
	var hdr := _label("CHOOSE A WORLD", 46)
	hdr.position = Vector2(0, 24)
	hdr.size = Vector2(720, 72)
	select_ui.add_child(hdr)
	lbl_total = _label("", 24, false, Color(1.0, 0.9, 0.5), 7)
	lbl_total.position = Vector2(0, 92)
	lbl_total.size = Vector2(720, 34)
	select_ui.add_child(lbl_total)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 20)
	grid.add_theme_constant_override("v_separation", 18)
	grid.position = Vector2(30, 146)
	grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	select_ui.add_child(grid)
	for i in Levels.COUNT:
		var card: Button = LevelCard.new()
		card.index = i
		var th: Dictionary = Themes.LIST[Levels.get_level(i).theme]
		card.title_text = th.name
		card.sky_a = th.sky_a
		card.sky_b = th.sky_b
		card.accent = th.goal
		card.font = FONT_BOLD
		card.font_small = FONT
		card.custom_minimum_size = Vector2(320, 238)
		card.pressed.connect(func() -> void:
			if is_unlocked(i):
				sfx.play("click", -6.0)
				start_level(i)
			else:
				_toast("Earn a star in world %d first" % i))
		grid.add_child(card)
		cards.append(card)

	# play HUD
	play_ui = Control.new()
	_full(play_ui)
	col.add_child(play_ui)
	var pb := _icon_button("back", Vector2(18, 18))
	pb.pressed.connect(func() -> void: _show_screen(State.SELECT))
	play_ui.add_child(pb)
	var rb := _icon_button("restart", Vector2(634, 18))
	rb.pressed.connect(func() -> void: start_level(level_index))
	play_ui.add_child(rb)
	lbl_level = _label("", 32)
	lbl_level.position = Vector2(96, 20)
	lbl_level.size = Vector2(528, 64)
	play_ui.add_child(lbl_level)
	meter = PercentMeter.new()
	meter.font = FONT_BOLD
	meter.position = Vector2(26, 92)
	meter.size = Vector2(668, 72)
	meter.mouse_filter = Control.MOUSE_FILTER_IGNORE
	play_ui.add_child(meter)
	slice_meter = SliceMeter.new()
	slice_meter.position = Vector2(22, 172)
	slice_meter.size = Vector2(420, 44)
	slice_meter.mouse_filter = Control.MOUSE_FILTER_IGNORE
	play_ui.add_child(slice_meter)
	btn_done = _button("DONE", Color(0.25, 0.75, 0.45), 26, Vector2(150, 54))
	btn_done.position = Vector2(548, 168)
	btn_done.pressed.connect(_on_done_pressed)
	play_ui.add_child(btn_done)
	banner = Control.new()
	banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	banner.position = Vector2(0, 560)
	banner.size = Vector2(720, 300)
	play_ui.add_child(banner)
	banner_title = _label("", 30, false, Color(1, 1, 1, 0.9), 8)
	banner_title.position = Vector2(0, 0)
	banner_title.size = Vector2(720, 44)
	banner.add_child(banner_title)
	banner_name = _label("", 66, true, Color.WHITE, 16)
	banner_name.position = Vector2(0, 40)
	banner_name.size = Vector2(720, 90)
	banner.add_child(banner_name)
	banner_hint = _label("", 28, false, Color(1, 1, 1, 0.95), 9)
	banner_hint.position = Vector2(30, 136)
	banner_hint.size = Vector2(660, 100)
	banner_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	banner.add_child(banner_hint)

	toast = _label("", 30, true, Color.WHITE, 10)
	toast.position = Vector2(0, 236)
	toast.size = Vector2(720, 50)
	toast.modulate.a = 0.0
	col.add_child(toast)

	btn_sound = _icon_button("sound", Vector2(634, 26))
	btn_sound.toggle_mode = true
	btn_sound.toggled.connect(func(on: bool) -> void:
		sfx.muted = on
		btn_sound.queue_redraw())
	title_ui.add_child(btn_sound)

	# results
	result_ui = Control.new()
	_full(result_ui)
	col.add_child(result_ui)
	res_panel = PanelContainer.new()
	var psb := StyleBoxFlat.new()
	psb.bg_color = Color(0.09, 0.05, 0.16, 0.92)
	psb.set_corner_radius_all(36)
	psb.set_border_width_all(4)
	psb.border_color = Color(1, 1, 1, 0.25)
	psb.shadow_color = Color(0, 0, 0, 0.45)
	psb.shadow_size = 30
	psb.set_content_margin_all(30)
	res_panel.add_theme_stylebox_override("panel", psb)
	res_panel.position = Vector2(50, 300)
	res_panel.size = Vector2(620, 640)
	res_panel.custom_minimum_size = Vector2(620, 640)
	res_panel.pivot_offset = Vector2(310, 320)
	result_ui.add_child(res_panel)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 10)
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	res_panel.add_child(vb)
	res_title = _label("", 60)
	vb.add_child(res_title)
	res_stars = StarsDisplay.new()
	res_stars.custom_minimum_size = Vector2(560, 140)
	res_stars.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(res_stars)
	res_pct = _label("", 96, true, Color.WHITE, 14)
	vb.add_child(res_pct)
	res_info = _label("", 24, false, Color(1, 1, 1, 0.8), 0)
	res_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vb.add_child(res_info)
	var hb := HBoxContainer.new()
	hb.alignment = BoxContainer.ALIGNMENT_CENTER
	hb.add_theme_constant_override("separation", 14)
	vb.add_child(hb)
	var b_levels := _button("WORLDS", Color(0.35, 0.3, 0.55), 26, Vector2(170, 70))
	b_levels.pressed.connect(func() -> void: _show_screen(State.SELECT))
	hb.add_child(b_levels)
	var b_retry := _button("RETRY", Color(0.95, 0.55, 0.2), 26, Vector2(170, 70))
	b_retry.pressed.connect(func() -> void: start_level(level_index))
	hb.add_child(b_retry)
	btn_next = _button("NEXT", Color(0.25, 0.75, 0.45), 26, Vector2(170, 70))
	btn_next.pressed.connect(func() -> void: start_level(level_index + 1))
	hb.add_child(btn_next)


func _show_screen(s: State) -> void:
	title_ui.visible = s == State.TITLE
	select_ui.visible = s == State.SELECT
	play_ui.visible = s == State.PLAY
	result_ui.visible = false
	res_dim.visible = false
	if s == State.TITLE or s == State.SELECT:
		if not attract:
			_start_attract()
		state = s
		dragging = false
		blade.queue_redraw()
	if s == State.SELECT:
		_refresh_cards()


func _refresh_cards() -> void:
	var total := 0
	for i in cards.size():
		var c: Button = cards[i]
		c.stars = saved_stars[i]
		c.best = saved_best[i]
		c.locked = not is_unlocked(i)
		total += int(saved_stars[i])
		c.queue_redraw()
	lbl_total.text = "%d of %d stars collected" % [total, Levels.COUNT * 3]


func _show_banner() -> void:
	banner_title.text = "WORLD %d" % (level_index + 1)
	banner_name.text = String(theme.name).to_upper()
	banner_hint.text = level.hint
	if banner_tween:
		banner_tween.kill()
	banner.modulate.a = 0.0
	banner.position.y = 600
	banner_tween = create_tween()
	banner_tween.tween_property(banner, "modulate:a", 1.0, 0.35)
	banner_tween.parallel().tween_property(banner, "position:y", 560.0, 0.35).set_ease(Tween.EASE_OUT)
	banner_tween.tween_interval(3.5)
	banner_tween.tween_property(banner, "modulate:a", 0.0, 0.6)


func _hide_banner() -> void:
	if banner.modulate.a > 0.0:
		if banner_tween:
			banner_tween.kill()
		banner_tween = create_tween()
		banner_tween.tween_property(banner, "modulate:a", 0.0, 0.25)


func _toast(text: String) -> void:
	if bot_mode:
		return
	toast.text = text
	if toast_tween:
		toast_tween.kill()
	toast.modulate.a = 1.0
	toast_tween = create_tween()
	toast_tween.tween_interval(1.4)
	toast_tween.tween_property(toast, "modulate:a", 0.0, 0.5)


func _show_results(pct: float, st: int) -> void:
	play_ui.visible = true
	btn_done.visible = false
	result_ui.visible = true
	res_dim.visible = true
	res_title.text = ["SO CLOSE…", "NICE CUT!", "GREAT SLICING!", "PERFECT!"][st]
	res_pct.text = "%d%%" % int(pct)
	var s: Array = level.stars
	var msg := "Stars at %d%%, %d%% and %d%%." % [s[0], s[1], s[2]]
	if st == 0:
		msg = "You need %d%% to clear this world.\nTry another angle!" % s[0]
	elif level_index == Levels.COUNT - 1:
		msg += "\nYou have conquered all eight worlds!"
	res_info.text = msg
	btn_next.visible = st > 0 and level_index < Levels.COUNT - 1
	res_stars.reset(st)
	res_panel.scale = Vector2(0.85, 0.85)
	res_panel.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(res_panel, "modulate:a", 1.0, 0.25)
	tw.parallel().tween_property(res_panel, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	for i in st:
		tw.tween_interval(0.22)
		tw.tween_callback(func() -> void:
			res_stars.pop(i)
			sfx.play("star", -4.0, 1.0 + i * 0.12))
	sfx.play("win" if st > 0 else "fail", -3.0)
