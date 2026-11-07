app_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add product status filter tab state
target_search = "  const [search, setSearch] = useState('');"
replacement_search = '''  const [search, setSearch] = useState('');
  const [productStatusFilter, setProductStatusFilter] = useState<'ALL' | 'ON' | 'OFF'>('ALL');'''
code = code.replace(target_search, replacement_search, 1)

# 2. Add handleToggleProductStatus
target_save_edit = '''  async function handleSaveEditProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProduct) return;
    try {
      await call(`/companies/${activeCompanyId}/products/${editingProduct.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          itemCode: editProdForm.itemCode,
          buyerCode: editProdForm.buyerCode || null,
          description: editProdForm.description,
          finish: editProdForm.finish || null,
          box1Length: editProdForm.box1Length ? Number(editProdForm.box1Length) : null,
          box1Width: editProdForm.box1Width ? Number(editProdForm.box1Width) : null,
          box1Height: editProdForm.box1Height ? Number(editProdForm.box1Height) : null,
          box2Length: editProdForm.box2Length ? Number(editProdForm.box2Length) : null,
          box2Width: editProdForm.box2Width ? Number(editProdForm.box2Width) : null,
          box2Height: editProdForm.box2Height ? Number(editProdForm.box2Height) : null,
          box3Length: editProdForm.box3Length ? Number(editProdForm.box3Length) : null,
          box3Width: editProdForm.box3Width ? Number(editProdForm.box3Width) : null,
          box3Height: editProdForm.box3Height ? Number(editProdForm.box3Height) : null,
          cartonsCount: editProdForm.cartonsCount ? Number(editProdForm.cartonsCount) : 1,
          masterCbm: editProdForm.masterCbm ? Number(editProdForm.masterCbm) : null,
          weightValue: editProdForm.weightValue ? Number(editProdForm.weightValue) : null,
          isActive: editProdForm.isActive
        })
      });'''

old_save_edit = '''  async function handleSaveEditProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProduct) return;
    try {
      await call(`/companies/${activeCompanyId}/products/${editingProduct.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          itemCode: editProdForm.itemCode,
          buyerCode: editProdForm.buyerCode || null,
          description: editProdForm.description,
          finish: editProdForm.finish || null,
          box1Length: editProdForm.box1Length ? Number(editProdForm.box1Length) : null,
          box1Width: editProdForm.box1Width ? Number(editProdForm.box1Width) : null,
          box1Height: editProdForm.box1Height ? Number(editProdForm.box1Height) : null,
          box2Length: editProdForm.box2Length ? Number(editProdForm.box2Length) : null,
          box2Width: editProdForm.box2Width ? Number(editProdForm.box2Width) : null,
          box2Height: editProdForm.box2Height ? Number(editProdForm.box2Height) : null,
          box3Length: editProdForm.box3Length ? Number(editProdForm.box3Length) : null,
          box3Width: editProdForm.box3Width ? Number(editProdForm.box3Width) : null,
          box3Height: editProdForm.box3Height ? Number(editProdForm.box3Height) : null,
          cartonsCount: editProdForm.cartonsCount ? Number(editProdForm.cartonsCount) : 1,
          masterCbm: editProdForm.masterCbm ? Number(editProdForm.masterCbm) : null,
          weightValue: editProdForm.weightValue ? Number(editProdForm.weightValue) : null
        })
      });'''

if old_save_edit in code:
    code = code.replace(old_save_edit, target_save_edit, 1)

# Add handleToggleProductStatus right after handleSaveEditProduct
target_after_save = '''      setEditingProduct(null);
      setSuccess(`Product '${editProdForm.itemCode}' updated successfully!`);
      await refreshCompanyData();
    } catch (e: any) {
      setError(e.message);
    }
  }'''

replacement_after_save = target_after_save + '''\n
  async function handleToggleProductStatus(p: any) {
    if (!isAdmin) return;
    const newStatus = !p.is_active;
    // Optimistic UI state
    setProducts((prev) =>
      prev.map((item) => (item.id === p.id ? { ...item, is_active: newStatus } : item))
    );
    try {
      await call(`/companies/${activeCompanyId}/products/${p.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: newStatus })
      });
      setSuccess(`Product '${p.item_code}' status set to ${newStatus ? 'ON (Active in Matrix)' : 'OFF (Hidden from Matrix)'}.`);
      await refreshCompanyData();
    } catch (e: any) {
      setError(e.message || 'Failed to update product status');
      await refreshCompanyData();
    }
  }'''

if target_after_save in code and 'handleToggleProductStatus' not in code:
    code = code.replace(target_after_save, replacement_after_save, 1)
    print('Added handleToggleProductStatus')

# 3. Update handleOpenEditProduct to populate isActive
old_open_edit = "      weightValue: p.weight_value ?? '',\n      imageBase64: '',"
new_open_edit = "      weightValue: p.weight_value ?? '',\n      isActive: p.is_active !== false,\n      imageBase64: '',"
code = code.replace(old_open_edit, new_open_edit, 1)

# 4. Filter products logic to include productStatusFilter
old_filter = '''  const filteredProducts = products.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      (p.item_code && p.item_code.toLowerCase().includes(q)) ||
      (p.buyer_code && p.buyer_code.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.finish && p.finish.toLowerCase().includes(q))
    );
  });'''

