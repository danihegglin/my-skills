extends Node2D
## Game controller: builds the world and UI, handles input, turns, camera and scoring.

const BlockScript := preload("res://scripts/block.gd")
const EnemyScript := preload("res://scripts/enemy.gd")
const ProjectileScript := preload("res://scripts/projectile.gd")
const TrebuchetScript := preload("res://scripts/trebuchet.gd")
const SceneryScript := preload("res://scripts/scenery.gd")
const SfxScript := preload("res://scripts/sfx.gd")
const Levels := preload("res://scripts/levels.gd")

enum State { MENU, AIM, CHARGE, FIRING, FLIGHT, SETTLE, OVER }

const MIN_SPEED := 550.0
const MAX_SPEED := 1500.0
const MIN_AIM := deg_to_rad(10.0)
const MAX_AIM := deg_to_rad(80.0)
const AMMO_ORDER := ["stone", "cluster", "fire"]
const AMMO_NAMES := {"stone": "Stone", "cluster": "Cluster", "fire": "Firepot"}
const HINT_AIM := "Aim with the mouse  •  Hold to charge  •  Release to fire"

var state: State = State.MENU
var camera: Camera2D
var trebuchet: Node2D
var level_root: Node2D
var fx_root: Node2D
var sfx: Node
var trail: Line2D

var projectiles: Array = []
var level_bodies: Array = []
var level_index := 0
var level_name := ""
var shots_left := 0
var ammo := {"stone": -1, "cluster": 0, "fire": 0}
var selected_ammo := "stone"
var enemies_alive := 0
var score := 0
var level_start_score := 0
var aim_angle := deg_to_rad(40.0)
var power := 0.75
var power_dir := 1.0
var settle_timer := 0.0
var castle_rect := Rect2(1300, -500, 800, 500)
var cam_target := Vector2(900, -300)
var cam_zoom_target := 0.5
var shake := 0.0

var lbl_level: Label
var lbl_score: Label
var lbl_shots: Label
var lbl_enemies: Label
var lbl_hint: Label
var power_bar: ProgressBar
var ammo_buttons := {}
var overlay: ColorRect
var overlay_title: Label
var overlay_text: Label
var overlay_button: Button
var overlay_action := ""
var style_normal: StyleBoxFlat
var style_selected: StyleBoxFlat


func _ready() -> void:
	randomize()
	_build_sky()
	add_child(SceneryScript.new())

	var ground := StaticBody2D.new()
	var gs := CollisionShape2D.new()
	var gr := RectangleShape2D.new()
	gr.size = Vector2(14000, 2000)
	gs.shape = gr
	gs.position = Vector2(2000, 1000)
	ground.add_child(gs)
	var gpm := PhysicsMaterial.new()
	gpm.friction = 0.9
	ground.physics_material_override = gpm
	add_child(ground)

	trail = Line2D.new()
	trail.width = 4.0
	trail.default_color = Color(1, 1, 1, 0.35)
	add_child(trail)

	trebuchet = TrebuchetScript.new()
	add_child(trebuchet)
	level_root = Node2D.new()
	add_child(level_root)
	fx_root = Node2D.new()
	fx_root.z_index = 50
	add_child(fx_root)

	camera = Camera2D.new()
	add_child(camera)
	camera.make_current()
	sfx = SfxScript.new()
	add_child(sfx)

	_build_ui()
	_load_level(0)
	camera.position = cam_target
	_show_overlay("TREBUCHET",
		"Hurl stones at medieval castles and knock out every defender.\n\n"
		+ "Aim with the mouse, hold the button to charge, release to fire.\n"
		+ "Keys: arrows/W/S aim, Space fire, 1-3 ammo, R restart.\n"
		+ "Cluster shots split when you click mid-air. Firepots explode.",
		"Start the siege", "start")


# --- level construction (called from levels.gd) -------------------------------

func add_block(cx: float, bottom: float, w: float, h: float, mat: String) -> float:
	var b = BlockScript.new()
	b.setup(Vector2(w, h), mat)
	b.position = Vector2(cx, bottom - h * 0.5 - 0.5)
	_add_body(b)
	return bottom - h - 1.0


func add_enemy(cx: float, bottom: float, king := false) -> void:
	var e = EnemyScript.new()
	e.setup(king)
	e.position = Vector2(cx, bottom - e.size.y * 0.5 - 0.5)
	_add_body(e)
	enemies_alive += 1


