class_name Mat
## Matières de l'interface : cuir, laiton et pierre (textures calculées une fois au démarrage, qui se répètent), cadres
## en relief éclairés par une lumière qui suit le doigt, rivets, plaques des boutons.
##
## Le relief d'un cadre est calculé par sommet : chaque point connaît la pente de la moulure (vers l'extérieur sur le bord
## externe, vers l'intérieur sur le bord interne) et prend plus ou moins de lumière selon la direction de la lampe `light`.
## Les nœuds qui dessinent avec ces textures doivent avoir texture_repeat = TEXTURE_REPEAT_ENABLED.

# Couleurs des matières : celles du thème de base, remplacées par Look.apply selon le thème du compte.
static var BRASS := Color("c8962e")
static var BRASS_DARK := Color("6a4818")
static var LEATHER := Color("3a2618")
static var STONE := Color("4a4038")

static var light := Vector2(360, 160)   # lampe, en coordonnées de l'écran (suit le doigt, voir board.gd)
static var _tex := {}
static var _light_local := Vector2.ZERO


## Texture de matière, en gris clair à teinter : « leather », « brass », « stone ».
static func tex(kind: String) -> Texture2D:
	if _tex.has(kind):
		return _tex[kind]
	var n := 128
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	var a := FastNoiseLite.new()
	var b := FastNoiseLite.new()
	a.seed = 7
	b.seed = 11
	match kind:
		"leather":
			a.noise_type = FastNoiseLite.TYPE_CELLULAR
			a.frequency = 0.09
			a.cellular_return_type = FastNoiseLite.RETURN_DISTANCE
			b.frequency = 0.02
		"brass":
			a.frequency = 0.004
			b.frequency = 0.05
		"stone":
			a.fractal_octaves = 5
			a.frequency = 0.03
			b.noise_type = FastNoiseLite.TYPE_CELLULAR
			b.frequency = 0.05
			b.cellular_return_type = FastNoiseLite.RETURN_DISTANCE2_SUB
	var va := a.get_seamless_image(n, n)
	var vb := b.get_seamless_image(n, n)
	for y in n:
		var row := randf_range(-1, 1)
		for x in n:
			var p := va.get_pixel(x, y).r
			var q := vb.get_pixel(x, y).r
			var v := 0.0
			match kind:
				"leather":   # grain en petits cailloux, taches plus sombres
					v = 0.78 + 0.22 * smoothstep(0.1, 0.6, p) - 0.18 * q
				"brass":     # métal brossé : traits horizontaux, légères variations
					v = 0.82 + 0.08 * sin(y * 1.7 + q * 6.0) * 0.5 + 0.1 * p + 0.05 * row
				"stone":     # pierre : nuages et fines fissures
					v = 0.7 + 0.3 * p - 0.35 * (1.0 - smoothstep(0.0, 0.08, q))
			v = clampf(v, 0.0, 1.0)
			img.set_pixel(x, y, Color(v, v, v))
	var t := ImageTexture.create_from_image(img)
	_tex[kind] = t
	return t


## Rectangle arrondi rempli d'une matière (texture répétée, tous les `scale` pixels), teinté par `col`.
static func fill(ci: CanvasItem, kind: String, r: Rect2, rad: float, col: Color, scale := 128.0) -> void:
	var pts := Gfx.round_pts(r, rad, 6)
	var uvs := PackedVector2Array()
	for p in pts:
		uvs.append(p / scale)
	ci.draw_colored_polygon(pts, col, uvs, tex(kind))


## Contour arrondi sans points en double, avec la normale vers l'extérieur de chaque point.
static func _loop(r: Rect2, rad: float, seg: int) -> Array:
	rad = clampf(rad, 0.5, minf(r.size.x, r.size.y) * 0.5)
	var pts := PackedVector2Array()
	var nrm := PackedVector2Array()
	var corners := [
		[Vector2(r.position.x + rad, r.position.y + rad), PI],
		[Vector2(r.end.x - rad, r.position.y + rad), PI * 1.5],
		[Vector2(r.end.x - rad, r.end.y - rad), 0.0],
		[Vector2(r.position.x + rad, r.end.y - rad), PI * 0.5],
	]
	for c in corners:
		for i in seg + 1:
			var ang: float = c[1] + PI * 0.5 * i / seg
			var d := Vector2(cos(ang), sin(ang))
			pts.append(c[0] + d * rad)
			nrm.append(d)
	return [pts, nrm]


