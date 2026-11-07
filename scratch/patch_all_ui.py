import re

app_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update newProd state definition to include Box 2, Box 3, Cartons, and Image
old_newprod = '''  const [newProd, setNewProd] = useState({
    itemCode: '',
    buyerCode: '',
    description: '',
    finish: '',
    masterCbm: '',
    weightValue: '',
    box1Length: '',
    box1Width: '',
    box1Height: ''
  });'''

new_newprod = '''  const [newProd, setNewProd] = useState<any>({
    itemCode: '',
    buyerCode: '',
    description: '',
    finish: '',
    box1Length: '', box1Width: '', box1Height: '',
    box2Length: '', box2Width: '', box2Height: '',
    box3Length: '', box3Width: '', box3Height: '',
    cartonsCount: 1,
    masterCbm: '',
    weightValue: '',
    imageBase64: '',
    imageFilename: ''
  });
  const [newProdImagePreview, setNewProdImagePreview] = useState<string>('');'''

if old_newprod in code:
    code = code.replace(old_newprod, new_newprod, 1)
    print('Updated newProd state definition')
else:
    print('old_newprod not found')

# 2. Add isAdmin definition next to activeCompany
old_ac = "  const activeCompany = companies.find((c) => Number(c.id) === Number(activeCompanyId));"
new_ac = '''  const activeCompany = companies.find((c) => Number(c.id) === Number(activeCompanyId));
  const isAdmin = user?.role === 'CENTRAL_ADMIN' || user?.role === 'COMPANY_ADMIN';'''

if old_ac in code:
    code = code.replace(old_ac, new_ac, 1)
    print('Added isAdmin flag')
else:
    print('old_ac not found')

# 3. Add image preview click handler for Matrix image to be bigger
# In the matrix table: size={52}
code = code.replace(
'''                          <ProductImg
                            itemCode={p.item_code}
                            companyId={activeCompanyId}
                            onPreview={(url) => setPreviewImage({ url, title: `${p.item_code} — ${p.description || ''}` })}
                          />''',
'''                          <ProductImg
                            itemCode={p.item_code}
                            companyId={activeCompanyId}
                            size={52}
                            onPreview={(url) => setPreviewImage({ url, title: `${p.item_code} — ${p.description || ''}` })}
                          />'''
)

# 4. Update Product Master table header and rows to include Box 1, 2, 3 and Actions (Admin Edit)
old_pm_head = '''                    <tr>
                      <th style={{ width: '48px', textAlign: 'center' }}>IMAGE</th>
                      <th>ITEM CODE</th>
                      <th>BUYER CODE</th>
                      <th>DESCRIPTION</th>
                      <th>FINISH</th>
                      <th>BOX 1 (LA-WA-H)</th>
                      <th>MASTER CBM</th>
                      <th>WEIGHT</th>
                    </tr>'''

new_pm_head = '''                    <tr>
                      <th style={{ width: '60px', textAlign: 'center' }}>IMAGE</th>
                      <th>ITEM CODE</th>
                      <th>BUYER CODE</th>
                      <th>DESCRIPTION</th>
                      <th>FINISH</th>
                      <th>BOX 1 (L×W×H cm)</th>
                      <th>BOX 2 (L×W×H cm)</th>
                      <th>BOX 3 (L×W×H cm)</th>
                      <th style={{ textAlign: 'center' }}>CTNS</th>
                      <th>MASTER CBM</th>
                      <th>WEIGHT</th>
                      <th style={{ textAlign: 'center' }}>ACTIONS</th>
                    </tr>'''

code = code.replace(old_pm_head, new_pm_head, 1)

old_pm_row = '''                      <tr key={p.id}>
                        <td style={{ textAlign: 'center', padding: '4px' }}>
                          <ProductImg
                            itemCode={p.item_code}
                            companyId={activeCompanyId}
                            onPreview={(url) => setPreviewImage({ url, title: `${p.item_code} — ${p.description || ''}` })}
                          />
                        </td>
                        <td className="font-mono font-bold text-indigo-700">{p.item_code}</td>
                        <td>{p.buyer_code || '—'}</td>
                        <td>{p.description}</td>
                        <td>{p.finish || '—'}</td>
                        <td>
                          {p.box1_length ? `${p.box1_length} A- ${p.box1_width} A- ${p.box1_height}` : '—'}
                        </td>
                        <td>{p.master_cbm ? Number(p.master_cbm).toFixed(3) : '—'}</td>
                        <td>{p.weight_value ? `${p.weight_value} ${p.weight_uom}` : '—'}</td>
                      </tr>'''

