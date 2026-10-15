extends Node
## Liaison avec le serveur du jeu : API JSON (/api) et parties en ligne (WebSocket /ws), mêmes messages que l'appli web.

signal message(d: Dictionary)
signal closed

# Sur téléphone, le jeu en ligne (adresse déduite du nom du service Render, modifiable à l'accueil) ; sur ordinateur, le serveur local.
var server := "https://jeu-de-cartes.onrender.com" if OS.has_feature("mobile") else "http://localhost:8787"
var token := ""

var _ws := WebSocketPeer.new()
var _was_open := false
var _queue: Array = []
var _ping := 0.0


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--server="):
			server = a.trim_prefix("--server=").trim_suffix("/")


## Appel de l'API : renvoie la réponse JSON, ou { error } si le serveur ne répond pas.
func api(method: int, path: String, body = null) -> Dictionary:
	var req := HTTPRequest.new()
	add_child(req)
	var headers := PackedStringArray(["Content-Type: application/json", "X-Lang: fr"])
	if token != "":
		headers.append("Authorization: Bearer " + token)
	var err := req.request(server + path, headers, method, JSON.stringify(body) if body != null else "")
	if err != OK:
		req.queue_free()
		return {"error": "Serveur injoignable."}
	var res: Array = await req.request_completed
	req.queue_free()
	if res[0] != HTTPRequest.RESULT_SUCCESS:
		return {"error": "Serveur injoignable."}
	var d = JSON.parse_string((res[3] as PackedByteArray).get_string_from_utf8())
	if not d is Dictionary:
		return {"error": "Réponse illisible du serveur (%d)." % res[1]}
	return d


## Ouvre une session ; renvoie le message d'erreur, ou "" si tout va bien.
func login(user: String, password: String) -> String:
	var d := await api(HTTPClient.METHOD_POST, "/api/login", {"login": user, "password": password})
	if d.has("error"):
		return str(d.error)
	token = str(d.token)
	return ""


func open_socket() -> void:
	_queue.clear()
	_ws = WebSocketPeer.new()
	_ws.inbound_buffer_size = 1 << 20
	_ws.connect_to_url(server.replace("http", "ws") + "/ws")
	_was_open = false


func is_open() -> bool:
	return _ws.get_ready_state() == WebSocketPeer.STATE_OPEN


func send(d: Dictionary) -> void:
	if _ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		_ws.send_text(JSON.stringify(d))
	else:
		_queue.append(d)


func _process(delta: float) -> void:
	_ws.poll()
	var state := _ws.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		if not _was_open:
			_was_open = true
			for d in _queue:
				_ws.send_text(JSON.stringify(d))
			_queue.clear()
		while _ws.get_available_packet_count() > 0:
			var d = JSON.parse_string(_ws.get_packet().get_string_from_utf8())
			if d is Dictionary:
				message.emit(d)
		# Le serveur ferme une connexion muette depuis 30 s : un ping toutes les 10 s, comme l'appli web.
		_ping += delta
		if _ping > 10.0:
			_ping = 0.0
			send({"t": "ping"})
	elif state == WebSocketPeer.STATE_CLOSED and _was_open:
		_was_open = false
		closed.emit()
