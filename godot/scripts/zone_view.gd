extends Control
## Une des trois zones, comme dans l'appli : moitié de l'adversaire en haut, la vôtre en bas, chacune sur l'illustration de son terrain,
## et au milieu la puissance de l'adversaire, le nom de la zone et la vôtre. Le camp qui mène colore le cadre et la lueur de la zone.
## Les cartes ne sont pas des enfants de la zone : le plateau les place sur un calque commun pour pouvoir les animer d'une zone à l'autre.

signal tapped(zone: int)

const STRIP := 50.0

var zone := 0
var my_terrain = null
var foe_terrain = null
var my_power := 0
var foe_power := 0
var highlight := false      # une carte choisie peut être posée ici
var drop_hover := false     # une carte glissée est au-dessus de la zone
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
var flare := 0.0:           # éclat du cadre quand la zone change de camp ou à la fin de la partie
	set(v):
		flare = v
		queue_redraw()


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	resized.connect(queue_redraw)
	var tw := create_tween().set_loops()
	tw.tween_property(self, "shine", 1.0, 0.8).set_trans(Tween.TRANS_SINE)
	tw.tween_property(self, "shine", 0.0, 0.8).set_trans(Tween.TRANS_SINE)


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		if half_rect(true).grow(4).has_point(e.position) or e.position.y > size.y * 0.4:
			tapped.emit(zone)
		accept_event()


## Camp qui mène la zone : 1 vous, -1 l'adversaire, 0 égalité.
func leader() -> int:
	return signi(my_power - foe_power)


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


## Centre d'un chiffre de puissance (pour les nombres qui s'envolent), en coordonnées de la zone.
func power_pos(mine: bool) -> Vector2:
	var y := (size.y - STRIP) * 0.5 + STRIP * 0.5
	return Vector2(size.x - 24.0, y) if mine else Vector2(24.0, y)


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
	var full := Rect2(Vector2.ZERO, size)
	var rad := 12.0
	var lead := leader()
	var side_col: Color = Data.MINE if lead > 0 else Data.FOE
	# Pierre sombre sous les terrains.
	Gfx.fill_round(self, full, rad, Color(0.05, 0.035, 0.027, 0.88))
	for mine in [false, true]:
		var hr := half_rect(mine)
		var terrain = my_terrain if mine else foe_terrain
		var tex := Data.terrain_tex(terrain)
		var hrad := 10.0
		var inner := hr.grow(-3)
		if tex:
			var uv := Gfx.cover_uv(tex, Rect2(0, 0, 1, 1), inner.size, Vector2(0.5, 0.5))
			Gfx.tex_round(self, tex, inner, uv, hrad, Color(0.7, 0.66, 0.62))
			# Plus sombre vers le milieu de la zone, où se lisent les puissances.
			Gfx.vgrad_round(self, inner, hrad, [0.0, 1.0], [0.0, 0.6] if not mine else [0.6, 0.0])
		else:
			# Terrain pas encore révélé (il l'est au début des tours 1 à 3) : places en pointillés.
			Gfx.fill_round(self, inner, hrad, Color(0.07, 0.05, 0.04, 0.6))
		# Places vides : contours en pointillés, comme dans l'appli.
		if tex == null:
			Gfx.text_fit(self, Data.font_body, Vector2(inner.get_center().x, inner.position.y + 16.0 if not mine else inner.end.y - 16.0), "Terrain à venir", inner.size.x - 10, 15, Color(1, 0.92, 0.8, 0.5))
		if terrain != null:
			var tname := str(Data.terrains.get(str(terrain), {}).get("name", ""))
			var chip_y := inner.position.y + 14.0 if not mine else inner.end.y - 14.0
			var fw := minf(Data.font_bold.get_string_size(tname, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x + 18, inner.size.x - 8)
			var chip := Rect2(inner.get_center().x - fw * 0.5, chip_y - 13, fw, 26)
			Gfx.fill_round(self, chip, 7, Color(0.16, 0.11, 0.07, 0.95))
			Gfx.frame_round(self, chip, 7, Color("e3b552"), 1.5)
			Gfx.text_fit(self, Data.font_bold, chip.get_center(), tname, chip.size.x - 10, 15, Color("ffe7a6"))
		if mine and (highlight or drop_hover):
			Gfx.fill_round(self, inner, hrad, Color(Data.GOLD, (0.22 if drop_hover else 0.06 + 0.08 * shine)))
			Gfx.frame_round(self, inner, hrad, Color(Data.GOLD, 1.0 if drop_hover else 0.55 + 0.45 * shine), 3.0)
	# Cadre : couleur du camp qui mène, avec une lueur ; bronze sombre à égalité.
	if lead != 0:
		for i in 3:
			var k := (3 - i) * 2.5
			Gfx.frame_round(self, full.grow(k), rad + k, Color(side_col, (0.1 + 0.25 * flare) * (i + 1) / 3.0), 2.0)
		Gfx.frame_round(self, full, rad, Color(side_col, 0.85 + 0.15 * flare), 2.0 + 2.0 * flare)
	else:
		Gfx.frame_round(self, full, rad, Color("4a3622"), 1.5)
	# Bandeau du milieu : puissance de l'adversaire à gauche, nom de la zone, la vôtre à droite.
	var strip := Rect2(2, (size.y - STRIP) * 0.5 + 3, size.x - 4, STRIP - 6)
	Gfx.fill_round(self, strip, 8, Color(0.04, 0.028, 0.02, 0.9))
	var c := strip.get_center()
	var zname := str(Data.zones[zone]).to_upper() if zone < Data.zones.size() else ""
	Gfx.text_fit(self, Data.font_title, c, zname, strip.size.x - 100, 15, Color(1, 0.92, 0.78, 0.72))
	_power(power_pos(false), foe_power, lead < 0, Data.FOE, pulse_foe)
	_power(power_pos(true), my_power, lead > 0, Data.MINE, pulse_me)
	if general_here:
		Gfx.text_fit(self, Data.font_bold, Vector2(c.x, strip.end.y - 6), "Général", strip.size.x * 0.4, 12, Color("ffd36b"), 3)


## Chiffre de puissance d'un camp : grossit quand il change, souligné quand ce camp mène.
func _power(at: Vector2, v: int, lead: bool, col: Color, pulse: float) -> void:
	var fs := int(30 * (1.0 + 0.45 * pulse))
	var s := str(v)
	if lead:
		draw_circle(at, 22 + 6 * shine, Color(col, 0.14), true, -1.0, true)
	Gfx.text_fit(self, Data.font_title, at, s, 60, fs, col.lightened(0.15 if lead else 0.0) if lead else Color(col, 0.75).lerp(Color(0.85, 0.8, 0.75), 0.35), 5)
	if lead:
		var w := Data.font_title.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 30).x
		draw_line(at + Vector2(-w * 0.5 - 2, 17), at + Vector2(w * 0.5 + 2, 17), col, 3.0, true)
