import sys

# 1. Update style.css
css_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

if '.col-price' not in css:
    css += """
.col-price {
  min-width: 85px !important;
  width: 90px !important;
  text-align: right !important;
}
"""
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(css)
    print("style.css updated with .col-price")

# 2. Update App.tsx
app_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Matrix sorting: add latest_rate
old_mat_sort = """        } else if (k === 'master_cbm') {
          res = parseNumberForSort(a.master_cbm) - parseNumberForSort(b.master_cbm);"""
new_mat_sort = """        } else if (k === 'master_cbm') {
          res = parseNumberForSort(a.master_cbm) - parseNumberForSort(b.master_cbm);
        } else if (k === 'latest_rate' || k === 'unit_price') {
          res = parseNumberForSort(a.latest_rate || a.unit_price) - parseNumberForSort(b.latest_rate || b.unit_price);"""
assert old_mat_sort in content, "old_mat_sort not found"
content = content.replace(old_mat_sort, new_mat_sort, 1)

# Products sorting: add unit_price / latest_rate
old_prod_sort = """        } else if (k === 'master_cbm') {
          res = parseNumberForSort(a.master_cbm) - parseNumberForSort(b.master_cbm);"""
new_prod_sort = """        } else if (k === 'master_cbm') {
          res = parseNumberForSort(a.master_cbm) - parseNumberForSort(b.master_cbm);
        } else if (k === 'unit_price' || k === 'latest_rate') {
          res = parseNumberForSort(a.unit_price || a.latest_rate) - parseNumberForSort(b.unit_price || b.latest_rate);"""
assert old_prod_sort in content, "old_prod_sort not found"
content = content.replace(old_prod_sort, new_prod_sort, 1)

# Matrix table header (Standard table):
old_mat_th = '<SortTh label="CBM" sortKey="master_cbm" currentSort={matrixSort} onSort={handleMatrixSort} className="col-cbm" />'
new_mat_th = '<SortTh label="CBM" sortKey="master_cbm" currentSort={matrixSort} onSort={handleMatrixSort} className="col-cbm" />\n                      <SortTh label="PRICE" sortKey="latest_rate" currentSort={matrixSort} onSort={handleMatrixSort} className="col-price" align="right" />'
content = content.replace(old_mat_th, new_mat_th)

# Matrix table row (Standard table & Fullscreen):
old_mat_td = '<td>{p.master_cbm ? Number(p.master_cbm).toFixed(3) : \'—\'}</td>'
new_mat_td = '<td>{p.master_cbm ? Number(p.master_cbm).toFixed(3) : \'—\'}</td>\n                        <td className="col-price" style={{ textAlign: \'right\', fontWeight: 600, color: \'#047857\' }}>{p.latest_rate ? `${activeCompany?.currency_code || \'$\'} ${Number(p.latest_rate).toFixed(2)}` : \'—\'}</td>'
content = content.replace(old_mat_td, new_mat_td)

# Product Master header:
old_pm_th = '<SortTh label="MASTER CBM" sortKey="master_cbm" currentSort={prodSort} onSort={handleProdSort} />'
new_pm_th = '<SortTh label="MASTER CBM" sortKey="master_cbm" currentSort={prodSort} onSort={handleProdSort} />\n                      <SortTh label="PRICE" sortKey="unit_price" currentSort={prodSort} onSort={handleProdSort} align="right" />'
assert old_pm_th in content, "old_pm_th not found"
content = content.replace(old_pm_th, new_pm_th, 1)

# Product Master row:
old_pm_td = '<td>{p.master_cbm ? Number(p.master_cbm).toFixed(3) : \'—\'}</td>'
new_pm_td = '<td>{p.master_cbm ? Number(p.master_cbm).toFixed(3) : \'—\'}</td>\n                        <td style={{ textAlign: \'right\', fontWeight: 600, color: \'#047857\' }}>{(p.unit_price || p.latest_rate) ? `${activeCompany?.currency_code || \'$\'} ${Number(p.unit_price || p.latest_rate).toFixed(2)}` : \'—\'}</td>'
assert old_pm_td in content, "old_pm_td not found"
content = content.replace(old_pm_td, new_pm_td, 1)

# Product Master colSpan for empty row:
content = content.replace('<td colSpan={10} className="empty-row">No products found matching filters.</td>', '<td colSpan={11} className="empty-row">No products found matching filters.</td>')

# Matrix colSpan for empty row:
content = content.replace('<td colSpan={6 + matrixData.salesOrders.length} className="empty-row">', '<td colSpan={7 + matrixData.salesOrders.length} className="empty-row">')

