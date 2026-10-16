class_name Orn
## Ornements des thèmes sur les cadres : motifs dans les coins (citrouille et chauve-souris d'Halloween, circuits du néon,
## soleil noir de l'éclipse, feuilles de Sylvaën, ailes de Séraphine, étoiles d'Elyndra, sceau rouge de l'estampe, couleurs
## de cartes du casino) et trame légère sur les bandeaux de cuir. Rien pour le thème de base, qui garde son laiton nu.
## Le motif dépend de Look.deco, le décor de table du thème.


## Trame d'un bandeau (sous la couture et le cadre).
static func pattern(ci: CanvasItem, r: Rect2) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = int(r.position.x * 7 + r.position.y * 13 + r.size.x)
	match Look.deco:
		"stars":
			for i in int(r.size.x * r.size.y / 900.0):
				var p := r.position + Vector2(rng.randf(), rng.randf()) * r.size
				ci.draw_circle(p, 0.7 if rng.randf() < 0.8 else 1.3, Color(1, 0.96, 0.85, 0.2 + rng.randf() * 0.45), true, -1.0, true)
		"felt":
			var s := 22.0
			var x := r.position.x + 8
			while x < r.end.x - 8:
				var y := r.position.y + 8 + (s * 0.5 if int((x - r.position.x) / s) % 2 else 0.0)
				while y < r.end.y - 8:
					ci.draw_colored_polygon(PackedVector2Array([Vector2(x, y - 3), Vector2(x + 2, y), Vector2(x, y + 3), Vector2(x - 2, y)]), Color("f2c14e", 0.12))
					y += s
				x += s
		"waves":
			var R := 9.0
			var x := r.position.x + 6
			var y := r.end.y - 6
			while x < r.end.x - 4:
				for k in [3, 2, 1]:
					ci.draw_arc(Vector2(x, y), R * k / 3.0, PI, TAU, 12, Color("2a5a7a" if k % 2 else "c8281a", 0.22), 1.2, true)
				x += R * 2
		"grid":
			var y := r.position.y + 6
			while y < r.end.y - 4:
				ci.draw_line(Vector2(r.position.x + 6, y), Vector2(r.end.x - 6, y), Color(Mat.NEON, 0.05), 1.0)
				y += 8
		"sun":
			# Fissures de braise le long du bas.
			var pts := PackedVector2Array()
			for i in 12:
				pts.append(Vector2(lerpf(r.position.x + 20, r.end.x - 20, i / 11.0), r.end.y - 8 - (4.0 if i % 2 else 0.0) - rng.randf() * 3))
			ci.draw_polyline(pts, Color("ff3a0a", 0.1), 5.0, true)
			ci.draw_polyline(pts, Color("ff8a3a", 0.35), 1.2, true)
		"dawn":
			var c := Vector2(r.get_center().x, r.end.y + 20)
			for i in 9:
				var a := PI + (i + 0.5) / 9.0 * PI
				ci.draw_line(c, c + Vector2(cos(a), sin(a)) * r.size.y * 1.4, Color("ffe0a0", 0.06), 6.0, true)
		"forest":
			for i in 6:
				var p := r.position + Vector2(rng.randf(), rng.randf()) * r.size
				leaf(ci, p, 9.0, rng.randf() * TAU, Color("0a1a0e", 0.35))
		"moon":
			web(ci, r.position + Vector2(4, 4), 26.0, Vector2(1, 1))
			web(ci, Vector2(r.end.x - 4, r.end.y - 4), 22.0, Vector2(-1, -1))


