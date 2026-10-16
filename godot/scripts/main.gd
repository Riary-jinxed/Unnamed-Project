extends Control
## Écran de connexion, puis plateau. Pour le prototype, une seule partie : classée contre l'IA, jouée par le serveur.
## Options après « -- » sur la ligne de commande :
##   --server=URL  --login=…  --password=…  connexion automatique
##   --auto        joue seul (pose ses cartes au mieux) : essais et captures
##   --shots=DOSSIER  enregistre des captures (plan, révélation, fin) ; --frames=DOSSIER : une image toutes les 0,1 s
##   --quit        quitte après la fin de la partie
##   --theme=ID    force un thème de l'interface (essais) ; --home : capture de l'accueil (avec --shots) puis quitte

const Board := preload("res://scripts/board.gd")
const Home := preload("res://scripts/home.gd")

var args := {}
var board: Control
var login_box: Control
var err_label: Label
var _frames_dir := ""
var _frame_t := 0.0
var _frame_n := 0
var _reveal_shot := false
var room := ""
var seat_token := ""
var _reconnecting := false
var account := {}
var home: Control
var _bg_mat: ShaderMaterial


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		args[kv[0]] = kv[1] if kv.size() > 1 else true
	_frames_dir = str(args.get("frames", ""))
	if _frames_dir != "":
		DirAccess.make_dir_recursive_absolute(_frames_dir)
	if args.has("shots"):
		DirAccess.make_dir_recursive_absolute(str(args.shots))
	if args.has("quit"):
		# Essais sans écran : on s'arrête quoi qu'il arrive (serveur absent, partie bloquée).
		get_tree().create_timer(240.0).timeout.connect(get_tree().quit)
	Net.message.connect(_on_message)
	Net.closed.connect(_reconnect)
	Net.server = str(Sfx.cfg.get_value("compte", "serveur", Net.server)) if not args.has("server") else Net.server
	Net.token = str(Sfx.cfg.get_value("compte", "jeton", ""))
	_build_login()
	if args.has("login") and args.has("password"):
		_do_login(str(args.login), str(args.password))
	elif Net.token != "":
		# Session gardée : vérifiée auprès du serveur, sinon retour à la connexion.
		var me := await Net.api(HTTPClient.METHOD_GET, "/api/me")
		if me.has("error") or not me.has("account"):
			Net.token = ""
		else:
			_set_account(me.account)
		_show_home()


func _build_login() -> void:
	var bg := ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_bg_mat = ShaderMaterial.new()
	_bg_mat.shader = preload("res://shaders/fond.gdshader")
	bg.material = _bg_mat
	add_child(bg)
	themed()
	login_box = VBoxContainer.new()
	login_box.set_anchors_preset(Control.PRESET_CENTER)
	login_box.custom_minimum_size = Vector2(560, 0)
	login_box.position = Vector2(-280, -330)
	login_box.add_theme_constant_override("separation", 16)
	add_child(login_box)
	err_label = Label.new()
	err_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	err_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	err_label.add_theme_color_override("font_color", Color("ff9c8f"))
	_show_home()


## Accueil : connexion, ou « Jouer » si une session est gardée sur l'appareil.
func _show_home() -> void:
	Sfx.music("menu")
	login_box.visible = true
	for c in login_box.get_children():
		if c != err_label:
			c.queue_free()
	if err_label.get_parent():
		login_box.remove_child(err_label)
	var title := Label.new()
	title.text = "Jeu de cartes"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_override("font", Data.font_title)
	title.add_theme_font_size_override("font_size", 56)
	title.add_theme_color_override("font_color", Color("ffe7a6"))
	title.add_theme_constant_override("outline_size", 12)
	title.add_theme_color_override("font_outline_color", Color(0.12, 0.05, 0.02))
	login_box.add_child(title)
	if home:
		home.queue_free()
		home = null
	if Net.token != "" and not account.is_empty():
		# Connecté : l'accueil complet (home.gd) remplace le formulaire.
		login_box.visible = false
		home = Home.new(account)
		home.play_requested.connect(_play)
		home.logout_requested.connect(func():
			Net.token = ""
			account = {}
			Sfx.cfg.set_value("compte", "jeton", "")
			Sfx.save()
			Look.apply("")
			themed()
			_show_home())
		add_child(home)
		if args.has("home"):
			await get_tree().create_timer(1.0).timeout
			_shot("accueil-" + (Look.id if Look.id != "" else "base"))
			get_tree().quit()
		return
	var server := _field("Adresse du serveur", false)
	server.text = Net.server
	var user := _field("Identifiant", false)
	user.text = str(Sfx.cfg.get_value("compte", "login", ""))
	var pwd := _field("Mot de passe", true)
	var go := Board.gold_button("Se connecter")
	go.custom_minimum_size = Vector2(0, 72)
	go.pressed.connect(func():
		Net.server = server.text.strip_edges().trim_suffix("/")
		_do_login(user.text.strip_edges(), pwd.text))
	pwd.text_submitted.connect(func(_t): go.pressed.emit())
	login_box.add_child(go)
	login_box.add_child(err_label)


