class_name Fx
extends RefCounted
## Effets du plateau, repris de la couche PixiJS de l'appli (client/src/stage.js, stage-cards.js) : étincelles, anneaux,
## éclats, colonnes de lumière, traînée du glisser-déposer, bandeau de tour, fin de partie, carte en grand qui penche.

static var _dot: Texture2D


## Petit point flou : texture commune des particules.
static func dot_texture() -> Texture2D:
	if _dot == null:
		var img := Image.create(16, 16, false, Image.FORMAT_RGBA8)
		for y in 16:
			for x in 16:
				var d := Vector2(x - 7.5, y - 7.5).length() / 7.5
				img.set_pixel(x, y, Color(1, 1, 1, clampf(1.0 - d, 0.0, 1.0) ** 1.6))
		_dot = ImageTexture.create_from_image(img)
	return _dot


static func _burst(parent: Node, at: Vector2, amount: int, life: float) -> CPUParticles2D:
	var p := CPUParticles2D.new()
	p.position = at
	p.amount = amount
	p.one_shot = true
	p.explosiveness = 0.95
	p.lifetime = life
	p.texture = dot_texture()
	parent.add_child(p)
	p.emitting = true
	p.finished.connect(p.queue_free)
	return p


static func _fade(col: Color, white_every := false) -> Gradient:
	var g := Gradient.new()
	g.set_color(0, Color(col.lightened(0.3), 1.0) if not white_every else Color.WHITE)
	g.set_color(1, Color(col, 0.0))
	return g


## Révélation : éclat lumineux et étincelles de la couleur de la famille (une sur trois blanche).
static func sparkle(parent: Node, at: Vector2, size: Vector2, col: Color) -> void:
	var glow := _burst(parent, at, 1, 0.35)
	glow.scale_amount_min = size.x / 9.0
	glow.scale_amount_max = size.x / 9.0
	var gr := Gradient.new()
	gr.set_color(0, Color(col.lightened(0.4), 0.55))
	gr.set_color(1, Color(col, 0.0))
	glow.color_ramp = gr
	glow.gravity = Vector2.ZERO
	glow.initial_velocity_max = 0.0
	for white in [false, true]:
		var p := _burst(parent, at, 9 if not white else 5, 0.9)
		p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
		p.emission_rect_extents = size * 0.4
		p.direction = Vector2(0, -1)
		p.spread = 80
		p.initial_velocity_min = 80
		p.initial_velocity_max = 200
		p.gravity = Vector2(0, 260)
		p.scale_amount_min = 0.5
		p.scale_amount_max = 1.0
		p.color_ramp = _fade(col, white)


## Anneau aplati qui s'élargit et s'efface (impact sous une carte, poussière de pose, général).
static func ring(parent: Node, at: Vector2, radius: Vector2, col: Color, dur: float) -> void:
	var r := Ring.new()
	r.position = at
	r.radius = radius
	r.col = col
	parent.add_child(r)
	var tw := r.create_tween()
	tw.tween_property(r, "t", 1.0, dur).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_callback(r.queue_free)


class Ring extends Node2D:
	var radius := Vector2(40, 18)
	var col := Color.WHITE
	var t := 0.0:
		set(v):
			t = v
			queue_redraw()

	func _draw() -> void:
		var k := lerpf(0.5, 1.2, t)
		var pts := PackedVector2Array()
		for i in 33:
			var a := TAU * i / 32.0
			pts.append(Vector2(cos(a) * radius.x, sin(a) * radius.y) * k)
		draw_polyline(pts, Color(col, col.a * (1.0 - t)), 2.5, true)


## Carte de niveau astral : anneau violet, rayons et éclats qui partent en étoile.
static func astral(parent: Node, at: Vector2, w: float) -> void:
	ring(parent, at, Vector2(w, w) * 0.9, Color("c9b6ff"), 0.9)
	var p := _burst(parent, at, 12, 0.9)
	p.spread = 180
	p.initial_velocity_min = 160
	p.initial_velocity_max = 260
	p.gravity = Vector2.ZERO
	p.damping_min = 120
	p.damping_max = 180
	p.scale_amount_min = 0.7
	p.scale_amount_max = 1.2
	p.color_ramp = _fade(Color("a585e6"), true)


