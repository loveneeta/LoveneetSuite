app_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    code = f.read()

# Replace ProductImg definition to center image and increase default size
old_prodimg = '''// Product Thumbnail with Error Fallback & Click-to-Zoom
function ProductImg({
  itemCode,
  companyId,
  size = 36,
  onPreview
}: {
  itemCode: string;
  companyId: number;
  size?: number;
  onPreview: (url: string) => void;
}) {
  const [error, setError] = useState(false);
  const url = `${API}/companies/${companyId}/products/${encodeURIComponent(itemCode)}/image`;

  if (error) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '6px',
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          display: 'grid',
          placeItems: 'center',
          color: '#94a3b8',
          fontSize: '9px',
          fontWeight: 700
        }}
        title={`No image found for ${itemCode}`}
      >
        
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={itemCode}
      style={{
        width: size,
        height: size,
        borderRadius: '6px',
        objectFit: 'cover',
        border: '1px solid #cbd5e1',
        cursor: 'pointer',
        background: '#ffffff'
      }}
      onError={() => setError(true)}
      onClick={() => onPreview(url)}
      title={`Click to view high-res image of ${itemCode}`}
    />
  );
}'''

new_prodimg = '''// Product Thumbnail with Error Fallback & Click-to-Zoom (Bigger, Centered)
function ProductImg({
  itemCode,
  companyId,
  size = 52,
  onPreview
}: {
  itemCode: string;
  companyId: number;
  size?: number;
  onPreview: (url: string) => void;
}) {
  const [error, setError] = useState(false);
  const url = `${API}/companies/${companyId}/products/${encodeURIComponent(itemCode)}/image`;

  if (error) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '6px',
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontSize: '9px',
          fontWeight: 700,
          margin: '0 auto'
        }}
        title={`No image found for ${itemCode}`}
      >
        <ImageIcon size={Math.round(size * 0.45)} className="text-slate-400" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={itemCode}
      style={{
        width: size,
        height: size,
        borderRadius: '6px',
        objectFit: 'cover',
        border: '1px solid #cbd5e1',
        cursor: 'pointer',
        background: '#ffffff',
        margin: '0 auto',
        display: 'block'
      }}
      onError={() => setError(true)}
      onClick={() => onPreview(url)}
      title={`Click to view high-res image of ${itemCode}`}
    />
  );
}'''

code = code.replace(old_prodimg, new_prodimg, 1)

# Target the existing ADD PRODUCT MODAL block
old_add_prod_modal = '''      {/* ADD PRODUCT MODAL */}
      {showAddProduct && (
        <div className="modal-backdrop" onClick={() => setShowAddProduct(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Add Product Master</h3>
              <button onClick={() => setShowAddProduct(false)} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleCreateProduct}>
              <label>
                Item Code (SKU) *
                <input required value={newProd.itemCode} onChange={(e) => setNewProd({ ...newProd, itemCode: e.target.value })} />
              </label>
              <label>
                Buyer Product Code
                <input value={newProd.buyerCode} onChange={(e) => setNewProd({ ...newProd, buyerCode: e.target.value })} />
              </label>
              <label>
                Description *
                <input required value={newProd.description} onChange={(e) => setNewProd({ ...newProd, description: e.target.value })} />
              </label>
              <label>
                Finish
                <input value={newProd.finish} onChange={(e) => setNewProd({ ...newProd, finish: e.target.value })} />
              </label>
              <div className="form-row">
                <label>
                  Box 1 L
                  <input type="number" step="0.01" value={newProd.box1Length} onChange={(e) => setNewProd({ ...newProd, box1Length: e.target.value })} />
                </label>
                <label>
                  Box 1 W
                  <input type="number" step="0.01" value={newProd.box1Width} onChange={(e) => setNewProd({ ...newProd, box1Width: e.target.value })} />
                </label>
                <label>
                  Box 1 H
                  <input type="number" step="0.01" value={newProd.box1Height} onChange={(e) => setNewProd({ ...newProd, box1Height: e.target.value })} />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Master CBM
                  <input type="number" step="0.001" value={newProd.masterCbm} onChange={(e) => setNewProd({ ...newProd, masterCbm: e.target.value })} />
                </label>
                <label>
                  Weight (KG)
                  <input type="number" step="0.01" value={newProd.weightValue} onChange={(e) => setNewProd({ ...newProd, weightValue: e.target.value })} />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowAddProduct(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}'''

