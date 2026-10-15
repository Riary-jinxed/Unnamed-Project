extends Node
## Bruitages, musique et vibrations.
## Les bruitages sont ceux de l'appli web (client/src/sfx.js), synthétisés de la même façon (notes à enveloppe, souffle filtré)
## mais calculés une fois dans un tampon au lieu de passer par Web Audio. Réglages gardés dans user://reglages.cfg.

const RATE := 22050
const CFG := "user://reglages.cfg"

var sound_on := true
var haptics_on := true
var cfg := ConfigFile.new()

var _cache := {}
var _players: Array[AudioStreamPlayer] = []
var _next := 0
var _music: AudioStreamPlayer
var _rng := RandomNumberGenerator.new()
var _warm: Array = []

# Vibrations des moments de partie (durées en millisecondes : vibre, pause, vibre…), comme HAPTICS dans sfx.js.
const HAPTICS := {
	"place": [12], "validate": [18], "deny": [25, 40, 25], "spell": [20], "terrain": [30], "general": [20, 40, 30],
	"hit": [30, 20, 15], "destroy": [45, 30, 70], "turn": [10], "win": [60, 50, 60, 50, 160], "lose": [220], "tie": [70, 80, 70],
}

# Recettes : [« t », fréquence, { to, dur, type, vol, at }] pour une note, [« n », { dur, freq, to, q, vol, at, type }] pour un souffle.
var RECIPES := {
	"pick": [["n", {"dur": 0.06, "freq": 3500, "vol": 0.18}], ["t", 880, {"dur": 0.05, "type": "triangle", "vol": 0.06}]],
	"place": [["n", {"dur": 0.09, "freq": 900, "to": 300, "vol": 0.35}], ["t", 140, {"to": 90, "dur": 0.1, "vol": 0.25}]],
	"unplace": [["n", {"dur": 0.08, "freq": 1200, "to": 3000, "vol": 0.2}]],
	"deny": [["t", 180, {"dur": 0.09, "type": "square", "vol": 0.08}], ["t", 150, {"dur": 0.12, "type": "square", "vol": 0.08, "at": 0.09}]],
	"validate": [["t", 523, {"dur": 0.25, "type": "triangle", "vol": 0.18}], ["t", 784, {"dur": 0.35, "type": "triangle", "vol": 0.15, "at": 0.08}]],
	"draw": [["n", {"dur": 0.18, "freq": 1500, "to": 4000, "q": 0.8, "vol": 0.2}]],
	"reveal": [["n", {"dur": 0.16, "freq": 600, "to": 3500, "vol": 0.22}], ["t", 660, {"dur": 0.3, "type": "triangle", "vol": 0.15, "at": 0.08}], ["t", 990, {"dur": 0.35, "vol": 0.1, "at": 0.12}]],
	"revealFoe": [["n", {"dur": 0.16, "freq": 500, "to": 2500, "vol": 0.22}], ["t", 440, {"dur": 0.3, "type": "triangle", "vol": 0.15, "at": 0.08}], ["t", 415, {"dur": 0.35, "vol": 0.08, "at": 0.12}]],
	"spell": [["t", 784, {"dur": 0.25, "vol": 0.08}], ["t", 988, {"dur": 0.25, "vol": 0.08, "at": 0.04}], ["t", 1175, {"dur": 0.25, "vol": 0.08, "at": 0.08}], ["t", 1568, {"dur": 0.25, "vol": 0.08, "at": 0.12}], ["n", {"dur": 0.3, "freq": 5000, "q": 2, "vol": 0.06}]],
	"up": [["t", 600, {"to": 1200, "dur": 0.18, "vol": 0.1}]],
	"down": [["t", 300, {"to": 120, "dur": 0.22, "type": "sawtooth", "vol": 0.06}]],
	"destroy": [["n", {"dur": 0.3, "freq": 400, "to": 80, "type": "lowpass", "vol": 0.5}], ["t", 90, {"to": 40, "dur": 0.3, "vol": 0.35}]],
	"terrain": [["t", 110, {"to": 70, "dur": 0.5, "vol": 0.3}], ["n", {"dur": 0.4, "freq": 250, "type": "lowpass", "vol": 0.25}]],
	"turn": [["t", 587, {"dur": 0.35, "type": "triangle", "vol": 0.1}], ["t", 880, {"dur": 0.5, "vol": 0.07, "at": 0.1}]],
	"deal": [["n", {"dur": 0.07, "freq": 1800, "to": 700, "vol": 0.18}], ["n", {"dur": 0.07, "freq": 1800, "to": 700, "vol": 0.18, "at": 0.07}], ["n", {"dur": 0.07, "freq": 1800, "to": 700, "vol": 0.18, "at": 0.14}]],
	"general": [["t", 392, {"dur": 0.4, "type": "sawtooth", "vol": 0.05}], ["t", 523, {"dur": 0.4, "type": "sawtooth", "vol": 0.05, "at": 0.06}], ["t", 659, {"dur": 0.4, "type": "sawtooth", "vol": 0.05, "at": 0.12}]],
	"flip": [["n", {"dur": 0.07, "freq": 2600, "to": 1100, "q": 1.2, "vol": 0.18}]],
	"hit": [["n", {"dur": 0.1, "freq": 1600, "to": 500, "q": 1.4, "vol": 0.32}], ["t", 170, {"to": 70, "dur": 0.16, "type": "triangle", "vol": 0.3}], ["n", {"dur": 0.05, "freq": 5000, "q": 3, "vol": 0.08, "at": 0.01}]],
	"win": [["t", 523, {"dur": 0.18, "type": "triangle", "vol": 0.18}], ["t", 659, {"dur": 0.18, "type": "triangle", "vol": 0.18, "at": 0.13}], ["t", 784, {"dur": 0.18, "type": "triangle", "vol": 0.18, "at": 0.26}], ["t", 1047, {"dur": 0.9, "type": "triangle", "vol": 0.18, "at": 0.39}],
		["t", 523, {"dur": 1.1, "vol": 0.07, "at": 0.52}], ["t", 659, {"dur": 1.1, "vol": 0.07, "at": 0.52}], ["t", 784, {"dur": 1.1, "vol": 0.07, "at": 0.52}],
		["t", 2093, {"dur": 0.35, "vol": 0.03, "at": 0.6}], ["t", 2637, {"dur": 0.35, "vol": 0.03, "at": 0.68}], ["t", 3136, {"dur": 0.35, "vol": 0.03, "at": 0.76}], ["n", {"dur": 0.6, "freq": 6000, "q": 2, "vol": 0.04, "at": 0.5}]],
	"lose": [["t", 392, {"dur": 0.22, "type": "triangle", "vol": 0.15}], ["t", 349, {"dur": 0.22, "type": "triangle", "vol": 0.15, "at": 0.18}], ["t", 311, {"dur": 0.22, "type": "triangle", "vol": 0.15, "at": 0.36}], ["t", 262, {"dur": 0.9, "type": "triangle", "vol": 0.15, "at": 0.54}],
		["t", 131, {"to": 98, "dur": 1.2, "type": "sawtooth", "vol": 0.05, "at": 0.54}], ["n", {"dur": 0.5, "freq": 300, "type": "lowpass", "vol": 0.15, "at": 0.54}]],
	"tie": [["t", 440, {"dur": 0.25, "type": "triangle", "vol": 0.15}], ["t", 440, {"dur": 0.25, "type": "triangle", "vol": 0.15, "at": 0.2}], ["t", 330, {"dur": 0.6, "vol": 0.06, "at": 0.4}]],
}


