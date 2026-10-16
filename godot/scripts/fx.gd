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
	p.material = _additive()
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
	r.material = _additive()
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
		var font := Look.title_font()
		var fs := 50
		var w := 0.0
		for ch in title:
			w += font.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + spacing
		w -= spacing
		var x := c.x - w * 0.5 - 60.0 * (1.0 - ease)
		var y := c.y + 12.0 - (10.0 if sub != "" else 0.0)
		var glitch := Look.frame == "neon"
		for ch in title:
			draw_string_outline(font, Vector2(x, y), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 8, Color(0.08, 0.03, 0.0, fade * ease))
			if glitch:   # Néon 2099 : décalage cyan et magenta, comme les titres de cyber.css
				var jit := 3.0 if fmod(t * 7.0, 1.0) < 0.15 else 2.0
				draw_string(font, Vector2(x + jit, y), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(Mat.NEON, 0.6 * fade * ease))
				draw_string(font, Vector2(x - jit, y), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(Mat.NEON2, 0.5 * fade * ease))
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
		var font := Look.title_font()
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
	b.material = _additive()
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
		flash(parent, to, 70.0, col)
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
		p.material = null


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


static var _shapes := {}


## Formes de particules : « streak » (trait, s'aligne sur la vitesse), « square » (pixel), « leaf » (feuille), « drop » (goutte).
static func shape(kind: String) -> Texture2D:
	if _shapes.has(kind):
		return _shapes[kind]
	var n := 24
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for y in n:
		for x in n:
			var u := (x - 11.5) / 11.5
			var v := (y - 11.5) / 11.5
			var a := 0.0
			match kind:
				"streak":
					a = clampf(1.0 - Vector2(u * 3.2, v).length(), 0.0, 1.0)
				"square":
					a = 1.0 if absf(u) < 0.6 and absf(v) < 0.6 else 0.0
				"leaf":
					a = clampf(1.0 - Vector2(u * 2.0, v * (1.0 + 0.6 * absf(v))).length(), 0.0, 1.0) * 3.0
				"drop":
					var w := 0.55 * clampf((v + 1.0) * 0.8, 0.0, 1.0) if v < 0.25 else sqrt(maxf(0.0, 0.5625 - (v - 0.25) * (v - 0.25) * 1.0))
					a = clampf((w - absf(u)) * 6.0, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, clampf(a, 0.0, 1.0)))
	_shapes[kind] = ImageTexture.create_from_image(img)
	return _shapes[kind]


## Général qui se déclenche : son portrait jaillit de l'en-tête vers le plateau, rayons et nom, avec l'effet de sa famille
## (plumes d'or, flammes, pièces, feuilles, souffle, âmes, sang, code, arcs électriques).
static func general_call(parent: Node, gid, from: Vector2, to: Vector2, col: Color, fam, title: String) -> void:
	var g := GenCall.new()
	g.gid = gid
	g.col = col
	g.title = title
	g.position = from
	g.z_index = 200
	parent.add_child(g)
	var tw := g.create_tween()
	tw.tween_property(g, "position", to, 0.34).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(g, "grow", 1.0, 0.34).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func():
		ring(parent, to, Vector2(110, 110), col.lightened(0.3), 0.6)
		theme_burst(parent, to, fam, col))
	tw.tween_interval(0.9)
	tw.tween_property(g, "position", from, 0.32).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.parallel().tween_property(g, "grow", 0.0, 0.32)
	tw.tween_callback(g.queue_free)


class GenCall extends Node2D:
	var gid
	var col := Color.WHITE
	var title := ""
	var t := 0.0
	var grow := 0.0

	func _process(dt: float) -> void:
		t += dt
		queue_redraw()

	func _draw() -> void:
		var r := 22.0 + 46.0 * grow
		var a := clampf(grow, 0.0, 1.0)
		for i in 14:
			var ang := t * 0.7 + i * TAU / 14.0
			var len := r * (2.1 + 0.25 * sin(t * 5.0 + i))
			draw_colored_polygon(PackedVector2Array([Vector2.ZERO, Vector2.from_angle(ang - 0.07) * len, Vector2.from_angle(ang + 0.07) * len]), Color(col.lightened(0.3), 0.16 * a))
		for i in 3:
			draw_circle(Vector2.ZERO, r * (1.18 + 0.12 * i), Color(col, 0.12 * a), true, -1.0, true)
		Gfx.portrait(self, gid, Vector2.ZERO, r, col)
		draw_arc(Vector2.ZERO, r + 3, 0, TAU, 64, Color("ffd98a", a), 3.0, true)
		if a > 0.5 and title != "":
			var la := (a - 0.5) * 2.0
			var band := Rect2(-170, r + 12, 340, 36)
			Gfx.fill_round(self, band, 10, Color(0.06, 0.04, 0.03, 0.85 * la))
			Gfx.frame_round(self, band, 10, Color(col, 0.9 * la), 2.0)
			Gfx.text_fit(self, Data.font_title, band.get_center(), title, 320, 24, Color(1, 0.93, 0.75, la), 5)


