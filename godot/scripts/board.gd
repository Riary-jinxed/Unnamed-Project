extends Control
## Plateau d'une partie : affiche la vue envoyée par le serveur (message « state ») et prépare le plan du tour.
## Comme l'appli web, rien n'est décidé ici : le serveur applique le plan (applyPlan) et renvoie chaque étape de la révélation.

signal new_game_requested
signal quit_requested
signal shot_requested(name: String)

const CardView := preload("res://scripts/card_view.gd")
const ZoneView := preload("res://scripts/zone_view.gd")

const HEAD_H := 96.0
const BAR_H := 118.0
const HAND_CARD := Vector2(146, 204)

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
var log_label: Label
var banner: Label
var detail: Control
var over_panel: Control
var _last_phase := ""
var _last_turn := 0
var _shots_taken := {}
var _prev_me := {}
var _sounds := {}           # bruitages à jouer à la fin de la mise à jour (un de chaque)
var _drag := {}             # carte touchée : { uid, start, offset, on }
var journal: Control


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg = ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://shaders/fond.gdshader")
	bg.material = mat
	add_child(bg)
	# En-têtes dessinés au-dessus du fond et sous les cartes.
	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.draw.connect(func(): _draw_hud(hud))
	add_child(hud)
	_add_embers()
	for z in 3:
		var zv := ZoneView.new()
		zv.zone = z
		zv.tapped.connect(_on_zone_tapped)
		add_child(zv)
		zones.append(zv)
	card_layer = Control.new()
	card_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(card_layer)
	fx_layer = Control.new()
	fx_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fx_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(fx_layer)

	log_label = Label.new()
	log_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	log_label.add_theme_font_size_override("font_size", 17)
	log_label.add_theme_color_override("font_color", Color(1, 0.93, 0.8, 0.85))
	log_label.add_theme_constant_override("outline_size", 4)
	log_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	log_label.mouse_filter = Control.MOUSE_FILTER_STOP
	log_label.tooltip_text = "Journal"
	log_label.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			_show_journal())
	add_child(log_label)

	end_btn = gold_button("Terminer le tour")
	end_btn.pressed.connect(_send_plan)
	add_child(end_btn)
	gen_btn = Button.new()
	gen_btn.flat = true
	gen_btn.focus_mode = Control.FOCUS_NONE
	gen_btn.pressed.connect(_on_general)
	add_child(gen_btn)

	banner = Label.new()
	banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	banner.add_theme_font_override("font", Data.font_title)
	banner.add_theme_font_size_override("font_size", 58)
	banner.add_theme_color_override("font_color", Color("ffe7a6"))
	banner.add_theme_constant_override("outline_size", 14)
	banner.add_theme_color_override("font_outline_color", Color(0.12, 0.05, 0.02, 0.95))
	banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	banner.modulate.a = 0.0
	add_child(banner)
	resized.connect(_layout)
	_layout()


static func gold_button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", Data.font_title)
	b.add_theme_font_size_override("font_size", 22)
	for st in ["normal", "hover", "pressed", "disabled"]:
		var sb := StyleBoxFlat.new()
		sb.set_corner_radius_all(16)
		sb.set_border_width_all(3)
		sb.corner_detail = 8
		sb.anti_aliasing = true
		match st:
			"normal": sb.bg_color = Color("c4902f"); sb.border_color = Color("ffe39a")
			"hover": sb.bg_color = Color("d6a23a"); sb.border_color = Color("fff0c2")
			"pressed": sb.bg_color = Color("9c6c1f"); sb.border_color = Color("e8c26a")
			"disabled": sb.bg_color = Color("4a3a2a"); sb.border_color = Color("7a6650")
		sb.shadow_color = Color(0, 0, 0, 0.5)
		sb.shadow_size = 6
		sb.shadow_offset = Vector2(0, 4)
		b.add_theme_stylebox_override(st, sb)
	b.add_theme_color_override("font_color", Color("2a1606"))
	b.add_theme_color_override("font_hover_color", Color("2a1606"))
	b.add_theme_color_override("font_pressed_color", Color("1a0c02"))
	b.add_theme_color_override("font_disabled_color", Color("c8b496"))
	return b


