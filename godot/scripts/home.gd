extends Control
## Accueil une fois connecté : profil (portrait, niveau, rang classé), illustration du thème, deck actif, bouton Jouer,
## choix du thème de l'interface. Tout est dessiné aux couleurs du thème (Look) ; changer de thème redessine l'accueil
## et s'enregistre sur le compte (PUT /api/cosmetics, comme la personnalisation de l'appli web).

signal play_requested
signal logout_requested

const Board := preload("res://scripts/board.gd")

var account := {}
var _avatar: Texture2D
var _play: Button
var _themes: Array = []        # [{ id, rect }]
var _msg := ""
var _busy := false


func _init(acc: Dictionary) -> void:
	account = acc
	_avatar = Board._decode_avatar(acc.get("avatar"))


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	_build()
	resized.connect(_build)


func _build() -> void:
	for c in get_children():
		c.queue_free()
	var w := size.x if size.x > 0 else 720.0
	var h := size.y if size.y > 0 else 1280.0
	_play = Board.gold_button("")
	_play.position = Vector2(60, h - 470)
	_play.size = Vector2(w - 120, 116)
	_play.pressed.connect(func(): play_requested.emit())
	add_child(_play)
	# Deux lignes sur le lingot : « Jouer » et le mode de jeu.
	var p: Dictionary = account.get("progress", {})
	var ai := str(p.get("ranked", {}).get("ai", ""))
	for line in [["Jouer", Data.font_title, 46, -16], ["Partie classée contre l'IA" + (" · " + ai if ai != "" else ""), Data.font_body, 21, 30]]:
		var l := Label.new()
		l.text = line[0]
		l.add_theme_font_override("font", line[1])
		l.add_theme_font_size_override("font_size", line[2])
		l.add_theme_color_override("font_color", Color("2a1606", 1.0 if line[2] > 30 else 0.8))
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		l.mouse_filter = Control.MOUSE_FILTER_IGNORE
		l.size = Vector2(_play.size.x, 60)
		l.position = Vector2(0, _play.size.y * 0.5 - 30 + line[3])
		_play.add_child(l)
		_play.button_down.connect(func(): l.position.y += 4)
		_play.button_up.connect(func(): l.position.y -= 4)
	var out := LinkButton.new()
	out.text = "Changer de compte"
	out.add_theme_font_size_override("font_size", 20)
	out.add_theme_color_override("font_color", Color(1, 0.9, 0.75, 0.55))
	out.position = Vector2(w * 0.5 - 90, h - 52)
	out.pressed.connect(func(): logout_requested.emit())
	add_child(out)
	queue_redraw()


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		for t in _themes:
			if (t.rect as Rect2).grow(6).has_point(e.position):
				_choose(t.id)
				accept_event()
				return


## Change le thème : tout de suite à l'écran, puis sur le compte. Refusé par le serveur : on revient au précédent.
func _choose(theme: String) -> void:
	if _busy or theme == Look.id:
		return
	_busy = true
	var before = Look.pick
	Look.pick = "base" if theme == "" else theme
	Look.apply(theme)
	Sfx.play("spell")
	_msg = ""
	_build()
	var d := await Net.api(HTTPClient.METHOD_PUT, "/api/cosmetics", {"theme": Look.pick})
	_busy = false
	if d.has("error"):
		Look.pick = before
		Look.apply(Look.resolve())
		_msg = str(d.error)
		_build()
	elif d.has("account"):
		account = d.account
	if get_parent() and get_parent().has_method("themed"):
		get_parent().themed()


