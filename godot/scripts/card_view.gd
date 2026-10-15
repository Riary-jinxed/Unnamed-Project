extends Control
## Une carte, dessinée à la main : illustration (décor puis personnage) recadrée dans la fenêtre du gabarit,
## bandeau du nom, cadre aux couleurs de la famille, pastilles de coût et de puissance. Face cachée : le dos.

signal pressed(uid: int)

var uid := -1
var id := ""
var face_down := false      # carte de l'adversaire pas encore révélée
var revealed := false       # révélée sur le plateau (sinon : en main, ou posée face cachée)
var power = null            # puissance du moment (null : celle imprimée)
var cost = null             # coût du moment (en main)
var mobile := false         # peut être déplacée ce tour
var pending := false        # posée ce tour, pas encore révélée
var moving := false         # déplacement prévu
var selected := false
var playable := true        # assez de sceaux pour la jouer
var glow := 0.0:            # halo animé (sélection, révélation)
	set(v):
		glow = v
		queue_redraw()


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	resized.connect(queue_redraw)


func set_data(d: Dictionary) -> void:
	uid = int(d.get("uid", -1))
	face_down = bool(d.get("hidden", false))
	id = "" if face_down else str(d.get("id", ""))
	revealed = bool(d.get("revealed", false))
	power = d.get("power")
	cost = d.get("cost")
	mobile = bool(d.get("mobile", false))
	queue_redraw()


func _gui_input(e: InputEvent) -> void:
	# Sur téléphone, Godot change les touchers en clics (emulate_mouse_from_touch, réglage par défaut).
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		pressed.emit(uid)
		accept_event()


func _draw() -> void:
	var r := Rect2(Vector2.ZERO, size)
	var s := size.x / 100.0
	var rad := 7.0 * s
	# Ombre portée.
	Gfx.fill_round(self, Rect2(r.position + Vector2(0, 3 * s), r.size), rad, Color(0, 0, 0, 0.45))
	if selected or glow > 0.0:
		var g := maxf(glow, 1.0 if selected else 0.0)
		var col: Color = Data.GOLD if face_down else Data.fam_color(Data.card(id).get("fam"))
		for i in 3:
			var k := (3 - i) * 3.0 * s
			Gfx.fill_round(self, r.grow(k), rad + k, Color(col, 0.16 * g))
	if face_down:
		_draw_back(r, s, rad)
	else:
		_draw_face(r, s, rad)


func _draw_back(r: Rect2, s: float, rad: float) -> void:
	Gfx.fill_round(self, r, rad, Color("2a1912"))
	var inner := r.grow(-5 * s)
	Gfx.fill_round(self, inner, rad * 0.7, Color("3b2418"))
	# Losanges dorés en treillis.
	var step := 14.0 * s
	var c := inner.get_center()
	for i in range(-4, 5):
		for j in range(-6, 7):
			var p := c + Vector2(i * step + (step * 0.5 if j % 2 else 0.0), j * step * 0.8)
			if inner.grow(-4 * s).has_point(p):
				draw_colored_polygon(PackedVector2Array([p + Vector2(0, -2.6 * s), p + Vector2(2.6 * s, 0), p + Vector2(0, 2.6 * s), p + Vector2(-2.6 * s, 0)]), Color(Data.GOLD, 0.22))
	# Emblème central.
	var e := 15.0 * s
	draw_circle(c, e * 1.25, Color("2a1912"), true, -1.0, true)
	draw_arc(c, e * 1.25, 0, TAU, 40, Data.GOLD, 2.0 * s, true)
	var star := PackedVector2Array()
	for k in 16:
		var a := -PI / 2 + k * PI / 8
		star.append(c + Vector2(cos(a), sin(a)) * (e if k % 2 == 0 else e * 0.42))
	draw_colored_polygon(star, Data.GOLD)
	Gfx.frame_round(self, r, rad, Data.GOLD_DARK, 2.5 * s)
	Gfx.frame_round(self, inner, rad * 0.7, Color(Data.GOLD, 0.7), 1.2 * s)


