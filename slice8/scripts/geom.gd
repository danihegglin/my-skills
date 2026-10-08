extends RefCounted
## Polygon helpers and shape generators.


static func area(p: PackedVector2Array) -> float:
	var s := 0.0
	var n := p.size()
	for i in n:
		s += p[i].cross(p[(i + 1) % n])
	return s * 0.5


static func centroid(p: PackedVector2Array) -> Vector2:
	var c := Vector2.ZERO
	var a2 := 0.0
	var n := p.size()
	for i in n:
		var a := p[i]
		var b := p[(i + 1) % n]
		var cr := a.cross(b)
		a2 += cr
		c += (a + b) * cr
	if absf(a2) < 1e-6:
		c = Vector2.ZERO
		for v in p:
			c += v
		return c / maxf(1.0, p.size())
	return c / (3.0 * a2)


## Moment of inertia of a uniform polygon about the origin (vertices relative to the centroid).
static func inertia(p: PackedVector2Array, mass: float) -> float:
	var num := 0.0
	var den := 0.0
	var n := p.size()
	for i in n:
		var a := p[i]
		var b := p[(i + 1) % n]
		var cr := a.cross(b)
		num += cr * (a.dot(a) + a.dot(b) + b.dot(b))
		den += cr
	if absf(den) < 1e-6:
		return maxf(mass, 0.001)
	return maxf(absf(mass * num / (6.0 * den)), 0.001)


static func bbox(p: PackedVector2Array) -> Rect2:
	var r := Rect2(p[0], Vector2.ZERO)
	for v in p:
		r = r.expand(v)
	return r


## Drops duplicate and collinear vertices that come out of polygon clipping.
static func clean(p: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for v in p:
		if out.is_empty() or out[out.size() - 1].distance_to(v) > 0.6:
			out.append(v)
	while out.size() > 1 and out[0].distance_to(out[out.size() - 1]) <= 0.6:
		out.remove_at(out.size() - 1)
	var i := 0
	while out.size() > 3 and i < out.size():
		var a := out[(i - 1 + out.size()) % out.size()]
		var b := out[i]
		var c := out[(i + 1) % out.size()]
		if absf((b - a).cross(c - a)) < 0.5:
			out.remove_at(i)
		else:
			i += 1
	return out


## Returns drawable, decomposable polygons for a clipped shape (usually just [p]).
static func sanitize(p: PackedVector2Array) -> Array:
	if p.size() >= 3 and not Geometry2D.triangulate_polygon(p).is_empty():
		return [p]
	var out := []
	for q in Geometry2D.offset_polygon(p, -0.3):
		var c := clean(q)
		if c.size() >= 3 and not Geometry2D.triangulate_polygon(c).is_empty():
			out.append(c)
	return out


static func convex_parts(p: PackedVector2Array) -> Array:
	var out := []
	for part in Geometry2D.decompose_polygon_in_convex(p):
		if part.size() >= 3 and absf(area(part)) > 0.5:
			out.append(part)
	if out.is_empty():
		var hull := Geometry2D.convex_hull(p)
		if hull.size() > 3:
			hull.remove_at(hull.size() - 1)
		out.append(hull)
	return out


static func rect(w: float, h: float) -> PackedVector2Array:
	return PackedVector2Array([Vector2(-w, -h) * 0.5, Vector2(w, -h) * 0.5, Vector2(w, h) * 0.5, Vector2(-w, h) * 0.5])


static func rect_at(r: Rect2) -> PackedVector2Array:
	return PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)])


static func ngon(r: float, n: int, rot := 0.0) -> PackedVector2Array:
	var p := PackedVector2Array()
	for i in n:
		p.append(Vector2.from_angle(rot + TAU * i / n) * r)
	return p


static func star(ro: float, ri: float, n: int) -> PackedVector2Array:
	var p := PackedVector2Array()
	for i in n * 2:
		p.append(Vector2.from_angle(-PI * 0.5 + PI * i / n) * (ro if i % 2 == 0 else ri))
	return p


static func heart(s: float) -> PackedVector2Array:
	var p := PackedVector2Array()
	for i in 44:
		var t := TAU * i / 44.0
		var x := 16.0 * pow(sin(t), 3.0)
		var y := -(13.0 * cos(t) - 5.0 * cos(2.0 * t) - 2.0 * cos(3.0 * t) - cos(4.0 * t))
		p.append(Vector2(x, y) * s / 16.0)
	return p


static func cross_shape(w: float, t: float) -> PackedVector2Array:
	var a := w * 0.5
	var b := t * 0.5
	return PackedVector2Array([
		Vector2(-b, -a), Vector2(b, -a), Vector2(b, -b), Vector2(a, -b), Vector2(a, b), Vector2(b, b),
		Vector2(b, a), Vector2(-b, a), Vector2(-b, b), Vector2(-a, b), Vector2(-a, -b), Vector2(-b, -b)])


## Builds a shape from a level description, centred on its centroid.
static func make(o: Dictionary) -> PackedVector2Array:
	var p: PackedVector2Array
	match String(o.shape):
		"circle":
			p = ngon(o.r, 40)
		"rect":
			p = rect(o.w, o.h)
		"ngon":
			p = ngon(o.r, o.n, deg_to_rad(o.get("rot0", -90.0)))
		"tri":
			p = ngon(o.r, 3, -PI * 0.5)
		"star":
			p = star(o.r, o.ri, o.get("n", 5))
		"heart":
			p = heart(o.r)
		"cross":
			p = cross_shape(o.w, o.t)
		"diamond":
			p = PackedVector2Array([Vector2(0, -o.h * 0.5), Vector2(o.w * 0.5, 0), Vector2(0, o.h * 0.5), Vector2(-o.w * 0.5, 0)])
	var c := centroid(p)
	for i in p.size():
		p[i] -= c
	return p
