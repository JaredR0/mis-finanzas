import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { writeXlsx } from '../xlsxWriter';

describe('archivo de Excel', () => {
  const file = writeXlsx([
    { name: 'Resumen 2026', widths: [14, 12], rows: [['Mes', 'Gastos'], ['Octubre', 710.5], ['Vacío', '']] },
    { name: 'Raros: [x]/y*?', widths: [30], rows: [['Texto'], ['=HYPERLINK("http://malo","clic")'], ['<b>&"ñ"</b>'], ['+SUM(A1)'], ['a\u0001b']] },
  ]);
  const parts = unzipSync(file);
  const text = (path: string) => strFromU8(parts[path]);

  it('tiene la estructura que Excel espera', () => {
    expect(Object.keys(parts).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
      'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
    ]);
    expect(text('xl/workbook.xml')).toContain('name="Resumen 2026"');
    expect(text('xl/workbook.xml')).toContain('name="Raros   x  y"');
  });

  it('guarda números como números y deja vacías las celdas vacías', () => {
    const sheet = text('xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<c r="B2"><v>710.5</v></c>');
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(sheet).not.toContain('r="B3"');
  });

  it('nunca escribe fórmulas: el texto peligroso queda como texto', () => {
    const sheet = text('xl/worksheets/sheet2.xml');
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('<t xml:space="preserve">=HYPERLINK(&quot;http://malo&quot;,&quot;clic&quot;)</t>');
    expect(sheet).toContain('&lt;b&gt;&amp;&quot;ñ&quot;&lt;/b&gt;');
    expect(sheet).toContain('<t xml:space="preserve">ab</t>');
  });
});
