extends Control
## Une carte, dessinée à la main comme celles de l'appli web : illustration (décor puis personnage) recadrée dans la fenêtre du gabarit,
## voile sombre en haut et en bas, filet de la famille, pièce de coût, médaillon de puissance, nom dans la police de la famille,
## texte d'effet (en main et en grand), bordure du niveau de la carte. Face cachée : le dos.

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
var in_hand := false        # carte de la main : texte d'effet affiché
var big := false            # carte en grand : texte plus long, reflet
var level := 1              # niveau d'aspect : 2 bronze, 3 argent, 4 or, 5 astral
var tilt := Vector2.ZERO:   # inclinaison (-1 à 1) : décalage du personnage et reflet, carte en grand
	set(v):
		tilt = v
		queue_redraw()
var glow := 0.0:            # halo animé (sélection, révélation)
	set(v):
		glow = v
		queue_redraw()

var persp := 0.0:           # 0 à plat (main, carte glissée), 1 en perspective (posée sur le plateau, voir Persp)
	set(v):
		persp = v
		if v > 0.0 and material == null:
			var m := ShaderMaterial.new()
			m.shader = PERSP_SHADER
			material = m
		if material:
			(material as ShaderMaterial).set_shader_parameter("amount", v)
var _text: RichTextLabel

const PERSP_SHADER := preload("res://shaders/persp.gdshader")


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	resized.connect(_on_resized)
	_update_text()


func set_data(d: Dictionary) -> void:
	uid = int(d.get("uid", -1))
	face_down = bool(d.get("hidden", false))
	id = "" if face_down else str(d.get("id", ""))
	revealed = bool(d.get("revealed", false))
	power = d.get("power")
	cost = d.get("cost")
	mobile = bool(d.get("mobile", false))
	_update_text()
	queue_redraw()


func _has_point(p: Vector2) -> bool:
	return Rect2(Vector2.ZERO, size).has_point(Persp.local_point(self, p) if persp > 0.5 else p)


func _gui_input(e: InputEvent) -> void:
	# Sur téléphone, Godot change les touchers en clics (emulate_mouse_from_touch, réglage par défaut).
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		pressed.emit(uid)
		accept_event()


func _process(_dt: float) -> void:
	# Bordure astrale : le dégradé tourne en continu.
	if level >= 5 and not face_down:
		queue_redraw()


func _on_resized() -> void:
	_update_text()
	queue_redraw()


## Texte d'effet (mots-clés en gras) : en main sur le bas de la carte, en grand sous le nom.
func _update_text() -> void:
	var show := (in_hand or big) and not face_down and id != ""
	if not show:
		if _text:
			_text.visible = false
		return
	if _text == null:
		_text = RichTextLabel.new()
		_text.bbcode_enabled = true
		_text.scroll_active = false
		_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_text.use_parent_material = true
		_text.add_theme_color_override("default_color", Color("f3e6cf"))
		_text.add_theme_constant_override("outline_size", 4)
		_text.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
		add_child(_text)
	var s := size.x / 100.0
	var d := Data.card(id)
	var body := str(d.get("text", ""))
	if body == "":
		body = " · ".join(d.get("kw", [])) if not d.get("kw", []).is_empty() else "Neutre"
	var fs := int(round((9.0 if big else 9.6) * s))
	_text.add_theme_font_override("normal_font", Data.font_body)
	_text.add_theme_font_override("bold_font", Data.font_bold)
	_text.add_theme_font_size_override("normal_font_size", fs)
	_text.add_theme_font_size_override("bold_font_size", fs)
	_text.text = Data.rich(body)
	_text.visible = true
	var top := 0.66 if not big else 0.7
	_text.position = Vector2(6 * s, size.y * top)
	_text.size = Vector2(size.x - 12 * s, size.y * (1.0 - top) - 5 * s)
	_text.clip_contents = true


