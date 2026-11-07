import sys

path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'

with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Let's define the replacements

# 1. Update exportOrdersToExcel to export filteredSortedOrders instead of orders
old_export_orders = """  function exportOrdersToExcel() {
    if (!orders.length) return;
    const headers = ['SO NUMBER', 'BUYER ORDER NO', 'CUSTOMER', 'EX-FACTORY DATE (DD-MM-YYYY)', 'STATUS', 'LINES', 'ORDERED QTY', 'DISPATCHED QTY', 'AVAILABLE QTY'];
    const rows = orders.map((o) => ["""

new_export_orders = """  function exportOrdersToExcel() {
    const listToExport = filteredSortedOrders.length ? filteredSortedOrders : orders;
    if (!listToExport.length) return;
    const headers = ['SO NUMBER', 'BUYER ORDER NO', 'CUSTOMER', 'EX-FACTORY DATE (DD-MM-YYYY)', 'STATUS', 'LINES', 'ORDERED QTY', 'DISPATCHED QTY', 'AVAILABLE QTY'];
    const rows = listToExport.map((o) => ["""

assert old_export_orders in text, "old_export_orders not found"
text = text.replace(old_export_orders, new_export_orders, 1)

# 2. Update exportProductsToExcel to export filteredProducts
old_export_prod = """  function exportProductsToExcel() {
    if (!products.length) return;
    const headers = ['ITEM CODE', 'BUYER CODE', 'DESCRIPTION', 'FINISH', 'BOX1 LENGTH', 'BOX1 WIDTH', 'BOX1 HEIGHT', 'MASTER CBM', 'WEIGHT'];
    const rows = products.map((p) => ["""

new_export_prod = """  function exportProductsToExcel() {
    const listToExport = filteredProducts.length ? filteredProducts : products;
    if (!listToExport.length) return;
    const headers = ['ITEM CODE', 'BUYER CODE', 'DESCRIPTION', 'FINISH', 'BOX1 LENGTH', 'BOX1 WIDTH', 'BOX1 HEIGHT', 'MASTER CBM', 'WEIGHT'];
    const rows = listToExport.map((p) => ["""

assert old_export_prod in text, "old_export_prod not found"
text = text.replace(old_export_prod, new_export_prod, 1)

# 3. Update exportDispatchesToExcel to export filteredSortedDispatches
old_export_disp = """  function exportDispatchesToExcel() {
    if (!dispatches.length) return;
    const headers = ['DISPATCH NO', 'DATE (DD-MM-YYYY)', 'STATUS', 'LINES', 'TOTAL QTY', 'NOTES', 'CREATED BY'];
    const rows = dispatches.map((d) => ["""

new_export_disp = """  function exportDispatchesToExcel() {
    const listToExport = filteredSortedDispatches.length ? filteredSortedDispatches : dispatches;
    if (!listToExport.length) return;
    const headers = ['DISPATCH NO', 'DATE (DD-MM-YYYY)', 'STATUS', 'LINES', 'TOTAL QTY', 'NOTES', 'CREATED BY'];
    const rows = listToExport.map((d) => ["""

assert old_export_disp in text, "old_export_disp not found"
text = text.replace(old_export_disp, new_export_disp, 1)

# 4. Replacement for Matrix page up to Product Master
matrix_start_marker = "{page === 'matrix' && ("
prod_start_marker = "/* PAGE: PRODUCT MASTER */"

idx1 = text.find(matrix_start_marker)
assert idx1 != -1, "matrix_start_marker not found"
idx2 = text.find(prod_start_marker)
assert idx2 != -1, "prod_start_marker not found"