func _redraw() -> void:
	if hud:
		hud.queue_redraw()


# ————— Mise en page —————

func _hand_top() -> float:
	return size.y - BAR_H - HAND_CARD.y - 10


func _layout() -> void:
	var w := size.x
	var top := HEAD_H + 6
	var col_w := (w - 24 - 16) / 3.0
	# Les zones prennent la hauteur de deux rangées de cartes par moitié, sans dépasser la place laissée par la main.
	var cw0 := (col_w - 16 - 6) * 0.5
	var need := 2.0 * (2.0 * cw0 * 1.4 + 6 + 44) + ZoneView.STRIP
	var bottom := minf(_hand_top() - 40, top + need)
	for z in zones.size():
		var zv: Control = zones[z]
		zv.position = Vector2(12 + z * (col_w + 8), top)
		zv.size = Vector2(col_w, bottom - top)
	var half := (bottom - top - ZoneView.STRIP) * 0.5
	var cw := (col_w - 16 - 6) * 0.5
	var ch := minf(cw * 1.4, (half - 36 - 6) * 0.5)
	card_size = Vector2(ch / 1.4, ch)
	log_label.position = Vector2(24, bottom + 4)
	log_label.size = Vector2(w - 48, 36)
	end_btn.size = Vector2(250, 66)
	end_btn.position = Vector2(w - 250 - 20, size.y - BAR_H + (BAR_H - 66) * 0.5)
	gen_btn.position = Vector2(14, size.y - BAR_H + 8)
	gen_btn.size = Vector2(BAR_H - 16, BAR_H - 16)
	banner.size = Vector2(w, 120)
	banner.position = Vector2(0, (top + bottom) * 0.5 - 60)
	banner.pivot_offset = banner.size * 0.5
	if not view.is_empty():
		_place_cards(false)
	_redraw()


# ————— Vue reçue —————

