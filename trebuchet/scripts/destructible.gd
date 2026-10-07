extends RigidBody2D
## Base for everything in a castle that can be smashed: blocks and defenders.

signal died(node)
signal hit(node, amount)

const IMPACT_THRESHOLD := 140.0
const DAMAGE_SCALE := 0.15

var hp := 50.0
var max_hp := 50.0
var points := 10
var is_enemy := false
var dead := false
var debris_color := Color.GRAY
var last_vel := Vector2.ZERO
var invuln := 1.5


func _init_body() -> void:
	contact_monitor = true
	max_contacts_reported = 8
	can_sleep = true
	body_entered.connect(_on_body_entered)
	add_to_group("destructible")


func _physics_process(delta: float) -> void:
	if invuln > 0.0:
		invuln -= delta
	last_vel = linear_velocity


func _on_body_entered(body: Node) -> void:
	if dead or invuln > 0.0:
		return
	var other_vel := Vector2.ZERO
	var other_mass := 50.0
	var mult := 1.0
	if body is RigidBody2D:
		var rb := body as RigidBody2D
		var v = rb.get("last_vel")
		other_vel = v if v is Vector2 else rb.linear_velocity
		other_mass = rb.mass
		if rb.has_meta("impact_mult"):
			mult = float(rb.get_meta("impact_mult"))
	var rel := (last_vel - other_vel).length()
	if rel < IMPACT_THRESHOLD:
		return
	var factor := clampf(other_mass / mass, 0.3, 4.0)
	take_damage((rel - IMPACT_THRESHOLD) * DAMAGE_SCALE * factor * mult)


func take_damage(amount: float) -> void:
	if dead or amount <= 0.0:
		return
	hp -= amount
	hit.emit(self, amount)
	if hp <= 0.0:
		dead = true
		died.emit(self)
		queue_free()
	else:
		queue_redraw()