new_matrix_jsx = """{page === 'matrix' && (
            <div className="section-block">
              <div className="section-head">
                <div>
                  <h2>Dynamic Matrix Dashboard ({activeCompany?.name})</h2>
                  <p>Real-time stock balances across all active Sales Orders (VBA DASHBOARD equivalent)</p>
                </div>
                <div className="actions-bar" style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="btn-secondary"
                    style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => setMatrixFullscreen(true)}
                    title="Enter Fullscreen Mode (Press ESC to exit)"
                  >
                    <Maximize2 size={15} /> Fullscreen
                  </button>
                  <button className="btn-excel" onClick={exportMatrixToExcel} title="Download Matrix as Excel (.xlsx)">
                    <Download size={15} /> Download Excel
                  </button>
                  <button className="btn-secondary" onClick={() => setShowImportRawData(true)}>
                    <UploadCloud size={15} /> Import RAW_DATA
                  </button>
                  <button className="btn-primary" onClick={() => handleOpenDispatchModal()}>
                    <Truck size={15} /> Create Dispatch
                  </button>
                  <button className="btn-primary" onClick={() => setShowAddProduct(true)}>
                    <Plus size={15} /> Add Product
                  </button>
                </div>
              </div>

              {/* KPI Strip */}
              <div className="kpi-grid">
                <div className="kpi-card">
                  <small>Active Sales Orders</small>
                  <b>{matrixData.salesOrders.length}</b>
                </div>
                <div className="kpi-card">
                  <small>Master Products</small>
                  <b>{companySummary.products || 0}</b>
                </div>
                <div className="kpi-card">
                  <small>Total Ordered Qty</small>
                  <b>{Number(companySummary.ordered_qty || 0).toFixed(0)}</b>
                </div>
                <div className="kpi-card">
                  <small>Posted Dispatched Qty</small>
                  <b>{Number(companySummary.dispatched_qty || 0).toFixed(0)}</b>
                </div>
              </div>

              {/* FILTER & SORT TOOLBAR FOR MATRIX */}
              <div className="filter-toolbar">
                <div className="filter-group">
                  <div className="search-bar" style={{ maxWidth: '320px', padding: '6px 12px' }}>
                    <Search size={15} className="text-slate-400" />
                    <input
                      placeholder="Search SKU, description, finish..."
                      value={matrixSearch}
                      onChange={(e) => setMatrixSearch(e.target.value)}
                    />
                    {matrixSearch && (
                      <button
                        type="button"
                        onClick={() => setMatrixSearch('')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '0 2px' }}
                        title="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Stock Filter Pills */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className={`filter-pill-btn ${matrixStockFilter === 'ALL' ? 'active' : ''}`}
                      onClick={() => setMatrixStockFilter('ALL')}
                    >
                      All Items ({matrixData.products.length})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill-btn ${matrixStockFilter === 'IN_STOCK' ? 'active' : ''}`}
                      onClick={() => setMatrixStockFilter('IN_STOCK')}
                      style={{ color: matrixStockFilter === 'IN_STOCK' ? '#065f46' : undefined }}
                    >
                      ● In Stock ({matrixData.products.filter(p => (p.totalAvailableStock || 0) > 0).length})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill-btn ${matrixStockFilter === 'ZERO_STOCK' ? 'active' : ''}`}
                      onClick={() => setMatrixStockFilter('ZERO_STOCK')}
                    >
                      Zero Stock ({matrixData.products.filter(p => !p.totalAvailableStock || p.totalAvailableStock === 0).length})
                    </button>
                  </div>

                  {/* Finish Select Dropdown */}
                  {matrixFinishes.length > 0 && (
                    <select
                      className="filter-select"
                      value={matrixFinishFilter}
                      onChange={(e) => setMatrixFinishFilter(e.target.value)}
                      title="Filter Matrix by Finish"
                    >
                      <option value="ALL">All Finishes ({matrixFinishes.length})</option>
                      {matrixFinishes.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="filter-group">
                  {/* Active Sort Tag */}
                  {matrixSort.key && matrixSort.dir && (
                    <span
                      className="active-sort-pill"
                      onClick={() => setMatrixSort({ key: '', dir: null })}
                      title="Click to clear sorting"
                    >
                      Sorted: <b>{matrixSort.key === 'totalAvailableStock' ? 'TOTAL REMAINING' : matrixSort.key.toUpperCase()}</b> ({matrixSort.dir.toUpperCase()})
                      <X size={12} />
                    </span>
                  )}

                  <span className="filter-count-badge">
                    Showing <b>{filteredSortedMatrixProducts.length}</b> of {matrixData.products.length} products
                  </span>

                  {(matrixSearch || matrixStockFilter !== 'ALL' || matrixFinishFilter !== 'ALL' || matrixSort.key) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ height: '30px', padding: '0 8px', fontSize: '11px', color: '#dc2626' }}
                      onClick={() => {
                        setMatrixSearch('');
                        setMatrixStockFilter('ALL');
                        setMatrixFinishFilter('ALL');
                        setMatrixSort({ key: '', dir: null });
                      }}
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              {/* Matrix Table with Horizontal Navigation Controls */}
              <div className="matrix-toolbar-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', background: '#f8fafc', padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', color: '#1e293b', fontWeight: 700 }}>
                    ⚡ Matrix Navigation:
                  </span>
                  <span style={{ fontSize: '12px', color: '#475569', background: '#e2e8f0', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
                    {matrixData.salesOrders.length} SO Columns &bull; {filteredSortedMatrixProducts.length} Products
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
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ height: '32px', padding: '0 10px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', borderColor: '#4338ca', color: '#4338ca' }}
                    onClick={() => setMatrixFullscreen(true)}
                    title="View whole table on Fullscreen (Esc to exit)"
                  >
                    <Maximize2 size={14} /> Fullscreen
                  </button>
                </div>
              </div>

              <div ref={tableContainerRef} className="table-responsive card-table matrix-scroll-container">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th style={{ width: '66px', textAlign: 'center' }}>IMAGE</th>
                      <SortTh label="SKU / ITEM CODE" sortKey="item_code" currentSort={matrixSort} onSort={handleMatrixSort} className="sticky-col col-sku" />
                      <SortTh label="DESCRIPTION" sortKey="description" currentSort={matrixSort} onSort={handleMatrixSort} className="col-desc" />
                      <SortTh label="FINISH" sortKey="finish" currentSort={matrixSort} onSort={handleMatrixSort} className="col-finish" />
                      <SortTh label="CBM" sortKey="master_cbm" currentSort={matrixSort} onSort={handleMatrixSort} className="col-cbm" />
                      {matrixData.salesOrders.map((so) => {
                        const isSorted = matrixSort.key === so.soNumber && matrixSort.dir !== null;
                        return (
                          <th
                            key={so.id}
                            className="so-header-col sortable-th"
                            onClick={() => handleMatrixSort(so.soNumber)}
                            title={`Click to sort products by balance in ${so.soNumber} (${isSorted ? (matrixSort.dir === 'asc' ? 'Descending' : 'Clear') : 'Ascending'})`}
                            style={{ cursor: 'pointer', userSelect: 'none' }}
                          >
                            <div className="so-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <span>{so.soNumber}</span>
                              <span style={{ opacity: isSorted ? 1 : 0.35 }}>
                                {isSorted ? (
                                  matrixSort.dir === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                                ) : (
                                  <ArrowUpDown size={11} />
                                )}
                              </span>
                            </div>
                            <div className="so-date" style={{ color: '#0369a1', fontWeight: 600 }}>
                              {formatDate(so.exFacDate)}
                            </div>
                          </th>
                        );
                      })}
                      <SortTh label="TOTAL REMAINING" sortKey="totalAvailableStock" currentSort={matrixSort} onSort={handleMatrixSort} className="col-total-stock" align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedMatrixProducts.map((p) => (
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
                    {!filteredSortedMatrixProducts.length && (
                      <tr>
                        <td colSpan={6 + matrixData.salesOrders.length} className="empty-row">
                          No matching products found. Try adjusting your search or filter options.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          """

