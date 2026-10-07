extends Node2D
## Builds and animates a level's world: floor, walls, ledges, moving parts, hazards and fields.

const Geom := preload("res://scripts/geom.gd")
const TERRAIN_SHADER := preload("res://shaders/terrain.gdshader")
const GOAL_SHADER := preload("res://shaders/goal.gdshader")
const LAVA_SHADER := preload("res://shaders/lava.gdshader")
const FLOOR_Y := 1200.0

signal bumped(pos)

var theme: Dictionary
var terrain_mat: ShaderMaterial
var phys: PhysicsMaterial
var glow_tex: Texture2D
var goals: Array = []
var hazards: Array = []
var movers: Array = []
var static_polys: Array = []
var ramps: Array = []
var goal_mats: Array = []
var pulse := 0.0
var bumpers: Array = []
var planets: Array = []
var urchins: Array = []
var time := 0.0
var anim: Node2D


func build(level: Dictionary, p_theme: Dictionary, p_style: int, p_glow: Texture2D) -> void:
	theme = p_theme
	glow_tex = p_glow
	z_index = -5
	terrain_mat = ShaderMaterial.new()
	terrain_mat.shader = TERRAIN_SHADER
	terrain_mat.set_shader_parameter("style", p_style)
	terrain_mat.set_shader_parameter("accent", theme.accent)
	material = terrain_mat
	phys = PhysicsMaterial.new()
	phys.friction = level.get("friction", 0.6)
	phys.bounce = 0.05

	_add_static(Geom.rect_at(Rect2(-90, -800, 90, 2400)))
	_add_static(Geom.rect_at(Rect2(720, -800, 90, 2400)))
	# The whole bottom is a landing zone; slippery ramps from both walls slide pieces into it.
	var g0: float = level.goal[0]
	var g1: float = level.goal[1]
	var ramp_phys := PhysicsMaterial.new()
	ramp_phys.friction = 0.08
	var lt := Vector2(0, FLOOR_Y - g0 * 0.6)
	var rt := Vector2(720, FLOOR_Y - (720.0 - g1) * 0.6)
	_add_static(PackedVector2Array([lt, Vector2(g0, FLOOR_Y), Vector2(g0, FLOOR_Y + 500), Vector2(0, FLOOR_Y + 500)]), true, ramp_phys)
	_add_static(PackedVector2Array([Vector2(g1, FLOOR_Y), rt, Vector2(720, FLOOR_Y + 500), Vector2(g1, FLOOR_Y + 500)]), true, ramp_phys)
	ramps = [[lt, Vector2(g0, FLOOR_Y)], [rt, Vector2(g1, FLOOR_Y)]]
	goals.append(Vector2(g0, g1))
	_add_goal(g0, g1)

	for s in level.get("statics", []):
		match String(s.t):
			"rect":
				_add_static(Geom.rect_at(s.rect))
			"slope":
				var a: Vector2 = s.a
				var b: Vector2 = s.b
				var n := (b - a).normalized().orthogonal() * float(s.w)
				if n.y > 0.0:
					n = -n
				var pts := PackedVector2Array([a, b, b - n, a - n])
				if Geom.area(pts) < 0.0:
					pts.reverse()
				_add_static(pts, true)
			"peg":
				_add_static(Transform2D(0.0, s.pos) * Geom.ngon(s.r, 24), true)
			"planet":
				_add_static(Transform2D(0.0, s.pos) * Geom.ngon(s.r, 32), false)
				planets.append(s)
			"bumper":
				_add_bumper(s.pos, s.r)
			"lavapool":
				_add_lava_pool(s.rect)
			"urchin":
				var c: Vector2 = s.pos
				var r: float = s.r
				urchins.append({"pos": c, "r": r})
				hazards.append({"kind": "spikes", "active": true, "rect": Rect2(c - Vector2(r, r), Vector2(r, r) * 2.0),
					"poly": Transform2D(0.0, c) * Geom.ngon(r, 20)})
	for m in level.get("movers", []):
		match String(m.t):
			"spinner":
				_add_spinner(m)
			"slider":
				_add_slider(m)
			"conveyor":
				_add_conveyor(m)
	for h in level.get("hazards", []):
		var a: Vector2 = h.a
		var b: Vector2 = h.b
		hazards.append({"kind": "laser", "active": true, "a": a, "b": b, "ca": a, "cb": b,
			"on": h.get("on", 0.0), "off": h.get("off", 0.0), "phase": h.get("phase", 0.0),
			"move": h.get("move", Vector2.ZERO), "period": h.get("period", 1.0)})
	for f in level.get("fields", []):
		_add_field(f)

	anim = Node2D.new()
	anim.z_index = 2
	anim.draw.connect(_draw_anim)
	add_child(anim)
	queue_redraw()


