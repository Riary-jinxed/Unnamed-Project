extends Control
## Écran de connexion, puis plateau. Pour le prototype, une seule partie : classée contre l'IA, jouée par le serveur.
## Options après « -- » sur la ligne de commande :
##   --server=URL  --login=…  --password=…  connexion automatique
##   --auto        joue seul (pose ses cartes au mieux) : essais et captures
##   --shots=DOSSIER  enregistre des captures (plan, révélation, fin) ; --frames=DOSSIER : une image toutes les 0,1 s
##   --quit        quitte après la fin de la partie

const Board := preload("res://scripts/board.gd")

var args := {}
var board: Control
var login_box: Control
var err_label: Label
var _frames_dir := ""
var _frame_t := 0.0
var _frame_n := 0
var _reveal_shot := false


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		args[kv[0]] = kv[1] if kv.size() > 1 else true
	_frames_dir = str(args.get("frames", ""))
	if _frames_dir != "":
		DirAccess.make_dir_recursive_absolute(_frames_dir)
	if args.has("shots"):
		DirAccess.make_dir_recursive_absolute(str(args.shots))
	Net.message.connect(_on_message)
	Net.closed.connect(func(): _error("Connexion au serveur perdue."))
	_build_login()
	if args.has("login") and args.has("password"):
		_do_login(str(args.login), str(args.password))


func _build_login() -> void:
	var bg := ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://shaders/fond.gdshader")
	bg.material = mat
	add_child(bg)
	login_box = VBoxContainer.new()
	login_box.set_anchors_preset(Control.PRESET_CENTER)
	login_box.custom_minimum_size = Vector2(520, 0)
	login_box.position = Vector2(-260, -260)
	login_box.add_theme_constant_override("separation", 18)
	add_child(login_box)
	var title := Label.new()
	title.text = "Jeu de cartes"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_override("font", Data.font_title)
	title.add_theme_font_size_override("font_size", 56)
	title.add_theme_color_override("font_color", Color("ffe7a6"))
	title.add_theme_constant_override("outline_size", 12)
	title.add_theme_color_override("font_outline_color", Color(0.12, 0.05, 0.02))
	login_box.add_child(title)
	var sub := Label.new()
	sub.text = "Prototype Godot · %s" % Net.server
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_color_override("font_color", Color(1, 0.9, 0.75, 0.6))
	login_box.add_child(sub)
	var user := _field("Identifiant", false)
	var pwd := _field("Mot de passe", true)
	var go := Board.gold_button("Jouer contre l'IA")
	go.custom_minimum_size = Vector2(0, 72)
	go.pressed.connect(func(): _do_login(user.text, pwd.text))
	login_box.add_child(go)
	err_label = Label.new()
	err_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	err_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	err_label.add_theme_color_override("font_color", Color("ff9c8f"))
	login_box.add_child(err_label)


func _field(placeholder: String, secret: bool) -> LineEdit:
	var e := LineEdit.new()
	e.placeholder_text = placeholder
	e.secret = secret
	e.custom_minimum_size = Vector2(0, 64)
	e.add_theme_font_size_override("font_size", 26)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.08, 0.055, 0.04, 0.95)
	sb.border_color = Data.GOLD_DARK
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(12)
	sb.content_margin_left = 18
	e.add_theme_stylebox_override("normal", sb)
	var sf := sb.duplicate()
	sf.border_color = Data.GOLD
	e.add_theme_stylebox_override("focus", sf)
	login_box.add_child(e)
	return e


func _do_login(user: String, password: String) -> void:
	err_label.text = "Connexion…"
	var err := await Net.login(user, password)
	if err != "":
		err_label.text = err
		return
	err_label.text = ""
	Net.open_socket()
	_start_game()


func _start_game() -> void:
	if board:
		board.queue_free()
	board = Board.new()
	board.auto_play = args.has("auto")
	board.new_game_requested.connect(func():
		Net.send({"t": "leave"})
		_start_game())
	board.shot_requested.connect(_shot)
	add_child(board)
	login_box.visible = false
	Net.send({"t": "ranked", "auth": Net.token, "lang": "fr"})


func _on_message(d: Dictionary) -> void:
	match str(d.get("t", "")):
		"state":
			if board:
				var v: Dictionary = d.view
				board.set_view(v)
				if str(v.get("phase", "")) == "reveal" and v.get("flash") != null and int(v.get("turn", 0)) >= 3 and not _reveal_shot:
					_reveal_shot = true
					await get_tree().create_timer(0.25).timeout
					_shot("revelation")
				if str(v.get("phase", "")) == "over" and args.has("quit"):
					await get_tree().create_timer(3.5).timeout
					get_tree().quit()
		"error":
			_error(str(d.get("msg", "Erreur du serveur.")))
		"left", "gone":
			_error("La partie est terminée.")


func _error(text: String) -> void:
	if err_label:
		err_label.text = text
	push_warning(text)


func _shot(name: String) -> void:
	if not args.has("shots"):
		return
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("%s/%s.png" % [args.shots, name])


func _process(delta: float) -> void:
	if _frames_dir == "" or board == null or _frame_n >= 900:
		return
	_frame_t += delta
	if _frame_t >= 0.1:
		_frame_t = 0.0
		get_viewport().get_texture().get_image().save_png("%s/%04d.png" % [_frames_dir, _frame_n])
		_frame_n += 1