text = text[:idx1] + new_matrix_jsx + text[idx2:]

# 5. Replacement for Product Master up to Sales Orders
prod_start_marker = "/* PAGE: PRODUCT MASTER */"
orders_start_marker = "/* PAGE: SALES ORDERS */"

idx1 = text.find(prod_start_marker)
assert idx1 != -1, "prod_start_marker not found"
idx2 = text.find(orders_start_marker)
assert idx2 != -1, "orders_start_marker not found"

new_prod_jsx = """/* PAGE: PRODUCT MASTER */
          {page === 'products' && (
            <div className="section-block">
              <div className="section-head">
                <div>
                  <h2>Company Product Master ({activeCompany?.name})</h2>
                  <p>Unique product codes, images, and specifications scoped strictly to {activeCompany?.name}</p>
                </div>
                <div className="actions-bar" style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-excel" onClick={exportProductsToExcel}>
                    <Download size={15} /> Download Excel
                  </button>
                  <button className="btn-primary" onClick={() => setShowAddProduct(true)}>
                    <Plus size={15} /> Add Product
                  </button>
                </div>
              </div>

              {/* FILTER & SORT TOOLBAR FOR PRODUCTS */}
              <div className="filter-toolbar">
                <div className="filter-group">
                  <div className="search-bar" style={{ maxWidth: '340px', padding: '6px 12px' }}>
                    <Search size={15} className="text-slate-400" />
                    <input
                      placeholder="Search SKU, buyer code, finish, or description..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '0 2px' }}
                        title="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Status Pills */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className={`filter-pill-btn ${productStatusFilter === 'ALL' ? 'active' : ''}`}
                      onClick={() => setProductStatusFilter('ALL')}
                    >
                      All ({products.length})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill-btn ${productStatusFilter === 'ON' ? 'active' : ''}`}
                      onClick={() => setProductStatusFilter('ON')}
                      style={{ color: productStatusFilter === 'ON' ? '#065f46' : undefined }}
                    >
                      ● ON - Active ({products.filter(p => p.is_active !== false).length})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill-btn ${productStatusFilter === 'OFF' ? 'active' : ''}`}
                      onClick={() => setProductStatusFilter('OFF')}
                      style={{ color: productStatusFilter === 'OFF' ? '#991b1b' : undefined }}
                    >
                      ○ OFF - Hidden ({products.filter(p => p.is_active === false).length})
                    </button>
                  </div>

                  {/* Finish Select */}
                  {productFinishes.length > 0 && (
                    <select
                      className="filter-select"
                      value={prodFinishFilter}
                      onChange={(e) => setProdFinishFilter(e.target.value)}
                      title="Filter Products by Finish"
                    >
                      <option value="ALL">All Finishes ({productFinishes.length})</option>
                      {productFinishes.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="filter-group">
                  {/* Active Sort Tag */}
                  {prodSort.key && prodSort.dir && (
                    <span
                      className="active-sort-pill"
                      onClick={() => setProdSort({ key: '', dir: null })}
                      title="Click to clear sorting"
                    >
                      Sorted: <b>{prodSort.key.toUpperCase()}</b> ({prodSort.dir.toUpperCase()})
                      <X size={12} />
                    </span>
                  )}

                  <span className="filter-count-badge">
                    Showing <b>{filteredProducts.length}</b> of {products.length} products
                  </span>

                  {(search || productStatusFilter !== 'ALL' || prodFinishFilter !== 'ALL' || prodSort.key) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ height: '30px', padding: '0 8px', fontSize: '11px', color: '#dc2626' }}
                      onClick={() => {
                        setSearch('');
                        setProductStatusFilter('ALL');
                        setProdFinishFilter('ALL');
                        setProdSort({ key: '', dir: null });
                      }}
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              <div className="table-responsive card-table">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '66px', textAlign: 'center' }}>IMAGE</th>
                      <SortTh label="ITEM CODE" sortKey="item_code" currentSort={prodSort} onSort={handleProdSort} />
                      <SortTh label="BUYER CODE" sortKey="buyer_code" currentSort={prodSort} onSort={handleProdSort} />
                      <SortTh label="DESCRIPTION" sortKey="description" currentSort={prodSort} onSort={handleProdSort} />
                      <SortTh label="FINISH" sortKey="finish" currentSort={prodSort} onSort={handleProdSort} />
                      <SortTh label="BOX 1 (L×W×H)" sortKey="box1_length" currentSort={prodSort} onSort={handleProdSort} />
                      <SortTh label="MASTER CBM" sortKey="master_cbm" currentSort={prodSort} onSort={handleProdSort} />
                      <SortTh label="WEIGHT" sortKey="weight_value" currentSort={prodSort} onSort={handleProdSort} />
                      <SortTh label="STATUS" sortKey="is_active" currentSort={prodSort} onSort={handleProdSort} align="center" />
                      <th style={{ textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => (
                      <tr key={p.id}>
                        <td style={{ textAlign: 'center', padding: '4px' }}>
                          <ProductImg
                            itemCode={p.item_code}
                            companyId={activeCompanyId}
                            size={52}
                            onPreview={(url) => setPreviewImage({ url, title: `${p.item_code} — ${p.description || ''}` })}
                          />
                        </td>
                        <td className="font-mono font-bold text-indigo-700">{p.item_code}</td>
                        <td>{p.buyer_code || '—'}</td>
                        <td>{p.description}</td>
                        <td><span className="badge-finish">{p.finish || '—'}</span></td>
                        <td>
                          {p.box1_length ? `${p.box1_length} × ${p.box1_width} × ${p.box1_height} cm` : '—'}
                          {p.cartons_count > 1 && (
                            <small style={{ display: 'block', color: '#6366f1', fontWeight: 600 }}>({p.cartons_count} boxes)</small>
                          )}
                        </td>
                        <td>{p.master_cbm ? Number(p.master_cbm).toFixed(3) : '—'}</td>
                        <td>{p.weight_value ? `${p.weight_value} ${p.weight_uom}` : '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => handleToggleProductStatus(p)}
                              style={{
                                padding: '3px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                borderRadius: '12px',
                                cursor: 'pointer',
                                border: p.is_active !== false ? '1px solid #059669' : '1px solid #dc2626',
                                background: p.is_active !== false ? '#d1fae5' : '#fee2e2',
                                color: p.is_active !== false ? '#065f46' : '#991b1b',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title={`Click to turn ${p.is_active !== false ? 'OFF (Hide from Matrix)' : 'ON (Show in Matrix)'}`}
                            >
                              {p.is_active !== false ? '● ON' : '○ OFF'}
                            </button>
                          ) : (
                            <span className={`pill ${p.is_active !== false ? 'OPEN' : 'CANCELLED'}`}>
                              {p.is_active !== false ? 'ACTIVE' : 'OFF'}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isAdmin ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ height: '28px', padding: '0 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#4338ca', fontWeight: 600 }}
                              onClick={() => handleOpenEditProduct(p)}
                              title="Admin: Edit product specs, boxes, cartons, or upload image"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>View Only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!filteredProducts.length && (
                      <tr>
                        <td colSpan={10} className="empty-row">No products found matching filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          """