## True once a piece reaches the landing zone: it dips into the glow above the opening,
## or comes to rest anywhere at the bottom (on a ramp edge, straddling the lip, ...).
func in_landing_zone(p: RigidBody2D) -> bool:
	var pos := p.global_position
	for g in goals:
		if pos.y > FLOOR_Y - 22.0 and pos.x > g.x - 16.0 and pos.x < g.y + 16.0:
			return true
	if p.linear_velocity.length() < 45.0 and pos.y > FLOOR_Y - 160.0:
		var lowest := -INF
		for v in p.world_poly():
			lowest = maxf(lowest, v.y)
		if lowest > FLOOR_Y - 80.0:
			return true
	return false


func pulse_goal() -> void:
	pulse = 1.0


## Returns the hazard kind touching the piece, or "".
func hazard_hit(p: RigidBody2D) -> String:
	var pos := p.global_position
	var r: float = p.radius
	for h in hazards:
		if not h.active:
			continue
		if h.kind == "laser":
			var a: Vector2 = h.ca
			var b: Vector2 = h.cb
			if Geometry2D.get_closest_point_to_segment(pos, a, b).distance_to(pos) > r:
				continue
			if not Geometry2D.intersect_polyline_with_polygon(PackedVector2Array([a, b]), p.world_poly()).is_empty():
				return "laser"
		else:
			var rect: Rect2 = h.rect
			if not rect.grow(r).has_point(pos):
				continue
			if not Geometry2D.intersect_polygons(p.world_poly(), h.poly).is_empty():
				return h.kind
	return ""


func _physics_process(delta: float) -> void:
	time += delta
	for m in movers:
		var body: AnimatableBody2D = m.body
		match String(m.t):
			"spinner":
				body.rotation += float(m.speed) * delta
			"slider":
				var a: Vector2 = m.a
				var b: Vector2 = m.b
				body.position = a.lerp(b, 0.5 - 0.5 * cos(TAU * time / float(m.period)))
	for h in hazards:
		if h.kind != "laser":
			continue
		var on: float = h.on
		var off: float = h.off
		if off > 0.0:
			h.active = fmod(time + float(h.phase), on + off) < on
		var mv: Vector2 = h.move
		if mv != Vector2.ZERO:
			var o: Vector2 = mv * (0.5 - 0.5 * cos(TAU * time / float(h.period)))
			h.ca = h.a + o
			h.cb = h.b + o
	if pulse > 0.0:
		pulse = maxf(0.0, pulse - delta * 2.5)
		for m in goal_mats:
			m.set_shader_parameter("pulse", pulse)
	if anim:
		anim.queue_redraw()


# --- construction ------------------------------------------------------------------

func _add_static(pts: PackedVector2Array, draw_it := true, pm: PhysicsMaterial = null) -> void:
	var body := StaticBody2D.new()
	body.physics_material_override = pm if pm else phys
	var cp := CollisionPolygon2D.new()
	cp.polygon = pts
	body.add_child(cp)
	add_child(body)
	if draw_it:
		static_polys.append(pts)