## Gerbe aux couleurs d'une famille, autour d'un point.
static func theme_burst(parent: Node, at: Vector2, fam, col: Color) -> void:
	var p := _burst(parent, at, 26, 1.3)
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 40
	p.spread = 180
	p.initial_velocity_min = 120
	p.initial_velocity_max = 260
	p.damping_min = 80
	p.damping_max = 140
	p.gravity = Vector2.ZERO
	p.scale_amount_min = 0.6
	p.scale_amount_max = 1.1
	p.color_ramp = _fade(col)
	match str(fam):
		"Ange":   # plumes et rayons d'or qui retombent doucement
			p.texture = shape("leaf")
			p.color_ramp = _fade(Color("ffe7a6"), true)
			p.gravity = Vector2(0, 60)
			p.angular_velocity_min = -120
			p.angular_velocity_max = 120
			p.lifetime = 1.8
			var r := _burst(parent, at, 16, 0.7)
			r.texture = shape("streak")
			r.particle_flag_align_y = true
			r.spread = 180
			r.initial_velocity_min = 380
			r.initial_velocity_max = 520
			r.gravity = Vector2.ZERO
			r.scale_amount_min = 1.4
			r.scale_amount_max = 2.0
			r.color_ramp = _fade(Color("fff3c4"))
		"Démon":  # flammes qui montent
			p.direction = Vector2(0, -1)
			p.spread = 50
			p.gravity = Vector2(0, -320)
			p.amount = 40
			p.scale_amount_min = 1.0
			p.scale_amount_max = 2.0
			p.color_ramp = _fade(Color("ff6a2a"))
		"Gobelin":  # pièces qui sautent et retombent
			p.texture = shape("square")
			p.direction = Vector2(0, -1)
			p.spread = 70
			p.initial_velocity_min = 260
			p.initial_velocity_max = 420
			p.damping_min = 0
			p.damping_max = 0
			p.gravity = Vector2(0, 900)
			p.angular_velocity_min = -400
			p.angular_velocity_max = 400
			p.scale_amount_min = 0.35
			p.scale_amount_max = 0.55
			p.color_ramp = _fade(Color("ffcf4a"))
		"Elfe":  # feuilles en tourbillon
			p.texture = shape("leaf")
			p.orbit_velocity_min = 0.35
			p.orbit_velocity_max = 0.6
			p.angular_velocity_min = -200
			p.angular_velocity_max = 200
			p.lifetime = 1.8
			p.color_ramp = _fade(Color("8fe07a"))
		"Dragon":  # souffle de feu en éventail
			p.texture = shape("streak")
			p.particle_flag_align_y = true
			p.amount = 44
			p.initial_velocity_min = 300
			p.initial_velocity_max = 560
			p.scale_amount_min = 1.0
			p.scale_amount_max = 1.8
			p.color_ramp = _fade(Color("ff9a3c"))
		"Mort-vivant":  # âmes vertes qui s'élèvent lentement
			p.direction = Vector2(0, -1)
			p.spread = 120
			p.initial_velocity_min = 40
			p.initial_velocity_max = 110
			p.gravity = Vector2(0, -60)
			p.amount = 34
			p.scale_amount_min = 2.2
			p.scale_amount_max = 3.6
			p.lifetime = 2.0
			p.color_ramp = _fade(Color("b4ffd2"), true)
		"Vampire":  # gouttes de sang
			p.texture = shape("drop")
			p.direction = Vector2(0, -1)
			p.spread = 80
			p.initial_velocity_min = 200
			p.initial_velocity_max = 380
			p.damping_min = 0
			p.damping_max = 0
			p.gravity = Vector2(0, 800)
			p.scale_amount_min = 0.5
			p.scale_amount_max = 0.8
			p.color_ramp = _fade(Color("d81b3c"))
		"Hacker":  # pluie de code
			p.texture = shape("square")
			p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
			p.emission_rect_extents = Vector2(150, 70)
			p.direction = Vector2(0, 1)
			p.spread = 0
			p.initial_velocity_min = 140
			p.initial_velocity_max = 320
			p.damping_min = 0
			p.damping_max = 0
			p.explosiveness = 0.5
			p.amount = 50
			p.scale_amount_min = 0.25
			p.scale_amount_max = 0.45
			p.color_ramp = _fade(Color("4dff7a"))
		"Cyborg":  # arcs électriques
			p.texture = shape("streak")
			p.particle_flag_align_y = true
			p.initial_velocity_min = 500
			p.initial_velocity_max = 760
			p.damping_min = 400
			p.damping_max = 600
			p.lifetime = 0.6
			p.scale_amount_min = 0.8
			p.scale_amount_max = 1.3
			p.color_ramp = _fade(Color("5fe8ff"), true)