new_modals = '''      {/* ADD PRODUCT MODAL (Supports 3 Boxes, Image Upload, CBM Auto-Calc) */}
      {showAddProduct && (
        <div className="modal-backdrop" onClick={() => setShowAddProduct(false)}>
          <div className="modal-box" style={{ maxWidth: '640px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={20} className="text-indigo-600" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Add Product Master ({activeCompany?.name})</h3>
              </div>
              <button onClick={() => setShowAddProduct(false)} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label>
                  Item Code (SKU) *
                  <input required placeholder="e.g. 61830" value={newProd.itemCode} onChange={(e) => setNewProd({ ...newProd, itemCode: e.target.value })} />
                </label>
                <label>
                  Buyer Product Code
                  <input placeholder="e.g. 041NBC300027" value={newProd.buyerCode} onChange={(e) => setNewProd({ ...newProd, buyerCode: e.target.value })} />
                </label>
              </div>
              <label>
                Description *
                <input required placeholder="e.g. COFFEE TABLE" value={newProd.description} onChange={(e) => setNewProd({ ...newProd, description: e.target.value })} />
              </label>
              <label>
                Finish
                <input placeholder="e.g. NATURAL, BROWN, BLACK POWDERCOAT" value={newProd.finish} onChange={(e) => setNewProd({ ...newProd, finish: e.target.value })} />
              </label>

              {/* Product Image Upload Section */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <b style={{ fontSize: '13px', color: '#1e293b', display: 'block', marginBottom: '6px' }}>Product Photo (JPG/PNG/WebP)</b>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {newProdImagePreview ? (
                    <img src={newProdImagePreview} alt="Preview" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                  ) : (
                    <div style={{ width: 60, height: 60, borderRadius: '6px', background: '#e2e8f0', display: 'grid', placeItems: 'center', color: '#64748b' }}>
                      <ImageIcon size={24} />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ fontSize: '12px' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const b64 = reader.result as string;
                            setNewProd({ ...newProd, imageBase64: b64, imageFilename: file.name });
                            setNewProdImagePreview(b64);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <small style={{ display: 'block', color: '#64748b', marginTop: '4px' }}>
                      Image is saved in company storage and embedded into Excel export.
                    </small>
                  </div>
                </div>
              </div>

              {/* 3 Box Dimensions Panel */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ fontSize: '13px', color: '#1e293b' }}>Packaging & Box Dimensions (cm)</b>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Supports 1, 2, or 3 Cartons</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Box 1:</span>
                  <input type="number" step="0.01" placeholder="Length (cm)" value={newProd.box1Length} onChange={(e) => setNewProd({ ...newProd, box1Length: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Width (cm)" value={newProd.box1Width} onChange={(e) => setNewProd({ ...newProd, box1Width: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Height (cm)" value={newProd.box1Height} onChange={(e) => setNewProd({ ...newProd, box1Height: e.target.value })} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Box 2:</span>
                  <input type="number" step="0.01" placeholder="Length (cm)" value={newProd.box2Length} onChange={(e) => setNewProd({ ...newProd, box2Length: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Width (cm)" value={newProd.box2Width} onChange={(e) => setNewProd({ ...newProd, box2Width: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Height (cm)" value={newProd.box2Height} onChange={(e) => setNewProd({ ...newProd, box2Height: e.target.value })} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Box 3:</span>
                  <input type="number" step="0.01" placeholder="Length (cm)" value={newProd.box3Length} onChange={(e) => setNewProd({ ...newProd, box3Length: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Width (cm)" value={newProd.box3Width} onChange={(e) => setNewProd({ ...newProd, box3Width: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Height (cm)" value={newProd.box3Height} onChange={(e) => setNewProd({ ...newProd, box3Height: e.target.value })} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '4px 10px', fontWeight: 600 }}
                    onClick={() => {
                      const l1 = Number(newProd.box1Length || 0), w1 = Number(newProd.box1Width || 0), h1 = Number(newProd.box1Height || 0);
                      const l2 = Number(newProd.box2Length || 0), w2 = Number(newProd.box2Width || 0), h2 = Number(newProd.box2Height || 0);
                      const l3 = Number(newProd.box3Length || 0), w3 = Number(newProd.box3Width || 0), h3 = Number(newProd.box3Height || 0);
                      const totalCbm = ((l1*w1*h1) + (l2*w2*h2) + (l3*w3*h3)) / 1000000;
                      let ctns = 1;
                      if (l3 || w3 || h3) ctns = 3;
                      else if (l2 || w2 || h2) ctns = 2;
                      setNewProd({ ...newProd, masterCbm: totalCbm > 0 ? totalCbm.toFixed(3) : newProd.masterCbm, cartonsCount: ctns });
                    }}
                  >
                    ⚡ Auto-Calculate CBM & Cartons
                  </button>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>Total Cartons:</label>
                    <input type="number" min="1" max="10" style={{ width: '60px' }} value={newProd.cartonsCount} onChange={(e) => setNewProd({ ...newProd, cartonsCount: e.target.value })} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label>
                  Master CBM
                  <input type="number" step="0.001" placeholder="e.g. 0.185" value={newProd.masterCbm} onChange={(e) => setNewProd({ ...newProd, masterCbm: e.target.value })} />
                </label>
                <label>
                  Weight (KG)
                  <input type="number" step="0.01" placeholder="e.g. 24.50" value={newProd.weightValue} onChange={(e) => setNewProd({ ...newProd, weightValue: e.target.value })} />
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowAddProduct(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PRODUCT MODAL (ADMIN ONLY) */}
      {editingProduct && (
        <div className="modal-backdrop" onClick={() => setEditingProduct(null)}>
          <div className="modal-box" style={{ maxWidth: '640px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={18} className="text-indigo-600" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Edit Product: {editingProduct.item_code}</h3>
              </div>
              <button onClick={() => setEditingProduct(null)} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleSaveEditProduct} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label>
                  Item Code (SKU) *
                  <input required value={editProdForm.itemCode} onChange={(e) => setEditProdForm({ ...editProdForm, itemCode: e.target.value })} />
                </label>
                <label>
                  Buyer Product Code
                  <input value={editProdForm.buyerCode} onChange={(e) => setEditProdForm({ ...editProdForm, buyerCode: e.target.value })} />
                </label>
              </div>
              <label>
                Description *
                <input required value={editProdForm.description} onChange={(e) => setEditProdForm({ ...editProdForm, description: e.target.value })} />
              </label>
              <label>
                Finish
                <input value={editProdForm.finish} onChange={(e) => setEditProdForm({ ...editProdForm, finish: e.target.value })} />
              </label>

              {/* Photo Upload / Replace */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <b style={{ fontSize: '13px', color: '#1e293b', display: 'block', marginBottom: '6px' }}>Product Photo (JPG/PNG/WebP)</b>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {editProdImagePreview ? (
                    <img src={editProdImagePreview} alt="Preview" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                  ) : (
                    <div style={{ width: 60, height: 60, borderRadius: '6px', background: '#e2e8f0', display: 'grid', placeItems: 'center', color: '#64748b' }}>
                      <ImageIcon size={24} />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ fontSize: '12px' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const b64 = reader.result as string;
                            setEditProdForm({ ...editProdForm, imageBase64: b64, imageFilename: file.name });
                            setEditProdImagePreview(b64);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <small style={{ display: 'block', color: '#64748b', marginTop: '4px' }}>
                      Upload to replace this product's photo across all matrix tables & Excel exports.
                    </small>
                  </div>
                </div>
              </div>

              {/* 3 Box Dimensions Panel */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ fontSize: '13px', color: '#1e293b' }}>Packaging & Box Dimensions (cm)</b>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Supports 1, 2, or 3 Cartons</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Box 1:</span>
                  <input type="number" step="0.01" placeholder="Length (cm)" value={editProdForm.box1Length} onChange={(e) => setEditProdForm({ ...editProdForm, box1Length: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Width (cm)" value={editProdForm.box1Width} onChange={(e) => setEditProdForm({ ...editProdForm, box1Width: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Height (cm)" value={editProdForm.box1Height} onChange={(e) => setEditProdForm({ ...editProdForm, box1Height: e.target.value })} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Box 2:</span>
                  <input type="number" step="0.01" placeholder="Length (cm)" value={editProdForm.box2Length} onChange={(e) => setEditProdForm({ ...editProdForm, box2Length: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Width (cm)" value={editProdForm.box2Width} onChange={(e) => setEditProdForm({ ...editProdForm, box2Width: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Height (cm)" value={editProdForm.box2Height} onChange={(e) => setEditProdForm({ ...editProdForm, box2Height: e.target.value })} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Box 3:</span>
                  <input type="number" step="0.01" placeholder="Length (cm)" value={editProdForm.box3Length} onChange={(e) => setEditProdForm({ ...editProdForm, box3Length: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Width (cm)" value={editProdForm.box3Width} onChange={(e) => setEditProdForm({ ...editProdForm, box3Width: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Height (cm)" value={editProdForm.box3Height} onChange={(e) => setEditProdForm({ ...editProdForm, box3Height: e.target.value })} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '4px 10px', fontWeight: 600 }}
                    onClick={() => {
                      const l1 = Number(editProdForm.box1Length || 0), w1 = Number(editProdForm.box1Width || 0), h1 = Number(editProdForm.box1Height || 0);
                      const l2 = Number(editProdForm.box2Length || 0), w2 = Number(editProdForm.box2Width || 0), h2 = Number(editProdForm.box2Height || 0);
                      const l3 = Number(editProdForm.box3Length || 0), w3 = Number(editProdForm.box3Width || 0), h3 = Number(editProdForm.box3Height || 0);
                      const totalCbm = ((l1*w1*h1) + (l2*w2*h2) + (l3*w3*h3)) / 1000000;
                      let ctns = 1;
                      if (l3 || w3 || h3) ctns = 3;
                      else if (l2 || w2 || h2) ctns = 2;
                      setEditProdForm({ ...editProdForm, masterCbm: totalCbm > 0 ? totalCbm.toFixed(3) : editProdForm.masterCbm, cartonsCount: ctns });
                    }}
                  >
                    ⚡ Auto-Calculate CBM & Cartons
                  </button>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>Total Cartons:</label>
                    <input type="number" min="1" max="10" style={{ width: '60px' }} value={editProdForm.cartonsCount} onChange={(e) => setEditProdForm({ ...editProdForm, cartonsCount: e.target.value })} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label>
                  Master CBM
                  <input type="number" step="0.001" value={editProdForm.masterCbm} onChange={(e) => setEditProdForm({ ...editProdForm, masterCbm: e.target.value })} />
                </label>
                <label>
                  Weight (KG)
                  <input type="number" step="0.01" value={editProdForm.weightValue} onChange={(e) => setEditProdForm({ ...editProdForm, weightValue: e.target.value })} />
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setEditingProduct(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Update Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SALES ORDER MODAL (ADMIN ONLY) */}
      {editingOrder && (
        <div className="modal-backdrop" onClick={() => setEditingOrder(null)}>
          <div className="modal-box" style={{ maxWidth: '520px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={18} className="text-indigo-600" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Edit Sales Order: {editingOrder.so_number}</h3>
              </div>
              <button onClick={() => setEditingOrder(null)} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleSaveEditOrder} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                <b>SO Number:</b> <code className="text-indigo-700 font-bold">{editingOrder.so_number}</code>
              </div>

              <label>
                Buyer Order Number / PO Ref
                <input
                  placeholder="e.g. PO-TEST-9001"
                  value={editOrderForm.buyerOrderNo}
                  onChange={(e) => setEditOrderForm({ ...editOrderForm, buyerOrderNo: e.target.value })}
                />
              </label>

              <label>
                Customer Name
                <input
                  placeholder="e.g. PAN EMIRATES"
                  value={editOrderForm.customerName}
                  onChange={(e) => setEditOrderForm({ ...editOrderForm, customerName: e.target.value })}
                />
              </label>

              <label>
                Ex-Factory Date (DD-MM-YYYY)
                <input
                  type="date"
                  value={editOrderForm.exFacDate}
                  onChange={(e) => setEditOrderForm({ ...editOrderForm, exFacDate: e.target.value })}
                />
                {editOrderForm.exFacDate && (
                  <small style={{ color: '#0369a1', fontWeight: 600, marginTop: '2px', display: 'block' }}>
                    Formatted: {formatDate(editOrderForm.exFacDate)}
                  </small>
                )}
              </label>

              <label>
                Sales Order Status
                <select
                  value={editOrderForm.status}
                  onChange={(e) => setEditOrderForm({ ...editOrderForm, status: e.target.value })}
                >
                  <option value="OPEN">OPEN (Active in Matrix Dashboard)</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="IN_PRODUCTION">IN_PRODUCTION</option>
                  <option value="READY">READY</option>
                  <option value="PARTIALLY_DISPATCHED">PARTIALLY_DISPATCHED</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="DISABLED">DISABLED (Hidden from Matrix Active)</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </label>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setEditingOrder(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Update Sales Order</button>
              </div>
            </form>
          </div>
        </div>
      )}'''

if old_add_prod_modal in code:
    code = code.replace(old_add_prod_modal, new_modals, 1)
    with open(app_path, 'w', encoding='utf-8') as f:
        f.write(code)
    print('Replaced Add Product Modal and added Edit Product and Edit Sales Order Modals successfully')
else:
    print('old_add_prod_modal not found in App.tsx')