func set_view(v: Dictionary) -> void:
	var first := view.is_empty()
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
	_sync_cards(first)
	_place_cards(not first)
	_update_zones(first)
	_update_controls()
	_update_log()
	if not first and not old_me.is_empty():
		if bool(me().get("generalUsed", false)) and not bool(old_me.get("generalUsed", false)):
			_sound("general", "general")
	if phase != _last_phase or turn != _last_turn:
		if phase == "reveal" and _last_phase == "plan":
			_show_banner("Révélation")
		elif phase == "plan":
			_show_banner("Tour %d" % turn if turn < int(v.get("turns", 7)) else "Dernier tour")
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
			# Une carte qui arrive : de la pioche (main), du haut de l'écran (adversaire).
			if e.where == "hand":
				cv.size = HAND_CARD
				cv.position = Vector2(size.x + 40, _hand_top())
				if not quiet:
					_sound("draw")
			else:
				if not quiet and not e.mine:
					_sound("deal")
				cv.size = card_size
				cv.position = Vector2(size.x * 0.5 - card_size.x * 0.5, -card_size.y - 20) if not e.mine else Vector2(size.x * 0.5, size.y)
		var was_face_down := cv.face_down
		var had := was_revealed.has(uid)
		cv.set_data(e.d)
		# Posée ce tour : par vous en ce moment, ou déjà envoyée et en attente de la révélation.
		cv.pending = e.get("pending", false) or (e.where == "zone" and e.mine and not bool(e.d.get("revealed", false)))
		cv.moving = e.get("moving", false)
		cv.selected = uid == sel_hand or uid == sel_move
		cv.playable = e.where != "hand" or _affordable(e.d)
		var now_revealed := bool(e.d.get("revealed", false))
		if now_revealed and not had and not fresh:
			_reveal_fx(cv, was_face_down)
			var spell: bool = Data.card(e.d.get("id", "")).get("type", "C") == "S"
			_sound("spell" if spell else "reveal" if e.mine else "revealFoe", "spell" if spell else "place")
		elif now_revealed and had and last_power.has(uid) and e.d.get("power") != null and int(e.d.power) != int(last_power[uid]):
			var delta := int(e.d.power) - int(last_power[uid])
			_float_text(cv, delta)
			if delta > 0:
				_sound("up")
			elif e.mine:
				_sound("down")
			else:
				_sound("hit", "hit")
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
				# Créature détruite (ou sort parti à la défausse) : elle s'enfonce et s'éteint.
				if Data.card(cv.id).get("type", "C") == "C":
					_sound("destroy", "destroy")
				var tw := cv.create_tween().set_parallel()
				tw.tween_property(cv, "modulate", Color(1, 0.3, 0.2, 0.0), 0.45)
				tw.tween_property(cv, "scale", Vector2(0.6, 0.6), 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
				tw.chain().tween_callback(cv.queue_free)
			else:
				var tw := cv.create_tween()
				tw.tween_property(cv, "modulate:a", 0.0, 0.3)
				tw.tween_callback(cv.queue_free)
			was_revealed.erase(uid)


func _target_of(e: Dictionary) -> Dictionary:
	if e.where == "hand":
		var n: int = e.count
		var step := minf(HAND_CARD.x + 8, (size.x - 40 - HAND_CARD.x) / maxf(n - 1, 1))
		var x0 := (size.x - (step * (n - 1) + HAND_CARD.x)) * 0.5
		var t: float = (e.index - (n - 1) * 0.5) / maxf(n * 0.5, 1.0)
		var lift := 26.0 if int(e.d.uid) == sel_hand else 0.0
		return {"pos": Vector2(x0 + e.index * step, _hand_top() + 14 + absf(t) * 12 - lift), "size": HAND_CARD, "rot": 0.0 if lift > 0 else t * 0.07, "z": 20 + e.index + (30 if lift > 0 else 0)}
	var zv: Control = zones[e.zone]
	var r: Rect2 = zv.slot_rect(e.mine, e.slot, card_size)
	return {"pos": zv.position + r.position, "size": card_size, "rot": 0.0, "z": 2 + e.slot}


func _place_cards(animate: bool) -> void:
	for uid in cards:
		var cv: CardView = cards[uid]
		var e: Dictionary = cv.get_meta("place")
		var t := _target_of(e)
		cv.z_index = t.z
		cv.pivot_offset = t.size * 0.5
		if animate:
			var tw := cv.create_tween().set_parallel().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			tw.tween_property(cv, "position", t.pos, 0.32)
			tw.tween_property(cv, "size", t.size, 0.32)
			tw.tween_property(cv, "rotation", t.rot, 0.32)
		else:
			cv.position = t.pos
			cv.size = t.size
			cv.rotation = t.rot


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
		zv.set_powers(int(mp[z]), int(fp[z]))
		zv.highlight = _can_plan() and ((sel_hand >= 0 and _room(z) > 0) or (sel_move >= 0 and _move_from(sel_move) != z and _room(z) > 0) or gen_arming)
		zv.general_here = gen_zone == z and _general().get("needsZone", false)
		zv.queue_redraw()


func _update_controls() -> void:
	var phase := str(view.get("phase", ""))
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
		end_btn.text = "Terminer le tour"
		end_btn.disabled = false


func _update_log() -> void:
	var lines: Array = view.get("log", [])
	for i in range(lines.size() - 1, -1, -1):
		if str(lines[i].get("kind", "")) != "turn":
			log_label.text = Data.render_log(lines[i], int(view.get("seat", 0)), view.get("names", []))
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
	if detail:
		return
	var cv: CardView = cards.get(uid)
	if cv == null:
		return
	var e: Dictionary = cv.get_meta("place")
	if not _can_plan():
		if not cv.face_down:
			_show_detail(cv.id)
		return
	if e.where == "hand":
		if sel_hand == uid:
			sel_hand = -1
		elif _affordable(e.d):
			sel_hand = uid
			sel_move = -1
			gen_arming = false
			Sfx.play("pick")
		else:
			Sfx.play("deny")
			Sfx.feel("deny")
			toast("Pas assez de sceaux.")
			_show_detail(cv.id)
			return
		_refresh()
		return
	if e.mine:
		if sel_hand >= 0 or sel_move >= 0 or gen_arming:
			_on_zone_tapped(e.zone)
			return
		for i in pending.size():
			if pending[i].uid == uid:
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
		_show_detail(cv.id)


func _on_zone_tapped(z: int) -> void:
	if detail or not _can_plan():
		return
	if gen_arming:
		gen_zone = z
		gen_arming = false
		Sfx.play("general")
	elif sel_hand >= 0:
		var c := _hand_card(sel_hand)
		if _room(z) <= 0:
			Sfx.play("deny")
			Sfx.feel("deny")
			toast("Cette zone est pleine.")
			return
		pending.append({"uid": sel_hand, "zone": z, "cost": _cost_of(c)})
		sel_hand = -1
		Sfx.play("place")
		Sfx.feel("place")
	elif sel_move >= 0:
		var from := _move_from(sel_move)
		if z != from and _room(z) > 0:
			moves.append({"uid": sel_move, "zone": z, "from": from})
			Sfx.play("place")
			Sfx.feel("place")
		sel_move = -1
	else:
		return
	_refresh()


func _on_general() -> void:
	if not _can_plan():
		return
	if gen_zone >= 0 or gen_arming:
		gen_zone = -1
		gen_arming = false
	elif _can_general():
		if _general().get("needsZone", false):
			gen_arming = true
			sel_hand = -1
			sel_move = -1
			toast("Touchez la zone où activer votre général.")
		else:
			gen_zone = 1
			Sfx.play("general")
	else:
		toast(str(_general().get("text", "")))
	_refresh()


func _refresh() -> void:
	_sync_cards()
	_place_cards(true)
	_update_zones()
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
	end_btn.text = "En attente…"
	end_btn.disabled = true


## Retour Android : ferme la carte en grand ou le journal.
func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		if detail:
			detail.queue_free()
			detail = null
		elif journal:
			journal.queue_free()
			journal = null


# ————— Glisser-déposer —————
# Une carte de la main (ou une carte déplaçable du plateau) se pose en la glissant sur une zone ; un simple toucher marche toujours.

func _on_card_pressed(uid: int) -> void:
	var cv: CardView = cards.get(uid)
	if cv == null:
		return
	_drag = {"uid": uid, "start": get_global_mouse_position(), "offset": get_global_mouse_position() - cv.position, "on": false}


func _input(e: InputEvent) -> void:
	if _drag.is_empty():
		return
	var cv: CardView = cards.get(_drag.uid)
	if cv == null:
		_drag = {}
		return
	if e is InputEventMouseMotion:
		var p := get_global_mouse_position()
		if not _drag.on and p.distance_to(_drag.start) > 14.0 and _draggable(cv):
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
			cv.z_index = 120
			cv.rotation = 0.0
			cv.create_tween().tween_property(cv, "scale", Vector2(1.08, 1.08), 0.12)
			Sfx.play("pick")
		if _drag.on:
			cv.position = p - _drag.offset
	elif e is InputEventMouseButton and not e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		var d := _drag
		_drag = {}
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


func _simulate_drag(uid: int, z: int) -> void:
	var cv: CardView = cards[uid]
	var from := cv.get_global_rect().get_center()
	var to: Vector2 = (zones[z] as Control).get_global_rect().get_center() + Vector2(0, 120)
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
	for z in 3:
		var zv: Control = zones[z]
		var r: Rect2 = zv.get_global_rect()
		r.position.y += r.size.y * 0.35
		r.size.y *= 0.65
		if r.grow(6).has_point(p):
			return z
	return -1


# ————— Sons —————

func _sound(name: String, haptic := "") -> void:
	_sounds[name] = haptic


func _flush_sounds() -> void:
	var i := 0
	for name in _sounds:
		var h: String = _sounds[name]
		get_tree().create_timer(0.05 * i).timeout.connect(func():
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
	p.initial_velocity_min = 60
	p.initial_velocity_max = 140
	p.scale_amount_min = 1.5
	p.scale_amount_max = 3.5
	p.orbit_velocity_min = 0.0
	var grad := Gradient.new()
	grad.set_color(0, Color(1.0, 0.7, 0.3, 0.0))
	grad.add_point(0.2, Color(1.0, 0.72, 0.32, 0.55))
	grad.set_color(grad.get_point_count() - 1, Color(1.0, 0.5, 0.2, 0.0))
	p.color_ramp = grad
	add_child(p)
	resized.connect(func():
		p.position = Vector2(size.x * 0.5, size.y + 40)
		p.emission_rect_extents = Vector2(size.x * 0.6, 10))


## Journal de la partie et réglages (son, vibrations) ; un toucher hors du panneau le referme.
func _show_journal() -> void:
	if journal or view.is_empty():
		return
	journal = Control.new()
	journal.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	journal.z_index = 180
	var veil := ColorRect.new()
	veil.color = Color(0.02, 0.01, 0.0, 0.75)
	veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	journal.add_child(veil)
	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.09, 0.06, 0.045, 0.98)
	sb.border_color = Data.GOLD_DARK
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(18)
	sb.set_content_margin_all(18)
	panel.add_theme_stylebox_override("panel", sb)
	panel.position = Vector2(24, HEAD_H)
	panel.size = Vector2(size.x - 48, size.y - HEAD_H - BAR_H)
	journal.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	panel.add_child(col)
	var title := Label.new()
	title.text = "Journal"
	title.add_theme_font_override("font", Data.font_title)
	title.add_theme_font_size_override("font_size", 30)
	title.add_theme_color_override("font_color", Data.GOLD)
	col.add_child(title)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	var lines := VBoxContainer.new()
	lines.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(lines)
	for line in view.get("log", []):
		var l := Label.new()
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.text = Data.render_log(line, int(view.get("seat", 0)), view.get("names", []))
		if str(line.get("kind", "")) == "turn":
			l.add_theme_font_override("font", Data.font_title)
			l.add_theme_color_override("font_color", Data.GOLD)
			l.add_theme_font_size_override("font_size", 22)
		else:
			l.add_theme_font_size_override("font_size", 20)
			l.add_theme_color_override("font_color", Color("efe1c6"))
		lines.add_child(l)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	col.add_child(row)
	for opt in [["Son", "sound_on"], ["Vibrations", "haptics_on"]]:
		var c := CheckButton.new()
		c.text = opt[0]
		c.button_pressed = Sfx.get(opt[1])
		c.add_theme_font_size_override("font_size", 22)
		c.toggled.connect(func(on: bool):
			if opt[1] == "sound_on":
				Sfx.set_sound(on)
			else:
				Sfx.haptics_on = on
				Sfx.save())
		row.add_child(c)
	veil.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed:
			var j := journal
			journal = null
			j.queue_free())
	add_child(journal)
	await get_tree().process_frame
	scroll.scroll_vertical = int(scroll.get_v_scroll_bar().max_value)