# ————— Effets propres aux cartes —————
# Chaque carte qui agit a un style (Data.fx_style) : la potion verse une goutte, le souffle de feu crache des flammes,
# les vampires aspirent le sang, les anges font tomber un rayon de lumière, etc. effect() lance l'animation et renvoie
# le délai avant l'impact, où le plateau joue le chiffre et l'aura.

static func effect(parent: Node, style: String, from: Vector2, to: Vector2, col: Color, delay: float, kind: String, up: bool, size: Vector2) -> float:
	var dist := from.distance_to(to)
	var travel := clampf(dist / 1400.0, 0.22, 0.42)
	var near := dist < 20.0
	match style:
		"potion":
			if kind == "power" and up:
				return potion(parent, to, size, delay)
		"fire":
			if not up and not near:
				return flame(parent, from, to, size, delay)
		"blast":
			if not up and not near:
				bolt(parent, from, to, Color("ffb050"), delay, travel, "destroy")
				_later(parent, delay + travel, func(): explosion(parent, to, size))
				return delay + travel
		"drain":
			if not up and kind == "power":
				blood(parent, to, from, delay)
				return delay + 0.08
			if up and not near:
				bolt(parent, from, to, Color("e0304a"), delay, travel)
				return delay + travel
		"holy":
			if kind in ["power", "destroy"]:
				beam(parent, to, size, Color("ffe9a8") if up else Color("fff6e0"), delay)
				return delay + 0.22
		"hack":
			if not near:
				code(parent, from, to, delay, travel)
			_later(parent, delay + (0.0 if near else travel), func(): glitch(parent, to, size))
			return delay + (0.0 if near else travel)
		"zap":
			if not near:
				lightning(parent, from, to, Color("7ff0ff"), delay)
				return delay + 0.08
		"claw":
			if not up and kind in ["power", "destroy"]:
				if not near:
					bolt(parent, from, to, Color("b04ad8"), delay, travel * 0.8)
				var at := delay + (0.0 if near else travel * 0.8)
				_later(parent, at, func(): claws(parent, to, size))
				return at
		"dice":
			# Le dé roule au-dessus de la carte qui parie (voir dice_roll) : l'effet tombe quand il s'est posé.
			if kind == "power":
				return delay + 0.75
		"ghost":
			if not near:
				bolt(parent, from, to, Color("b8ffd8"), delay, travel * 1.2)
				_later(parent, delay + travel * 1.2, func(): wisps(parent, to, size))
				return delay + travel * 1.2
		"leaf":
			if not near:
				bolt(parent, from, to, Color("8fe07a"), delay, travel)
				_later(parent, delay + travel, func(): leaves(parent, to))
				return delay + travel
	if near:
		return delay
	bolt(parent, from, to, col, delay, travel, kind)
	return delay + travel


static var _add_mat: CanvasItemMaterial


## Mélange additif : les flammes s'éclairent là où elles se superposent.
static func _additive() -> CanvasItemMaterial:
	if _add_mat == null:
		_add_mat = CanvasItemMaterial.new()
		_add_mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	return _add_mat


static func _later(parent: Node, t: float, f: Callable) -> void:
	parent.get_tree().create_timer(maxf(t, 0.01)).timeout.connect(f)


## Potion : une fiole apparaît au-dessus de la carte, se penche, une goutte tombe et éclabousse.
static func potion(parent: Node, at: Vector2, size: Vector2, delay: float) -> float:
	var f := Flask.new()
	f.scale = Vector2(1.5, 1.5)
	f.position = at + Vector2(0, -size.y * 0.5 - 56)
	f.modulate.a = 0.0
	f.z_index = 150
	parent.add_child(f)
	var tw := f.create_tween()
	tw.tween_interval(delay)
	tw.tween_property(f, "modulate:a", 1.0, 0.15)
	tw.parallel().tween_property(f, "position:y", f.position.y + 10, 0.15)
	tw.tween_property(f, "rotation", -2.0, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func():
		var d := Drop.new()
		d.scale = Vector2(1.4, 1.4)
		d.position = f.position + Vector2(-24, 6)
		d.z_index = 150
		parent.add_child(d)
		var dt := d.create_tween()
		dt.tween_property(d, "position", at + Vector2(0, -size.y * 0.1), 0.26).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		dt.tween_callback(func():
			splash(parent, at + Vector2(0, -size.y * 0.1), Color("ff4a6a"))
			d.queue_free()))
	tw.tween_interval(0.4)
	tw.tween_property(f, "modulate:a", 0.0, 0.25)
	tw.tween_callback(f.queue_free)
	return delay + 0.15 + 0.28 + 0.26


