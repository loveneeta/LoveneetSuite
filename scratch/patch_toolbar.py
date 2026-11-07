app_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    code = f.read()

# Add Shift+Wheel listener after useEffect for refreshCompanyData
target_hook = '''  useEffect(() => {
    if (activeCompanyId && user) {
      refreshCompanyData();
    }
  }, [activeCompanyId, user]);'''

new_hook = '''  useEffect(() => {
    if (activeCompanyId && user) {
      refreshCompanyData();
    }
  }, [activeCompanyId, user]);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      // Hold Shift or when horizontal delta is present
      if (e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);'''

if target_hook in code:
    code = code.replace(target_hook, new_hook, 1)
    print('Added Shift+wheel listener')
else:
    print('target_hook not found')

# Enhance matrix-toolbar-row
old_toolbar = '''              {/* Matrix Table with Horizontal Scroll Controls */}
              <div className="matrix-toolbar-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>
                  Showing {matrixData.products.length} products across {matrixData.salesOrders.length} Sales Orders (drag scrollbar or use buttons to navigate)
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ height: '32px', padding: '0 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => {
                      if (tableContainerRef.current) {
                        tableContainerRef.current.scrollBy({ left: -450, behavior: 'smooth' });
                      }
                    }}
                    title="Scroll Matrix Left (earlier orders)"
                  >
                    <ChevronLeft size={15} /> Scroll Left
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ height: '32px', padding: '0 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => {
                      if (tableContainerRef.current) {
                        tableContainerRef.current.scrollBy({ left: 450, behavior: 'smooth' });
                      }
                    }}
                    title="Scroll Matrix Right (later orders)"
                  >
                    Scroll Right <ChevronRight size={15} />
                  </button>
                </div>
              </div>'''

new_toolbar = '''              {/* Matrix Table with Prominent Horizontal Navigation Controls */}
              <div className="matrix-toolbar-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', marginBottom: '10px', background: '#f8fafc', padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', color: '#1e293b', fontWeight: 700 }}>
                    ⚡ Matrix Navigation:
                  </span>
                  <span style={{ fontSize: '12px', color: '#475569', background: '#e2e8f0', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
                    {matrixData.salesOrders.length} SO Columns &bull; {matrixData.products.length} Products
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    (Drag bottom scrollbar or hold <b>Shift + Mouse Wheel</b> to pan)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ height: '32px', padding: '0 10px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                    onClick={() => {
                      if (tableContainerRef.current) {
                        tableContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                      }
                    }}
                    title="Jump to First Column (Start)"
                  >
                    &laquo; Start
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#475569' }}
                    onClick={() => {
                      if (tableContainerRef.current) {
                        tableContainerRef.current.scrollBy({ left: -500, behavior: 'smooth' });
                      }
                    }}
                    title="Scroll Matrix Left (Earlier Orders)"
                  >
                    <ChevronLeft size={16} /> Scroll Left
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#2563eb' }}
                    onClick={() => {
                      if (tableContainerRef.current) {
                        tableContainerRef.current.scrollBy({ left: 500, behavior: 'smooth' });
                      }
                    }}
                    title="Scroll Matrix Right (Later Orders)"
                  >
                    Scroll Right <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ height: '32px', padding: '0 10px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                    onClick={() => {
                      if (tableContainerRef.current) {
                        tableContainerRef.current.scrollTo({ left: tableContainerRef.current.scrollWidth, behavior: 'smooth' });
                      }
                    }}
                    title="Jump to Last Column (End)"
                  >
                    End &raquo;
                  </button>
                </div>
              </div>'''

if old_toolbar in code:
    code = code.replace(old_toolbar, new_toolbar, 1)
    print('Updated matrix toolbar')
else:
    print('old_toolbar not found')

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(code)
print('Saved App.tsx')