# Add unitPrice to editProdForm state:
content = content.replace('weightValue: \'\',\n    imageBase64: \'\',', 'weightValue: \'\',\n    unitPrice: \'\',\n    imageBase64: \'\',')

# Add unitPrice to newProd state:
content = content.replace('weightValue: \'\',\n    imageBase64: \'\',\n    imageFilename: \'\'\n  });\n  const [newProdImagePreview', 'weightValue: \'\',\n    unitPrice: \'\',\n    imageBase64: \'\',\n    imageFilename: \'\'\n  });\n  const [newProdImagePreview')

# In handleOpenEditProduct:
content = content.replace('weightValue: p.weight_value ?? \'\',\n      isActive: p.is_active !== false,', 'weightValue: p.weight_value ?? \'\',\n      unitPrice: p.unit_price ?? p.latest_rate ?? \'\',\n      isActive: p.is_active !== false,')

# In handleSaveEditProduct payload:
content = content.replace('weightValue: editProdForm.weightValue ? Number(editProdForm.weightValue) : null,', 'weightValue: editProdForm.weightValue ? Number(editProdForm.weightValue) : null,\n          unitPrice: editProdForm.unitPrice ? Number(editProdForm.unitPrice) : null,')

# In handleAddProduct payload:
content = content.replace('weightValue: newProd.weightValue ? Number(newProd.weightValue) : null,', 'weightValue: newProd.weightValue ? Number(newProd.weightValue) : null,\n          unitPrice: newProd.unitPrice ? Number(newProd.unitPrice) : null,')

# In exportProductsToExcel:
old_exp_headers = "const headers = ['ITEM CODE', 'BUYER CODE', 'DESCRIPTION', 'FINISH', 'BOX1 LENGTH', 'BOX1 WIDTH', 'BOX1 HEIGHT', 'MASTER CBM', 'WEIGHT'];"
new_exp_headers = "const headers = ['ITEM CODE', 'BUYER CODE', 'DESCRIPTION', 'FINISH', 'BOX1 LENGTH', 'BOX1 WIDTH', 'BOX1 HEIGHT', 'MASTER CBM', 'PRICE', 'WEIGHT'];"
content = content.replace(old_exp_headers, new_exp_headers)

old_exp_row = "p.master_cbm ? Number(p.master_cbm).toFixed(3) : '',\n      p.weight_value ? `${p.weight_value} ${p.weight_uom}` : ''"
new_exp_row = "p.master_cbm ? Number(p.master_cbm).toFixed(3) : '',\n      p.unit_price || p.latest_rate || '',\n      p.weight_value ? `${p.weight_value} ${p.weight_uom}` : ''"
content = content.replace(old_exp_row, new_exp_row)

# Add Unit Price field in Add Product Modal:
old_add_modal_field = """                  <div>
                    <label>Weight (KG)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 15.5"
                      value={newProd.weightValue}
                      onChange={(e) => setNewProd({ ...newProd, weightValue: e.target.value })}
                    />
                  </div>"""

new_add_modal_field = """                  <div>
                    <label>Weight (KG)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 15.5"
                      value={newProd.weightValue}
                      onChange={(e) => setNewProd({ ...newProd, weightValue: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Unit Price ({activeCompany?.currency_code || 'USD'})</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 199.00"
                      value={newProd.unitPrice}
                      onChange={(e) => setNewProd({ ...newProd, unitPrice: e.target.value })}
                    />
                  </div>"""

if old_add_modal_field in content:
    content = content.replace(old_add_modal_field, new_add_modal_field, 1)

# Add Unit Price field in Edit Product Modal:
old_edit_modal_field = """                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Weight (KG)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 15.5"
                    value={editProdForm.weightValue}
                    onChange={(e) => setEditProdForm({ ...editProdForm, weightValue: e.target.value })}
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>"""

new_edit_modal_field = """                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Weight (KG)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 15.5"
                    value={editProdForm.weightValue}
                    onChange={(e) => setEditProdForm({ ...editProdForm, weightValue: e.target.value })}
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Unit Price ({activeCompany?.currency_code || 'USD'})</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 199.00"
                    value={editProdForm.unitPrice}
                    onChange={(e) => setEditProdForm({ ...editProdForm, unitPrice: e.target.value })}
                    style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>"""

if old_edit_modal_field in content:
    content = content.replace(old_edit_modal_field, new_edit_modal_field, 1)

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("App.tsx updated with PRICE column in Matrix, Product Master, and Modals!")
