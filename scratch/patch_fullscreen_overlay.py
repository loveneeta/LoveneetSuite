# 1. Add CSS for matrix-fullscreen-wrapper to style.css
css_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

fullscreen_css = '''
/* FULL SCREEN MATRIX DASHBOARD OVERLAY */
.matrix-fullscreen-wrapper {
  position: fixed !important;
  inset: 0 !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  background: #ffffff !important;
  z-index: 9999 !important;
  display: flex !important;
  flex-direction: column !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}

.matrix-fullscreen-header {
  height: 56px !important;
  background: #0f172a !important;
  color: #ffffff !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 0 20px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
  flex-shrink: 0 !important;
}

.matrix-fullscreen-body {
  flex: 1 !important;
  height: calc(100vh - 56px) !important;
  overflow: hidden !important;
  padding: 12px 16px !important;
  background: #f8fafc !important;
  display: flex !important;
  flex-direction: column !important;
}

.matrix-fullscreen-body .matrix-scroll-container {
  flex: 1 !important;
  height: 100% !important;
  max-height: 100% !important;
  min-height: 0 !important;
  border: 1px solid #cbd5e1 !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08) !important;
}
'''

if '.matrix-fullscreen-wrapper' not in css:
    css += fullscreen_css
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(css)
    print('Added fullscreen CSS')

# 2. Add Fullscreen Overlay into App.tsx
app_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    app_code = f.read()

# Add ref for fullscreen table scroll container
if 'fsTableContainerRef' not in app_code:
    app_code = app_code.replace(
        "  const tableContainerRef = useRef<HTMLDivElement>(null);",
        "  const tableContainerRef = useRef<HTMLDivElement>(null);\n  const fsTableContainerRef = useRef<HTMLDivElement>(null);",
        1
    )

fullscreen_modal_code = '''      {/* IMMERSIVE FULL SCREEN MATRIX DASHBOARD OVERLAY (ESC OR X TO RETURN) */}
      {matrixFullscreen && (
        <div className="matrix-fullscreen-wrapper">
          <div className="matrix-fullscreen-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Grid size={20} className="text-indigo-400" />
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, letterSpacing: '0.5px' }}>
                DYNAMIC MATRIX DASHBOARD ({activeCompany?.name}) &mdash; FULL SCREEN MODE
              </h3>
              <span style={{ fontSize: '12px', background: '#334155', color: '#93c5fd', padding: '3px 10px', borderRadius: '9999px', fontWeight: 600 }}>
                {matrixData.salesOrders.length} SO Columns &bull; {matrixData.products.length} Products
              </span>
            </div>

            {/* Quick Navigation Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ height: '32px', padding: '0 10px', fontSize: '12px', fontWeight: 600, background: '#1e293b', color: '#f8fafc', borderColor: '#475569' }}
                onClick={() => {
                  if (fsTableContainerRef.current) fsTableContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                }}
                title="First Column"
              >
                &laquo; Start
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 600, background: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={() => {
                  if (fsTableContainerRef.current) fsTableContainerRef.current.scrollBy({ left: -500, behavior: 'smooth' });
                }}
                title="Scroll Matrix Left (Earlier Orders)"
              >
                <ChevronLeft size={16} /> Scroll Left
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 600, background: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={() => {
                  if (fsTableContainerRef.current) fsTableContainerRef.current.scrollBy({ left: 500, behavior: 'smooth' });
                }}
                title="Scroll Matrix Right (Later Orders)"
              >
                Scroll Right <ChevronRight size={16} />
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ height: '32px', padding: '0 10px', fontSize: '12px', fontWeight: 600, background: '#1e293b', color: '#f8fafc', borderColor: '#475569' }}
                onClick={() => {
                  if (fsTableContainerRef.current) fsTableContainerRef.current.scrollTo({ left: fsTableContainerRef.current.scrollWidth, behavior: 'smooth' });
                }}
                title="Last Column"
              >
                End &raquo;
              </button>
              <button
                type="button"
                className="btn-excel"
                style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}
                onClick={exportMatrixToExcel}
                title="Download Matrix as Excel (.xlsx)"
              >
                <Download size={14} /> Download Excel
              </button>
              <button
                type="button"
                style={{
                  height: '32px',
                  padding: '0 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginLeft: '8px'
                }}
                onClick={() => setMatrixFullscreen(false)}
                title="Exit Fullscreen Mode (or press ESC key)"
              >
                <X size={16} /> Exit Fullscreen (Esc)
              </button>
            </div>
          </div>

          <div className="matrix-fullscreen-body">
            <div ref={fsTableContainerRef} className="table-responsive card-table matrix-scroll-container">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th style={{ width: '66px', textAlign: 'center' }}>IMAGE</th>
                    <th className="sticky-col col-sku">SKU / ITEM CODE</th>
                    <th className="col-desc">DESCRIPTION</th>
                    <th className="col-finish">FINISH</th>
                    <th className="col-cbm">CBM</th>
                    {matrixData.salesOrders.map((so) => (
                      <th key={so.id} className="so-header-col">
                        <div className="so-title">{so.soNumber}</div>
                        <div className="so-date" style={{ color: '#0369a1', fontWeight: 600 }}>
                          {formatDate(so.exFacDate)}
                        </div>
                      </th>
                    ))}
                    <th className="col-total-stock">TOTAL REMAINING</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixData.products.map((p) => (
                    <tr key={p.id}>
                      <td style={{ textAlign: 'center', padding: '4px' }}>
                        <ProductImg
                          itemCode={p.item_code}
                          companyId={activeCompanyId}
                          size={52}
                          onPreview={(url) => setPreviewImage({ url, title: `${p.item_code} — ${p.description || ''}` })}
                        />
                      </td>
                      <td className="sticky-col col-sku font-mono font-bold text-indigo-700">{p.item_code}</td>
                      <td>{p.description}</td>
                      <td><span className="badge-finish">{p.finish || '—'}</span></td>
                      <td>{p.master_cbm ? Number(p.master_cbm).toFixed(3) : '—'}</td>
                      {matrixData.salesOrders.map((so) => {
                        const stock = p.soBalances?.[so.soNumber] ?? 0;
                        return (
                          <td
                            key={so.id}
                            className={`so-cell ${stock > 0 ? 'has-stock cursor-pointer' : 'zero-stock'}`}
                            title={stock > 0 ? `Click to dispatch ${stock} pcs from ${so.soNumber}` : undefined}
                            onClick={() => {
                              if (stock > 0) {
                                setMatrixFullscreen(false);
                                handleOpenDispatchModal(so.soNumber, p.item_code);
                              }
                            }}
                          >
                            {stock > 0 ? (
                              <b style={{ color: '#065f46' }}>{stock}</b>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="col-total-stock font-bold">{p.totalAvailableStock}</td>
                    </tr>
                  ))}
                  {!matrixData.products.length && (
                    <tr>
                      <td colSpan={6 + matrixData.salesOrders.length} className="empty-row">
                        No products recorded. Click "Import RAW_DATA" or "Add Product" to populate the company environment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}'''

target_anchor = "      {/* VIEW DISPATCH DETAILS MODAL */}"
if target_anchor in app_code and '{/* IMMERSIVE FULL SCREEN MATRIX DASHBOARD OVERLAY' not in app_code:
    app_code = app_code.replace(target_anchor, fullscreen_modal_code + '\n\n' + target_anchor, 1)
    with open(app_path, 'w', encoding='utf-8') as f:
        f.write(app_code)
    print('Added Fullscreen Overlay modal into App.tsx')
else:
    print('target_anchor not found or already added')
