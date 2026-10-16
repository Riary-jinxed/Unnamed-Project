// Lignes de balayage d'écran du thème Néon 2099 (body::after de client/src/cyber.css) : une ligne sombre toutes les 3 px.
shader_type canvas_item;

void fragment() {
	float l = step(2.0, mod(FRAGCOORD.y, 3.0));
	COLOR = vec4(0.0, 0.0, 0.0, 0.14 * l);
}
