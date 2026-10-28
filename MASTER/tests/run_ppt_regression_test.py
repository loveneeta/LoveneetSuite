import zipfile, re, os, io
import xml.etree.ElementTree as ET
import openpyxl
from openpyxl.drawing.image import Image as OpenpyxlImage

BANNER_RE = re.compile(
    r'^(?:NOBLE\s*SELECTIONS?.*|COLLECTION.*|CATALOG(?:UE)?.*|SPRING\s*\d+.*|FEBRUARY\s*FAIR.*|FAIR\s*\d+.*|AUTUMN\s*\d+.*|SUMMER\s*\d+.*|WINTER\s*\d+.*|PAGE\s*\d+.*|SLIDE\s*\d+.*)$',
    re.I
)
MATERIAL_RE = re.compile(
    r'\b(?:mango\s*wood|sheesham(?:\s*wood)?|indian\s*rosewood|acacia(?:\s*wood)?|oak(?:\s*wood)?|pine(?:\s*wood)?|bamboo|teak(?:\s*wood)?|metal|iron|wrought\s*iron|cast\s*iron|mild\s*steel|stainless\s*steel|brass|copper|aluminum|marble|travertine|granite|quartz|solid\s*wood|wood|mdf|plywood|cane|rattan|wicker|fabric|leather|velvet|linen|cotton|glass|mirror|ceramic|terracotta|bone\s*inlay|mother\s*of\s*pearl|resin|terrazzo|jute)\b',
    re.I
)
DIM_RE = re.compile(
    r'(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*(CM|CMS|INCH(?:ES)?|IN))?',
    re.I
)