new_pm_row = '''                      <tr key={p.id}>
                        <td style={{ textAlign: 'center', padding: '4px' }}>
                          <ProductImg
                            itemCode={p.item_code}
                            companyId={activeCompanyId}
                            size={48}
                            onPreview={(url) => setPreviewImage({ url, title: `${p.item_code} — ${p.description || ''}` })}
                          />
                        </td>
                        <td className="font-mono font-bold text-indigo-700">{p.item_code}</td>
                        <td>{p.buyer_code || '—'}</td>
                        <td>{p.description}</td>
                        <td><span className="badge-finish">{p.finish || '—'}</span></td>
                        <td className="font-mono" style={{ fontSize: '11px' }}>
                          {p.box1_length ? `${p.box1_length} × ${p.box1_width} × ${p.box1_height}` : '—'}
                        </td>
                        <td className="font-mono" style={{ fontSize: '11px' }}>
                          {p.box2_length ? `${p.box2_length} × ${p.box2_width} × ${p.box2_height}` : '—'}
                        </td>
                        <td className="font-mono" style={{ fontSize: '11px' }}>
                          {p.box3_length ? `${p.box3_length} × ${p.box3_width} × ${p.box3_height}` : '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{p.cartons_count || 1}</td>
                        <td className="font-mono">{p.master_cbm ? Number(p.master_cbm).toFixed(3) : '—'}</td>
                        <td>{p.weight_value ? `${p.weight_value} ${p.weight_uom || 'KG'}` : '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {isAdmin ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ height: '28px', padding: '0 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#4338ca', fontWeight: 600 }}
                              onClick={() => handleOpenEditProduct(p)}
                              title="Admin: Edit product specifications, box dimensions, and image"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>View Only</span>
                          )}
                        </td>
                      </tr>'''

code = code.replace(old_pm_row, new_pm_row, 1)

# Also update colSpan for empty row in Product Master
code = code.replace('<td colSpan={8} className="empty-row">No products found.</td>', '<td colSpan={12} className="empty-row">No products found.</td>')

# 5. Update Sales Orders table header and rows to include Actions (Admin Edit)
old_so_head = '''                    <tr>
                      <th>SO NUMBER</th>
                      <th>BUYER ORDER NO</th>
                      <th>CUSTOMER</th>
                      <th>EX-FACTORY DATE (DD-MM-YYYY)</th>
                      <th>STATUS</th>
                      <th>LINES</th>
                      <th>ORDERED QTY</th>
                      <th>DISPATCHED</th>
                      <th>AVAILABLE</th>
                    </tr>'''

new_so_head = '''                    <tr>
                      <th>SO NUMBER</th>
                      <th>BUYER ORDER NO</th>
                      <th>CUSTOMER</th>
                      <th>EX-FACTORY DATE (DD-MM-YYYY)</th>
                      <th>STATUS</th>
                      <th>LINES</th>
                      <th>ORDERED QTY</th>
                      <th>DISPATCHED</th>
                      <th>AVAILABLE</th>
                      <th style={{ textAlign: 'center' }}>ACTIONS</th>
                    </tr>'''

code = code.replace(old_so_head, new_so_head, 1)

old_so_row = '''                      <tr key={o.id}>
                        <td className="font-mono font-bold text-indigo-700">{o.so_number}</td>
                        <td>{o.buyer_order_no || '—'}</td>
                        <td>{o.customer_name_snapshot || '—'}</td>
                        <td style={{ fontWeight: 600, color: '#0369a1' }}>{formatDate(o.ex_fac_date)}</td>
                        <td><span className={`pill ${o.status}`}>{o.status}</span></td>
                        <td>{o.line_count}</td>
                        <td className="font-semibold">{Number(o.total_ordered_qty).toFixed(0)}</td>
                        <td className="text-emerald-700">{Number(o.total_dispatched_qty).toFixed(0)}</td>
                        <td className="text-indigo-700 font-bold">{Number(o.total_available_qty).toFixed(0)}</td>
                      </tr>'''

new_so_row = '''                      <tr key={o.id}>
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
                      </tr>'''

code = code.replace(old_so_row, new_so_row, 1)

code = code.replace('<td colSpan={9} className="empty-row">No sales orders found for this company.</td>', '<td colSpan={10} className="empty-row">No sales orders found for this company.</td>')

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(code)

print('Updated Product Master and Sales Orders tables with Admin Edit buttons and 3 Box columns')