func _add_goal(x0: float, x1: float) -> void:
	var r := ColorRect.new()
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.position = Vector2(x0, FLOOR_Y - 190.0)
	r.size = Vector2(x1 - x0, 440.0)
	var m := ShaderMaterial.new()
	m.shader = GOAL_SHADER
	m.set_shader_parameter("glow", theme.goal)
	m.set_shader_parameter("width_px", x1 - x0)
	goal_mats.append(m)
	r.material = m
	r.z_index = 1
	add_child(r)
	var p := CPUParticles2D.new()
	p.position = Vector2((x0 + x1) * 0.5, FLOOR_Y + 60.0)
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2((x1 - x0) * 0.42, 10)
	p.amount = int((x1 - x0) / 8.0)
	p.lifetime = 1.6
	p.direction = Vector2.UP
	p.spread = 6.0
	p.gravity = Vector2.ZERO
	p.initial_velocity_min = 60.0
	p.initial_velocity_max = 160.0
	p.scale_amount_min = 0.08
	p.scale_amount_max = 0.2
	p.texture = glow_tex
	p.color = theme.goal
	p.color_ramp = _fade_ramp()
	var cm := CanvasItemMaterial.new()
	cm.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	p.material = cm
	p.z_index = 1
	add_child(p)


## A basalt basin filled with lava; rect is the liquid's area.
func _add_lava_pool(rect: Rect2) -> void:
	var t := 16.0
	_add_static(Geom.rect_at(Rect2(rect.position.x - t, rect.position.y - 26.0, t, rect.size.y + 26.0 + t)))
	_add_static(Geom.rect_at(Rect2(rect.end.x, rect.position.y - 26.0, t, rect.size.y + 26.0 + t)))
	_add_static(Geom.rect_at(Rect2(rect.position.x, rect.end.y, rect.size.x, t)))
	var r := ColorRect.new()
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.position = rect.position - Vector2(0, 50)
	r.size = rect.size + Vector2(0, 50)
	var m := ShaderMaterial.new()
	m.shader = LAVA_SHADER
	m.set_shader_parameter("top_y", rect.position.y + 6.0)
	r.material = m
	r.z_index = 3
	add_child(r)
	var hz := Rect2(rect.position + Vector2(0, 10), rect.size - Vector2(0, 10))
	hazards.append({"kind": "lava", "active": true, "rect": hz, "poly": Geom.rect_at(hz)})
	var x0 := rect.position.x
	var x1 := rect.end.x
	var p := CPUParticles2D.new()
	p.position = Vector2((x0 + x1) * 0.5, rect.position.y + 4.0)
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2((x1 - x0) * 0.5, 4)
	p.amount = int((x1 - x0) / 10.0)
	p.lifetime = 1.4
	p.direction = Vector2.UP
	p.spread = 20.0
	p.gravity = Vector2(0, -40)
	p.initial_velocity_min = 20.0
	p.initial_velocity_max = 90.0
	p.scale_amount_min = 0.06
	p.scale_amount_max = 0.16
	p.texture = glow_tex
	p.color = Color(1.0, 0.55, 0.15)
	p.color_ramp = _fade_ramp()
	var cm := CanvasItemMaterial.new()
	cm.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	p.material = cm
	p.z_index = 4
	add_child(p)


func _add_bumper(pos: Vector2, r: float) -> void:
	var body := StaticBody2D.new()
	var pm := PhysicsMaterial.new()
	pm.bounce = 0.85
	pm.friction = 0.2
	body.physics_material_override = pm
	body.position = pos
	var cs := CollisionShape2D.new()
	var c := CircleShape2D.new()
	c.radius = r
	cs.shape = c
	body.add_child(cs)
	add_child(body)
	var area := Area2D.new()
	area.position = pos
	var cs2 := CollisionShape2D.new()
	var c2 := CircleShape2D.new()
	c2.radius = r + 6.0
	cs2.shape = c2
	area.add_child(cs2)
	add_child(area)
	var info := {"pos": pos, "r": r, "hit": 0.0}
	bumpers.append(info)
	area.body_entered.connect(func(b: Node) -> void:
		if b is RigidBody2D:
			info.hit = 1.0
			bumped.emit(pos))


func _make_mover_body(pts: PackedVector2Array, pos: Vector2) -> AnimatableBody2D:
	var body := AnimatableBody2D.new()
	body.position = pos
	body.physics_material_override = phys
	var cp := CollisionPolygon2D.new()
	cp.polygon = pts
	body.add_child(cp)
	var vis := Node2D.new()
	vis.use_parent_material = true
	body.use_parent_material = true
	vis.draw.connect(func() -> void: _draw_terrain_poly(vis, pts))
	body.add_child(vis)
	add_child(body)
	return body