## Éclairage d'un point de moulure de normale n (vers où penche la pente).
static func _shade(base: Color, p: Vector2, n: Vector2, gloss: float) -> Color:
	var l := (_light_local - p)
	var dist := l.length()
	l = l / maxf(dist, 1.0)
	var lam := n.dot(l)
	var c := base.darkened(clampf(0.35 - 0.45 * lam, 0.0, 0.7)) if lam < 0.5 else base.lightened(clampf((lam - 0.5) * 0.5, 0.0, 0.3))
	var spec := pow(maxf(lam, 0.0), 10.0) * gloss * clampf(1.4 - dist / 900.0, 0.3, 1.0)
	return c.lerp(Color(1, 0.97, 0.88), clampf(spec, 0.0, 0.85))


## Cadre en relief (moulure bombée) de largeur w à l'intérieur de r, en laiton par défaut.
static func bevel(ci: CanvasItem, r: Rect2, rad: float, w: float, base = null, gloss := 0.9, kind := "brass") -> void:
	if base == null:
		base = BRASS
	var seg := 6
	var o: Array = _loop(r, rad, seg)
	var m: Array = _loop(r.grow(-w * 0.5), rad - w * 0.5, seg)
	var i: Array = _loop(r.grow(-w), rad - w, seg)
	var po: PackedVector2Array = o[0]
	var pm: PackedVector2Array = m[0]
	var pi_: PackedVector2Array = i[0]
	var nn: PackedVector2Array = o[1]
	var t := tex(kind)
	var n := po.size()
	_light_local = ci.get_global_transform().affine_inverse() * light
	# Contour sombre sous la moulure.
	var shadow := PackedVector2Array(po)
	shadow.append(po[0])
	ci.draw_polyline(shadow, Color(0, 0, 0, 0.55), 2.0, true)
	for k in n:
		var j := (k + 1) % n
		# Moitié extérieure : la pente regarde dehors ; moitié intérieure : elle regarde dedans.
		for half in 2:
			var a0: Vector2 = po[k] if half == 0 else pm[k]
			var a1: Vector2 = po[j] if half == 0 else pm[j]
			var b0: Vector2 = pm[k] if half == 0 else pi_[k]
			var b1: Vector2 = pm[j] if half == 0 else pi_[j]
			var s := 1.0 if half == 0 else -1.0
			var c0 := _shade(base, a0, nn[k] * s, gloss)
			var c1 := _shade(base, a1, nn[j] * s, gloss)
			var quad := PackedVector2Array([a0, a1, b1, b0])
			var cols := PackedColorArray([c0, c1, c1, c0])
			var uvs := PackedVector2Array([a0 / 96.0, a1 / 96.0, b1 / 96.0, b0 / 96.0])
			ci.draw_primitive(quad, cols, uvs, t)
	# Arête fine au sommet de la moulure.
	var ridge := PackedVector2Array(pm)
	ridge.append(pm[0])
	ci.draw_polyline(ridge, Color(base.lightened(0.45), 0.35), 1.0, true)


## Rivet : tête bombée éclairée du côté de la lampe.
static func rivet(ci: CanvasItem, c: Vector2, rad: float, base = null) -> void:
	if base == null:
		base = BRASS
	ci.draw_circle(c + Vector2(0, rad * 0.35), rad * 1.1, Color(0, 0, 0, 0.5), true, -1.0, true)
	ci.draw_circle(c, rad, base.darkened(0.35), true, -1.0, true)
	var l := (ci.get_global_transform().affine_inverse() * light - c).normalized()
	ci.draw_circle(c + l * rad * 0.15, rad * 0.78, base, true, -1.0, true)
	ci.draw_circle(c + l * rad * 0.4, rad * 0.32, base.lightened(0.6), true, -1.0, true)