## Destruction : éclats qui tournent et tombent, étincelles orange.
static func shards(parent: Node, at: Vector2, size: Vector2, col: Color) -> void:
	var s := _burst(parent, at, 18, 1.0)
	s.texture = null
	s.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	s.emission_rect_extents = size * 0.4
	s.direction = Vector2(0, -1)
	s.spread = 70
	s.initial_velocity_min = 100
	s.initial_velocity_max = 260
	s.gravity = Vector2(0, 760)
	s.angular_velocity_min = -540
	s.angular_velocity_max = 540
	s.scale_amount_min = 4.0
	s.scale_amount_max = 9.0
	var g := Gradient.new()
	g.set_color(0, col.lightened(0.2))
	g.add_point(0.7, Color(col.darkened(0.3), 0.9))
	g.set_color(g.get_point_count() - 1, Color(col.darkened(0.5), 0.0))
	s.color_ramp = g
	var sp := _burst(parent, at, 10, 0.6)
	sp.spread = 180
	sp.initial_velocity_min = 90
	sp.initial_velocity_max = 220
	sp.gravity = Vector2(0, 300)
	sp.scale_amount_min = 0.5
	sp.scale_amount_max = 0.9
	sp.color_ramp = _fade(Color("ff9a40"))


## Colonne de lumière et étincelles qui montent (zone qui change de camp, fin de partie).
static func rise(parent: Node, at: Vector2, size: Vector2, col: Color) -> void:
	var glow := _burst(parent, at, 1, 0.6)
	glow.scale_amount_min = size.x / 6.0
	glow.scale_amount_max = size.x / 6.0
	var gr := Gradient.new()
	gr.set_color(0, Color(col, 0.5))
	gr.set_color(1, Color(col, 0.0))
	glow.color_ramp = gr
	glow.gravity = Vector2.ZERO
	glow.initial_velocity_max = 0.0
	var p := _burst(parent, at + Vector2(0, size.y * 0.2), 14, 1.4)
	p.explosiveness = 0.6
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2(size.x * 0.4, size.y * 0.2)
	p.direction = Vector2(0, -1)
	p.spread = 10
	p.initial_velocity_min = 70
	p.initial_velocity_max = 190
	p.gravity = Vector2.ZERO
	p.scale_amount_min = 0.6
	p.scale_amount_max = 1.1
	p.color_ramp = _fade(col)


## Grains de poussière qui glissent de côté sous une carte posée.
static func grains(parent: Node, at: Vector2, w: float) -> void:
	var p := _burst(parent, at, 8, 0.6)
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2(w * 0.4, 2)
	p.direction = Vector2(1, -0.2)
	p.spread = 180
	p.initial_velocity_min = 40
	p.initial_velocity_max = 95
	p.gravity = Vector2(0, 70)
	p.damping_min = 60
	p.damping_max = 90
	p.scale_amount_min = 0.25
	p.scale_amount_max = 0.45
	p.color_ramp = _fade(Color("c8b090"))


## Traînée d'étincelles dorées derrière une carte glissée.
static func trail() -> CPUParticles2D:
	var p := CPUParticles2D.new()
	p.emitting = false
	p.amount = 40
	p.lifetime = 0.7
	p.local_coords = false
	p.texture = dot_texture()
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 14
	p.direction = Vector2(0, -1)
	p.spread = 180
	p.initial_velocity_min = 5
	p.initial_velocity_max = 30
	p.gravity = Vector2(0, -20)
	p.scale_amount_min = 0.25
	p.scale_amount_max = 0.55
	p.color_ramp = _fade(Color("ffd36b"))
	return p


