extends RefCounted
## The eight worlds. Coordinates are in the 720 x 1280 playfield; the floor top is at y = 1200.
## floor: [x0, x1, kind] with kind solid | goal | lava | spikes.
## stars: percentage needed for one, two and three stars.

const COUNT := 8


static func get_level(i: int) -> Dictionary:
	match i:
		0:
			return {
				"theme": 0, "slices": 3, "stars": [40, 60, 80],
				"hint": "Swipe across a shape to slice it.\nDrop the pieces into the glowing chute!",
				"objects": [
					{"shape": "circle", "r": 115.0, "pos": Vector2(430, 460), "mat": "melon", "pins": [Vector2(0, -72)]},
					{"shape": "rect", "w": 150.0, "h": 150.0, "pos": Vector2(230, 730), "mat": "crate", "pins": [Vector2(-50, -50)]},
				],
				"floor": [[0, 150, "solid"], [150, 570, "goal"], [570, 720, "solid"]],
			}
		1:
			return {
				"theme": 1, "slices": 3, "stars": [25, 40, 50],
				"hint": "Unpinned shapes only fall once they tip\nover a ledge. Slice them the right way.",
				"objects": [
					{"shape": "ngon", "n": 6, "r": 95.0, "rot0": 0.0, "pos": Vector2(180, 482), "mat": "cheese"},
					{"shape": "star", "r": 105.0, "ri": 48.0, "pos": Vector2(520, 400), "mat": "crystal", "pins": [Vector2(0, 0)]},
				],
				"statics": [
					{"t": "rect", "rect": Rect2(0, 565, 260, 50)},
					{"t": "slope", "a": Vector2(720, 930), "b": Vector2(480, 1050), "w": 28.0},
				],
				"floor": [[0, 250, "solid"], [250, 470, "goal"], [470, 720, "solid"]],
			}
		2:
			return {
				"theme": 2, "slices": 3, "stars": [35, 50, 70], "friction": 0.03,
				"hint": "Ice is slippery. Pieces only slide off\nthe shelf if you cut them at an angle.",
				"objects": [
					{"shape": "rect", "w": 260.0, "h": 130.0, "pos": Vector2(360, 474), "mat": "ice"},
					{"shape": "diamond", "w": 110.0, "h": 150.0, "pos": Vector2(130, 320), "mat": "crystal", "pins": [Vector2(0, -45)]},
				],
				"statics": [
					{"t": "rect", "rect": Rect2(190, 540, 340, 40)},
					{"t": "slope", "a": Vector2(0, 900), "b": Vector2(300, 1130), "w": 26.0},
					{"t": "slope", "a": Vector2(720, 900), "b": Vector2(420, 1130), "w": 26.0},
				],
				"floor": [[0, 285, "spikes"], [285, 435, "goal"], [435, 720, "spikes"]],
			}
		3:
			return {
				"theme": 3, "slices": 4, "stars": [25, 35, 45],
				"gscale": 0.5, "ldamp": 1.0, "adamp": 1.5,
				"hint": "A strong current pushes everything left.\nSea urchins pop whatever touches them.",
				"objects": [
					{"shape": "heart", "r": 62.0, "pos": Vector2(565, 320), "mat": "jelly", "pins": [Vector2(0, -30)]},
					{"shape": "tri", "r": 95.0, "pos": Vector2(370, 320), "mat": "candy", "pins": [Vector2(0, -50)]},
				],
				"statics": [
					{"t": "peg", "pos": Vector2(140, 540), "r": 24.0}, {"t": "peg", "pos": Vector2(300, 560), "r": 24.0},
					{"t": "peg", "pos": Vector2(460, 540), "r": 24.0}, {"t": "peg", "pos": Vector2(620, 560), "r": 24.0},
					{"t": "peg", "pos": Vector2(120, 960), "r": 28.0}, {"t": "peg", "pos": Vector2(480, 980), "r": 28.0},
					{"t": "urchin", "pos": Vector2(410, 1040), "r": 28.0}, {"t": "urchin", "pos": Vector2(560, 760), "r": 26.0},
				],
				"fields": [{"t": "current", "rect": Rect2(0, 640, 720, 200), "force": Vector2(-400, 0)}],
				"floor": [[0, 190, "solid"], [190, 370, "goal"], [370, 720, "solid"]],
			}
		4:
			return {
				"theme": 4, "slices": 5, "stars": [25, 40, 50],
				"hint": "Spinning arms knock pieces around.\nThe conveyor belt carries them left.",
				"objects": [
					{"shape": "cross", "w": 170.0, "t": 58.0, "pos": Vector2(520, 360), "mat": "metal", "pins": [Vector2(0, 0)]},
					{"shape": "ngon", "n": 6, "r": 75.0, "rot0": 0.0, "pos": Vector2(150, 387), "mat": "marble"},
				],
				"statics": [{"t": "rect", "rect": Rect2(0, 452, 220, 36)}],
				"movers": [
					{"t": "spinner", "pos": Vector2(220, 780), "len": 240.0, "w": 22.0, "speed": 1.2},
					{"t": "spinner", "pos": Vector2(500, 700), "len": 220.0, "w": 22.0, "speed": -1.5},
					{"t": "conveyor", "x0": 340.0, "x1": 720.0, "y": 1050.0, "speed": -160.0},
				],
				"floor": [[0, 140, "solid"], [140, 320, "goal"], [320, 720, "solid"]],
			}
		5:
			return {
				"theme": 5, "slices": 5, "stars": [15, 25, 30],
				"hint": "Lava burns everything it touches.\nUse the moving platform.",
				"objects": [
					{"shape": "ngon", "n": 5, "r": 105.0, "pos": Vector2(330, 330), "mat": "lavarock", "pins": [Vector2(0, -62)]},
					{"shape": "rect", "w": 170.0, "h": 120.0, "pos": Vector2(580, 480), "mat": "marble"},
				],
				"statics": [
					{"t": "rect", "rect": Rect2(520, 540, 200, 40)},
					{"t": "peg", "pos": Vector2(140, 760), "r": 30.0},
				],
				"movers": [{"t": "slider", "a": Vector2(170, 900), "b": Vector2(550, 900), "size": Vector2(170, 26), "period": 4.5}],
				"floor": [[0, 280, "lava"], [280, 440, "goal"], [440, 720, "lava"]],
			}
		6:
			return {
				"theme": 6, "slices": 6, "stars": [25, 35, 45], "gscale": 0.4, "friction": 0.35,
				"hint": "Low gravity. The planetoid pulls pieces in,\nand the laser zaps whatever it touches.",
				"objects": [
					{"shape": "star", "r": 75.0, "ri": 34.0, "pos": Vector2(150, 330), "mat": "neon", "pins": [Vector2(0, 0)]},
					{"shape": "diamond", "w": 90.0, "h": 130.0, "pos": Vector2(340, 300), "mat": "crystal", "pins": [Vector2(0, -40)]},
					{"shape": "ngon", "n": 6, "r": 70.0, "pos": Vector2(580, 340), "mat": "metal", "pins": [Vector2(0, -40)]},
				],
				"statics": [
					{"t": "planet", "pos": Vector2(340, 650), "r": 55.0},
					{"t": "slope", "a": Vector2(0, 880), "b": Vector2(300, 960), "w": 22.0},
				],
				"fields": [{"t": "well", "pos": Vector2(340, 650), "r": 190.0, "strength": 420.0}],
				"hazards": [{"t": "laser", "a": Vector2(440, 1080), "b": Vector2(700, 1080), "on": 2.0, "off": 1.0, "phase": 0.0}],
				"floor": [[0, 470, "solid"], [470, 650, "goal"], [650, 720, "solid"]],
			}
		_:
			return {
				"theme": 7, "slices": 8, "stars": [15, 25, 35],
				"hint": "Everything at once. Eight slices.\nGood luck!",
				"objects": [
					{"shape": "rect", "w": 130.0, "h": 130.0, "pos": Vector2(570, 330), "mat": "neon", "pins": [Vector2(40, -40)]},
					{"shape": "circle", "r": 80.0, "pos": Vector2(190, 330), "mat": "neonpink", "pins": [Vector2(0, -50)]},
					{"shape": "tri", "r": 70.0, "pos": Vector2(140, 550), "mat": "candy"},
					{"shape": "star", "r": 70.0, "ri": 32.0, "pos": Vector2(385, 280), "mat": "crystal", "pins": [Vector2(0, 0)]},
				],
				"statics": [
					{"t": "rect", "rect": Rect2(0, 585, 200, 30)},
					{"t": "slope", "a": Vector2(0, 1000), "b": Vector2(292, 1120), "w": 22.0},
					{"t": "slope", "a": Vector2(720, 1000), "b": Vector2(428, 1120), "w": 22.0},
					{"t": "bumper", "pos": Vector2(110, 800), "r": 26.0},
					{"t": "bumper", "pos": Vector2(612, 820), "r": 26.0},
				],
				"movers": [
					{"t": "spinner", "pos": Vector2(360, 760), "len": 300.0, "w": 20.0, "speed": 0.9},
					{"t": "slider", "a": Vector2(140, 920), "b": Vector2(580, 920), "size": Vector2(140, 22), "period": 3.6},
				],
				"hazards": [{"t": "laser", "a": Vector2(400, 650), "b": Vector2(720, 650), "move": Vector2(0, 300), "period": 5.0, "on": 2.5, "off": 1.5}],
				"floor": [[0, 300, "solid"], [300, 420, "goal"], [420, 720, "solid"]],
			}
