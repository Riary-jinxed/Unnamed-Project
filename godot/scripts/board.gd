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

const TOP_H := 60.0
const FOE_H := 104.0
const HEAD_H := TOP_H + FOE_H
const DOCK_H := 112.0
const HAND_CARD := Vector2(152, 208)
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
	bg.material = mat
	add_child(bg)
	_add_embers()
	# En-têtes dessinés au-dessus du fond et sous les cartes.
	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
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
	b.add_theme_font_override("font", Data.font_title)
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
	for y in 64:
		var t := y / 63.0
		var col: Color = stops[0].lerp(stops[1], t / 0.3) if t < 0.3 else stops[1].lerp(stops[2], (t - 0.3) / 0.4) if t < 0.7 else stops[2].lerp(stops[3], (t - 0.7) / 0.3)
		for x in 64:
			var d := Vector2(minf(x, 63 - x), minf(y, 63 - y))
			var corner := 14.0
			var inside := true
			if d.x < corner and d.y < corner:
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
	for st in ["normal", "hover", "pressed", "disabled"]:
		var sb := StyleBoxFlat.new()
		sb.set_corner_radius_all(10)
		sb.set_border_width_all(2)
		sb.corner_detail = 6
		sb.anti_aliasing = true
		sb.bg_color = {"normal": Color("3a2a1c"), "hover": Color("4a3624"), "pressed": Color("2a1d13"), "disabled": Color("2a2018")}[st]
		sb.border_color = {"normal": Color("8a6a3a"), "hover": Color("b08a4a"), "pressed": Color("6a5030"), "disabled": Color("4a3a2a")}[st]
		sb.border_width_bottom = 4 if st != "pressed" else 2
		sb.content_margin_left = 16
		sb.content_margin_right = 16
		sb.content_margin_top = 4 if st == "pressed" else 2
		sb.shadow_color = Color(0, 0, 0, 0.45)
		sb.shadow_size = 4
		sb.shadow_offset = Vector2(0, 2)
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
	return size.y - DOCK_H - HAND_CARD.y - 12