text = text[:idx1] + new_prod_jsx + text[idx2:]

# 6. Replacement for Sales Orders up to Dispatches
orders_start_marker = "/* PAGE: SALES ORDERS */"
disp_start_marker = "/* PAGE: DISPATCH MANAGEMENT */"

idx1 = text.find(orders_start_marker)
assert idx1 != -1, "orders_start_marker not found"
idx2 = text.find(disp_start_marker)
assert idx2 != -1, "disp_start_marker not found"

new_orders_jsx = """/* PAGE: SALES ORDERS */
          {page === 'orders' && (
            <div className="section-block">
              <div className="section-head">
                <div>
                  <h2>Sales Orders ({activeCompany?.name})</h2>
                  <p>Order references, line items, and fulfillment tracking</p>
                </div>
                <div className="actions-bar" style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-excel" onClick={exportOrdersToExcel} title="Download Sales Orders as Excel (.xlsx)">
                    <Download size={15} /> Download Excel
                  </button>
                  <button className="btn-secondary" onClick={() => setShowImportRawData(true)}>
                    <UploadCloud size={15} /> Import RAW_DATA
                  </button>
                </div>
              </div>

              {/* FILTER & SORT TOOLBAR FOR SALES ORDERS */}
              <div className="filter-toolbar">
                <div className="filter-group">
                  <div className="search-bar" style={{ maxWidth: '340px', padding: '6px 12px' }}>
                    <Search size={15} className="text-slate-400" />
                    <input
                      placeholder="Search SO number, buyer PO, customer..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                    />
                    {orderSearch && (
                      <button
                        type="button"
                        onClick={() => setOrderSearch('')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '0 2px' }}
                        title="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Status Dropdown */}
                  <select
                    className="filter-select"
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value)}
                    title="Filter by Order Status"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="OPEN">OPEN</option>
                    <option value="CONFIRMED">CONFIRMED</option>
                    <option value="IN_PRODUCTION">IN_PRODUCTION</option>
                    <option value="READY">READY</option>
                    <option value="PARTIALLY_DISPATCHED">PARTIALLY_DISPATCHED</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="DISABLED">DISABLED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>

                  {/* Stock Filter Pills */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className={`filter-pill-btn ${orderStockFilter === 'ALL' ? 'active' : ''}`}
                      onClick={() => setOrderStockFilter('ALL')}
                    >
                      All Orders ({orders.length})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill-btn ${orderStockFilter === 'IN_STOCK' ? 'active' : ''}`}
                      onClick={() => setOrderStockFilter('IN_STOCK')}
                      style={{ color: orderStockFilter === 'IN_STOCK' ? '#065f46' : undefined }}
                    >
                      Has Stock ({orders.filter(o => Number(o.total_available_qty || 0) > 0).length})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill-btn ${orderStockFilter === 'ZERO_STOCK' ? 'active' : ''}`}
                      onClick={() => setOrderStockFilter('ZERO_STOCK')}
                    >
                      Fully Dispatched ({orders.filter(o => Number(o.total_available_qty || 0) === 0).length})
                    </button>
                  </div>
                </div>

                <div className="filter-group">
                  {/* Active Sort Tag */}
                  {orderSort.key && orderSort.dir && (
                    <span
                      className="active-sort-pill"
                      onClick={() => setOrderSort({ key: '', dir: null })}
                      title="Click to clear sorting"
                    >
                      Sorted: <b>{orderSort.key.replace(/_/g, ' ').toUpperCase()}</b> ({orderSort.dir.toUpperCase()})
                      <X size={12} />
                    </span>
                  )}

                  <span className="filter-count-badge">
                    Showing <b>{filteredSortedOrders.length}</b> of {orders.length} orders
                  </span>

                  {(orderSearch || orderStatusFilter !== 'ALL' || orderStockFilter !== 'ALL' || orderSort.key) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ height: '30px', padding: '0 8px', fontSize: '11px', color: '#dc2626' }}
                      onClick={() => {
                        setOrderSearch('');
                        setOrderStatusFilter('ALL');
                        setOrderStockFilter('ALL');
                        setOrderSort({ key: '', dir: null });
                      }}
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              <div className="table-responsive card-table">
                <table>
                  <thead>
                    <tr>
                      <SortTh label="SO NUMBER" sortKey="so_number" currentSort={orderSort} onSort={handleOrderSort} />
                      <SortTh label="BUYER ORDER NO" sortKey="buyer_order_no" currentSort={orderSort} onSort={handleOrderSort} />
                      <SortTh label="CUSTOMER" sortKey="customer_name_snapshot" currentSort={orderSort} onSort={handleOrderSort} />
                      <SortTh label="EX-FACTORY DATE (DD-MM-YYYY)" sortKey="ex_fac_date" currentSort={orderSort} onSort={handleOrderSort} />
                      <SortTh label="STATUS" sortKey="status" currentSort={orderSort} onSort={handleOrderSort} />
                      <SortTh label="LINES" sortKey="line_count" currentSort={orderSort} onSort={handleOrderSort} />
                      <SortTh label="ORDERED QTY" sortKey="total_ordered_qty" currentSort={orderSort} onSort={handleOrderSort} />
                      <SortTh label="DISPATCHED" sortKey="total_dispatched_qty" currentSort={orderSort} onSort={handleOrderSort} />
                      <SortTh label="AVAILABLE" sortKey="total_available_qty" currentSort={orderSort} onSort={handleOrderSort} />
                      <th style={{ textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="font-mono font-bold text-indigo-700">{o.so_number}</td>
                        <td>{o.buyer_order_no || '—'}</td>
                        <td>{o.customer_name_snapshot || '—'}</td>
                        <td style={{ fontWeight: 600, color: '#0369a1' }}>{formatDate(o.ex_fac_date)}</td>
                        <td><span className={`pill ${o.status}`}>{o.status}</span></td>
                        <td>{o.line_count}</td>
                        <td className="font-semibold">{Number(o.total_ordered_qty).toFixed(0)}</td>
                        <td className="text-emerald-700 font-semibold">{Number(o.total_dispatched_qty || 0).toFixed(0)}</td>
                        <td className="text-indigo-700 font-bold">{Number(o.total_available_qty != null ? o.total_available_qty : o.total_ordered_qty).toFixed(0)}</td>
                        <td style={{ textAlign: 'center' }}>
                          {isAdmin ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ height: '28px', padding: '0 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#4338ca', fontWeight: 600 }}
                              onClick={() => handleOpenEditOrder(o)}
                              title="Admin: Edit Sales Order buyer order no, ex-factory date, or status"
                            >
                              <Pencil size={12} /> Edit SO
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>View Only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!filteredSortedOrders.length && (
                      <tr><td colSpan={10} className="empty-row">No sales orders found matching filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          """

