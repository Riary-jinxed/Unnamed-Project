class_name Gfx
## Dessin partagé : rectangles arrondis texturés (illustrations recadrées), cercles, textes ajustés.


## Contour d'un rectangle aux coins arrondis, dans le sens des aiguilles d'une montre.
static func round_pts(r: Rect2, rad: float, seg := 6) -> PackedVector2Array:
	rad = minf(rad, minf(r.size.x, r.size.y) * 0.5)
	var pts := PackedVector2Array()
	var corners := [
		[Vector2(r.position.x + rad, r.position.y + rad), PI],
		[Vector2(r.end.x - rad, r.position.y + rad), PI * 1.5],
		[Vector2(r.end.x - rad, r.end.y - rad), 0.0],
		[Vector2(r.position.x + rad, r.end.y - rad), PI * 0.5],
	]
	for c in corners:
		for i in seg + 1:
			var a: float = c[1] + PI * 0.5 * i / seg
			var p: Vector2 = c[0] + Vector2(cos(a), sin(a)) * rad
			# Coins qui se touchent (cercle) : pas de point en double, sinon la triangulation échoue.
			if pts.is_empty() or pts[pts.size() - 1].distance_squared_to(p) > 0.01:
				pts.append(p)
	if pts.size() > 2 and pts[0].distance_squared_to(pts[pts.size() - 1]) <= 0.01:
		pts.remove_at(pts.size() - 1)
	return pts


static func uvs_for(pts: PackedVector2Array, r: Rect2, uv: Rect2) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p in pts:
		out.append(uv.position + (p - r.position) / r.size * uv.size)
	return out


## Partie `base` (en coordonnées 0-1 de l'image) recadrée pour remplir `rect` sans déformer ; focus : point gardé au centre.
static func cover_uv(tex: Texture2D, base: Rect2, rect_size: Vector2, focus := Vector2(0.5, 0.4)) -> Rect2:
	var px := base.size * Vector2(tex.get_size())
	var ra := rect_size.x / maxf(rect_size.y, 1.0)
	var uv := base
	if px.x / px.y > ra:
		var w := base.size.x * (px.y * ra) / px.x
		uv.position.x += clampf(focus.x * base.size.x - w * 0.5, 0.0, base.size.x - w)
		uv.size.x = w
	else:
		var h := base.size.y * (px.x / ra) / px.y
		uv.position.y += clampf(focus.y * base.size.y - h * 0.5, 0.0, base.size.y - h)
		uv.size.y = h
	return uv


static func tex_round(ci: CanvasItem, tex: Texture2D, r: Rect2, uv: Rect2, rad: float, mod := Color.WHITE) -> void:
	var pts := round_pts(r, rad)
	ci.draw_polygon(pts, PackedColorArray([mod]), uvs_for(pts, r, uv), tex)


static func fill_round(ci: CanvasItem, r: Rect2, rad: float, col: Color) -> void:
	ci.draw_colored_polygon(round_pts(r, rad), col)


## Dégradé vertical dans un rectangle arrondi : transparent en haut de `from` (0-1), `col` en bas.
static func shade_round(ci: CanvasItem, r: Rect2, rad: float, from: float, col: Color) -> void:
	var pts := round_pts(r, rad)
	var y0 := r.position.y + r.size.y * from
	var cols := PackedColorArray()
	for i in pts.size():
		pts[i].y = maxf(pts[i].y, y0)
		var t := clampf((pts[i].y - y0) / maxf(r.end.y - y0, 1.0), 0.0, 1.0)
		cols.append(Color(col, col.a * t))
	ci.draw_polygon(pts, cols)


static func frame_round(ci: CanvasItem, r: Rect2, rad: float, col: Color, width: float) -> void:
	var sb := StyleBoxFlat.new()
	sb.draw_center = false
	sb.set_corner_radius_all(int(rad))
	sb.set_border_width_all(maxi(1, int(round(width))))
	sb.border_color = col
	sb.anti_aliasing = true
	sb.corner_detail = 6
	ci.draw_style_box(sb, r)