func _reveal_fx(cv: CardView, flip: bool) -> void:
	cv.pivot_offset = cv.size * 0.5
	cv.z_index += 40
	var tw := cv.create_tween()
	if flip:
		# Retournement : la carte s'écrase sur sa tranche montrant son dos, puis se rouvre de face.
		cv.face_down = true
		var data_id := cv.id
		cv.id = ""
		tw.tween_property(cv, "scale", Vector2(0.0, 1.12), 0.16).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.tween_callback(func():
			Sfx.play("flip")
			cv.face_down = false
			cv.id = data_id
			cv.queue_redraw())
		tw.tween_property(cv, "scale", Vector2(1.12, 1.12), 0.16).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	else:
		tw.tween_property(cv, "scale", Vector2(1.14, 1.14), 0.14).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func(): _burst(cv))
	tw.tween_property(cv, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func(): cv.z_index -= 40)
	cv.glow = 1.0
	cv.create_tween().tween_property(cv, "glow", 0.0, 0.9).set_delay(0.3)


func _burst(cv: CardView) -> void:
	var p := CPUParticles2D.new()
	p.position = cv.position + cv.size * 0.5
	p.amount = 34
	p.one_shot = true
	p.explosiveness = 0.95
	p.lifetime = 0.8
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = cv.size * 0.45
	p.direction = Vector2(0, -1)
	p.spread = 70
	p.initial_velocity_min = 60
	p.initial_velocity_max = 190
	p.gravity = Vector2(0, 160)
	p.scale_amount_min = 2.0
	p.scale_amount_max = 4.5
	var col: Color = Data.fam_color(Data.card(cv.id).get("fam")).lightened(0.25)
	var grad := Gradient.new()
	grad.set_color(0, Color(col, 1.0))
	grad.set_color(1, Color(Data.GOLD, 0.0))
	p.color_ramp = grad
	fx_layer.add_child(p)
	p.emitting = true
	get_tree().create_timer(1.2).timeout.connect(p.queue_free)


