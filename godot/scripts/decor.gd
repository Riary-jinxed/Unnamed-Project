extends Control
## Décor de la table propre au thème, repris de client/src/stage.js (drawTable) : pleine lune et tombes (Halloween), grille
## holographique et ligne de balayage (Néon 2099), soleil noir, failles de lave et cendres (Éclipse), rais de lumière,
## mousse et racines (Sylvaën), ciel de l'aube (Séraphine), voie lactée et constellations (Elyndra), soleil rouge et vagues
## (Estampe), tapis de casino, suites et jetons (Fortuna).
## Le fond fixe est dessiné une fois (redessiné si l'écran change de taille) ; seul le calque animé se redessine à chaque image.

var anim: Control
var _t := 0.0
var _ash: Array = []      # cendres de l'éclipse : [position, vitesse, chaude]


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	anim = Control.new()
	anim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	anim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	anim.draw.connect(_draw_anim)
	add_child(anim)
	set_process(Look.deco in ["grid", "sun", "stars", "moon"])
	resized.connect(queue_redraw)


func _process(dt: float) -> void:
	_t += dt
	if Look.deco == "sun":
		if randf() < 0.9 * dt:
			var hot := randf() < 0.3
			_ash.append([Vector2(randf() * size.x, -8), Vector2(randf_range(-18, 6), randf_range(30, 54)), hot])
		for a in _ash:
			a[0] += a[1] * dt
		_ash = _ash.filter(func(a): return a[0].y < size.y + 10)
	anim.queue_redraw()


func _draw() -> void:
	var w := size.x
	var h := size.y
	match Look.deco:
		"moon": _moon(w, h)
		"grid": _grid(w, h)
		"sun": _sun(w, h)
		"stars": _stars(w, h)
		"waves": _waves(w, h)
		"forest": _forest(w, h)
		"dawn": _dawn(w, h)
		"felt": _felt(w, h)


func _draw_anim() -> void:
	var w := size.x
	var h := size.y
	match Look.deco:
		"grid":
			# Ligne de balayage qui descend, et sa traîne.
			var y := fmod(_t * 55.0, h + 120.0) - 60.0
			anim.draw_rect(Rect2(0, y - 24, w, 24), Color("19e6ff", 0.035))
			anim.draw_rect(Rect2(0, y, w, 2), Color("19e6ff", 0.22))
		"sun":
			var c := _sky(w)
			var r := 20.0
			var k := 0.32 + sin(_t * 1.1) * 0.1
			for i in 5:
				anim.draw_circle(c, r * (1.6 + i * 0.55), Color(1.0, 0.29, 0.1, k * 0.09), true, -1.0, true)
			for a in _ash:
				anim.draw_circle(a[0], 2.2 if a[2] else 1.8, Color("ff6a2a", 0.6) if a[2] else Color("7a6a66", 0.5), true, -1.0, true)
		"stars":
			# Quelques étoiles qui scintillent.
			var rng := RandomNumberGenerator.new()
			rng.seed = 3
			for i in 24:
				var p := Vector2(rng.randf() * w, rng.randf() * h)
				var tw := 0.5 + 0.5 * sin(_t * rng.randf_range(1.0, 2.6) + i)
				anim.draw_circle(p, 1.4 + tw, Color(1, 0.97, 0.85, 0.15 + 0.6 * tw), true, -1.0, true)
				if tw > 0.85:
					anim.draw_line(p - Vector2(6, 0), p + Vector2(6, 0), Color(1, 0.97, 0.85, 0.4 * tw), 1.0, true)
					anim.draw_line(p - Vector2(0, 6), p + Vector2(0, 6), Color(1, 0.97, 0.85, 0.4 * tw), 1.0, true)
		"moon":
			# Halo de la lune qui respire.
			var c := _sky(w)
			var r := 22.0
			anim.draw_circle(c, r * (2.0 + 0.15 * sin(_t * 0.8)), Color("ffe6a0", 0.03), true, -1.0, true)


# ————— Décors fixes —————

## Lune, soleils : dans la barre du haut, entre le journal et le médaillon du tour, seule part du ciel que rien ne cache.
func _sky(w: float) -> Vector2:
	return Vector2(w * 0.3, 27)