func _draw_face(r: Rect2, s: float, rad: float) -> void:
	var d := Data.card(id)
	var fam_col: Color = Data.fam_color(d.get("fam"))
	var decor := Data.layer(id, "decor")
	if decor:
		var uv := Gfx.cover_uv(decor, Data.WINDOW_UV, r.size)
		Gfx.tex_round(self, decor, r, uv, rad)
		var perso := Data.layer(id, "perso")
		if perso:
			Gfx.tex_round(self, perso, r, uv, rad)
	else:
		# Pas encore d'illustration : visuel provisoire aux couleurs de la famille, comme dans l'appli.
		Gfx.fill_round(self, r, rad, fam_col.darkened(0.55))
		Gfx.shade_round(self, r, rad, 0.0, Color(fam_col, 0.5))
		Gfx.text_fit(self, Data.font_title, r.get_center() - Vector2(0, 12 * s), str(d.get("name", "?")).substr(0, 1), r.size.x, int(46 * s), Color(fam_col.lightened(0.3), 0.8))
	# Bandeau du nom.
	Gfx.shade_round(self, r, rad, 0.62, Color(0.04, 0.025, 0.02, 0.95))
	Gfx.text_fit(self, Data.font_title, Vector2(r.get_center().x, r.end.y - 13 * s), str(d.get("name", "")), r.size.x - 12 * s, int(11 * s), Color("f6ead2"), int(3 * s))
	# Cadre : filet de la famille, liseré doré.
	Gfx.frame_round(self, r, rad, fam_col, 3.2 * s)
	Gfx.frame_round(self, r.grow(-3.2 * s), rad * 0.75, Color(Data.GOLD, 0.55), 1.0 * s)
	# Coût (en main et posée), puissance (créatures).
	if not revealed:
		var cs: String = "X" if d.get("x", false) else Data.num(cost if cost != null else d.get("cost", 0))
		var cost_fill := Color("21345e") if playable else Color("5a1f1f")
		Gfx.badge(self, Vector2(13 * s, 13 * s), 11.5 * s, cost_fill, Color("9cc4ff") if playable else Color("ff8a7a"), cs, Color.WHITE)
	if d.get("type", "C") == "C":
		var base := int(d.get("power", 0))
		var pw := int(power) if power != null else base
		var pcol := Color("b5ff8a") if pw > base else Color("ff8f80") if pw < base else Color("fff1c9")
		Gfx.badge(self, Vector2(r.end.x - 13 * s, 13 * s), 12.5 * s, Color("3a2412"), Data.GOLD, str(pw), pcol)
	else:
		Gfx.text_fit(self, Data.font_bold, Vector2(r.end.x - 16 * s, 12 * s), "Sort", 26 * s, int(10 * s), Color("d8c8ff"), int(3 * s))
	if mobile and revealed:
		var m := Vector2(13 * s, 13 * s)
		Gfx.badge(self, m, 9.0 * s, Color("16323a"), Color("7fe3ff"), "", Color.WHITE)
		for k in [-1.0, 1.0]:
			var tip := m + Vector2(5.5 * s * k, 0)
			draw_line(m - Vector2(5.5 * s * k, 0), tip, Color("c9f6ff"), 1.6 * s, true)
			draw_colored_polygon(PackedVector2Array([tip + Vector2(1.5 * s * k, 0), tip - Vector2(2.2 * s * k, 2.6 * s), tip - Vector2(2.2 * s * k, -2.6 * s)]), Color("c9f6ff"))
	if pending or moving:
		# Posée ou déplacée ce tour : voile et mention, la carte se révélera pendant la révélation.
		Gfx.fill_round(self, r, rad, Color(0.05, 0.03, 0.02, 0.38))
		Gfx.text_fit(self, Data.font_bold, r.get_center() - Vector2(0, 10 * s), "déplacée" if moving else "posée", r.size.x - 10 * s, int(13 * s), Color("ffe6a8"), int(3 * s))