func _draw() -> void:
	var w := size.x
	var h := size.y
	var p: Dictionary = account.get("progress", {})
	_draw_art(w, h)
	# —— Profil ——
	var band := Rect2(14, 14, w - 28, 118)
	Mat.fill(self, "leather", band, 16, Look.leather(Color(0.36, 0.25, 0.17)))
	Mat.stitch(self, band.grow(-10), 10)
	Mat.bevel(self, band, 16, 6.0)
	var ac := Vector2(78, 73)
	if _avatar:
		var r := Rect2(ac - Vector2(42, 42), Vector2(84, 84))
		Gfx.tex_round(self, _avatar, r, Rect2(0, 0, 1, 1), 42)
	else:
		draw_circle(ac, 42, Look.leather(Color("2a1d14")), true, -1.0, true)
		Gfx.text_fit(self, Data.font_title, ac, str(account.get("name", "?")).left(1).to_upper(), 70, 44, Data.GOLD, 0)
	Mat.bevel(self, Rect2(ac - Vector2(47, 47), Vector2(94, 94)), 47, 6.0)
	var name := str(account.get("name", ""))
	draw_string(Data.font_title, Vector2(136, 62), name, HORIZONTAL_ALIGNMENT_LEFT, 300, 32, Color(1, 0.95, 0.85))
	var lv := int(p.get("level", 1))
	var xp := float(p.get("xp", 0))
	var nx := maxf(1.0, float(p.get("xpNext", 1)))
	draw_string(Data.font_body, Vector2(136, 94), "Niveau %d" % lv, HORIZONTAL_ALIGNMENT_LEFT, -1, 21, Color(1, 0.9, 0.75, 0.8))
	var bar := Rect2(236, 81, 150, 14)
	Gfx.fill_round(self, bar, 7, Color(0, 0, 0, 0.5))
	Gfx.fill_round(self, Rect2(bar.position, Vector2(bar.size.x * clampf(xp / nx, 0.04, 1.0), bar.size.y)), 7, Data.GOLD)
	Gfx.frame_round(self, bar, 7, Color(Mat.BRASS, 0.8), 1.5)
	# Rang classé : médaillon et étoiles.
	var rk: Dictionary = p.get("ranked", {}).get("rank", {})
	if not rk.is_empty():
		var mc := Vector2(w - 100, 64)
		var tint := _rank_color(str(rk.get("id", "")))
		Mat.bevel(self, Rect2(mc - Vector2(34, 34), Vector2(68, 68)), 34, 7.0, tint.lerp(Mat.BRASS, 0.3), 1.0)
		draw_circle(mc, 27, Look.leather(Color("2a1d12")), true, -1.0, true)
		Gfx.text_fit(self, Data.font_title, mc + Vector2(0, -2), str(rk.get("division", "")), 44, 24, tint.lightened(0.3), 0)
		Gfx.text_fit(self, Data.font_title, mc + Vector2(-82, -10), str(rk.get("name", "")), 110, 19, Color(1, 0.94, 0.84), 0)
		for i in int(rk.get("max", 3)):
			var sc := mc + Vector2(-112 + i * 22, 16)
			_star(sc, 8.5, tint.lightened(0.25) if i < int(rk.get("stars", 0)) else Color(1, 1, 1, 0.18))
	# —— Titre ——
	var ty := h - 640
	Gfx.text_fit(self, Data.font_title, Vector2(w * 0.5, ty + 4), "Jeu de cartes", w - 80, 64, Color(0, 0, 0, 0.6), 0)
	Gfx.text_fit(self, Data.font_title, Vector2(w * 0.5, ty), "Jeu de cartes", w - 80, 64, Data.GOLD.lightened(0.25), 10, Color(0.1, 0.04, 0.02))
	var orn := Data.GOLD
	for s in [-1, 1]:
		var x0: float = w * 0.5 + s * 60
		draw_line(Vector2(x0, ty + 46), Vector2(x0 + s * 170.0, ty + 46), Color(orn, 0.7), 2.0, true)
		draw_circle(Vector2(x0 + s * 178, ty + 46), 4, orn, true, -1.0, true)
	draw_colored_polygon(PackedVector2Array([Vector2(w * 0.5, ty + 38), Vector2(w * 0.5 + 9, ty + 46), Vector2(w * 0.5, ty + 54), Vector2(w * 0.5 - 9, ty + 46)]), orn)
	# —— Deck actif ——
	var deck: Dictionary = account.get("deck", {}) if account.get("deck") is Dictionary else {}
	var dr := Rect2(60, h - 570, w - 120, 84)
	Mat.fill(self, "leather", dr, 14, Look.leather(Color(0.3, 0.21, 0.15)))
	Mat.bevel(self, dr, 14, 4.0, Mat.BRASS.darkened(0.15), 0.7)
	var gid = deck.get("general")
	if gid != null:
		Gfx.portrait(self, gid, Vector2(dr.position.x + 46, dr.get_center().y), 30, Mat.BRASS)
	draw_string(Data.font_body, Vector2(dr.position.x + 92, dr.position.y + 34), "Deck", HORIZONTAL_ALIGNMENT_LEFT, -1, 19, Color(1, 0.9, 0.75, 0.6))
	draw_string(Data.font_title, Vector2(dr.position.x + 92, dr.position.y + 64), str(deck.get("name", "Deck de départ")), HORIZONTAL_ALIGNMENT_LEFT, dr.size.x - 110, 25, Color(1, 0.95, 0.85))
	if gid != null:
		var gname := str(Data.generals.get(str(gid), {}).get("name", ""))
		draw_string(Data.font_body, Vector2(dr.end.x - 18 - Data.font_body.get_string_size(gname, HORIZONTAL_ALIGNMENT_LEFT, -1, 19).x, dr.position.y + 34), gname, HORIZONTAL_ALIGNMENT_LEFT, -1, 19, Color(Data.GOLD, 0.85))
	var pr := Rect2(_play.position, _play.size)
	var rkd: Dictionary = p.get("ranked", {})
	if rkd.has("games"):
		var line := "%d parties classées · %d victoires" % [int(rkd.games), int(rkd.get("wins", 0))]
		if int(rkd.get("streak", 0)) > 1:
			line += " · série de %d" % int(rkd.streak)
		Gfx.text_fit(self, Data.font_body, Vector2(w * 0.5, pr.end.y + 26), line, w - 80, 19, Color(1, 0.92, 0.8, 0.6), 0)
	# —— Thèmes ——
	_draw_themes(w, h)
	if _msg != "":
		Gfx.text_fit(self, Data.font_body, Vector2(w * 0.5, h - 86), _msg, w - 60, 19, Color("ff9c8f"), 4)