## Texte centré sur une ligne, réduit jusqu'à tenir dans `width`, avec un contour pour rester lisible sur l'illustration.
static func text_fit(ci: CanvasItem, font: Font, center: Vector2, text: String, width: float, size: int, col: Color, outline := 0, outline_col := Color(0, 0, 0, 0.85)) -> void:
	var fs := size
	while fs > 8 and font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > width:
		fs -= 1
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var pos := Vector2(center.x - w * 0.5, center.y + (font.get_ascent(fs) - font.get_descent(fs)) * 0.5)
	if outline > 0:
		ci.draw_string_outline(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, outline, outline_col)
	ci.draw_string(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)


## Pastille ronde (coût, puissance) avec son chiffre.
static func badge(ci: CanvasItem, c: Vector2, rad: float, fill: Color, ring: Color, text: String, text_col: Color) -> void:
	ci.draw_circle(c + Vector2(0, rad * 0.12), rad * 1.05, Color(0, 0, 0, 0.45), true, -1.0, true)
	ci.draw_circle(c, rad, fill, true, -1.0, true)
	ci.draw_arc(c, rad - rad * 0.08, 0, TAU, 40, ring, rad * 0.16, true)
	text_fit(ci, Data.font_title, c, text, rad * 1.6, int(rad * 1.25), text_col, int(rad * 0.25))


## Portrait rond d'un général, cadré sur son visage (table FACES de l'appli).
static func portrait(ci: CanvasItem, id, c: Vector2, rad: float, ring: Color) -> void:
	var r := Rect2(c - Vector2(rad, rad), Vector2(rad, rad) * 2.0)
	ci.draw_circle(c + Vector2(0, rad * 0.08), rad * 1.06, Color(0, 0, 0, 0.5), true, -1.0, true)
	var decor := Data.layer(id, "decor")
	var face: Array = Data.faces.get(str(id), [50, 30])
	var focus := Vector2(face[0] / 100.0, face[1] / 100.0)
	if decor:
		var uv := Rect2(clampf(focus.x - 0.2, 0, 0.6), clampf(focus.y - 0.135, 0, 0.73), 0.4, 0.27)
		tex_round(ci, decor, r, uv, rad)
		var perso := Data.layer(id, "perso")
		if perso:
			tex_round(ci, perso, r, uv, rad)
	else:
		ci.draw_circle(c, rad, Data.fam_color(Data.generals.get(str(id), {}).get("fam")).darkened(0.4), true, -1.0, true)
	ci.draw_arc(c, rad, 0, TAU, 48, ring, maxf(2.0, rad * 0.09), true)


## Dégradé vertical sombre dans un rectangle arrondi : opacités `alphas` aux hauteurs `stops` (0 en haut, 1 en bas).
static func vgrad_round(ci: CanvasItem, r: Rect2, rad: float, stops: Array, alphas: Array, col := Color(0, 0, 0)) -> void:
	var outline := round_pts(r, rad, 6)
	for i in stops.size() - 1:
		var y0: float = r.position.y + r.size.y * stops[i]
		var y1: float = r.position.y + r.size.y * stops[i + 1]
		var band := PackedVector2Array([Vector2(r.position.x - 1, y0), Vector2(r.end.x + 1, y0), Vector2(r.end.x + 1, y1), Vector2(r.position.x - 1, y1)])
		for poly in Geometry2D.intersect_polygons(band, outline):
			var cols := PackedColorArray()
			for p in poly:
				var t := clampf((p.y - y0) / maxf(y1 - y0, 0.001), 0.0, 1.0)
				cols.append(Color(col, lerpf(alphas[i], alphas[i + 1], t)))
			ci.draw_polygon(poly, cols)


## Filet de couleur en haut d'une carte (couleur de la famille).
static func top_bar(ci: CanvasItem, r: Rect2, rad: float, h: float, col: Color) -> void:
	var band := PackedVector2Array([r.position - Vector2(1, 1), Vector2(r.end.x + 1, r.position.y - 1), Vector2(r.end.x + 1, r.position.y + h), Vector2(r.position.x - 1, r.position.y + h)])
	for poly in Geometry2D.intersect_polygons(band, round_pts(r, rad, 6)):
		ci.draw_colored_polygon(poly, col)