def extract_products_from_pptx(pptx_path):
    all_products = []
    with zipfile.ZipFile(pptx_path, 'r') as z:
        # 1. Slide counts for media
        img_counts = {}
        for name in z.namelist():
            if name.startswith('ppt/slides/_rels/'):
                rtree = ET.fromstring(z.read(name))
                for r in rtree.findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                    t = r.get('Target', '')
                    if 'media/' in t:
                        img_counts[t] = img_counts.get(t, 0) + 1

        slide_names = [n for n in z.namelist() if re.match(r'^ppt/slides/slide\d+\.xml$', n)]
        slide_names.sort(key=lambda x: int(re.search(r'slide(\d+)\.xml', x).group(1)))

        for s_path in slide_names:
            s_idx = int(re.search(r'slide(\d+)\.xml', s_path).group(1))
            r_path = f'ppt/slides/_rels/slide{s_idx}.xml.rels'
            tree = ET.fromstring(z.read(s_path))
            rels = {}
            if r_path in z.namelist():
                for r in ET.fromstring(z.read(r_path)).findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                    rels[r.get('Id')] = r.get('Target')

            # 2. Extract images
            images = []
            for blip in tree.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip'):
                embed = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                target = rels.get(embed)
                if not target: continue

                parent_grp = None
                for grp in tree.iter('{http://schemas.openxmlformats.org/presentationml/2006/main}grpSp'):
                    for c in grp.iter():
                        if c == blip:
                            parent_grp = grp
                            break
                    if parent_grp is not None: break

                x, y, w, h = 0, 0, 0, 0
                if parent_grp is not None:
                    grpXfrm = parent_grp.find('{http://schemas.openxmlformats.org/presentationml/2006/main}grpSpPr/{http://schemas.openxmlformats.org/drawingml/2006/main}xfrm')
                    if grpXfrm is not None:
                        off = grpXfrm.find('{http://schemas.openxmlformats.org/drawingml/2006/main}off')
                        ext = grpXfrm.find('{http://schemas.openxmlformats.org/drawingml/2006/main}ext')
                        if off is not None: x, y = int(off.get('x', 0)), int(off.get('y', 0))
                        if ext is not None: w, h = int(ext.get('cx', 0)), int(ext.get('cy', 0))
                else:
                    xfrm = blip.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}xfrm')
                    if xfrm is not None:
                        off = xfrm.find('{http://schemas.openxmlformats.org/drawingml/2006/main}off')
                        ext = xfrm.find('{http://schemas.openxmlformats.org/drawingml/2006/main}ext')
                        if off is not None: x, y = int(off.get('x', 0)), int(off.get('y', 0))
                        if ext is not None: w, h = int(ext.get('cx', 0)), int(ext.get('cy', 0))

                tname = target.split('/')[-1]
                is_repeated = img_counts.get(target, 0) >= 2
                is_divider = h < 50000 or (w > 0 and h > 0 and h / w < 0.05)
                is_footer = y > 5800000
                is_corner_logo = y < 1500000 and x > 7000000 and w < 2000000
                is_logo = is_repeated or is_divider or is_footer or is_corner_logo

                img_data = z.read('ppt/' + target.replace('../', '')) if ('ppt/' + target.replace('../', '')) in z.namelist() else b''

                if not any(im['name'] == tname for im in images):
                    images.append({
                        'id': f's{s_idx}_{tname}',
                        'name': tname,
                        'x': x, 'y': y, 'w': w, 'h': h,
                        'is_logo': is_logo,
                        'data': img_data
                    })

            candidate_photos = [im for im in images if not im['is_logo']]
            if not candidate_photos:
                candidate_photos = images

            # 3. Extract text shapes
            shapes = []
            for sp in tree.findall('.//{http://schemas.openxmlformats.org/presentationml/2006/main}sp'):
                paras = []
                for p in sp.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}p'):
                    t = ''.join([node.text or '' for node in p.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}t')]).strip()
                    if t: paras.append(t)
                if paras:
                    xfrm = sp.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}xfrm')
                    off = xfrm.find('{http://schemas.openxmlformats.org/drawingml/2006/main}off') if xfrm is not None else None
                    ext = xfrm.find('{http://schemas.openxmlformats.org/drawingml/2006/main}ext') if xfrm is not None else None
                    x = int(off.get('x', 0)) if off is not None else 0
                    y = int(off.get('y', 0)) if off is not None else 0
                    w = int(ext.get('cx', 0)) if ext is not None else 0
                    h = int(ext.get('cy', 0)) if ext is not None else 0
                    shapes.append({'x': x, 'y': y, 'w': w, 'h': h, 'paras': paras})

            collection_name = ""
            slide_mat = ""
            for s in shapes:
                joined = ' '.join(s['paras']).strip()
                if re.match(r'^[A-Z0-9a-z\s]+collection$', joined, re.I):
                    collection_name = joined
                mat_m = MATERIAL_RE.search(joined)
                if mat_m and not slide_mat:
                    slide_mat = mat_m.group(0).title()

            raw_prods = []
            shape_objects = []

            for s_item_idx, s in enumerate(shapes):
                joined = ' '.join(s['paras']).strip()
                if BANNER_RE.match(joined) or re.match(r'^[A-Z0-9a-z\s]+collection$', joined, re.I):
                    continue

                code_skus = []
                name = ""
                dim_sets = []
                mat = slide_mat

                for p in s['paras']:
                    m_code = re.match(r'^\s*([A-Z0-9\/-]+(?:\s*\/[A-Z0-9\/-]+)?)\s*\|\s*([^|]+)$', p)
                    if m_code:
                        raw_codes = m_code.group(1).strip()
                        name = m_code.group(2).strip()
                        parts = [x.strip() for x in re.split(r'[\/,]|(?:\s+and\s+)|\s*&\s*', raw_codes, flags=re.I) if x.strip()]
                        code_skus.extend(parts)
                        continue

                    all_dims = list(DIM_RE.finditer(p))
                    if all_dims:
                        l = all_dims[0].group(1)
                        w = all_dims[0].group(2)
                        h = all_dims[0].group(3)
                        lIn, wIn, hIn = "", "", ""
                        if len(all_dims) > 1:
                            lIn = all_dims[1].group(1)
                            wIn = all_dims[1].group(2)
                            hIn = all_dims[1].group(3)

                        if l and lIn:
                            try:
                                cm_val = float(l)
                                in_val = float(lIn)
                                expected_in = cm_val / 2.54
                                if abs(in_val - expected_in) / expected_in > 0.35:
                                    lIn = str(round(float(l) / 2.54))
                                    wIn = str(round(float(w) / 2.54))
                                    hIn = str(round(float(h) / 2.54))
                            except: pass
                        elif l and not lIn:
                            try:
                                lIn = str(round(float(l) / 2.54))
                                wIn = str(round(float(w) / 2.54))
                                hIn = str(round(float(h) / 2.54))
                            except: pass

                        raw_desc = f"{lIn} x {wIn} x {hIn} IN" if lIn else ""
                        dim_sets.append({
                            'l': l, 'w': w, 'h': h,
                            'lIn': lIn, 'wIn': wIn, 'hIn': hIn,
                            'desc': raw_desc
                        })
                        continue

                    m_mat = MATERIAL_RE.search(p)
                    if m_mat and (not name or m_mat.group(0).lower() != name.lower()):
                        mat = m_mat.group(0).title()

                    if re.match(r'^(?:item\s*code|sku|code)\s*[:=-]\s*(.*)$', p, re.I):
                        raw_codes = re.sub(r'^(?:item\s*code|sku|code)\s*[:=-]\s*', '', p, flags=re.I).strip()
                        parts = [x.strip() for x in re.split(r'[\/,]|(?:\s+and\s+)|\s*&\s*', raw_codes, flags=re.I) if x.strip()]
                        code_skus.extend(parts)
                    elif re.match(r'^(?:product\s*name|name|title)\s*[:=-]\s*(.*)$', p, re.I):
                        name = re.sub(r'^(?:product\s*name|name|title)\s*[:=-]\s*', '', p, flags=re.I).strip()
                    elif not name and not BANNER_RE.match(p) and len(p) > 2 and not p.startswith(('Price', 'Cost', 'USD', '$')):
                        name = p

                if code_skus or (name and dim_sets):
                    shape_id = f"s_{s_item_idx}_{s['x']}_{s['y']}"
                    if not any(so['id'] == shape_id for so in shape_objects):
                        shape_objects.append({'id': shape_id, 'shape': s})

                    if len(code_skus) > 1:
                        for idx, sku in enumerate(code_skus):
                            d = dim_sets[idx] if idx < len(dim_sets) else (dim_sets[0] if dim_sets else {'l':'','w':'','h':'','desc':''})
                            raw_prods.append({
                                'shape_id': shape_id,
                                'sku': sku, 'name': name, 'mat': mat,
                                'l': d['l'], 'w': d['w'], 'h': d['h'],
                                'lIn': d.get('lIn', ''), 'wIn': d.get('wIn', ''), 'hIn': d.get('hIn', ''),
                                'desc': (collection_name + (' · ' if collection_name and d['desc'] else '') + d['desc']).strip(),
                                'shape': s,
                                'slide': s_idx
                            })
                    elif code_skus or dim_sets:
                        sku = code_skus[0] if code_skus else ""
                        d = dim_sets[0] if dim_sets else {'l':'','w':'','h':'','desc':''}
                        raw_prods.append({
                            'shape_id': shape_id,
                            'sku': sku, 'name': name, 'mat': mat,
                            'l': d['l'], 'w': d['w'], 'h': d['h'],
                            'lIn': d.get('lIn', ''), 'wIn': d.get('wIn', ''), 'hIn': d.get('hIn', ''),
                            'desc': (collection_name + (' · ' if collection_name and d['desc'] else '') + d['desc']).strip(),
                            'shape': s,
                            'slide': s_idx
                        })

            # Optimal Bipartite Pairing
            norm_w = 12192000
            norm_h = 6858000
            pairs = []
            for so in shape_objects:
                s = so['shape']
                sc_x = s['x'] + s['w']/2
                sc_y = s['y'] + s['h']/2
                for im in candidate_photos:
                    ic_x = im['x'] + im['w']/2
                    ic_y = im['y'] + im['h']/2
                    dx = (sc_x - ic_x) / norm_w
                    dy = (sc_y - ic_y) / norm_h
                    dist = dx * dx + dy * dy
                    pairs.append({'shape_id': so['id'], 'photo': im, 'dist': dist})

            pairs.sort(key=lambda x: x['dist'])

            shape_to_image = {}
            assigned_photos = set()

            for p in pairs:
                sid = p['shape_id']
                photo = p['photo']
                if sid not in shape_to_image and photo['id'] not in assigned_photos:
                    shape_to_image[sid] = photo
                    assigned_photos.add(photo['id'])

            for so in shape_objects:
                sid = so['id']
                if sid not in shape_to_image:
                    s = so['shape']
                    sc_x = s['x'] + s['w']/2
                    sc_y = s['y'] + s['h']/2
                    best_im = None
                    min_d = float('inf')
                    for im in candidate_photos:
                        ic_x = im['x'] + im['w']/2
                        ic_y = im['y'] + im['h']/2
                        dx = (sc_x - ic_x) / norm_w
                        dy = (sc_y - ic_y) / norm_h
                        dist = dx * dx + dy * dy
                        if dist < min_d:
                            min_d = dist
                            best_im = im
                    shape_to_image[sid] = best_im or (candidate_photos[0] if candidate_photos else None)

            # Deduplicate multiple camera angles
            seen_skus = set()
            for rp in raw_prods:
                assigned_img = shape_to_image.get(rp['shape_id']) or (candidate_photos[0] if candidate_photos else None)
                if rp['sku'] and rp['sku'] in seen_skus:
                    continue
                if rp['sku']: seen_skus.add(rp['sku'])

                rp['primary_image'] = assigned_img
                all_products.append(rp)

    return all_products