text = text[:idx1] + new_orders_jsx + text[idx2:]

# 7. Replacement for Dispatches up to Consolidated
disp_start_marker = "/* PAGE: DISPATCH MANAGEMENT */"
consol_start_marker = "/* PAGE: CONSOLIDATED CENTRAL DASHBOARD */"

idx1 = text.find(disp_start_marker)
assert idx1 != -1, "disp_start_marker not found"
idx2 = text.find(consol_start_marker)
assert idx2 != -1, "consol_start_marker not found"

new_disp_jsx = """/* PAGE: DISPATCH MANAGEMENT */
          {page === 'dispatches' && (
            <div className="section-block">
              <div className="section-head">
                <div>
                  <h2>Dispatch Management ({activeCompany?.name})</h2>
                  <p>Deduction of allocation against From SO with optional accompanying With SO tagging</p>
                </div>
                <div className="actions-bar" style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-excel" onClick={exportDispatchesToExcel}>
                    <Download size={15} /> Download Excel
                  </button>
                  <button className="btn-primary" onClick={() => handleOpenDispatchModal()}>
                    <Truck size={15} /> Create New Dispatch
                  </button>
                </div>
              </div>

              {/* FILTER & SORT TOOLBAR FOR DISPATCHES */}
              <div className="filter-toolbar">
                <div className="filter-group">
                  <div className="search-bar" style={{ maxWidth: '340px', padding: '6px 12px' }}>
                    <Search size={15} className="text-slate-400" />
                    <input
                      placeholder="Search dispatch #, vehicle, notes, user..."
                      value={dispatchSearch}
                      onChange={(e) => setDispatchSearch(e.target.value)}
                    />
                    {dispatchSearch && (
                      <button
                        type="button"
                        onClick={() => setDispatchSearch('')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '0 2px' }}
                        title="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Status Dropdown */}
                  <select
                    className="filter-select"
                    value={dispatchStatusFilter}
                    onChange={(e) => setDispatchStatusFilter(e.target.value)}
                    title="Filter by Dispatch Status"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="POSTED">POSTED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>

                <div className="filter-group">
                  {/* Active Sort Tag */}
                  {dispatchSort.key && dispatchSort.dir && (
                    <span
                      className="active-sort-pill"
                      onClick={() => setDispatchSort({ key: '', dir: null })}
                      title="Click to clear sorting"
                    >
                      Sorted: <b>{dispatchSort.key.replace(/_/g, ' ').toUpperCase()}</b> ({dispatchSort.dir.toUpperCase()})
                      <X size={12} />
                    </span>
                  )}

                  <span className="filter-count-badge">
                    Showing <b>{filteredSortedDispatches.length}</b> of {dispatches.length} dispatches
                  </span>

                  {(dispatchSearch || dispatchStatusFilter !== 'ALL' || dispatchSort.key) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ height: '30px', padding: '0 8px', fontSize: '11px', color: '#dc2626' }}
                      onClick={() => {
                        setDispatchSearch('');
                        setDispatchStatusFilter('ALL');
                        setDispatchSort({ key: '', dir: null });
                      }}
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              <div className="table-responsive card-table">
                <table>
                  <thead>
                    <tr>
                      <SortTh label="DISPATCH NO" sortKey="dispatch_no" currentSort={dispatchSort} onSort={handleDispatchSort} />
                      <SortTh label="DATE (DD-MM-YYYY)" sortKey="dispatch_date" currentSort={dispatchSort} onSort={handleDispatchSort} />
                      <SortTh label="STATUS" sortKey="status" currentSort={dispatchSort} onSort={handleDispatchSort} />
                      <SortTh label="LINES" sortKey="line_count" currentSort={dispatchSort} onSort={handleDispatchSort} />
                      <SortTh label="TOTAL QTY" sortKey="total_quantity" currentSort={dispatchSort} onSort={handleDispatchSort} />
                      <SortTh label="NOTES / VEHICLE" sortKey="notes" currentSort={dispatchSort} onSort={handleDispatchSort} />
                      <SortTh label="CREATED BY" sortKey="creator_name" currentSort={dispatchSort} onSort={handleDispatchSort} />
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedDispatches.map((d) => (
                      <tr key={d.id}>
                        <td
                          className="font-mono font-bold text-indigo-700 cursor-pointer hover:underline"
                          onClick={() => handleViewDispatchDetail(d.id)}
                          title="Click to view dispatch details and line items"
                        >
                          {d.dispatch_no}
                        </td>
                        <td style={{ fontWeight: 600, color: '#0369a1' }}>{formatDate(d.dispatch_date)}</td>
                        <td><span className={`pill ${d.status}`}>{d.status}</span></td>
                        <td>{d.line_count || 1}</td>
                        <td className="font-semibold">{d.total_quantity || '—'}</td>
                        <td className="text-slate-500 text-xs">{d.notes || '—'}</td>
                        <td>{d.creator_name || '—'}</td>
                        <td className="space-x-2">
                          <button
                            className="btn-action-edit"
                            onClick={() => handleViewDispatchDetail(d.id)}
                            style={{ marginRight: '6px' }}
                          >
                            <Eye size={12} /> View Slip
                          </button>
                          {d.status === 'DRAFT' && (
                            <button className="btn-action-post" onClick={() => handlePostDispatch(d.id)}>
                              Post & Deduct
                            </button>
                          )}
                          {d.status === 'POSTED' && (
                            <button className="btn-action-cancel" onClick={() => handleCancelDispatch(d.id)}>
                              Cancel & Restore
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!filteredSortedDispatches.length && (
                      <tr><td colSpan={8} className="empty-row">No dispatches match the selected filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          """

