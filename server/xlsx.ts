// Écriture d'un fichier .xlsx minimal, calqué sur la structure produite par openpyxl
// (format validé à l'import dans Esabora).
import JSZip from 'jszip';

export type Valeur = string | number | null | undefined;
export interface Cellule { v: Valeur; s?: number }
export interface Feuille { nom: string; largeurs: number[]; lignes: Cellule[][]; figerEntete?: boolean }

// Index des styles (cellXfs) définis dans STYLES
export const S = {
  DEFAUT: 0, ENTETE_TEXTE: 1, ENTETE: 2, TEXTE: 3, NORMAL: 4, TITRE: 5, ITALIQUE: 6, SOUS_TITRE: 7, TH: 8, SURLIGNE: 9,
} as const;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="6"><font><name val="Arial"/><sz val="10"/></font><font><name val="Arial"/><sz val="10"/></font><font><name val="Arial"/><b val="1"/><sz val="10"/></font><font><name val="Arial"/><b val="1"/><sz val="12"/></font><font><name val="Arial"/><i val="1"/><sz val="10"/></font><font><name val="Arial"/><b val="1"/><sz val="11"/></font></fonts><fills count="4"><fill><patternFill/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="00D9D9D9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="00DDEBF7"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="2" fillId="2" borderId="0" applyAlignment="1" xfId="0"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0" applyAlignment="1" xfId="0"><alignment horizontal="center"/></xf><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT_WS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';

function esc(s: string): string {
  return s
    // caractères de contrôle interdits en XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colonne(i: number): string {
  let s = ''; i += 1;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

function feuilleXml(f: Feuille): string {
  const nbCol = Math.max(1, f.largeurs.length, ...f.lignes.map((l) => l.length));
  const dim = `A1:${colonne(nbCol - 1)}${Math.max(1, f.lignes.length)}`;
  const pane = f.figerEntete
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A1" sqref="A1"/>'
    : '<selection activeCell="A1" sqref="A1"/>';
  const cols = f.largeurs.map((w, i) => `<col width="${w}" customWidth="1" min="${i + 1}" max="${i + 1}"/>`).join('');
  const rows = f.lignes.map((ligne, r) => {
    const cells = ligne.map((c, i) => {
      const ref = `${colonne(i)}${r + 1}`;
      const s = c.s ?? S.NORMAL;
      if (c.v === null || c.v === undefined || c.v === '') return `<c r="${ref}" s="${s}" t="n"></c>`;
      if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${ref}" s="${s}" t="n"><v>${c.v}</v></c>`;
      const t = esc(String(c.v));
      const space = /^\s|\s$|\n/.test(t) ? ' xml:space="preserve"' : '';
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t${space}>${t}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><outlinePr summaryBelow="1" summaryRight="1"/><pageSetUpPr/></sheetPr><dimension ref="${dim}"/><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr baseColWidth="8" defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData><pageMargins left="0.75" right="0.75" top="1" bottom="1" header="0.5" footer="0.5"/></worksheet>`;
}

export async function ecrireXlsx(feuilles: Feuille[]): Promise<Buffer> {
  const zip = new JSZip();
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT_WS}"/>`).join('')}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml" Id="rId1"/><Relationship Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml" Id="rId2"/><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml" Id="rId3"/></Relationships>`);
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>LAPELEC Devis</Application></Properties>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>LAPELEC Devis</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_R}"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>${feuilles.map((f, i) => `<sheet name="${esc(f.nom.slice(0, 31))}" sheetId="${i + 1}" state="visible" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="124519" fullCalcOnLoad="1"/></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles.map((_, i) => `<Relationship Type="${NS_R}/worksheet" Target="/xl/worksheets/sheet${i + 1}.xml" Id="rId${i + 1}"/>`).join('')}<Relationship Type="${NS_R}/styles" Target="styles.xml" Id="rId${feuilles.length + 1}"/></Relationships>`);
  zip.file('xl/styles.xml', STYLES);
  feuilles.forEach((f, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, feuilleXml(f)));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
