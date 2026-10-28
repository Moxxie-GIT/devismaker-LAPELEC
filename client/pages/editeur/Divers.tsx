import type { Devis } from '../../../shared/types';
import { uid } from '../../../shared/lots/cfo/pieces';
import { useApp } from '../../lib/app';
import { ChampNombre, Compteur } from '../../lib/ui';
import type { Modifier } from '../Editeur';

export function PanneauDivers({ devis, modifier }: { devis: Devis; modifier: Modifier }) {
  const { params } = useApp();
  const divers = devis.data.divers;
  const maj = (id: string, fn: (l: (typeof divers)[number]) => void) =>
    modifier((d) => { const l = d.data.divers.find((x) => x.id === id); if (l) fn(l); });
  const ajouter = (designation: string) => modifier((d) => {
    d.data.divers.push({ id: uid(), designation, quantite: 1, pu: null, coefMat: 1, heures: null });
  });
  return (
    <>
      <div className="titre-piece"><h1>Divers</h1></div>
      <p className="discret" style={{ marginBottom: 6 }}>
        Renseigne le prix d’achat et les heures de chaque ligne pour ce chantier (0 si aucun). Main d’œuvre : {params.tauxMo} €/h, coef {params.coefMo}.
      </p>
      <section className="section">
        {divers.length > 0 && (
          <table className="grille">
            <thead><tr><th>Désignation</th><th>Qté</th><th>Prix achat (€)</th><th>Coef mat.</th><th>Heures</th><th /></tr></thead>
            <tbody>
              {divers.map((l) => (
                <tr key={l.id} className={l.quantite > 0 ? '' : 'nul'}>
                  <td className="l"><input aria-label="Désignation" value={l.designation} onChange={(e) => maj(l.id, (x) => { x.designation = e.target.value; })} /></td>
                  <td><Compteur label="Quantité" valeur={l.quantite} onChange={(n) => maj(l.id, (x) => { x.quantite = n; })} /></td>
                  <td><ChampNombre label="Prix d’achat" valeur={l.pu} requis={l.quantite > 0} onChange={(n) => maj(l.id, (x) => { x.pu = n; })} /></td>
                  <td><ChampNombre label="Coefficient matériel" largeur={70} valeur={l.coefMat} onChange={(n) => maj(l.id, (x) => { x.coefMat = n; })} placeholder="1" /></td>
                  <td><ChampNombre label="Heures" largeur={70} valeur={l.heures} requis={l.quantite > 0} onChange={(n) => maj(l.id, (x) => { x.heures = n; })} /></td>
                  <td><button className="btn fantome icone" aria-label="Retirer la ligne" onClick={() => modifier((d) => { d.data.divers = d.data.divers.filter((x) => x.id !== l.id); })}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="pied-section">
          <button className="btn petit" onClick={() => ajouter('')}>Ajouter une ligne</button>
          <select aria-label="Ajouter une ligne habituelle" value="" onChange={(e) => { if (e.target.value) ajouter(e.target.value); }}>
            <option value="">Ajouter une ligne habituelle…</option>
            {params.diversModeles.map((m) => <option key={m} value={m}>{m.slice(0, 90)}</option>)}
          </select>
        </div>
      </section>
    </>
  );
}
