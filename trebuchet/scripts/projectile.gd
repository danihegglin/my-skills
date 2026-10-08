extends RigidBody2D
## Something hurled by the trebuchet: a stone, a cluster of stones or a firepot.

signal finished(p)

var kind := "stone"
var radius := 14.0
var game: Node
var last_vel := Vector2.ZERO
var age := 0.0
var slow_time := 0.0
var since_impact := -1.0
var done := false
var can_split := false
var leaves_trail := true
var trail_timer := 0.0


func setup(p_kind: String, p_game: Node, p_radius := 14.0) -> void:
	kind = p_kind
	game = p_game
	radius = p_radius
	var shape := CircleShape2D.new()
	shape.radius = radius
	var cs := CollisionShape2D.new()
	cs.shape = shape
	add_child(cs)
	mass = 12.0 * pow(radius / 14.0, 2.0)
	var pm := PhysicsMaterial.new()
	pm.friction = 0.6
	pm.bounce = 0.15
	physics_material_override = pm
	contact_monitor = true
	max_contacts_reported = 4
	continuous_cd = RigidBody2D.CCD_MODE_CAST_SHAPE
	set_meta("impact_mult", 1.2)
	body_entered.connect(_on_body_entered)
	can_split = kind == "cluster"
	if kind == "fire":
		var fire := CPUParticles2D.new()
		fire.amount = 40
		fire.lifetime = 0.5
		fire.local_coords = false
		fire.direction = Vector2(0, -1)
		fire.spread = 40.0
		fire.gravity = Vector2(0, -260)
		fire.initial_velocity_min = 10.0
		fire.initial_velocity_max = 60.0
		fire.scale_amount_min = 4.0
		fire.scale_amount_max = 9.0
		fire.position = Vector2(0, -radius * 0.6)
		var ramp := Gradient.new()
		ramp.set_color(0, Color(1.0, 0.9, 0.3, 1.0))
		ramp.set_color(1, Color(0.8, 0.15, 0.05, 0.0))
		fire.color_ramp = ramp
		add_child(fire)


func _physics_process(delta: float) -> void:
	last_vel = linear_velocity
	if done:
		return
	age += delta
	if since_impact >= 0.0:
		since_impact += delta
	if leaves_trail and age < 8.0:
		trail_timer -= delta
		if trail_timer <= 0.0:
			trail_timer = 0.03
			game.add_trail_point(global_position)
	if linear_velocity.length() < 30.0:
		slow_time += delta
	else:
		slow_time = 0.0
	if age > 10.0 or slow_time > 0.7 or since_impact > 4.0 or global_position.y > 1500.0 \
			or global_position.x > 7000.0 or global_position.x < -2500.0:
		finish()


func _on_body_entered(_body: Node) -> void:
	if done:
		return
	if kind == "fire":
		game.explode(global_position, 190.0, 260.0)
		finish(true)
		return
	if since_impact < 0.0:
		since_impact = 0.0
		can_split = false
		game.on_projectile_impact(self, last_vel.length())


## Called when the player clicks during flight.
func activate() -> void:
	if done or not can_split:
		return
	can_split = false
	game.split_cluster(self)
	finish(true)


func finish(instant := false) -> void:
	if done:
		return
	done = true
	finished.emit(self)
	set_deferred("collision_layer", 0)
	set_deferred("collision_mask", 0)
	if instant:
		queue_free()
	else:
		var tw := create_tween()
		tw.tween_property(self, "modulate:a", 0.0, 0.5)
		tw.tween_callback(queue_free)


func _draw() -> void:
	match kind:
		"fire":
			draw_circle(Vector2.ZERO, radius, Color(0.36, 0.2, 0.1))
			draw_circle(Vector2(0, 2), radius * 0.75, Color(0.5, 0.3, 0.15))
			draw_rect(Rect2(-radius * 0.45, -radius - 3, radius * 0.9, 6), Color(0.3, 0.17, 0.08))
			draw_circle(Vector2(0, -radius - 5), 4.0, Color(1.0, 0.6, 0.1))
		"cluster":
			var r := radius * 0.55
			for o in [Vector2(-r * 0.8, r * 0.5), Vector2(r * 0.8, r * 0.5), Vector2(0, -r * 0.8)]:
				draw_circle(o, r, Color(0.45, 0.44, 0.42))
				draw_circle(o + Vector2(-r * 0.3, -r * 0.3), r * 0.35, Color(0.62, 0.61, 0.58))
			draw_arc(Vector2.ZERO, radius * 0.95, 0, TAU, 20, Color(0.55, 0.4, 0.2), 2.0)
		_:
			draw_circle(Vector2.ZERO, radius, Color(0.45, 0.44, 0.42))
			draw_circle(Vector2(radius * 0.25, radius * 0.3), radius * 0.45, Color(0.38, 0.37, 0.35))
			draw_circle(Vector2(-radius * 0.3, -radius * 0.3), radius * 0.35, Color(0.62, 0.61, 0.58))
