import re

# 1. Update RawDataImportModal.tsx
with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\RawDataImportModal.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Add import
if 'utils/decimal' not in text:
    text = text.replace(
        "import * as XLSX from 'xlsx';",
        "import * as XLSX from 'xlsx';\nimport { roundHalfUp, formatCbm, formatMoney, formatDimension, formatQty } from './utils/decimal';"
    )

# Update ExistingRecordSnapshot interface
text = text.replace(
    '  priceReduce: number | null;\n  dispatchedQty: number;',
    '  priceReduce: number | null;\n  unitCbm?: number | null;\n  dispatchedQty: number;'
)

# Update ValidatedRawRow interface
text = text.replace(
    '  isInFileDuplicate: boolean;\n  originalData: any;',
    '  isInFileDuplicate: boolean;\n  isRounded?: boolean;\n  validationCategory?: \'VALID\' | \'ROUNDED\' | \'WARNING\' | \'ERROR\';\n  originalData: any;'
)

# Update RawDataValidationResult interface
text = text.replace(
    '  internalDuplicateRows: number;\n  validatedRecords: ValidatedRawRow[];',
    '  internalDuplicateRows: number;\n  roundedRows?: number;\n  validatedRecords: ValidatedRawRow[];'
)

# Add ROUNDED to previewTab type
text = text.replace(
    "const [previewTab, setPreviewTab] = useState<'ALL' | 'NEW' | 'MODIFIED' | 'EXACT_DUPLICATE' | 'INTERNAL_DUPLICATE' | 'INVALID'>('ALL');",
    "const [previewTab, setPreviewTab] = useState<'ALL' | 'NEW' | 'MODIFIED' | 'ROUNDED' | 'EXACT_DUPLICATE' | 'INTERNAL_DUPLICATE' | 'INVALID'>('ALL');"
)

# In filteredRecords, support ROUNDED tab
text = text.replace(
    "if (previewTab === 'MODIFIED' && r.classification !== 'MODIFIED') return false;",
    "if (previewTab === 'MODIFIED' && r.classification !== 'MODIFIED') return false;\n      if (previewTab === 'ROUNDED' && !r.isRounded) return false;"
)

# 6 SUMMARY CARDS in Step 3
old_cards = '''              {/* 5 SUMMARY CARDS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>TOTAL RECORDS</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{records.length}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Parsed from Excel</div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803d' }}>NEW RECORDS</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>{validationResult.newRows || 0}</div>
                  <div style={{ fontSize: '11px', color: '#16a34a' }}>Brand new SOs</div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e40af' }}>EXACT DUPLICATES</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>{validationResult.exactDuplicateRows || 0}</div>
                  <div style={{ fontSize: '11px', color: '#3b82f6' }}>Existing match (Skip)</div>
                </div>

                <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '10px', padding: '12px 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#a16207' }}>MODIFIED RECORDS</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#ca8a04', marginTop: '2px' }}>{validationResult.modifiedRows || 0}</div>
                  <div style={{ fontSize: '11px', color: '#ca8a04' }}>SO exists, values differ</div>
                </div>

                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', padding: '12px 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#be123c' }}>INTERNAL DUPLICATES</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#e11d48', marginTop: '2px' }}>{validationResult.internalDuplicateRows || 0}</div>
                  <div style={{ fontSize: '11px', color: '#e11d48' }}>Repeats inside file</div>
                </div>
              </div>'''

new_cards = '''              {/* SUMMARY CARDS WITH ROUNDED PRECISION METRICS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>TOTAL RECORDS</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{records.length}</div>
                  <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Parsed from Excel</div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803d' }}>NEW RECORDS</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>{validationResult.newRows || 0}</div>
                  <div style={{ fontSize: '10.5px', color: '#16a34a' }}>Brand new SOs</div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e40af' }}>EXACT DUPLICATES</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>{validationResult.exactDuplicateRows || 0}</div>
                  <div style={{ fontSize: '10.5px', color: '#3b82f6' }}>Existing match (Skip)</div>
                </div>

                <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#a16207' }}>MODIFIED RECORDS</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#ca8a04', marginTop: '2px' }}>{validationResult.modifiedRows || 0}</div>
                  <div style={{ fontSize: '10.5px', color: '#ca8a04' }}>Values differ</div>
                </div>

                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1' }}>ROUNDED (0.000)</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#0284c7', marginTop: '2px' }}>{validationResult.roundedRows || 0}</div>
                  <div style={{ fontSize: '10.5px', color: '#0284c7' }}>Normalized CBM/Price</div>
                </div>

                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#be123c' }}>INTERNAL DUPS</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#e11d48', marginTop: '2px' }}>{validationResult.internalDuplicateRows || 0}</div>
                  <div style={{ fontSize: '10.5px', color: '#e11d48' }}>Repeats in file</div>
                </div>
              </div>'''

text = text.replace('\r\n', '\n')
old_c_norm = old_cards.replace('\r\n', '\n')
new_c_norm = new_cards.replace('\r\n', '\n')
text = text.replace(old_c_norm, new_c_norm)

# Update Filter Tabs in Step 3
old_tabs = '''                {[
                  { key: 'ALL', label: 'All Records', count: records.length, color: '#0f172a' },
                  { key: 'NEW', label: 'New Records', count: validationResult.newRows || 0, color: '#059669' },
                  { key: 'MODIFIED', label: 'Modified Conflicts', count: validationResult.modifiedRows || 0, color: '#ca8a04' },
                  { key: 'EXACT_DUPLICATE', label: 'Exact Duplicates', count: validationResult.exactDuplicateRows || 0, color: '#475569' },
                  { key: 'INTERNAL_DUPLICATE', label: 'File Duplicates', count: validationResult.internalDuplicateRows || 0, color: '#e11d48' },
                  { key: 'INVALID', label: 'Invalid / Errors', count: validationResult.invalidRows || 0, color: '#b91c1c' }
                ].map(t => ('''

