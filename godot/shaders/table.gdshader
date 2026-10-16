// Table du plateau, comme le fond PixiJS de l'appli (client/src/stage.js) : planches de bois, lampe chaude au-dessus du jeu,
// deux nappes de brume qui dérivent, vignette, et une flaque de lumière sous chaque zone aux couleurs du camp qui la mène.
shader_type canvas_item;

uniform vec2 size = vec2(720.0, 1280.0);
uniform vec4 sol : source_color = vec4(0.078, 0.055, 0.039, 1.0);       // #140e0a
uniform vec4 planche_a : source_color = vec4(0.110, 0.078, 0.055, 1.0); // #1c140e
uniform vec4 planche_b : source_color = vec4(0.098, 0.067, 0.047, 1.0); // #19110c
uniform vec4 lampe : source_color = vec4(1.0, 0.75, 0.44, 1.0);         // #ffc070
uniform vec2 lamp_pos = vec2(360.0, 540.0);   // la lampe suit un peu le doigt (Mat.light)
// Flaques de lumière des zones : centre (pixels) et rayon dans xy/zw, couleur et intensité dans pool_col.
uniform vec4 pool_rect[3];
uniform vec4 pool_col[3];

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
	float v = 0.0, a = 0.5;
	for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
	return v;
}

void fragment() {
	vec2 px = UV * size;
	// Planches verticales de 80 px, deux teintes, joints sombres, veinure étirée.
	float w = 80.0;
	float idx = floor(px.x / w);
	vec3 c = mod(idx, 2.0) < 1.0 ? planche_a.rgb : planche_b.rgb;
	float grain = fbm(vec2(px.x / 9.0 + idx * 13.0, px.y / 140.0));
	c *= 0.86 + 0.28 * grain;
	float edge = min(mod(px.x, w), w - mod(px.x, w));
	c = mix(sol.rgb * 0.6, c, smoothstep(0.0, 2.0, edge));
	// Lampe chaude centrée vers 42 % de la hauteur, qui respire à peine.
	vec2 lc = mix(vec2(size.x * 0.5, size.y * 0.42), lamp_pos, 0.45);
	vec2 lp = (px - lc) / vec2(size.x * 0.8, size.y * 0.55);
	c += lampe.rgb * 0.22 * smoothstep(1.0, 0.0, length(lp)) * (0.94 + 0.06 * sin(TIME * 0.7));
	// Brume : deux nappes lentes.
	float f1 = fbm(vec2(px.x / 260.0 + TIME * 0.035 + sin(TIME * 0.07) * 0.35, px.y / 300.0));
	float f2 = fbm(vec2(px.x / 340.0 - TIME * 0.025, px.y / 260.0 + 7.0 + sin(TIME * 0.05) * 0.3));
	c += vec3(0.75, 0.68, 0.6) * 0.09 * (smoothstep(0.45, 0.8, f1) + smoothstep(0.5, 0.85, f2));
	// Flaques de lumière des zones.
	for (int i = 0; i < 3; i++) {
		vec2 d = (px - pool_rect[i].xy) / max(pool_rect[i].zw, vec2(1.0));
		c += pool_col[i].rgb * pool_col[i].a * smoothstep(1.0, 0.0, length(d));
	}
	// Vignette.
	float v = smoothstep(1.15, 0.35, distance(UV, vec2(0.5, 0.45)) * 1.25);
	c *= 0.45 + 0.55 * v;
	c += (hash(floor(FRAGCOORD.xy / 2.0)) - 0.5) * 0.025;
	COLOR = vec4(c, 1.0);
}