new_filter = '''  const filteredProducts = products.filter((p) => {
    if (productStatusFilter === 'ON' && !p.is_active) return false;
    if (productStatusFilter === 'OFF' && p.is_active) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      (p.item_code && p.item_code.toLowerCase().includes(q)) ||
      (p.buyer_code && p.buyer_code.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.finish && p.finish.toLowerCase().includes(q))
    );
  });'''

code = code.replace(old_filter, new_filter, 1)

# 5. Add Status Column to Product Master Table
old_pm_head2 = '''                      <th>WEIGHT</th>
                      <th style={{ textAlign: 'center' }}>ACTIONS</th>
                    </tr>'''

new_pm_head2 = '''                      <th>WEIGHT</th>
                      <th style={{ textAlign: 'center' }}>STATUS (ON/OFF)</th>
                      <th style={{ textAlign: 'center' }}>ACTIONS</th>
                    </tr>'''

code = code.replace(old_pm_head2, new_pm_head2, 1)

old_pm_row2 = '''                        <td>{p.weight_value ? `${p.weight_value} ${p.weight_uom || 'KG'}` : '—'}</td>
                        <td style={{ textAlign: 'center' }}>'''

new_pm_row2 = '''                        <td>{p.weight_value ? `${p.weight_value} ${p.weight_uom || 'KG'}` : '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => handleToggleProductStatus(p)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 9px',
                                borderRadius: '9999px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                border: p.is_active !== false ? '1px solid #10b981' : '1px solid #cbd5e1',
                                background: p.is_active !== false ? '#ecfdf5' : '#f1f5f9',
                                color: p.is_active !== false ? '#065f46' : '#64748b',
                                transition: 'all 0.15s ease'
                              }}
                              title={`Click to switch ${p.is_active !== false ? 'OFF (Hide from Matrix)' : 'ON (Show in Matrix)'}`}
                            >
                              <span style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                backgroundColor: p.is_active !== false ? '#10b981' : '#94a3b8'
                              }} />
                              {p.is_active !== false ? 'ON' : 'OFF'}
                            </button>
                          ) : (
                            <span className={`pill ${p.is_active !== false ? 'OPEN' : 'DISABLED'}`}>
                              {p.is_active !== false ? 'ON' : 'OFF'}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>'''

code = code.replace(old_pm_row2, new_pm_row2, 1)

# 6. Add quick filter buttons (ALL, ON, OFF) above search bar in Product Master
old_search_div = '''              <div className="search-bar">
                <Search size={16} />'''

new_search_div = '''              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Filter Status:</span>
                <button
                  type="button"
                  onClick={() => setProductStatusFilter('ALL')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: productStatusFilter === 'ALL' ? '1px solid #4338ca' : '1px solid #cbd5e1',
                    background: productStatusFilter === 'ALL' ? '#e0e7ff' : '#ffffff',
                    color: productStatusFilter === 'ALL' ? '#3730a3' : '#64748b'
                  }}
                >
                  All ({products.length})
                </button>
                <button
                  type="button"
                  onClick={() => setProductStatusFilter('ON')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: productStatusFilter === 'ON' ? '1px solid #059669' : '1px solid #cbd5e1',
                    background: productStatusFilter === 'ON' ? '#d1fae5' : '#ffffff',
                    color: productStatusFilter === 'ON' ? '#065f46' : '#64748b'
                  }}
                >
                  ● ON - Active in Matrix ({products.filter(p => p.is_active !== false).length})
                </button>
                <button
                  type="button"
                  onClick={() => setProductStatusFilter('OFF')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: productStatusFilter === 'OFF' ? '1px solid #dc2626' : '1px solid #cbd5e1',
                    background: productStatusFilter === 'OFF' ? '#fee2e2' : '#ffffff',
                    color: productStatusFilter === 'OFF' ? '#991b1b' : '#64748b'
                  }}
                >
                  ○ OFF - Hidden ({products.filter(p => p.is_active === false).length})
                </button>
              </div>

              <div className="search-bar">
                <Search size={16} />'''

code = code.replace(old_search_div, new_search_div, 1)

# 7. Add Status Toggle in Edit Product Modal
old_edit_modal_end = '''              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setEditingProduct(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Update Product</button>
              </div>'''

new_edit_modal_end = '''              {/* Status ON/OFF Toggle */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <b style={{ fontSize: '13px', color: '#1e293b', display: 'block' }}>Matrix Dashboard Visibility (ON / OFF)</b>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    When ON, this product displays in the dynamic matrix & exports. When OFF, it is hidden.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditProdForm({ ...editProdForm, isActive: !editProdForm.isActive })}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: editProdForm.isActive !== false ? '1px solid #10b981' : '1px solid #cbd5e1',
                    background: editProdForm.isActive !== false ? '#ecfdf5' : '#f1f5f9',
                    color: editProdForm.isActive !== false ? '#065f46' : '#64748b'
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: editProdForm.isActive !== false ? '#10b981' : '#94a3b8' }} />
                  {editProdForm.isActive !== false ? 'ON (Active in Matrix)' : 'OFF (Hidden from Matrix)'}
                </button>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setEditingProduct(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Update Product</button>
              </div>'''

code = code.replace(old_edit_modal_end, new_edit_modal_end, 1)

# Also update colSpan on empty table row from 12 to 13
code = code.replace('<td colSpan={12} className="empty-row">No products found.</td>', '<td colSpan={13} className="empty-row">No products found.</td>')

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(code)

print('Updated App.tsx with product ON/OFF status controls successfully')