## Sol de la table : juste au-dessus du dock (le dock cache le bas de l'écran).
func _floor(h: float) -> float:
	return h - 132.0

func _moon(w: float, h: float) -> void:
	var c := _sky(w)
	var r := 22.0
	draw_circle(c, r * 2.6, Color("ffe6a0", 0.04), true, -1.0, true)
	draw_circle(c, r * 1.6, Color("ffe6a0", 0.07), true, -1.0, true)
	draw_circle(c, r, Color("f6ead0", 0.32), true, -1.0, true)
	draw_circle(c + Vector2(-r * 0.3, -r * 0.2), r * 0.18, Color("c8b890", 0.25), true, -1.0, true)
	draw_circle(c + Vector2(r * 0.25, r * 0.3), r * 0.12, Color("c8b890", 0.2), true, -1.0, true)
	# Pierres tombales penchées au pied de l'écran, et une citrouille.
	for t in [[0.04, 1.0, -0.12], [0.13, 0.7, 0.08], [0.9, 0.85, 0.1], [0.97, 1.1, -0.06]]:
		var tw: float = 34.0 * t[1]
		var th: float = 46.0 * t[1]
		var base := Vector2(w * t[0], _floor(h) + 4)
		var pts := PackedVector2Array()
		for p in [Vector2(-tw / 2, 0), Vector2(-tw / 2, -th + tw / 2), Vector2(0, -th), Vector2(tw / 2, -th + tw / 2), Vector2(tw / 2, 0)]:
			pts.append(base + p.rotated(t[2]))
		draw_colored_polygon(pts, Color("241830", 0.9))
	var pc := Vector2(w * 0.03, _floor(h) - 60)
	for k in [-1, 0, 1]:
		draw_set_transform(pc + Vector2(k * 9, 0), 0, Vector2(0.75, 1.0))
		draw_circle(Vector2.ZERO, 14, Color("c8601a", 0.85) if k == 0 else Color("a84a12", 0.85), true, -1.0, true)
	draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
	draw_rect(Rect2(pc + Vector2(-2, -18), Vector2(4, 6)), Color("3a5a1a"))
	draw_colored_polygon(PackedVector2Array([pc + Vector2(-8, -4), pc + Vector2(-3, -4), pc + Vector2(-5.5, -9)]), Color("ffd060", 0.9))
	draw_colored_polygon(PackedVector2Array([pc + Vector2(3, -4), pc + Vector2(8, -4), pc + Vector2(5.5, -9)]), Color("ffd060", 0.9))


func _grid(w: float, h: float) -> void:
	# Grille holographique, plus serrée et plus vive vers le bas (comme vue en perspective).
	var g := Color("19e6ff")
	var y := 0.0
	var k := 0
	while y < h:
		draw_rect(Rect2(0, h - y, w, 1), Color(g, 0.05 + 0.1 * (1.0 - y / h)))
		k += 1
		y += 18 + k * 1.5
	var x := fmod(w * 0.5, 32.0)
	while x < w:
		draw_rect(Rect2(x, 0, 1, h), Color(g, 0.06))
		x += 32
	# Lueurs magenta et cyan dans les coins, comme le fond de l'appli.
	for i in 4:
		draw_circle(Vector2(w * 0.15, h * 1.1), 420 - i * 90, Color("ff2bd6", 0.03), true, -1.0, true)
		draw_circle(Vector2(w * 0.5, -h * 0.1), 420 - i * 90, Color("19e6ff", 0.025), true, -1.0, true)


func _sun(w: float, h: float) -> void:
	# Soleil noir cerclé de feu en haut à droite, failles de lave entre les planches du bas.
	var c := _sky(w)
	var r := 20.0
	draw_circle(c, r * 1.5, Color("ff6a2a", 0.12), true, -1.0, true)
	draw_circle(c, r * 1.12, Color("ffb060", 0.5), true, -1.0, true)
	draw_circle(c, r * 1.04, Color("ffe0b0", 0.6), true, -1.0, true)
	draw_circle(c, r, Color.BLACK, true, -1.0, true)
	for f in [[0.08, 0.3, 1.0], [0.55, 0.22, -1.0], [0.78, 0.18, 1.0]]:
		var pts := PackedVector2Array()
		for i in 9:
			pts.append(Vector2(w * (f[0] + f[1] * i / 8.0), _floor(h) - 6 - (10.0 if i % 2 else 2.0) * f[2] - i * 1.5))
		draw_polyline(pts, Color("ff3a0a", 0.12), 6.0, true)
		draw_polyline(pts, Color("ff8a3a", 0.6), 1.5, true)


