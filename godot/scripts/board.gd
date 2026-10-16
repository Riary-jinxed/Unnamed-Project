extends Control
## Plateau d'une partie : affiche la vue envoyée par le serveur (message « state ») et prépare le plan du tour.
## Comme l'appli web, rien n'est décidé ici : le serveur applique le plan (applyPlan) et renvoie chaque étape de la révélation.
## La mise en page suit celle de l'appli : barre du haut (tour, son, journal), adversaire, trois zones, main, puis le bas d'écran
## (votre général, vos sceaux, « Valider le tour »).

signal new_game_requested
signal quit_requested
signal shot_requested(name: String)

const CardView := preload("res://scripts/card_view.gd")
const ZoneView := preload("res://scripts/zone_view.gd")

const TOP_H := 52.0
const FOE_H := 92.0
const HEAD_H := TOP_H + FOE_H
const DOCK_H := 132.0
const BOARD_K := 0.8         # échelle du plateau tout en haut (perspective)
const DOUBLE_TAP := 0.35
const LONG_PRESS := 0.45

var view: Dictionary = {}
var auto_play := false
var drag_test := false

# Préparation du tour en cours.
var pending: Array = []     # [{ uid, zone, cost }] cartes posées face cachée, dans l'ordre de pose
var moves: Array = []       # [{ uid, zone, from }]
var gen_zone := -1          # zone où le général est activé (-1 : non)
var gen_arming := false     # le général attend qu'on touche une zone
var sel_hand := -1
var sel_move := -1
var plan_turn := 0

var cards := {}             # uid → CardView, main et plateau
var was_revealed := {}      # uid → true : révélées à la vue précédente
var last_power := {}        # uid → puissance à la vue précédente
var zones: Array = []
var card_size := Vector2(100, 140)
var hand_card := Vector2(152, 208)
var _hand_y := 900.0
var _avatar_tex := [null, null]
var _light_target := Vector2(360, 160)   # la lampe (Mat.light) glisse vers le dernier toucher, puis dérive doucement
var _light_touch := -10.0    # images de profil des deux sièges (envoyées une fois par le serveur)

var bg: ColorRect
var hud: Control
var card_layer: Control
var fx_layer: Control
var end_btn: Button
var gen_btn: Button
var snd_btn: Button
var log_btn: Button
var quit_btn: Button
var log_label: Label
var detail: Control
var over_panel: Control
var confirm: Control
var journal: Control
var _last_phase := ""
var _last_turn := 0
var _prev_me := {}
var _sounds := {}           # bruitages à jouer à la fin de la mise à jour (un de chaque)
var _drag := {}             # carte touchée : { uid, start, offset, on, t, last }
var _last_tap := {"uid": -1, "t": 0.0}
var _trail: CPUParticles2D
var _time := 0.0
var _pool_alpha := [0.0, 0.0, 0.0]
var _shake := 0.0
var _shake_amp := 0.0
var _events: Array = []     # effets de l'étape en cours : { kind, cv, delta } (voir _play_events)
var _just_revealed := {}    # uid → true : cartes retournées par cette étape


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg = ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://shaders/table.gdshader")
	Look.table(mat)
	bg.material = mat
	add_child(bg)
	add_child(preload("res://scripts/decor.gd").new())
	_add_embers()
	if Look.frame == "neon":
		# Néon 2099 : lignes de balayage d'écran par-dessus tout, sans gêner le toucher (comme cyber.css).
		var scan := ColorRect.new()
		scan.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		scan.mouse_filter = Control.MOUSE_FILTER_IGNORE
		scan.z_index = 300
		var sm := ShaderMaterial.new()
		sm.shader = preload("res://shaders/scanlines.gdshader")
		scan.material = sm
		add_child(scan)
	# En-têtes dessinés au-dessus du fond et sous les cartes.
	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	hud.draw.connect(func(): _draw_hud(hud))
	add_child(hud)
	for z in 3:
		var zv := ZoneView.new()
		zv.zone = z
		zv.tapped.connect(_on_zone_tapped)
		add_child(zv)
		zones.append(zv)

	log_label = Label.new()
	log_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	log_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	log_label.clip_text = true
	log_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	log_label.add_theme_font_size_override("font_size", 17)
	log_label.add_theme_color_override("font_color", Color(1, 0.93, 0.8, 0.8))
	log_label.add_theme_constant_override("outline_size", 4)
	log_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	log_label.mouse_filter = Control.MOUSE_FILTER_STOP
	log_label.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			_show_journal())
	add_child(log_label)

	gen_btn = Button.new()
	gen_btn.flat = true
	gen_btn.focus_mode = Control.FOCUS_NONE
	gen_btn.pressed.connect(_on_general)
	add_child(gen_btn)
	end_btn = gold_button("Valider le tour")
	end_btn.pressed.connect(_send_plan)
	add_child(end_btn)
	snd_btn = plate_button("")
	snd_btn.pressed.connect(func():
		Sfx.set_sound(not Sfx.sound_on)
		snd_btn.queue_redraw())
	snd_btn.draw.connect(func(): _draw_speaker(snd_btn))
	add_child(snd_btn)
	log_btn = plate_button("Journal")
	log_btn.add_theme_font_size_override("font_size", 19)
	log_btn.pressed.connect(_show_journal)
	add_child(log_btn)
	quit_btn = plate_button("")
	quit_btn.draw.connect(func(): _draw_door(quit_btn))
	quit_btn.pressed.connect(_ask_quit)
	add_child(quit_btn)

	card_layer = Control.new()
	card_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(card_layer)
	fx_layer = Control.new()
	fx_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fx_layer.z_index = 140      # effets et bandeaux au-dessus des cartes, sous les panneaux
	fx_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(fx_layer)
	_trail = Fx.trail()
	fx_layer.add_child(_trail)
	resized.connect(_layout)
	_layout()


## Bouton doré « lingot », comme « Valider le tour » dans l'appli.
static func gold_button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", Look.title_font())
	b.add_theme_font_size_override("font_size", 24)
	for st in ["normal", "hover", "pressed", "disabled"]:
		var sb := StyleBoxTexture.new()
		sb.texture = _ingot(st)
		sb.set_texture_margin_all(18)
		sb.content_margin_left = 14
		sb.content_margin_right = 14
		if st == "pressed":
			sb.content_margin_top = 4
		b.add_theme_stylebox_override(st, sb)
	b.add_theme_color_override("font_color", Color("2a1606"))
	b.add_theme_color_override("font_hover_color", Color("2a1606"))
	b.add_theme_color_override("font_pressed_color", Color("1a0c02"))
	b.add_theme_color_override("font_disabled_color", Color("c8b496"))
	b.button_down.connect(func(): Sfx.feel("turn"))
	return b


## Dégradé du lingot (#fff0b8, #f0c25c, #c8902f, #8f5f1c) dessiné une fois dans une petite texture.
static func _ingot(state: String) -> Texture2D:
	var img := Image.create(64, 64, false, Image.FORMAT_RGBA8)
	var stops := [Color("fff0b8"), Color("f0c25c"), Color("c8902f"), Color("8f5f1c")]
	if state == "disabled":
		stops = [Color("6a5a48"), Color("54442f"), Color("43331f"), Color("2e2214")]
	elif state == "pressed":
		stops = [Color("e8cf8a"), Color("d4a446"), Color("a97626"), Color("6e4714")]
	elif state == "hover":
		stops = [Color("fff6d0"), Color("f6cd6c"), Color("d29a37"), Color("9a6720")]
	if Look.frame == "neon" and state != "disabled":
		stops = [Color("fff35a"), Color("fcee0a"), Color("e8da00"), Color("8a7f00")]
		if state == "pressed":
			stops = [Color("e8da30"), Color("d8c800"), Color("b8aa00"), Color("6a6000")]
	elif Look.id != "" and state != "disabled":
		# Lingot aux couleurs du thème : reflet clair, or du thème, puis son ombre.
		var g := Look.accent.lerp(Data.GOLD, 0.4)
		stops = [g.lerp(Color.WHITE, 0.6), g, g.darkened(0.25), Data.GOLD_DARK]
		if state == "pressed":
			stops = [stops[0].darkened(0.1), g.darkened(0.12), g.darkened(0.35), Data.GOLD_DARK.darkened(0.2)]
		elif state == "hover":
			stops = [stops[0].lightened(0.1), g.lightened(0.08), g.darkened(0.18), Data.GOLD_DARK]
	for y in 64:
		var t := y / 63.0
		var col: Color = stops[0].lerp(stops[1], t / 0.3) if t < 0.3 else stops[1].lerp(stops[2], (t - 0.3) / 0.4) if t < 0.7 else stops[2].lerp(stops[3], (t - 0.7) / 0.3)
		for x in 64:
			var d := Vector2(minf(x, 63 - x), minf(y, 63 - y))
			var corner := 14.0
			var inside := true
			if Look.frame == "neon":   # plaque signalétique à coins coupés
				inside = (63 - x) + y >= corner and x + (63 - y) >= corner
			elif d.x < corner and d.y < corner:
				inside = Vector2(corner - d.x, corner - d.y).length() <= corner
			var edge := minf(d.x, d.y)
			var c := col
			if edge < 2.0:
				c = Color("2a1606") if state != "disabled" else Color("1e160e")
			elif edge < 3.5 and y < 32:
				c = c.lightened(0.35)
			img.set_pixel(x, y, c if inside else Color(0, 0, 0, 0))
	return ImageTexture.create_from_image(img)


## Bouton « plaque de bronze » de l'appli (barre du haut, panneaux).
static func plate_button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", Data.font_body)
	b.add_theme_font_size_override("font_size", 22)
	# Plaque de cuir sertie de laiton (Mat.plate_texture), enfoncée quand on appuie.
	for st in ["normal", "hover", "pressed", "disabled"]:
		var sb := StyleBoxTexture.new()
		sb.texture = Mat.plate_texture(st)
		sb.set_texture_margin_all(18)
		sb.content_margin_left = 16
		sb.content_margin_right = 16
		sb.content_margin_top = 4 if st == "pressed" else 2
		b.add_theme_stylebox_override(st, sb)
	b.add_theme_color_override("font_color", Color("f1e6cf"))
	b.add_theme_color_override("font_hover_color", Color("fff4dc"))
	b.add_theme_color_override("font_pressed_color", Color("e3d4b8"))
	return b


func _redraw() -> void:
	if hud:
		hud.queue_redraw()


# ————— Mise en page —————

func _hand_top() -> float:
	return _hand_y


func _layout() -> void:
	var w := size.x
	var h := size.y
	# Plateau de taille fixe, réglée sur des cartes à deux par rangée : la hauteur en plus d'un grand téléphone va
	# à la main (cartes plus grandes), pas aux zones. Les zones sont mises en page à plat puis la perspective (Persp)
	# les ramène à l'écran, plus étroites et plus petites vers l'adversaire.
	var col_w := (w - 12 - 10) / 3.0
	var cw := (col_w - 22 - 5) * 0.5
	var ch := cw * 1.4
	var hf_need := 2.0 * (2.0 * ch + 5 + 30 + 18) + ZoneView.STRIP
	var hs_need := hf_need * (1.0 - BOARD_K) / log(1.0 / BOARD_K)
	var top := HEAD_H + 10
	var fixed := top + 24 + 14 + DOCK_H
	var hand_h := clampf(h - fixed - hs_need, 196, 250)
	hand_card = Vector2(round(hand_h / 1.37), hand_h)
	_hand_y = h - DOCK_H - 12 - hand_h
	var avail := h - fixed - hand_h
	var hs := minf(hs_need, avail)
	var board_top := top + maxf(0.0, (avail - hs) * 0.35)
	var hf := Persp.setup(board_top, hs, w * 0.5, BOARD_K)
	for z in zones.size():
		var zv: Control = zones[z]
		zv.position = Vector2(6 + z * (col_w + 5), board_top)
		zv.size = Vector2(col_w, hf)
	var half := (hf - ZoneView.STRIP) * 0.5
	ch = minf(ch, (half - 30 - 5 - 18) * 0.5)
	card_size = Vector2(ch / 1.4, ch)
	log_label.position = Vector2(20, board_top + hs + 2)
	log_label.size = Vector2(w - 40, 24)
	var dy := size.y - DOCK_H
	end_btn.size = Vector2(280, 76)
	end_btn.position = Vector2(w - 280 - 12, dy + (DOCK_H - 76) * 0.5 + 4)
	gen_btn.position = Vector2(6, dy + 10)
	gen_btn.size = Vector2(250, DOCK_H - 16)
	snd_btn.size = Vector2(46, 40)
	snd_btn.position = Vector2(10, 6)
	log_btn.size = Vector2(0, 40)
	log_btn.reset_size()
	log_btn.size.y = 40
	log_btn.position = Vector2(64, 6)
	quit_btn.size = Vector2(46, 40)
	quit_btn.position = Vector2(w - 46 - 10, 6)
	(bg.material as ShaderMaterial).set_shader_parameter("size", size)
	if not view.is_empty():
		_place_cards(false)
	_redraw()


