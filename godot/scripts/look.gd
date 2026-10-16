class_name Look
## Thème de l'interface choisi sur le compte (comme l'appli web : themes.css, halloween.css, cyber.css, themes.js du moteur).
## Il teinte toute l'appli Godot : métal des cadres, cuirs, pierre, table de la partie, braises, lueurs, et l'écran d'accueil
## (fond et illustration du général du thème).
##
## Le thème est lu dans /api/me (progress.theme, progress.cosmetics.themes) : null = celui de la saison en cours,
## « base » = thème de base. Le changer passe par PUT /api/cosmetics, la même route que la personnalisation de l'appli web.

## Couleurs reprises des variables CSS de chaque thème : leather, gold, gold-lo, gold-hi, accent, bg, et glow2 pour la brume.
## Seule exception : l'Estampe, claire dans l'appli web, garde ici un fond d'encre brune pour que les textes clairs restent lisibles.
## art : illustration du général montrée sur l'accueil (art alternatif du thème quand il existe dans godot/art/alt).
const THEMES := {
	"": {"name": "Thème de base", "leather": "2c2017", "gold": "e3b552", "lo": "8f5f1c", "hi": "fff3cf", "accent": "e3b552", "bg": "120d0a", "mist": "c0ad99", "art": ""},
	"halloween": {"name": "Nuit des citrouilles", "leather": "241430", "gold": "ff9a3a", "lo": "8a3a08", "hi": "ffe2b0", "accent": "ff8a2a", "bg": "0e0814", "mist": "9a5ac8", "art": "alt/morgrath_citrouilles"},
	"cyber": {"name": "Néon 2099", "leather": "0b1222", "gold": "fcee0a", "lo": "8a7f00", "hi": "fff9b0", "accent": "fcee0a", "bg": "05070f", "mist": "20c0ff", "art": "lirael"},
	"eclipse": {"name": "Éclipse d'Ignaroth", "leather": "24100f", "gold": "ff8a3a", "lo": "7a2008", "hi": "ffd8b0", "accent": "ff6a2a", "bg": "0a0507", "mist": "c81e14", "art": "alt/ignaroth_eclipse"},
	"sylve": {"name": "Bois de Sylvaën", "leather": "142a1c", "gold": "c8e070", "lo": "4a6a1a", "hi": "f0ffd0", "accent": "b8e060", "bg": "07110b", "mist": "3cc88c", "art": "sylvaen"},
	"astral": {"name": "Ciel d'Elyndra", "leather": "0e1240", "gold": "ffd870", "lo": "7a5a18", "hi": "fff4c8", "accent": "ffd870", "bg": "05061a", "mist": "788cff", "art": "alt/elyndra_astral"},
	"estampe": {"name": "Estampe d'Ysmera", "leather": "ead9b4", "gold": "a8741e", "lo": "6a4a1a", "hi": "ffe8c8", "accent": "c8281a", "bg": "2a1e18", "mist": "2a5a7a", "art": "alt/ysmera_estampe"},
	"casino": {"name": "Roue de Fortuna", "leather": "2a0a0e", "gold": "f2c14e", "lo": "7a5410", "hi": "fff2c0", "accent": "f2c14e", "bg": "04190f", "mist": "dc1432", "art": ""},
	"aube": {"name": "Aube de Séraphine", "leather": "2a1c32", "gold": "ffcc6a", "lo": "8a5a1a", "hi": "fff4d0", "accent": "ffc85a", "bg": "140e1c", "mist": "ff82aa", "art": "seraphine"},
}
## Table de la partie et braises, reprises de client/src/season.js (TABLE et PALETTE) : sol, planches (aucune : sol uni),
## lampe et seconde lueur en bas, décor propre au thème (decor.gd), braises (trois couleurs), deux nappes de brume,
## couleur des bandeaux, police des titres, et cadres : laiton (metal) ou néon à coins coupés (neon).
const TABLES := {
	"": {"ground": "140e0a", "planks": ["1c140e", "19110c"], "lamp": "ffc070", "low": "", "deco": "", "embers": ["ffa040", "ffa040", "ffe0a0"], "fog": ["a0b0c0", "d8b890"], "edge": "", "font": "Cinzel-Bold", "frame": "metal"},
	"halloween": {"ground": "120a16", "planks": ["1c1222", "170e1c"], "lamp": "ff8a2a", "low": "8a3cff", "deco": "moon", "embers": ["ff8a2a", "b070ff", "7dffb0"], "fog": ["6a4a9a", "3a7a5a"], "edge": "8a3cff", "font": "Creepster", "frame": "metal"},
	"cyber": {"ground": "05070f", "planks": [], "lamp": "19e6ff", "low": "ff2bd6", "deco": "grid", "embers": ["19e6ff", "ff2bd6", "fcee0a"], "fog": ["1a3a7a", "6a1a6a"], "edge": "19e6ff", "font": "Orbitron-Bold", "frame": "neon"},
	"eclipse": {"ground": "0e0606", "planks": ["170a09", "130807"], "lamp": "ff6a2a", "low": "b01a10", "deco": "sun", "embers": ["ff5a1a", "ff9a3a", "c81e1e"], "fog": ["5a1a1a", "3a1020"], "edge": "ff4a1a", "font": "MedievalSharp", "frame": "metal"},
	"sylve": {"ground": "08120c", "planks": ["0f1d13", "0c1810"], "lamp": "e0ffb0", "low": "2a8a5a", "deco": "forest", "embers": ["c8ff80", "7dffb0", "fff0a0"], "fog": ["3a6a4a", "7a9a5a"], "edge": "9ad860", "font": "UncialAntiqua", "frame": "metal"},
	"aube": {"ground": "140e1a", "planks": ["1e1624", "1a1220"], "lamp": "ffd8a0", "low": "ff7aa0", "deco": "dawn", "embers": ["ffd890", "ffb0c8", "ffffff"], "fog": ["c898b8", "ffd8a0"], "edge": "ffc860", "font": "CinzelDecorative-Bold", "frame": "metal"},
	"astral": {"ground": "060818", "planks": [], "lamp": "6a7aff", "low": "9a4ad8", "deco": "stars", "embers": ["fff2b0", "a8c8ff", "ffffff"], "fog": ["3a2a8a", "1a4a9a"], "edge": "ffd870", "font": "MarcellusSC", "frame": "metal"},
	"estampe": {"ground": "efe2c4", "planks": [], "lamp": "ffe0b0", "low": "", "deco": "waves", "embers": ["d8301c", "f0a0a8", "3a8a9a"], "fog": ["6aa0aa", "d8c8a8"], "edge": "c8281a", "font": "Shojumaru", "frame": "metal"},
	"casino": {"ground": "0a3a24", "planks": [], "lamp": "fff0c0", "low": "", "deco": "felt", "embers": ["ffd860", "ff3a4a", "fff2c0"], "fog": ["1a6a40", "6a5a20"], "edge": "f2c14e", "font": "Limelight", "frame": "metal"},
}