func add_mound(x0: float, x1: float, h: float, slope: float) -> void:
	var poly := PackedVector2Array([Vector2(x0, 4), Vector2(x0 + slope, -h), Vector2(x1 - slope, -h), Vector2(x1, 4)])
	var body := StaticBody2D.new()
	var cp := CollisionPolygon2D.new()
	cp.polygon = poly
	body.add_child(cp)
	var vis := Polygon2D.new()
	vis.polygon = poly
	vis.color = Color(0.5, 0.37, 0.23)
	body.add_child(vis)
	var grass := Line2D.new()
	grass.points = PackedVector2Array([poly[0], poly[1], poly[2], poly[3]])
	grass.width = 12.0
	grass.default_color = Color(0.38, 0.62, 0.26)
	body.add_child(grass)
	level_root.add_child(body)


func _add_body(b: RigidBody2D) -> void:
	b.died.connect(_on_body_died)
	b.hit.connect(_on_body_hit)
	b.sleeping = true
	level_root.add_child(b)
	level_bodies.append(b)


func _load_level(i: int) -> void:
	for c in level_root.get_children():
		c.queue_free()
	for c in fx_root.get_children():
		c.queue_free()
	projectiles.clear()
	level_bodies.clear()
	trail.clear_points()
	enemies_alive = 0
	level_index = i
	var info: Dictionary = Levels.build(i, self)
	level_name = info.name
	shots_left = info.shots
	ammo = {"stone": -1, "cluster": info.cluster, "fire": info.fire}
	selected_ammo = "stone"
	level_start_score = score
	var r := Rect2()
	for n in level_bodies:
		var half: Vector2 = n.size * 0.5
		var br := Rect2(n.position - half, half * 2.0)
		r = br if r.size == Vector2.ZERO else r.merge(br)
	castle_rect = r
	_update_hud()


func _begin_play() -> void:
	overlay.visible = false
	state = State.AIM
	lbl_hint.text = "Castle %d: %s  —  defeat every defender!" % [level_index + 1, level_name]


# --- per-frame -----------------------------------------------------------------

func _process(delta: float) -> void:
	match state:
		State.CHARGE:
			power += power_dir * delta * 0.8
			if power >= 1.0:
				power = 1.0
				power_dir = -1.0
			elif power <= 0.0:
				power = 0.0
				power_dir = 1.0
		State.SETTLE:
			settle_timer += delta
			if settle_timer > 1.2 and (_world_is_calm() or settle_timer > 5.0):
				_end_turn()
	var aiming := state == State.AIM or state == State.CHARGE
	if aiming:
		var axis := 0.0
		if Input.is_key_pressed(KEY_UP) or Input.is_key_pressed(KEY_W):
			axis += 1.0
		if Input.is_key_pressed(KEY_DOWN) or Input.is_key_pressed(KEY_S):
			axis -= 1.0
		if axis != 0.0:
			aim_angle = clampf(aim_angle + axis * delta * 0.9, MIN_AIM, MAX_AIM)
	trebuchet.aim_angle = aim_angle
	trebuchet.speed = lerpf(MIN_SPEED, MAX_SPEED, power)
	trebuchet.show_aim = aiming
	trebuchet.ammo_type = selected_ammo
	power_bar.value = power * 100.0
	power_bar.modulate.a = 1.0 if aiming else 0.0
	_update_camera(delta)


func _update_camera(delta: float) -> void:
	var vs := get_viewport_rect().size
	var lead := _lead_projectile()
	if state == State.FLIGHT and lead:
		cam_target = lead.global_position + Vector2(120, 0)
		cam_zoom_target = clampf(vs.y / 1300.0, 0.35, 1.0)
	elif state == State.SETTLE:
		var r := castle_rect.grow(220)
		cam_target = r.get_center()
		cam_zoom_target = _fit_zoom(r, vs)
	else:
		var top := minf(castle_rect.position.y - 200.0, -700.0)
		var r := Rect2(-320, top, castle_rect.end.x + 220.0 + 320.0, 140.0 - top)
		cam_target = r.get_center()
		cam_zoom_target = _fit_zoom(r, vs)
	var k := 1.0 - exp(-delta * 3.0)
	camera.position = camera.position.lerp(cam_target, k)
	var z := lerpf(camera.zoom.x, cam_zoom_target, k)
	camera.zoom = Vector2(z, z)
	shake = maxf(0.0, shake - delta * 40.0)
	camera.offset = Vector2(randf_range(-1, 1), randf_range(-1, 1)) * shake