# ————— Vue reçue —————

func set_view(v: Dictionary) -> void:
	var first := view.is_empty()
	var prev := view
	view = v
	var phase := str(v.get("phase", "plan"))
	var turn := int(v.get("turn", 1))
	if phase != "plan" or turn != plan_turn:
		pending.clear()
		moves.clear()
		gen_zone = -1
		gen_arming = false
		sel_hand = -1
		sel_move = -1
		plan_turn = turn
	var old_me: Dictionary = _prev_me
	if v.get("avatars") is Array:
		for i in mini(2, v.avatars.size()):
			_avatar_tex[i] = _decode_avatar(v.avatars[i])
	_prev_me = me()
	_events.clear()
	_just_revealed.clear()
	var zone_before := zones.map(func(zv): return [zv.my_power, zv.foe_power])
	_sync_cards(first)
	_place_cards(not first)
	_update_zones(first)
	_update_controls()
	_update_log()
	# Source de l'étape : la carte qui agit (flash du serveur), ou un général qui vient de se déclencher.
	var src = null
	var src_delay := 0.0
	var src_col := Data.GOLD
	var style := "bolt"
	if not first and not old_me.is_empty():
		if bool(me().get("generalUsed", false)) and not bool(old_me.get("generalUsed", false)):
			_sound("general", "general")
			src = _general_fx(true)
			src_delay = 0.5
			src_col = Data.fam_color(_general().get("fam"))
			style = Data.fx_style(me().get("general"), true)
	if not first and not prev.is_empty() and bool(foe().get("generalUsed", false)) and not bool(prev.get("foe", {}).get("generalUsed", false)):
		src = _general_fx(false)
		src_delay = 0.5
		src_col = Data.fam_color(Data.generals.get(str(foe().get("general", "")), {}).get("fam"))
		style = Data.fx_style(foe().get("general"), true)
	var fl = v.get("flash")
	if fl != null and cards.has(int(fl)) and src == null:
		var scv: CardView = cards[int(fl)]
		var t := _target_of(scv.get_meta("place"))
		src = _scr(t.pos + t.size * 0.5, t.persp > 0.5)
		src_delay = 0.62 if _just_revealed.has(int(fl)) else 0.05
		src_col = Data.fam_color(Data.card(scv.id).get("fam"))
		style = Data.fx_style(scv.id)
		if not _just_revealed.has(int(fl)) and not _events.is_empty():
			_act_pulse(scv)
		_events = _events.filter(func(ev): return ev.cv != scv)
	if not first:
		_play_events(src, src_delay, src_col, zone_before, style)
		_play_rolls(prev, src_delay)
	if phase != _last_phase or turn != _last_turn:
		if phase == "reveal" and _last_phase == "plan":
			_banner("Révélation", "Les cartes se retournent", Data.FOE)
			_flash(Data.FOE, 0.18)
		elif phase == "plan":
			var last := turn >= int(v.get("turns", 7))
			_banner("Dernier tour" if last else "Tour %d" % turn, "sur %d" % int(v.get("turns", 7)), Color("f07a66") if last else Look.edge)
			_sound("turn", "turn")
		elif phase == "over":
			_game_over()
	_flush_sounds()
	_last_phase = phase
	_last_turn = turn
	_redraw()
	if auto_play:
		_auto_step()


## Image de profil envoyée en data URL (png, jpeg ou webp, voir server/src/accounts.js).
static func _decode_avatar(url) -> Texture2D:
	if not url is String or not str(url).begins_with("data:image/"):
		return null
	var comma := str(url).find(",")
	var buf := Marshalls.base64_to_raw(str(url).substr(comma + 1))
	var img := Image.new()
	var kind := str(url).substr(11, comma - 11)
	var err := img.load_png_from_buffer(buf) if kind.begins_with("png") else img.load_jpg_from_buffer(buf) if kind.begins_with("jpeg") else img.load_webp_from_buffer(buf)
	return ImageTexture.create_from_image(img) if err == OK else null


func me() -> Dictionary:
	return view.get("me", {})


func foe() -> Dictionary:
	return view.get("foe", {})


func _seat() -> int:
	return int(view.get("seat", 0))


func _badge(mine: bool):
	var b: Array = view.get("badges", [])
	var i := _seat() if mine else 1 - _seat()
	return b[i] if i < b.size() else null


func _can_plan() -> bool:
	return str(view.get("phase", "")) == "plan" and not bool(view.get("ready", {}).get("me", false)) and view.get("result") == null


## Toutes les cartes visibles : main (moins celles posées ce tour) et les deux plateaux, avec leur place.
func _layout_list() -> Array:
	var out: Array = []
	var pend_uids := pending.map(func(p): return p.uid)
	var move_of := {}
	for m in moves:
		move_of[m.uid] = m
	# Plateau de l'adversaire.
	var fb: Array = foe().get("board", [[], [], []])
	for z in 3:
		var i := 0
		for c in fb[z]:
			out.append({"d": c, "where": "zone", "mine": false, "zone": z, "slot": i})
			i += 1
	# Votre plateau, déplacements prévus compris, puis les cartes posées ce tour.
	var counts := [0, 0, 0]
	var mb: Array = me().get("board", [[], [], []])
	var placed: Array = [[], [], []]
	for z in 3:
		for c in mb[z]:
			var uid := int(c.uid)
			var dest: int = move_of[uid].zone if move_of.has(uid) else z
			placed[dest].append({"d": c, "moving": move_of.has(uid)})
	for p in pending:
		var hc := _hand_card(p.uid)
		if not hc.is_empty():
			placed[p.zone].append({"d": hc, "pending": true})
	for z in 3:
		for e in placed[z]:
			out.append({"d": e.d, "where": "zone", "mine": true, "zone": z, "slot": counts[z], "moving": e.get("moving", false), "pending": e.get("pending", false)})
			counts[z] += 1
	# Main.
	var hand: Array = me().get("hand", []).filter(func(c): return not pend_uids.has(int(c.uid)))
	for i in hand.size():
		out.append({"d": hand[i], "where": "hand", "index": i, "count": hand.size()})
	return out


func _hand_card(uid: int) -> Dictionary:
	for c in me().get("hand", []):
		if int(c.uid) == uid:
			return c
	return {}


func _sync_cards(quiet := false) -> void:
	var seen := {}
	var deal_i := 0
	for e in _layout_list():
		var uid := int(e.d.uid)
		seen[uid] = true
		var cv: CardView = cards.get(uid)
		var fresh := cv == null
		if fresh:
			cv = CardView.new()
			cv.pressed.connect(_on_card_pressed)
			card_layer.add_child(cv)
			cards[uid] = cv
			# Une carte qui arrive : de la pioche (main, en tournant), du haut de l'écran (adversaire).
			if e.where == "hand":
				cv.size = hand_card
				cv.position = Vector2(size.x + 60, _hand_top() + 40)
				cv.rotation = 0.5
				cv.set_meta("delay", 0.07 * deal_i)
				deal_i += 1
				if not quiet:
					_sound("draw")
			else:
				if not quiet and not e.mine:
					_sound("deal")
				cv.size = card_size
				cv.position = Vector2(size.x * 0.5 - card_size.x * 0.5, -card_size.y - 20) if not e.mine else Vector2(size.x * 0.5, size.y)
				cv.rotation = -0.18 if not e.mine else 0.0
				cv.persp = 1.0
				cv.set_meta("delay", 0.09 * deal_i)
				deal_i += 1
				if not quiet and bool(e.d.get("revealed", false)) and str(view.get("phase", "")) == "reveal":
					# Invoquée par un effet : elle apparaît sur place (voir _impact, « summon »).
					var t := _target_of(e)
					cv.size = t.size
					cv.position = t.pos
					cv.rotation = 0.0
					cv.persp = 1.0
					cv.pivot_offset = t.size * 0.5
					cv.scale = Vector2(0.01, 0.01)
					cv.set_meta("summon", true)
		var was_face_down := cv.face_down
		var had := was_revealed.has(uid)
		cv.in_hand = e.where == "hand"
		cv.set_data(e.d)
		var cid = e.d.get("id")
		cv.level = Data.level_of(_badge(e.mine if e.where == "zone" else true), cid) if cid != null else 1
		# Posée ce tour : par vous en ce moment, ou déjà envoyée et en attente de la révélation.
		cv.pending = e.get("pending", false) or (e.where == "zone" and e.mine and not bool(e.d.get("revealed", false)))
		cv.moving = e.get("moving", false)
		cv.selected = uid == sel_hand or uid == sel_move
		cv.playable = e.where != "hand" or _affordable(e.d) or not _can_plan()
		var now_revealed := bool(e.d.get("revealed", false))
		if now_revealed and not had and not fresh:
			_just_revealed[uid] = true
			_reveal_fx(cv, was_face_down)
			var spell: bool = Data.card(e.d.get("id", "")).get("type", "C") == "S"
			_sound("spell" if spell else "reveal" if e.mine else "revealFoe", "spell" if spell else "place")
			if cv.level >= 5:
				_sound("astral", "astral")
		elif now_revealed and had and last_power.has(uid) and e.d.get("power") != null and int(e.d.power) != int(last_power[uid]):
			_events.append({"kind": "power", "cv": cv, "delta": int(e.d.power) - int(last_power[uid]), "mine": e.mine})
		elif fresh and not quiet and e.where == "zone" and now_revealed:
			# Créature invoquée pendant la révélation (jeton, œuf qui éclot…).
			_events.append({"kind": "summon", "cv": cv})
		elif fresh and not quiet and e.where == "hand" and str(view.get("phase", "")) == "reveal":
			_events.append({"kind": "draw", "cv": cv})
		elif not fresh and e.where == "zone" and now_revealed and cv.has_meta("place") and cv.get_meta("place").get("zone", -1) != e.zone and str(view.get("phase", "")) == "reveal":
			_events.append({"kind": "move", "cv": cv})
		if now_revealed:
			was_revealed[uid] = true
			last_power[uid] = e.d.get("power", 0)
		cv.set_meta("place", e)
	for uid in cards.keys():
		if not seen.has(uid):
			var cv: CardView = cards[uid]
			cards.erase(uid)
			var gone: Dictionary = cv.get_meta("place")
			if was_revealed.has(uid) and gone.where == "zone" and not quiet:
				if Data.card(cv.id).get("type", "C") == "C":
					_events.append({"kind": "destroy", "cv": cv})
				else:
					_spell_out(cv)
			else:
				var tw := cv.create_tween()
				tw.tween_property(cv, "modulate:a", 0.0, 0.3)
				tw.tween_callback(cv.queue_free)
			was_revealed.erase(uid)


func _target_of(e: Dictionary) -> Dictionary:
	if e.where == "hand":
		# Main en éventail : les cartes se chevauchent, tournent autour d'un point sous l'écran ; la carte choisie se lève.
		var n: int = e.count
		var cw := hand_card.x
		var step := minf(cw * 0.86, (size.x - 24 - cw) / maxf(n - 1, 1))
		var x0 := (size.x - (step * (n - 1) + cw)) * 0.5
		var t: float = e.index - (n - 1) * 0.5
		var rot := t * minf(0.075, 0.36 / maxf(n - 1, 1))
		var x: float = x0 + e.index * step
		if int(e.d.uid) == sel_hand:
			return {"pos": Vector2(x, _hand_top() - 30), "size": hand_card, "rot": 0.0, "z": 60, "scale": 1.08, "persp": 0.0}
		return {"pos": Vector2(x, _hand_top() + 8 + 700.0 * (1.0 - cos(rot))), "size": hand_card, "rot": rot, "z": 20 + e.index, "scale": 1.0, "persp": 0.0}
	var zv: Control = zones[e.zone]
	var r: Rect2 = zv.slot_rect(e.mine, e.slot, card_size)
	return {"pos": zv.position + r.position, "size": card_size, "rot": 0.0, "z": 2 + e.slot, "scale": 1.0, "persp": 1.0}