## Illustration du thème en haut de l'écran, fondue dans la nuit ; sinon une lueur de la couleur du thème.
func _draw_art(w: float, h: float) -> void:
	var art := Look.art()
	if art.is_empty():
		# Pas d'illustration pour ce thème : celle du général du deck actif.
		var deck = account.get("deck")
		if deck is Dictionary and deck.get("general") != null:
			art = [Data.layer(deck.general, "decor"), Data.layer(deck.general, "perso")]
	var top := Rect2(0, 0, w, h * 0.62)
	if art.size() == 2 and art[0]:
		var uv := Gfx.cover_uv(art[0], Rect2(0, 0, 1, 1), top.size, Vector2(0.5, 0.3))
		draw_texture_rect_region(art[0], top, Rect2(uv.position * art[0].get_size(), uv.size * art[0].get_size()), Color(0.75, 0.72, 0.7))
		if art[1]:
			draw_texture_rect_region(art[1], top, Rect2(uv.position * art[1].get_size(), uv.size * art[1].get_size()))
	else:
		for i in 4:
			draw_circle(Vector2(w * 0.5, h * 0.3), 420 - i * 90, Color(Look.accent, 0.04 + i * 0.015), true, -1.0, true)
	# Fondu vers le fond, en bas de l'illustration, et voile en haut sous le profil.
	var b := Look.bg
	var y0 := top.end.y - 360
	draw_polygon(PackedVector2Array([Vector2(0, y0), Vector2(w, y0), Vector2(w, top.end.y), Vector2(0, top.end.y)]),
		PackedColorArray([Color(b, 0), Color(b, 0), Color(b, 1), Color(b, 1)]))
	draw_rect(Rect2(0, top.end.y, w, h - top.end.y), b)
	draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(w, 0), Vector2(w, 200), Vector2(0, 200)]),
		PackedColorArray([Color(0, 0, 0, 0.55), Color(0, 0, 0, 0.55), Color(0, 0, 0, 0), Color(0, 0, 0, 0)]))
	# Lueur du thème au pied de l'écran.
	for i in 3:
		draw_circle(Vector2(w * 0.5, h + 120), 520 - i * 140, Color(Look.accent, 0.035), true, -1.0, true)