class Flask extends Node2D:
	func _draw() -> void:
		# Fiole ronde, col étroit, bouchon de liège ; liquide rouge (force) avec un reflet.
		draw_circle(Vector2(0, 8), 20, Color(0, 0, 0, 0.35), true, -1.0, true)
		draw_circle(Vector2(0, 6), 18, Color(0.85, 0.9, 1.0, 0.35), true, -1.0, true)
		draw_circle(Vector2(0, 9), 14, Color("e0304a"), true, -1.0, true)
		draw_circle(Vector2(-5, 4), 5, Color(1, 0.7, 0.75, 0.8), true, -1.0, true)
		draw_rect(Rect2(-6, -22, 12, 14), Color(0.85, 0.9, 1.0, 0.45))
		draw_rect(Rect2(-7, -30, 14, 9), Color("a0703a"))
		draw_arc(Vector2(0, 6), 18, 0, TAU, 32, Color(1, 1, 1, 0.7), 2.0, true)


class Drop extends Node2D:
	func _draw() -> void:
		draw_colored_polygon(PackedVector2Array([Vector2(0, -12), Vector2(6, 0), Vector2(0, 6), Vector2(-6, 0)]), Color("ff3a5a"))
		draw_circle(Vector2(0, 1), 6, Color("ff3a5a"), true, -1.0, true)
		draw_circle(Vector2(-2, -1), 2, Color(1, 0.8, 0.85), true, -1.0, true)


## Éclaboussure : gouttelettes qui retombent et anneau.
static func splash(parent: Node, at: Vector2, col: Color) -> void:
	var p := _burst(parent, at, 18, 0.7)
	p.texture = shape("drop")
	p.direction = Vector2(0, -1)
	p.spread = 75
	p.initial_velocity_min = 120
	p.initial_velocity_max = 260
	p.gravity = Vector2(0, 700)
	p.scale_amount_min = 0.3
	p.scale_amount_max = 0.55
	p.color_ramp = _fade(col)
	ring(parent, at, Vector2(40, 16), Color(col, 0.9), 0.4)


## Jet de flammes de la carte qui agit vers sa cible, puis la cible brûle un instant.
static func flame(parent: Node, from: Vector2, to: Vector2, size: Vector2, delay: float) -> float:
	var reach := 0.3
	_later(parent, delay, func():
		var p := CPUParticles2D.new()
		p.position = from
		p.amount = 160
		p.lifetime = reach
		p.texture = dot_texture()
		p.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
		p.emission_sphere_radius = 8
		p.direction = (to - from).normalized()
		p.spread = 9
		p.initial_velocity_min = from.distance_to(to) / reach * 0.95
		p.initial_velocity_max = from.distance_to(to) / reach * 1.05
		p.gravity = Vector2(0, -60)
		p.scale_amount_min = 2.2
		p.scale_amount_max = 3.6
		var curve := Curve.new()
		curve.add_point(Vector2(0, 0.35))
		curve.add_point(Vector2(1, 1.0))
		p.scale_amount_curve = curve
		var g := Gradient.new()
		g.set_color(0, Color(1, 1, 0.8, 1))
		g.add_point(0.25, Color("ffb030"))
		g.add_point(0.6, Color("ff4a1a", 0.85))
		g.set_color(g.get_point_count() - 1, Color(0.2, 0.08, 0.05, 0.0))
		p.color_ramp = g
		p.material = _additive()
		parent.add_child(p)
		p.emitting = true
		_later(parent, 0.45, func(): p.emitting = false)
		_later(parent, 0.45 + reach + 0.1, p.queue_free))
	_later(parent, delay + reach, func(): burn(parent, to, size))
	return delay + reach


## Cible qui brûle : flammes qui montent sur toute la carte.
static func burn(parent: Node, at: Vector2, size: Vector2) -> void:
	var p := _burst(parent, at + Vector2(0, size.y * 0.25), 30, 0.7)
	p.explosiveness = 0.3
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2(size.x * 0.4, size.y * 0.25)
	p.direction = Vector2(0, -1)
	p.spread = 20
	p.initial_velocity_min = 50
	p.initial_velocity_max = 130
	p.gravity = Vector2(0, -120)
	p.scale_amount_min = 1.0
	p.scale_amount_max = 1.8
	var g := Gradient.new()
	g.set_color(0, Color("ffd060"))
	g.add_point(0.5, Color("ff5020", 0.8))
	g.set_color(g.get_point_count() - 1, Color(0.15, 0.08, 0.06, 0.0))
	p.color_ramp = g
	p.material = _additive()


## Explosion : éclair blanc, boule de feu, fumée et éclats.
static func explosion(parent: Node, at: Vector2, size: Vector2) -> void:
	ring(parent, at, Vector2(size.x * 0.8, size.x * 0.8), Color("ffd080"), 0.35)
	var fire := _burst(parent, at, 24, 0.5)
	fire.spread = 180
	fire.initial_velocity_min = 80
	fire.initial_velocity_max = 260
	fire.damping_min = 300
	fire.damping_max = 400
	fire.gravity = Vector2.ZERO
	fire.scale_amount_min = 1.5
	fire.scale_amount_max = 2.8
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 0.85))
	g.add_point(0.3, Color("ff9a30"))
	g.set_color(g.get_point_count() - 1, Color(0.25, 0.2, 0.18, 0.0))
	fire.color_ramp = g
	var smoke := _burst(parent, at, 10, 1.1)
	smoke.spread = 180
	smoke.initial_velocity_min = 20
	smoke.initial_velocity_max = 60
	smoke.gravity = Vector2(0, -50)
	smoke.scale_amount_min = 2.5
	smoke.scale_amount_max = 4.0
	var sg := Gradient.new()
	sg.set_color(0, Color(0.3, 0.27, 0.25, 0.6))
	sg.set_color(1, Color(0.2, 0.18, 0.17, 0.0))
	smoke.color_ramp = sg
	smoke.material = null