## Saisons (SEASONS de packages/engine/src/pass.js) : mois, jour de début et thème montré par défaut ce mois-là.
const SEASONS := [["2026-10", "2026-10-01", "halloween"], ["2026-11", "2026-11-02", "cyber"]]

static var id := ""
static var pick = null            # choix du compte : null (saison), « base », ou un thème
static var owned: Array = []      # thèmes débloqués sur le compte
static var accent := Color("e3b552")
static var mist := Color("c0ad99")
static var bg := Color("120d0a")
static var tone := Color(1, 1, 1)  # rapport cuir du thème / cuir de base, pour teinter les bruns dessinés en dur
static var deco := ""             # décor de la table (decor.gd)
static var frame := "metal"       # cadres : laiton bombé, ou néon à coins coupés (Néon 2099)
static var edge := Color("e8c26a")   # bandeaux et titres
static var font: Font = null      # police des titres du thème
static var embers: Array = []     # trois couleurs de braises
static var changed_at := 0         # augmente à chaque changement : les textures en cache se refont


## Lit le thème dans la réponse de /api/me et l'applique.
static func from_account(account: Dictionary) -> void:
	var p: Dictionary = account.get("progress", {})
	pick = p.get("theme")
	owned = []
	for t in p.get("cosmetics", {}).get("themes", []):
		owned.append(str(t.get("id", "")) if t is Dictionary else str(t))
	apply(resolve())