## Pièce d'or du coût (sceaux), comme le .seal de l'appli ; rouge sombre si la carte est trop chère.
static func coin(ci: CanvasItem, c: Vector2, rad: float, text: String, ok := true) -> void:
	ci.draw_circle(c + Vector2(0, rad * 0.15), rad * 1.08, Color(0, 0, 0, 0.55), true, -1.0, true)
	var outer := Color("8f5f1c") if ok else Color("6a2a22")
	var mid := Color("e3b552") if ok else Color("b0584a")
	var hi := Color("fff0b8") if ok else Color("ffc0b0")
	ci.draw_circle(c, rad, outer, true, -1.0, true)
	ci.draw_circle(c - Vector2(rad, rad) * 0.08, rad * 0.86, mid, true, -1.0, true)
	ci.draw_circle(c - Vector2(rad, rad) * 0.3, rad * 0.4, Color(hi, 0.75), true, -1.0, true)
	ci.draw_arc(c, rad, 0, TAU, 32, Color("2a1606"), maxf(1.0, rad * 0.12), true)
	text_fit(ci, Data.font_title, c + Vector2(0, rad * 0.04), text, rad * 1.5, int(rad * 1.3), Color("2a1606"))


## Médaillon de puissance : disque sombre cerclé d'or, chiffre doré (vert ou rouge s'il a changé).
static func medal(ci: CanvasItem, c: Vector2, rad: float, text: String, text_col: Color) -> void:
	ci.draw_circle(c + Vector2(0, rad * 0.15), rad * 1.1, Color(0, 0, 0, 0.6), true, -1.0, true)
	ci.draw_circle(c, rad, Color("1b120c"), true, -1.0, true)
	ci.draw_circle(c - Vector2(0, rad * 0.25), rad * 0.6, Color(1, 0.85, 0.5, 0.08), true, -1.0, true)
	ci.draw_arc(c, rad - rad * 0.08, 0, TAU, 40, Color("c8902f"), rad * 0.17, true)
	text_fit(ci, Data.font_title, c + Vector2(0, rad * 0.04), text, rad * 1.6, int(rad * 1.3), text_col, int(rad * 0.22))


## Texte sur une ou plusieurs lignes, coupé aux mots et réduit pour tenir dans `r` (nom d'une carte).
static func text_lines(ci: CanvasItem, font: Font, r: Rect2, text: String, size: int, col: Color, max_lines := 2, outline := 0) -> void:
	var fs := size
	var lines: PackedStringArray
	while true:
		lines = _wrap(font, text, r.size.x, fs)
		var h := lines.size() * font.get_height(fs) * 0.92
		if (lines.size() <= max_lines and h <= r.size.y) or fs <= 8:
			break
		fs -= 1
	var y := r.position.y + font.get_ascent(fs)
	for l in lines:
		var pos := Vector2(r.position.x, y)
		if outline > 0:
			ci.draw_string_outline(font, pos, l, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, outline, Color(0, 0, 0, 0.85))
		ci.draw_string(font, pos, l, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
		y += font.get_height(fs) * 0.92


static func _wrap(font: Font, text: String, width: float, fs: int) -> PackedStringArray:
	var out := PackedStringArray()
	var line := ""
	for w in text.split(" "):
		var t := w if line == "" else line + " " + w
		if line != "" and font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > width:
			out.append(line)
			line = w
		else:
			line = t
	if line != "":
		out.append(line)
	return out


## Contour en pointillés d'un rectangle arrondi (carte posée ce tour).
static func dashed_round(ci: CanvasItem, r: Rect2, rad: float, col: Color, width: float) -> void:
	var pts := round_pts(r, rad, 6)
	pts.append(pts[0])
	var dash := width * 3.0
	var on := true
	var left := dash
	for i in pts.size() - 1:
		var a := pts[i]
		var b := pts[i + 1]
		var seg := a.distance_to(b)
		var at := 0.0
		while at < seg:
			var step := minf(left, seg - at)
			if on:
				ci.draw_line(a.lerp(b, at / seg), a.lerp(b, (at + step) / seg), col, width, true)
			at += step
			left -= step
			if left <= 0.0:
				on = not on
				left = dash