## Drain : un filet de sang quitte la cible et rejoint le vampire.
static func blood(parent: Node, from: Vector2, to: Vector2, delay: float) -> void:
	_later(parent, delay, func():
		var dur := 0.45
		var p := CPUParticles2D.new()
		p.position = from
		p.amount = 90
		p.lifetime = dur
		p.texture = shape("drop")
		p.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
		p.emission_sphere_radius = 6
		p.direction = (to - from).normalized()
		p.spread = 10
		p.initial_velocity_min = from.distance_to(to) / dur
		p.initial_velocity_max = from.distance_to(to) / dur * 1.05
		p.gravity = Vector2.ZERO
		p.particle_flag_align_y = true
		p.scale_amount_min = 0.3
		p.scale_amount_max = 0.5
		var g := Gradient.new()
		g.set_color(0, Color("ff2a44"))
		g.set_color(1, Color("8a0018", 0.0))
		p.color_ramp = g
		parent.add_child(p)
		p.emitting = true
		_later(parent, 0.5, func(): p.emitting = false)
		_later(parent, 0.5 + dur + 0.1, p.queue_free)
		splash(parent, from, Color("d81b3c")))


## Rayon de lumière qui tombe du ciel sur la cible, plumes qui descendent.
static func beam(parent: Node, at: Vector2, size: Vector2, col: Color, delay: float) -> void:
	var b := Beam.new()
	b.material = _additive()
	b.position = at
	b.w = size.x * 0.75
	b.col = col
	b.z_index = 140
	parent.add_child(b)
	b.visible = false
	var tw := b.create_tween()
	tw.tween_interval(delay)
	tw.tween_callback(func(): b.visible = true)
	tw.tween_property(b, "t", 1.0, 0.75)
	tw.tween_callback(b.queue_free)
	_later(parent, delay + 0.2, func():
		var p := _burst(parent, at + Vector2(0, -size.y * 0.6), 10, 1.4)
		p.texture = shape("leaf")
		p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
		p.emission_rect_extents = Vector2(size.x * 0.5, 10)
		p.direction = Vector2(0, 1)
		p.spread = 30
		p.initial_velocity_min = 20
		p.initial_velocity_max = 60
		p.gravity = Vector2(0, 40)
		p.angular_velocity_min = -150
		p.angular_velocity_max = 150
		p.scale_amount_min = 0.4
		p.scale_amount_max = 0.7
		p.color_ramp = _fade(Color("fff3c4"), true))


class Beam extends Node2D:
	var w := 80.0
	var col := Color.WHITE
	var t := 0.0:
		set(v):
			t = v
			queue_redraw()

	func _draw() -> void:
		var open := minf(t / 0.25, 1.0)
		var a := 1.0 - clampf((t - 0.5) / 0.5, 0.0, 1.0)
		var top := -position.y - 10
		for i in 4:
			var ww := w * open * (1.0 - i * 0.22)
			draw_colored_polygon(PackedVector2Array([Vector2(-ww * 0.35, top), Vector2(ww * 0.35, top), Vector2(ww * 0.5, 0), Vector2(-ww * 0.5, 0)]), Color(col, (0.12 + 0.1 * i) * a))
		draw_set_transform(Vector2.ZERO, 0, Vector2(1, 0.35))
		draw_circle(Vector2.ZERO, w * 0.6 * open, Color(col, 0.45 * a), true, -1.0, true)
		draw_set_transform(Vector2.ZERO)


## Piratage : un nuage de pixels verts file vers la cible.
static func code(parent: Node, from: Vector2, to: Vector2, delay: float, travel: float) -> void:
	_later(parent, delay, func():
		var p := CPUParticles2D.new()
		p.position = from
		p.amount = 36
		p.lifetime = travel
		p.texture = shape("square")
		p.explosiveness = 0.2
		p.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
		p.emission_sphere_radius = 14
		p.direction = (to - from).normalized()
		p.spread = 4
		p.initial_velocity_min = from.distance_to(to) / travel * 0.92
		p.initial_velocity_max = from.distance_to(to) / travel
		p.gravity = Vector2.ZERO
		p.scale_amount_min = 0.25
		p.scale_amount_max = 0.45
		p.color_ramp = _fade(Color("4dff7a"))
		p.one_shot = true
		parent.add_child(p)
		p.emitting = true
		p.finished.connect(p.queue_free))


