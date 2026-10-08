extends Node
## Procedurally synthesised sound effects, so the game ships without audio files.

const RATE := 22050

var streams := {}
var players: Array[AudioStreamPlayer] = []
var next_player := 0
var last_played := {}
var muted := false


func _ready() -> void:
	for i in 14:
		var p := AudioStreamPlayer.new()
		add_child(p)
		players.append(p)
	streams["swish"] = _wav(_swish(0.22))
	streams["slice"] = _wav(_shing())
	streams["collect"] = _wav(_bell(880.0, 0.55))
	streams["star"] = _wav(_bell(1318.5, 0.9))
	streams["sizzle"] = _wav(_sizzle())
	streams["zap"] = _wav(_zap())
	streams["crunch"] = _wav(_noise(0.25, 0.5, 0.15, 18.0, 0.0, 0.0))
	streams["thud"] = _wav(_noise(0.2, 0.05, 0.02, 20.0, 80.0, 0.6))
	streams["boing"] = _wav(_boing())
	streams["click"] = _wav(_bell(1760.0, 0.08))
	streams["win"] = _wav(_melody([523.25, 659.25, 783.99, 1046.5], 0.12, 0.7))
	streams["fail"] = _wav(_melody([392.0, 311.13, 261.63], 0.22, 0.7))


func play(sound: String, volume_db := 0.0, pitch := 1.0) -> void:
	if muted or not streams.has(sound):
		return
	var now := Time.get_ticks_msec()
	if now - int(last_played.get(sound, -1000)) < 40:
		return
	last_played[sound] = now
	var p := players[next_player]
	next_player = (next_player + 1) % players.size()
	p.stream = streams[sound]
	p.volume_db = volume_db
	p.pitch_scale = pitch * randf_range(0.95, 1.05)
	p.play()


func _wav(samples: PackedFloat32Array) -> AudioStreamWAV:
	var peak := 0.001
	for s in samples:
		peak = maxf(peak, absf(s))
	var data := PackedByteArray()
	data.resize(samples.size() * 2)
	for i in samples.size():
		data.encode_s16(i * 2, int(clampf(samples[i] / peak * 0.85, -1.0, 1.0) * 32000.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.data = data
	return w


func _buf(dur: float) -> PackedFloat32Array:
	var b := PackedFloat32Array()
	b.resize(int(dur * RATE))
	return b


func _swish(dur: float) -> PackedFloat32Array:
	var out := _buf(dur)
	var rng := RandomNumberGenerator.new()
	rng.seed = 3
	var lo := 0.0
	var lo2 := 0.0
	for i in out.size():
		var t := float(i) / out.size()
		var k := 0.05 + 0.5 * sin(PI * t)
		lo += k * (rng.randf_range(-1.0, 1.0) - lo)
		lo2 += 0.08 * (lo - lo2)
		out[i] = (lo - lo2) * pow(sin(PI * t), 2.0)
	return out


func _shing() -> PackedFloat32Array:
	var out := _buf(0.5)
	var rng := RandomNumberGenerator.new()
	rng.seed = 11
	var partials := [[2630.0, 1.0, 9.0], [3870.0, 0.6, 12.0], [5210.0, 0.45, 15.0], [7090.0, 0.25, 20.0], [1480.0, 0.4, 7.0]]
	for i in out.size():
		var t := float(i) / RATE
		var s := 0.0
		for pr in partials:
			s += sin(TAU * pr[0] * t) * pr[1] * exp(-t * pr[2])
		s += rng.randf_range(-1.0, 1.0) * exp(-t * 90.0) * 1.2
		out[i] = s * minf(1.0, t / 0.002)
	return out


func _bell(f: float, dur: float) -> PackedFloat32Array:
	var out := _buf(dur)
	for i in out.size():
		var t := float(i) / RATE
		var env := minf(1.0, t / 0.003) * exp(-t * 6.0 / dur)
		out[i] = (sin(TAU * f * t) + 0.45 * sin(TAU * f * 2.0 * t) * exp(-t * 8.0) + 0.2 * sin(TAU * f * 3.01 * t) * exp(-t * 14.0)) * env
	return out


func _sizzle() -> PackedFloat32Array:
	var out := _buf(0.7)
	var rng := RandomNumberGenerator.new()
	rng.seed = 21
	var lo := 0.0
	for i in out.size():
		var t := float(i) / RATE
		var n := rng.randf_range(-1.0, 1.0)
		lo += 0.3 * (n - lo)
		var crackle := 1.0 + (3.0 if rng.randf() < 0.004 else 0.0)
		out[i] = (n - lo) * crackle * minf(1.0, t / 0.01) * exp(-t * 4.0)
	return out


func _zap() -> PackedFloat32Array:
	var out := _buf(0.3)
	var ph := 0.0
	var rng := RandomNumberGenerator.new()
	rng.seed = 8
	for i in out.size():
		var t := float(i) / RATE
		ph += lerpf(1400.0, 160.0, t / 0.3) / RATE
		var saw := fposmod(ph, 1.0) * 2.0 - 1.0
		out[i] = (saw * 0.7 + rng.randf_range(-0.4, 0.4)) * exp(-t * 9.0)
	return out


func _boing() -> PackedFloat32Array:
	var out := _buf(0.3)
	var ph := 0.0
	for i in out.size():
		var t := float(i) / RATE
		ph += TAU * (300.0 + 260.0 * exp(-t * 14.0)) * (1.0 + 0.05 * sin(t * 90.0)) / RATE
		out[i] = sin(ph) * exp(-t * 10.0)
	return out


func _noise(dur: float, lp0: float, lp1: float, decay: float, tone: float, tone_amt: float) -> PackedFloat32Array:
	var out := _buf(dur)
	var rng := RandomNumberGenerator.new()
	rng.seed = 99
	var y := 0.0
	var phase := 0.0
	for i in out.size():
		var t := float(i) / RATE
		y += lerpf(lp0, lp1, t / dur) * (rng.randf_range(-1.0, 1.0) - y)
		phase += TAU * tone * (1.0 - 0.5 * t / dur) / RATE
		out[i] = (y * (1.0 - tone_amt) * 4.0 + sin(phase) * tone_amt) * minf(1.0, t / 0.003) * exp(-t * decay)
	return out


func _melody(notes: Array, step: float, last_len: float) -> PackedFloat32Array:
	var out := _buf(step * (notes.size() - 1) + last_len)
	for ni in notes.size():
		var start := int(ni * step * RATE)
		var length := int((last_len if ni == notes.size() - 1 else step * 1.8) * RATE)
		var f: float = notes[ni]
		for i in length:
			if start + i >= out.size():
				break
			var t := float(i) / RATE
			var ph := TAU * f * t
			out[start + i] += (sin(ph) + 0.35 * sin(2.0 * ph) + 0.12 * sin(3.0 * ph)) * minf(1.0, t / 0.008) * exp(-t * 4.5) * 0.5
	return out