new_tabs = '''                {[
                  { key: 'ALL', label: 'All Records', count: records.length, color: '#0f172a' },
                  { key: 'NEW', label: 'New Records', count: validationResult.newRows || 0, color: '#059669' },
                  { key: 'MODIFIED', label: 'Modified Conflicts', count: validationResult.modifiedRows || 0, color: '#ca8a04' },
                  { key: 'ROUNDED', label: 'Rounded (3 Decimals)', count: validationResult.roundedRows || 0, color: '#0284c7' },
                  { key: 'EXACT_DUPLICATE', label: 'Exact Duplicates', count: validationResult.exactDuplicateRows || 0, color: '#475569' },
                  { key: 'INTERNAL_DUPLICATE', label: 'File Duplicates', count: validationResult.internalDuplicateRows || 0, color: '#e11d48' },
                  { key: 'INVALID', label: 'Invalid / Errors', count: validationResult.invalidRows || 0, color: '#b91c1c' }
                ].map(t => ('''

old_t_norm = old_tabs.replace('\r\n', '\n')
new_t_norm = new_tabs.replace('\r\n', '\n')
text = text.replace(old_t_norm, new_t_norm)

# Update Existing System Value and Uploaded Excel Value in Comparison Table
old_row_cells = '''                            {/* Existing System Value */}
                            <td style={{ padding: '10px 14px', fontSize: '11.5px', color: '#475569' }}>
                              {snap ? (
                                <div>
                                  <div>Qty: <strong style={{ color: '#0f172a' }}>{snap.quantity}</strong> | Price: <strong>{snap.priceUnit ? `${r.currency} ${snap.priceUnit}` : '—'}</strong></div>
                                  <div style={{ fontSize: '11px', color: '#64748b' }}>Date: {snap.exFacDate || '—'} | PO: {snap.buyerOrderNo || '—'}</div>
                                  {snap.dispatchedQty > 0 && (
                                    <div style={{ fontSize: '10.5px', color: '#047857', fontWeight: 600 }}>Dispatched: {snap.dispatchedQty} (Allocated)</div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Record does not exist</span>
                              )}
                            </td>

                            {/* Uploaded Excel Value */}
                            <td style={{ padding: '10px 14px', fontSize: '11.5px' }}>
                              <div>
                                <div>Qty: <strong style={{ color: '#047857' }}>{r.quantity} {r.uom}</strong> | Price: <strong>{r.priceUnit ? `${r.currency} ${r.priceUnit}` : '—'}</strong></div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>Date: {r.shipDate || '—'} | PO: {r.buyerOrderNo || '—'}</div>
                                {r.finish && <div style={{ fontSize: '10.5px', color: '#475569' }}>Finish: {r.finish}</div>}'''

new_row_cells = '''                            {/* Existing System Value */}
                            <td style={{ padding: '10px 14px', fontSize: '11.5px', color: '#475569' }}>
                              {snap ? (
                                <div>
                                  <div>Qty: <strong style={{ color: '#0f172a' }}>{formatQty(snap.quantity)}</strong> | Price: <strong>{snap.priceUnit ? formatMoney(snap.priceUnit, r.currency) : '—'}</strong></div>
                                  <div style={{ fontSize: '11px', color: '#64748b' }}>CBM: <strong style={{ color: '#0f172a' }}>{formatCbm(snap.unitCbm, true)}</strong> | Date: {snap.exFacDate || '—'}</div>
                                  {snap.dispatchedQty > 0 && (
                                    <div style={{ fontSize: '10.5px', color: '#047857', fontWeight: 600 }}>Dispatched: {formatQty(snap.dispatchedQty)} (Allocated)</div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Record does not exist</span>
                              )}
                            </td>

                            {/* Uploaded Excel Value */}
                            <td style={{ padding: '10px 14px', fontSize: '11.5px' }}>
                              <div>
                                <div>Qty: <strong style={{ color: '#047857' }}>{formatQty(r.quantity)} {r.uom}</strong> | Price: <strong>{r.priceUnit ? formatMoney(r.priceUnit, r.currency) : '—'}</strong></div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>CBM: <strong style={{ color: '#047857' }}>{formatCbm(r.unitCbm, true)}</strong> | Date: {r.shipDate || '—'}</div>
                                {r.finish && <div style={{ fontSize: '10.5px', color: '#475569' }}>Finish: {r.finish}</div>}
                                {r.isRounded && (
                                  <div style={{ marginTop: '2px' }}>
                                    <span style={{ fontSize: '9.5px', background: '#e0f2fe', color: '#0369a1', padding: '1px 5px', borderRadius: '4px', border: '1px solid #bae6fd', fontWeight: 600 }}>
                                      CBM Normalized (3 Decimals)
                                    </span>
                                  </div>
                                )}'''

old_rc_norm = old_row_cells.replace('\r\n', '\n')
new_rc_norm = new_row_cells.replace('\r\n', '\n')
text = text.replace(old_rc_norm, new_rc_norm)

with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\RawDataImportModal.tsx', 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(text)

print('Updated RawDataImportModal.tsx successfully!')