## Rangée de médaillons, un par thème débloqué ; le choisi est serti de laiton et nommé.
func _draw_themes(w: float, h: float) -> void:
	_themes.clear()
	var list := Look.choices()
	var y := h - 200
	Gfx.text_fit(self, Data.font_sc, Vector2(w * 0.5, y - 62), "Thème · " + Look.name_of(Look.id), w - 60, 22, Color(1, 0.92, 0.8, 0.85), 0)
	var rad := 30.0
	var gap := 22.0
	var n := list.size()
	var x0 := w * 0.5 - (n * rad * 2 + (n - 1) * gap) * 0.5 + rad
	for i in n:
		var id: String = list[i]
		var t: Dictionary = Look.THEMES[id]
		var c := Vector2(x0 + i * (rad * 2 + gap), y)
		var on := id == Look.id
		_themes.append({"id": id, "rect": Rect2(c - Vector2(rad, rad), Vector2(rad, rad) * 2)})
		if on:
			for k in 3:
				draw_circle(c, rad + 8 + k * 5, Color(Color(t.accent), 0.08), true, -1.0, true)
		# Pastille : fond du thème, demi-lune de cuir, éclat de la couleur d'accent.
		draw_circle(c, rad, Color(t.bg).lightened(0.1), true, -1.0, true)
		draw_circle(c + Vector2(0, rad * 0.35), rad * 0.72, Color(t.leather).lightened(0.15), true, -1.0, true)
		draw_circle(c + Vector2(-rad * 0.3, -rad * 0.3), rad * 0.34, Color(t.accent), true, -1.0, true)
		draw_circle(c + Vector2(rad * 0.32, -rad * 0.12), rad * 0.18, Color(t.mist), true, -1.0, true)
		var ring := Color(t.gold)
		if on:
			Mat.bevel(self, Rect2(c - Vector2(rad + 5, rad + 5), Vector2(rad + 5, rad + 5) * 2), rad + 5, 6.0, ring.lerp(Color("c8962e"), 0.3), 1.0)
		else:
			draw_arc(c, rad, 0, TAU, 40, Color(ring, 0.6), 2.0, true)
	if n <= 1:
		Gfx.text_fit(self, Data.font_body, Vector2(w * 0.5, y + 50), "D'autres thèmes se gagnent dans l'appli : passe de saison, boutique, succès.", w - 60, 17, Color(1, 0.9, 0.75, 0.5), 0)


func _star(c: Vector2, r: float, col: Color) -> void:
	var pts := PackedVector2Array()
	for i in 10:
		var a := -PI * 0.5 + i * PI / 5.0
		pts.append(c + Vector2(cos(a), sin(a)) * (r if i % 2 == 0 else r * 0.45))
	draw_colored_polygon(pts, col)


func _rank_color(id: String) -> Color:
	return {"bronze": Color("c8814a"), "argent": Color("c8d0d8"), "or": Color("f0c24a"), "platine": Color("7ad8d0"),
		"diamant": Color("8ab8ff"), "maitre": Color("c08aff"), "legende": Color("ff7a6a")}.get(id, Mat.BRASS)