func _fit_zoom(r: Rect2, vs: Vector2) -> float:
	return minf(vs.x / r.size.x, vs.y / r.size.y)


func _lead_projectile() -> Node2D:
	for p in projectiles:
		if is_instance_valid(p) and not p.done:
			return p
	return null


func _world_is_calm() -> bool:
	for n in get_tree().get_nodes_in_group("destructible"):
		if is_instance_valid(n) and not n.dead and (n as RigidBody2D).linear_velocity.length() > 15.0:
			return false
	return true


# --- input ---------------------------------------------------------------------

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		if state == State.AIM or state == State.CHARGE:
			_aim_at(get_global_mouse_position())
	elif event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index != MOUSE_BUTTON_LEFT:
			return
		if mb.pressed:
			if state == State.AIM:
				_aim_at(get_global_mouse_position())
				_start_charge()
			elif state == State.FLIGHT:
				_activate_projectiles()
		elif state == State.CHARGE:
			_fire()
	elif event is InputEventKey:
		var k := event as InputEventKey
		if k.echo:
			return
		match k.keycode:
			KEY_SPACE:
				if k.pressed and state == State.AIM:
					_start_charge()
				elif k.pressed and state == State.FLIGHT:
					_activate_projectiles()
				elif not k.pressed and state == State.CHARGE:
					_fire()
			KEY_1, KEY_2, KEY_3:
				if k.pressed:
					_select_ammo(AMMO_ORDER[k.keycode - KEY_1])
			KEY_R:
				if k.pressed and state in [State.AIM, State.FLIGHT, State.SETTLE]:
					score = level_start_score
					_load_level(level_index)
					_begin_play()
			KEY_ENTER, KEY_KP_ENTER:
				if k.pressed and overlay.visible:
					_on_overlay_button()


func _aim_at(m: Vector2) -> void:
	var d := m - (trebuchet.global_position + Vector2(0, -150))
	if d.length() < 5.0:
		return
	aim_angle = clampf(atan2(-d.y, d.x), MIN_AIM, MAX_AIM)


func _start_charge() -> void:
	state = State.CHARGE
	power = 0.0
	power_dir = 1.0


func _select_ammo(kind: String) -> void:
	if state != State.AIM and state != State.CHARGE:
		return
	if ammo[kind] == 0:
		return
	selected_ammo = kind
	_update_hud()


func _activate_projectiles() -> void:
	for p in projectiles.duplicate():
		if is_instance_valid(p):
			p.activate()


# --- firing ----------------------------------------------------------------------

func _fire() -> void:
	state = State.FIRING
	var kind := selected_ammo
	shots_left -= 1
	if ammo[kind] > 0:
		ammo[kind] -= 1
	var vel := Vector2(cos(aim_angle), -sin(aim_angle)) * lerpf(MIN_SPEED, MAX_SPEED, power)
	trail.clear_points()
	sfx.play("whoosh", -2.0)
	trebuchet.fire(_launch.bind(kind, vel))
	if ammo[selected_ammo] == 0:
		selected_ammo = "stone"
	_update_hud()


func _launch(kind: String, vel: Vector2) -> void:
	if state != State.FIRING:
		return
	var p := _spawn_projectile(kind, trebuchet.release_point(), vel, 14.0)
	projectiles = [p]
	state = State.FLIGHT
	lbl_hint.text = "Click to split the cluster!" if kind == "cluster" else ""


func _spawn_projectile(kind: String, pos: Vector2, vel: Vector2, radius: float) -> RigidBody2D:
	var p = ProjectileScript.new()
	p.setup(kind, self, radius)
	p.position = pos
	p.linear_velocity = vel
	p.finished.connect(_on_projectile_finished)
	level_root.add_child(p)
	return p


func split_cluster(p: RigidBody2D) -> void:
	sfx.play("wood", -4.0, 1.4)
	_burst(p.global_position, Color(0.55, 0.4, 0.2), 10, 200.0)
	for i in 4:
		var v := p.linear_velocity.rotated(lerpf(-0.18, 0.18, i / 3.0)) * randf_range(0.93, 1.05)
		var q := _spawn_projectile("stone", p.global_position + v.normalized() * 4.0 * i, v, 9.0)
		q.leaves_trail = i == 1
		projectiles.append(q)
	lbl_hint.text = ""