## Bandeau de tour (stage.js, 1,4 s) : la bande s'ouvre en hauteur, le titre arrive de la gauche en resserrant ses lettres,
## un reflet traverse la bande, puis tout monte un peu et s'efface.
class Banner extends Control:
	var title := ""
	var sub := ""
	var edge := Color("e8c26a")
	var t := 0.0:
		set(v):
			t = v
			queue_redraw()

	func play() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var tw := create_tween()
		tw.tween_property(self, "t", 1.0, 1.4)
		tw.tween_callback(queue_free)

	func _draw() -> void:
		var open := clampf(t / 0.12, 0.0, 1.0)
		var fade := 1.0 - clampf((t - 0.8) / 0.2, 0.0, 1.0)
		var lift := -12.0 * clampf((t - 0.8) / 0.2, 0.0, 1.0)
		var c := Vector2(size.x * 0.5, size.y * 0.5 + lift)
		var bh := 104.0 * open
		# Lueur, bande, filets.
		for i in 4:
			var g := (4 - i) * 14.0
			draw_rect(Rect2(0, c.y - bh * 0.5 - g, size.x, bh + g * 2), Color(edge, 0.035 * fade * open))
		draw_rect(Rect2(0, c.y - bh * 0.5, size.x, bh), Color(0.07, 0.045, 0.03, 0.86 * fade))
		draw_line(Vector2(0, c.y - bh * 0.5), Vector2(size.x, c.y - bh * 0.5), Color(edge, fade), 2.0)
		draw_line(Vector2(0, c.y + bh * 0.5), Vector2(size.x, c.y + bh * 0.5), Color(edge, fade), 2.0)
		if open < 1.0:
			return
		# Reflet qui traverse la bande.
		var sw := clampf((t - 0.15) / 0.4, 0.0, 1.0)
		if sw > 0.0 and sw < 1.0:
			var x := -120.0 + sw * (size.x + 240.0)
			draw_colored_polygon(PackedVector2Array([Vector2(x - 40, c.y - bh * 0.5), Vector2(x + 30, c.y - bh * 0.5), Vector2(x - 10, c.y + bh * 0.5), Vector2(x - 80, c.y + bh * 0.5)]), Color(1, 0.95, 0.85, 0.14 * fade))
		# Titre : glisse de la gauche, lettres qui se resserrent.
		var k := clampf((t - 0.05) / 0.2, 0.0, 1.0)
		var ease := 1.0 - pow(1.0 - k, 3.0)
		var spacing := lerpf(22.0, 4.0, clampf(t / 0.25, 0.0, 1.0))
		var font := Data.font_title
		var fs := 50
		var w := 0.0
		for ch in title:
			w += font.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + spacing
		w -= spacing
		var x := c.x - w * 0.5 - 60.0 * (1.0 - ease)
		var y := c.y + 12.0 - (10.0 if sub != "" else 0.0)
		for ch in title:
			draw_string_outline(font, Vector2(x, y), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 8, Color(0.08, 0.03, 0.0, fade * ease))
			draw_string(font, Vector2(x, y), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(edge.lightened(0.35), fade * ease))
			x += font.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + spacing
		if sub != "":
			var sw2 := Data.font_sc.get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 19).x
			draw_string(Data.font_sc, Vector2(c.x - sw2 * 0.5, c.y + 38), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 19, Color(1, 0.92, 0.78, 0.75 * fade * ease))