## Glitch : bandes décalées vertes et magenta qui clignotent sur la carte piratée.
static func glitch(parent: Node, at: Vector2, size: Vector2) -> void:
	var g := Glitch.new()
	g.position = at
	g.size = size
	g.z_index = 140
	parent.add_child(g)
	var tw := g.create_tween()
	tw.tween_property(g, "t", 1.0, 0.5)
	tw.tween_callback(g.queue_free)


class Glitch extends Node2D:
	var size := Vector2(100, 140)
	var t := 0.0:
		set(v):
			t = v
			queue_redraw()

	func _draw() -> void:
		var a := 1.0 - t
		for i in 9:
			var y := randf_range(-0.5, 0.5) * size.y
			var h := randf_range(3, 12)
			var dx := randf_range(-14, 14)
			var c := Color("4dff7a") if i % 3 == 0 else Color("ff3ad8") if i % 3 == 1 else Color("3ad8ff")
			draw_rect(Rect2(-size.x * 0.5 + dx, y, size.x * randf_range(0.4, 1.0), h), Color(c, 0.55 * a))


## Éclair en zigzag qui crépite de la source à la cible.
static func lightning(parent: Node, from: Vector2, to: Vector2, col: Color, delay: float) -> void:
	var l := Lightning.new()
	l.material = _additive()
	l.from = from
	l.to = to
	l.col = col
	l.z_index = 140
	parent.add_child(l)
	l.visible = false
	var tw := l.create_tween()
	tw.tween_interval(delay)
	tw.tween_callback(func(): l.visible = true)
	tw.tween_property(l, "t", 1.0, 0.35)
	tw.tween_callback(l.queue_free)
	_later(parent, delay + 0.08, func():
		var p := _burst(parent, to, 14, 0.35)
		p.texture = shape("streak")
		p.particle_flag_align_y = true
		p.spread = 180
		p.initial_velocity_min = 200
		p.initial_velocity_max = 380
		p.damping_min = 500
		p.damping_max = 700
		p.gravity = Vector2.ZERO
		p.color_ramp = _fade(col, true))


class Lightning extends Node2D:
	var from := Vector2.ZERO
	var to := Vector2.ZERO
	var col := Color.WHITE
	var t := 0.0:
		set(v):
			t = v
			queue_redraw()

	func _draw() -> void:
		var a := 1.0 - t
		var n := (to - from).orthogonal().normalized()
		for pass_i in 2:
			var pts := PackedVector2Array([from])
			var steps := 9
			for i in range(1, steps):
				pts.append(from.lerp(to, float(i) / steps) + n * randf_range(-18, 18))
			pts.append(to)
			draw_polyline(pts, Color(col, 0.35 * a), 9.0, true)
			draw_polyline(pts, Color(1, 1, 1, 0.9 * a) if pass_i == 0 else Color(col, 0.8 * a), 2.5, true)


## Griffes : trois entailles qui lacèrent la carte.
static func claws(parent: Node, at: Vector2, size: Vector2) -> void:
	var c := Claws.new()
	c.position = at
	c.size = size
	c.z_index = 140
	parent.add_child(c)
	var tw := c.create_tween()
	tw.tween_property(c, "t", 1.0, 0.55)
	tw.tween_callback(c.queue_free)


class Claws extends Node2D:
	var size := Vector2(100, 140)
	var t := 0.0:
		set(v):
			t = v
			queue_redraw()

	func _draw() -> void:
		var cut := minf(t / 0.25, 1.0)
		var a := 1.0 - clampf((t - 0.4) / 0.6, 0.0, 1.0)
		for i in 3:
			var off := (i - 1) * size.x * 0.22
			var p0 := Vector2(-size.x * 0.3 + off, -size.y * 0.35)
			var p1 := Vector2(size.x * 0.25 + off, size.y * 0.35)
			var p := p0.lerp(p1, cut)
			var n := (p1 - p0).orthogonal().normalized()
			draw_colored_polygon(PackedVector2Array([p0, (p0 + p) * 0.5 + n * 5, p, (p0 + p) * 0.5 - n * 5]), Color("ff3a5a", a))
			draw_line(p0, p, Color(1, 0.85, 0.9, a), 1.5, true)


## Pari : un dé qui roule en arc jusqu'à la cible.
static func die(parent: Node, from: Vector2, to: Vector2, delay: float, travel: float) -> void:
	var d := Die.new()
	d.scale = Vector2(1.5, 1.5)
	d.position = from
	d.z_index = 150
	parent.add_child(d)
	d.visible = false
	var mid := (from + to) * 0.5 + Vector2(0, -90)
	var tw := d.create_tween()
	tw.tween_interval(delay)
	tw.tween_callback(func(): d.visible = true)
	tw.tween_method(func(k: float):
		d.position = from.lerp(mid, k).lerp(mid.lerp(to, k), k)
		d.rotation = k * TAU * 1.5
		d.face = int(k * 12) % 6 + 1
		d.queue_redraw(), 0.0, 1.0, travel)
	tw.tween_callback(func(): sparkle(parent, to, Vector2(40, 40), Color("ffe08a")))
	tw.tween_property(d, "modulate:a", 0.0, 0.25)
	tw.tween_callback(d.queue_free)