func _place_cards(animate: bool) -> void:
	for uid in cards:
		var cv: CardView = cards[uid]
		if not _drag.is_empty() and _drag.on and _drag.uid == uid:
			continue
		var e: Dictionary = cv.get_meta("place")
		var t := _target_of(e)
		cv.z_index = t.z
		cv.pivot_offset = t.size * 0.5
		if animate:
			var delay: float = cv.get_meta("delay", 0.0)
			cv.set_meta("delay", 0.0)
			var tw := cv.create_tween().set_parallel().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			tw.tween_property(cv, "position", t.pos, 0.38).set_delay(delay)
			tw.tween_property(cv, "size", t.size, 0.38).set_delay(delay)
			tw.tween_property(cv, "rotation", t.rot, 0.38).set_delay(delay)
			tw.tween_property(cv, "persp", t.persp, 0.38).set_delay(delay)
			if not cv.has_meta("summon"):
				tw.tween_property(cv, "scale", Vector2.ONE * t.scale, 0.18).set_delay(delay)
		else:
			cv.position = t.pos
			cv.size = t.size
			cv.rotation = t.rot
			cv.persp = t.persp
			cv.scale = Vector2.ONE * t.scale


func _update_zones(quiet := false) -> void:
	var mt: Array = me().get("terrains", [null, null, null])
	var ft: Array = foe().get("terrains", [null, null, null])
	var mp: Array = me().get("zonePower", [0, 0, 0])
	var fp: Array = foe().get("zonePower", [0, 0, 0])
	for z in 3:
		var zv = zones[z]
		if not quiet and ((mt[z] != null and zv.my_terrain != mt[z]) or (ft[z] != null and zv.foe_terrain != ft[z])):
			_sound("terrain", "terrain")
		zv.my_terrain = mt[z]
		zv.foe_terrain = ft[z]
		var before: int = zv.leader()
		var dm: int = int(mp[z]) - zv.my_power
		var df: int = int(fp[z]) - zv.foe_power
		zv.set_powers(int(mp[z]), int(fp[z]))
		if not quiet:
			if dm != 0:
				_float_text(Persp.proj(zv.position + zv.power_pos(true)) + Vector2(-14, -40), dm, Data.MINE)
			if df != 0:
				_float_text(Persp.proj(zv.position + zv.power_pos(false)) + Vector2(-14, -40), df, Data.FOE)
			var now: int = zv.leader()
			if now != before and now != 0:
				_swing_fx(zv, Data.MINE if now > 0 else Data.FOE)
				_sound("swing")
		zv.highlight = _can_plan() and ((sel_hand >= 0 and _room(z) > 0) or (sel_move >= 0 and _move_from(sel_move) != z and _room(z) > 0) or gen_arming)
		zv.general_here = gen_zone == z and _general().get("needsZone", false)
		zv.queue_redraw()


func _update_controls() -> void:
	var phase := str(view.get("phase", ""))
	var last := int(view.get("turn", 1)) >= int(view.get("turns", 7))
	if view.get("result") != null or phase == "over":
		end_btn.text = "Partie finie"
		end_btn.disabled = true
	elif phase == "reveal":
		end_btn.text = "Révélation…"
		end_btn.disabled = true
	elif not _can_plan():
		end_btn.text = "En attente…"
		end_btn.disabled = true
	else:
		end_btn.text = "Valider le dernier tour" if last else "Valider le tour"
		end_btn.add_theme_font_size_override("font_size", 18 if last else 24)
		end_btn.disabled = false


func _update_log() -> void:
	var lines: Array = view.get("log", [])
	for i in range(lines.size() - 1, -1, -1):
		if str(lines[i].get("kind", "")) != "turn":
			log_label.text = Data.render_log(lines[i], _seat(), view.get("names", []))
			return
	log_label.text = ""


# ————— Préparation du tour —————

func _seals_left() -> int:
	var left := int(me().get("seals", 0))
	for p in pending:
		left -= int(p.cost)
	if gen_zone >= 0:
		left -= int(_general().get("activateCost", 0))
	return left


func _cost_of(c: Dictionary) -> int:
	if Data.card(c.id).get("x", false):
		return maxi(_seals_left(), 0)
	return int(c.get("cost", 0))


func _affordable(c: Dictionary) -> bool:
	return _can_plan() and _cost_of(c) <= _seals_left()


func _move_from(uid: int) -> int:
	var mb: Array = me().get("board", [[], [], []])
	for z in 3:
		for c in mb[z]:
			if int(c.uid) == uid:
				return z
	return -1


## Places libres d'une zone en fin de tour (4 par zone) : une carte qui part libère sa place.
func _room(z: int) -> int:
	var mb: Array = me().get("board", [[], [], []])
	var n: int = mb[z].size()
	for m in moves:
		if m.from == z:
			n -= 1
		if m.zone == z:
			n += 1
	for p in pending:
		if p.zone == z:
			n += 1
	return Data.slots - n


func _general() -> Dictionary:
	return Data.generals.get(str(me().get("general", "")), {})


func _can_general() -> bool:
	var g := _general()
	return _can_plan() and g.get("activate", false) and not bool(me().get("generalUsed", false)) and (gen_zone >= 0 or _seals_left() >= int(g.get("activateCost", 0)))


func _on_card_tapped(uid: int) -> void:
	if detail or confirm:
		return
	var cv: CardView = cards.get(uid)
	if cv == null:
		return
	var e: Dictionary = cv.get_meta("place")
	# Deux touchers rapprochés sur la même carte : la carte en grand, comme dans l'appli.
	var now := Time.get_ticks_msec() / 1000.0
	var double: bool = _last_tap.uid == uid and now - float(_last_tap.t) < DOUBLE_TAP
	_last_tap = {"uid": uid, "t": now}
	if double:
		if sel_hand == uid:
			sel_hand = -1
		if sel_move == uid:
			sel_move = -1
		_refresh()
		_show_detail(cv.id, uid)
		return
	if not _can_plan():
		if not cv.face_down:
			_show_detail(cv.id, uid)
		return
	if e.where == "hand":
		if sel_hand == uid:
			sel_hand = -1
			Sfx.play("unplace")
		elif _affordable(e.d):
			sel_hand = uid
			sel_move = -1
			gen_arming = false
			Sfx.play("pick")
		else:
			_deny("Pas assez de sceaux pour cette carte.")
			return
		_refresh()
		return
	if e.mine:
		if sel_hand >= 0 or sel_move >= 0 or gen_arming:
			_on_zone_tapped(e.zone)
			return
		for i in pending.size():
			if pending[i].uid == uid:
				# Reprise en main : la carte repart vers la main.
				pending.remove_at(i)
				Sfx.play("unplace")
				_refresh()
				return
		for i in moves.size():
			if moves[i].uid == uid:
				moves.remove_at(i)
				Sfx.play("unplace")
				_refresh()
				return
		if cv.mobile:
			sel_move = uid
			Sfx.play("pick")
			_refresh()
			return
	if not cv.face_down:
		_show_detail(cv.id, uid)


func _deny(text: String) -> void:
	Sfx.play("deny")
	Sfx.feel("deny")
	toast(text, true)


func _on_zone_tapped(z: int) -> void:
	if detail or confirm or not _can_plan():
		return
	if gen_arming:
		gen_zone = z
		gen_arming = false
		Sfx.play("general")
	elif sel_hand >= 0:
		var c := _hand_card(sel_hand)
		if _room(z) <= 0:
			_deny("Cette zone est pleine.")
			return
		var uid := sel_hand
		pending.append({"uid": uid, "zone": z, "cost": _cost_of(c)})
		sel_hand = -1
		Sfx.play("place")
		Sfx.feel("place")
		get_tree().create_timer(0.34).timeout.connect(func():
			if cards.has(uid):
				_dust(cards[uid]))
	elif sel_move >= 0:
		var from := _move_from(sel_move)
		var uid := sel_move
		if z != from and _room(z) > 0:
			moves.append({"uid": uid, "zone": z, "from": from})
			Sfx.play("place")
			Sfx.feel("place")
			get_tree().create_timer(0.4).timeout.connect(func():
				if cards.has(uid):
					_dust(cards[uid]))
		elif z != from:
			_deny("Cette zone est pleine.")
		sel_move = -1
	else:
		return
	_refresh()


func _on_general() -> void:
	if confirm:
		return
	if not _can_plan():
		_show_detail(str(me().get("general", "")), -1)
		return
	if gen_zone >= 0 or gen_arming:
		gen_zone = -1
		gen_arming = false
		Sfx.play("unplace")
	elif _can_general():
		if _general().get("needsZone", false):
			gen_arming = true
			sel_hand = -1
			sel_move = -1
			toast("Touchez la zone où activer votre général.")
		else:
			gen_zone = 1
			Sfx.play("general")
			Sfx.feel("general")
	else:
		_show_detail(str(me().get("general", "")), -1)
	_refresh()


func _refresh() -> void:
	_sync_cards()
	_place_cards(true)
	_update_zones(true)
	_redraw()