func _draw() -> void:
	var r := Rect2(Vector2.ZERO, size)
	var s := size.x / 100.0
	var rad := 7.0 * s
	# Ombre portée douce, à l'opposé de la lampe (Mat.light, qui suit le doigt) ; plus longue pour une carte en main.
	var away := (get_global_rect().get_center() - Mat.light).normalized()
	var lift := (7.0 if in_hand or big else 4.0) * s
	for i in 3:
		var off := away * lift * (0.6 + 0.4 * i) + Vector2(0, lift * 0.4)
		Gfx.fill_round(self, Rect2(r.position + off, r.size).grow((2 - i) * 1.5 * s), rad + 2 * s, Color(0, 0, 0, 0.16))
	# Épaisseur : la tranche de la carte, visible sous le bord bas.
	Gfx.fill_round(self, Rect2(r.position + Vector2(0, 2.6 * s), r.size), rad, Color("3a2810"))
	Gfx.fill_round(self, Rect2(r.position + Vector2(0, 1.3 * s), r.size), rad, Color("7a5a2c"))
	if selected or glow > 0.0:
		var g := maxf(glow, 1.0 if selected else 0.0)
		var col: Color = Data.GOLD if face_down or selected else Data.fam_color(Data.card(id).get("fam"))
		for i in 4:
			var k := (4 - i) * 3.0 * s
			Gfx.fill_round(self, r.grow(k), rad + k, Color(col, 0.13 * g))
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
	var fam = d.get("fam")
	var fam_col: Color = Data.fam_color(fam)
	var creature: bool = d.get("type", "C") == "C"
	var decor := Data.layer(id, "decor")
	if decor:
		var uv := Gfx.cover_uv(decor, Data.WINDOW_UV, r.size, Vector2(0.5, 0.3))
		Gfx.tex_round(self, decor, r, uv.grow(-0.012 * tilt.length()) if big else uv, rad)
		var perso := Data.layer(id, "perso")
		if perso:
			# Le personnage glisse un peu plus que le décor quand la carte s'incline : effet de profondeur.
			var puv := uv
			if big:
				puv.position -= tilt * Vector2(0.025, 0.02)
			Gfx.tex_round(self, perso, r, puv, rad)
	else:
		# Pas encore d'illustration : visuel provisoire aux couleurs de la famille, comme dans l'appli.
		Gfx.fill_round(self, r, rad, fam_col.darkened(0.55))
		Gfx.shade_round(self, r, rad, 0.0, Color(fam_col, 0.5))
		Gfx.text_fit(self, Data.fam_font(fam), r.get_center() - Vector2(0, 12 * s), str(d.get("name", "?")).substr(0, 1), r.size.x, int(46 * s), Color(fam_col.lightened(0.3), 0.8))
	# Voile de l'appli : sombre en haut (nom), clair au milieu, très sombre en bas (texte).
	var text_card := in_hand or big
	Gfx.vgrad_round(self, r, rad, [0.0, 0.38, 0.58, 1.0],
		[0.55, 0.08, 0.22 if text_card else 0.1, 0.86 if text_card else 0.6] if not revealed or text_card else [0.5, 0.05, 0.1, 0.55])
	if big:
		_draw_shine(r, rad)
	# Filet de la famille en haut, cadre (bronze, argent, or, astral selon le niveau).
	Gfx.top_bar(self, r, rad, 4.5 * s, fam_col)
	_draw_frame(r, s, rad)
	var name_font := Data.fam_font(fam)
	var pw := int(power) if power != null else int(d.get("power", 0))
	var base := int(d.get("power", 0))
	var pcol := Data.UP if pw > base else Data.DOWN if pw < base else Color("ffe08a")
	if text_card:
		# Main : pièce de coût et médaillon de puissance en haut, nom dessous, texte en bas.
		var cs: String = "X" if d.get("x", false) else Data.num(cost if cost != null else d.get("cost", 0))
		Gfx.coin(self, Vector2(15 * s, 16 * s), 10.5 * s, cs, playable)
		if creature:
			Gfx.medal(self, Vector2(r.end.x - 16 * s, 17 * s), 12.5 * s, str(pw), pcol)
		else:
			Gfx.text_fit(self, Data.font_sc, Vector2(r.end.x - 17 * s, 15 * s), "SORT", 30 * s, int(9 * s), Color("e9dcff"), int(3 * s))
		Gfx.text_lines(self, name_font, Rect2(6 * s, 30 * s, r.size.x - 12 * s, 30 * s), str(d.get("name", "")), int(13 * s), Color("fff4dc"), 2, int(3 * s))
	else:
		# Plateau : nom en haut à gauche, puissance en bas à droite.
		Gfx.text_lines(self, name_font, Rect2(5 * s, 7 * s, r.size.x - 10 * s, 26 * s), str(d.get("name", "")), int(12.5 * s), Color("fff4dc"), 2, int(3 * s))
		if creature and revealed:
			Gfx.medal(self, Vector2(r.end.x - 15 * s, r.end.y - 15 * s), 12.5 * s, str(pw), pcol)
		elif not creature:
			Gfx.text_fit(self, Data.font_sc, Vector2(r.end.x - 18 * s, r.end.y - 12 * s), "SORT", 30 * s, int(9 * s), Color("e9dcff"), int(3 * s))
		if not revealed:
			var cs2: String = "X" if d.get("x", false) else Data.num(cost if cost != null else d.get("cost", 0))
			Gfx.coin(self, Vector2(r.end.x - 14 * s, r.end.y - 14 * s), 9.5 * s, cs2, true)
	if mobile and revealed:
		var m := Vector2(14 * s, r.end.y - 14 * s)
		Gfx.badge(self, m, 9.0 * s, Color("16323a"), Data.MINE, "", Color.WHITE)
		for k in [-1.0, 1.0]:
			var tip := m + Vector2(5.5 * s * k, 0)
			draw_line(m - Vector2(5.5 * s * k, 0), tip, Color("c9f6ff"), 1.6 * s, true)
			draw_colored_polygon(PackedVector2Array([tip + Vector2(1.5 * s * k, 0), tip - Vector2(2.2 * s * k, 2.6 * s), tip - Vector2(2.2 * s * k, -2.6 * s)]), Color("c9f6ff"))
	if pending or moving:
		# Posée ou déplacée ce tour : voile et mention, la carte se révélera pendant la révélation.
		Gfx.fill_round(self, r, rad, Color(0.05, 0.03, 0.02, 0.35))
		Gfx.dashed_round(self, r.grow(-1.5 * s), rad, Color(Data.MINE, 0.9), 2.0 * s)
		Gfx.text_fit(self, Data.font_bold, r.get_center(), "déplacée" if moving else "posée", r.size.x - 10 * s, int(13 * s), Color("ffe6a8"), int(3 * s))
	if in_hand and not playable:
		Gfx.fill_round(self, r, rad, Color(0.05, 0.03, 0.02, 0.5))