func _stars(w: float, h: float) -> void:
	# Voie lactée en diagonale, champ d'étoiles fixe et deux constellations reliées d'or.
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for i in 9:
		var k := i / 8.0
		draw_circle(Vector2(w * (0.1 + 0.8 * k), h * (0.85 - 0.7 * k)), maxf(w, h) * 0.16, Color("3a2a8a" if i % 2 else "1a3a8a", 0.07), true, -1.0, true)
	for i in 160:
		var r := 0.8 if rng.randf() < 0.9 else 1.6
		draw_circle(Vector2(rng.randf() * w, rng.randf() * h), r, Color("fff0b0" if rng.randf() < 0.2 else "d8e4ff", 0.35 + rng.randf() * 0.5), true, -1.0, true)
	for cons in [[[0.06, 0.08], [0.14, 0.05], [0.2, 0.11], [0.27, 0.07], [0.31, 0.14]], [[0.7, 0.9], [0.78, 0.86], [0.85, 0.92], [0.93, 0.87], [0.88, 0.97]]]:
		var pts := PackedVector2Array()
		for p in cons:
			pts.append(Vector2(p[0] * w, p[1] * h))
		draw_polyline(pts, Color("e8c050", 0.35), 1.0, true)
		for p in pts:
			draw_circle(p, 6, Color("fff2c0", 0.12), true, -1.0, true)
			draw_circle(p, 2.2, Color("fff2c0", 0.9), true, -1.0, true)


func _waves(w: float, h: float) -> void:
	# Estampe : grand soleil rouge et vagues seigaiha (écailles de cercles) le long du bas.
	draw_circle(_sky(w), 24.0, Color("c8281a", 0.85), true, -1.0, true)
	var R := 22.0
	for row in range(4, -1, -1):
		var x := (row % 2) * R
		while x < w + R:
			var y := _floor(h) - row * R * 0.5
			for k in range(4, 0, -1):
				draw_circle(Vector2(x, y), R * k / 4.0, Color("2a5a7a" if k % 2 else "efe2c4", 0.9 - row * 0.12), true, -1.0, true)
			x += R * 2
	# Nuages stylisés à gauche.
	for c in [[0.1, 0.16, 1.0], [0.24, 0.13, 0.7]]:
		var p := Vector2(w * c[0], h * c[1])
		for i in 3:
			draw_arc(p + Vector2(i * 22 * c[2], 0), 14 * c[2], PI, TAU, 16, Color("2a5a7a", 0.5), 2.0, true)


func _forest(w: float, h: float) -> void:
	# Sylvaën : rais de lumière en biais, mousse au sol, racines qui sortent des bords.
	for r in [[0.12, 0.08], [0.38, 0.05], [0.62, 0.1], [0.86, 0.06]]:
		var x: float = w * r[0]
		var b: float = w * r[1]
		draw_colored_polygon(PackedVector2Array([Vector2(x, 0), Vector2(x + b, 0), Vector2(x + b + h * 0.35, h), Vector2(x + h * 0.35, h)]), Color("e8ffb0", 0.035))
	for i in 14:
		var k := i / 13.0
		draw_set_transform(Vector2(w * k, h * (0.92 + 0.06 * sin(i * 2.3))), 0, Vector2(1.0, 0.42))
		draw_circle(Vector2.ZERO, w * 0.12, Color("1a3a1c" if i % 2 else "224a22", 0.55), true, -1.0, true)
	draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
	for r in [[0, 0.7], [1, 0.82], [0, 0.9], [1, 0.6]]:
		var sx := w if r[0] else 0.0
		var d := -1.0 if r[0] else 1.0
		var pts := PackedVector2Array()
		for i in 7:
			pts.append(Vector2(sx + d * i * w * 0.05, h * r[1] + sin(i * 1.3 + r[1] * 9) * 10 + i * 4))
		draw_polyline(pts, Color("2a1c10", 0.8), 7.0, true)
		draw_polyline(pts, Color("4a3420", 0.7), 2.0, true)