## Couture : petits traits clairs le long d'un contour arrondi (bords des cuirs).
static func stitch(ci: CanvasItem, r: Rect2, rad: float, col := Color(0.9, 0.78, 0.55, 0.45)) -> void:
	var pts := Gfx.round_pts(r, rad, 6)
	var total := 0.0
	for k in pts.size():
		total += pts[k].distance_to(pts[(k + 1) % pts.size()])
	var step := 9.0
	var d := 0.0
	var k := 0
	var at := 0.0
	while d < total and k < pts.size():
		var a := pts[k]
		var b := pts[(k + 1) % pts.size()]
		var len := a.distance_to(b)
		while at < len:
			var p := a.lerp(b, at / len)
			var dir := (b - a) / maxf(len, 0.001)
			ci.draw_line(p, p + dir * 4.5, col, 1.4, true)
			at += step
			d += step
		at -= len
		k += 1


## Oublie les plaques de boutons en cache (changement de thème).
static func clear_plates() -> void:
	for k in _tex.keys():
		if str(k).begins_with("plate_"):
			_tex.erase(k)


## Plaque de bouton en laiton (texture pour StyleBoxTexture) : bord bombé éclairé d'en haut à gauche, creux enfoncé
## quand le bouton est appuyé.
static func plate_texture(state: String) -> Texture2D:
	var key := "plate_" + state
	if _tex.has(key):
		return _tex[key]
	var s := 64
	var rad := 14.0
	var bw := 5.0
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	var grain := tex("leather").get_image()
	var base: Color = Look.leather({"normal": Color("3a2a1c"), "hover": Color("4a3624"), "pressed": Color("2a1d13"), "disabled": Color("2a2018")}[state])
	var rim := BRASS if state != "disabled" else Color("6a5a46")
	var ldir := Vector2(-0.55, -0.83)
	for y in s:
		for x in s:
			var p := Vector2(x + 0.5, y + 0.5)
			# Distance signée au bord du rectangle arrondi (négative dedans).
			var q := (p - Vector2(s, s) * 0.5).abs() - Vector2(s, s) * 0.5 + Vector2(rad, rad)
			var sd := Vector2(maxf(q.x, 0), maxf(q.y, 0)).length() + minf(maxf(q.x, q.y), 0.0) - rad
			if sd > 0.5:
				img.set_pixel(x, y, Color(0, 0, 0, 0))
				continue
			var alpha := clampf(0.5 - sd, 0.0, 1.0)
			var depth := -sd
			var col: Color
			if depth < bw:
				# Normale du bord : gradient de la distance (approché par la direction depuis le centre adouci).
				var e := 0.5
				var gx := _sd(p + Vector2(e, 0), s, rad) - _sd(p - Vector2(e, 0), s, rad)
				var gy := _sd(p + Vector2(0, e), s, rad) - _sd(p - Vector2(0, e), s, rad)
				var nrm := Vector2(gx, gy).normalized()
				var t := depth / bw
				var slope := nrm * (1.0 if t < 0.5 else -1.0)
				if state == "pressed":
					slope = -slope
				var lam := slope.dot(ldir)
				col = rim.lightened(clampf(lam * 0.4, 0.0, 0.4)) if lam > 0 else rim.darkened(clampf(-lam * 0.5, 0.0, 0.5))
				if depth < 1.0:
					col = col.darkened(0.5)
			else:
				var g := grain.get_pixel(x % grain.get_width(), y % grain.get_height()).r
				col = base * Color(g, g, g)
				col = col.lightened(0.08 * (1.0 - float(y) / s)) if state != "pressed" else col.darkened(0.1 * (1.0 - float(y) / s))
			col.a = alpha
			img.set_pixel(x, y, col)
	var t2 := ImageTexture.create_from_image(img)
	_tex[key] = t2
	return t2


static func _sd(p: Vector2, s: int, rad: float) -> float:
	var q := (p - Vector2(s, s) * 0.5).abs() - Vector2(s, s) * 0.5 + Vector2(rad, rad)
	return Vector2(maxf(q.x, 0), maxf(q.y, 0)).length() + minf(maxf(q.x, q.y), 0.0) - rad