func _set_account(acc: Dictionary) -> void:
	account = acc
	Look.from_account(acc)
	if args.has("theme"):
		Look.apply(str(args.theme) if str(args.theme) != "base" else "")
	themed()


## Fond des menus aux couleurs du thème (appelé aussi par home.gd quand on en change).
func themed() -> void:
	if _bg_mat == null:
		return
	_bg_mat.set_shader_parameter("haut", Look.leather(Color(0.13, 0.085, 0.06)))
	_bg_mat.set_shader_parameter("bas", Look.bg.darkened(0.3) if Look.id != "" else Color(0.035, 0.03, 0.05))
	_bg_mat.set_shader_parameter("lueur", Look.accent if Look.id != "" else Color(0.55, 0.36, 0.14))


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
	var me := await Net.api(HTTPClient.METHOD_GET, "/api/me")
	Sfx.cfg.set_value("compte", "serveur", Net.server)
	Sfx.cfg.set_value("compte", "login", user)
	Sfx.cfg.set_value("compte", "jeton", Net.token)
	Sfx.cfg.set_value("compte", "nom", str(me.get("account", {}).get("name", user)))
	Sfx.save()
	if me.has("account"):
		_set_account(me.account)
	if args.has("auto"):
		_play()
	else:
		_show_home()


func _play() -> void:
	err_label.text = ""
	Net.open_socket()
	_start_game()


func _start_game() -> void:
	if board:
		board.queue_free()
	room = ""
	board = Board.new()
	board.auto_play = args.has("auto")
	board.drag_test = args.has("drag-test")
	board.new_game_requested.connect(func():
		Net.send({"t": "leave"})
		_start_game())
	board.quit_requested.connect(func():
		Net.send({"t": "leave"})
		_leave_board())
	board.shot_requested.connect(_shot)
	add_child(board)
	login_box.visible = false
	if home:
		home.queue_free()
		home = null
	Sfx.music("partie")
	Net.send({"t": "ranked", "auth": Net.token, "lang": "fr"})


func _leave_board() -> void:
	if board:
		board.queue_free()
		board = null
	room = ""
	# Niveau, rang et thème ont pu changer pendant la partie.
	var me := await Net.api(HTTPClient.METHOD_GET, "/api/me")
	if me.has("account"):
		_set_account(me.account)
	_show_home()


## Connexion perdue en pleine partie : le serveur garde la place 60 secondes, on revient avec le jeton du salon (rejoin).
func _reconnect() -> void:
	if board == null or room == "" or _reconnecting:
		_error("Connexion au serveur perdue.")
		return
	_reconnecting = true
	board.toast("Connexion perdue, reconnexion…")
	for i in 8:
		await get_tree().create_timer(1.0 + i).timeout
		if board == null:
			break
		Net.open_socket()
		Net.send({"t": "rejoin", "room": room, "token": seat_token, "lang": "fr"})
		await get_tree().create_timer(2.0).timeout
		if Net.is_open():
			_reconnecting = false
			return
	_reconnecting = false
	_leave_board()
	_error("Impossible de rejoindre la partie.")


func _on_message(d: Dictionary) -> void:
	match str(d.get("t", "")):
		"lobby":
			room = str(d.get("room", ""))
			seat_token = str(d.get("token", ""))
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
			if board:
				board.toast(str(d.get("msg", "Erreur du serveur.")))
			else:
				_error(str(d.get("msg", "Erreur du serveur.")))
		"gone":
			_leave_board()
			_error("La partie est terminée.")
		"left":
			if board:
				board.toast("L'adversaire a quitté la partie.")


func _error(text: String) -> void:
	if err_label:
		err_label.text = text
	if home:
		home.set("_msg", text)
		home.queue_redraw()
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
