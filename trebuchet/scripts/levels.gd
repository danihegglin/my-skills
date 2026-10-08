extends RefCounted
## Castle layouts. `b` is the game node, which provides add_block / add_enemy / add_mound.

const COUNT := 5


static func build(i: int, b) -> Dictionary:
	match i:
		0:
			var t1 := tower(b, 1500, 0, 120, 2, "wood", "wood", [0, 1])
			battlements(b, 1500, t1, 120, "wood")
			var t2 := tower(b, 1740, 0, 120, 1, "wood", "wood", [0])
			roof(b, 1740, t2, 120, "wood")
			return {"name": "Wooden Outpost", "shots": 4, "cluster": 0, "fire": 0}
		1:
			var a := tower(b, 1450, 0, 120, 2, "stone", "wood", [0, 1])
			tower(b, 1770, 0, 120, 2, "stone", "wood", [0, 1])
			var top: float = b.add_block(1610, a, 440, 20, "wood")
			b.add_enemy(1610, top)
			battlements(b, 1450, top, 120, "stone")
			battlements(b, 1770, top, 120, "stone")
			return {"name": "Stone Gatehouse", "shots": 5, "cluster": 1, "fire": 1}
		2:
			b.add_mound(1250, 2150, 120, 140)
			var base := -120.0
			wall(b, 1420, 1500, base, 5, "stone")
			b.add_enemy(1560, base)
			var k := tower(b, 1700, base, 140, 3, "stone", "wood", [0, 1, 2])
			battlements(b, 1700, k, 140, "stone")
			wall(b, 1880, 1960, base, 5, "stone")
			b.add_enemy(1985, base)
			return {"name": "Hill Fort", "shots": 6, "cluster": 2, "fire": 1}
		3:
			var l := tower(b, 1450, 0, 100, 4, "stone", "wood", [0, 2])
			roof(b, 1450, l, 100, "wood")
			var hall := tower(b, 1700, 0, 220, 1, "stone", "stone", [])
			b.add_enemy(1660, 0)
			b.add_enemy(1740, 0)
			b.add_enemy(1700, hall)
			var r := tower(b, 1950, 0, 100, 4, "stone", "wood", [1, 3])
			roof(b, 1950, r, 100, "wood")
			return {"name": "Twin Spires", "shots": 7, "cluster": 2, "fire": 2}
		_:
			b.add_mound(1200, 2400, 100, 150)
			var base := -100.0
			wall(b, 1370, 1450, base, 6, "stone")
			wall(b, 2170, 2250, base, 6, "stone")
			var t1 := tower(b, 1580, base, 120, 3, "stone", "wood", [0, 2])
			battlements(b, 1580, t1, 120, "stone")
			var t2 := tower(b, 2040, base, 120, 3, "stone", "wood", [1, 2])
			battlements(b, 2040, t2, 120, "stone")
			var keep := tower(b, 1810, base, 160, 4, "stone", "stone", [0, 2])
			b.add_enemy(1810, keep, true)
			battlements(b, 1810, keep, 160, "stone")
			return {"name": "The King's Citadel", "shots": 8, "cluster": 2, "fire": 3}


## Stacks `floors` storeys of two pillars plus a floor plank. Returns the new top y.
static func tower(b, cx: float, base: float, width: float, floors: int, pillar_mat: String,
		floor_mat: String, enemy_floors: Array, pillar_h := 90.0) -> float:
	var y := base
	var px := width * 0.5 - 10.0
	for f in floors:
		b.add_block(cx - px, y, 20, pillar_h, pillar_mat)
		b.add_block(cx + px, y, 20, pillar_h, pillar_mat)
		if f in enemy_floors:
			b.add_enemy(cx, y)
		y -= pillar_h
		b.add_block(cx, y, width, 20, floor_mat)
		y -= 20.0
	return y


static func battlements(b, cx: float, top: float, width: float, mat: String) -> void:
	var e := width * 0.5 - 9.0
	for x in [cx - e, cx - e + 36.0, cx + e - 36.0, cx + e]:
		b.add_block(x, top, 18, 22, mat)


static func roof(b, cx: float, top: float, width: float, mat: String) -> void:
	var y := top
	for f in [0.85, 0.6, 0.35]:
		y = b.add_block(cx, y, width * f, 16, mat)


static func wall(b, x0: float, x1: float, base: float, rows: int, mat: String) -> void:
	var bw := 40.0
	var bh := 30.0
	var n := int(round((x1 - x0) / bw))
	var y := base
	for r in rows:
		if r % 2 == 0:
			for i in n:
				b.add_block(x0 + bw * (i + 0.5), y, bw, bh, mat)
		else:
			b.add_block(x0 + bw * 0.25, y, bw * 0.5, bh, mat)
			for i in n - 1:
				b.add_block(x0 + bw * (i + 1), y, bw, bh, mat)
			b.add_block(x1 - bw * 0.25, y, bw * 0.5, bh, mat)
		y -= bh