text = text[:idx1] + new_disp_jsx + text[idx2:]

# 8. Replacement for Consolidated Central Dashboard
consol_start_marker = "/* PAGE: CONSOLIDATED CENTRAL DASHBOARD */"
company_start_marker = "/* PAGE: COMPANY MANAGEMENT */"

idx1 = text.find(consol_start_marker)
assert idx1 != -1, "consol_start_marker not found"
idx2 = text.find(company_start_marker)
assert idx2 != -1, "company_start_marker not found"

new_consol_jsx = """/* PAGE: CONSOLIDATED CENTRAL DASHBOARD */
          {page === 'consolidated' && consolidatedSummary && (
            <div className="section-block">
              <div className="section-head">
                <div>
                  <h2>Central Administrator Consolidated Dashboard</h2>
                  <p>Cross-company performance, tenant health, and aggregate operations</p>
                </div>
              </div>

              <div className="kpi-grid">
                <div className="kpi-card">
                  <small>Registered Companies</small>
                  <b>{consolidatedSummary.global.total_companies}</b>
                </div>
                <div className="kpi-card">
                  <small>Active Users</small>
                  <b>{consolidatedSummary.global.total_users}</b>
                </div>
                <div className="kpi-card">
                  <small>Aggregate Orders</small>
                  <b>{consolidatedSummary.global.total_orders}</b>
                </div>
                <div className="kpi-card">
                  <small>Global Ordered Units</small>
                  <b>{Number(consolidatedSummary.global.total_ordered_qty).toFixed(0)}</b>
                </div>
              </div>

              {/* Central Companies Filter Bar */}
              <div className="filter-toolbar" style={{ marginTop: '16px' }}>
                <div className="filter-group">
                  <div className="search-bar" style={{ maxWidth: '320px', padding: '6px 12px' }}>
                    <Search size={15} className="text-slate-400" />
                    <input
                      placeholder="Search company name, code, sector..."
                      value={centralSearch}
                      onChange={(e) => setCentralSearch(e.target.value)}
                    />
                    {centralSearch && (
                      <button
                        type="button"
                        onClick={() => setCentralSearch('')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '0 2px' }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="filter-group">
                  <span className="filter-count-badge">
                    Showing <b>{filteredSortedCompanies.length}</b> companies
                  </span>
                </div>
              </div>

              <div className="table-responsive card-table">
                <table>
                  <thead>
                    <tr>
                      <SortTh label="COMPANY" sortKey="name" currentSort={centralSort} onSort={handleCentralSort} />
                      <SortTh label="CODE" sortKey="code" currentSort={centralSort} onSort={handleCentralSort} />
                      <SortTh label="PRODUCTS" sortKey="products_count" currentSort={centralSort} onSort={handleCentralSort} />
                      <SortTh label="ORDERS" sortKey="orders_count" currentSort={centralSort} onSort={handleCentralSort} />
                      <SortTh label="POSTED DISPATCHES" sortKey="posted_dispatches_count" currentSort={centralSort} onSort={handleCentralSort} />
                      <SortTh label="ORDERED QTY" sortKey="ordered_qty" currentSort={centralSort} onSort={handleCentralSort} />
                      <SortTh label="DISPATCHED QTY" sortKey="dispatched_qty" currentSort={centralSort} onSort={handleCentralSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedCompanies.map((c: any) => (
                      <tr key={c.id}>
                        <td className="font-semibold">{c.name}</td>
                        <td className="font-mono">{c.code}</td>
                        <td>{c.products_count}</td>
                        <td>{c.orders_count}</td>
                        <td>{c.posted_dispatches_count}</td>
                        <td>{Number(c.ordered_qty).toFixed(0)}</td>
                        <td className="text-emerald-700 font-semibold">{Number(c.dispatched_qty).toFixed(0)}</td>
                      </tr>
                    ))}
                    {!filteredSortedCompanies.length && (
                      <tr><td colSpan={7} className="empty-row">No companies found matching search.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          """

