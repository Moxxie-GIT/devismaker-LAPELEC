// Validation des données reçues de l'interface.
import { z } from 'zod';
import { HttpError } from './http';

const texte = (max: number) => z.string().max(max);
const qte = z.number().finite().min(0).max(100000);
const nbOuNull = z.number().finite().min(0).max(10000000).nullable();

export const SchemaDevisData = z.object({
  mode: z.enum(['KNX', 'CLASSIQUE']),
  pieces: z.array(z.object({
    id: texte(40),
    nom: texte(120),
    type: texte(40),
    tableau: z.object({
      choix: z.enum(['TD', 'TGBT', 'AUCUN']).nullable(),
      phase: z.enum(['mono', 'tetra']),
      section: z.union([z.literal(6), z.literal(10)]),
      modele: z.enum(['standard', 'plomberie']),
      alimentePar: texte(40),
    }),
    circuits: z.array(z.object({
      id: texte(40), type: texte(40), nom: texte(200), lieu: z.enum(['int', 'ext']), nb: qte,
      commande: z.enum(['onoff', 'v110', 'v230', 'dali']), pose: z.enum(['std', 'led_facile', 'led_difficile', 'aucune']),
    })).max(300),
    inters: z.array(z.number().int().min(1).max(32)).max(300),
    detecteurs: qte,
    classique: z.object({ sa: qte, vv: qte, bps: qte }),
    elements: z.array(z.object({ id: texte(40), cle: texte(40), designation: texte(400), quantite: qte })).max(500),
  })).max(400),
  domotique: z.object({ actif: z.boolean(), heuresEts: nbOuNull, coupure: qte }),
  divers: z.array(z.object({
    id: texte(40), designation: texte(400), quantite: qte, pu: nbOuNull, coefMat: nbOuNull, heures: nbOuNull,
  })).max(200),
  notes: texte(5000),
});

export const SchemaEntete = z.object({
  titre: texte(200).transform((s) => s.trim()).refine((s) => s.length > 0, 'Le titre est obligatoire.'),
  client: texte(120).default(''),
  reference: texte(60).default(''),
});

const prix = z.object({
  designation: texte(400), pu: z.number().finite().min(0), coefMat: z.number().finite().min(0),
  coefMo: z.number().finite().min(0), heures: z.number().finite().min(0),
});

export const SchemaParametres = z.object({
  tauxMo: z.number().finite().min(0).max(10000),
  coefMo: z.number().finite().min(0).max(100),
  domotique: z.record(z.string(), prix),
  diversModeles: z.array(texte(400)).max(50),
});

export function valider<S extends z.ZodTypeAny>(schema: S, v: unknown): z.output<S> {
  const r = schema.safeParse(v);
  if (!r.success) {
    const msg = r.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'données'} : ${i.message}`).join(' ; ');
    throw new HttpError(400, `Données invalides : ${msg}`);
  }
  return r.data;
}
