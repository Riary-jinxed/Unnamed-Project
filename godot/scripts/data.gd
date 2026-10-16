extends Node
## Catalogue exporté du moteur de règles (npm run godot:data) : cartes, généraux, terrains, zones.
## Godot n'a pas de copie des règles : il affiche ce que le serveur envoie et ne lit ici que les textes et les illustrations.

var cards := {}
var generals := {}
var terrains := {}
var zones: Array = []
var families := {}
var faces := {}
var slots := 4

var font_title: FontFile = preload("res://fonts/Cinzel-Bold.ttf")
var font_body: FontFile = preload("res://fonts/AlegreyaSans-Medium.ttf")
var font_bold: FontFile = preload("res://fonts/AlegreyaSans-Bold.ttf")
var font_sc: FontFile = preload("res://fonts/AlegreyaSC-Bold.ttf")
# Police du nom de la carte sur son illustration, une par famille (--famfont de client/src/style.css).
var fam_fonts := {
	"Ange": preload("res://fonts/CinzelDecorative-Bold.ttf"), "Démon": preload("res://fonts/PirataOne.ttf"),
	"Gobelin": preload("res://fonts/MetalMania.ttf"), "Elfe": preload("res://fonts/UncialAntiqua.ttf"),
	"Dragon": preload("res://fonts/MedievalSharp.ttf"), "Mort-vivant": preload("res://fonts/Creepster.ttf"),
	"Vampire": preload("res://fonts/UnifrakturMaguntia.ttf"), "Hacker": preload("res://fonts/ShareTechMono.ttf"),
	"Cyborg": preload("res://fonts/Orbitron-Bold.ttf"),
}
var _kw_re: RegEx

var _tex := {}

# Gabarit des illustrations (client/src/art.js) : image 960x1424, fenêtre de la carte 832x1168 placée à (64, 192).
const WINDOW_UV := Rect2(64.0 / 960.0, 192.0 / 1424.0, 832.0 / 960.0, 1168.0 / 1424.0)
const GOLD := Color("e8c26a")
const GOLD_DARK := Color("8a6326")
const INK := Color("1b120d")
# Couleurs des deux camps (--mine et --foe de l'appli) et des bonus et malus.
const MINE := Color("77a3e6")
const FOE := Color("e48069")
const UP := Color("7ee08a")
const DOWN := Color("ff8a80")


func _ready() -> void:
	var f := FileAccess.open("res://data/catalog.json", FileAccess.READ)
	if f == null:
		push_error("data/catalog.json manque : lancez « npm run godot:data » à la racine du dépôt.")
		return
	var d: Dictionary = JSON.parse_string(f.get_as_text())
	cards = d.cards
	generals = d.generals
	terrains = d.terrains
	zones = d.zones
	families = d.families
	faces = d.faces
	slots = int(d.slots)
	_kw_re = RegEx.create_from_string("(?<!\\p{L})(?:%s)(?!\\p{L})" % "|".join(d.get("keywords", ["Révélation"])))


func card(id) -> Dictionary:
	return cards.get(str(id), {})


func fam_color(fam) -> Color:
	return Color(families.get(fam if fam != null else "neutre", families.get("neutre", "#99a1b0")))


func fam_font(fam) -> Font:
	return fam_fonts.get(fam, font_title)


## Texte d'effet en BBCode, mots-clés en gras (rich de client/src/common.js).
func rich(text: String) -> String:
	var s := text.replace("[", "[lb]")
	return _sub(s, _kw_re.get_pattern(), func(m: RegExMatch) -> String: return "[b][color=#ffd98a]%s[/color][/b]" % m.get_string())


## Niveau d'aspect d'une carte pour un joueur (bordure choisie, sinon niveau) : badges envoyés par le serveur.
## Style d'animation de l'effet d'une carte ou d'un général (voir Fx.effect) : d'abord la carte elle-même, puis ce que
## dit son texte, puis sa famille.
const FX_IDS := {"potion": "potion", "souffle": "fire", "pyromane": "fire", "bombardier": "blast", "petaradeur": "blast",
	"bras_canon": "blast", "tourelle": "blast", "mecha": "blast", "saignee": "drain", "nuit_rouge": "drain", "spectre": "ghost",
	"ronces": "leaf", "lueur": "leaf", "pretre_eclipse": "claw", "citrouille": "ghost", "epouvantail": "ghost"}