func _float_text(cv: CardView, delta: int) -> void:
	var l := Label.new()
	l.text = ("+%d" % delta) if delta > 0 else str(delta)
	l.add_theme_font_override("font", Data.font_title)
	l.add_theme_font_size_override("font_size", 34)
	l.add_theme_color_override("font_color", Color("b5ff8a") if delta > 0 else Color("ff8f80"))
	l.add_theme_constant_override("outline_size", 8)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	l.position = cv.position + Vector2(cv.size.x * 0.5 - 20, cv.size.y * 0.3)
	fx_layer.add_child(l)
	var tw := l.create_tween().set_parallel()
	tw.tween_property(l, "position:y", l.position.y - 50, 0.9).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(l, "modulate:a", 0.0, 0.9).set_delay(0.3)
	tw.chain().tween_callback(l.queue_free)


func _show_banner(text: String) -> void:
	banner.text = text
	banner.scale = Vector2(0.7, 0.7)
	var tw := banner.create_tween()
	tw.tween_property(banner, "modulate:a", 1.0, 0.15)
	tw.parallel().tween_property(banner, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_interval(0.7)
	tw.tween_property(banner, "modulate:a", 0.0, 0.35)


func toast(text: String) -> void:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", 20)
	l.add_theme_color_override("font_color", Color("fff1d0"))
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.08, 0.05, 0.03, 0.94)
	sb.border_color = Data.GOLD_DARK
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(12)
	sb.set_content_margin_all(12)
	l.add_theme_stylebox_override("normal", sb)
	l.size = Vector2(size.x - 120, 0)
	l.position = Vector2(60, _hand_top() - 110)
	fx_layer.add_child(l)
	var tw := l.create_tween()
	tw.tween_interval(1.6)
	tw.tween_property(l, "modulate:a", 0.0, 0.4)
	tw.tween_callback(l.queue_free)