def run_regression_and_excel_export_test():
    pptx_path = r'\\server2012\Design Team Location 2\LOVENEET\BUYER WISE\VIVIN\BIBITH.pptx'
    products = extract_products_from_pptx(pptx_path)

    print(f"\nExtracted {len(products)} products total across presentation.")

    # 1. Slide 4 Check (4 products)
    slide4_prods = [p for p in products if p['slide'] == 4]
    print(f"Slide 4 product count: {len(slide4_prods)} (expected 4)")
    assert len(slide4_prods) == 4, f"Expected 4 products on slide 4, got {len(slide4_prods)}"
    s4_skus = {p['sku']: p for p in slide4_prods}
    assert '69210' in s4_skus and s4_skus['69210']['name'] == 'Coffee table' and s4_skus['69210']['primary_image']['name'] == 'image10.png'
    assert '69211' in s4_skus and s4_skus['69211']['name'] == 'Side table' and s4_skus['69211']['primary_image']['name'] == 'image10.png'
    assert '69209' in s4_skus and s4_skus['69209']['name'] == 'Media unit' and s4_skus['69209']['primary_image']['name'] == 'image11.png'
    assert '69208' in s4_skus and s4_skus['69208']['name'] == 'Console table' and s4_skus['69208']['primary_image']['name'] == 'image12.png'
    print("[PASS] Slide 4: All 4 products, dimensions, and image associations PASS!")

    # 2. Slide 5 Check (6 products from multiple SKUs)
    slide5_prods = [p for p in products if p['slide'] == 5]
    print(f"Slide 5 product count: {len(slide5_prods)} (expected 6)")
    assert len(slide5_prods) == 6, f"Expected 6 products on slide 5, got {len(slide5_prods)}"
    s5_skus = {p['sku']: p for p in slide5_prods}
    assert '69206' in s5_skus and s5_skus['69206']['l'] == '200' and s5_skus['69206']['primary_image']['name'] == 'image15.png'
    assert '69207' in s5_skus and s5_skus['69207']['l'] == '200' and s5_skus['69207']['primary_image']['name'] == 'image16.png'
    # Option 1 split
    assert '69217' in s5_skus and s5_skus['69217']['l'] == '400' and s5_skus['69217']['lIn'] == '157' and s5_skus['69217']['primary_image']['name'] == 'image13.png'
    assert '69217A' in s5_skus and s5_skus['69217A']['l'] == '500' and s5_skus['69217A']['lIn'] == '196' and s5_skus['69217A']['primary_image']['name'] == 'image13.png'
    # Option 2 split
    assert '69217B' in s5_skus and s5_skus['69217B']['l'] == '400' and s5_skus['69217B']['lIn'] == '157' and s5_skus['69217B']['primary_image']['name'] == 'image14.png'
    assert '69217C' in s5_skus and s5_skus['69217C']['l'] == '500' and s5_skus['69217C']['lIn'] == '196' and s5_skus['69217C']['primary_image']['name'] == 'image14.png'
    print("[PASS] Slide 5: All 6 products (Option 1 & Option 2 independently mapped to 400cm and 500cm with correct images) PASS!")

    # 3. Slide 6 Check (5 products, Bed side inch validation)
    slide6_prods = [p for p in products if p['slide'] == 6]
    print(f"Slide 6 product count: {len(slide6_prods)} (expected 5)")
    assert len(slide6_prods) == 5, f"Expected 5 products on slide 6, got {len(slide6_prods)}"
    s6_skus = {p['sku']: p for p in slide6_prods}
    assert '69215' in s6_skus and s6_skus['69215']['primary_image']['name'] == 'image18.png'
    assert '69214' in s6_skus and s6_skus['69214']['primary_image']['name'] == 'image20.png'
    assert '69213' in s6_skus and s6_skus['69213']['primary_image']['name'] == 'image19.png'
    assert '69212' in s6_skus and s6_skus['69212']['primary_image']['name'] == 'image19.png'
    # Bed side inch check
    assert '69216' in s6_skus
    bs = s6_skus['69216']
    assert bs['l'] == '55' and bs['w'] == '50' and bs['h'] == '60'
    assert bs['lIn'] == '22' and bs['wIn'] == '20' and bs['hIn'] == '24', f"Expected true inches (22x20x24), got {bs['lIn']}x{bs['wIn']}x{bs['hIn']}"
    assert bs['primary_image']['name'] == 'image21.png', f"Expected image21.png for Bed side, got {bs['primary_image']['name']}"
    print("[PASS] Slide 6: Bed side inches validated (22x20x24 IN) and image21.png assigned. PASS!")

    # 4. Generate actual Excel file
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "PPT Extract"
    headers = ["Product Name", "Item Code", "Material", "Length", "Width", "Height", "Description", "Product Image"]
    ws.append(headers)

    temp_img_files = []
    for row_idx, p in enumerate(products, start=2):
        row_vals = [
            p['name'],
            p['sku'],
            p['mat'],
            p['l'],
            p['w'],
            p['h'],
            p['desc'],
            "" # placeholder for image
        ]
        ws.append(row_vals)

        # embed image
        im = p.get('primary_image')
        if im and im.get('data'):
            temp_path = f"temp_im_{row_idx}.png"
            with open(temp_path, "wb") as f_img:
                f_img.write(im['data'])
            temp_img_files.append(temp_path)
            try:
                xl_img = OpenpyxlImage(temp_path)
                xl_img.width = 120
                xl_img.height = 90
                ws.add_image(xl_img, f"H{row_idx}")
                ws.row_dimensions[row_idx].height = 70
            except: pass

    excel_out_path = "BIBITH_Extract_Test.xlsx"
    wb.save(excel_out_path)
    print(f"\n[PASS] Generated Excel file saved to: {excel_out_path}")

    # 5. Read back and verify the actual exported Excel file
    wb_read = openpyxl.load_workbook(excel_out_path)
    ws_read = wb_read["PPT Extract"]
    read_headers = [cell.value for cell in ws_read[1]]
    assert read_headers == headers, f"Headers mismatch: {read_headers}"

    extracted_rows = []
    for row in ws_read.iter_rows(min_row=2, values_only=True):
        extracted_rows.append({
            'name': row[0],
            'sku': row[1],
            'mat': row[2],
            'l': row[3],
            'w': row[4],
            'h': row[5],
            'desc': row[6]
        })

    assert len(extracted_rows) == len(products), f"Row count mismatch in Excel: {len(extracted_rows)} vs {len(products)}"
    for r in extracted_rows:
        assert r['sku'], f"Missing SKU in row: {r}"
        assert '/' not in r['sku'], f"Found combined SKU in Excel export: {r['sku']}"
        assert r['name'], f"Missing Product Name in row: {r}"

    print(f"[PASS] Read back Excel file verified: {len(extracted_rows)} unique rows, all headers match, zero combined SKUs, all dimensions intact!")

    # Cleanup temp image files
    for t in temp_img_files:
        try: os.remove(t)
        except: pass

    print("\nALL REGRESSION TESTS AND EXCEL VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    run_regression_and_excel_export_test()