func _ready() -> void:
	cfg.load(CFG)
	sound_on = bool(cfg.get_value("jeu", "son", true))
	haptics_on = bool(cfg.get_value("jeu", "vibrations", true))
	for i in 10:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)
	_music = AudioStreamPlayer.new()
	_music.volume_db = -13.0
	add_child(_music)
	_rng.seed = 7
	# Les tampons se calculent un par image au démarrage, pour ne pas figer l'écran.
	_warm = RECIPES.keys()


func _process(_delta: float) -> void:
	if not _warm.is_empty():
		_stream(_warm.pop_back())


func save() -> void:
	cfg.set_value("jeu", "son", sound_on)
	cfg.set_value("jeu", "vibrations", haptics_on)
	cfg.save(CFG)


func set_sound(on: bool) -> void:
	sound_on = on
	save()
	_music.stream_paused = not on


func play(name: String) -> void:
	if not sound_on or not RECIPES.has(name):
		return
	var p := _players[_next]
	_next = (_next + 1) % _players.size()
	p.stream = _stream(name)
	p.play()


## Vibre (téléphone seulement) ; un motif alterne vibration et pause.
func feel(name: String) -> void:
	if not haptics_on or not HAPTICS.has(name) or not OS.has_feature("mobile"):
		return
	var pattern: Array = HAPTICS[name]
	for i in pattern.size():
		if i % 2 == 0:
			Input.vibrate_handheld(int(pattern[i]))
		if i + 1 < pattern.size():
			await get_tree().create_timer((pattern[i] + (pattern[i + 1] if i % 2 == 0 else 0)) / 1000.0).timeout