func _add_spinner(m: Dictionary) -> void:
	var body := _make_mover_body(Geom.rect(m.len, m.w), m.pos)
	var hub := Node2D.new()
	hub.draw.connect(func() -> void:
		hub.draw_circle(Vector2.ZERO, 16.0, theme.rim)
		hub.draw_circle(Vector2.ZERO, 11.0, theme.edge)
		hub.draw_circle(Vector2.ZERO, 4.0, theme.rim))
	body.add_child(hub)
	movers.append({"t": "spinner", "body": body, "speed": m.speed})


func _add_slider(m: Dictionary) -> void:
	var body := _make_mover_body(Geom.rect(m.size.x, m.size.y), m.a)
	movers.append({"t": "slider", "body": body, "a": m.a, "b": m.b, "period": m.period})


func _add_conveyor(m: Dictionary) -> void:
	var x0: float = m.x0
	var x1: float = m.x1
	var y: float = m.y
	var body := StaticBody2D.new()
	body.constant_linear_velocity = Vector2(m.speed, 0)
	var pm := PhysicsMaterial.new()
	pm.friction = 1.0
	body.physics_material_override = pm
	var cp := CollisionPolygon2D.new()
	cp.polygon = Geom.rect_at(Rect2(x0, y, x1 - x0, 28))
	body.add_child(cp)
	add_child(body)
	movers.append({"t": "conveyor", "body": null, "x0": x0, "x1": x1, "y": y, "speed": m.speed})


func _add_field(f: Dictionary) -> void:
	var area := Area2D.new()
	area.gravity_space_override = Area2D.SPACE_OVERRIDE_COMBINE
	var cs := CollisionShape2D.new()
	if f.t == "current":
		var rect: Rect2 = f.rect
		var force: Vector2 = f.force
		var sh := RectangleShape2D.new()
		sh.size = rect.size
		cs.shape = sh
		area.position = rect.get_center()
		area.gravity_direction = force.normalized()
		area.gravity = force.length()
		var p := CPUParticles2D.new()
		p.position = rect.get_center()
		p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
		p.emission_rect_extents = rect.size * 0.5
		p.amount = 70
		p.lifetime = 1.6
		p.direction = force.normalized()
		p.spread = 3.0
		p.gravity = Vector2.ZERO
		p.initial_velocity_min = force.length() * 0.9
		p.initial_velocity_max = force.length() * 1.3
		p.scale_amount_min = 0.05
		p.scale_amount_max = 0.12
		p.texture = glow_tex
		p.color = Color(0.7, 1.0, 1.0, 0.7)
		p.color_ramp = _fade_ramp(true)
		var cm := CanvasItemMaterial.new()
		cm.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		p.material = cm
		p.z_index = 1
		add_child(p)
	else:
		var sh := CircleShape2D.new()
		sh.radius = f.r
		cs.shape = sh
		area.position = f.pos
		area.gravity_point = true
		area.gravity_point_center = Vector2.ZERO
		area.gravity_point_unit_distance = 0.0
		area.gravity = f.strength
		planets.append({"pos": f.pos, "well": f.r})
	area.add_child(cs)
	add_child(area)


func _fade_ramp(fade_in := false) -> Gradient:
	var g := Gradient.new()
	if fade_in:
		g.offsets = PackedFloat32Array([0.0, 0.2, 1.0])
		g.colors = PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, 1), Color(1, 1, 1, 0)])
	else:
		g.set_color(0, Color(1, 1, 1, 1))
		g.set_color(1, Color(1, 1, 1, 0))
	return g


# --- drawing -------------------------------------------------------------------------