func add_trail_point(pos: Vector2) -> void:
	trail.add_point(pos)


func on_projectile_impact(p: RigidBody2D, speed: float) -> void:
	var loud := clampf(speed / 1200.0, 0.15, 1.0)
	sfx.play("thud", linear_to_db(loud))
	_burst(p.global_position + Vector2(0, p.radius), Color(0.6, 0.5, 0.38), 14, 160.0 * loud + 60.0)
	shake = maxf(shake, 10.0 * loud)


func explode(pos: Vector2, radius: float, damage: float) -> void:
	sfx.play("boom")
	shake = 26.0
	_burst(pos, Color(1.0, 0.65, 0.15), 50, 520.0, 0.7, Vector2(0, 300), Vector2(5, 11))
	_burst(pos, Color(0.35, 0.33, 0.32), 30, 220.0, 1.6, Vector2(0, -120), Vector2(10, 20))
	for n in get_tree().get_nodes_in_group("destructible"):
		if not is_instance_valid(n) or n.dead:
			continue
		var body := n as RigidBody2D
		var d := body.global_position.distance_to(pos)
		if d > radius:
			continue
		var f := 1.0 - d / radius
		body.sleeping = false
		var dir := (body.global_position - pos).normalized()
		if dir == Vector2.ZERO:
			dir = Vector2.UP
		body.apply_central_impulse((dir + Vector2(0, -0.4)) * 650.0 * f * body.mass)
		n.take_damage(damage * f)


func _on_projectile_finished(_p: Node) -> void:
	if state != State.FLIGHT:
		return
	for q in projectiles:
		if is_instance_valid(q) and not q.done:
			return
	state = State.SETTLE
	settle_timer = 0.0


func _end_turn() -> void:
	projectiles.clear()
	if enemies_alive <= 0:
		_level_won()
	elif shots_left <= 0:
		_level_lost()
	else:
		state = State.AIM
		lbl_hint.text = HINT_AIM
		_update_hud()


func _level_won() -> void:
	state = State.OVER
	var bonus := shots_left * 1000
	score += bonus
	_update_hud()
	sfx.play("win")
	if level_index + 1 >= Levels.COUNT:
		_show_overlay("VICTORY!",
			"All five castles have fallen and the king is defeated.\n\nFinal score: %d" % score,
			"Play again", "restart")
	else:
		_show_overlay("Castle taken!",
			"%s has fallen.\nUnused shots bonus: +%d\n\nScore: %d" % [level_name, bonus, score],
			"Next castle", "next")


func _level_lost() -> void:
	state = State.OVER
	sfx.play("lose")
	_show_overlay("The castle stands",
		"You ran out of shots with %d defender%s left.\nRegroup and try again!" % [enemies_alive, "" if enemies_alive == 1 else "s"],
		"Try again", "retry")


# --- destruction -----------------------------------------------------------------

func _on_body_died(n: Node) -> void:
	var body := n as RigidBody2D
	var pos := body.global_position
	score += n.points
	_popup(pos, "+%d" % n.points, Color(1, 0.85, 0.3) if n.is_enemy else Color(1, 1, 1))
	if n.is_enemy:
		enemies_alive -= 1
		sfx.play("ugh", -3.0, 1.3 if not n.king else 0.8)
		_burst(pos, n.debris_color, 16, 260.0)
		_burst(pos, Color(0.95, 0.95, 0.95, 0.8), 12, 120.0, 1.0, Vector2(0, -60), Vector2(6, 12))
		if enemies_alive == 0:
			lbl_hint.text = "All defenders defeated!"
	else:
		sfx.play("stone" if n.mat == "stone" else "wood", -4.0)
		_burst(pos, n.debris_color, int(clampf(n.size.x * n.size.y / 100.0, 6, 24)), 280.0)
		_burst(pos, Color(0.75, 0.7, 0.62, 0.6), 8, 90.0, 1.2, Vector2(0, -40), Vector2(8, 16))
	for other in get_tree().get_nodes_in_group("destructible"):
		if other != n and is_instance_valid(other) and other.global_position.distance_to(pos) < 260.0:
			other.sleeping = false
	_update_hud()


func _on_body_hit(n: Node, amount: float) -> void:
	if amount < 20.0 or n.dead:
		return
	var vol := linear_to_db(clampf(amount / 150.0, 0.1, 0.7))
	if n.is_enemy:
		sfx.play("ugh", vol, 1.5)
	else:
		sfx.play("stone" if n.mat == "stone" else "wood", vol - 6.0, 1.2)


