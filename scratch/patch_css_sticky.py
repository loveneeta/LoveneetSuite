css_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

old_sticky = '''/* Total Remaining Column (Pinned on Right) */
.matrix-table .col-total-stock {
  min-width: 130px !important;
  text-align: center !important;
  background-color: #f1f5f9 !important;
  position: sticky !important;
  right: 0 !important;
  z-index: 5 !important;
  box-shadow: -3px 0 6px rgba(0, 0, 0, 0.04) !important;
}

/* Pinned Left Columns: Column 1 (Image: 0 to 52px) */
.matrix-table thead th:first-child,
.matrix-table tbody td:first-child {
  position: sticky !important;
  left: 0 !important;
  z-index: 7 !important;
  width: 52px !important;
  min-width: 52px !important;
  max-width: 52px !important;
  background-color: #ffffff !important;
}

.matrix-table thead th:first-child {
  z-index: 20 !important;
  background-color: #f1f5f9 !important;
  top: 0 !important;
}

/* Pinned Left Columns: Column 2 (SKU: 52px to 162px) */
.matrix-table thead th.sticky-col,
.matrix-table tbody td.sticky-col {
  position: sticky !important;
  left: 52px !important;
  z-index: 7 !important;
  width: 110px !important;
  min-width: 110px !important;
  background-color: #ffffff !important;
  box-shadow: 3px 0 6px -2px rgba(0, 0, 0, 0.08) !important;
}

.matrix-table thead th.sticky-col {
  z-index: 20 !important;
  background-color: #f1f5f9 !important;
  top: 0 !important;
}'''

new_sticky = '''/* Total Remaining Column (Pinned on Right with OPAQUE background and high z-index) */
.matrix-table .col-total-stock {
  min-width: 135px !important;
  width: 135px !important;
  text-align: center !important;
  background-color: #f8fafc !important; /* Completely opaque so numbers never overlap */
  position: sticky !important;
  right: 0 !important;
  z-index: 15 !important;
  box-shadow: -4px 0 10px rgba(0, 0, 0, 0.09) !important;
  border-left: 2px solid #cbd5e1 !important;
}

.matrix-table thead th.col-total-stock {
  z-index: 25 !important;
  background-color: #e2e8f0 !important;
  border-bottom: 2px solid #94a3b8 !important;
}

.matrix-table tbody td.col-total-stock {
  background-color: #f8fafc !important;
  font-weight: 700 !important;
  color: #1e1b4b !important;
}

/* Pinned Left Columns: Column 1 (Image: 0 to 66px, centered & bigger) */
.matrix-table thead th:first-child,
.matrix-table tbody td:first-child {
  position: sticky !important;
  left: 0 !important;
  z-index: 10 !important;
  width: 66px !important;
  min-width: 66px !important;
  max-width: 66px !important;
  text-align: center !important;
  vertical-align: middle !important;
  background-color: #ffffff !important;
  padding: 4px !important;
}

.matrix-table thead th:first-child {
  z-index: 25 !important;
  background-color: #f1f5f9 !important;
  top: 0 !important;
}

/* Pinned Left Columns: Column 2 (SKU: 66px onwards) */
.matrix-table thead th.sticky-col,
.matrix-table tbody td.sticky-col {
  position: sticky !important;
  left: 66px !important;
  z-index: 10 !important;
  width: 115px !important;
  min-width: 115px !important;
  background-color: #ffffff !important;
  box-shadow: 4px 0 8px -2px rgba(0, 0, 0, 0.08) !important;
}

.matrix-table thead th.sticky-col {
  z-index: 25 !important;
  background-color: #f1f5f9 !important;
  top: 0 !important;
}'''

if old_sticky in css:
    css = css.replace(old_sticky, new_sticky, 1)
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(css)
    print('Updated sticky columns in style.css')
else:
    print('old_sticky not found')
