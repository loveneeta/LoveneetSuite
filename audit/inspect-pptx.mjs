/**
 * Loveneet Suite — Comprehensive PPTX Audit & Inspection Tool
 * Phase 3 Audit: Deep OpenXML Structural, XML Well-Formedness, Relationship & Byte Inspection.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import JSZip from '../MASTER/webapp/frontend/node_modules/jszip/dist/jszip.min.js';

const auditDir = path.resolve('audit');
const failingPath = path.join(auditDir, 'failing.pptx');
const templatePath = path.join(auditDir, 'template.pptx');

if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });

// Ensure failing.pptx exists
if (!fs.existsSync(failingPath)) {
  const srcFailing = 'C:/Users/Machine28/Downloads/1PULI_catalogue.pptx';
  if (fs.existsSync(srcFailing)) {
    fs.copyFileSync(srcFailing, failingPath);
  }
}

// Ensure template.pptx exists
if (!fs.existsSync(templatePath)) {
  const src = fs.readFileSync('MASTER/webapp/frontend/src/defaultPptTemplate.ts', 'utf8');
  const match = src.match(/DEFAULT_PPT_TEMPLATE_B64\s*=\s*"([^"]+)"/);
  if (match) {
    fs.writeFileSync(templatePath, Buffer.from(match[1], 'base64'));
  }
}

async function auditPackage(filePath, label) {
  const buf = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const zip = await JSZip.loadAsync(buf);
  const fileKeys = Object.keys(zip.files);

  const defects = [];
  const warnings = [];

  // 1. Duplicate ZIP entries / casing clashes
  const seenLower = new Map();
  for (const k of fileKeys) {
    const lk = k.toLowerCase();
    if (seenLower.has(lk)) {
      defects.push({
        part: k,
        defect: `Duplicate ZIP entry (case clash): "${k}" and "${seenLower.get(lk)}"`
      });
    }
    seenLower.set(lk, k);
  }

  // 2. Mandatory parts
  const requiredParts = [
    '[Content_Types].xml',
    '_rels/.rels',
    'ppt/presentation.xml',
    'ppt/_rels/presentation.xml.rels'
  ];
  for (const req of requiredParts) {
    if (!zip.file(req)) {
      defects.push({ part: req, defect: `Missing mandatory OpenXML part` });
    }
  }

  // 3. [Content_Types].xml syntax and content
  const ctFile = zip.file('[Content_Types].xml');
  let ctXml = '';
  if (ctFile) {
    ctXml = await ctFile.async('text');

    // XML well-formedness: check for unescaped / orphan text outside XML tags
    const orphanTextMatch = ctXml.match(/>([^<]+)</g);
    if (orphanTextMatch) {
      for (const m of orphanTextMatch) {
        const textInside = m.slice(1, -1).trim();
        if (textInside.length > 0) {
          defects.push({
            part: '[Content_Types].xml',
            defect: `XML SYNTAX CORRUPTION: Stray raw text outside tags: "${textInside}"`
          });
        }
      }
    }

    // Check for malformed tags
    if (ctXml.includes('xmlns="http://schemas.openxmlformats.org/package/2006/content-types">xmlns=')) {
      defects.push({
        part: '[Content_Types].xml',
        defect: `XML SYNTAX CORRUPTION: Multiple concatenated xmlns attributes from flawed string replace`
      });
    }

    // Check defaults
    const defaults = [...ctXml.matchAll(/<Default\s+Extension="([^"]+)"\s+ContentType="([^"]+)"/gi)]
      .map(m => ({ ext: m[1].toLowerCase(), ct: m[2] }));
    const defaultExts = new Set(defaults.map(d => d.ext));

    // Check overrides
    const overrides = [...ctXml.matchAll(/<Override\s+PartName="([^"]+)"\s+ContentType="([^"]+)"/gi)]
      .map(m => ({ part: m[1].toLowerCase(), ct: m[2] }));
    const overrideParts = new Set(overrides.map(o => o.part));

    // Verify slide overrides
    const slideFiles = fileKeys.filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k));
    for (const sf of slideFiles) {
      const partName = `/${sf.toLowerCase()}`;
      if (!overrideParts.has(partName)) {
        defects.push({
          part: '[Content_Types].xml',
          defect: `Missing <Override> for slide part "${sf}"`
        });
      }
    }

    // Verify media files
    const mediaFiles = fileKeys.filter(k => /^ppt\/media\//i.test(k) && !k.endsWith('/'));
    for (const mf of mediaFiles) {
      const ext = path.extname(mf).replace('.', '').toLowerCase();
      if (!defaultExts.has(ext) && !overrideParts.has(`/${mf.toLowerCase()}`)) {
        defects.push({
          part: '[Content_Types].xml',
          defect: `Missing MIME declaration for media file "${mf}" (.${ext})`
        });
      }
    }
  }

  // 4. ppt/presentation.xml and its relationships
  const presFile = zip.file('ppt/presentation.xml');
  const presRelsFile = zip.file('ppt/_rels/presentation.xml.rels');
  const presRelMap = new Map();

  if (presRelsFile) {
    const text = await presRelsFile.async('text');
    for (const m of text.matchAll(/<Relationship\s+Id="([^"]+)"\s+Type="([^"]+)"\s+Target="([^"]+)"/g)) {
      presRelMap.set(m[1], { id: m[1], type: m[2], target: m[3] });
    }
  }

  if (presFile) {
    const text = await presFile.async('text');
    const sldIds = [...text.matchAll(/<p:sldId\b([^>]*)\/?>/g)];
    const seenIds = new Set();
    const seenRIds = new Set();

    for (const s of sldIds) {
      const idM = s[1].match(/\bid="(\d+)"/);
      const rIdM = s[1].match(/\br:id="([^"]+)"/);

      if (!idM) {
        defects.push({ part: 'ppt/presentation.xml', defect: `Missing 'id' on <p:sldId>` });
      } else {
        const idVal = parseInt(idM[1], 10);
        if (idVal < 256 || idVal >= 2147483648) {
          defects.push({
            part: 'ppt/presentation.xml',
            defect: `ECMA-376 ST_SlideId OUT OF BOUNDS: id="${idVal}" (Must be 256 <= id < 2147483648)`
          });
        }
        if (seenIds.has(idVal)) {
          defects.push({ part: 'ppt/presentation.xml', defect: `Duplicate slide id="${idVal}"` });
        }
        seenIds.add(idVal);
      }

      if (!rIdM) {
        defects.push({ part: 'ppt/presentation.xml', defect: `Missing 'r:id' on <p:sldId>` });
      } else {
        const rIdVal = rIdM[1];
        if (seenRIds.has(rIdVal)) {
          defects.push({ part: 'ppt/presentation.xml', defect: `Duplicate r:id="${rIdVal}" in <p:sldIdLst>` });
        }
        seenRIds.add(rIdVal);

        if (!presRelMap.has(rIdVal)) {
          defects.push({
            part: 'ppt/presentation.xml',
            defect: `Dangling slide relationship: <p:sldId r:id="${rIdVal}"> has no target in presentation.xml.rels`
          });
        } else {
          const target = presRelMap.get(rIdVal).target;
          const targetPath = `ppt/${target.replace(/^\//, '')}`;
          if (!zip.file(targetPath)) {
            defects.push({
              part: 'ppt/presentation.xml',
              defect: `Broken target: relationship ${rIdVal} points to missing file "${targetPath}"`
            });
          }
        }
      }
    }
  }

  // 5. Per-Slide XML & Slide Rels Inspection
  const slideFiles = fileKeys.filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k));
  for (const sf of slideFiles) {
    const sNum = sf.match(/slide(\d+)/i)?.[1];
    const sXml = await zip.file(sf).async('text');
    const sRelsPath = `ppt/slides/_rels/slide${sNum}.xml.rels`;
    const sRelsFile = zip.file(sRelsPath);

    if (!sRelsFile) {
      defects.push({ part: sf, defect: `Missing relationship part: ${sRelsPath}` });
    } else {
      const relsText = await sRelsFile.async('text');
      const slideRelMap = new Map();
      for (const m of relsText.matchAll(/<Relationship\s+Id="([^"]+)"\s+Type="([^"]+)"\s+Target="([^"]+)"/g)) {
        if (slideRelMap.has(m[1])) {
          defects.push({ part: sRelsPath, defect: `Duplicate relationship Id="${m[1]}" in ${sRelsPath}` });
        }
        slideRelMap.set(m[1], { id: m[1], type: m[2], target: m[3] });
      }

      // Check blip embeds
      const blipEmbeds = [...sXml.matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"/g)].map(m => m[1]);
      for (const embed of blipEmbeds) {
        if (!slideRelMap.has(embed)) {
          defects.push({
            part: sf,
            defect: `Dangling image blip: <a:blip r:embed="${embed}"> not in ${sRelsPath}`
          });
        } else {
          const target = slideRelMap.get(embed).target;
          const mediaTarget = `ppt/${target.replace(/^\.\.\//, '')}`;
          if (!zip.file(mediaTarget)) {
            defects.push({
              part: sf,
              defect: `Broken image: ${embed} points to non-existent media file "${mediaTarget}"`
            });
          }
        }
      }
    }

    // Check duplicate shape IDs in slide
    const shapeIds = [...sXml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map(m => m[1]);
    const seenShape = new Set();
    for (const sid of shapeIds) {
      if (seenShape.has(sid)) {
        defects.push({ part: sf, defect: `Duplicate shape id="${sid}" in ${sf}` });
      }
      seenShape.add(sid);
    }

    // Check element order in <p:pic>
    const pics = [...sXml.matchAll(/<p:pic[\s\S]*?<\/p:pic>/g)].map(m => m[0]);
    for (const p of pics) {
      const nv = p.indexOf('<p:nvPicPr>');
      const blip = p.indexOf('<p:blipFill>');
      const sp = p.indexOf('<p:spPr>');
      if (nv === -1 || blip === -1 || sp === -1) {
        defects.push({ part: sf, defect: `Malformed <p:pic>: missing required element` });
      } else if (!(nv < blip && blip < sp)) {
        defects.push({ part: sf, defect: `Invalid child element order in <p:pic>` });
      }
    }
  }

  return {
    filePath,
    label,
    size: buf.length,
    sha256,
    magic: buf.slice(0, 4).toString('hex'),
    partsCount: fileKeys.length,
    fileKeys,
    slideCount: slideFiles.length,
    defects,
    warnings
  };
}

async function main() {
  console.log('========================================================================');
  console.log('PHASE 3 AUDIT REPORT: POWERPOINT PPTX INTEGRITY');
  console.log('========================================================================\n');

  console.log('1. GENERATION TOOLING IDENTIFICATION:');
  console.log('   - Generator Library: JSZip v3.10.2 (low-level OOXML ZIP construction)');
  console.log('   - Excel Reader:      ExcelJS v4.4.0');
  console.log('   - Modification Mode: String regex matching & XML tag manipulation on cloned slide XML parts');
  console.log('   - Serialization:     JSZip.generateAsync({ type: "blob" | "nodebuffer", compression: "DEFLATE" })');
  console.log('   - Desktop Delivery:  Electron IPC fs:writeFile (atomic .tmp write + rename)');
  console.log('   - Web Delivery:      URL.createObjectURL(blob) with application/vnd.openxmlformats-officedocument.presentationml.presentation');

  const tmpl = await auditPackage(templatePath, 'ORIGINAL BASE TEMPLATE');
  const fail = await auditPackage(failingPath, 'BEFORE FIX: FAILING PRESENTATION (1PULI_catalogue.pptx)');
  
  const newOutputPath = path.join(auditDir, 'new_output.pptx');
  let newOutput = null;
  if (fs.existsSync(newOutputPath)) {
    newOutput = await auditPackage(newOutputPath, 'AFTER FIX: REPAIRED GENERATOR OUTPUT (new_output.pptx)');
  }

  console.log('\n========================================================================');
  console.log('2. AUDIT RESULTS: BEFORE vs AFTER FIX');
  console.log('========================================================================');
  console.log(`Template:     ${tmpl.partsCount} parts, ${tmpl.size.toLocaleString()} bytes, Defects: ${tmpl.defects.length}`);
  console.log(`BEFORE Fix:   ${fail.partsCount} parts, ${fail.size.toLocaleString()} bytes, Defects: ${fail.defects.length}`);
  if (newOutput) {
    console.log(`AFTER Fix:    ${newOutput.partsCount} parts, ${newOutput.size.toLocaleString()} bytes, Defects: ${newOutput.defects.length}`);
  }

  if (fail.defects.length > 0) {
    console.log('\nCONFIRMED DEFECT DETAILS IN BEFORE FILE:');
    for (let i = 0; i < fail.defects.length; i++) {
      console.log(`  [Defect ${i + 1}] Part: ${fail.defects[i].part}`);
      console.log(`     Details: ${fail.defects[i].defect}`);
    }
  }

  if (newOutput && newOutput.defects.length === 0) {
    console.log('\n✓ AFTER FIX: ZERO DEFECTS DETECTED IN REPAIRED OUTPUT!');
  }

  // Exact character evidence from [Content_Types].xml
  const failZip = await JSZip.loadAsync(fs.readFileSync(failingPath));
  const failCt = await failZip.file('[Content_Types].xml')?.async('text') || '';
  console.log('\n========================================================================');
  console.log('3. EXACT CHARACTER EVIDENCE IN [Content_Types].xml (BEFORE FIX):');
  console.log('========================================================================');
  console.log('First 350 characters of failing [Content_Types].xml:');
  console.log('------------------------------------------------------------------------');
  console.log(failCt.slice(0, 350));
  console.log('------------------------------------------------------------------------');

  if (newOutput) {
    const newZip = await JSZip.loadAsync(fs.readFileSync(newOutputPath));
    const newCt = await newZip.file('[Content_Types].xml')?.async('text') || '';
    console.log('\nEXACT CHARACTER EVIDENCE IN [Content_Types].xml (AFTER FIX):');
    console.log('------------------------------------------------------------------------');
    console.log(newCt.slice(0, 350));
    console.log('------------------------------------------------------------------------');
  }

  // Verify Real Microsoft PowerPoint COM error
  console.log('\n========================================================================');
  console.log('4. MICROSOFT POWERPOINT COM VERIFICATION (BEFORE vs AFTER)');
  console.log('========================================================================');
  console.log('Testing BEFORE fix (failing.pptx):');
  try {
    const out = execSync(`powershell -ExecutionPolicy Bypass -File MASTER/webapp/frontend/src/__tests__/test_ppt.ps1 "${failingPath}"`, { encoding: 'utf8' });
    console.log(out.trim());
  } catch (e) {
    console.log('PowerPoint COM execution error:', e.message);
  }

  if (newOutput) {
    console.log('\nTesting AFTER fix (new_output.pptx):');
    try {
      const out = execSync(`powershell -ExecutionPolicy Bypass -File MASTER/webapp/frontend/src/__tests__/test_ppt.ps1 "${newOutputPath}"`, { encoding: 'utf8' });
      console.log(out.trim());
    } catch (e) {
      console.log('PowerPoint COM execution error:', e.message);
    }
  }
  console.log('========================================================================');
  try {
    const out = execSync(`powershell -ExecutionPolicy Bypass -File MASTER/webapp/frontend/src/__tests__/test_ppt.ps1 "${failingPath}"`, { encoding: 'utf8' });
    console.log(out.trim());
  } catch (e) {
    console.log('PowerPoint COM execution error:', e.message);
  }
}

main().catch(console.error);
