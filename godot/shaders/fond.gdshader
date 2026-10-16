// Fond du plateau : dégradé cuir sombre, vignette et grain léger.
shader_type canvas_item;

uniform vec4 haut : source_color = vec4(0.13, 0.085, 0.06, 1.0);
uniform vec4 bas : source_color = vec4(0.035, 0.03, 0.05, 1.0);
uniform vec4 lueur : source_color = vec4(0.55, 0.36, 0.14, 1.0);

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void fragment() {
	vec2 uv = UV;
	vec3 c = mix(haut.rgb, bas.rgb, smoothstep(0.0, 1.0, uv.y));
	// Halo chaud au centre du plateau, qui respire lentement.
	float d = distance(uv * vec2(1.0, 1.6), vec2(0.5, 0.75));
	c += lueur.rgb * 0.16 * smoothstep(0.75, 0.0, d) * (0.85 + 0.15 * sin(TIME * 0.6));
	// Vignette.
	float v = smoothstep(1.05, 0.35, distance(uv, vec2(0.5)));
	c *= 0.5 + 0.5 * v;
	c += (hash(floor(FRAGCOORD.xy / 2.0)) - 0.5) * 0.03;
	COLOR = vec4(c, 1.0);
}
