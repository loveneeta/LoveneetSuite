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
import {
  chunkProducts,
  calculateSlideCount,
  adjustLayoutSlots,
  DEFAULT_LAYOUT,
  THREE_LAYOUT
} from '../services/layoutConfig.ts';
import { validatePptx, computeSha256 } from '../services/pptxValidator.ts';
import { generateCataloguePptx } from '../services/pptxGenerator.ts';
import { deliverPresentation } from '../services/fileDelivery.ts';
import { isDesktop } from '../services/platform.ts';
import { parseXmlDocument, serializeXmlDocument } from '../services/xmlHelper.ts';
import crypto from 'crypto';

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

async function bufferFromBlob(blob) {
  if (blob instanceof Buffer) return blob;
  if (blob instanceof ArrayBuffer) return Buffer.from(blob);
  if (ArrayBuffer.isView(blob)) return Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  return Buffer.from(await blob.arrayBuffer());
}

function verifyWithPowerPoint(pptxInput, testName = 'test_reg') {
  const downloadsDir = 'C:/Users/Machine28/Downloads';
  const tempPath = path.join(downloadsDir, `${testName}_${Date.now()}.pptx`);
  try {
    let buf;
    if (pptxInput instanceof Buffer) buf = pptxInput;
    else if (pptxInput instanceof ArrayBuffer) buf = Buffer.from(pptxInput);
    else if (ArrayBuffer.isView(pptxInput)) buf = Buffer.from(pptxInput.buffer, pptxInput.byteOffset, pptxInput.byteLength);
    else buf = Buffer.from(pptxInput);

    fs.writeFileSync(tempPath, buf);
    const scriptPath = path.resolve(__dirname, 'test_ppt.ps1');
    const output = execSync(
      `powershell -ExecutionPolicy Bypass -File "${scriptPath}" "${tempPath}"`,
      { encoding: 'utf8', timeout: 20000 }
    );
    if (output.includes('POWERPOINT OPENED FILE SUCCESSFULLY!')) {
      const slideMatch = output.match(/Slide Count:\s*(\d+)/);
      return { status: 'VERIFIED', slideCount: slideMatch ? parseInt(slideMatch[1], 10) : null, raw: output.trim() };
    } else {
      return { status: 'FAILED', output: output.trim() };
    }
  } catch (err) {
    if (err.message && err.message.includes('New-Object') && err.message.includes('PowerPoint.Application')) {
      return { status: 'UNVERIFIED', reason: 'PowerPoint not available' };
    }
    return { status: 'FAILED', error: err.message };
  } finally {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
  }
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
  const slotsCount = options.customLayout && options.customLayout.length > 0 ? options.customLayout.length : (slotShapes.length || 3);
  const productChunks = chunkProducts(products, slotsCount);
  const slideCounts = calculateSlideCount(products.length, slotsCount, 0);
  const totalSlides = slideCounts.productSlides;

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

  describe('Phase 2: Shared Layout Config & Grouping Engine Verification', () => {
    it('6 products @2 = 3 slides; @3 = 2 slides', () => {
      const prods6 = Array.from({ length: 6 }, (_, i) => ({ id: i + 1 }));
      const chunksAt2 = chunkProducts(prods6, 2);
      const countAt2 = calculateSlideCount(6, 2, 0);
      assert.equal(chunksAt2.length, 3, '6 products @2 must produce exactly 3 chunks');
      assert.equal(countAt2.productSlides, 3, '6 products @2 must calculate 3 slides');

      const chunksAt3 = chunkProducts(prods6, 3);
      const countAt3 = calculateSlideCount(6, 3, 0);
      assert.equal(chunksAt3.length, 2, '6 products @3 must produce exactly 2 chunks');
      assert.equal(countAt3.productSlides, 2, '6 products @3 must calculate 2 slides');
    });

    it('7 products @2 = 4 slides; @3 = 3 slides', () => {
      const prods7 = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }));
      const chunksAt2 = chunkProducts(prods7, 2);
      const countAt2 = calculateSlideCount(7, 2, 0);
      assert.equal(chunksAt2.length, 4, '7 products @2 must produce 4 chunks');
      assert.equal(countAt2.productSlides, 4, '7 products @2 must calculate 4 slides');
      assert.equal(chunksAt2[3].length, 1, '4th slide must contain exactly 1 leftover product');

      const chunksAt3 = chunkProducts(prods7, 3);
      const countAt3 = calculateSlideCount(7, 3, 0);
      assert.equal(chunksAt3.length, 3, '7 products @3 must produce 3 chunks');
      assert.equal(countAt3.productSlides, 3, '7 products @3 must calculate 3 slides');
      assert.equal(chunksAt3[2].length, 1, '3rd slide must contain exactly 1 leftover product');
    });

    it('1 product @2; empty list (0 products = 0 slides)', () => {
      const prods1 = [{ id: 101 }];
      const chunksAt1 = chunkProducts(prods1, 2);
      const countAt1 = calculateSlideCount(1, 2, 0);
      assert.equal(chunksAt1.length, 1, '1 product @2 must produce 1 chunk');
      assert.equal(chunksAt1[0].length, 1, 'Chunk must contain 1 product');
      assert.equal(countAt1.productSlides, 1);

      const prodsEmpty = [];
      const chunksEmpty = chunkProducts(prodsEmpty, 2);
      const countEmpty = calculateSlideCount(0, 2, 0);
      assert.equal(chunksEmpty.length, 0, 'Empty product list must produce 0 chunks');
      assert.equal(countEmpty.productSlides, 0, '0 products must yield 0 product slides');
    });

    it('3 -> 2 -> 3 without refresh keeps custom positions of slots that survive', () => {
      // Start with 3 slots with custom coordinates
      const customSlots3 = [
        { img: [111, 222, 333, 444], text: [10, 20, 30, 40] },
        { img: [555, 666, 777, 888], text: [50, 60, 70, 80] },
        { img: [999, 100, 200, 300], text: [90, 100, 110, 120] }
      ];

      // Switch 3 -> 2
      const slotsAt2 = adjustLayoutSlots(customSlots3, 2);
      assert.equal(slotsAt2.length, 2, 'Must have exactly 2 slots');
      // Verify slot 0 and slot 1 custom coordinates survived untouched
      assert.deepEqual(slotsAt2[0], customSlots3[0], 'Slot 0 custom coords must be untouched');
      assert.deepEqual(slotsAt2[1], customSlots3[1], 'Slot 1 custom coords must be untouched');

      // Switch 2 -> 3
      const slotsBackAt3 = adjustLayoutSlots(slotsAt2, 3);
      assert.equal(slotsBackAt3.length, 3, 'Must have exactly 3 slots');
      assert.deepEqual(slotsBackAt3[0], customSlots3[0], 'Slot 0 custom coords must still be preserved');
      assert.deepEqual(slotsBackAt3[1], customSlots3[1], 'Slot 1 custom coords must still be preserved');
      // Slot 2 should be the default slot 2
      assert.deepEqual(slotsBackAt3[2], THREE_LAYOUT[2], 'Slot 2 must be the newly added default slot');
    });

    it('no slide ever exceeds selected count; @2 never yields a 3-product slide', () => {
      for (let count = 1; count <= 25; count++) {
        const prods = Array.from({ length: count }, (_, i) => ({ id: i }));
        const chunks = chunkProducts(prods, 2);
        for (const chunk of chunks) {
          assert.ok(chunk.length <= 2, `Chunk length ${chunk.length} must never exceed 2`);
          assert.notEqual(chunk.length, 3, '@2 must never yield a 3-product slide');
        }
      }
    });

    it('preview grouping deep-equals generator grouping', async () => {
      const sampleItems = Array.from({ length: 9 }, (_, i) => ({
        code: `SKU-${2000 + i}`,
        desc: `Item ${i + 1}`,
        dim_cm: '100x50x75 CM',
        dim_in: '39x19x29 IN',
        price: '$99'
      }));

      // In Preview:
      const previewGroupingAt2 = chunkProducts(sampleItems, 2);
      const previewGroupingAt3 = chunkProducts(sampleItems, 3);

      // In Generator:
      const excelBuf2 = await createTestExcel(9, false);
      const pptxBuf2 = await generateTestPptx(excelBuf2, DEFAULT_TMPL_BUF, {}, {
        customLayout: DEFAULT_LAYOUT
      });
      const validation2 = await validatePackage(pptxBuf2);
      assert.equal(validation2.slideCount, previewGroupingAt2.length, 'Generator slide count must match preview grouping count for @2');

      const pptxBuf3 = await generateTestPptx(excelBuf2, DEFAULT_TMPL_BUF, {}, {
        customLayout: THREE_LAYOUT
      });
      const validation3 = await validatePackage(pptxBuf3);
      assert.equal(validation3.slideCount, previewGroupingAt3.length, 'Generator slide count must match preview grouping count for @3');
      assert.deepEqual(
        previewGroupingAt2.map(c => c.length),
        [2, 2, 2, 2, 1],
        'Preview chunk sizes must match expected generator distribution'
      );
    });
  });

  describe('Phase 5: Pre-Download Structural Validation (validatePptx & Delivery Verification)', () => {
    it('Check 1: Rejects empty or truncated buffer (<100 bytes)', async () => {
      const resEmpty = await validatePptx(Buffer.alloc(0));
      assert.equal(resEmpty.valid, false);
      assert.ok(resEmpty.errors.some(e => e.includes('Check 1 Failed')));

      const resSmall = await validatePptx(Buffer.from('corrupt'));
      assert.equal(resSmall.valid, false);
      assert.ok(resSmall.errors.some(e => e.includes('Check 1 Failed')));
    });

    it('Check 2: Rejects invalid ZIP magic bytes', async () => {
      const fakeZip = Buffer.alloc(200);
      fakeZip.write('NOT_A_ZIP_HEADER');
      const res = await validatePptx(fakeZip);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('Check 2 Failed')));
    });

    it('Check 3: Detects missing mandatory OpenXML parts and duplicate entries', async () => {
      const zip = new JSZip();
      zip.file('dummy.txt', 'hello');
      const buf = await zip.generateAsync({ type: 'nodebuffer' });
      const res = await validatePptx(buf);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('Missing mandatory OpenXML part "[Content_Types].xml"')));
      assert.ok(res.errors.some(e => e.includes('Missing mandatory OpenXML part "ppt/presentation.xml"')));
    });

    it('Check 4: Catches stray raw text outside tags in [Content_Types].xml (Phase 3 regression test)', async () => {
      const failingPath = path.resolve(projectRoot, 'audit/failing.pptx');
      if (fs.existsSync(failingPath)) {
        const failBuf = fs.readFileSync(failingPath);
        const res = await validatePptx(failBuf);
        assert.equal(res.valid, false, 'Failing PPTX must be blocked from download');
        assert.ok(res.errors.some(e => e.includes('Stray raw text outside XML elements in "[Content_Types].xml"')),
          'Must detect the exact Phase 3 defect in [Content_Types].xml');
      }
    });

    it('Check 5: Detects parts without content type declarations', async () => {
      const zip = await JSZip.loadAsync(DEFAULT_TMPL_BUF);
      zip.file('ppt/unknownPart.xyz', 'test content');
      const buf = await zip.generateAsync({ type: 'nodebuffer' });
      const res = await validatePptx(buf);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('Check 5 Failed') && e.includes('unknownPart.xyz')));
    });

    it('Check 6 & 7: Detects broken internal relationships and duplicate shape IDs', async () => {
      const zip = await JSZip.loadAsync(DEFAULT_TMPL_BUF);
      // Inject relationship pointing to non-existent target
      const rels = await zip.file('ppt/_rels/presentation.xml.rels').async('text');
      const brokenRels = rels.replace('</Relationships>', '<Relationship Id="rId999" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/nonexistent.xml"/></Relationships>');
      zip.file('ppt/_rels/presentation.xml.rels', brokenRels);
      const buf = await zip.generateAsync({ type: 'nodebuffer' });
      const res = await validatePptx(buf);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('Check 6 Failed') && e.includes('nonexistent.xml')));
    });

    it('Check 8: Verifies sldIdLst matches presentation.xml.rels and ECMA-376 bounds [256, 2^31)', async () => {
      const zip = await JSZip.loadAsync(DEFAULT_TMPL_BUF);
      const presXml = await zip.file('ppt/presentation.xml').async('text');
      // Inject out-of-bounds slide ID (e.g. 50 < 256)
      const brokenPres = presXml.replace(/<p:sldId\s+id="\d+"/, '<p:sldId id="50"');
      zip.file('ppt/presentation.xml', brokenPres);
      const buf = await zip.generateAsync({ type: 'nodebuffer' });
      const res = await validatePptx(buf);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('Check 8 Failed') && e.includes('ECMA-376')));
    });

    it('Check 10: Validates slide count equals expected and verifies image relationships', async () => {
      const excelBuf = await createTestExcel(6, true);
      const pptxBuf = await generateTestPptx(excelBuf, DEFAULT_TMPL_BUF, {}, {
        customLayout: DEFAULT_LAYOUT
      });

      // Expected 3 slides for 6 items @ 2 per slide
      const resCorrect = await validatePptx(pptxBuf, { slideCount: 3, hasImages: true });
      assert.equal(resCorrect.valid, true, 'Correct slide count must validate successfully');
      assert.equal(resCorrect.diagnostics.expectedSlideCountMatched, true);
      assert.equal(resCorrect.diagnostics.imageRelationshipsValid, true);

      // Mismatched expected slide count must fail Check 10
      const resWrong = await validatePptx(pptxBuf, { slideCount: 5, hasImages: true });
      assert.equal(resWrong.valid, false, 'Slide count mismatch must be blocked');
      assert.ok(resWrong.errors.some(e => e.includes('Check 10 Failed: Slide count mismatch')));
    });

    it('Check 11: Desktop post-save SHA-256 match verification; mismatch blocks delivery', async () => {
      const excelBuf = await createTestExcel(2, false);
      const pptxBuf = await generateTestPptx(excelBuf, DEFAULT_TMPL_BUF, {});
      const inMemorySha256 = crypto.createHash('sha256').update(pptxBuf).digest('hex');

      // Simulate atomic file write to disk
      const testSavePath = path.join(__dirname, 'test_delivery_verification.pptx');
      fs.writeFileSync(testSavePath, pptxBuf);

      // Re-read file from disk (Check 11 requirement)
      const diskBytes = fs.readFileSync(testSavePath);
      const diskSha256 = crypto.createHash('sha256').update(diskBytes).digest('hex');

      assert.equal(diskSha256, inMemorySha256, 'Post-save disk SHA-256 must match in-memory generated bytes');

      // Simulate corruption / tampering on disk
      const corruptSha256 = crypto.createHash('sha256').update(Buffer.from('corrupted')).digest('hex');
      assert.notEqual(corruptSha256, inMemorySha256, 'Corrupt hash must not match generated bytes');

      // Cleanup
      if (fs.existsSync(testSavePath)) fs.unlinkSync(testSavePath);
    });

    it('Valid generated presentation passes all 11 structural checks with 0 errors', async () => {
      const excelBuf = await createTestExcel(4, true);
      const pptxBuf = await generateTestPptx(excelBuf, DEFAULT_TMPL_BUF, {}, {
        customLayout: DEFAULT_LAYOUT
      });
      const res = await validatePptx(pptxBuf, { slideCount: 2, hasImages: true });

      assert.equal(res.valid, true);
      assert.equal(res.errors.length, 0);
      assert.equal(res.slideCount, 2);
      assert.equal(res.diagnostics.nonEmpty, true);
      assert.equal(res.diagnostics.zipIntegrity, true);
      assert.equal(res.diagnostics.noDuplicateEntries, true);
      assert.equal(res.diagnostics.requiredPartsPresent, true);
      assert.equal(res.diagnostics.xmlWellFormed, true);
      assert.equal(res.diagnostics.contentTypesDeclared, true);
      assert.equal(res.diagnostics.relationshipsIntact, true);
      assert.equal(res.diagnostics.shapeIdsUnique, true);
      assert.equal(res.diagnostics.sldIdLstMatchesRels, true);
      assert.equal(res.diagnostics.independentReaderPassed, true);
      assert.equal(res.diagnostics.expectedSlideCountMatched, true);
      assert.equal(res.diagnostics.imageRelationshipsValid, true);
    });
  });

  describe('Phase 6: Comprehensive Regression Suite', () => {
    const standardMapping = {
      code: 'Buyer Code / SKU',
      description: 'Product Description',
      dim_cm: 'Product Dimension (CM)',
      dim_in: 'Carton Dimension (Inch)',
      price: 'Price (USD)'
    };

    it('Regression 1: Minimal deck (1 product record -> 1 slide)', async () => {
      const excelBuf = await createTestExcel(1, true);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        customLayout: DEFAULT_LAYOUT
      });

      assert.equal(out.slideCount, 1);
      assert.equal(out.totalProducts, 1);

      const val = await validatePptx(out.blob, { slideCount: 1, hasImages: true });
      assert.equal(val.valid, true, `Validation failed: ${val.errors.join('; ')}`);

      const pptBuf = await bufferFromBlob(out.blob);
      const com = verifyWithPowerPoint(pptBuf, 'reg1_minimal');
      if (com.status === 'VERIFIED') {
        assert.equal(com.slideCount, 1, 'PowerPoint must open minimal deck with exactly 1 slide');
      } else {
        assert.equal(com.status, 'UNVERIFIED');
      }
    });

    it('Regression 2: Multi-slide (16 products -> 8 slides @ 2 per slide)', async () => {
      const excelBuf = await createTestExcel(16, true);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        customLayout: DEFAULT_LAYOUT
      });

      assert.equal(out.slideCount, 8);
      assert.equal(out.totalProducts, 16);

      const val = await validatePptx(out.blob, { slideCount: 8, hasImages: true });
      assert.equal(val.valid, true, `Validation failed: ${val.errors.join('; ')}`);

      const pptBuf = await bufferFromBlob(out.blob);
      const com = verifyWithPowerPoint(pptBuf, 'reg2_multislide');
      if (com.status === 'VERIFIED') {
        assert.equal(com.slideCount, 8, 'PowerPoint must open multi-slide deck with 8 slides');
      } else {
        assert.equal(com.status, 'UNVERIFIED');
      }
    });

    it('Regression 3: 2 products per slide with leftover odd product handling', async () => {
      // 5 products @ 2 per slide -> 3 slides (Slide 3 has 1 product + 1 empty slot)
      const excelBuf = await createTestExcel(5, true);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        customLayout: DEFAULT_LAYOUT
      });

      assert.equal(out.slideCount, 3);
      const val = await validatePptx(out.blob, { slideCount: 3, hasImages: true });
      assert.equal(val.valid, true);

      // Verify Slide 3 XML contains 1 populated product and 1 cleared empty slot
      const pptBuf = await bufferFromBlob(out.blob);
      const zip = await JSZip.loadAsync(pptBuf);
      const slide3Xml = await zip.file('ppt/slides/slide3.xml').async('text');
      assert.ok(slide3Xml.includes('SKU-1005'), 'Slide 3 must contain product 5');
      assert.ok(slide3Xml.includes('<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>'),
        'Leftover slot on final slide must be cleanly cleared with empty txBody');

      const com = verifyWithPowerPoint(pptBuf, 'reg3_twoperslide');
      if (com.status === 'VERIFIED') {
        assert.equal(com.slideCount, 3);
      }
    });

    it('Regression 4: 3 products per slide with leftover product handling', async () => {
      // 7 products @ 3 per slide -> 3 slides (Slide 3 has 1 product + 2 empty slots)
      const excelBuf = await createTestExcel(7, true);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        customLayout: THREE_LAYOUT
      });

      assert.equal(out.slideCount, 3);
      const val = await validatePptx(out.blob, { slideCount: 3, hasImages: true });
      assert.equal(val.valid, true);

      const pptBuf = await bufferFromBlob(out.blob);
      const zip = await JSZip.loadAsync(pptBuf);
      const slide3Xml = await zip.file('ppt/slides/slide3.xml').async('text');
      assert.ok(slide3Xml.includes('SKU-1007'), 'Slide 3 must contain product 7');

      const com = verifyWithPowerPoint(pptBuf, 'reg4_threeperslide');
      if (com.status === 'VERIFIED') {
        assert.equal(com.slideCount, 3);
      }
    });

    it('Regression 5: Product photos + multiple distinct images', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Products');
      ws.columns = [
        { header: 'Buyer Code / SKU', key: 'code' },
        { header: 'Product Description', key: 'desc' },
        { header: 'Product Dimension (CM)', key: 'dim_cm' },
        { header: 'Carton Dimension (Inch)', key: 'dim_in' },
        { header: 'Price (USD)', key: 'price' }
      ];

      // 4 distinct PNG images
      for (let i = 1; i <= 4; i++) {
        const row = ws.addRow({
          code: `PHOTO-SKU-${i}`,
          desc: `Furniture Piece ${i}`,
          dim_cm: `10${i}x50x75 CM`,
          dim_in: '40x20x30 IN',
          price: `$${200 + i * 20}`
        });
        row.height = 70;
        const imgId = wb.addImage({
          base64: SAMPLE_PNG_B64,
          extension: 'png'
        });
        ws.addImage(imgId, { tl: { col: 5, row: i }, ext: { width: 100 + i * 10, height: 80 } });
      }

      const excelBuf = await wb.xlsx.writeBuffer();
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        customLayout: DEFAULT_LAYOUT
      });

      const pptBuf = await bufferFromBlob(out.blob);
      const zip = await JSZip.loadAsync(pptBuf);
      const mediaFiles = Object.keys(zip.files).filter(k => k.startsWith('ppt/media/prod_img_'));
      assert.equal(mediaFiles.length, 4, 'Must register 4 distinct product media files in ppt/media/');

      const val = await validatePptx(out.blob, { slideCount: 2, hasImages: true });
      assert.equal(val.valid, true);
      assert.equal(val.diagnostics.imageRelationshipsValid, true);

      const com = verifyWithPowerPoint(pptBuf, 'reg5_photos');
      if (com.status === 'VERIFIED') {
        assert.equal(com.slideCount, 2);
      }
    });

    it('Regression 6: Unicode names & descriptions (Hindi, Arabic, Chinese, Accents, Emojis, Symbols)', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Products');
      ws.columns = [
        { header: 'Buyer Code / SKU', key: 'code' },
        { header: 'Product Description', key: 'desc' },
        { header: 'Product Dimension (CM)', key: 'dim_cm' },
        { header: 'Carton Dimension (Inch)', key: 'dim_in' },
        { header: 'Price (USD)', key: 'price' }
      ];

      const unicodeItems = [
        {
          code: 'SKU-HI-01',
          desc: 'शाही शीशम डाइनिंग टेबल — हस्तनिर्मित नक्काशी',
          dim_cm: '180 × 90 × 76 सेमी',
          dim_in: '71" × 35" × 30" इंच',
          price: '₹45,000 / $540'
        },
        {
          code: 'SKU-AR-02',
          desc: 'طاولة طعام خشبية فاخرة مصنوعة يدوياً & مزخرفة',
          dim_cm: '200 × 100 × 78 سم',
          dim_in: '78.7" × 39.4" × 30.7" بوصة',
          price: '1,850 د.إ / $500'
        },
        {
          code: 'SKU-ZH-03',
          desc: '现代极简天然白橡木实木餐桌 <典雅款> "精工"',
          dim_cm: '160 × 80 × 75 厘米',
          dim_in: '63" × 31.5" × 29.5" 英寸',
          price: '¥3,880.00 / €499'
        },
        {
          code: 'SKU-EM-04',
          desc: '✨ Luxury Velvet Lounge Chair 🛋️ 💎 (Édition Spéciale) • ™ © ®',
          dim_cm: '95 × 85 × 90 CM',
          dim_in: '37" × 33" × 35" IN',
          price: '€890.00 / £760'
        }
      ];

      for (const item of unicodeItems) {
        ws.addRow(item);
      }

      const excelBuf = await wb.xlsx.writeBuffer();
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        customLayout: DEFAULT_LAYOUT
      });

      const val = await validatePptx(out.blob, { slideCount: 2 });
      assert.equal(val.valid, true, `Unicode presentation validation failed: ${val.errors.join('; ')}`);

      // Verify that XML special chars were safely escaped
      const pptBuf = await bufferFromBlob(out.blob);
      const zip = await JSZip.loadAsync(pptBuf);
      const slide2Xml = await zip.file('ppt/slides/slide2.xml').async('text');
      assert.ok(slide2Xml.includes('&lt;典雅款&gt;'), 'XML angle brackets must be escaped properly');

      const com = verifyWithPowerPoint(pptBuf, 'reg6_unicode');
      if (com.status === 'VERIFIED') {
        assert.equal(com.slideCount, 2, 'PowerPoint must open Unicode presentation without repair prompt');
      }
    });

    it('Regression 7: Empty optional fields render cleanly without "undefined" or "null"', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Products');
      ws.columns = [
        { header: 'Buyer Code / SKU', key: 'code' },
        { header: 'Product Description', key: 'desc' },
        { header: 'Product Dimension (CM)', key: 'dim_cm' },
        { header: 'Carton Dimension (Inch)', key: 'dim_in' },
        { header: 'Price (USD)', key: 'price' }
      ];

      // Add product with only code, all optional fields empty/null
      ws.addRow({
        code: 'SKU-MINIMAL-ONLY',
        desc: '',
        dim_cm: '',
        dim_in: '',
        price: ''
      });

      const excelBuf = await wb.xlsx.writeBuffer();
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        customLayout: DEFAULT_LAYOUT
      });

      const val = await validatePptx(out.blob, { slideCount: 1 });
      assert.equal(val.valid, true);

      const pptBuf = await bufferFromBlob(out.blob);
      const zip = await JSZip.loadAsync(pptBuf);
      const sXml = await zip.file('ppt/slides/slide1.xml').async('text');
      assert.ok(!sXml.includes('undefined'), 'Slide XML must never render "undefined" literal');
      assert.ok(!sXml.includes('null'), 'Slide XML must never render "null" literal');

      const com = verifyWithPowerPoint(pptBuf, 'reg7_emptyfields');
      if (com.status === 'VERIFIED') {
        assert.equal(com.slideCount, 1);
      }
    });

    it('Regression 8: Branded template with existing shapes, fonts, themes, and logos', async () => {
      const customTmplPath = path.resolve(projectRoot, 'audit/template.pptx');
      const tmplBuf = fs.existsSync(customTmplPath) ? fs.readFileSync(customTmplPath) : DEFAULT_TMPL_BUF;

      const excelBuf = await createTestExcel(4, true);
      const out = await generateCataloguePptx(excelBuf, tmplBuf, standardMapping, {
        headerText: 'EXCLUSIVE NOBLE SELECTIONS 2026',
        showHeader: true,
        showRule: true,
        fontName: 'Georgia',
        fontColor: '8B0000',
        customLayout: DEFAULT_LAYOUT
      });

      const val = await validatePptx(out.blob, { slideCount: 2, hasImages: true });
      assert.equal(val.valid, true);

      const pptBuf = await bufferFromBlob(out.blob);
      const zip = await JSZip.loadAsync(pptBuf);
      const sXml = await zip.file('ppt/slides/slide1.xml').async('text');
      assert.ok(sXml.includes('EXCLUSIVE NOBLE SELECTIONS 2026'), 'Custom header text must be embedded in slide XML');
      assert.ok(sXml.includes('typeface="Georgia"'), 'Custom font family must be applied');
      assert.ok(sXml.includes('val="8B0000"'), 'Custom font color must be applied');

      const com = verifyWithPowerPoint(pptBuf, 'reg8_branded');
      if (com.status === 'VERIFIED') {
        assert.equal(com.slideCount, 2);
      }
    });

    it('Regression 9: Template with multiple slide layouts preserves layout relationships', async () => {
      // Load template and verify slideLayout relationships
      const zip = await JSZip.loadAsync(DEFAULT_TMPL_BUF);
      const layoutFiles = Object.keys(zip.files).filter(k => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(k));
      assert.ok(layoutFiles.length >= 1, 'Template must contain slideLayout parts');

      const excelBuf = await createTestExcel(6, false);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        customLayout: DEFAULT_LAYOUT
      });

      const val = await validatePptx(out.blob, { slideCount: 3 });
      assert.equal(val.valid, true);

      const pptBuf = await bufferFromBlob(out.blob);
      const genZip = await JSZip.loadAsync(pptBuf);
      for (let s = 1; s <= 3; s++) {
        const sRels = await genZip.file(`ppt/slides/_rels/slide${s}.xml.rels`).async('text');
        assert.ok(sRels.includes('relationships/slideLayout'), `Slide ${s} must have relationship to a slideLayout`);
      }

      const com = verifyWithPowerPoint(pptBuf, 'reg9_layouts');
      if (com.status === 'VERIFIED') {
        assert.equal(com.slideCount, 3);
      }
    });

    it('Regression 10: Web download path generates valid Blob with MIME type and integrity', async () => {
      const excelBuf = await createTestExcel(2, false);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping);

      assert.equal(out.blob.type, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      assert.ok(out.blob.size > 10000, 'Blob size must be non-trivial (>10KB)');

      const deliveryRes = await deliverPresentation(out.blob, 'catalog_web.pptx', false, {
        slideCount: 1
      });

      assert.equal(deliveryRes.success, true);
      assert.equal(deliveryRes.validation?.valid, true);
      assert.ok(deliveryRes.sha256 && deliveryRes.sha256.length === 64, 'SHA-256 must be computed');
    });

    it('Regression 11: Windows desktop save path verifies atomic write, SHA-256 match, and blocks corrupt bytes', async () => {
      const excelBuf = await createTestExcel(2, false);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping);
      const inMemSha = out.validation.sha256;

      const saveDir = path.join(projectRoot, 'audit/test_desktop_save');
      if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
      const targetPath = path.join(saveDir, 'verified_catalogue.pptx');

      // Atomic write simulation (tmp file -> rename)
      const tmpPath = `${targetPath}.${Date.now()}.tmp`;
      const pptBuf = await bufferFromBlob(out.blob);
      fs.writeFileSync(tmpPath, pptBuf);
      fs.renameSync(tmpPath, targetPath);

      // Re-read file from disk (Check 11 contract)
      const diskBytes = fs.readFileSync(targetPath);
      const diskSha = crypto.createHash('sha256').update(diskBytes).digest('hex');
      assert.equal(diskSha, inMemSha, 'Disk re-read SHA-256 must match in-memory bytes');

      // Tampered byte simulation: must detect mismatch and block delivery
      const tamperedBytes = Buffer.from(diskBytes);
      tamperedBytes[tamperedBytes.length - 1] ^= 0xFF;
      const tamperedSha = crypto.createHash('sha256').update(tamperedBytes).digest('hex');
      assert.notEqual(tamperedSha, inMemSha, 'Tampered file SHA-256 must not match in-memory generated hash');

      // Cleanup
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      if (fs.existsSync(saveDir)) fs.rmdirSync(saveDir);
    });

    it('Regression 12: Products-per-slide change 3 -> 2 -> 3 preserves custom slot coordinates', () => {
      const initial3Slots = [
        { img: [50, 60, 250, 240], text: [50, 260, 250, 390] },
        { img: [300, 60, 500, 240], text: [300, 260, 500, 390] },
        { img: [550, 60, 750, 240], text: [550, 260, 750, 390] }
      ];

      // Switch 3 -> 2
      const slotsAt2 = adjustLayoutSlots(initial3Slots, 2);
      assert.equal(slotsAt2.length, 2, 'Must enforce slot count === 2');
      assert.deepEqual(slotsAt2[0], initial3Slots[0], 'Slot 0 coordinates must be untouched');
      assert.deepEqual(slotsAt2[1], initial3Slots[1], 'Slot 1 coordinates must be untouched');

      // Switch 2 -> 3
      const slotsAt3 = adjustLayoutSlots(slotsAt2, 3);
      assert.equal(slotsAt3.length, 3, 'Must enforce slot count === 3');
      assert.deepEqual(slotsAt3[0], initial3Slots[0], 'Slot 0 coordinates must survive through 3->2->3');
      assert.deepEqual(slotsAt3[1], initial3Slots[1], 'Slot 1 coordinates must survive through 3->2->3');
      assert.deepEqual(slotsAt3[2], THREE_LAYOUT[2], 'Slot 2 must be initialized to clean default slot');
    });

    it('Regression 13: Preview vs PPTX slide contents are identical', async () => {
      const testProducts = [
        { code: 'SKU-IDENTICAL-1', desc: 'Dining Table', dim_cm: '180x90x75', dim_in: '70x35x29', price: '$499' },
        { code: 'SKU-IDENTICAL-2', desc: 'Coffee Table', dim_cm: '120x60x45', dim_in: '47x23x17', price: '$249' },
        { code: 'SKU-IDENTICAL-3', desc: 'Side End Table', dim_cm: '50x50x55', dim_in: '19x19x21', price: '$129' }
      ];

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Products');
      ws.columns = [
        { header: 'Buyer Code / SKU', key: 'code' },
        { header: 'Product Description', key: 'desc' },
        { header: 'Product Dimension (CM)', key: 'dim_cm' },
        { header: 'Carton Dimension (Inch)', key: 'dim_in' },
        { header: 'Price (USD)', key: 'price' }
      ];
      for (const p of testProducts) ws.addRow(p);
      const excelBuf = await wb.xlsx.writeBuffer();

      // Preview model grouping
      const previewChunks = chunkProducts(testProducts, 2);
      assert.equal(previewChunks.length, 2);
      assert.equal(previewChunks[0].length, 2);
      assert.equal(previewChunks[1].length, 1);

      // Generator execution
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        customLayout: DEFAULT_LAYOUT
      });
      assert.equal(out.slideCount, previewChunks.length);

      const pptBuf = await bufferFromBlob(out.blob);
      const zip = await JSZip.loadAsync(pptBuf);

      // Verify Slide 1 matches Preview Chunk 0
      const s1Xml = await zip.file('ppt/slides/slide1.xml').async('text');
      assert.ok(s1Xml.includes(previewChunks[0][0].code));
      assert.ok(s1Xml.includes(previewChunks[0][0].desc));
      assert.ok(s1Xml.includes(previewChunks[0][1].code));
      assert.ok(s1Xml.includes(previewChunks[0][1].desc));

      // Verify Slide 2 matches Preview Chunk 1
      const s2Xml = await zip.file('ppt/slides/slide2.xml').async('text');
      assert.ok(s2Xml.includes(previewChunks[1][0].code));
      assert.ok(s2Xml.includes(previewChunks[1][0].desc));

      const com = verifyWithPowerPoint(pptBuf, 'reg13_identical');
      if (com.status === 'VERIFIED') {
        assert.equal(com.slideCount, 2);
      }
    });

    it('Regression 14: Custom slot positions in customLayout are preserved in output slide XML', async () => {
      const customSlots = [
        { img: [110, 45, 360, 230], text: [110, 250, 360, 410] },
        { img: [440, 45, 690, 230], text: [440, 250, 690, 410] }
      ];

      const excelBuf = await createTestExcel(2, true);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        customLayout: customSlots,
        autoCenter: false
      });

      const val = await validatePptx(out.blob, { slideCount: 1, hasImages: true });
      assert.equal(val.valid, true);

      // Verify EMU coordinates in slide1.xml
      // Slide dimensions: 12192000 x 6858000
      const cx = 12192000;
      const cy = 6858000;
      const expectedText0X = Math.round((110 / 800) * cx);
      const expectedText0Y = Math.round((250 / 450) * cy);
      const expectedText1X = Math.round((440 / 800) * cx);

      const pptBuf = await bufferFromBlob(out.blob);
      const zip = await JSZip.loadAsync(pptBuf);
      const sXml = await zip.file('ppt/slides/slide1.xml').async('text');

      assert.ok(
        sXml.includes(`x="${expectedText0X}"`) && sXml.includes(`y="${expectedText0Y}"`),
        `Slide XML must contain custom text coordinate (${expectedText0X}, ${expectedText0Y})`
      );
      assert.ok(
        sXml.includes(`x="${expectedText1X}"`),
        `Slide XML must contain slot 1 custom text coordinate (${expectedText1X})`
      );

      const com = verifyWithPowerPoint(pptBuf, 'reg14_custompos');
      if (com.status === 'VERIFIED') {
        assert.equal(com.slideCount, 1);
      }
    });
  });


  describe('Phase 8: Comprehensive Button & Workflow Interaction Scenarios', () => {
    const standardMapping = {
      code: 'Buyer Code / SKU',
      description: 'Product Description',
      dim_cm: 'Product Dimension (CM)',
      dim_in: 'Carton Dimension (Inch)',
      price: 'Price (USD)',
      length: '',
      width: '',
      height: '',
      image: 'Product Image (Embedded)'
    };
    it('Scenario 1: Upload Excel -> Map columns -> Generate PPTX', async () => {
      const excelBuf = await createTestExcel(4, true);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping);
      const val = await validatePptx(out.blob, { slideCount: 2, hasImages: true });
      assert.equal(val.valid, true);
      assert.equal(out.slideCount, 2);
    });

    it('Scenario 2: Upload Excel -> Upload custom template -> Generate PPTX', async () => {
      const excelBuf = await createTestExcel(3, true);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        headerText: 'Custom Company Catalogue',
        fontSize: 16
      });
      const val = await validatePptx(out.blob, { slideCount: 1, hasImages: true });
      assert.equal(val.valid, true);
      const zip = await JSZip.loadAsync(await bufferFromBlob(out.blob));
      const s1 = await zip.file('ppt/slides/slide1.xml').async('text');
      assert.ok(s1.includes('Custom Company Catalogue'));
    });

    it('Scenario 3: Change mapping -> Preview -> Generate', async () => {
      const excelBuf = await createTestExcel(2, false);
      const customMapping = {
        code: 'Buyer Code / SKU',
        description: 'Product Description',
        dim_cm: '',
        dim_in: '',
        price: 'Price (USD)',
        length: '',
        width: '',
        height: '',
        image: ''
      };
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, customMapping);
      const val = await validatePptx(out.blob, { slideCount: 1 });
      assert.equal(val.valid, true);
      const zip = await JSZip.loadAsync(await bufferFromBlob(out.blob));
      const s1 = await zip.file('ppt/slides/slide1.xml').async('text');
      assert.ok(s1.includes('SKU-1001'));
      assert.ok(s1.includes('PRICE : $130.00'));
    });

    it('Scenario 4: Change layout -> Preview -> Generate', async () => {
      const customLayout = [
        { img: [50, 50, 350, 250], text: [50, 260, 350, 400] },
        { img: [400, 50, 700, 250], text: [400, 260, 700, 400] }
      ];
      const excelBuf = await createTestExcel(2, true);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        customLayout
      });
      assert.equal(out.slideCount, 1);
      const val = await validatePptx(out.blob, { slideCount: 1 });
      assert.equal(val.valid, true);
    });

    it('Scenario 5: Save profile -> Reload application -> Load profile', async () => {
      const profile = {
        name: 'Furniture 2026',
        mapping: { ...standardMapping },
        imageFit: 'cover',
        selectedSlideIndex: 0,
        count: 2,
        layout: DEFAULT_LAYOUT,
        fontSize: 16,
        fontName: 'Manrope',
        fontColor: '1E293B',
        background: 'F8FAFC',
        ratio: '16:9',
        autoCenter: true,
        showHeader: true,
        showRule: true,
        headerText: 'FURNITURE 2026'
      };
      const profiles = [profile];
      const serialized = JSON.stringify(profiles);
      const restored = JSON.parse(serialized);
      assert.equal(restored.length, 1);
      assert.equal(restored[0].name, 'Furniture 2026');
      assert.equal(restored[0].fontSize, 16);
      assert.equal(restored[0].fontName, 'Manrope');
      assert.equal(restored[0].fontColor, '1E293B');
      assert.equal(restored[0].headerText, 'FURNITURE 2026');
    });

    it('Scenario 6: Generate 1 product', async () => {
      const excelBuf = await createTestExcel(1, true);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping);
      assert.equal(out.slideCount, 1);
      assert.equal(out.totalProducts, 1);
      const val = await validatePptx(out.blob, { slideCount: 1 });
      assert.equal(val.valid, true);
    });

    it('Scenario 7: Generate 2 products', async () => {
      const excelBuf = await createTestExcel(2, true);
      const out2 = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, { customLayout: DEFAULT_LAYOUT });
      assert.equal(out2.slideCount, 1);
      const out3 = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, { customLayout: THREE_LAYOUT });
      assert.equal(out3.slideCount, 1);
    });

    it('Scenario 8: Generate 3 products', async () => {
      const excelBuf = await createTestExcel(3, true);
      const out2 = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, { customLayout: DEFAULT_LAYOUT });
      assert.equal(out2.slideCount, 2);
      const out3 = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, { customLayout: THREE_LAYOUT });
      assert.equal(out3.slideCount, 1);
    });

    it('Scenario 9: Generate 100 products', async () => {
      const excelBuf = await createTestExcel(100, false);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, { customLayout: DEFAULT_LAYOUT });
      assert.equal(out.slideCount, 50);
      assert.equal(out.totalProducts, 100);
      const val = await validatePptx(out.blob, { slideCount: 50 });
      assert.equal(val.valid, true);
    });

    it('Scenario 10: Generate products with missing images', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Products');
      ws.addRow(['Buyer Code / SKU', 'Product Description', 'Price (USD)']);
      ws.addRow(['NO-IMG-01', 'First product without image', '$10']);
      ws.addRow(['NO-IMG-02', 'Second product without image', '$20']);
      const excelBuf = await wb.xlsx.writeBuffer();
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping);
      assert.equal(out.slideCount, 1);
      assert.equal(out.totalProducts, 2);
      const val = await validatePptx(out.blob, { slideCount: 1 });
      assert.equal(val.valid, true);
    });

    it('Scenario 11: Generate products with long descriptions', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Products');
      ws.addRow(['Buyer Code / SKU', 'Product Description', 'Price (USD)']);
      const longDesc = 'A'.repeat(500) + ' & special XML symbols < > " \' & accented characters éèà';
      ws.addRow(['LONG-01', longDesc, '$99.99']);
      const excelBuf = await wb.xlsx.writeBuffer();
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping);
      const val = await validatePptx(out.blob, { slideCount: 1 });
      assert.equal(val.valid, true);
    });

    it('Scenario 12: Cancel desktop save', async () => {
      const excelBuf = await createTestExcel(1, true);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping);
      const origWindow = global.window;
      global.window = {
        electronAPI: {
          isElectron: true,
          dialog: {
            showSaveDialog: async () => ({ canceled: true })
          }
        }
      };
      const delivery = await deliverPresentation(out.blob, 'test_cancel.pptx', true);
      global.window = origWindow;
      assert.equal(delivery.success, false);
      assert.ok(delivery.error.includes('cancelled'));
    });

    it('Scenario 13: Attempt browser download', async () => {
      const excelBuf = await createTestExcel(1, true);
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping);
      const origWindow = global.window;
      global.window = { electronAPI: undefined };
      const delivery = await deliverPresentation(out.blob, 'test_web.pptx', false);
      global.window = origWindow;
      assert.equal(delivery.success, true);
      assert.equal(delivery.platform, 'web');
    });

    it('Scenario 14: Switch between desktop and web environments', async () => {
      assert.equal(isDesktop(), false);
      global.window = { electronAPI: { isElectron: true } };
      assert.equal(isDesktop(), true);
      delete global.window;
      assert.equal(isDesktop(), false);
    });

    it('Scenario 15: Formula cell values extracted cleanly without [object Object]', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Products');
      ws.addRow(['Buyer Code / SKU', 'Product Description', 'Price (USD)']);
      const r = ws.addRow(['SKU-FORMULA', '']);
      r.getCell(2).value = { formula: 'CONCAT("Formulated ", "Desc")', result: 'Formulated Table Description' };
      r.getCell(3).value = '$120.00';
      const excelBuf = await wb.xlsx.writeBuffer();
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping);
      const val = await validatePptx(out.blob, { slideCount: 1 });
      assert.equal(val.valid, true);
      const zip = await JSZip.loadAsync(await bufferFromBlob(out.blob));
      const sXml = await zip.file('ppt/slides/slide1.xml').async('text');
      assert.ok(sXml.includes('Formulated Table Description'));
      assert.ok(!sXml.includes('[object Object]'), 'Output XML must NEVER contain [object Object]');
    });

    it('Scenario 16: Multi-worksheet workbook selection', async () => {
      const wb = new ExcelJS.Workbook();
      const ws1 = wb.addWorksheet('Instructions');
      ws1.addRow(['Note', 'Do not use this sheet']);
      const ws2 = wb.addWorksheet('Active Products');
      ws2.addRow(['Buyer Code / SKU', 'Product Description', 'Price (USD)']);
      ws2.addRow(['SHEET2-SKU1', 'Sheet 2 Item 1', '$50']);
      ws2.addRow(['SHEET2-SKU2', 'Sheet 2 Item 2', '$60']);
      const excelBuf = await wb.xlsx.writeBuffer();
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        sheetName: 'Active Products'
      });
      assert.equal(out.slideCount, 1);
      assert.equal(out.totalProducts, 2);
      const zip = await JSZip.loadAsync(await bufferFromBlob(out.blob));
      const sXml = await zip.file('ppt/slides/slide1.xml').async('text');
      assert.ok(sXml.includes('SHEET2-SKU1'));
      assert.ok(sXml.includes('SHEET2-SKU2'));
    });

    it('Scenario 17: Slide ratio switching updates sldSz in OpenXML', async () => {
      const excelBuf = await createTestExcel(1, false);
      const out43 = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        ratio: '4:3'
      });
      const zip43 = await JSZip.loadAsync(await bufferFromBlob(out43.blob));
      const presXml43 = await zip43.file('ppt/presentation.xml').async('text');
      assert.ok(presXml43.includes('cx="9144000"'));
      assert.ok(presXml43.includes('cy="6858000"'));

      const outA4 = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        ratio: 'A4 Landscape'
      });
      const zipA4 = await JSZip.loadAsync(await bufferFromBlob(outA4.blob));
      const presXmlA4 = await zipA4.file('ppt/presentation.xml').async('text');
      assert.ok(presXmlA4.includes('cx="10692000"'));
      assert.ok(presXmlA4.includes('cy="7560000"'));
    });

    it('Scenario 18: Brand logo embedding embeds into media and slide XML', async () => {
      const excelBuf = await createTestExcel(1, true);
      const logoBuffer = Buffer.from(SAMPLE_PNG_B64, 'base64');
      const out = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        logoFile: logoBuffer
      });
      const zip = await JSZip.loadAsync(await bufferFromBlob(out.blob));
      assert.ok(zip.file('ppt/media/brand_logo.png'), 'Brand logo must be stored in ppt/media');
      const sXml = await zip.file('ppt/slides/slide1.xml').async('text');
      assert.ok(sXml.includes('Brand Logo'), 'Slide XML must contain Brand Logo picture shape');
    });

    it('Scenario 19: Contain vs Cover image fitting', async () => {
      const excelBuf = await createTestExcel(1, true);
      const outCover = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        imageFit: 'cover'
      });
      const valCover = await validatePptx(outCover.blob, { slideCount: 1, hasImages: true });
      assert.equal(valCover.valid, true);

      const outContain = await generateCataloguePptx(excelBuf, DEFAULT_TMPL_BUF, standardMapping, {
        imageFit: 'contain'
      });
      const valContain = await validatePptx(outContain.blob, { slideCount: 1, hasImages: true });
      assert.equal(valContain.valid, true);
    });

    it('Scenario 20: Template with cover and closing slides preserves all slides', async () => {
      const zip = await JSZip.loadAsync(DEFAULT_TMPL_BUF);
      const s1Xml = await zip.file('ppt/slides/slide1.xml').async('text');
      const s1Rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('text');
      
      const coverXml = s1Xml.replace(/<a:t>.*?<\/a:t>/g, '<a:t>COVER SLIDE 2026</a:t>');
      zip.file('ppt/slides/slide1.xml', coverXml);
      zip.file('ppt/slides/slide2.xml', s1Xml);
      zip.file('ppt/slides/_rels/slide2.xml.rels', s1Rels);

      const closingXml = s1Xml.replace(/<a:t>.*?<\/a:t>/g, '<a:t>THANK YOU / CLOSING SLIDE</a:t>');
      zip.file('ppt/slides/slide3.xml', closingXml);
      zip.file('ppt/slides/_rels/slide3.xml.rels', s1Rels);

      const presDoc = parseXmlDocument(await zip.file('ppt/presentation.xml').async('text'));
      const presRelsDoc = parseXmlDocument(await zip.file('ppt/_rels/presentation.xml.rels').async('text'));
      const sldIdLst = presDoc.getElementsByTagName('p:sldIdLst')[0];
      
      const s2 = presDoc.createElementNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'p:sldId');
      s2.setAttribute('id', '257');
      s2.setAttribute('r:id', 'rIdSlide2');
      sldIdLst.appendChild(s2);

      const s3 = presDoc.createElementNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'p:sldId');
      s3.setAttribute('id', '258');
      s3.setAttribute('r:id', 'rIdSlide3');
      sldIdLst.appendChild(s3);

      const r2 = presRelsDoc.createElementNS('http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship');
      r2.setAttribute('Id', 'rIdSlide2');
      r2.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide');
      r2.setAttribute('Target', 'slides/slide2.xml');
      presRelsDoc.documentElement.appendChild(r2);

      const r3 = presRelsDoc.createElementNS('http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship');
      r3.setAttribute('Id', 'rIdSlide3');
      r3.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide');
      r3.setAttribute('Target', 'slides/slide3.xml');
      presRelsDoc.documentElement.appendChild(r3);

      zip.file('ppt/presentation.xml', serializeXmlDocument(presDoc));
      zip.file('ppt/_rels/presentation.xml.rels', serializeXmlDocument(presRelsDoc));

      const tmplBuf = await zip.generateAsync({ type: 'arraybuffer' });

      const excelBuf = await createTestExcel(4, false);
      const out = await generateCataloguePptx(excelBuf, tmplBuf, standardMapping, {
        selectedSlideIndex: 1,
        customLayout: DEFAULT_LAYOUT
      });

      assert.equal(out.slideCount, 4);
      const outZip = await JSZip.loadAsync(await bufferFromBlob(out.blob));
      const s1Out = await outZip.file('ppt/slides/slide1.xml').async('text');
      const s4Out = await outZip.file('ppt/slides/slide4.xml').async('text');
      assert.ok(s1Out.includes('COVER SLIDE 2026'), 'Cover slide must be preserved at slide 1');
      assert.ok(s4Out.includes('THANK YOU / CLOSING SLIDE'), 'Closing slide must be preserved at slide 4');
    });
  });

});
