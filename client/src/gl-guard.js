// Toile WebGL dont le navigateur retire le contexte : il le fait pour les plus anciennes quand l'appli en a trop d'ouvertes
// (la limite est plus basse sur téléphone), ou parfois quand l'appli passe en arrière-plan. Chrome dessine alors la toile en
// blanc avec une icône d'image cassée dans son coin, par-dessus la page (le fond des menus devenait blanc dans la boutique).
// La toile est cachée tant que son contexte est perdu, et revient quand le navigateur le rend (PixiJS accepte la restauration).
// lost : appelé avec true à la perte, false au retour.
export function guardGL(canvas, lost) {
  canvas.addEventListener('webglcontextlost', () => { canvas.style.visibility = 'hidden'; lost?.(true); });
  canvas.addEventListener('webglcontextrestored', () => { canvas.style.visibility = ''; lost?.(false); });
}