func _send_plan() -> void:
	if not _can_plan():
		return
	var plan := {
		"t": "plan",
		"cards": pending.map(func(p): return {"uid": p.uid, "zone": p.zone}),
		"moves": moves.map(func(m): return {"uid": m.uid, "zone": m.zone}),
		"general": gen_zone if gen_zone >= 0 else null,
		"turn": int(view.get("turn", 0)),
	}
	Net.send(plan)
	Sfx.play("validate")
	Sfx.feel("validate")
	# Vos cartes posées se scellent : petite pression bleue.
	for p in pending:
		if cards.has(p.uid):
			var cv: CardView = cards[p.uid]
			var tw := cv.create_tween()
			tw.tween_property(cv, "scale", Vector2(0.92, 0.92), 0.12)
			tw.tween_property(cv, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	end_btn.text = "En attente…"
	end_btn.disabled = true


## Retour Android : ferme la carte en grand, le journal ou la question de sortie.
func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		if detail:
			_close(detail)
			detail = null
		elif journal:
			_close(journal)
			journal = null
		elif confirm:
			_close(confirm)
			confirm = null


func _close(c: Control) -> void:
	var tw := c.create_tween()
	tw.tween_property(c, "modulate:a", 0.0, 0.18)
	tw.tween_callback(c.queue_free)


# ————— Glisser-déposer —————
# Une carte de la main (ou une carte déplaçable du plateau) se pose en la glissant sur une zone ; un simple toucher marche toujours.
# Un appui long ouvre la carte en grand.

func _on_card_pressed(uid: int) -> void:
	var cv: CardView = cards.get(uid)
	if cv == null or detail or confirm:
		return
	var p := get_global_mouse_position()
	_drag = {"uid": uid, "start": p, "offset": p - cv.position, "on": false, "t": Time.get_ticks_msec() / 1000.0, "last": p}


func _input(e: InputEvent) -> void:
	if e is InputEventMouseMotion or (e is InputEventMouseButton and e.pressed):
		_light_target = get_global_mouse_position()
		_light_touch = _time
	if _drag.is_empty():
		return
	var cv: CardView = cards.get(_drag.uid)
	if cv == null:
		_end_drag()
		return
	if e is InputEventMouseMotion:
		var p := get_global_mouse_position()
		if not _drag.on and p.distance_to(_drag.start) > 12.0 and _draggable(cv):
			_drag.on = true
			var place: Dictionary = cv.get_meta("place")
			if place.where == "hand":
				sel_hand = _drag.uid
				sel_move = -1
			else:
				sel_move = _drag.uid
				sel_hand = -1
			gen_arming = false
			_update_zones(true)
			cv.selected = true
			cv.z_index = 120
			cv.persp = 0.0
			_drag.offset = cv.size * 0.5
			cv.pivot_offset = cv.size * 0.5
			cv.create_tween().tween_property(cv, "scale", Vector2(1.08, 1.08), 0.12)
			Sfx.play("pick")
			Sfx.feel("turn")
			_trail.emitting = true
		if _drag.on:
			cv.position = p - _drag.offset
			# La carte penche dans le sens du geste, comme le fantôme de l'appli (±8°).
			var vx: float = p.x - _drag.last.x
			cv.rotation = lerpf(cv.rotation, clampf(vx / 40.0, -0.14, 0.14), 0.35)
			_drag.last = p
			_trail.position = p
			var z := _zone_at(p)
			for i in 3:
				var hov: bool = i == z and _drop_ok(i)
				if zones[i].drop_hover != hov:
					zones[i].drop_hover = hov
					zones[i].queue_redraw()
	elif e is InputEventMouseButton and not e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		var d := _drag
		_end_drag()
		if not d.on:
			_on_card_tapped(d.uid)
			return
		cv.create_tween().tween_property(cv, "scale", Vector2.ONE, 0.12)
		var z := _zone_at(get_global_mouse_position())
		if z >= 0:
			_on_zone_tapped(z)
		sel_hand = -1
		sel_move = -1
		_refresh()


func _end_drag() -> void:
	_drag = {}
	_trail.emitting = false
	for zv in zones:
		if zv.drop_hover:
			zv.drop_hover = false
			zv.queue_redraw()


func _drop_ok(z: int) -> bool:
	if sel_move >= 0:
		return _move_from(sel_move) != z and _room(z) > 0
	return _room(z) > 0


func _simulate_drag(uid: int, z: int) -> void:
	var cv: CardView = cards[uid]
	var from := cv.get_global_rect().get_center()
	var to: Vector2 = Persp.proj((zones[z] as Control).get_global_rect().get_center() + Vector2(0, 120))
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = true
	ev.position = from
	ev.global_position = from
	Input.parse_input_event(ev)
	await get_tree().process_frame
	for i in 13:
		var m := InputEventMouseMotion.new()
		m.position = from.lerp(to, i / 12.0)
		m.global_position = m.position
		Input.warp_mouse(m.position)
		Input.parse_input_event(m)
		await get_tree().process_frame
	var up := InputEventMouseButton.new()
	up.button_index = MOUSE_BUTTON_LEFT
	up.pressed = false
	up.position = to
	up.global_position = to
	Input.parse_input_event(up)
	await get_tree().process_frame
	await get_tree().process_frame


func _draggable(cv: CardView) -> bool:
	if not _can_plan() or detail:
		return false
	var place: Dictionary = cv.get_meta("place")
	if place.where == "hand":
		return _affordable(place.d)
	return place.mine and cv.mobile and not cv.moving


## Zone sous le doigt : votre moitié, ou le bandeau du milieu (une carte lâchée un peu haut compte quand même).
func _zone_at(p: Vector2) -> int:
	p = Persp.unproj(p)
	for z in 3:
		var zv: Control = zones[z]
		var r: Rect2 = zv.get_global_rect()
		r.position.y += r.size.y * 0.35
		r.size.y *= 0.65
		if r.grow(6).has_point(p):
			return z
	return -1


# ————— Chaque image —————

func _process(dt: float) -> void:
	_time += dt
	# Carte choisie : halo doré qui respire (selbreath de l'appli).
	for uid in cards:
		var cv: CardView = cards[uid]
		if cv.selected:
			cv.glow = 0.65 + 0.35 * sin(_time * 4.0)
	# Appui long sur une carte : la carte en grand.
	if not _drag.is_empty() and not _drag.on and Time.get_ticks_msec() / 1000.0 - float(_drag.t) > LONG_PRESS:
		var uid: int = _drag.uid
		_end_drag()
		if cards.has(uid) and not cards[uid].face_down:
			Sfx.feel("turn")
			_show_detail(cards[uid].id, uid)
	# Tremblement de l'écran (révélation d'une grosse carte, destruction).
	if _shake > 0.0:
		_shake = maxf(0.0, _shake - dt)
		var k := _shake_amp * _shake / 0.26
		position = Vector2(randf_range(-k, k), randf_range(-k, k))
	elif position != Vector2.ZERO:
		position = Vector2.ZERO
	_update_pools(dt)
	_update_light(dt)
	hud.queue_redraw()


## Lampe qui suit le doigt : reflets des cadres de laiton, ombres des cartes, lumière de la table. Sans toucher depuis
## quelques secondes, elle dérive lentement au-dessus du plateau.
func _update_light(dt: float) -> void:
	var target := _light_target
	if _time - _light_touch > 4.0:
		target = Vector2(size.x * (0.5 + 0.3 * sin(_time * 0.21)), size.y * (0.3 + 0.12 * cos(_time * 0.17)))
	var prev := Mat.light
	Mat.light = Mat.light.lerp(target, 1.0 - exp(-dt * (6.0 if _time - _light_touch < 4.0 else 1.5)))
	(bg.material as ShaderMaterial).set_shader_parameter("lamp_pos", Mat.light)
	if prev.distance_to(Mat.light) > 1.0:
		for uid in cards:
			cards[uid].queue_redraw()
		for zv in zones:
			zv.queue_redraw()
		for b in [snd_btn, log_btn, quit_btn]:
			b.queue_redraw()


## Flaques de lumière sous les zones, aux couleurs du camp qui mène (fond PixiJS de l'appli).
func _update_pools(dt: float) -> void:
	var mat := bg.material as ShaderMaterial
	var rects := []
	var cols := []
	for z in 3:
		var zv = zones[z]
		var lead: int = zv.leader() if not view.is_empty() else 0
		_pool_alpha[z] = move_toward(_pool_alpha[z], 0.3 if lead != 0 else 0.0, dt * 1.5)
		var c: Color = Data.MINE if lead > 0 else Data.FOE
		var half: Rect2 = zv.half_rect(lead > 0)
		var center: Vector2 = zv.position + half.get_center() + Vector2(0, half.size.y * (0.25 if lead > 0 else -0.25))
		center = Persp.proj(center)
		var sc := Persp.scale_at(Persp.unproj(center).y)
		rects.append(Vector4(center.x, center.y, zv.size.x * 0.95 * sc, zv.size.y * 0.4 * sc))
		cols.append(Vector4(c.r, c.g, c.b, _pool_alpha[z] * (0.9 + 0.1 * sin(_time * 1.3 + z))))
	mat.set_shader_parameter("pool_rect", rects)
	mat.set_shader_parameter("pool_col", cols)


# ————— Sons —————

func _sound(name: String, haptic := "") -> void:
	_sounds[name] = haptic


func _flush_sounds() -> void:
	var i := 0
	for name in _sounds:
		if i >= 3:
			break
		var h: String = _sounds[name]
		get_tree().create_timer(0.11 * i).timeout.connect(func():
			Sfx.play(name)
			if h != "":
				Sfx.feel(h))
		i += 1
	_sounds.clear()


# ————— Effets —————

## Braises qui montent lentement du bas du plateau.
func _add_embers() -> void:
	var p := CPUParticles2D.new()
	p.amount = 26
	p.lifetime = 9.0
	p.preprocess = 9.0
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2(420, 10)
	p.position = Vector2(360, 1320)
	p.direction = Vector2(0, -1)
	p.spread = 12
	p.gravity = Vector2.ZERO
	p.initial_velocity_min = 50
	p.initial_velocity_max = 130
	p.scale_amount_min = 1.5
	p.scale_amount_max = 3.5
	p.texture = Fx.dot_texture()
	# Braises de trois couleurs tirées au hasard (PALETTE de season.js : dorées, ou violettes et vertes d'Halloween, néons…).
	var pick := Gradient.new()
	pick.interpolation_mode = Gradient.GRADIENT_INTERPOLATE_CONSTANT
	pick.set_color(0, Look.embers[0])
	pick.set_offset(1, 0.34)
	pick.set_color(1, Look.embers[1])
	pick.add_point(0.67, Look.embers[2])
	p.color_initial_ramp = pick
	var grad := Gradient.new()
	grad.set_color(0, Color(1, 1, 1, 0.0))
	grad.add_point(0.2, Color(1, 1, 1, 0.6))
	grad.set_color(grad.get_point_count() - 1, Color(1, 1, 1, 0.0))
	p.color_ramp = grad
	add_child(p)
	resized.connect(func():
		p.position = Vector2(size.x * 0.5, size.y + 40)
		p.emission_rect_extents = Vector2(size.x * 0.6, 10))


func shake(px: float) -> void:
	_shake = 0.26
	_shake_amp = maxf(_shake_amp if _shake > 0.0 else 0.0, px)


## Révélation d'une carte : retournement (dos écrasé sur la tranche puis face), étincelles, anneau d'impact sous la carte,
## et un tremblement si la créature est puissante (comme stage.js : min(5, puissance − 3) px).
func _reveal_fx(cv: CardView, flip: bool) -> void:
	cv.pivot_offset = cv.size * 0.5
	cv.z_index += 40
	var tw := cv.create_tween()
	if flip:
		cv.face_down = true
		var data_id := cv.id
		cv.id = ""
		tw.tween_property(cv, "scale", Vector2(0.18, 1.16), 0.13).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.tween_callback(func():
			Sfx.play("flip")
			cv.face_down = false
			cv.id = data_id
			cv.queue_redraw())
		tw.tween_property(cv, "scale", Vector2(1.18, 1.18), 0.16).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	else:
		cv.scale = Vector2(0.18, 1.16)
		tw.tween_property(cv, "scale", Vector2(1.18, 1.18), 0.26).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func():
		var col: Color = Data.fam_color(Data.card(cv.id).get("fam"))
		Fx.sparkle(fx_layer, _scr(cv.position + cv.size * 0.5, cv.persp > 0.5), cv.size, col)
		Fx.ring(fx_layer, _scr(cv.position + Vector2(cv.size.x * 0.5, cv.size.y - 4), cv.persp > 0.5), Vector2(cv.size.x * 0.8, cv.size.x * 0.36), Color(1, 0.93, 0.8, 0.8), 0.36)
		var pw = Data.card(cv.id).get("power")
		var now_pw := int(cv.power) if cv.power != null else int(pw if pw != null else 0)
		if Data.card(cv.id).get("type", "C") == "C" and now_pw >= 5:
			shake(minf(5.0, now_pw - 3) * 1.6)
		if cv.level >= 5:
			Fx.astral(fx_layer, _scr(cv.position + cv.size * 0.5, cv.persp > 0.5), cv.size.x))
	tw.tween_property(cv, "scale", Vector2.ONE, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func(): cv.z_index -= 40)
	cv.glow = 1.0
	cv.create_tween().tween_property(cv, "glow", 0.0, 0.9).set_delay(0.35)


## Pari : chaque nouveau dé (rolls du moteur) roule au-dessus de la carte qui parie, ou au milieu de sa zone ; les 3 Sept
## d'un joueur en jeu font tourner la machine à sous du Jackpot.
func _play_rolls(prev: Dictionary, delay: float) -> void:
	for side in ["me", "foe"]:
		var before: Array = prev.get(side, {}).get("rolls", [])
		var last := 0
		for r in before:
			last = maxi(last, int(r.n))
		var i := 0
		for r in view.get(side, {}).get("rolls", []):
			if int(r.n) <= last:
				continue
			var at: Vector2
			if r.get("uid") != null and cards.has(int(r.uid)):
				var cv: CardView = cards[int(r.uid)]
				at = _scr(cv.position + cv.size * 0.5, cv.persp > 0.5)
			else:
				var zv: Control = zones[clampi(int(r.get("z", 1)), 0, 2)]
				at = Persp.proj(zv.position + zv.size * Vector2(0.5, 0.75 if side == "me" else 0.25))
			var d := delay + i * 0.3
			Fx.dice_roll(fx_layer, at, int(r.v), d)
			get_tree().create_timer(maxf(d, 0.01)).timeout.connect(func():
				Sfx.play("dice")
				if int(r.v) >= 6:
					Sfx.play("six"))
			i += 1
		if int(view.get(side, {}).get("jackpot", 0)) > 0 and int(prev.get(side, {}).get("jackpot", 0)) == 0:
			var mid: Control = zones[1]
			Fx.slot_machine(fx_layer, Persp.proj(mid.position + mid.size * 0.5), Data.MINE if side == "me" else Data.FOE)
			Sfx.play("jackpot")
			Sfx.feel("jackpot")