class Die extends Node2D:
	var face := 1
	var result := 0
	var landed := false

	func _draw() -> void:
		var r := Rect2(-15, -15, 30, 30)
		if landed:
			var c := Color("ffd36b") if result >= 6 else Color("ff6a5a") if result <= 2 else Color("fff3c4")
			for i in 3:
				Gfx.fill_round(self, r.grow(3 + i * 3), 8 + i * 3, Color(c, 0.18))
		draw_set_transform(Vector2(0, 2))
		Gfx.fill_round(self, r, 6, Color(0, 0, 0, 0.4))
		draw_set_transform(Vector2.ZERO)
		Gfx.fill_round(self, r, 6, Color("fff6e6"))
		Gfx.vgrad_round(self, r, 6, [0.0, 1.0], [0.0, 0.18])
		Gfx.frame_round(self, r, 6, Color("3a2a1c"), 2.0)
		var pips := {1: [Vector2.ZERO], 2: [Vector2(-7, -7), Vector2(7, 7)], 3: [Vector2(-7, -7), Vector2.ZERO, Vector2(7, 7)],
			4: [Vector2(-7, -7), Vector2(7, -7), Vector2(-7, 7), Vector2(7, 7)],
			5: [Vector2(-7, -7), Vector2(7, -7), Vector2.ZERO, Vector2(-7, 7), Vector2(7, 7)],
			6: [Vector2(-7, -8), Vector2(7, -8), Vector2(-7, 0), Vector2(7, 0), Vector2(-7, 8), Vector2(7, 8)]}
		for p in pips[face]:
			draw_circle(p, 3, Color("c0303a") if face == 1 else Color("2a1d14"), true, -1.0, true)


## Âmes : volutes pâles qui s'élèvent de la carte touchée.
static func wisps(parent: Node, at: Vector2, size: Vector2) -> void:
	var p := _burst(parent, at, 10, 1.1)
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = size * 0.35
	p.direction = Vector2(0, -1)
	p.spread = 40
	p.initial_velocity_min = 30
	p.initial_velocity_max = 80
	p.gravity = Vector2(0, -50)
	p.scale_amount_min = 1.6
	p.scale_amount_max = 2.6
	p.color_ramp = _fade(Color("b8ffd8"), true)


## Feuilles qui tourbillonnent autour de la cible.
static func leaves(parent: Node, at: Vector2) -> void:
	var p := _burst(parent, at, 12, 0.9)
	p.texture = shape("leaf")
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 30
	p.spread = 180
	p.initial_velocity_min = 40
	p.initial_velocity_max = 90
	p.orbit_velocity_min = 0.5
	p.orbit_velocity_max = 0.8
	p.gravity = Vector2.ZERO
	p.angular_velocity_min = -200
	p.angular_velocity_max = 200
	p.scale_amount_min = 0.4
	p.scale_amount_max = 0.7
	p.color_ramp = _fade(Color("8fe07a"))



## Éclat de lumière doux à l'impact (une seule grosse particule additive qui s'éteint vite).
static func flash(parent: Node, at: Vector2, radius: float, col: Color) -> void:
	var g := _burst(parent, at, 1, 0.28)
	g.scale_amount_min = radius / 8.0
	g.scale_amount_max = radius / 8.0
	g.gravity = Vector2.ZERO
	g.initial_velocity_max = 0.0
	var gr := Gradient.new()
	gr.set_color(0, Color(col.lightened(0.5), 0.75))
	gr.set_color(1, Color(col, 0.0))
	g.color_ramp = gr