## Fin de partie (stage.js) : rayons qui tournent, halo qui respire, titre énorme qui tombe (victoire : choc et confettis ;
## défaite : chute qui rebondit, cendres ; égalité : gris).
class Ending extends Control:
	var outcome := "win"
	var title := ""
	var center := Vector2(360, 240)
	var t := 0.0
	var _confetti: CPUParticles2D

	func play() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		if outcome == "win":
			_confetti = CPUParticles2D.new()
			_confetti.amount = 90
			_confetti.lifetime = 3.2
			_confetti.one_shot = true
			_confetti.explosiveness = 0.85
			_confetti.position = Vector2(size.x * 0.5, -20)
			_confetti.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
			_confetti.emission_rect_extents = Vector2(size.x * 0.5, 10)
			_confetti.direction = Vector2(0, 1)
			_confetti.spread = 25
			_confetti.initial_velocity_min = 80
			_confetti.initial_velocity_max = 220
			_confetti.gravity = Vector2(0, 120)
			_confetti.angular_velocity_min = -360
			_confetti.angular_velocity_max = 360
			_confetti.scale_amount_min = 5
			_confetti.scale_amount_max = 9
			var g := Gradient.new()
			g.offsets = PackedFloat32Array([0.0, 0.25, 0.5, 0.75, 1.0])
			g.colors = PackedColorArray([Color("e2b93e"), Color("77a3e6"), Color("de5c56"), Color("4fbcad"), Color("a585e6")])
			_confetti.color_initial_ramp = g
			add_child(_confetti)
			get_tree().create_timer(0.3).timeout.connect(func(): _confetti.emitting = true)
		else:
			var ash := CPUParticles2D.new()
			ash.amount = 40
			ash.lifetime = 5.0
			ash.preprocess = 0.0
			ash.position = Vector2(size.x * 0.5, -10)
			ash.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
			ash.emission_rect_extents = Vector2(size.x * 0.5, 5)
			ash.direction = Vector2(0, 1)
			ash.spread = 20
			ash.initial_velocity_min = 30
			ash.initial_velocity_max = 70
			ash.gravity = Vector2(0, 10)
			ash.texture = Fx.dot_texture()
			ash.scale_amount_min = 0.3
			ash.scale_amount_max = 0.7
			ash.color = Color(0.55, 0.5, 0.48, 0.6) if outcome == "lose" else Color(0.8, 0.78, 0.75, 0.4)
			add_child(ash)
		if outcome == "win":
			var sp := CPUParticles2D.new()
			sp.amount = 40
			sp.one_shot = true
			sp.explosiveness = 0.9
			sp.lifetime = 1.2
			sp.position = center
			sp.texture = Fx.dot_texture()
			sp.spread = 180
			sp.initial_velocity_min = 150
			sp.initial_velocity_max = 380
			sp.gravity = Vector2(0, 200)
			sp.scale_amount_min = 0.6
			sp.scale_amount_max = 1.1
			var gg := Gradient.new()
			gg.set_color(0, Color("fff0b8"))
			gg.set_color(1, Color(1, 0.75, 0.3, 0.0))
			sp.color_ramp = gg
			add_child(sp)
			get_tree().create_timer(0.35).timeout.connect(func(): sp.emitting = true)

	func _process(dt: float) -> void:
		t += dt
		queue_redraw()

	func _draw() -> void:
		var gold := Color("ffd36b")
		var col: Color = gold if outcome == "win" else Color("e05a4a") if outcome == "lose" else Color("cfc6ba")
		var appear := clampf(t / 0.6, 0.0, 1.0)
		# Rayons.
		var speed := 0.075 if outcome == "win" else 0.03
		for i in 14:
			var a := TAU * i / 14.0 + t * speed * TAU * 0.25
			var p := PackedVector2Array([center, center + Vector2(cos(a - 0.06), sin(a - 0.06)) * 900, center + Vector2(cos(a + 0.06), sin(a + 0.06)) * 900])
			draw_colored_polygon(p, Color(col, 0.11 * appear))
		# Halo qui respire.
		var hr := 180.0 * (1.0 + 0.06 * sin(t * 2.0))
		for i in 6:
			draw_circle(center, hr * (1.0 - i * 0.15), Color(col, 0.05 * appear), true, -1.0, true)
		# Choc (victoire).
		if outcome == "win" and t > 0.3 and t < 1.0:
			var k := (t - 0.3) / 0.7
			draw_arc(center, 40 + 300 * k, 0, TAU, 64, Color(gold, 0.6 * (1.0 - k)), 4.0, true)
		if outcome == "win" and t > 0.25 and t < 0.55:
			draw_rect(Rect2(Vector2.ZERO, size), Color(1, 0.9, 0.6, 0.3 * (1.0 - (t - 0.25) / 0.3)))
		# Titre.
		var fs := 92
		var sc := 1.0
		var dy := 0.0
		var rot := 0.0
		if outcome == "win":
			var k := clampf(t / 0.9, 0.0, 1.0)
			sc = lerpf(1.8, 1.0, 1.0 - pow(1.0 - k, 4.0))
		elif outcome == "lose":
			var k := clampf(t / 0.7, 0.0, 1.0)
			var b := 1.0 - pow(1.0 - k, 2.0)
			dy = -120.0 * (1.0 - b) + (sin(k * PI * 3.0) * 10.0 * (1.0 - k) if k > 0.6 else 0.0)
			rot = -0.05 * (1.0 - k) + 0.03
		else:
			sc = lerpf(1.15, 1.0, clampf(t / 0.6, 0.0, 1.0))
		var font := Data.font_title
		var w := font.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_set_transform(center + Vector2(0, dy), rot, Vector2(sc, sc))
		var pos := Vector2(-w * 0.5, font.get_ascent(fs) * 0.4)
		draw_string_outline(font, pos + Vector2(0, 5), title, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 14, Color(0, 0, 0, 0.5 * appear))
		draw_string_outline(font, pos, title, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 12, Color(0.12, 0.04, 0.0, appear))
		draw_string(font, pos, title, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(col.lightened(0.3), appear))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## Carte en grand qui penche : sous le doigt quand on la touche, avec le téléphone (accéléromètre), sinon une lente dérive.