func _draw_terrain_poly(ci: CanvasItem, pts: PackedVector2Array) -> void:
	var bb := Geom.bbox(pts)
	var span := minf(maxf(bb.size.y, 1.0), 260.0)
	var cols := PackedColorArray()
	var top: Color = theme.top
	var bottom: Color = theme.bottom
	for v in pts:
		cols.append(top.lerp(bottom, clampf((v.y - bb.position.y) / span, 0.0, 1.0)))
	ci.draw_polygon(pts, cols)
	var closed := pts.duplicate()
	closed.append(pts[0])
	ci.draw_polyline(closed, theme.rim, 3.0, true)
	var ccw := Geom.area(pts) > 0.0
	var ew: float = theme.edge_w
	for i in pts.size():
		var a := pts[i]
		var b := pts[(i + 1) % pts.size()]
		var e := b - a
		var nrm := Vector2(e.y, -e.x) if ccw else Vector2(-e.y, e.x)
		if nrm.normalized().y < -0.5:
			var off := Vector2(0, ew * 0.5 - 1.0)
			ci.draw_line(a + off, b + off, theme.edge, ew, true)


func _draw() -> void:
	for g in goals:
		draw_rect(Rect2(g.x, FLOOR_Y, g.y - g.x, 500), Color(0.02, 0.02, 0.04, 0.85))
	for pts in static_polys:
		_draw_terrain_poly(self, pts)
	for pl in planets:
		if pl.has("r"):
			var c: Vector2 = pl.pos
			var r: float = pl.r
			draw_circle(c, r, Color(0.55, 0.42, 0.62))
			draw_circle(c + Vector2(r * 0.15, r * 0.15), r * 0.82, Color(0.42, 0.3, 0.5))
			draw_circle(c + Vector2(-r * 0.35, -r * 0.2), r * 0.22, Color(0.36, 0.25, 0.44))
			draw_circle(c + Vector2(r * 0.3, r * 0.35), r * 0.15, Color(0.33, 0.22, 0.4))
			draw_arc(c, r, 0, TAU, 48, Color(0.7, 0.85, 1.0, 0.8), 3.0, true)