func _layout() -> void:
	var w := size.x
	var top := HEAD_H + 8
	# Les zones sont mises en page à plat, plus hautes que la place à l'écran : la perspective (Persp) les ramène
	# entre l'en-tête et la main, plus étroites et plus petites vers l'adversaire.
	var board_bottom := _hand_top() - 24
	var hf := Persp.setup(top, board_bottom - top, w * 0.5, 0.8)
	var col_w := (w - 12 - 10) / 3.0
	for z in zones.size():
		var zv: Control = zones[z]
		zv.position = Vector2(6 + z * (col_w + 5), top)
		zv.size = Vector2(col_w, hf)
	var half := (hf - ZoneView.STRIP) * 0.5
	var cw := (col_w - 8 - 5) * 0.5
	var ch := minf(cw * 1.4, (half - 30 - 5 - 8) * 0.5)
	card_size = Vector2(ch / 1.4, ch)
	log_label.position = Vector2(20, board_bottom)
	log_label.size = Vector2(w - 40, 24)
	var dy := size.y - DOCK_H
	end_btn.size = Vector2(236, 74)
	end_btn.position = Vector2(w - 236 - 12, dy + (DOCK_H - 74) * 0.5 + 2)
	gen_btn.position = Vector2(10, dy + 12)
	gen_btn.size = Vector2(212, DOCK_H - 22)
	quit_btn.size = Vector2(54, 46)
	quit_btn.position = Vector2(w - 54 - 10, 8)
	log_btn.size = Vector2(0, 46)
	log_btn.reset_size()
	log_btn.size.y = 46
	log_btn.position = Vector2(quit_btn.position.x - 10 - log_btn.size.x, 8)
	snd_btn.size = Vector2(54, 46)
	snd_btn.position = Vector2(log_btn.position.x - 10 - 54, 8)
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
	if not first and not old_me.is_empty():
		if bool(me().get("generalUsed", false)) and not bool(old_me.get("generalUsed", false)):
			_sound("general", "general")
			src = _general_fx(true)
			src_delay = 0.5
			src_col = Data.fam_color(_general().get("fam"))
	if not first and not prev.is_empty() and bool(foe().get("generalUsed", false)) and not bool(prev.get("foe", {}).get("generalUsed", false)):
		src = _general_fx(false)
		src_delay = 0.5
		src_col = Data.fam_color(Data.generals.get(str(foe().get("general", "")), {}).get("fam"))
	var fl = v.get("flash")
	if fl != null and cards.has(int(fl)) and src == null:
		var scv: CardView = cards[int(fl)]
		var t := _target_of(scv.get_meta("place"))
		src = _scr(t.pos + t.size * 0.5, t.persp > 0.5)
		src_delay = 0.62 if _just_revealed.has(int(fl)) else 0.05
		src_col = Data.fam_color(Data.card(scv.id).get("fam"))
		if not _just_revealed.has(int(fl)) and not _events.is_empty():
			_act_pulse(scv)
		_events = _events.filter(func(ev): return ev.cv != scv)
	if not first:
		_play_events(src, src_delay, src_col, zone_before)
	if phase != _last_phase or turn != _last_turn:
		if phase == "reveal" and _last_phase == "plan":
			_banner("Révélation", "Les cartes se retournent", Data.FOE)
			_flash(Data.FOE, 0.18)
		elif phase == "plan":
			var last := turn >= int(v.get("turns", 7))
			_banner("Dernier tour" if last else "Tour %d" % turn, "sur %d" % int(v.get("turns", 7)), Color("f07a66") if last else Data.GOLD)
			_sound("turn", "turn")
		elif phase == "over":
			_game_over()
	_flush_sounds()
	_last_phase = phase
	_last_turn = turn
	_redraw()
	if auto_play:
		_auto_step()


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
				cv.size = HAND_CARD
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
		var cw := HAND_CARD.x
		var step := minf(cw * 0.86, (size.x - 24 - cw) / maxf(n - 1, 1))
		var x0 := (size.x - (step * (n - 1) + cw)) * 0.5
		var t: float = e.index - (n - 1) * 0.5
		var rot := t * minf(0.075, 0.36 / maxf(n - 1, 1))
		var x: float = x0 + e.index * step
		if int(e.d.uid) == sel_hand:
			return {"pos": Vector2(x, _hand_top() - 30), "size": HAND_CARD, "rot": 0.0, "z": 60, "scale": 1.08, "persp": 0.0}
		return {"pos": Vector2(x, _hand_top() + 8 + 700.0 * (1.0 - cos(rot))), "size": HAND_CARD, "rot": rot, "z": 20 + e.index, "scale": 1.0, "persp": 0.0}
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
	hud.queue_redraw()


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
	var grad := Gradient.new()
	grad.set_color(0, Color(1.0, 0.63, 0.25, 0.0))
	grad.add_point(0.2, Color(1.0, 0.88, 0.63, 0.5))
	grad.set_color(grad.get_point_count() - 1, Color(1.0, 0.5, 0.2, 0.0))
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
		tw.tween_property(cv, "scale", Vector2(0.0, 1.12), 0.16).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.tween_callback(func():
			Sfx.play("flip")
			cv.face_down = false
			cv.id = data_id
			cv.queue_redraw())
		tw.tween_property(cv, "scale", Vector2(1.18, 1.18), 0.18).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	else:
		cv.scale = Vector2(0.0, 1.2)
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


## Effets d'une étape de la révélation : un projectile part de la source (carte qui agit, ou général) vers chaque cible,
## puis l'effet joue à l'impact : chiffre de bonus ou de malus, destruction, invocation, déplacement, pioche.
## Sans source connue (fin de tour, terrain), les effets jouent tout de suite.
func _play_events(src, delay: float, col: Color, zone_before: Array) -> void:
	var hit := delay
	for ev in _events:
		var cv: CardView = ev.cv
		var to := cv.position + cv.size * 0.5
		if ev.kind in ["draw", "summon", "move"]:
			var t := _target_of(cv.get_meta("place"))
			to = t.pos + t.size * 0.5
		to = Persp.proj(to)
		var kind: String = ev.kind
		var c: Color = col
		match kind:
			"power": c = Data.UP if ev.delta > 0 else Data.DOWN
			"destroy": c = Color("ff5a3c")
		var travel := 0.0
		if src != null and src.distance_to(to) > 20.0:
			travel = clampf(src.distance_to(to) / 1400.0, 0.22, 0.42)
			Fx.bolt(fx_layer, src, to, c, hit, travel, kind)
		var at := hit + travel
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


func _gen_center(mine: bool) -> Vector2:
	var r := _gen_rect(mine)
	return r.position + Vector2(r.size.y * 0.36 + 10, r.size.y * 0.5)


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
	col.add_child(_label("Journal", Data.font_title, 32, Data.GOLD))
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
	col.add_child(_label("Quitter la partie ?", Data.font_title, 30, Data.GOLD))
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