## Thème montré : comme uiTheme() de client/src/main.js.
static func resolve() -> String:
	if pick == "base":
		return ""
	if pick != null and str(pick) in owned and THEMES.has(str(pick)):
		return str(pick)
	var day := Time.get_date_string_from_system()
	for s in SEASONS:
		if day.begins_with(s[0]) and day >= s[1]:
			return s[2]
	return ""


static func apply(theme: String) -> void:
	if not THEMES.has(theme):
		theme = ""
	id = theme
	var t: Dictionary = THEMES[theme]
	var base: Dictionary = THEMES[""]
	accent = Color(t.accent)
	mist = Color(t.mist)
	bg = Color(t.bg)
	# Cuirs : même teinte que le thème, luminosité ramenée près de celle de base (l'Estampe, claire, reste lisible).
	var lt := Color(t.leather)
	var lb := Color(base.leather)
	var r := Color(lt.r / lb.r, lt.g / lb.g, lt.b / lb.b)
	var lum := 0.3 * r.r + 0.55 * r.g + 0.15 * r.b
	var k := clampf(lum, 0.8, 1.35) / maxf(lum, 0.01)
	tone = Color(r.r * k, r.g * k, r.b * k)
	# Métal des cadres et or des textes.
	var gold := Color(t.gold)
	Mat.BRASS = Color("c8962e") if theme == "" else gold.lerp(Color("c8962e"), 0.3).darkened(0.08)
	Mat.BRASS_DARK = Color(t.lo)
	Mat.LEATHER = leather(Color("3a2618"))
	Mat.STONE = leather(Color("4a4038"))
	Data.GOLD = Color("e8c26a") if theme == "" else gold.lerp(Color(t.hi), 0.3)
	Data.GOLD_DARK = Color("8a6326") if theme == "" else Color(t.lo)
	var tb: Dictionary = TABLES[theme]
	deco = tb.deco
	frame = tb.frame
	edge = Color(tb.edge) if tb.edge != "" else Color("e8c26a")
	font = load("res://fonts/%s.ttf" % tb.font)
	embers = tb.embers.map(func(c): return Color(c))
	Mat.clear_plates()
	changed_at += 1


## Brun de l'interface (cuir, bois) passé aux couleurs du thème.
static func leather(c: Color) -> Color:
	return Color(minf(c.r * tone.r, 1.0), minf(c.g * tone.g, 1.0), minf(c.b * tone.b, 1.0), c.a)


## Police des titres du thème (bandeaux, fin de partie, noms des joueurs, accueil).
static func title_font() -> Font:
	return font if font else Data.font_title


static func name_of(theme: String) -> String:
	return str(THEMES.get(theme, THEMES[""]).name)


## Illustration du général du thème pour l'accueil : [decor, perso], ou vide.
static func art() -> Array:
	var a := str(THEMES[id].art)
	if a == "":
		return []
	return [Data.tex("res://art/%s/decor.webp" % a), Data.tex("res://art/%s/perso.webp" % a)]


## Thèmes que le joueur peut choisir : base, puis ceux débloqués.
static func choices() -> Array:
	var out := [""]
	for t in owned:
		if THEMES.has(t) and t not in out:
			out.append(t)
	return out


## Couleurs de la table de la partie (table.gdshader) : sol, planches (ou sol uni), lampe, lueur du bas, deux brumes.
static func table(mat: ShaderMaterial) -> void:
	var tb: Dictionary = TABLES[id]
	var pl: Array = tb.planks
	mat.set_shader_parameter("sol", Color(tb.ground))
	mat.set_shader_parameter("planches", 1.0 if pl.size() == 2 else 0.0)
	mat.set_shader_parameter("planche_a", Color(pl[0]) if pl.size() == 2 else Color(tb.ground))
	mat.set_shader_parameter("planche_b", Color(pl[1]) if pl.size() == 2 else Color(tb.ground))
	mat.set_shader_parameter("lampe", Color(tb.lamp))
	mat.set_shader_parameter("bas", Color(tb.low) if tb.low != "" else Color(0, 0, 0, 0))
	mat.set_shader_parameter("brume", Color(tb.fog[0]))
	mat.set_shader_parameter("brume2", Color(tb.fog[1]))
	# Papier clair de l'estampe : vignette et brume plus douces.
	mat.set_shader_parameter("clair", 1.0 if Color(tb.ground).get_luminance() > 0.5 else 0.0)
