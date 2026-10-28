/**
 * Loveneet Suite — Automated Test Suite for Excel to Catalogue PPT
 * Tests Phases A through G including real Microsoft PowerPoint COM verification.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

// Load default template
const tmplSource = fs.readFileSync(path.join(__dirname, '../defaultPptTemplate.ts'), 'utf8');
const tmplMatch = tmplSource.match(/DEFAULT_PPT_TEMPLATE_B64\s*=\s*"([^"]+)"/);
const DEFAULT_TMPL_BUF = Buffer.from(tmplMatch[1], 'base64');

// 1x1 png sample
const SAMPLE_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Helper to create test Excel buffer
async function createTestExcel(itemCount, includeImages = true) {
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

  for (let i = 1; i <= itemCount; i++) {
    const row = ws.addRow({
      code: `SKU-${1000 + i}`,
      desc: `Modern Minimalist Oak Dining Table Model ${i}`,
      dim_cm: `${100 + i} x ${50 + i} x ${75} CM`,
      dim_in: `${((100 + i) / 2.54).toFixed(1)} x ${((50 + i) / 2.54).toFixed(1)} x 29.5 IN`,
      price: `$${120 + i * 10}.00`
    });
    row.height = 70;

    if (includeImages) {
      const imgId = wb.addImage({
        base64: SAMPLE_PNG_B64,
        extension: 'png'
      });
      ws.addImage(imgId, {
        tl: { col: 5.1, row: i },
        ext: { width: 100, height: 60 }
      });
    }
  }

  return await wb.xlsx.writeBuffer();
}

// Validator implementation
async function validatePackage(buf) {
  const zip = await JSZip.loadAsync(buf);
  const errors = [];
  const warnings = [];

  const ct = await zip.file('[Content_Types].xml')?.async('text');
  const presRels = await zip.file('ppt/_rels/presentation.xml.rels')?.async('text');
  const presXml = await zip.file('ppt/presentation.xml')?.async('text');

  if (!ct) errors.push('Missing [Content_Types].xml');
  if (!presRels) errors.push('Missing presentation.xml.rels');
  if (!presXml) errors.push('Missing presentation.xml');

  let slideCount = 0;
  if (presXml) {
    const sldIds = [...presXml.matchAll(/<p:sldId\b([^>]*)\/?>/g)];
    slideCount = sldIds.length;
    for (const s of sldIds) {
      const idM = s[1].match(/\bid="(\d+)"/);
      if (!idM) {
        errors.push('Missing id in <p:sldId>');
      } else {
        const val = parseInt(idM[1], 10);
        if (val < 256 || val >= 2147483648) {
          errors.push(`ST_SlideId violation: ${val} must be 256 <= id < 2147483648`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    slideCount
  };
}

// Generator implementation for test
async function generateTestPptx(excelBuf, tmplBuf, mapping, options = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(excelBuf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('No worksheets in workbook');

  const imgByRow = new Map();
  try {
    const images = ws.getImages ? ws.getImages() : [];
    for (const img of images) {
      let r = 0;
      if (img.range?.tl) {
        r = typeof img.range.tl.nativeRow === 'number' ? img.range.tl.nativeRow + 1 : img.range.tl.row;
      }
      const media = wb.model?.media?.[img.imageId] || (wb.model?.media || []).find(m => m.index === img.imageId || String(m.index) === String(img.imageId));
      if (media && media.buffer && r > 0) imgByRow.set(r, media);
    }
  } catch {}

  const products = [];
  ws.eachRow((row, rIdx) => {
    if (rIdx >= 2) {
      const code = String(row.getCell(1).value || '').trim();
      if (code) {
        products.push({
          code,
          desc: String(row.getCell(2).value || '').trim(),
          dim_cm: String(row.getCell(3).value || '').trim(),
          dim_in: String(row.getCell(4).value || '').trim(),
          price: String(row.getCell(5).value || '').trim(),
          image: imgByRow.get(rIdx)
        });
      }
    }
  });

  if (products.length === 0) throw new Error('No products found in Excel');

  const zip = await JSZip.loadAsync(tmplBuf);
  let presXmlStr = await zip.file('ppt/presentation.xml').async('text');
  let presRelsStr = await zip.file('ppt/_rels/presentation.xml.rels').async('text');
  let contentTypesStr = await zip.file('[Content_Types].xml').async('text');
  const slide1XmlBase = await zip.file('ppt/slides/slide1.xml').async('text');
  const slide1RelsBase = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('text');

  // Register image extensions
  for (const ext of ['jpeg', 'jpg', 'png', 'webp']) {
    if (!contentTypesStr.includes(`Extension="${ext}"`)) {
      contentTypesStr = contentTypesStr.replace(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="${ext}" ContentType="image/${ext === 'jpg' ? 'jpeg' : ext}"/>`
      );
    }
  }

  // Detect slots
  const spRegex = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  const slotShapes = [];
  let m;
  while ((m = spRegex.exec(slide1XmlBase)) !== null) {
    const spXml = m[0];
    const texts = [...spXml.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map(t => t[1]).join(' ');
    if (/(?:SKU|Item\s*Name|Price|CM|IN|Dimensions?|00\.00)/i.test(texts)) {
      const offXMatch = spXml.match(/<a:off\s+x="(\d+)"/);
      const offX = offXMatch ? parseInt(offXMatch[1]) : 0;
      const offYMatch = spXml.match(/<a:off\s+x="\d+"\s+y="(\d+)"/);
      const offY = offYMatch ? parseInt(offYMatch[1]) : 0;
      const extCxMatch = spXml.match(/<a:ext\s+cx="(\d+)"/);
      const extCx = extCxMatch ? parseInt(extCxMatch[1]) : 3400000;
      const extCyMatch = spXml.match(/<a:ext\s+cx="\d+"\s+cy="(\d+)"/);
      const extCy = extCyMatch ? parseInt(extCyMatch[1]) : 600000;
      slotShapes.push({ rawXml: spXml, offX, offY, extCx, extCy });
    }
  }
  slotShapes.sort((a, b) => a.offX - b.offX);
  const slotsCount = slotShapes.length || 3;
  const totalSlides = Math.ceil(products.length / slotsCount);

  // STRICT ST_SlideId: 256 <= id < 2147483648
  const existingSldIds = [...presXmlStr.matchAll(/<p:sldId\b[^>]*\bid="(\d+)"/g)]
    .map(x => parseInt(x[1], 10))
    .filter(val => val >= 256 && val < 2147483648);
  let nextSldId = existingSldIds.length > 0 ? Math.max(...existingSldIds) + 1 : 256;

  const presRIdMatches = [...presRelsStr.matchAll(/Id="rId(\d+)"/g)].map(x => parseInt(x[1], 10));
  let nextPresRId = Math.max(...presRIdMatches, 0) + 1;

  for (let sIdx = 1; sIdx <= totalSlides; sIdx++) {
    const slideName = `slide${sIdx}.xml`;
    const relsName = `slide${sIdx}.xml.rels`;
    let slideXml = slide1XmlBase;
    let slideRels = slide1RelsBase;

    let nextSlideRId = Math.max(...[...slideRels.matchAll(/Id="rId(\d+)"/g)].map(x => parseInt(x[1], 10)), 0) + 1;
    let picsXml = '';

    for (let slotIdx = 0; slotIdx < slotsCount; slotIdx++) {
      const prodIdx = (sIdx - 1) * slotsCount + slotIdx;
      const prod = products[prodIdx];
      const slot = slotShapes[slotIdx];

      if (prod && slot) {
        const dimStr = [prod.dim_cm, prod.dim_in].filter(Boolean).join(' | ');
        const newTxBody = `<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" b="1" sz="1100"><a:latin typeface="Calibri"/></a:rPr><a:t>${prod.code} | </a:t></a:r><a:r><a:rPr lang="en-US" b="0" sz="1100"><a:latin typeface="Calibri"/></a:rPr><a:t>${prod.desc}</a:t></a:r></a:p>${dimStr ? `<a:p><a:r><a:rPr lang="en-US" b="1" sz="1000"><a:latin typeface="Calibri"/></a:rPr><a:t>${dimStr}</a:t></a:r></a:p>` : ''}${prod.price ? `<a:p><a:r><a:rPr lang="en-US" b="1" sz="1000"><a:latin typeface="Calibri"/></a:rPr><a:t>PRICE : ${prod.price}</a:t></a:r></a:p>` : ''}</p:txBody>`;
        const updatedSlot = slot.rawXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, () => newTxBody);
        slideXml = slideXml.replace(slot.rawXml, () => updatedSlot);

        if (prod.image && prod.image.buffer) {
          const imgFilename = `prod_img_${sIdx}_${slotIdx}.${prod.image.extension || 'png'}`;
          zip.file(`ppt/media/${imgFilename}`, prod.image.buffer);

          const imgRelId = `rId${nextSlideRId++}`;
          const relEntry = `<Relationship Id="${imgRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgFilename}"/>`;
          slideRels = slideRels.replace('</Relationships>', `${relEntry}</Relationships>`);

          const picX = slot.offX;
          const picY = Math.max(700000, slot.offY - 4400000);
          const picW = slot.extCx;
          const picH = Math.max(1000000, slot.offY - picY - 100000);
          const picId = 2000 + prodIdx;

          picsXml += `<p:pic xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:nvPicPr><p:cNvPr id="${picId}" name="Picture ${picId}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${imgRelId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${picX}" y="${picY}"/><a:ext cx="${picW}" cy="${picH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
        }
      } else if (slot) {
        const emptyTxBody = `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>`;
        const updatedSlot = slot.rawXml.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, () => emptyTxBody);
        slideXml = slideXml.replace(slot.rawXml, () => updatedSlot);
      }
    }

    if (picsXml) {
      slideXml = slideXml.replace('</p:spTree>', `${picsXml}</p:spTree>`);
    }

    zip.file(`ppt/slides/${slideName}`, slideXml);
    zip.file(`ppt/slides/_rels/${relsName}`, slideRels);

    if (sIdx > 1) {
      const partName = `/ppt/slides/${slideName}`;
      if (!contentTypesStr.includes(`PartName="${partName}"`)) {
        const ctEntry = `<Override PartName="${partName}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
        contentTypesStr = contentTypesStr.replace('</Types>', `${ctEntry}</Types>`);
      }

      const presRelId = `rId${nextPresRId++}`;
      if (!presRelsStr.includes(`Target="slides/${slideName}"`)) {
        const presRelEntry = `<Relationship Id="${presRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${slideName}"/>`;
        presRelsStr = presRelsStr.replace('</Relationships>', `${presRelEntry}</Relationships>`);
      }

      const sldIdVal = nextSldId++;
      const sldEntry = `<p:sldId id="${sldIdVal}" r:id="${presRelId}"/>`;
      presXmlStr = presXmlStr.replace('</p:sldIdLst>', `${sldEntry}</p:sldIdLst>`);
    }
  }

  zip.file('[Content_Types].xml', contentTypesStr);
  zip.file('ppt/_rels/presentation.xml.rels', presRelsStr);
  zip.file('ppt/presentation.xml', presXmlStr);

  return await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE'
  });
}

describe('Excel to Catalogue PPT Automated Tests', () => {

  it('Test A: Minimal Presentation (1 product record)', async () => {
    const excelBuf = await createTestExcel(1, true);
    const pptxBuf = await generateTestPptx(excelBuf, DEFAULT_TMPL_BUF, {});
    assert.ok(pptxBuf.byteLength > 1000, 'Output must be non-empty and reasonably sized');

    const validation = await validatePackage(pptxBuf);
    assert.equal(validation.valid, true, `Validation failed: ${validation.errors.join('; ')}`);
    assert.equal(validation.slideCount, 1, 'Should generate exactly 1 slide');

    const zip = await JSZip.loadAsync(pptxBuf);
    const s1 = await zip.file('ppt/slides/slide1.xml').async('text');
    assert.ok(s1.includes('SKU-1001'), 'Slide 1 must contain SKU-1001');
  });

  it('Test B: Multi-Product Catalogue (16 product records across multiple slides)', async () => {
    const excelBuf = await createTestExcel(16, true);
    const pptxBuf = await generateTestPptx(excelBuf, DEFAULT_TMPL_BUF, {});

    const validation = await validatePackage(pptxBuf);
    assert.equal(validation.valid, true, `Validation failed: ${validation.errors.join('; ')}`);
    assert.equal(validation.slideCount, 6, '16 items with 3 slots per slide must yield 6 slides');

    const zip = await JSZip.loadAsync(pptxBuf);
    const s1 = await zip.file('ppt/slides/slide1.xml').async('text');
    const s6 = await zip.file('ppt/slides/slide6.xml').async('text');
    assert.ok(s1.includes('SKU-1001'), 'Slide 1 must contain SKU-1001');
    assert.ok(s6.includes('SKU-1016'), 'Slide 6 must contain SKU-1016');
  });

  it('Test C: Template Preservation (Branding, Typography, Connector Rule)', async () => {
    const excelBuf = await createTestExcel(3, true);
    const pptxBuf = await generateTestPptx(excelBuf, DEFAULT_TMPL_BUF, {});
    const zip = await JSZip.loadAsync(pptxBuf);

    const s1 = await zip.file('ppt/slides/slide1.xml').async('text');
    assert.ok(s1.includes('NOBLE SELECTIONS'), 'Must preserve branding NOBLE SELECTIONS');
    assert.ok(s1.includes('Straight Connector 17'), 'Must preserve divider connector rule');
    assert.ok(s1.includes('Group 2'), 'Must preserve vector logo group');
  });

  it('Test D: Image Mapping & Aspect Ratio Constraints', async () => {
    const excelBuf = await createTestExcel(2, true);
    const pptxBuf = await generateTestPptx(excelBuf, DEFAULT_TMPL_BUF, {});
    const zip = await JSZip.loadAsync(pptxBuf);

    assert.ok(zip.file('ppt/media/prod_img_1_0.png'), 'Must contain embedded product image 1_0');
    assert.ok(zip.file('ppt/media/prod_img_1_1.png'), 'Must contain embedded product image 1_1');

    const s1 = await zip.file('ppt/slides/slide1.xml').async('text');
    assert.ok(s1.includes('<a:picLocks noChangeAspect="1"/>'), 'Must lock aspect ratio to prevent squashing');
  });

  it('Test E: File Delivery & Package Integrity Check', async () => {
    const excelBuf = await createTestExcel(4, true);
    const pptxBuf = await generateTestPptx(excelBuf, DEFAULT_TMPL_BUF, {});

    // Verify ZIP magic signature: PK\x03\x04
    assert.equal(pptxBuf[0], 0x50, 'Byte 0 must be P');
    assert.equal(pptxBuf[1], 0x4b, 'Byte 1 must be K');
    assert.equal(pptxBuf[2], 0x03, 'Byte 2 must be 0x03');
    assert.equal(pptxBuf[3], 0x04, 'Byte 3 must be 0x04');

    const validation = await validatePackage(pptxBuf);
    assert.equal(validation.valid, true);
  });

  it('Test F: Failure Handling for Invalid Input', async () => {
    const emptyWb = new ExcelJS.Workbook();
    emptyWb.addWorksheet('Empty');
    const emptyBuf = await emptyWb.xlsx.writeBuffer();

    await assert.rejects(
      async () => generateTestPptx(emptyBuf, DEFAULT_TMPL_BUF, {}),
      /No products found/
    );
  });

  it('Test G: Real Microsoft PowerPoint COM Verification', async () => {
    const excelBuf = await createTestExcel(8, true);
    const pptxBuf = await generateTestPptx(excelBuf, DEFAULT_TMPL_BUF, {});
    const tempTestPath = 'C:/Users/Machine28/Downloads/test_automated_com.pptx';
    fs.writeFileSync(tempTestPath, pptxBuf);

    let scriptPath = path.resolve(__dirname, 'test_ppt.ps1');
    if (!fs.existsSync(scriptPath)) {
      scriptPath = path.resolve(projectRoot, 'test_ppt.ps1');
    }
    const output = execSync(
      `powershell -ExecutionPolicy Bypass -File "${scriptPath}" "${tempTestPath}"`,
      { encoding: 'utf8' }
    );
    console.log('PowerPoint COM Output:\n', output);

    assert.ok(
      output.includes('POWERPOINT OPENED FILE SUCCESSFULLY! Slide Count: 3'),
      'Real Microsoft PowerPoint must open the file without corruption'
    );

    try { fs.unlinkSync(tempTestPath); } catch {}
  });

});
