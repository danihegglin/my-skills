extends Node
## Tiny procedural sound bank, so the game ships without audio files.

const RATE := 22050

var streams := {}
var players: Array[AudioStreamPlayer] = []
var next_player := 0
var last_played := {}


func _ready() -> void:
	for i in 12:
		var p := AudioStreamPlayer.new()
		add_child(p)
		players.append(p)
	streams["whoosh"] = _wav(_whoosh(0.55))
	streams["thud"] = _wav(_noise(0.35, 0.06, 0.02, 12.0, 70.0, 0.6))
	streams["stone"] = _wav(_noise(0.45, 0.45, 0.12, 9.0, 0.0, 0.0))
	streams["wood"] = _wav(_noise(0.3, 0.3, 0.08, 14.0, 160.0, 0.35))
	streams["boom"] = _wav(_noise(1.3, 0.14, 0.015, 3.5, 45.0, 0.5))
	streams["ugh"] = _wav(_voice())
	streams["win"] = _wav(_melody([523.25, 659.25, 783.99, 1046.5], 0.15, 0.6))
	streams["lose"] = _wav(_melody([392.0, 329.63, 261.63], 0.3, 0.7))


func play(sound: String, volume_db := 0.0, pitch := 1.0) -> void:
	if not streams.has(sound):
		return
	var now := Time.get_ticks_msec()
	if now - int(last_played.get(sound, -1000)) < 45:
		return
	last_played[sound] = now
	var p := players[next_player]
	next_player = (next_player + 1) % players.size()
	p.stream = streams[sound]
	p.volume_db = volume_db
	p.pitch_scale = pitch * randf_range(0.92, 1.08)
	p.play()


func _wav(samples: PackedFloat32Array) -> AudioStreamWAV:
	var peak := 0.001
	for s in samples:
		peak = maxf(peak, absf(s))
	var data := PackedByteArray()
	data.resize(samples.size() * 2)
	for i in samples.size():
		data.encode_s16(i * 2, int(clampf(samples[i] / peak * 0.9, -1.0, 1.0) * 32000.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = data
	return w


func _noise(dur: float, lp0: float, lp1: float, decay: float, tone: float, tone_amt: float) -> PackedFloat32Array:
	var n := int(dur * RATE)
	var out := PackedFloat32Array()
	out.resize(n)
	var rng := RandomNumberGenerator.new()
	rng.seed = 99
	var y := 0.0
	var phase := 0.0
	for i in n:
		var t := float(i) / RATE
		var k := lerpf(lp0, lp1, t / dur)
		y += k * (rng.randf_range(-1.0, 1.0) - y)
		var env := minf(1.0, t / 0.004) * exp(-t * decay)
		phase += TAU * tone * (1.0 - 0.5 * t / dur) / RATE
		out[i] = (y * (1.0 - tone_amt) * 4.0 + sin(phase) * tone_amt) * env
	return out


func _whoosh(dur: float) -> PackedFloat32Array:
	var n := int(dur * RATE)
	var out := PackedFloat32Array()
	out.resize(n)
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	var y := 0.0
	for i in n:
		var t := float(i) / dur / RATE
		var k := 0.03 + 0.25 * sin(PI * t)
		y += k * (rng.randf_range(-1.0, 1.0) - y)
		out[i] = y * pow(sin(PI * t), 2.0)
	return out


func _voice() -> PackedFloat32Array:
	var dur := 0.32
	var n := int(dur * RATE)
	var out := PackedFloat32Array()
	out.resize(n)
	var phase := 0.0
	for i in n:
		var t := float(i) / RATE
		var f := lerpf(280.0, 130.0, t / dur) * (1.0 + 0.03 * sin(t * 40.0))
		phase += TAU * f / RATE
		var env := minf(1.0, t / 0.02) * exp(-t * 7.0)
		out[i] = (sin(phase) + 0.6 * sin(2.0 * phase) + 0.35 * sin(3.0 * phase) + 0.2 * sin(5.0 * phase)) * env
	return out


func _melody(notes: Array, step: float, last_len: float) -> PackedFloat32Array:
	var total := step * (notes.size() - 1) + last_len
	var n := int(total * RATE)
	var out := PackedFloat32Array()
	out.resize(n)
	for ni in notes.size():
		var start := int(ni * step * RATE)
		var length := int((last_len if ni == notes.size() - 1 else step * 1.6) * RATE)
		var f: float = notes[ni]
		for i in length:
			if start + i >= n:
				break
			var t := float(i) / RATE
			var env := minf(1.0, t / 0.01) * exp(-t * 4.0)
			var ph := TAU * f * t
			out[start + i] += (sin(ph) + 0.3 * sin(3.0 * ph) + 0.15 * sin(5.0 * ph)) * env * 0.5
	return out