text = text[:idx1] + new_consol_jsx + text[idx2:]

# 9. Replacement for Audit Trail
audit_start_marker = "/* PAGE: AUDIT TRAIL */"
audit_end_marker = "</div>\n      </main>"

idx1 = text.find(audit_start_marker)
assert idx1 != -1, "audit_start_marker not found"
idx2 = text.find(audit_end_marker, idx1)
assert idx2 != -1, "audit_end_marker not found"

new_audit_jsx = """/* PAGE: AUDIT TRAIL */
          {page === 'audit' && (
            <div className="section-block">
              <div className="section-head">
                <div>
                  <h2>Immutable Database Audit Trail ({activeCompany?.name})</h2>
                  <p>Append-only audit logs recording business operations, mutations, and user attribution</p>
                </div>
              </div>

              {/* FILTER & SORT TOOLBAR FOR AUDIT */}
              <div className="filter-toolbar">
                <div className="filter-group">
                  <div className="search-bar" style={{ maxWidth: '340px', padding: '6px 12px' }}>
                    <Search size={15} className="text-slate-400" />
                    <input
                      placeholder="Search user, action, entity, target ID..."
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                    />
                    {auditSearch && (
                      <button
                        type="button"
                        onClick={() => setAuditSearch('')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '0 2px' }}
                        title="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Action filter */}
                  {auditActions.length > 0 && (
                    <select
                      className="filter-select"
                      value={auditActionFilter}
                      onChange={(e) => setAuditActionFilter(e.target.value)}
                      title="Filter by Action"
                    >
                      <option value="ALL">All Actions</option>
                      {auditActions.map((act) => (
                        <option key={act} value={act}>{act}</option>
                      ))}
                    </select>
                  )}

                  {/* Entity filter */}
                  {auditEntities.length > 0 && (
                    <select
                      className="filter-select"
                      value={auditEntityFilter}
                      onChange={(e) => setAuditEntityFilter(e.target.value)}
                      title="Filter by Entity Type"
                    >
                      <option value="ALL">All Entities</option>
                      {auditEntities.map((ent) => (
                        <option key={ent} value={ent}>{ent}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="filter-group">
                  {/* Active Sort Tag */}
                  {auditSort.key && auditSort.dir && (
                    <span
                      className="active-sort-pill"
                      onClick={() => setAuditSort({ key: '', dir: null })}
                      title="Click to clear sorting"
                    >
                      Sorted: <b>{auditSort.key.toUpperCase()}</b> ({auditSort.dir.toUpperCase()})
                      <X size={12} />
                    </span>
                  )}

                  <span className="filter-count-badge">
                    Showing <b>{filteredSortedAudits.length}</b> of {auditLogs.length} logs
                  </span>

                  {(auditSearch || auditActionFilter !== 'ALL' || auditEntityFilter !== 'ALL' || auditSort.key) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ height: '30px', padding: '0 8px', fontSize: '11px', color: '#dc2626' }}
                      onClick={() => {
                        setAuditSearch('');
                        setAuditActionFilter('ALL');
                        setAuditEntityFilter('ALL');
                        setAuditSort({ key: '', dir: null });
                      }}
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              <div className="table-responsive card-table">
                <table>
                  <thead>
                    <tr>
                      <SortTh label="LOG ID" sortKey="id" currentSort={auditSort} onSort={handleAuditSort} />
                      <SortTh label="TIMESTAMP (DD-MM-YYYY)" sortKey="created_at" currentSort={auditSort} onSort={handleAuditSort} />
                      <SortTh label="USER" sortKey="username" currentSort={auditSort} onSort={handleAuditSort} />
                      <SortTh label="ACTION" sortKey="action" currentSort={auditSort} onSort={handleAuditSort} />
                      <SortTh label="ENTITY" sortKey="entity_type" currentSort={auditSort} onSort={handleAuditSort} />
                      <SortTh label="TARGET ID" sortKey="entity_id" currentSort={auditSort} onSort={handleAuditSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedAudits.map((a) => (
                      <tr key={a.id}>
                        <td className="font-mono">#{a.id}</td>
                        <td style={{ color: '#0369a1', fontWeight: 600 }}>{formatDate(a.created_at)}</td>
                        <td>{a.username || `User #${a.user_id}`}</td>
                        <td><span className={`pill action-${a.action}`}>{a.action}</span></td>
                        <td className="font-semibold">{a.entity_type}</td>
                        <td className="font-mono">{a.entity_id}</td>
                      </tr>
                    ))}
                    {!filteredSortedAudits.length && (
                      <tr><td colSpan={6} className="empty-row">No audit records match the selected filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        """

