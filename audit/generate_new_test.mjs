import fs from 'fs';
import path from 'path';
import ExcelJS from '../MASTER/webapp/frontend/node_modules/exceljs/dist/exceljs.min.js';
import { generateCataloguePptx } from '../MASTER/webapp/frontend/src/services/pptxGenerator.ts';

const SAMPLE_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function run() {
  console.log('Generating test PPTX using updated pptxGenerator...');

  // Create Excel with 9 products
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');
  ws.columns = [
    { header: 'Buyer Code / SKU', key: 'code', width: 20 },
    { header: 'Product Description', key: 'desc', width: 40 },
    { header: 'Product Dimension (CM)', key: 'dim_cm', width: 25 },
    { header: 'Carton Dimension (Inch)', key: 'dim_in', width: 25 },
    { header: 'Price (USD)', key: 'price', width: 15 },
    { header: 'Product Image', key: 'image', width: 25 },
  ];

  for (let i = 1; i <= 9; i++) {
    ws.addRow({
      code: `SKU-PULI-${100 + i}`,
      desc: `Premium Solid Teak Wood Dining Chair Model ${i}`,
      dim_cm: `${55 + i} x ${50 + i} x 90 CM`,
      dim_in: '22 x 20 x 35.4 IN',
      price: `$${150 + i * 15}.00`
    });
    const imgId = wb.addImage({
      base64: SAMPLE_PNG_B64,
      extension: 'png'
    });
    ws.addImage(imgId, {
      tl: { col: 5.1, row: i },
      ext: { width: 100, height: 60 }
    });
  }

  const excelBuf = await wb.xlsx.writeBuffer();
  // Create File-like object for generateCataloguePptx
  const excelFile = {
    name: 'test_products.xlsx',
    arrayBuffer: async () => excelBuf
  };

  const tmplBuf = fs.readFileSync('audit/template.pptx');

  const mapping = {
    code: 'Buyer Code / SKU',
    description: 'Product Description',
    dim_cm: 'Product Dimension (CM)',
    dim_in: 'Carton Dimension (Inch)',
    price: 'Price (USD)',
    length: '',
    width: '',
    height: '',
    image: 'Product Image'
  };

  const output = await generateCataloguePptx(excelFile, tmplBuf, mapping, {
    headerText: 'PULI COLLECTION 2026',
    showHeader: true,
    showRule: true,
    fontSize: 13,
    fontName: 'Calibri'
  });

  const arrayBuf = await output.blob.arrayBuffer();
  const outPath = path.resolve('audit/new_output.pptx');
  fs.writeFileSync(outPath, Buffer.from(arrayBuf));
  console.log(`Saved new output to: ${outPath} (${arrayBuf.byteLength} bytes)`);
}

run().catch(console.error);
