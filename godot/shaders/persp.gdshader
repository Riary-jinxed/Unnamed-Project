// Perspective du plateau (voir scripts/persp.gd) : chaque sommet est rapproché du centre et remonté selon sa hauteur.
// amount passe de 0 (carte en main, carte qu'on glisse) à 1 (posée sur le plateau).
shader_type canvas_item;

global uniform float persp_y0;
global uniform float persp_hs;
global uniform float persp_k;
global uniform float persp_cx;
uniform float amount = 1.0;

void vertex() {
	vec2 w = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
	float k = persp_k;
	float s = k * exp((w.y - persp_y0) * (1.0 - k) / persp_hs);
	vec2 q = vec2(persp_cx + (w.x - persp_cx) * s, persp_y0 + (s - k) / (1.0 - k) * persp_hs);
	VERTEX = (inverse(MODEL_MATRIX) * vec4(mix(w, q, amount), 0.0, 1.0)).xy;
}
