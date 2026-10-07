extends RigidBody2D
## One rigid piece of a sliceable object. The polygon is kept in the original object's
## space, so texture coordinates and earlier cut lines stay continuous across pieces.

signal impact(piece, speed)

const Geom := preload("res://scripts/geom.gd")
const DENSITY := 0.001
const SHADOW_OFFSET := Vector2(7, 12)

static var white_tex: Texture2D

var obj: Dictionary
var poly := PackedVector2Array()
var local_pts := PackedVector2Array()
var uvs := PackedVector2Array()
var center := Vector2.ZERO
var area := 0.0
var radius := 0.0
var pinned := false
var dead := false
var cut_flags: Array[bool] = []
var shadow: Node2D
var edges: Node2D
var thud_cd := 0.0


func setup(p_obj: Dictionary, p_poly: PackedVector2Array, obj_xform: Transform2D, p_pinned: bool, p_frozen: bool) -> void:
	if white_tex == null:
		var img := Image.create(2, 2, false, Image.FORMAT_RGBA8)
		img.fill(Color.WHITE)
		white_tex = ImageTexture.create_from_image(img)
	obj = p_obj
	poly = p_poly
	pinned = p_pinned
	area = absf(Geom.area(poly))
	center = Geom.centroid(poly)
	var bb_pos: Vector2 = obj.bb_pos
	var bb_size: Vector2 = obj.bb_size
	for v in poly:
		var l := v - center
		local_pts.append(l)
		radius = maxf(radius, l.length())
		uvs.append((v - bb_pos) / bb_size)
	_compute_cut_flags()
	transform = Transform2D(obj_xform.get_rotation(), obj_xform * center)

	mass = maxf(area * DENSITY, 0.02)
	center_of_mass_mode = RigidBody2D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = Vector2.ZERO
	inertia = Geom.inertia(local_pts, mass)
	continuous_cd = RigidBody2D.CCD_MODE_CAST_SHAPE
	physics_material_override = obj.phys
	gravity_scale = obj.gscale
	linear_damp = obj.ldamp
	angular_damp = obj.adamp
	freeze_mode = RigidBody2D.FREEZE_MODE_KINEMATIC
	freeze = p_pinned or p_frozen
	contact_monitor = true
	max_contacts_reported = 2
	body_entered.connect(_on_body_entered)
	for part in Geom.convex_parts(local_pts):
		var cs := CollisionShape2D.new()
		var sh := ConvexPolygonShape2D.new()
		sh.points = part
		cs.shape = sh
		add_child(cs)
	material = obj.mat

	shadow = Node2D.new()
	shadow.z_index = -1
	shadow.position = SHADOW_OFFSET.rotated(-rotation)
	shadow.draw.connect(_draw_shadow)
	add_child(shadow)
	edges = Node2D.new()
	edges.draw.connect(_draw_edges)
	add_child(edges)


func obj_to_world() -> Transform2D:
	return global_transform * Transform2D(0.0, -center)


func world_poly() -> PackedVector2Array:
	return global_transform * local_pts


func flash() -> void:
	self_modulate = Color(2.2, 2.2, 2.2)
	var tw := create_tween()
	tw.tween_property(self, "self_modulate", Color.WHITE, 0.3)


func _compute_cut_flags() -> void:
	cut_flags.clear()
	var n := poly.size()
	for i in n:
		var a := poly[i]
		var b := poly[(i + 1) % n]
		var flag := false
		for c in obj.cuts:
			var cp: Vector2 = c[0]
			var cn: Vector2 = c[1]
			if absf((a - cp).dot(cn)) < 0.9 and absf((b - cp).dot(cn)) < 0.9:
				flag = true
				break
		cut_flags.append(flag)


func _process(delta: float) -> void:
	if thud_cd > 0.0:
		thud_cd -= delta
	if not freeze and not sleeping:
		shadow.position = SHADOW_OFFSET.rotated(-rotation)


func _on_body_entered(_body: Node) -> void:
	if thud_cd > 0.0 or dead:
		return
	var s := linear_velocity.length()
	if s > 160.0:
		thud_cd = 0.25
		impact.emit(self, s)


func _draw() -> void:
	draw_polygon(local_pts, PackedColorArray([Color.WHITE]), uvs, white_tex)


func _draw_shadow() -> void:
	shadow.draw_colored_polygon(local_pts, Color(0, 0, 0, 0.24))


func _draw_edges() -> void:
	var n := local_pts.size()
	var closed := local_pts.duplicate()
	closed.append(local_pts[0])
	edges.draw_polyline(closed, obj.rim, 3.0, true)
	var cut_col: Color = obj.cut
	for i in n:
		if cut_flags[i]:
			edges.draw_line(local_pts[i], local_pts[(i + 1) % n], cut_col, 4.5, true)
	if pinned:
		for pin in obj.pins:
			if Geometry2D.is_point_in_polygon(pin, poly):
				var lp: Vector2 = pin - center
				edges.draw_circle(lp, 15.0, Color(1.0, 0.9, 0.5, 0.25))
				edges.draw_circle(lp, 11.0, Color(0.12, 0.08, 0.04))
				edges.draw_circle(lp, 9.0, Color(1.0, 0.8, 0.32))
				edges.draw_circle(lp, 5.0, Color(0.68, 0.46, 0.14))
				edges.draw_circle(lp + Vector2(-3, -3), 2.5, Color(1, 1, 0.92))