func _dawn(w: float, h: float) -> void:
	# Séraphine : ciel qui s'éclaire vers le bas, soleil levant derrière une mer de nuages, rayons en éventail.
	var cols := [Color("140e1a"), Color("241830"), Color("3a2040"), Color("5a2a48"), Color("8a3a50")]
	for i in 12:
		var k := i / 11.0
		draw_rect(Rect2(0, h * k, w, h / 11.0 + 1), Color(cols[mini(4, int(k * 5))], 0.35 + k * 0.3))
	var c := Vector2(w * 0.5, h * 1.02)
	for i in 16:
		var a := PI + (i + 0.5) / 16.0 * PI
		var l := maxf(w, h) * 1.2
		draw_colored_polygon(PackedVector2Array([c, c + Vector2(cos(a - 0.04), sin(a - 0.04)) * l, c + Vector2(cos(a + 0.04), sin(a + 0.04)) * l]), Color("ffe0a0", 0.04))
	draw_circle(c, minf(w, h) * 0.22, Color("ffd890", 0.25), true, -1.0, true)
	draw_circle(c, minf(w, h) * 0.14, Color("fff4d0", 0.5), true, -1.0, true)
	for i in 12:
		draw_circle(Vector2(w * i / 11.0, h * (0.97 + 0.03 * sin(i * 1.7))), w * 0.1, Color("ffe8f0", 0.35), true, -1.0, true)


func _felt(w: float, h: float) -> void:
	# Fortuna : tapis vert bordé d'un boudin de cuir rouge à filet d'or, ligne de mise, couleurs de cartes, piles de jetons.
	var m := 6.0
	var rail := maxf(12.0, minf(w, h) * 0.025)
	draw_set_transform(Vector2(w * 0.5, h * 0.45), 0, Vector2(1.0, h * 0.55 / (w * 0.6)))
	draw_circle(Vector2.ZERO, w * 0.6, Color("12583a", 0.35), true, -1.0, true)
	draw_set_transform(Vector2(w * 0.5, h * 0.5), 0, Vector2(1.0, h * 0.36 / (w * 0.4)))
	draw_arc(Vector2.ZERO, w * 0.4, 0, TAU, 64, Color("f2c14e", 0.16), 1.5, true)
	draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
	Gfx.frame_round(self, Rect2(m + rail / 2, m + rail / 2, w - 2 * m - rail, h - 2 * m - rail), 40, Color("2a0a0e"), rail)
	Gfx.frame_round(self, Rect2(m + 2, m + 2, w - 2 * m - 4, h - 2 * m - 4), 44, Color("5a2028", 0.8), 1.5)
	Gfx.frame_round(self, Rect2(m + rail + 2, m + rail + 2, w - 2 * (m + rail + 2), h - 2 * (m + rail + 2)), 34, Color("f2c14e", 0.6), 1.5)
	var s := minf(w, h) * 0.09
	var e := m + rail + s * 0.9
	Orn.suit(self, "spade", Vector2(e, e), s, Color.BLACK)
	Orn.suit(self, "heart", Vector2(w - e, e), s, Color("d8102a"))
	Orn.suit(self, "diamond", Vector2(e, h - e), s, Color("d8102a"))
	Orn.suit(self, "club", Vector2(w - e, h - e), s, Color.BLACK)
	for st in [[0.06, 0.55, 5, "b8101e"], [0.1, 0.58, 3, "151515"], [0.93, 0.42, 4, "1a4ab8"], [0.89, 0.45, 6, "f2c14e"]]:
		var cx: float = w * st[0]
		var r := minf(w, h) * 0.028
		var col := Color(st[3])
		for i in st[2]:
			var y: float = h * st[1] - i * r * 0.32
			draw_set_transform(Vector2(cx, y), 0, Vector2(1.0, 0.45))
			draw_circle(Vector2(0, r * 0.27), r, Color(0, 0, 0, 0.5), true, -1.0, true)
			draw_circle(Vector2.ZERO, r, col, true, -1.0, true)
			draw_arc(Vector2.ZERO, r * 0.62, 0, TAU, 24, Color("7a1010", 0.7) if st[3] == "f2c14e" else Color(1, 1, 1, 0.7), 1.0, true)
		draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)