## Motifs dans les coins d'un cadre ; small : version réduite (coins des zones).
static func corners(ci: CanvasItem, r: Rect2, small := false) -> void:
	var s := 0.6 if small else 1.0
	var tl := r.position
	var tr := Vector2(r.end.x, r.position.y)
	var bl := Vector2(r.position.x, r.end.y)
	var br := r.end
	if not small:
		# Bandeaux : les coins sont pris par l'avatar et le médaillon du général ; les motifs se posent sur les bords,
		# de part et d'autre du médaillon du tour.
		tl = Vector2(lerpf(r.position.x, r.end.x, 0.3), r.position.y - 6)
		tr = Vector2(lerpf(r.position.x, r.end.x, 0.7), r.position.y - 6)
		bl = Vector2(lerpf(r.position.x, r.end.x, 0.3), r.end.y + 6)
		br = Vector2(lerpf(r.position.x, r.end.x, 0.7), r.end.y + 6)
	match Look.deco:
		"moon":
			pumpkin(ci, tl + Vector2(6, 4) * s, 13.0 * s)
			bat(ci, tr + Vector2(-26, 2) * s, 11.0 * s)
			if not small:
				bat(ci, tr + Vector2(-50, 10), 7.0)
		"grid":
			circuit(ci, tl + Vector2(2, 2), 28.0 * s, Vector2(1, 1))
			circuit(ci, br - Vector2(2, 2), 28.0 * s, Vector2(-1, -1))
		"sun":
			blacksun(ci, tr + Vector2(-8, 6) * s, 11.0 * s)
		"forest":
			for k in [[tl, Vector2(1, 1)], [tr, Vector2(-1, 1)]]:
				var at: Vector2 = k[0] + k[1] * Vector2(6, 6) * s
				leaf(ci, at, 13.0 * s, Vector2(k[1].x, 0.4).angle(), Color("7ab84a"))
				leaf(ci, at, 11.0 * s, Vector2(k[1].x * 0.3, 1).angle(), Color("5a9a3a"))
				ci.draw_circle(at, 2.5 * s, Color("c8e070"), true, -1.0, true)
		"dawn":
			wing(ci, tl + Vector2(8, 6) * s, 16.0 * s, 1.0)
			wing(ci, tr + Vector2(-8, 6) * s, 16.0 * s, -1.0)
		"stars":
			sparkle(ci, tl + Vector2(6, 6) * s, 10.0 * s, Color("fff2c0"))
			sparkle(ci, tr + Vector2(-7, 7) * s, 7.0 * s, Color("a8c8ff"))
			sparkle(ci, br + Vector2(-8, -7) * s, 8.0 * s, Color("fff2c0"))
		"waves":
			hanko(ci, br + Vector2(-14, -14) * s, 11.0 * s)
		"felt":
			suit(ci, "spade", tl + Vector2(10, 10) * s, 12.0 * s, Color("f2c14e"))
			suit(ci, "heart", tr + Vector2(-10, 10) * s, 12.0 * s, Color("ff3a4a"))
			if not small:
				suit(ci, "diamond", bl + Vector2(10, -10), 12.0, Color("ff3a4a"))
				suit(ci, "club", br + Vector2(-10, -10), 12.0, Color("f2c14e"))


# ————— Motifs —————

static func pumpkin(ci: CanvasItem, c: Vector2, s: float) -> void:
	ci.draw_circle(c + Vector2(0, s * 0.15), s * 1.05, Color(0, 0, 0, 0.45), true, -1.0, true)
	for k in [-1, 1, 0]:
		ci.draw_set_transform(c + Vector2(k * s * 0.42, 0), 0, Vector2(0.7, 1.0))
		ci.draw_circle(Vector2.ZERO, s * 0.85, Color("e0701e") if k == 0 else Color("b8520e"), true, -1.0, true)
	ci.draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
	ci.draw_rect(Rect2(c + Vector2(-s * 0.1, -s * 1.15), Vector2(s * 0.2, s * 0.4)), Color("3a5a1a"))
	var glow := Color("ffd860")
	ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-s * 0.55, -s * 0.05), c + Vector2(-s * 0.15, -s * 0.05), c + Vector2(-s * 0.35, -s * 0.4)]), glow)
	ci.draw_colored_polygon(PackedVector2Array([c + Vector2(s * 0.15, -s * 0.05), c + Vector2(s * 0.55, -s * 0.05), c + Vector2(s * 0.35, -s * 0.4)]), glow)
	ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-s * 0.5, s * 0.25), c + Vector2(-s * 0.2, s * 0.45), c + Vector2(0, s * 0.3), c + Vector2(s * 0.2, s * 0.45), c + Vector2(s * 0.5, s * 0.25), c + Vector2(0, s * 0.6)]), glow)