class Tilt extends Node:
	var card
	var _t := 0.0
	var _ref := Vector3.ZERO
	var _touch := Vector2.ZERO
	var _touch_on := false

	func _process(dt: float) -> void:
		_t += dt
		if card == null or not is_instance_valid(card):
			return
		var target := Vector2(sin(_t * 0.9) * 0.6, cos(_t * 0.7) * 0.4)
		var acc := Input.get_accelerometer()
		if acc.length() > 0.5:
			# La position de référence suit lentement la main, comme holo.js.
			_ref = _ref.lerp(acc, 0.02) if _ref != Vector3.ZERO else acc
			var d := acc - _ref
			target = Vector2(clampf(-d.x / 3.0, -1.0, 1.0), clampf(d.y / 3.0, -1.0, 1.0))
		if _touch_on:
			target = _touch
		card.tilt = card.tilt.lerp(target, 0.15)
		card.rotation = card.tilt.x * 0.035
		card.scale = Vector2.ONE * (1.0 + 0.015 * card.tilt.length()) if card.scale.x > 0.98 else card.scale

	func _input(e: InputEvent) -> void:
		if card == null or not is_instance_valid(card):
			return
		var r: Rect2 = card.get_global_rect()
		if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
			_touch_on = e.pressed and r.grow(30).has_point(e.position)
		if e is InputEventMouseMotion and _touch_on:
			var d: Vector2 = (e.position - r.get_center()) / (r.size * 0.5)
			_touch = Vector2(clampf(d.x, -1, 1), clampf(d.y, -1, 1))


## Projectile d'effet : une boule de lumière part de la carte qui agit, suit un arc et frappe la cible (petit éclat à l'impact).
static func bolt(parent: Node, from: Vector2, to: Vector2, col: Color, delay: float, travel: float, kind := "") -> void:
	var b := Bolt.new()
	b.from = from
	b.to = to
	b.col = col
	b.big = kind == "destroy"
	parent.add_child(b)
	b.visible = false
	var tw := b.create_tween()
	tw.tween_interval(delay)
	tw.tween_callback(func(): b.visible = true)
	tw.tween_property(b, "t", 1.0, travel).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.tween_callback(func():
		var p := _burst(parent, to, 10, 0.45)
		p.spread = 180
		p.initial_velocity_min = 60
		p.initial_velocity_max = 160
		p.gravity = Vector2.ZERO
		p.damping_min = 150
		p.damping_max = 220
		p.scale_amount_min = 0.5
		p.scale_amount_max = 0.9
		p.color_ramp = _fade(col, true)
		ring(parent, to, Vector2(26, 26), Color(col.lightened(0.3), 0.9), 0.3))
	tw.tween_property(b, "fade", 1.0, 0.25)
	tw.tween_callback(b.queue_free)