## Carte en grand avec son texte ; un toucher la referme.
func _show_detail(id: String) -> void:
	if id == "" or detail:
		return
	var d := Data.card(id)
	detail = Control.new()
	detail.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	detail.mouse_filter = Control.MOUSE_FILTER_STOP
	detail.z_index = 200
	var veil := ColorRect.new()
	veil.color = Color(0.02, 0.01, 0.0, 0.82)
	veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	detail.add_child(veil)
	var big := CardView.new()
	big.set_data({"uid": -1, "id": id})
	big.mouse_filter = Control.MOUSE_FILTER_IGNORE
	big.size = Vector2(400, 560)
	big.position = Vector2((size.x - 400) * 0.5, size.y * 0.1)
	detail.add_child(big)
	var txt := Label.new()
	txt.text = "%s\n%s" % [", ".join(d.get("kw", [])), d.get("text", "")]
	txt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	txt.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	txt.add_theme_font_size_override("font_size", 24)
	txt.add_theme_color_override("font_color", Color("f6ead2"))
	txt.size = Vector2(size.x - 80, 200)
	txt.position = Vector2(40, big.position.y + 580)
	detail.add_child(txt)
	detail.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed:
			var dd := detail
			detail = null
			var tw := dd.create_tween()
			tw.tween_property(dd, "modulate:a", 0.0, 0.15)
			tw.tween_callback(dd.queue_free))
	add_child(detail)
	detail.modulate.a = 0.0
	big.scale = Vector2(0.85, 0.85)
	big.pivot_offset = big.size * 0.5
	var tw := detail.create_tween().set_parallel()
	tw.tween_property(detail, "modulate:a", 1.0, 0.15)
	tw.tween_property(big, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _game_over() -> void:
	var res: Dictionary = view.get("result", {}) if view.get("result") is Dictionary else {}
	var w := int(res.get("winner", -1))
	var seat := int(view.get("seat", 0))
	var title := "Victoire" if w == seat else "Égalité" if w < 0 else "Défaite"
	var tune := "win" if w == seat else "tie" if w < 0 else "lose"
	Sfx.play(tune)
	Sfx.feel(tune)
	_show_banner(title)
	await get_tree().create_timer(1.4).timeout
	over_panel = Control.new()
	over_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	over_panel.z_index = 150
	var veil := ColorRect.new()
	veil.color = Color(0.02, 0.01, 0.0, 0.7)
	veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	over_panel.add_child(veil)
	var l := Label.new()
	l.text = title
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_override("font", Data.font_title)
	l.add_theme_font_size_override("font_size", 72)
	l.add_theme_color_override("font_color", Color("ffe7a6") if w == seat else Color("e8d8c0"))
	l.add_theme_constant_override("outline_size", 16)
	l.add_theme_color_override("font_outline_color", Color(0.12, 0.05, 0.02))
	l.size = Vector2(size.x, 120)
	l.position = Vector2(0, size.y * 0.32)
	over_panel.add_child(l)
	var b := gold_button("Nouvelle partie")
	b.size = Vector2(320, 76)
	b.position = Vector2((size.x - 320) * 0.5, size.y * 0.32 + 170)
	b.pressed.connect(func(): new_game_requested.emit())
	over_panel.add_child(b)
	var q := LinkButton.new()
	q.text = "Retour à l'accueil"
	q.add_theme_font_size_override("font_size", 22)
	q.add_theme_color_override("font_color", Color(1, 0.9, 0.75, 0.75))
	q.position = Vector2((size.x - 200) * 0.5, b.position.y + 100)
	q.size = Vector2(200, 40)
	q.pressed.connect(func(): quit_requested.emit())
	over_panel.add_child(q)
	add_child(over_panel)
	over_panel.modulate.a = 0.0
	await over_panel.create_tween().tween_property(over_panel, "modulate:a", 1.0, 0.4).finished
	shot_requested.emit("fin")


# ————— En-têtes (dessinés) —————

func _draw_hud(ci: Control) -> void:
	if view.is_empty():
		return
	var f := foe()
	var m := me()
	# Adversaire, en haut.
	Gfx.fill_round(ci, Rect2(8, 8, size.x - 16, HEAD_H - 12), 16, Color(0.06, 0.04, 0.03, 0.85))
	Gfx.frame_round(ci, Rect2(8, 8, size.x - 16, HEAD_H - 12), 16, Color(Data.GOLD_DARK, 0.8), 1.5)
	Gfx.portrait(ci, f.get("general"), Vector2(52, HEAD_H * 0.5 + 2), 36, Data.fam_color(Data.generals.get(str(f.get("general")), {}).get("fam")))
	_text(ci, Data.font_title, Vector2(100, 40), str(f.get("name", "")), 22, Color("f3e3c3"))
	_text(ci, Data.font_body, Vector2(100, 68), str(Data.generals.get(str(f.get("general")), {}).get("name", "")), 17, Color(1, 0.9, 0.75, 0.7))
	var info := "Main %d · Pioche %d" % [int(f.get("handCount", 0)), int(f.get("deckCount", 0))]
	_text(ci, Data.font_body, Vector2(size.x - 24, 40), info, 17, Color(1, 0.9, 0.75, 0.75), HORIZONTAL_ALIGNMENT_RIGHT)
	var t := "Tour %d / %d" % [int(view.get("turn", 1)), int(view.get("turns", 7))]
	_text(ci, Data.font_title, Vector2(size.x - 24, 70), t, 20, Data.GOLD, HORIZONTAL_ALIGNMENT_RIGHT)
	if bool(view.get("ready", {}).get("foe", false)) and str(view.get("phase", "")) == "plan":
		_text(ci, Data.font_bold, Vector2(size.x * 0.56, 70), "a joué", 17, Color("9be38a"), HORIZONTAL_ALIGNMENT_CENTER)
	# Vous, en bas : général (bouton), sceaux.
	var by := size.y - BAR_H
	Gfx.fill_round(ci, Rect2(8, by + 4, size.x - 16, BAR_H - 12), 18, Color(0.06, 0.04, 0.03, 0.85))
	Gfx.frame_round(ci, Rect2(8, by + 4, size.x - 16, BAR_H - 12), 18, Color(Data.GOLD_DARK, 0.8), 1.5)
	var g := _general()
	var gc := Vector2(14 + (BAR_H - 16) * 0.5, by + BAR_H * 0.5 - 2)
	var ring := Data.fam_color(g.get("fam"))
	if gen_zone >= 0 or gen_arming:
		ring = Color("ffd36b")
		ci.draw_circle(gc, 50, Color(1, 0.8, 0.3, 0.25), true, -1.0, true)
	Gfx.portrait(ci, m.get("general"), gc, 42, ring)
	if g.get("activate", false):
		var state := "utilisé" if bool(m.get("generalUsed", false)) else "activé" if gen_zone >= 0 else "zone ?" if gen_arming else "prêt" if _can_general() else ""
		if state != "":
			_text(ci, Data.font_bold, gc + Vector2(0, 52), state, 15, Color("ffd36b"), HORIZONTAL_ALIGNMENT_CENTER)
	# Sceaux : une gemme par sceau, pleine s'il reste à dépenser.
	var total := int(m.get("seals", 0))
	var left := _seals_left() if _can_plan() else total
	var sx := 128.0
	_text(ci, Data.font_title, Vector2(sx, by + 36), "Sceaux %d / %d" % [maxi(left, 0), total], 20, Color("bcd6ff"))
	for i in mini(total, 10):
		var c := Vector2(sx + 12 + i * 26, by + 70)
		var full := i < left
		var gem := PackedVector2Array([c + Vector2(0, -11), c + Vector2(9, 0), c + Vector2(0, 11), c + Vector2(-9, 0)])
		ci.draw_colored_polygon(gem, Color("5aa0ff") if full else Color(0.2, 0.25, 0.35, 0.8))
		ci.draw_polyline(gem + PackedVector2Array([gem[0]]), Color("cfe3ff") if full else Color(0.4, 0.45, 0.55), 1.5, true)


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
		sel_hand = -1
		await get_tree().create_timer(0.5).timeout
		shot_requested.emit("plan-tour-%d" % turn)
	await get_tree().create_timer(0.6).timeout
	_send_plan()