func _burst(pos: Vector2, color: Color, amount: int, speed: float, lifetime := 0.9,
		gravity := Vector2(0, 900), scale_range := Vector2(3, 7)) -> void:
	var p := CPUParticles2D.new()
	p.position = pos
	p.one_shot = true
	p.amount = maxi(amount, 1)
	p.lifetime = lifetime
	p.explosiveness = 0.95
	p.direction = Vector2(0, -1)
	p.spread = 180.0
	p.gravity = gravity
	p.initial_velocity_min = speed * 0.3
	p.initial_velocity_max = speed
	p.angular_velocity_min = -360.0
	p.angular_velocity_max = 360.0
	p.scale_amount_min = scale_range.x
	p.scale_amount_max = scale_range.y
	p.color = color
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1, 1, 1, 1))
	ramp.set_color(1, Color(1, 1, 1, 0))
	p.color_ramp = ramp
	fx_root.add_child(p)
	p.emitting = true
	p.finished.connect(p.queue_free)


func _popup(pos: Vector2, text: String, color: Color) -> void:
	var l := _label(40, color)
	l.text = text
	l.position = pos - Vector2(60, 30)
	l.size = Vector2(120, 50)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	fx_root.add_child(l)
	var tw := l.create_tween()
	tw.set_parallel(true)
	tw.tween_property(l, "position:y", l.position.y - 90.0, 1.1).set_ease(Tween.EASE_OUT)
	tw.tween_property(l, "modulate:a", 0.0, 1.1).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(l.queue_free)


# --- UI ----------------------------------------------------------------------------

func _build_sky() -> void:
	var layer := CanvasLayer.new()
	layer.layer = -10
	add_child(layer)
	var grad := Gradient.new()
	grad.set_color(0, Color(0.33, 0.55, 0.85))
	grad.set_color(1, Color(0.95, 0.85, 0.68))
	var tex := GradientTexture2D.new()
	tex.gradient = grad
	tex.fill_from = Vector2(0, 0)
	tex.fill_to = Vector2(0, 1)
	tex.width = 4
	tex.height = 256
	var sky := TextureRect.new()
	sky.texture = tex
	sky.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	sky.stretch_mode = TextureRect.STRETCH_SCALE
	sky.set_anchors_preset(Control.PRESET_FULL_RECT)
	sky.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(sky)