## Cadre : liseré sombre, puis la bordure du niveau (bronze, argent, or, astral qui tourne).
func _draw_frame(r: Rect2, s: float, rad: float) -> void:
	var w := 2.2 * s
	if level <= 1:
		Gfx.frame_round(self, r, rad, Color("8a6a3a"), w)
		Gfx.frame_round(self, r.grow(1), rad + 1, Color(0, 0, 0, 0.9), 1.0)
		return
	var stops: Array
	match level:
		2: stops = [Color("e7ad78"), Color("8a4f22"), Color("d08b50")]
		3: stops = [Color("ffffff"), Color("8d96a2"), Color("e3e8ee")]
		4: stops = [Color("ffe7a0"), Color("b07c0c"), Color("ffd45a")]
		_: stops = []
	var pts := Gfx.round_pts(r.grow(-w * 0.5), rad, 8)
	pts.append(pts[0])
	var cols := PackedColorArray()
	var c := r.get_center()
	var t := Time.get_ticks_msec() / 4000.0
	for p in pts:
		if stops.is_empty():
			# Astral : dégradé conique qui fait le tour en 4 s.
			var a := fposmod((p - c).angle() / TAU + t, 1.0)
			cols.append(Color.from_hsv(fposmod(0.93 + a * 0.8, 1.0), 0.55, 1.0))
		else:
			# Dégradé à 135° : clair en haut à gauche, sombre au milieu, clair en bas à droite.
			var k := clampf(((p.x - r.position.x) / r.size.x + (p.y - r.position.y) / r.size.y) * 0.5, 0.0, 1.0)
			cols.append(stops[0].lerp(stops[1], k / 0.55) if k < 0.55 else stops[1].lerp(stops[2], (k - 0.55) / 0.45))
	if level >= 4:
		var halo: Color = Color("e0aa28") if level == 4 else Color("a585e6")
		Gfx.frame_round(self, r.grow(1.5 * s), rad + 1.5 * s, Color(halo, 0.45), 2.0 * s)
	draw_polyline_colors(pts, cols, w * 1.4, true)


## Reflet de la carte en grand : une tache claire qui suit l'inclinaison, et un arc-en-ciel discret pour les niveaux or et astral.
func _draw_shine(r: Rect2, rad: float) -> void:
	var at := r.get_center() + Vector2(tilt.x, tilt.y) * r.size * 0.5
	var pts := Gfx.round_pts(r, rad, 8)
	var cols := PackedColorArray()
	for p in pts:
		cols.append(Color(1, 1, 1, 0.0))
	var poly := PackedVector2Array()
	var pc := PackedColorArray()
	for i in 24:
		var a := TAU * i / 24.0
		poly.append(at + Vector2(cos(a), sin(a)) * r.size.x * 0.55)
		pc.append(Color(1, 1, 1, 0.0))
	poly.append(at)
	pc.append(Color(1, 0.97, 0.9, 0.12))
	# Tache de lumière : un éventail de triangles du centre (opaque) au bord (transparent).
	for i in 24:
		var tri := PackedVector2Array([at, poly[i], poly[(i + 1) % 24]])
		var clipped := Geometry2D.intersect_polygons(tri, pts)
		for cp in clipped:
			var cc := PackedColorArray()
			for p in cp:
				cc.append(Color(1, 0.97, 0.9, 0.12 * clampf(1.0 - p.distance_to(at) / (r.size.x * 0.55), 0.0, 1.0)))
			draw_polygon(cp, cc)
	if level >= 4:
		# Bandes irisées en biais qui glissent avec l'inclinaison (feuille holographique de l'appli, en plus simple).
		var off := tilt.x * 0.45 + tilt.y * 0.2
		for i in 7:
			var k := fposmod(i / 7.0 + off, 1.0)
			var x := r.position.x - r.size.x * 0.5 + k * r.size.x * 2.0
			var band := PackedVector2Array([Vector2(x, r.position.y), Vector2(x + r.size.x * 0.12, r.position.y), Vector2(x + r.size.x * 0.12 - r.size.y * 0.47, r.end.y), Vector2(x - r.size.y * 0.47, r.end.y)])
			for cp in Geometry2D.intersect_polygons(band, pts):
				draw_colored_polygon(cp, Color.from_hsv(fposmod(i / 7.0 + off, 1.0), 0.6, 1.0, 0.09))