static func bat(ci: CanvasItem, c: Vector2, s: float) -> void:
	var col := Color("140a1c")
	var pts := PackedVector2Array([Vector2(0, -0.2), Vector2(0.25, -0.45), Vector2(0.45, -0.2), Vector2(1.0, -0.6), Vector2(0.85, 0.0),
		Vector2(0.7, -0.1), Vector2(0.55, 0.15), Vector2(0.35, 0.0), Vector2(0.15, 0.3), Vector2(0, 0.15)])
	var full := PackedVector2Array()
	for p in pts:
		full.append(c + p * s)
	for i in range(pts.size() - 1, -1, -1):
		full.append(c + Vector2(-pts[i].x, pts[i].y) * s)
	ci.draw_colored_polygon(full, col)
	ci.draw_circle(c + Vector2(-0.08, -0.15) * s, s * 0.05, Color("ff8a2a"), true, -1.0, true)
	ci.draw_circle(c + Vector2(0.08, -0.15) * s, s * 0.05, Color("ff8a2a"), true, -1.0, true)


static func web(ci: CanvasItem, corner: Vector2, s: float, d: Vector2) -> void:
	var col := Color(0.85, 0.82, 0.9, 0.22)
	var a0 := Vector2(d.x, 0).angle()
	var spokes := 5
	var ends := []
	for i in spokes:
		var a := a0 + (Vector2(0, d.y).angle() - a0) * i / (spokes - 1.0)
		if d.x * d.y < 0:
			a = a0 - (a0 - Vector2(0, d.y).angle()) * i / (spokes - 1.0)
		ends.append(Vector2.from_angle(a))
		ci.draw_line(corner, corner + Vector2.from_angle(a) * s, col, 1.0, true)
	for ring in [0.35, 0.65, 0.95]:
		var pts := PackedVector2Array()
		for e in ends:
			pts.append(corner + e * s * ring)
		ci.draw_polyline(pts, col, 1.0, true)


static func circuit(ci: CanvasItem, corner: Vector2, s: float, d: Vector2) -> void:
	for k in 3:
		var o := corner + d * Vector2(4 + k * 6, 4 + k * 6)
		var p1 := o + Vector2(d.x * s * (0.9 - k * 0.2), 0)
		var p2 := p1 + Vector2(d.x * 6, d.y * 6)
		ci.draw_polyline(PackedVector2Array([o + Vector2(0, d.y * s * (0.7 - k * 0.15)), o, p1, p2]), Color(Mat.NEON, 0.55 - k * 0.12), 1.4, true)
		ci.draw_circle(p2, 2.0, Mat.NEON2 if k == 0 else Mat.NEON, true, -1.0, true)


static func blacksun(ci: CanvasItem, c: Vector2, s: float) -> void:
	ci.draw_circle(c, s * 1.7, Color("ff6a2a", 0.16), true, -1.0, true)
	ci.draw_circle(c, s * 1.15, Color("ffb060", 0.65), true, -1.0, true)
	ci.draw_circle(c, s * 1.05, Color("ffe0b0", 0.75), true, -1.0, true)
	ci.draw_circle(c, s, Color.BLACK, true, -1.0, true)


static func leaf(ci: CanvasItem, at: Vector2, s: float, ang: float, col: Color) -> void:
	var pts := PackedVector2Array()
	for i in 9:
		var t := i / 8.0
		pts.append(Vector2(t * s * 2.0, sin(t * PI) * s * 0.45))
	for i in range(7, 0, -1):
		var t := i / 8.0
		pts.append(Vector2(t * s * 2.0, -sin(t * PI) * s * 0.45))
	var xf := Transform2D(ang, at)
	ci.draw_colored_polygon(xf * pts, col)
	ci.draw_line(xf * Vector2.ZERO, xf * Vector2(s * 1.8, 0), col.darkened(0.35), 1.0, true)