class Bolt extends Node2D:
	var from := Vector2.ZERO
	var to := Vector2.ZERO
	var col := Color.WHITE
	var big := false
	var fade := 0.0:
		set(v):
			fade = v
			queue_redraw()
	var t := 0.0:
		set(v):
			t = v
			queue_redraw()

	func _point(k: float) -> Vector2:
		# Arc : le point de contrôle est décalé sur le côté du trajet, vers le haut.
		var mid := (from + to) * 0.5
		var n := (to - from).orthogonal().normalized()
		if n.y > 0:
			n = -n
		var ctrl := mid + n * clampf(from.distance_to(to) * 0.3, 30.0, 160.0)
		return from.lerp(ctrl, k).lerp(ctrl.lerp(to, k), k)

	func _draw() -> void:
		var a := 1.0 - fade
		# Traînée : la fin du trajet parcouru, de plus en plus fine et transparente.
		var steps := 14
		var prev := _point(maxf(t - 0.35, 0.0))
		for i in range(1, steps + 1):
			var k := maxf(t - 0.35, 0.0) + (t - maxf(t - 0.35, 0.0)) * i / steps
			var p := _point(k)
			var w := (2.0 + (6.0 if big else 4.0) * i / steps)
			draw_line(prev, p, Color(col, a * 0.75 * i / steps), w, true)
			prev = p
		if fade > 0.0:
			return
		var head := _point(t)
		var r := 11.0 if big else 8.0
		draw_circle(head, r * 2.2, Color(col, 0.18), true, -1.0, true)
		draw_circle(head, r * 1.4, Color(col, 0.4), true, -1.0, true)
		draw_circle(head, r, col.lightened(0.4), true, -1.0, true)
		draw_circle(head, r * 0.5, Color(1, 1, 1, 0.95), true, -1.0, true)


## Aura sur une carte touchée : étincelles qui montent (bonus) ou fumée sombre qui retombe (malus).
static func aura(parent: Node, at: Vector2, size: Vector2, col: Color, up: bool) -> void:
	var p := _burst(parent, at + Vector2(0, size.y * (0.3 if up else -0.2)), 16, 0.9)
	p.explosiveness = 0.7
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2(size.x * 0.45, size.y * 0.15)
	p.direction = Vector2(0, -1) if up else Vector2(0, 1)
	p.spread = 15
	p.initial_velocity_min = 40 if up else 20
	p.initial_velocity_max = 110 if up else 60
	p.gravity = Vector2(0, -40 if up else 60)
	p.scale_amount_min = 0.5
	p.scale_amount_max = 1.0 if up else 1.6
	if up:
		p.color_ramp = _fade(col, false)
	else:
		var g := Gradient.new()
		g.set_color(0, Color(col, 0.8))
		g.set_color(1, Color(0.16, 0.1, 0.19, 0.0))
		p.color_ramp = g


## Invocation : cercle magique qui tourne et grandit sous la carte, colonne d'étincelles.
static func summon(parent: Node, at: Vector2, size: Vector2, col: Color) -> void:
	var c := Circle.new()
	c.position = at
	c.radius = size.x * 0.7
	c.col = col
	parent.add_child(c)
	var tw := c.create_tween()
	tw.tween_property(c, "t", 1.0, 0.9)
	tw.tween_callback(c.queue_free)
	rise(parent, at, size, col)


class Circle extends Node2D:
	var radius := 60.0
	var col := Color.WHITE
	var t := 0.0:
		set(v):
			t = v
			rotation = t * 2.0
			queue_redraw()

	func _draw() -> void:
		var grow := minf(t / 0.3, 1.0)
		var a := 1.0 - clampf((t - 0.6) / 0.4, 0.0, 1.0)
		var r := radius * (0.4 + 0.6 * grow)
		draw_arc(Vector2.ZERO, r, 0, TAU, 48, Color(col, 0.9 * a), 2.5, true)
		draw_arc(Vector2.ZERO, r * 0.78, 0, TAU, 48, Color(col, 0.6 * a), 1.5, true)
		# Six runes (losanges) entre les deux cercles, et une étoile au centre.
		for i in 6:
			var ang := TAU * i / 6.0
			var p := Vector2(cos(ang), sin(ang)) * r * 0.89
			var d := r * 0.07
			draw_colored_polygon(PackedVector2Array([p + Vector2(0, -d), p + Vector2(d, 0), p + Vector2(0, d), p + Vector2(-d, 0)]), Color(col.lightened(0.3), a))
		var star := PackedVector2Array()
		for k in 7:
			var ang := -PI / 2 + k * TAU * 2.0 / 6.0
			star.append(Vector2(cos(ang), sin(ang)) * r * 0.7)
		draw_polyline(star, Color(col, 0.5 * a), 1.5, true)