## Musique d'ambiance (copiée depuis client/public/music par npm run godot:data), en boucle.
func music(track: String) -> void:
	var path := "res://music/%s.mp3" % track
	if not ResourceLoader.exists(path):
		return
	var s: AudioStreamMP3 = load(path)
	if _music.stream == s and _music.playing:
		return
	s.loop = true
	_music.stream = s
	_music.play()
	_music.stream_paused = not sound_on


func _stream(name: String) -> AudioStreamWAV:
	if _cache.has(name):
		return _cache[name]
	var parts: Array = RECIPES[name]
	var end := 0.0
	for p in parts:
		var o: Dictionary = p[2] if p[0] == "t" else p[1]
		end = maxf(end, float(o.get("at", 0.0)) + float(o.get("dur", 0.15)))
	var buf := PackedFloat32Array()
	buf.resize(int((end + 0.03) * RATE))
	for p in parts:
		if p[0] == "t":
			_tone(buf, float(p[1]), p[2])
		else:
			_noise(buf, p[1])
	var bytes := PackedByteArray()
	bytes.resize(buf.size() * 2)
	for i in buf.size():
		bytes.encode_s16(i * 2, int(clampf(buf[i] * 0.5, -1.0, 1.0) * 32767.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = bytes
	_cache[name] = w
	return w


## Enveloppe de Web Audio : montée exponentielle de 0,0001 à vol, puis retombée exponentielle à 0,0001 en fin de durée.
static func _env(t: float, attack: float, dur: float, vol: float) -> float:
	if t < attack:
		return 0.0001 * pow(vol / 0.0001, t / attack)
	return vol * pow(0.0001 / vol, (t - attack) / maxf(dur - attack, 0.001))


func _tone(buf: PackedFloat32Array, f: float, o: Dictionary) -> void:
	var dur := float(o.get("dur", 0.15))
	var to := float(o.get("to", 0.0))
	var vol := float(o.get("vol", 0.3))
	var type := str(o.get("type", "sine"))
	var start := int(float(o.get("at", 0.0)) * RATE)
	var n := int(dur * RATE)
	var phase := 0.0
	for i in n:
		var t := float(i) / RATE
		var freq := f * pow(to / f, t / dur) if to > 0.0 else f
		phase = fmod(phase + freq / RATE, 1.0)
		var s: float
		match type:
			"triangle": s = 1.0 - 4.0 * absf(fmod(phase + 0.25, 1.0) - 0.5)
			"square": s = 1.0 if phase < 0.5 else -1.0
			"sawtooth": s = 2.0 * phase - 1.0
			_: s = sin(TAU * phase)
		var j := start + i
		if j < buf.size():
			buf[j] += s * _env(t, 0.01, dur, vol)


func _noise(buf: PackedFloat32Array, o: Dictionary) -> void:
	var dur := float(o.get("dur", 0.12))
	var f0 := float(o.get("freq", 2000))
	var to := float(o.get("to", 0.0))
	var q := float(o.get("q", 1.0))
	var vol := float(o.get("vol", 0.3))
	var low := str(o.get("type", "bandpass")) == "lowpass"
	var start := int(float(o.get("at", 0.0)) * RATE)
	var n := int(dur * RATE)
	var x1 := 0.0; var x2 := 0.0; var y1 := 0.0; var y2 := 0.0
	var b0 := 0.0; var b1 := 0.0; var b2 := 0.0; var a1 := 0.0; var a2 := 0.0
	for i in n:
		var t := float(i) / RATE
		if i % 32 == 0:
			# Filtre biquad (formules RBJ, celles de Web Audio), recalculé quand sa fréquence glisse.
			var freq := minf(f0 * pow(to / f0, t / dur) if to > 0.0 else f0, RATE * 0.45)
			var w0 := TAU * freq / RATE
			var alpha := sin(w0) / (2.0 * q)
			var a0 := 1.0 + alpha
			if low:
				b0 = (1.0 - cos(w0)) * 0.5 / a0; b1 = (1.0 - cos(w0)) / a0; b2 = b0
			else:
				b0 = alpha / a0; b1 = 0.0; b2 = -alpha / a0
			a1 = -2.0 * cos(w0) / a0; a2 = (1.0 - alpha) / a0
		var x := _rng.randf() * 2.0 - 1.0
		var y := b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
		x2 = x1; x1 = x; y2 = y1; y1 = y
		var j := start + i
		if j < buf.size():
			buf[j] += y * _env(t, 0.008, dur, vol)
