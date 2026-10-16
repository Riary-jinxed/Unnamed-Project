class_name Persp
## Perspective du plateau : les zones et les cartes posées sont mises en page « à plat », puis le shader persp.gdshader
## les rapproche du centre et les rétrécit vers le haut, comme une table vue de biais. L'échelle suit la hauteur de façon
## à garder les proportions des cartes (pas d'écrasement) : s = k·exp((y − y0)(1 − k)/hs), y' = y0 + (s − k)/(1 − k)·hs.
## Les lignes verticales restent droites et fuient vers le haut ; proj() et unproj() font le même calcul côté script
## (effets, toucher).

static var on := false
static var y0 := 0.0       # haut du plateau, à plat comme à l'écran
static var hs := 1.0       # hauteur du plateau à l'écran
static var k := 0.8        # échelle tout en haut du plateau (1 en bas)
static var cx := 360.0


## Règle la perspective ; renvoie la hauteur du plateau à plat (plus grande que hs).
static func setup(top: float, screen_h: float, center_x: float, top_scale: float) -> float:
	y0 = top
	hs = screen_h
	cx = center_x
	k = top_scale
	on = true
	for p in [["persp_y0", y0], ["persp_hs", hs], ["persp_k", k], ["persp_cx", cx]]:
		RenderingServer.global_shader_parameter_set(p[0], p[1])
	return flat_h()


static func flat_h() -> float:
	return hs / (1.0 - k) * log(1.0 / k)


static func scale_at(y: float) -> float:
	return k * exp((y - y0) * (1.0 - k) / hs) if on else 1.0


static func proj(p: Vector2) -> Vector2:
	if not on:
		return p
	var s := scale_at(p.y)
	return Vector2(cx + (p.x - cx) * s, y0 + (s - k) / (1.0 - k) * hs)


static func unproj(q: Vector2) -> Vector2:
	if not on:
		return q
	var s := maxf(k + (q.y - y0) * (1.0 - k) / hs, 0.05)
	return Vector2(cx + (q.x - cx) / s, y0 + hs / (1.0 - k) * log(s / k))


## Toucher sur un contrôle dessiné en perspective : le point local que Godot calcule à plat, remis à sa vraie place.
static func local_point(c: Control, p: Vector2) -> Vector2:
	var xf := c.get_global_transform()
	return xf.affine_inverse() * unproj(xf * p)