text = text[:idx1] + new_audit_jsx + text[idx2:]

# 10. Replacement for Fullscreen Matrix Modal
fs_start_marker = "{matrixFullscreen && ("
fs_end_marker = "{/* VIEW DISPATCH DETAILS MODAL */}"

idx1 = text.find(fs_start_marker)
assert idx1 != -1, "fs_start_marker not found"
idx2 = text.find(fs_end_marker)
assert idx2 != -1, "fs_end_marker not found"

new_fs_jsx = """{matrixFullscreen && (
        <div className="matrix-fullscreen-wrapper">
          <div className="matrix-fullscreen-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Grid size={20} className="text-indigo-400" />
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, letterSpacing: '0.5px' }}>
                DYNAMIC MATRIX DASHBOARD ({activeCompany?.name}) &mdash; FULL SCREEN MODE
              </h3>
              <span style={{ fontSize: '12px', background: '#334155', color: '#93c5fd', padding: '3px 10px', borderRadius: '9999px', fontWeight: 600 }}>
                {matrixData.salesOrders.length} SO Columns &bull; {filteredSortedMatrixProducts.length} Products
              </span>
            </div>

            {/* Fullscreen Search & Filter Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', padding: '2px 8px', gap: '6px' }}>
                <Search size={14} className="text-slate-400" />
                <input
                  placeholder="Filter products..."
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: '#ffffff', outline: 'none', fontSize: '12px', width: '160px' }}
                />
                {matrixSearch && (
                  <button
                    type="button"
                    onClick={() => setMatrixSearch('')}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Quick Stock Filter */}
              <button
                type="button"
                style={{
                  height: '28px',
                  padding: '0 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: '5px',
                  border: matrixStockFilter === 'IN_STOCK' ? '1px solid #10b981' : '1px solid #475569',
                  background: matrixStockFilter === 'IN_STOCK' ? '#065f46' : '#1e293b',
                  color: '#ffffff',
                  cursor: 'pointer'
                }}
                onClick={() => setMatrixStockFilter(prev => prev === 'IN_STOCK' ? 'ALL' : 'IN_STOCK')}
              >
                In Stock Only
              </button>

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
                    <SortTh label="SKU / ITEM CODE" sortKey="item_code" currentSort={matrixSort} onSort={handleMatrixSort} className="sticky-col col-sku" />
                    <SortTh label="DESCRIPTION" sortKey="description" currentSort={matrixSort} onSort={handleMatrixSort} className="col-desc" />
                    <SortTh label="FINISH" sortKey="finish" currentSort={matrixSort} onSort={handleMatrixSort} className="col-finish" />
                    <SortTh label="CBM" sortKey="master_cbm" currentSort={matrixSort} onSort={handleMatrixSort} className="col-cbm" />
                    {matrixData.salesOrders.map((so) => {
                      const isSorted = matrixSort.key === so.soNumber && matrixSort.dir !== null;
                      return (
                        <th
                          key={so.id}
                          className="so-header-col sortable-th"
                          onClick={() => handleMatrixSort(so.soNumber)}
                          title={`Click to sort products by balance in ${so.soNumber}`}
                          style={{ cursor: 'pointer', userSelect: 'none' }}
                        >
                          <div className="so-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <span>{so.soNumber}</span>
                            <span style={{ opacity: isSorted ? 1 : 0.35 }}>
                              {isSorted ? (
                                matrixSort.dir === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                              ) : (
                                <ArrowUpDown size={11} />
                              )}
                            </span>
                          </div>
                          <div className="so-date" style={{ color: '#0369a1', fontWeight: 600 }}>
                            {formatDate(so.exFacDate)}
                          </div>
                        </th>
                      );
                    })}
                    <SortTh label="TOTAL REMAINING" sortKey="totalAvailableStock" currentSort={matrixSort} onSort={handleMatrixSort} className="col-total-stock" align="right" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSortedMatrixProducts.map((p) => (
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
                  {!filteredSortedMatrixProducts.length && (
                    <tr>
                      <td colSpan={6 + matrixData.salesOrders.length} className="empty-row">
                        No products match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      """

text = text[:idx1] + new_fs_jsx + text[idx2:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Step 2 applied all 7 tables with filtering and sorting successfully!")