## Pari : un gros dé apparaît au-dessus de la carte qui parie, tourne en changeant de face, se pose sur le résultat
## (6 en or avec des étincelles, 1-2 en rouge), puis s'efface.
static func dice_roll(parent: Node, at: Vector2, v: int, delay: float) -> void:
	var d := Die.new()
	d.result = v
	d.position = at + Vector2(0, -20)
	d.scale = Vector2.ZERO
	d.z_index = 160
	parent.add_child(d)
	var tw := d.create_tween()
	tw.tween_interval(delay)
	tw.tween_property(d, "scale", Vector2(2.0, 2.0), 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_method(func(k: float):
		d.rotation = (1.0 - k) * (1.0 - k) * TAU * 2.2
		d.position = at + Vector2(0, -20 - 34 * sin(k * PI))
		d.face = d.result if k > 0.92 else int(k * 14 + v) % 6 + 1
		d.queue_redraw(), 0.0, 1.0, 0.55)
	tw.tween_callback(func():
		d.landed = true
		d.queue_redraw()
		if v >= 6:
			sparkle(parent, at, Vector2(70, 70), Color("ffd36b"))
			ring(parent, at, Vector2(60, 60), Color("ffd36b"), 0.5)
		elif v <= 2:
			ring(parent, at, Vector2(50, 50), Color("ff6a5a"), 0.4))
	tw.tween_property(d, "scale", Vector2(2.3, 2.3), 0.08)
	tw.tween_property(d, "scale", Vector2(2.0, 2.0), 0.12)
	tw.tween_interval(0.85)
	tw.tween_property(d, "modulate:a", 0.0, 0.3)
	tw.tween_callback(d.queue_free)


## Jackpot : une machine à sous s'allume au-dessus du plateau, ses trois rouleaux tournent et s'arrêtent sur 7 7 7,
## puis une pluie de pièces.
static func slot_machine(parent: Node, at: Vector2, tone: Color) -> void:
	var m := Slot.new()
	m.position = at
	m.tone = tone
	m.z_index = 170
	m.scale = Vector2(0.2, 0.2)
	m.modulate.a = 0.0
	parent.add_child(m)
	var tw := m.create_tween()
	tw.tween_property(m, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(m, "modulate:a", 1.0, 0.2)
	tw.tween_property(m, "t", 1.0, 2.0)
	tw.tween_interval(0.7)
	tw.tween_property(m, "modulate:a", 0.0, 0.35)
	tw.tween_callback(m.queue_free)
	_later(parent, 1.85, func():
		var p := _burst(parent, at + Vector2(0, -20), 40, 1.6)
		p.texture = shape("square")
		p.direction = Vector2(0, -1)
		p.spread = 70
		p.initial_velocity_min = 260
		p.initial_velocity_max = 520
		p.gravity = Vector2(0, 900)
		p.angular_velocity_min = -400
		p.angular_velocity_max = 400
		p.scale_amount_min = 0.4
		p.scale_amount_max = 0.7
		p.color_ramp = _fade(Color("ffd36b"))
		flash(parent, at, 220.0, Color("ffd36b")))


class Slot extends Node2D:
	const REEL := ["★", "♦", "BAR", "♣", "♥", "7"]
	var tone := Color.WHITE
	var t := 0.0:
		set(v):
			t = v
			queue_redraw()

	func _process(_dt: float) -> void:
		queue_redraw()

	func _draw() -> void:
		var w := 300.0
		var h := 170.0
		var r := Rect2(-w * 0.5, -h * 0.5, w, h)
		var now := Time.get_ticks_msec() / 1000.0
		Gfx.fill_round(self, r.grow(6), 22, Color(0, 0, 0, 0.6))
		Gfx.fill_round(self, r, 20, Color("5a1018"))
		Gfx.vgrad_round(self, r, 20, [0.0, 1.0], [0.0, 0.5])
		Gfx.frame_round(self, r, 20, Color("ffd36b"), 3.0)
		# Ampoules qui clignotent tout autour.
		var n := 22
		for i in n:
			var k := float(i) / n
			var p := Vector2(r.position.x + 12 + (w - 24) * k, r.position.y + 10) if i < n / 2 else Vector2(r.position.x + 12 + (w - 24) * (k - 0.5) * 2.0, r.end.y - 10)
			var on := (i + int(now * 10.0)) % 2 == 0
			draw_circle(p, 4, Color("fff3c4") if on else Color("a06a20"), true, -1.0, true)
		# Trois rouleaux : défilent, puis s'arrêtent l'un après l'autre sur 7.
		for i in 3:
			var rr := Rect2(-w * 0.5 + 24 + i * 88, -h * 0.5 + 26, 76, 92)
			Gfx.fill_round(self, rr, 8, Color("fff6e6"))
			var stop := 0.45 + i * 0.2
			var sym := "7"
			var off := 0.0
			if t < stop:
				var spin := now * 14.0 + i * 1.7
				sym = REEL[int(spin) % REEL.size()]
				off = (spin - floor(spin)) * 40.0 - 20.0
			Gfx.text_fit(self, Data.font_title, rr.get_center() + Vector2(0, off), sym, 70, 52 if sym == "7" else 34, Color("d81b3c") if sym == "7" else Color("2a1d14"), 0)
			Gfx.vgrad_round(self, rr, 8, [0.0, 0.25, 0.75, 1.0], [0.45, 0.0, 0.0, 0.45])
			Gfx.frame_round(self, rr, 8, Color("2a1606"), 2.0)
		var won := t >= 0.9
		var label := Rect2(-w * 0.5 + 30, h * 0.5 - 40, w - 60, 30)
		if won:
			var k2 := 0.5 + 0.5 * sin(now * 12.0)
			Gfx.text_fit(self, Data.font_title, label.get_center(), "JACKPOT !", w - 40, 30, Color("ffd36b").lerp(Color.WHITE, k2), 5)
		else:
			Gfx.text_fit(self, Data.font_sc, label.get_center(), "FAITES VOS JEUX", w - 40, 18, Color(1, 0.9, 0.75, 0.8), 3)
