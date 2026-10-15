extends Control
## Une des trois zones : moitié de l'adversaire en haut, la vôtre en bas, puissances au milieu.
## Les cartes ne sont pas des enfants de la zone : le plateau les place sur un calque commun pour pouvoir les animer d'une zone à l'autre.

signal tapped(zone: int)

const STRIP := 58.0

var zone := 0
var name_text := ""
var my_terrain = null
var foe_terrain = null
var my_power := 0
var foe_power := 0
var highlight := false      # une carte choisie peut être posée ici
var general_here := false   # général activé sur cette zone
var pulse_me := 0.0:
	set(v):
		pulse_me = v
		queue_redraw()
var pulse_foe := 0.0:
	set(v):
		pulse_foe = v
		queue_redraw()
var shine := 0.0:
	set(v):
		shine = v
		queue_redraw()


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	resized.connect(queue_redraw)
	var tw := create_tween().set_loops()
	tw.tween_property(self, "shine", 1.0, 0.7).set_trans(Tween.TRANS_SINE)
	tw.tween_property(self, "shine", 0.0, 0.7).set_trans(Tween.TRANS_SINE)


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		if half_rect(true).has_point(e.position):
			tapped.emit(zone)
		accept_event()


func set_powers(me: int, foe: int) -> void:
	if me != my_power:
		_pop("pulse_me")
	if foe != foe_power:
		_pop("pulse_foe")
	my_power = me
	foe_power = foe
	queue_redraw()


func _pop(prop: String) -> void:
	var tw := create_tween()
	tw.tween_property(self, prop, 1.0, 0.12)
	tw.tween_property(self, prop, 0.0, 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


## Moitié d'un joueur : la vôtre (mine) en bas, celle de l'adversaire en haut.
func half_rect(mine: bool) -> Rect2:
	var h := (size.y - STRIP) * 0.5
	return Rect2(0, h + STRIP, size.x, h) if mine else Rect2(0, 0, size.x, h)


## Place d'une carte (0 à 3) dans une moitié, en coordonnées de la zone. Les places les plus près du milieu se remplissent d'abord.
func slot_rect(mine: bool, i: int, card_size: Vector2) -> Rect2:
	var hr := half_rect(mine)
	var gap := 6.0
	var row := (i % 4) / 2
	var col := i % 2
	var block := Vector2(card_size.x * 2 + gap, card_size.y * 2 + gap)
	var origin := hr.position + (hr.size - block) * 0.5
	var y_row := row if mine else 1 - row
	var p := origin + Vector2(col * (card_size.x + gap), y_row * (card_size.y + gap))
	if i >= 4:
		p += Vector2(8, 8)
	return Rect2(p, card_size)


func _draw() -> void:
	for mine in [false, true]:
		var hr := half_rect(mine)
		var terrain = my_terrain if mine else foe_terrain
		var tex := Data.terrain_tex(terrain)
		var rad := 12.0
		if tex:
			var uv := Gfx.cover_uv(tex, Rect2(0, 0, 1, 1), hr.size, Vector2(0.5, 0.5))
			Gfx.tex_round(self, tex, hr, uv, rad, Color(0.62, 0.58, 0.55))
			Gfx.shade_round(self, hr, rad, 0.0, Color(0.02, 0.01, 0.0, 0.55))
		else:
			# Terrain pas encore révélé (il l'est au début des tours 1 à 3).
			Gfx.fill_round(self, hr, rad, Color(0.09, 0.065, 0.05, 0.85))
			Gfx.text_fit(self, Data.font_title, hr.get_center(), "?", 40, 40, Color(Data.GOLD, 0.16))
		var edge: Color = Data.fam_color(Data.terrains.get(str(terrain), {}).get("fam")) if terrain != null else Color(Data.GOLD_DARK, 0.7)
		if mine and highlight:
			Gfx.fill_round(self, hr, rad, Color(Data.GOLD, 0.06 + 0.08 * shine))
			Gfx.frame_round(self, hr, rad, Color(Data.GOLD, 0.55 + 0.45 * shine), 3.0)
		else:
			Gfx.frame_round(self, hr, rad, Color(edge, 0.75), 1.5)
		if terrain != null:
			var tname := str(Data.terrains.get(str(terrain), {}).get("name", ""))
			var ty := hr.position.y + 12.0 if not mine else hr.end.y - 12.0
			Gfx.text_fit(self, Data.font_bold, Vector2(hr.get_center().x, ty), tname, hr.size.x - 16, 13, Color(1, 0.94, 0.82, 0.8), 3)
	# Bandeau du milieu : nom de la zone et puissances.
	var strip := Rect2(-2, (size.y - STRIP) * 0.5 + 4, size.x + 4, STRIP - 8)
	Gfx.fill_round(self, strip, 10, Color(0.05, 0.035, 0.03, 0.92))
	var lead_me := my_power > foe_power
	var lead_foe := foe_power > my_power
	Gfx.frame_round(self, strip, 10, Color(Data.GOLD, 0.95) if lead_me else Color("c0504a") if lead_foe else Color(Data.GOLD_DARK, 0.8), 2.0)
	var c := strip.get_center()
	var zname := str(Data.zones[zone]) if zone < Data.zones.size() else ""
	Gfx.text_fit(self, Data.font_title, Vector2(strip.position.x + strip.size.x * 0.2, c.y), zname, strip.size.x * 0.3, 13, Color(1, 0.92, 0.75, 0.7), 2)
	# Puissance de l'adversaire sur le bord haut du bandeau, la vôtre sur le bord bas : chacune du côté de sa moitié.
	_power(Vector2(c.x, strip.position.y + 2), foe_power, lead_foe, Color("ff9c8f"), pulse_foe)
	_power(Vector2(c.x, strip.end.y - 2), my_power, lead_me, Color("ffe08a"), pulse_me)
	if general_here:
		Gfx.text_fit(self, Data.font_bold, Vector2(strip.position.x + strip.size.x * 0.8, c.y), "Général", strip.size.x * 0.3, 13, Color("ffd36b"), 3)


func _power(at: Vector2, v: int, lead: bool, col: Color, pulse: float) -> void:
	var rad := 19.0 * (1.0 + 0.25 * pulse)
	if lead:
		draw_circle(at, rad * 1.45, Color(col, 0.18 + 0.1 * shine), true, -1.0, true)
	Gfx.badge(self, at, rad, Color("2a1a10") if not lead else Color("4a2c10"), col if lead else Color(0.6, 0.55, 0.5), str(v), col if lead else Color(0.92, 0.88, 0.82))