static func wing(ci: CanvasItem, at: Vector2, s: float, side: float) -> void:
	for i in 4:
		var a := deg_to_rad(-20 + i * 18)
		var p := at + Vector2(cos(a) * side, sin(a)) * s * (0.55 + 0.12 * i)
		ci.draw_set_transform(p, a * side + (0.0 if side > 0 else PI), Vector2(1.0, 0.35))
		ci.draw_circle(Vector2.ZERO, s * (0.55 - i * 0.07), Color("fff0d0", 0.85 - i * 0.12), true, -1.0, true)
	ci.draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
	ci.draw_circle(at, s * 0.18, Color("ffc860"), true, -1.0, true)


static func sparkle(ci: CanvasItem, c: Vector2, s: float, col: Color) -> void:
	ci.draw_circle(c, s * 0.9, Color(col, 0.15), true, -1.0, true)
	ci.draw_colored_polygon(PackedVector2Array([c + Vector2(0, -s), c + Vector2(s * 0.18, -s * 0.18), c + Vector2(s, 0), c + Vector2(s * 0.18, s * 0.18),
		c + Vector2(0, s), c + Vector2(-s * 0.18, s * 0.18), c + Vector2(-s, 0), c + Vector2(-s * 0.18, -s * 0.18)]), col)


static func hanko(ci: CanvasItem, c: Vector2, s: float) -> void:
	var r := Rect2(c - Vector2(s, s), Vector2(s, s) * 2.0)
	Gfx.fill_round(ci, r, s * 0.2, Color("c8281a", 0.9))
	Gfx.frame_round(ci, r.grow(-s * 0.18), s * 0.12, Color("fff0e0", 0.85), 1.2)
	for k in [-0.35, 0.0, 0.35]:
		ci.draw_line(c + Vector2(-s * 0.45, k * s), c + Vector2(s * 0.45, k * s), Color("fff0e0", 0.85), 1.2)
	ci.draw_line(c + Vector2(0, -s * 0.55), c + Vector2(0, s * 0.55), Color("fff0e0", 0.85), 1.2)


static func suit(ci: CanvasItem, kind: String, c: Vector2, s: float, col: Color) -> void:
	match kind:
		"heart":
			ci.draw_circle(c + Vector2(-s * 0.25, -s * 0.12), s * 0.27, col, true, -1.0, true)
			ci.draw_circle(c + Vector2(s * 0.25, -s * 0.12), s * 0.27, col, true, -1.0, true)
			ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-s * 0.5, -s * 0.04), c + Vector2(s * 0.5, -s * 0.04), c + Vector2(0, s * 0.55)]), col)
		"spade":
			ci.draw_circle(c + Vector2(-s * 0.25, s * 0.1), s * 0.27, col, true, -1.0, true)
			ci.draw_circle(c + Vector2(s * 0.25, s * 0.1), s * 0.27, col, true, -1.0, true)
			ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-s * 0.5, s * 0.02), c + Vector2(s * 0.5, s * 0.02), c + Vector2(0, -s * 0.55)]), col)
			ci.draw_colored_polygon(PackedVector2Array([c + Vector2(0, s * 0.1), c + Vector2(s * 0.2, s * 0.6), c + Vector2(-s * 0.2, s * 0.6)]), col)
		"club":
			for p in [Vector2(0, -s * 0.26), Vector2(-s * 0.27, s * 0.08), Vector2(s * 0.27, s * 0.08)]:
				ci.draw_circle(c + p, s * 0.24, col, true, -1.0, true)
			ci.draw_colored_polygon(PackedVector2Array([c, c + Vector2(s * 0.18, s * 0.6), c + Vector2(-s * 0.18, s * 0.6)]), col)
		"diamond":
			ci.draw_colored_polygon(PackedVector2Array([c + Vector2(0, -s * 0.6), c + Vector2(s * 0.42, 0), c + Vector2(0, s * 0.6), c + Vector2(-s * 0.42, 0)]), col)
