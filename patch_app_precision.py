import re

with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Normalize newlines
text = text.replace('\r\n', '\n')

# 1. Add import
if 'utils/decimal' not in text:
    text = text.replace(
        "import * as XLSX from 'xlsx';",
        "import * as XLSX from 'xlsx';\nimport { roundHalfUp, formatCbm, formatMoney, formatDimension, formatQty } from './utils/decimal';"
    )

# 2. Fix date shift in handleOpenEditOrder
old_date = '''    if (o.ex_fac_date) {
      const d = new Date(o.ex_fac_date);
      if (!isNaN(d.getTime())) {
        dateStr = d.toISOString().slice(0, 10);
      }
    }'''

new_date = '''    if (o.ex_fac_date) {
      if (typeof o.ex_fac_date === 'string' && o.ex_fac_date.length >= 10) {
        dateStr = o.ex_fac_date.slice(0, 10);
      } else {
        const d = new Date(o.ex_fac_date);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          dateStr = `${y}-${m}-${day}`;
        }
      }
    }'''

text = text.replace(old_date, new_date)

# 3. Product Export in Excel
old_prod_export = '''    const headers = ['ITEM CODE', 'BUYER CODE', 'DESCRIPTION', 'FINISH', 'BOX1 LENGTH', 'BOX1 WIDTH', 'BOX1 HEIGHT', 'MASTER CBM', 'PRICE', 'WEIGHT'];
    const rows = listToExport.map((p) => [
      p.item_code,
      p.buyer_code || '',
      p.description || '',
      p.finish || '',
      p.box1_length || '',
      p.box1_width || '',
      p.box1_height || '',
      p.master_cbm ? Number(p.master_cbm).toFixed(3) : '',
      p.unit_price || p.latest_rate || '',
      p.weight_value ? `${p.weight_value} ${p.weight_uom}` : ''
    ]);'''

new_prod_export = '''    const headers = ['ITEM CODE', 'BUYER CODE', 'DESCRIPTION', 'FINISH', 'BOX1 LENGTH (cm)', 'BOX1 WIDTH (cm)', 'BOX1 HEIGHT (cm)', 'MASTER CBM', 'PRICE', 'WEIGHT'];
    const rows = listToExport.map((p) => [
      p.item_code,
      p.buyer_code || '',
      p.description || '',
      p.finish || '',
      p.box1_length != null && p.box1_length !== '' ? roundHalfUp(Number(p.box1_length), 2) : '',
      p.box1_width != null && p.box1_width !== '' ? roundHalfUp(Number(p.box1_width), 2) : '',
      p.box1_height != null && p.box1_height !== '' ? roundHalfUp(Number(p.box1_height), 2) : '',
      p.master_cbm != null && p.master_cbm !== '' ? roundHalfUp(Number(p.master_cbm), 3) : '',
      p.unit_price != null && p.unit_price !== '' ? roundHalfUp(Number(p.unit_price), 2) : (p.latest_rate != null && p.latest_rate !== '' ? roundHalfUp(Number(p.latest_rate), 2) : ''),
      p.weight_value ? `${p.weight_value} ${p.weight_uom}` : ''
    ]);'''

text = text.replace(old_prod_export, new_prod_export)

# 4. Matrix & Fullscreen Matrix view CBM & Price (replaces all occurrences)
old_matrix_cells = "<td>{p.master_cbm ? Number(p.master_cbm).toFixed(3) : '—'}</td>\n                        <td className=\"col-price\" style={{ textAlign: 'right', fontWeight: 600, color: '#047857' }}>{p.latest_rate ? `${activeCompany?.currency_code || '$'} ${Number(p.latest_rate).toFixed(2)}` : '—'}</td>"
new_matrix_cells = '<td>{formatCbm(p.master_cbm)}</td>\n                        <td className="col-price" style={{ textAlign: \'right\', fontWeight: 600, color: \'#047857\' }}>{p.latest_rate ? formatMoney(p.latest_rate, activeCompany?.currency_code || \'$\') : \'—\'}</td>'

text = text.replace(old_matrix_cells, new_matrix_cells)

# 5. Product Master CBM, Dimensions & Price
old_pm = '''                          {p.box1_length ? `${p.box1_length} × ${p.box1_width} × ${p.box1_height} cm` : '—'}
                          {p.cartons_count > 1 && (
                            <small style={{ display: 'block', color: '#6366f1', fontWeight: 600 }}>({p.cartons_count} boxes)</small>
                          )}
                        </td>
                        <td>{p.master_cbm ? Number(p.master_cbm).toFixed(3) : '—'}</td>
                        <td className="col-price" style={{ textAlign: 'right', fontWeight: 600, color: '#047857' }}>{p.latest_rate ? `${activeCompany?.currency_code || '$'} ${Number(p.latest_rate).toFixed(2)}` : '—'}</td>'''

new_pm = '''                          {p.box1_length ? `${formatDimension(p.box1_length)} × ${formatDimension(p.box1_width)} × ${formatDimension(p.box1_height)} cm` : '—'}
                          {p.cartons_count > 1 && (
                            <small style={{ display: 'block', color: '#6366f1', fontWeight: 600 }}>({p.cartons_count} boxes)</small>
                          )}
                        </td>
                        <td>{formatCbm(p.master_cbm)}</td>
                        <td className="col-price" style={{ textAlign: 'right', fontWeight: 600, color: '#047857' }}>{p.latest_rate ? formatMoney(p.latest_rate, activeCompany?.currency_code || '$') : '—'}</td>'''

text = text.replace(old_pm, new_pm)

# 6. Sales Orders Table
old_so_qtys = '''                        <td className="font-semibold">{Number(o.total_ordered_qty).toFixed(0)}</td>
                        <td className="text-emerald-700 font-semibold">{Number(o.total_dispatched_qty || 0).toFixed(0)}</td>
                        <td className="text-indigo-700 font-bold">{Number(o.total_available_qty != null ? o.total_available_qty : o.total_ordered_qty).toFixed(0)}</td>'''

new_so_qtys = '''                        <td className="font-semibold">{formatQty(o.total_ordered_qty)}</td>
                        <td className="text-emerald-700 font-semibold">{formatQty(o.total_dispatched_qty || 0)}</td>
                        <td className="text-indigo-700 font-bold">{formatQty(o.total_available_qty != null ? o.total_available_qty : o.total_ordered_qty)}</td>'''

text = text.replace(old_so_qtys, new_so_qtys)

with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx', 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(text)

print('App.tsx patched successfully!')