## Effets d'une étape de la révélation : un projectile part de la source (carte qui agit, ou général) vers chaque cible,
## puis l'effet joue à l'impact : chiffre de bonus ou de malus, destruction, invocation, déplacement, pioche.
## Sans source connue (fin de tour, terrain), les effets jouent tout de suite.
func _play_events(src, delay: float, col: Color, zone_before: Array, style := "bolt") -> void:
	var hit := delay
	for ev in _events:
		var cv: CardView = ev.cv
		var to := cv.position + cv.size * 0.5
		var flat := cv.persp > 0.5
		if ev.kind in ["draw", "summon", "move"]:
			var t := _target_of(cv.get_meta("place"))
			to = t.pos + t.size * 0.5
			flat = t.persp > 0.5
		var sz := cv.size * (Persp.scale_at(to.y) if flat else 1.0)
		to = _scr(to, flat)
		var kind: String = ev.kind
		var c: Color = col
		match kind:
			"power": c = Data.UP if ev.delta > 0 else Data.DOWN
			"destroy": c = Color("ff5a3c")
		var at := hit
		if src != null:
			var up: bool = kind != "destroy" and (kind != "power" or ev.delta > 0)
			at = Fx.effect(fx_layer, style if kind in ["power", "destroy"] else "bolt", src, to, c, hit, kind, up, sz)
		get_tree().create_timer(maxf(at, 0.01)).timeout.connect(func(): _impact(ev))
		if src != null:
			hit += 0.07
	# Zones dont la puissance change sans qu'une carte de la zone ne change : effet sur la zone (terrain, bonus de zone).
	if src != null:
		for z in 3:
			var zv = zones[z]
			for mine in [true, false]:
				var before: int = zone_before[z][0 if mine else 1]
				var now: int = zv.my_power if mine else zv.foe_power
				if before == now:
					continue
				var explained := _events.any(func(ev): return ev.cv.get_meta("place").get("zone", -1) == z and ev.cv.get_meta("place").get("mine", false) == mine)
				if not explained:
					var to: Vector2 = Persp.proj(zv.position + zv.power_pos(mine))
					Fx.bolt(fx_layer, src, to, Data.UP if now > before else Data.DOWN, hit, 0.3, "zone")
					hit += 0.07


