import { strToU8, zipSync } from 'fflate';

import type { Cell, Sheet } from '@/core/exportData';

/**
 * Escritor mínimo de archivos .xlsx (solo escribe; la app nunca abre hojas de
 * cálculo ajenas). Todo texto se guarda como texto literal: aunque un comercio
 * se llamara "=FORMULA()", Excel lo muestra tal cual y no lo ejecuta.
 */

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
// Identificador del formato de Excel. Es un nombre fijo dentro del archivo, no una dirección que se visite.
const NS = 'http://schemas.openxmlformats.org';

const xml = (value: string): string =>
  value
    // Caracteres de control que XML no admite.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function column(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function cell(value: Cell, ref: string, header: boolean): string {
  const style = header ? ' s="1"' : '';
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
  const text = String(value ?? '');
  if (!text) return '';
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
}

function worksheet(sheet: Sheet): string {
  const cols = sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const rows = sheet.rows
    .map((row, r) => `<row r="${r + 1}">${row.map((value, c) => cell(value, `${column(c)}${r + 1}`, r === 0)).join('')}</row>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<worksheet xmlns="${NS}/spreadsheetml/2006/main">` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows}</sheetData></worksheet>`
  );
}

/** Nombre de hoja válido para Excel: máximo 31 caracteres y sin []:*?/\ */
const sheetName = (name: string, index: number): string =>
  name.replace(/[\][:*?/\\]/g, ' ').trim().slice(0, 31) || `Hoja ${index + 1}`;


export function writeXlsx(sheets: Sheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, content: string) => {
    files[path] = strToU8(content);
  };

  put(
    '[Content_Types].xml',
    `${HEAD}<Types xmlns="${NS}/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('') +
      '</Types>',
  );
  put(
    '_rels/.rels',
    `${HEAD}<Relationships xmlns="${NS}/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  put(
    'xl/workbook.xml',
    `${HEAD}<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets>` +
      sheets.map((s, i) => `<sheet name="${xml(sheetName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>',
  );
  put(
    'xl/_rels/workbook.xml.rels',
    `${HEAD}<Relationships xmlns="${NS}/package/2006/relationships">` +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  put(
    'xl/styles.xml',
    `${HEAD}<styleSheet xmlns="${NS}/spreadsheetml/2006/main">` +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>',
  );
  sheets.forEach((sheet, i) => put(`xl/worksheets/sheet${i + 1}.xml`, worksheet(sheet)));

  return zipSync(files, { level: 6 });
}