func _label(font_size: int, color := Color(1, 0.97, 0.88), outline := true) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	if outline:
		l.add_theme_color_override("font_outline_color", Color(0.16, 0.1, 0.05))
		l.add_theme_constant_override("outline_size", maxi(4, font_size / 5))
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _stylebox(bg: Color, border: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(3)
	sb.set_corner_radius_all(8)
	sb.set_content_margin_all(8)
	return sb


func _style_button(b: Button, font_size: int) -> void:
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", font_size)
	b.add_theme_color_override("font_color", Color(1, 0.96, 0.85))
	b.add_theme_color_override("font_hover_color", Color(1, 1, 0.9))
	b.add_theme_color_override("font_pressed_color", Color(1, 1, 0.9))
	b.add_theme_color_override("font_disabled_color", Color(0.75, 0.68, 0.6, 0.6))
	b.add_theme_stylebox_override("normal", style_normal)
	b.add_theme_stylebox_override("hover", _stylebox(Color(0.52, 0.34, 0.17), Color(0.95, 0.78, 0.4)))
	b.add_theme_stylebox_override("pressed", style_selected)
	b.add_theme_stylebox_override("disabled", _stylebox(Color(0.3, 0.22, 0.15, 0.7), Color(0.25, 0.18, 0.1, 0.7)))


func _build_ui() -> void:
	style_normal = _stylebox(Color(0.42, 0.27, 0.13), Color(0.25, 0.15, 0.06))
	style_selected = _stylebox(Color(0.75, 0.48, 0.16), Color(1.0, 0.85, 0.4))

	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	var hud := Control.new()
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(hud)

	var tl := VBoxContainer.new()
	tl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tl.position = Vector2(20, 12)
	hud.add_child(tl)
	lbl_level = _label(28)
	tl.add_child(lbl_level)
	lbl_score = _label(22)
	tl.add_child(lbl_score)

	var tr := VBoxContainer.new()
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tr.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	tr.offset_left = -320
	tr.offset_right = -20
	tr.offset_top = 12
	tr.offset_bottom = 100
	hud.add_child(tr)
	lbl_shots = _label(28)
	lbl_shots.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	tr.add_child(lbl_shots)
	lbl_enemies = _label(22)
	lbl_enemies.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	tr.add_child(lbl_enemies)

	lbl_hint = _label(22)
	lbl_hint.set_anchors_preset(Control.PRESET_CENTER_TOP)
	lbl_hint.offset_left = -500
	lbl_hint.offset_right = 500
	lbl_hint.offset_top = 92
	lbl_hint.offset_bottom = 130
	lbl_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hud.add_child(lbl_hint)

	var bottom := VBoxContainer.new()
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	bottom.offset_left = -290
	bottom.offset_right = 290
	bottom.offset_top = -110
	bottom.offset_bottom = -14
	bottom.alignment = BoxContainer.ALIGNMENT_END
	bottom.add_theme_constant_override("separation", 10)
	hud.add_child(bottom)

	power_bar = ProgressBar.new()
	power_bar.show_percentage = false
	power_bar.custom_minimum_size = Vector2(0, 18)
	power_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bg := _stylebox(Color(0.15, 0.1, 0.06, 0.8), Color(0.1, 0.06, 0.03))
	bg.set_content_margin_all(0)
	var fill := _stylebox(Color(0.95, 0.55, 0.15), Color(1, 0.8, 0.4))
	fill.set_border_width_all(0)
	fill.set_content_margin_all(0)
	power_bar.add_theme_stylebox_override("background", bg)
	power_bar.add_theme_stylebox_override("fill", fill)
	bottom.add_child(power_bar)

	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 12)
	bottom.add_child(row)
	for k in AMMO_ORDER:
		var btn := Button.new()
		btn.custom_minimum_size = Vector2(180, 52)
		_style_button(btn, 20)
		btn.pressed.connect(_select_ammo.bind(k))
		row.add_child(btn)
		ammo_buttons[k] = btn

	overlay = ColorRect.new()
	overlay.color = Color(0.06, 0.04, 0.02, 0.55)
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	layer.add_child(overlay)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(center)
	var panel := PanelContainer.new()
	var psb := _stylebox(Color(0.93, 0.86, 0.7), Color(0.45, 0.3, 0.14))
	psb.set_border_width_all(5)
	psb.set_corner_radius_all(14)
	psb.set_content_margin_all(32)
	psb.shadow_color = Color(0, 0, 0, 0.35)
	psb.shadow_size = 12
	panel.add_theme_stylebox_override("panel", psb)
	center.add_child(panel)
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 18)
	panel.add_child(vb)
	overlay_title = _label(54, Color(0.42, 0.22, 0.08), false)
	overlay_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(overlay_title)
	overlay_text = _label(21, Color(0.22, 0.15, 0.08), false)
	overlay_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	overlay_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	overlay_text.custom_minimum_size = Vector2(560, 0)
	vb.add_child(overlay_text)
	overlay_button = Button.new()
	overlay_button.custom_minimum_size = Vector2(280, 62)
	overlay_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_style_button(overlay_button, 26)
	overlay_button.pressed.connect(_on_overlay_button)
	vb.add_child(overlay_button)


func _update_hud() -> void:
	lbl_level.text = "Castle %d/%d — %s" % [level_index + 1, Levels.COUNT, level_name]
	lbl_score.text = "Score: %d" % score
	lbl_shots.text = "Shots left: %d" % shots_left
	lbl_enemies.text = "Defenders: %d" % enemies_alive
	for k in AMMO_ORDER:
		var btn: Button = ammo_buttons[k]
		var count: int = ammo[k]
		btn.text = "%d  %s%s" % [AMMO_ORDER.find(k) + 1, AMMO_NAMES[k], "" if count < 0 else "  x%d" % count]
		btn.disabled = count == 0
		btn.add_theme_stylebox_override("normal", style_selected if k == selected_ammo else style_normal)


func _show_overlay(title: String, text: String, button_text: String, action: String) -> void:
	overlay_title.text = title
	overlay_text.text = text
	overlay_button.text = button_text
	overlay_action = action
	overlay.visible = true


func _on_overlay_button() -> void:
	match overlay_action:
		"start", "restart":
			score = 0
			_load_level(0)
		"next":
			_load_level(level_index + 1)
		"retry":
			score = level_start_score
			_load_level(level_index)
	_begin_play()