func _impact(ev: Dictionary) -> void:
	var cv: CardView = ev.cv
	if not is_instance_valid(cv):
		return
	match str(ev.kind):
		"power":
			var d: int = ev.delta
			_float_text(Persp.proj(cv.position + Vector2(cv.size.x - 14, cv.size.y - 30)), d, Data.UP if d > 0 else Data.DOWN)
			Fx.aura(fx_layer, Persp.proj(cv.position + cv.size * 0.5), cv.size, Data.UP if d > 0 else Data.DOWN, d > 0)
			cv.pivot_offset = cv.size * 0.5
			var tw := cv.create_tween()
			tw.tween_property(cv, "scale", Vector2(1.12, 1.12) if d > 0 else Vector2(0.92, 0.92), 0.1)
			tw.tween_property(cv, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
			if d < 0:
				var x0 := cv.position.x
				var sh := cv.create_tween()
				for i in 4:
					sh.tween_property(cv, "position:x", x0 + (6 if i % 2 == 0 else -6), 0.04)
				sh.tween_property(cv, "position:x", x0, 0.04)
			if d > 0:
				Sfx.play("up")
			elif ev.mine:
				Sfx.play("down")
			else:
				Sfx.play("hit")
				Sfx.feel("hit")
		"destroy":
			_destroy_fx(cv)
			_flush_sounds()
		"summon":
			var c := Data.fam_color(Data.card(cv.id).get("fam"))
			var t := _target_of(cv.get_meta("place"))
			Fx.summon(fx_layer, Persp.proj(t.pos + t.size * 0.5), t.size, c)
			cv.remove_meta("summon")
			cv.pivot_offset = t.size * 0.5
			var tw := cv.create_tween()
			tw.tween_property(cv, "scale", Vector2(1.15, 1.15), 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
			tw.tween_property(cv, "scale", Vector2.ONE, 0.2)
			Sfx.play("spell")
		"draw":
			Sfx.play("draw")
		"move":
			_dust(cv)


## La carte qui agit se soulève un instant et brille avant de lancer son effet.
func _act_pulse(cv: CardView) -> void:
	cv.pivot_offset = cv.size * 0.5
	var tw := cv.create_tween()
	tw.tween_property(cv, "scale", Vector2(1.15, 1.15), 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(cv, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	cv.glow = 1.0
	cv.create_tween().tween_property(cv, "glow", 0.0, 0.6)


## Point du plateau à plat vers l'écran (perspective), pour placer les effets.
func _scr(p: Vector2, on := true) -> Vector2:
	return Persp.proj(p) if on else p


## Créature détruite : elle pâlit, penche, tombe et rétrécit ; éclats, étincelles orange et petit tremblement.
func _destroy_fx(cv: CardView) -> void:
	_sound("destroy", "destroy")
	cv.z_index += 50
	cv.pivot_offset = cv.size * 0.5
	Fx.shards(fx_layer, Persp.proj(cv.position + cv.size * 0.5), cv.size, Data.fam_color(Data.card(cv.id).get("fam")))
	shake(6.0)
	var tw := cv.create_tween()
	tw.tween_property(cv, "modulate", Color(1.6, 1.4, 1.1, 1.0), 0.1)
	tw.parallel().tween_property(cv, "rotation", -0.07, 0.1)
	tw.tween_property(cv, "modulate", Color(0.9, 0.5, 0.3, 0.0), 0.55)
	tw.parallel().tween_property(cv, "rotation", 0.14, 0.55)
	tw.parallel().tween_property(cv, "scale", Vector2(0.6, 0.6), 0.55).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.parallel().tween_property(cv, "position:y", cv.position.y + 28, 0.55).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_callback(cv.queue_free)


## Sort résolu : la carte monte en brillant et s'efface, la zone s'illumine.
func _spell_out(cv: CardView) -> void:
	cv.z_index += 50
	cv.pivot_offset = cv.size * 0.5
	var tw := cv.create_tween().set_parallel()
	tw.tween_property(cv, "modulate", Color(1.5, 1.4, 1.2, 0.0), 0.7)
	tw.tween_property(cv, "position:y", cv.position.y - 40, 0.7).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(cv, "scale", Vector2(1.1, 1.1), 0.7)
	tw.chain().tween_callback(cv.queue_free)
	var place: Dictionary = cv.get_meta("place")
	if place.has("zone"):
		var zv = zones[place.zone]
		zv.flare = 1.0
		zv.create_tween().tween_property(zv, "flare", 0.0, 0.6)


## Une zone change de camp : colonne de lumière et étincelles qui montent, couleur du nouveau meneur.
func _swing_fx(zv, col: Color) -> void:
	zv.flare = 1.0
	zv.create_tween().tween_property(zv, "flare", 0.0, 0.85)
	Fx.rise(fx_layer, Persp.proj(zv.position + zv.size * Vector2(0.5, 0.55)), zv.size * Vector2(0.9, 0.85), col)


## Carte posée : anneau de poussière aplati sous la carte et quelques grains.
func _dust(cv: CardView) -> void:
	var at := Persp.proj(cv.position + Vector2(cv.size.x * 0.5, cv.size.y - 2))
	Fx.ring(fx_layer, at, Vector2(cv.size.x * 0.55, cv.size.x * 0.16), Color("e8d0a0"), 0.38)
	Fx.grains(fx_layer, at, cv.size.x)


## Général déclenché : anneaux et étincelles autour de son portrait.
func _general_fx(mine: bool) -> Vector2:
	var gid = (me() if mine else foe()).get("general")
	var g: Dictionary = Data.generals.get(str(gid), {})
	var col := Data.fam_color(g.get("fam"))
	var from := _gen_center(mine)
	# Le portrait s'avance au-dessus de la moitié de son camp, au milieu du plateau.
	var mid: Control = zones[1]
	var to := Persp.proj(mid.position + mid.size * Vector2(0.5, 0.62 if mine else 0.3))
	Fx.ring(fx_layer, from, Vector2(60, 60), col.lightened(0.3), 0.8)
	Fx.general_call(fx_layer, gid, from, to, col, g.get("fam"), str(g.get("name", "")).split(",")[0].strip_edges())
	if not mine:
		_sound("general", "general")
	return to


func _float_text(at: Vector2, delta: int, col: Color) -> void:
	var l := Label.new()
	l.text = ("+%d" % delta) if delta > 0 else "−%d" % absi(delta)
	l.add_theme_font_override("font", Data.font_title)
	l.add_theme_font_size_override("font_size", 38)
	l.add_theme_color_override("font_color", col.lightened(0.2))
	l.add_theme_constant_override("outline_size", 9)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	l.position = at
	l.pivot_offset = Vector2(20, 24)
	l.scale = Vector2(0.5, 0.5)
	fx_layer.add_child(l)
	var tw := l.create_tween()
	tw.tween_property(l, "scale", Vector2(1.25, 1.25), 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(l, "position:y", at.y - 14, 0.2)
	tw.tween_property(l, "scale", Vector2.ONE, 0.2)
	tw.parallel().tween_property(l, "position:y", at.y - 54, 0.8).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(l, "modulate:a", 0.0, 0.5).set_delay(0.3)
	tw.tween_callback(l.queue_free)


## Bandeau de tour (stage.js) : la bande s'ouvre, le titre glisse en se resserrant, un reflet la traverse, puis tout s'efface.
func _banner(title: String, sub: String, edge: Color) -> void:
	var b := Fx.Banner.new()
	b.title = title
	b.sub = sub
	b.edge = edge
	b.size = Vector2(size.x, 170)
	b.position = Vector2(0, (HEAD_H + _hand_top()) * 0.5 - 85)
	fx_layer.add_child(b)
	b.play()


func _flash(col: Color, alpha: float) -> void:
	var r := ColorRect.new()
	r.color = Color(col, alpha)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	fx_layer.add_child(r)
	var tw := r.create_tween()
	tw.tween_property(r, "color:a", 0.0, 0.26)
	tw.tween_callback(r.queue_free)


## Message court au-dessus de la main ; bord rouge pour un refus, comme les bulles de l'appli.
func toast(text: String, refusal := false) -> void:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", 21)
	l.add_theme_color_override("font_color", Color("fff1d0"))
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.1, 0.06, 0.04, 0.96)
	sb.border_color = Color("f07a66") if refusal else Data.GOLD_DARK
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(14)
	sb.set_content_margin_all(12)
	sb.shadow_color = Color(0, 0, 0, 0.5)
	sb.shadow_size = 8
	l.add_theme_stylebox_override("normal", sb)
	l.size = Vector2(size.x - 120, 0)
	l.position = Vector2(60, _hand_top() - 70)
	l.z_index = 160
	l.pivot_offset = Vector2((size.x - 120) * 0.5, 30)
	l.scale = Vector2(0.9, 0.9)
	l.modulate.a = 0.0
	fx_layer.add_child(l)
	var tw := l.create_tween()
	tw.tween_property(l, "modulate:a", 1.0, 0.2)
	tw.parallel().tween_property(l, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_interval(2.2)
	tw.tween_property(l, "modulate:a", 0.0, 0.4)
	tw.tween_callback(l.queue_free)


# ————— Panneaux —————

## Fond commun des panneaux : voile sombre qui ferme le panneau quand on le touche.
func _sheet(on_close: Callable) -> Control:
	var s := Control.new()
	s.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	s.z_index = 200
	var veil := ColorRect.new()
	veil.color = Color(0.02, 0.01, 0.0, 0.8)
	veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	veil.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			on_close.call())
	s.add_child(veil)
	add_child(s)
	s.modulate.a = 0.0
	s.create_tween().tween_property(s, "modulate:a", 1.0, 0.2)
	return s


static func panel_box() -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color("1c140e")
	sb.border_color = Color("7a5a2c")
	sb.set_border_width_all(2)
	sb.border_width_top = 3
	sb.set_corner_radius_all(18)
	sb.set_content_margin_all(20)
	sb.shadow_color = Color(0, 0, 0, 0.6)
	sb.shadow_size = 18
	return sb


func _label(text: String, font: Font, fs: int, col: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", col)
	return l


## Journal de la partie et réglages (son, vibrations) ; un toucher hors du panneau le referme.
func _show_journal() -> void:
	if journal or view.is_empty() or detail:
		return
	journal = _sheet(func():
		if journal:
			_close(journal)
			journal = null)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", panel_box())
	panel.position = Vector2(20, TOP_H + 10)
	panel.size = Vector2(size.x - 40, size.y - TOP_H - DOCK_H - 20)
	journal.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	panel.add_child(col)
	col.add_child(_label("Journal", Look.title_font(), 32, Data.GOLD))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	var lines := VBoxContainer.new()
	lines.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lines.add_theme_constant_override("separation", 6)
	scroll.add_child(lines)
	for line in view.get("log", []):
		var text := Data.render_log(line, _seat(), view.get("names", []))
		if str(line.get("kind", "")) == "turn":
			lines.add_child(_label(text, Data.font_title, 22, Data.GOLD))
		else:
			var mine := text.begins_with("Vous") or text.begins_with("Votre")
			lines.add_child(_label(text, Data.font_body, 20, Data.MINE.lightened(0.45) if mine else Color("efe1c6")))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	col.add_child(row)
	for opt in [["Son", "sound_on"], ["Vibrations", "haptics_on"]]:
		var c := CheckButton.new()
		c.text = opt[0]
		c.button_pressed = Sfx.get(opt[1])
		c.add_theme_font_size_override("font_size", 22)
		c.toggled.connect(func(on: bool):
			if opt[1] == "sound_on":
				Sfx.set_sound(on)
				snd_btn.queue_redraw()
			else:
				Sfx.haptics_on = on
				Sfx.save())
		row.add_child(c)
	var close := plate_button("Fermer")
	close.size_flags_horizontal = Control.SIZE_SHRINK_END | Control.SIZE_EXPAND
	close.pressed.connect(func():
		if journal:
			_close(journal)
			journal = null)
	row.add_child(close)
	await get_tree().process_frame
	scroll.scroll_vertical = int(scroll.get_v_scroll_bar().max_value)


## Quitter la partie en cours : on demande d'abord.
func _ask_quit() -> void:
	if confirm:
		return
	if over_panel or view.is_empty():
		quit_requested.emit()
		return
	confirm = _sheet(func():
		if confirm:
			_close(confirm)
			confirm = null)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", panel_box())
	panel.size = Vector2(size.x - 80, 0)
	panel.position = Vector2(40, size.y * 0.36)
	confirm.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 18)
	panel.add_child(col)
	col.add_child(_label("Quitter la partie ?", Look.title_font(), 30, Data.GOLD))
	col.add_child(_label("La partie en cours sera perdue.", Data.font_body, 22, Color("efe1c6")))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	row.alignment = BoxContainer.ALIGNMENT_END
	col.add_child(row)
	var stay := plate_button("Rester")
	stay.custom_minimum_size = Vector2(0, 60)
	stay.pressed.connect(func():
		if confirm:
			_close(confirm)
			confirm = null)
	row.add_child(stay)
	var go := gold_button("Quitter")
	go.custom_minimum_size = Vector2(170, 64)
	go.pressed.connect(func(): quit_requested.emit())
	row.add_child(go)


## Carte en grand (double toucher, appui long, ou toucher hors préparation) : l'illustration penche sous le doigt
## (ou avec le téléphone), le personnage glisse devant le décor, un reflet la traverse. Pendant la préparation,
## les actions de la carte sont dessous : jouer dans une zone, reprendre en main, déplacer.
func _show_detail(id: String, uid: int) -> void:
	if id == "" or detail:
		return
	var is_gen := Data.generals.has(id)
	var d: Dictionary = Data.generals.get(id, {}) if is_gen else Data.card(id)
	detail = _sheet(func():
		if detail:
			_close(detail)
			detail = null)
	var w := minf(size.x - 120, 470.0)
	var h := w * 1.4
	var big := CardView.new()
	big.big = true
	big.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if is_gen:
		big.set_data({"uid": -1, "id": id, "revealed": true})
	else:
		var src: CardView = cards.get(uid)
		var dd := {"uid": -1, "id": id}
		if src:
			dd = {"uid": -1, "id": id, "power": src.power, "cost": src.cost, "revealed": false}
			big.level = src.level
		big.set_data(dd)
	big.size = Vector2(w, h)
	big.position = Vector2((size.x - w) * 0.5, TOP_H + 16)
	big.pivot_offset = big.size * 0.5
	detail.add_child(big)
	if is_gen:
		var gl := _label(str(d.get("text", "")), Data.font_body, 23, Color("f3e6cf"))
		gl.position = Vector2(50, big.position.y + h + 14)
		gl.size = Vector2(size.x - 100, 0)
		gl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		detail.add_child(gl)
	# Actions de la carte pendant la préparation.
	var acts := VBoxContainer.new()
	acts.add_theme_constant_override("separation", 10)
	acts.position = Vector2(40, big.position.y + h + (90 if is_gen else 18))
	acts.size = Vector2(size.x - 80, 0)
	detail.add_child(acts)
	var cv: CardView = cards.get(uid)
	if cv and _can_plan():
		var e: Dictionary = cv.get_meta("place")
		if e.where == "hand":
			if _affordable(e.d):
				acts.add_child(_label("JOUER DANS LA ZONE", Data.font_sc, 18, Color(1, 0.9, 0.75, 0.7)))
				acts.add_child(_zone_row(func(z): return _room(z) > 0, func(z):
					sel_hand = uid
					_on_zone_tapped(z)))
			else:
				acts.add_child(_label("Pas assez de sceaux pour la jouer ce tour.", Data.font_body, 20, Color("f0a090")))
		elif e.mine and pending.any(func(p): return p.uid == uid):
			acts.add_child(_action("Reprendre en main", func(): _on_card_tapped(uid)))
		elif e.mine and moves.any(func(m): return m.uid == uid):
			acts.add_child(_action("Annuler le déplacement", func(): _on_card_tapped(uid)))
		elif e.mine and cv.mobile:
			acts.add_child(_label("DÉPLACER VERS", Data.font_sc, 18, Color(1, 0.9, 0.75, 0.7)))
			acts.add_child(_zone_row(func(z): return z != e.zone and _room(z) > 0, func(z):
				sel_move = uid
				_on_zone_tapped(z)))
	elif is_gen and uid == -1 and _can_plan() and str(me().get("general", "")) == id and _can_general():
		acts.add_child(_action("Activer le général", func(): _on_general()))
	var close := plate_button("Fermer")
	close.custom_minimum_size = Vector2(0, 56)
	close.pressed.connect(func():
		if detail:
			_close(detail)
			detail = null)
	acts.add_child(close)
	# Ouverture : la carte grandit depuis le bas (zoomin de l'appli).
	big.scale = Vector2(0.7, 0.7)
	big.position.y += 30
	var tw := big.create_tween().set_parallel()
	tw.tween_property(big, "scale", Vector2.ONE, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(big, "position:y", big.position.y - 30, 0.28).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	var tilt := Fx.Tilt.new()
	tilt.card = big
	detail.add_child(tilt)


func _action(text: String, f: Callable) -> Button:
	var b := plate_button(text)
	b.custom_minimum_size = Vector2(0, 60)
	b.pressed.connect(func():
		if detail:
			_close(detail)
			detail = null
		f.call())
	return b


func _zone_row(ok: Callable, f: Callable) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	for z in 3:
		var b := plate_button(str(Data.zones[z]))
		b.custom_minimum_size = Vector2(0, 62)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.disabled = not ok.call(z)
		b.pressed.connect(func():
			if detail:
				_close(detail)
				detail = null
			f.call(z))
		row.add_child(b)
	return row


## Fin de partie : les zones s'allument une à une dans la couleur du gagnant, puis le titre tombe sous des rayons
## (pluie de confettis pour une victoire, voile rouge et cendres pour une défaite) et le bilan des zones monte.
func _game_over() -> void:
	var res: Dictionary = view.get("result", {}) if view.get("result") is Dictionary else {}
	var w := int(res.get("winner", -1))
	var seat := _seat()
	var outcome := "win" if w == seat else "tie" if w < 0 else "lose"
	var title: String = {"win": "Victoire", "tie": "Égalité", "lose": "Défaite"}[outcome]
	for z in 3:
		var zv = zones[z]
		if zv.leader() != 0:
			get_tree().create_timer(0.22 * z).timeout.connect(func():
				zv.flare = 1.0
				zv.create_tween().tween_property(zv, "flare", 0.35, 1.7)
				Fx.rise(fx_layer, Persp.proj(zv.position + zv.size * Vector2(0.5, 0.5)), zv.size * Vector2(0.9, 0.85), Data.MINE if zv.leader() > 0 else Data.FOE))
	await get_tree().create_timer(0.7).timeout
	Sfx.play(outcome)
	if outcome == "lose":
		get_tree().create_timer(0.49).timeout.connect(func(): Sfx.feel("lose"))
	else:
		Sfx.feel(outcome)
	over_panel = Control.new()
	over_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	over_panel.z_index = 150
	add_child(over_panel)
	var veil := ColorRect.new()
	veil.color = Color(0.02, 0.01, 0.0, 0.0) if outcome != "lose" else Color(0.23, 0.03, 0.015, 0.0)
	veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	over_panel.add_child(veil)
	veil.create_tween().tween_property(veil, "color:a", 0.55, 0.6)
	var ending := Fx.Ending.new()
	ending.outcome = outcome
	ending.title = title
	ending.size = size
	ending.center = Vector2(size.x * 0.5, minf(size.y * 0.2, 260.0))
	over_panel.add_child(ending)
	ending.play()
	if outcome == "lose":
		get_tree().create_timer(0.7).timeout.connect(func(): shake(9.0))
	await get_tree().create_timer(1.2).timeout
	# Bilan : une case par zone, bord du haut à la couleur du gagnant de la zone.
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", panel_box())
	panel.size = Vector2(size.x - 32, 0)
	over_panel.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 16)
	panel.add_child(col)
	var won := 0
	for z in 3:
		if zones[z].leader() > 0:
			won += 1
	var sub := _label("%d zone%s sur 3." % [won, "s" if won > 1 else ""], Data.font_body, 24, Color("efe1c6"))
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(sub)
	var cells := HBoxContainer.new()
	cells.add_theme_constant_override("separation", 10)
	col.add_child(cells)
	for z in 3:
		var zv = zones[z]
		var cell := PanelContainer.new()
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color("120d0a")
		sb.set_corner_radius_all(10)
		sb.border_width_top = 4
		sb.border_color = Data.MINE if zv.leader() > 0 else Data.FOE if zv.leader() < 0 else Color("5a4530")
		sb.set_content_margin_all(12)
		cell.add_theme_stylebox_override("panel", sb)
		cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var cc := VBoxContainer.new()
		cell.add_child(cc)
		var zl := _label(str(Data.zones[z]).to_upper(), Data.font_title, 20, Color("ffe7a6"))
		zl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		cc.add_child(zl)
		var sc := _label("%d contre %d" % [zv.my_power, zv.foe_power], Data.font_bold, 20, Color("efe1c6"))
		sc.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		cc.add_child(sc)
		cells.add_child(cell)
		cell.modulate.a = 0.0
		cell.create_tween().tween_property(cell, "modulate:a", 1.0, 0.3).set_delay(0.3 + 0.15 * z)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	col.add_child(row)
	var again := gold_button("Revanche")
	again.custom_minimum_size = Vector2(0, 66)
	again.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	again.pressed.connect(func(): new_game_requested.emit())
	row.add_child(again)
	var home := plate_button("Accueil")
	home.custom_minimum_size = Vector2(0, 66)
	home.pressed.connect(func(): quit_requested.emit())
	row.add_child(home)
	var jl := plate_button("Journal")
	jl.custom_minimum_size = Vector2(0, 66)
	jl.pressed.connect(func():
		over_panel.z_index = 150
		_show_journal())
	row.add_child(jl)
	await get_tree().process_frame
	panel.position = Vector2(16, size.y + 10)
	var tw := panel.create_tween()
	tw.tween_property(panel, "position:y", size.y - panel.size.y - 24, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	await tw.finished
	shot_requested.emit("fin")


# ————— En-têtes (dessinés) —————

## Médaillon du général : au centre de la bande de son camp.
func _gen_center(mine: bool) -> Vector2:
	if mine:
		return Vector2(56, size.y - DOCK_H + DOCK_H * 0.5 + 2)
	return Vector2(size.x - 54, TOP_H + FOE_H * 0.5 + 2)


func _gen_rect(mine: bool) -> Rect2:
	var c := _gen_center(mine)
	return Rect2(c - Vector2(42, 42), Vector2(84, 84))


func _draw_hud(ci: Control) -> void:
	if view.is_empty():
		return
	var f := foe()
	var m := me()
	var w := size.x
	var names: Array = view.get("names", [])
	var fs := 1 - _seat()
	var fname := str(names[fs]) if names.size() > fs and names[fs] != null else str(f.get("name", ""))
	var conn: Array = view.get("connected", [true, true])
	# Adversaire : bande de cuir, avatar et niveau, nom, compteurs ; son général en médaillon à droite.
	var band := Rect2(6, TOP_H + 4, w - 12, FOE_H - 8)
	_band(ci, band, Data.FOE, false)
	var fb = _badge(false)
	var lvl := int(fb.get("level", 0)) if fb is Dictionary else 0
	_avatar(ci, Vector2(48, band.get_center().y), 31, fname, Data.FOE, fs, conn[fs] if conn.size() > fs else true, lvl)
	var nx := 92.0
	var name_w := w * 0.5 - 50 - nx
	Gfx.text_lines(ci, Look.title_font(), Rect2(nx, band.position.y + 8, name_w, 30), fname, 23, Data.FOE.lightened(0.2), 1, 4)
	var sy := band.position.y + 58
	var sx := nx
	sx = _stat(ci, Vector2(sx, sy), "hand", int(f.get("handCount", 0)))
	sx = _stat(ci, Vector2(sx, sy), "deck", int(f.get("deckCount", 0)))
	_stat(ci, Vector2(sx, sy), "seal", int(f.get("seals", 0)))
	if bool(view.get("ready", {}).get("foe", false)) and str(view.get("phase", "")) == "plan":
		var chip := Rect2(w * 0.5 + 44, band.position.y + 50, 66, 26)
		Gfx.fill_round(ci, chip, 13, Color("2e5a32"))
		Gfx.frame_round(ci, chip, 13, Color("9be38a"), 1.5)
		Gfx.text_fit(ci, Data.font_bold, chip.get_center(), "Prêt", 56, 16, Color("d8ffd0"))
	var fg = f.get("general")
	_gen_label(ci, fg, false, Vector2(_gen_center(false).x - 50, band.position.y + 30), HORIZONTAL_ALIGNMENT_RIGHT)
	_gen_medal(ci, _gen_center(false), 36, fg, false)
	# Tour : médaillon au milieu du haut, à cheval sur la bande de l'adversaire.
	_turn_medal(ci, Vector2(w * 0.5, 44))
	# Bas d'écran : votre général (bouton), vos sceaux en gemme, Valider.
	var dy := size.y - DOCK_H
	var dock := Rect2(-2, dy, w + 4, DOCK_H + 4)
	Mat.fill(ci, "leather", dock, 0, Look.leather(Color(0.3, 0.2, 0.14)))
	Gfx.vgrad_round(ci, dock, 0, [0.0, 1.0], [0.0, 0.55])
	Orn.pattern(ci, Rect2(0, dy + 6, w, DOCK_H - 6))
	Mat.stitch(ci, Rect2(8, dy + 14, w - 16, DOCK_H - 22), 10)
	ci.draw_rect(Rect2(0, dy - 6, w, 8), Color(0, 0, 0, 0.35))
	Mat.bevel(ci, Rect2(-12, dy - 4, w + 24, 11), 4, 5.5, Mat.BRASS, 0.9)
	var mg = m.get("general")
	var gc := _gen_center(true)
	_gen_medal(ci, gc, 42, mg, true)
	var ms := _seat()
	var mb = _badge(true)
	_avatar(ci, gc + Vector2(-30, 32), 15, str(names[ms]) if names.size() > ms and names[ms] != null else "Vous", Data.MINE, ms, true, 0)
	_gen_label(ci, mg, true, Vector2(gc.x + 52, dy + 34), HORIZONTAL_ALIGNMENT_LEFT)
	var mine_stats := Vector2(gc.x + 52, dy + DOCK_H - 22)
	var mx := _stat(ci, mine_stats, "hand", int(m.get("handCount", 0)))
	_stat(ci, Vector2(mx, mine_stats.y), "deck", int(m.get("deckCount", 0)))
	_seal_gem(ci, Vector2((gen_btn.position.x + gen_btn.size.x + end_btn.position.x) * 0.5 + 6, dy + DOCK_H * 0.5 + 2))
	# Valider : lueur dorée qui respire tant qu'on peut valider (playglow).
	if not end_btn.disabled:
		var gr := Rect2(end_btn.position, end_btn.size)
		var k := 0.5 + 0.5 * sin(_time * TAU / 2.6)
		for i in 4:
			var g := (4 - i) * (3.0 + 2.0 * k)
			Gfx.fill_round(ci, gr.grow(g), 16 + g, Color(1, 0.75, 0.3, 0.06 + 0.03 * k))


## Bande d'un joueur : cuir sombre, liseré doré, lueur de la couleur de son camp côté avatar.
func _band(ci: CanvasItem, r: Rect2, side: Color, _mine: bool) -> void:
	Gfx.fill_round(ci, r.grow(3), 16, Color(0, 0, 0, 0.55))
	Mat.fill(ci, "leather", r, 14, Look.leather(Color(0.42, 0.29, 0.2)))
	for i in 6:
		var t := i / 6.0
		ci.draw_circle(r.position + Vector2(44, r.size.y * 0.5), 90 - i * 12, Color(side, 0.03 + 0.02 * t), true, -1.0, true)
	Gfx.vgrad_round(ci, r, 14, [0.0, 1.0], [0.0, 0.5])
	Orn.pattern(ci, r)
	Mat.stitch(ci, r.grow(-9), 9)
	Mat.bevel(ci, r, 14, 5.0, Mat.BRASS, 0.8)
	Orn.corners(ci, r)


## Avatar : image de profil (ou initiale) dans un anneau de la couleur du camp, niveau en pastille, connexion.
func _avatar(ci: CanvasItem, c: Vector2, rad: float, name: String, side: Color, seat: int, online: bool, level: int) -> void:
	ci.draw_circle(c + Vector2(0, 2), rad + 4, Color(0, 0, 0, 0.55), true, -1.0, true)
	ci.draw_circle(c, rad + 3, side.darkened(0.45), true, -1.0, true)
	var tex: Texture2D = _avatar_tex[seat] if seat >= 0 and seat < 2 else null
	if tex:
		var uv := Gfx.cover_uv(tex, Rect2(0, 0, 1, 1), Vector2(rad, rad) * 2.0, Vector2(0.5, 0.5))
		Gfx.tex_round(ci, tex, Rect2(c - Vector2(rad, rad), Vector2(rad, rad) * 2.0), uv, rad)
	else:
		ci.draw_circle(c, rad, Look.leather(Color("2a1d14")), true, -1.0, true)
		Gfx.text_fit(ci, Data.font_title, c + Vector2(0, 1), name.substr(0, 1).to_upper(), rad * 1.4, int(rad * 1.15), side.lightened(0.3))
	ci.draw_arc(c, rad + 1.5, 0, TAU, 48, side.lightened(0.15), maxf(2.0, rad * 0.1), true)
	if level > 0:
		var lc := c + Vector2(0, rad + 2)
		var lr := Rect2(lc - Vector2(17, 10), Vector2(34, 20))
		Gfx.fill_round(ci, lr, 10, Look.leather(Color("2a1d14")))
		Gfx.frame_round(ci, lr, 10, Data.GOLD, 1.5)
		Gfx.text_fit(ci, Data.font_bold, lr.get_center(), str(level), 30, 14, Color("ffe7a6"))
	if seat != _seat():
		var d := c + Vector2(rad * 0.74, -rad * 0.74)
		ci.draw_circle(d, 7, Color("1a1410"), true, -1.0, true)
		ci.draw_circle(d, 5, Color("5fd06a") if online else Color("e05a4a"), true, -1.0, true)


## Compteur avec son icône (main, deck, sceaux) ; renvoie où écrire le suivant.
func _stat(ci: CanvasItem, at: Vector2, icon: String, n: int) -> float:
	var col := Color(1, 0.9, 0.75, 0.8)
	var c := at + Vector2(9, -6)
	match icon:
		"hand":   # deux cartes en éventail
			for k in [-1, 1]:
				var xf := Transform2D(k * 0.22, c + Vector2(k * 3, 0))
				var pts := PackedVector2Array([Vector2(-5, -8), Vector2(5, -8), Vector2(5, 8), Vector2(-5, 8)])
				ci.draw_colored_polygon(xf * pts, Look.leather(Color("3a2a1c")))
				ci.draw_polyline(xf * PackedVector2Array([pts[0], pts[1], pts[2], pts[3], pts[0]]), col, 1.5, true)
		"deck":   # pile de cartes
			for k in 3:
				var r := Rect2(c + Vector2(-6 + k * 1.5, -9 + k * 2.0), Vector2(11, 15))
				Gfx.fill_round(ci, r, 2, Look.leather(Color("3a2a1c")))
				Gfx.frame_round(ci, r, 2, col, 1.3)
		"seal":   # pièce
			ci.draw_circle(c, 8, Color("8f5f1c"), true, -1.0, true)
			ci.draw_circle(c - Vector2(0.5, 0.5), 6.5, Color("e3b552"), true, -1.0, true)
	var x := at.x + 22
	_text(ci, Data.font_bold, Vector2(x, at.y), str(n), 19, Color("fff1d6"))
	return x + Data.font_bold.get_string_size(str(n), HORIZONTAL_ALIGNMENT_LEFT, -1, 19).x + 14


## Médaillon du tour : le numéro au centre, un arc par tour autour (passés en or terni, le tour en cours brille).
func _turn_medal(ci: CanvasItem, c: Vector2) -> void:
	var turn := int(view.get("turn", 1))
	var turns := int(view.get("turns", 7))
	var last := turn >= turns
	var reveal := str(view.get("phase", "")) == "reveal"
	var hot := Color("f07a66") if last else Color("ffd36b")
	var r := 33.0
	var k := 0.5 + 0.5 * sin(_time * TAU / 1.8)
	for i in 3:
		ci.draw_circle(c, r + 8 + i * 4 + 3 * k, Color(hot, 0.05), true, -1.0, true)
	ci.draw_circle(c + Vector2(0, 4), r + 12, Color(0, 0, 0, 0.6), true, -1.0, true)
	var rr := r + 12.0
	Mat.bevel(ci, Rect2(c - Vector2(rr, rr), Vector2(rr, rr) * 2.0), rr, 7.0, Mat.BRASS, 1.0)
	ci.draw_circle(c, r + 6, Look.leather(Color("2a1d12")), true, -1.0, true)
	var gap := 0.09
	for i in turns:
		var a0 := -PI / 2 + TAU * i / turns + gap
		var a1 := -PI / 2 + TAU * (i + 1) / turns - gap
		var col := Color("6b5232")
		var wd := 4.0
		if i + 1 < turn:
			col = Color("b08a4a")
		elif i + 1 == turn:
			col = hot.lightened(0.15 * k)
			wd = 6.0
		ci.draw_arc(c, r + 2, a0, a1, 12, col, wd, true)
	ci.draw_circle(c, r - 3, Color("140e09"), true, -1.0, true)
	ci.draw_arc(c, r - 3, 0, TAU, 48, Color(Data.GOLD, 0.35), 1.2, true)
	if reveal:
		var a := _time * 3.0
		ci.draw_arc(c, r - 7, a, a + 1.6, 16, Color(Data.FOE, 0.8), 2.5, true)
	Gfx.text_fit(ci, Data.font_sc, c + Vector2(0, -16), "TOUR", 40, 11, Color(1, 0.9, 0.75, 0.7))
	Gfx.text_fit(ci, Data.font_title, c + Vector2(0, 4), str(turn), 40, 30, hot, 4)
	Gfx.text_fit(ci, Data.font_body, c + Vector2(0, 21), "sur %d" % turns, 44, 11, Color(1, 0.9, 0.75, 0.6))


## Sceaux : gemme taillée avec le nombre restant ; une perle par sceau autour du bas, celles que coûterait
## la carte choisie clignotent.
func _seal_gem(ci: CanvasItem, c: Vector2) -> void:
	var m := me()
	var total := int(m.get("seals", 0))
	var left := maxi(_seals_left() if _can_plan() else total, 0)
	var r := 34.0
	var lit := left > 0
	var k := 0.5 + 0.5 * sin(_time * TAU / 2.2)
	if lit:
		for i in 3:
			ci.draw_circle(c, r + 6 + i * 5 + 3 * k, Color(Data.GOLD, 0.05), true, -1.0, true)
	var hexa := PackedVector2Array()
	var inner := PackedVector2Array()
	for i in 6:
		var a := -PI / 2 + i * TAU / 6.0
		hexa.append(c + Vector2(cos(a), sin(a)) * r)
		inner.append(c + Vector2(cos(a), sin(a)) * r * 0.62 + Vector2(0, -2))
	ci.draw_colored_polygon(hexa, Look.leather(Color("3a2a12")) if lit else Look.leather(Color("241c14")))
	# Facettes : triangles entre le contour et le cœur, plus clairs en haut à gauche.
	for i in 6:
		var shade := 0.5 + 0.5 * cos(i * TAU / 6.0 + 2.2)
		var base := Color("f0c25c") if lit else Color("5a4a36")
		ci.draw_colored_polygon(PackedVector2Array([hexa[i], hexa[(i + 1) % 6], inner[(i + 1) % 6], inner[i]]), base.darkened(0.55 - 0.4 * shade))
	ci.draw_colored_polygon(inner, (Color("ffe7a6") if lit else Color("6a5a46")).darkened(0.15))
	ci.draw_polyline(hexa + PackedVector2Array([hexa[0]]), Color("2a1606"), 2.0, true)
	Gfx.text_fit(ci, Data.font_title, c + Vector2(0, -2), str(left), 40, 30, Color("2a1606") if lit else Color(1, 0.9, 0.75, 0.7), 0)
	Gfx.text_fit(ci, Data.font_sc, c + Vector2(0, r + 14), "SCEAUX  %d/%d" % [left, total], 110, 13, Color(1, 0.9, 0.75, 0.7))
	var sel_cost := _cost_of(_hand_card(sel_hand)) if sel_hand >= 0 else 0
	for i in total:
		var a := -PI / 2 + (i - (total - 1) * 0.5) * 0.34
		var p := c + Vector2(cos(a), sin(a)) * (r + 11)
		var full := i < left
		var blink := full and sel_cost > 0 and i >= left - sel_cost
		var al := 0.4 + 0.6 * (0.5 + 0.5 * cos(_time * TAU)) if blink else 1.0
		if full:
			ci.draw_circle(p, 5.5, Color("8f5f1c", al), true, -1.0, true)
			ci.draw_circle(p - Vector2(0.6, 0.6), 4.2, Color("ffd36b", al), true, -1.0, true)
		else:
			ci.draw_arc(p, 4.5, 0, TAU, 16, Color(0.75, 0.62, 0.4, 0.5), 1.5, true)


## Médaillon d'un général : portrait qui respire dans un anneau à la couleur de sa famille ; lueur dorée quand il
## peut être activé, gris une fois utilisé.
func _gen_medal(ci: CanvasItem, c: Vector2, r: float, gid, mine: bool) -> void:
	if gid == null:
		return
	var g: Dictionary = Data.generals.get(str(gid), {})
	var fam := Data.fam_color(g.get("fam"))
	var used := bool((me() if mine else foe()).get("generalUsed", false))
	var armed := mine and (gen_zone >= 0 or gen_arming)
	var ready := mine and _can_general() and not armed
	if ready or armed:
		var k := 0.5 + 0.5 * sin(_time * TAU / 2.0)
		for i in 4:
			ci.draw_circle(c, r + 6 + i * 4 + 4 * k, Color(Data.GOLD, 0.06 + 0.03 * k), true, -1.0, true)
		var a := _time * 1.4
		for i in 3:
			ci.draw_arc(c, r + 7, a + i * TAU / 3, a + i * TAU / 3 + 1.2, 16, Color("ffd36b", 0.9), 2.5, true)
	# Anneau de bronze ciselé : petites dents tout autour.
	ci.draw_circle(c + Vector2(0, 4), r + 9, Color(0, 0, 0, 0.6), true, -1.0, true)
	var rr := r + 8.0
	Mat.bevel(ci, Rect2(c - Vector2(rr, rr), Vector2(rr, rr) * 2.0), rr, 9.0, Mat.BRASS, 1.0)
	for i in 4:
		Mat.rivet(ci, c + Vector2.from_angle(PI * 0.25 + i * PI * 0.5) * (r + 3.5), 2.4)
	var breath := 1.0 if used else 1.0 + 0.03 * (0.5 + 0.5 * sin(_time * TAU / 4.6))
	Gfx.portrait(ci, gid, c, r * breath, fam if not used else Color(0.45, 0.42, 0.4))
	if used:
		ci.draw_circle(c, r, Color(0.1, 0.1, 0.1, 0.6), true, -1.0, true)
		Gfx.text_fit(ci, Data.font_sc, c, "UTILISÉ" if g.get("activate", false) else "DÉCLENCHÉ", r * 1.9, 13, Color(1, 0.9, 0.75, 0.85), 3)


## Nom du général, son titre et son état, à côté du médaillon.
func _gen_label(ci: CanvasItem, gid, mine: bool, at: Vector2, align: int) -> void:
	if gid == null:
		return
	var g: Dictionary = Data.generals.get(str(gid), {})
	var used := bool((me() if mine else foe()).get("generalUsed", false))
	var armed := mine and (gen_zone >= 0 or gen_arming)
	var ready := mine and _can_general() and not armed
	var parts := str(g.get("name", "")).split(",", true, 1)
	var short := parts[0].strip_edges()
	var note := str(g.get("kind", ""))
	if armed:
		note = "Activé ce tour" if not gen_arming else "Touchez une zone"
	elif used:
		note = "Utilisé" if g.get("activate", false) else "Déclenché"
	elif ready:
		note = "Toucher pour activer" + (" · %d sceau%s" % [int(g.activateCost), "x" if int(g.activateCost) > 1 else ""] if int(g.get("activateCost", 0)) > 0 else "")
	var wmax := 170.0
	var fnt := Data.fam_font(g.get("fam"))
	var fs := 22
	while fs > 14 and fnt.get_string_size(short, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > wmax:
		fs -= 1
	_text(ci, fnt, at, short, fs, Color("fff1d6"), align)
	var chip_col := Data.GOLD if ready or armed else Data.fam_color(g.get("fam")).lightened(0.2)
	_text(ci, Data.font_bold, at + Vector2(0, 24), note, 15, chip_col if ready or armed else Color(1, 0.9, 0.75, 0.75), align)


func _draw_speaker(b: Button) -> void:
	var c := b.size * 0.5
	var col := Color("f1e6cf")
	b.draw_colored_polygon(PackedVector2Array([c + Vector2(-13, -5), c + Vector2(-7, -5), c + Vector2(0, -12), c + Vector2(0, 12), c + Vector2(-7, 5), c + Vector2(-13, 5)]), col)
	if Sfx.sound_on:
		b.draw_arc(c + Vector2(1, 0), 7, -0.8, 0.8, 12, col, 2.0, true)
		b.draw_arc(c + Vector2(1, 0), 12, -0.8, 0.8, 12, col, 2.0, true)
	else:
		b.draw_line(c + Vector2(4, -6), c + Vector2(14, 6), Color("f07a66"), 2.5, true)
		b.draw_line(c + Vector2(14, -6), c + Vector2(4, 6), Color("f07a66"), 2.5, true)


func _draw_door(b: Button) -> void:
	var c := b.size * 0.5
	var col := Color("f1e6cf")
	b.draw_polyline(PackedVector2Array([c + Vector2(-2, -12), c + Vector2(-12, -12), c + Vector2(-12, 12), c + Vector2(-2, 12)]), col, 2.5, true)
	b.draw_line(c + Vector2(-5, 0), c + Vector2(12, 0), col, 2.5, true)
	b.draw_polyline(PackedVector2Array([c + Vector2(6, -6), c + Vector2(12, 0), c + Vector2(6, 6)]), col, 2.5, true)


func _text(ci: CanvasItem, font: Font, at: Vector2, s: String, fs: int, col: Color, align := HORIZONTAL_ALIGNMENT_LEFT) -> void:
	var w := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var x := at.x - w if align == HORIZONTAL_ALIGNMENT_RIGHT else at.x - w * 0.5 if align == HORIZONTAL_ALIGNMENT_CENTER else at.x
	ci.draw_string_outline(font, Vector2(x, at.y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 4, Color(0, 0, 0, 0.7))
	ci.draw_string(font, Vector2(x, at.y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)


# ————— Jeu automatique (essais et captures) —————

func _auto_step() -> void:
	if not _can_plan():
		return
	var turn := int(view.get("turn", 0))
	await get_tree().create_timer(0.9).timeout
	if not _can_plan() or int(view.get("turn", 0)) != turn or not pending.is_empty():
		return
	# Pose les cartes les plus chères qu'il peut payer, dans la zone où il est le plus en retard.
	var hand: Array = me().get("hand", []).duplicate()
	hand.sort_custom(func(a, b): return int(a.get("cost", 0)) > int(b.get("cost", 0)))
	for c in hand:
		if Data.card(c.id).get("x", false) or int(c.get("cost", 0)) > _seals_left():
			continue
		var best := -1
		var best_gap := 1 << 30
		for z in 3:
			if _room(z) <= 0:
				continue
			var gap := int(me().zonePower[z]) - int(foe().zonePower[z]) + pending.filter(func(p): return p.zone == z).size() * 3
			if gap < best_gap:
				best_gap = gap
				best = z
		if best >= 0:
			if drag_test and turn >= 2 and pending.is_empty():
				# Essai du glisser-déposer : vrais événements de souris, de la carte jusqu'à la zone.
				await _simulate_drag(int(c.uid), best)
				print("glisser-déposer : ", "posée" if pending.any(func(p): return p.uid == int(c.uid)) else "ÉCHEC")
				continue
			pending.append({"uid": int(c.uid), "zone": best, "cost": int(c.get("cost", 0))})
	if _can_general() and not _general().get("needsZone", false) and turn >= 5:
		gen_zone = 1
	_refresh()
	if turn == 1 or turn == 4:
		# Capture du plan avec une carte choisie et la carte en grand au tour 4.
		var h: Array = me().get("hand", []).filter(func(x): return not pending.any(func(p): return p.uid == int(x.uid)))
		if not h.is_empty():
			sel_hand = int(h[0].uid) if _affordable(h[0]) else -1
			_refresh()
		await get_tree().create_timer(0.6).timeout
		shot_requested.emit("plan-tour-%d" % turn)
		await get_tree().create_timer(0.3).timeout
		if turn == 4 and not h.is_empty():
			_show_detail(str(h[0].id), int(h[0].uid))
			await get_tree().create_timer(0.8).timeout
			shot_requested.emit("carte-en-grand")
			if detail:
				_close(detail)
				detail = null
		sel_hand = -1
		_refresh()
	await get_tree().create_timer(0.6).timeout
	_send_plan()