const FX_FAMS := {"Ange": "holy", "Démon": "claw", "Dragon": "fire", "Elfe": "leaf", "Mort-vivant": "ghost", "Vampire": "drain",
	"Hacker": "hack", "Cyborg": "zap"}


func fx_style(id, general := false) -> String:
	var d: Dictionary = generals.get(str(id), {}) if general else card(id)
	if not general and FX_IDS.has(str(id)):
		return FX_IDS[str(id)]
	var t := str(d.get("text", ""))
	var name := str(d.get("name", "")).to_lower()
	if name.contains("potion") or name.contains("élixir"):
		return "potion"
	if t.contains("Drain"):
		return "drain"
	if t.contains("Piratage") or t.contains("Malware"):
		return "hack"
	if t.contains("Pari") or t.contains(" dé"):
		return "dice"
	if t.contains("Implant") or t.contains("Surcharge"):
		return "zap"
	return FX_FAMS.get(str(d.get("fam", "")), "bolt")


static func level_of(badge, id) -> int:
	if not badge is Dictionary or id == null:
		return 1
	var b = badge.get("borders", {}).get(str(id))
	if b != null:
		return int(b)
	return int(badge.get("looks", {}).get(str(id), 1))


func tex(path: String) -> Texture2D:
	if not _tex.has(path):
		_tex[path] = load(path) if ResourceLoader.exists(path) else null
	return _tex[path]


## Calque d'une carte ou d'un général : « decor » (fond) ou « perso » (personnage détouré).
func layer(id, which: String) -> Texture2D:
	return tex("res://art/%s/%s.webp" % [id, which])


func terrain_tex(id) -> Texture2D:
	return tex("res://art/terrain/%s.webp" % id) if id != null else null


## Nombre lu dans le JSON (toujours un flottant) écrit sans « .0 ».
static func num(v) -> String:
	if v == null:
		return ""
	if v is float and is_equal_approx(v, roundf(v)):
		return str(int(v))
	return str(v)


## Texte d'une ligne du journal pour le siège `seat` : même règle que renderLog du moteur (français seulement pour l'instant).
func render_log(line, seat: int, names: Array) -> String:
	var s := _fill(line)
	s = _sub(s, "⟪([cgtz]):([^⟫]*)⟫", _named)
	s = _sub(s, "⟦(\\d)\\|([^|⟧]*)\\|([^⟧]*)⟧", func(m: RegExMatch) -> String: return _form(m, seat, names))
	s = _sub(s, "⟦(\\d)⟧", func(m: RegExMatch) -> String: return _player(m, seat, names))
	return s


func _named(m: RegExMatch) -> String:
	var id := m.get_string(2)
	match m.get_string(1):
		"c":
			return str(cards.get(id, {}).get("name", id))
		"g":
			return str(generals.get(id, {}).get("name", id))
		"t":
			return str(terrains.get(id, {}).get("name", id))
	return str(zones[int(id)]) if int(id) < zones.size() else id


func _form(m: RegExMatch, seat: int, names: Array) -> String:
	var p := int(m.get_string(1))
	var form := m.get_string(3) if p == seat else m.get_string(2)
	return form.replace("@", str(names[p]) if p < names.size() else "")


func _player(m: RegExMatch, seat: int, names: Array) -> String:
	var p := int(m.get_string(1))
	return "Vous" if p == seat else (str(names[p]) if p < names.size() else "")


func _fill(m) -> String:
	if m is Array and m.size() == 2:
		return _vars(str(m[0]), m[1])
	if m is Dictionary:
		return _vars(str(m.get("msg", "")), m.get("vars"))
	return str(m)


func _vars(s: String, vars) -> String:
	if not vars is Dictionary:
		return s
	for k in vars:
		var v = vars[k]
		s = s.replace("{%s}" % k, _fill(v) if v is Array else num(v) if v is float else str(v))
	return s


func _sub(s: String, pattern: String, f: Callable) -> String:
	var re := RegEx.create_from_string(pattern)
	var out := ""
	var at := 0
	for m in re.search_all(s):
		out += s.substr(at, m.get_start() - at) + f.call(m)
		at = m.get_end()
	return out + s.substr(at)