func _gen_rect(mine: bool) -> Rect2:
	if mine:
		return Rect2(gen_btn.position, gen_btn.size)
	return Rect2(size.x - 10 - 250, TOP_H + 6, 250, FOE_H - 12)


func _draw_hud(ci: Control) -> void:
	if view.is_empty():
		return
	var f := foe()
	var m := me()
	var w := size.x
	# Barre du haut : mode, tour et pastilles des tours.
	var turn := int(view.get("turn", 1))
	var turns := int(view.get("turns", 7))
	var last := turn >= turns
	_text(ci, Data.font_sc, Vector2(16, 22), "PARTIE CLASSÉE", 16, Color(1, 0.9, 0.75, 0.6))
	_text(ci, Data.font_sc, Vector2(16, 50), "TOUR", 17, Color(1, 0.9, 0.75, 0.75))
	var tx := 16.0 + Data.font_sc.get_string_size("TOUR ", HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
	var tcol := Color("f07a66") if last else Color("ffe08a")
	_text(ci, Data.font_title, Vector2(tx, 52), str(turn), 32, tcol)
	tx += Data.font_title.get_string_size(str(turn), HORIZONTAL_ALIGNMENT_LEFT, -1, 32).x
	_text(ci, Data.font_title, Vector2(tx + 2, 52), "/%d" % turns, 20, Color(1, 0.9, 0.75, 0.7))
	tx += 40
	for i in turns:
		var c := Vector2(tx + i * 16, 44)
		if i + 1 == turn:
			ci.draw_circle(c, 8, Color(tcol, 0.3), true, -1.0, true)
			ci.draw_circle(c, 5.5, tcol, true, -1.0, true)
		else:
			ci.draw_circle(c, 4.5, Color(0.7, 0.62, 0.52, 0.85) if i + 1 < turn else Color(0.4, 0.33, 0.27, 0.8), true, -1.0, true)
	# Adversaire : avatar, nom, niveau, compteurs ; son général à droite.
	var by := TOP_H
	var bar := Rect2(8, by + 2, w - 16, FOE_H - 6)
	_leather(ci, bar, Data.FOE)
	var names: Array = view.get("names", [])
	var fname := str(names[1 - _seat()]) if names.size() > 1 and names[1 - _seat()] != null else str(f.get("name", ""))
	var fbadge = _badge(false)
	_avatar(ci, Vector2(52, by + FOE_H * 0.5), 28, fname, Data.FOE, true)
	_text(ci, Data.font_title, Vector2(92, by + 38), fname, 25, Data.FOE.lightened(0.15))
	var nx := 92 + Data.font_title.get_string_size(fname, HORIZONTAL_ALIGNMENT_LEFT, -1, 25).x + 10
	if fbadge is Dictionary and fbadge.has("level"):
		_text(ci, Data.font_body, Vector2(nx, by + 37), "niv. %d" % int(fbadge.level), 17, Color(1, 0.9, 0.75, 0.6))
	var stats := "Sceaux %d   Main %d   Deck %d" % [int(f.get("seals", 0)), int(f.get("handCount", 0)), int(f.get("deckCount", 0))]
	_text(ci, Data.font_body, Vector2(92, by + 68), stats, 19, Color(1, 0.9, 0.75, 0.72))
	if bool(view.get("ready", {}).get("foe", false)) and str(view.get("phase", "")) == "plan":
		var chip := Rect2(nx + 64, by + 16, 64, 28)
		Gfx.fill_round(ci, chip, 14, Color("2e5a32"))
		Gfx.frame_round(ci, chip, 14, Color("9be38a"), 1.5)
		Gfx.text_fit(ci, Data.font_bold, chip.get_center(), "Prêt", 56, 17, Color("d8ffd0"))
	_gencard(ci, _gen_rect(false), f.get("general"), false)
	# Bas d'écran : votre général (bouton), vos sceaux, Valider.
	var dy := size.y - DOCK_H
	var dock := Rect2(-2, dy, w + 4, DOCK_H + 4)
	ci.draw_rect(dock, Color(0.08, 0.055, 0.04, 0.94))
	ci.draw_line(Vector2(0, dy), Vector2(w, dy), Color("c8902f"), 2.0)
	ci.draw_line(Vector2(0, dy + 3), Vector2(w, dy + 3), Color(0, 0, 0, 0.6), 2.0)
	_gencard(ci, _gen_rect(true), m.get("general"), true)
	var total := int(m.get("seals", 0))
	var left := _seals_left() if _can_plan() else total
	var sx := gen_btn.position.x + gen_btn.size.x + 16
	_text(ci, Data.font_sc, Vector2(sx, dy + 34), "SCEAUX", 17, Color(1, 0.9, 0.75, 0.7))
	var lx := sx + Data.font_sc.get_string_size("SCEAUX ", HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
	_text(ci, Data.font_title, Vector2(lx, dy + 36), str(maxi(left, 0)), 28, Color("ffe08a"))
	_text(ci, Data.font_title, Vector2(lx + Data.font_title.get_string_size(str(maxi(left, 0)), HORIZONTAL_ALIGNMENT_LEFT, -1, 28).x + 2, dy + 36), "/%d" % total, 18, Color(1, 0.9, 0.75, 0.7))
	# Pièces : pleines s'il reste à dépenser ; celles que coûterait la carte choisie clignotent.
	var sel_cost := 0
	if sel_hand >= 0:
		sel_cost = _cost_of(_hand_card(sel_hand))
	var per_row := 6
	var rad := 10.0 if total <= per_row else 8.5
	for i in total:
		var c := Vector2(sx + 11 + (i % per_row) * (rad * 2 + 5), dy + 58 + (i / per_row) * (rad * 2 + 4) + (0 if total > per_row else 6))
		var full := i < left
		if full:
			var blink := i >= left - sel_cost and sel_cost > 0
			var a := 0.45 + 0.55 * (0.5 + 0.5 * cos(_time * TAU)) if blink else 1.0
			ci.draw_circle(c, rad, Color("8f5f1c", a), true, -1.0, true)
			ci.draw_circle(c - Vector2(1, 1), rad * 0.82, Color("e3b552", a), true, -1.0, true)
			ci.draw_circle(c - Vector2(rad, rad) * 0.3, rad * 0.35, Color(1, 0.95, 0.75, 0.8 * a), true, -1.0, true)
		else:
			ci.draw_arc(c, rad * 0.8, 0, TAU, 24, Color(0.75, 0.62, 0.4, 0.6), 2.0, true)
	var my_name := "Main %d   Deck %d" % [int(m.get("handCount", 0)), int(m.get("deckCount", 0))]
	_text(ci, Data.font_body, Vector2(sx, dy + DOCK_H - 10), my_name, 17, Color(1, 0.9, 0.75, 0.55))
	# Valider : lueur dorée qui respire tant qu'on peut valider (playglow).
	if not end_btn.disabled:
		var gr := Rect2(end_btn.position, end_btn.size)
		var k := 0.5 + 0.5 * sin(_time * TAU / 2.6)
		for i in 4:
			var g := (4 - i) * (3.0 + 2.0 * k)
			Gfx.fill_round(ci, gr.grow(g), 16 + g, Color(1, 0.75, 0.3, 0.06 + 0.03 * k))


## Panneau de cuir d'un joueur, filet de la couleur de son camp à gauche.
func _leather(ci: CanvasItem, r: Rect2, side: Color) -> void:
	Gfx.fill_round(ci, r.grow(1), 12, Color(0, 0, 0, 0.6))
	Gfx.fill_round(ci, r, 12, Color("241a12"))
	Gfx.vgrad_round(ci, r, 12, [0.0, 1.0], [0.0, 0.35])
	Gfx.frame_round(ci, r, 12, Color("7a5a2c"), 1.5)
	Gfx.frame_round(ci, r.grow(-4), 9, Color(Data.GOLD, 0.18), 1.0)
	var band := Rect2(r.position, Vector2(5, r.size.y))
	for poly in Geometry2D.intersect_polygons(PackedVector2Array([band.position, Vector2(band.end.x, band.position.y), band.end, Vector2(band.position.x, band.end.y)]), Gfx.round_pts(r, 12)):
		ci.draw_colored_polygon(poly, side)


## Avatar : initiale dans un cercle cerclé de la couleur du camp, pastille verte de connexion.
func _avatar(ci: CanvasItem, c: Vector2, rad: float, name: String, side: Color, online: bool) -> void:
	ci.draw_circle(c + Vector2(0, 2), rad + 3, Color(0, 0, 0, 0.5), true, -1.0, true)
	ci.draw_circle(c, rad, Color("2a1d14"), true, -1.0, true)
	ci.draw_arc(c, rad, 0, TAU, 40, side, 3.0, true)
	Gfx.text_fit(ci, Data.font_title, c, name.substr(0, 1).to_upper(), rad * 1.4, int(rad * 1.1), side.lightened(0.25))
	if online:
		var conn: Array = view.get("connected", [true, true])
		var ok: bool = conn[1 - _seat()] if conn.size() > 1 else true
		ci.draw_circle(c + Vector2(rad * 0.72, rad * 0.72), 6, Color("1a1410"), true, -1.0, true)
		ci.draw_circle(c + Vector2(rad * 0.72, rad * 0.72), 4.5, Color("5fd06a") if ok else Color("e05a4a"), true, -1.0, true)


## Carte de général (gencard de l'appli) : portrait qui respire, « GÉNÉRAL », nom, titre, état.
func _gencard(ci: CanvasItem, r: Rect2, gid, mine: bool) -> void:
	if gid == null:
		return
	var g: Dictionary = Data.generals.get(str(gid), {})
	var fam := Data.fam_color(g.get("fam"))
	var side := me() if mine else foe()
	var used := bool(side.get("generalUsed", false))
	var armed := mine and (gen_zone >= 0 or gen_arming)
	var ready := mine and _can_general() and not armed
	var accent := Color("e3b552")
	if ready:
		var k := 0.5 + 0.5 * sin(_time * TAU / 2.4)
		for i in 3:
			var gg := (3 - i) * (3.0 + 3.0 * k)
			Gfx.fill_round(ci, r.grow(gg), 12 + gg, Color(accent, 0.07 + 0.04 * k))
	Gfx.fill_round(ci, r, 12, Color("120d0a") if not armed else Color("3a2a12"))
	Gfx.top_bar(ci, r, 12, 3.5, fam)
	Gfx.frame_round(ci, r, 12, accent if ready or armed else Color("5a4530"), 2.0 if ready or armed else 1.5)
	# Portrait : respire lentement, gris une fois utilisé.
	var pr := r.size.y * 0.36
	var pc := r.position + Vector2(pr + 10, r.size.y * 0.5 + 2)
	var breath := 1.0 if used else 1.0 + 0.04 * (0.5 + 0.5 * sin(_time * TAU / 4.6))
	Gfx.portrait(ci, gid, pc, pr * breath, fam if not used else Color(0.45, 0.42, 0.4))
	if used:
		ci.draw_circle(pc, pr, Color(0.1, 0.1, 0.1, 0.55), true, -1.0, true)
	var x := pc.x + pr + 10
	var tw := r.end.x - x - 8
	_text(ci, Data.font_sc, Vector2(x, r.position.y + 22), "GÉNÉRAL", 13, Color(1, 0.9, 0.75, 0.6))
	var parts := str(g.get("name", "")).split(",", true, 1)
	var short := parts[0].strip_edges()
	var epithet := parts[1].strip_edges() if parts.size() > 1 else ""
	Gfx.text_lines(ci, Data.fam_font(g.get("fam")), Rect2(x, r.position.y + 24, tw, 26), short, 21, Color("fff1d6"), 1, 3)
	if epithet != "":
		Gfx.text_lines(ci, Data.font_body, Rect2(x, r.position.y + 48, tw, 18), epithet, 15, Color(1, 0.9, 0.75, 0.75), 1)
	var note := ""
	if armed:
		note = "Activé ce tour" if not gen_arming else "Touchez une zone"
	elif used:
		note = "Utilisé" if g.get("activate", false) else "Déclenché"
	elif ready:
		note = "Activer" + (" · %d sceau%s" % [int(g.activateCost), "x" if int(g.activateCost) > 1 else ""] if int(g.get("activateCost", 0)) > 0 else "")
	elif g.get("activate", false):
		note = "Activable"
	else:
		note = str(g.get("kind", ""))
	var ny := r.end.y - 12
	var dx := x
	if g.get("activate", false):
		var dc := Vector2(x + 5, ny - 5)
		if ready or armed:
			ci.draw_circle(dc, 5, accent, true, -1.0, true)
		else:
			ci.draw_arc(dc, 4.5, 0, TAU, 16, Color(1, 0.9, 0.75, 0.5), 1.5, true)
		dx += 14
	Gfx.text_lines(ci, Data.font_bold, Rect2(dx, ny - 16, r.end.x - dx - 6, 18), note, 15, accent if ready or armed else Color(1, 0.9, 0.75, 0.7), 1)


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