func _draw_anim() -> void:
	var gc: Color = theme.goal
	# glowing chevrons sliding down the ramps toward the landing zone
	for rp in ramps:
		var a: Vector2 = rp[0]
		var b: Vector2 = rp[1]
		var d := (b - a).normalized()
		var n := Vector2(d.y, -d.x)
		if n.y > 0.0:
			n = -n
		var length := a.distance_to(b)
		var dist := fposmod(time * 45.0, 30.0) + 14.0
		while dist < length - 10.0:
			var c := a + d * dist + n * 14.0
			var fade := clampf(dist / 40.0, 0.0, 1.0) * clampf((length - dist) / 30.0, 0.0, 1.0)
			anim.draw_polyline(PackedVector2Array([c - d * 6.0 + n * 7.0, c + d * 4.0, c - d * 6.0 - n * 7.0]), Color(gc, 0.75 * fade), 3.0, true)
			dist += 30.0
	for g in goals:
		var lip := Color(gc, 0.35 + 0.5 * pulse)
		anim.draw_line(Vector2(g.x, FLOOR_Y), Vector2(g.y, FLOOR_Y), lip, 2.0 + 3.0 * pulse, true)
		for x in [g.x, g.y]:
			var c := Vector2(x, FLOOR_Y - 4.0)
			anim.draw_texture_rect(glow_tex, Rect2(c - Vector2(36, 36), Vector2(72, 72)), false, Color(gc, 0.7 + 0.3 * pulse))
			anim.draw_circle(c, 9.0, theme.rim)
			anim.draw_circle(c, 6.0, gc.lightened(0.3 * pulse))
	for m in movers:
		if m.t != "conveyor":
			continue
		var x0: float = m.x0
		var x1: float = m.x1
		var y: float = m.y
		anim.draw_rect(Rect2(x0, y, x1 - x0, 28), Color(0.12, 0.11, 0.1))
		anim.draw_rect(Rect2(x0, y, x1 - x0, 5), Color(0.3, 0.28, 0.26))
		var off := fposmod(time * float(m.speed), 40.0)
		var x := x0 + off - 40.0
		while x < x1:
			if x > x0 + 6.0 and x < x1 - 18.0:
				var dir := signf(m.speed)
				var cx := x + 6.0
				anim.draw_polyline(PackedVector2Array([Vector2(cx - dir * 6.0, y + 8), Vector2(cx + dir * 4.0, y + 14), Vector2(cx - dir * 6.0, y + 20)]),
					Color(1.0, 0.75, 0.25, 0.9), 3.0, true)
			x += 40.0
		for rx in [x0 + 14.0, x1 - 14.0]:
			anim.draw_circle(Vector2(rx, y + 14), 12.0, Color(0.35, 0.33, 0.3))
			var sp := Vector2.from_angle(time * float(m.speed) / 12.0) * 9.0
			anim.draw_line(Vector2(rx, y + 14) - sp, Vector2(rx, y + 14) + sp, Color(0.15, 0.14, 0.13), 3.0)
	for u in urchins:
		var c: Vector2 = u.pos
		var r: float = u.r
		var wob := 1.0 + 0.06 * sin(time * 3.0)
		var spikes := PackedVector2Array()
		for k in 36:
			var a := TAU * k / 36.0 + time * 0.2
			spikes.append(c + Vector2.from_angle(a) * (r * (1.45 if k % 2 == 0 else 0.8) * wob))
		anim.draw_colored_polygon(spikes, Color(0.2, 0.05, 0.25))
		anim.draw_circle(c, r * 0.8, Color(0.45, 0.12, 0.5))
		anim.draw_circle(c + Vector2(-r * 0.25, -r * 0.25), r * 0.3, Color(0.7, 0.35, 0.75))
	for b in bumpers:
		var pos: Vector2 = b.pos
		var r: float = b.r
		b.hit = maxf(0.0, b.hit - get_physics_process_delta_time() * 3.0)
		var k: float = b.hit
		anim.draw_texture_rect(glow_tex, Rect2(pos - Vector2.ONE * r * (2.2 + k), Vector2.ONE * r * (4.4 + 2.0 * k)), false, Color(theme.accent, 0.5 + 0.5 * k))
		anim.draw_circle(pos, r + k * 5.0, theme.edge)
		anim.draw_circle(pos, r * 0.72 + k * 4.0, theme.rim)
		anim.draw_circle(pos, r * 0.45, theme.accent)
	for pl in planets:
		if pl.has("well"):
			var c: Vector2 = pl.pos
			var wr: float = pl.well
			for k in 3:
				var rr := wr * (1.0 - fposmod(time * 0.35 + k / 3.0, 1.0))
				anim.draw_arc(c, rr, 0, TAU, 64, Color(0.6, 0.5, 1.0, 0.35 * (rr / wr)), 2.0, true)
	for h in hazards:
		if h.kind != "laser":
			continue
		var a: Vector2 = h.ca
		var b: Vector2 = h.cb
		var on: bool = h.active
		var col := Color(1.0, 0.18, 0.3)
		if on:
			var flick := 0.85 + 0.15 * sin(time * 40.0)
			anim.draw_line(a, b, Color(col, 0.25 * flick), 22.0, true)
			anim.draw_line(a, b, Color(col, 0.6 * flick), 9.0, true)
			anim.draw_line(a, b, Color(1, 0.85, 0.9, flick), 3.0, true)
		else:
			var warn := 0.0
			var off: float = h.off
			if off > 0.0:
				var tt := fposmod(time + float(h.phase), float(h.on) + off) - float(h.on)
				if off - tt < 0.5:
					warn = 0.5 + 0.5 * sin(time * 30.0)
			var dirv := (b - a).normalized()
			var total := a.distance_to(b)
			var dist := 0.0
			while dist < total:
				anim.draw_line(a + dirv * dist, a + dirv * minf(dist + 10.0, total), Color(col, 0.25 + 0.5 * warn), 2.0)
				dist += 22.0
		for e in [a, b]:
			anim.draw_rect(Rect2(e - Vector2(10, 12), Vector2(20, 24)), Color(0.15, 0.15, 0.2))
			anim.draw_rect(Rect2(e - Vector2(6, 6), Vector2(12, 12)), col if on else Color(0.4, 0.15, 0.2))
