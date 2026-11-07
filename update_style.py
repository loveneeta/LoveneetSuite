with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\style.css', 'r', encoding='utf-8') as f:
    c = f.read()

target = """.matrix-table .col-total-stock {
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
}"""

replacement = """.matrix-table .col-total-stock {
  min-width: 135px !important;
  width: 135px !important;
  text-align: center !important;
  background-color: #f8fafc !important;
  border-left: 2px solid #cbd5e1 !important;
}

.matrix-table thead th.col-total-stock {
  background-color: #e2e8f0 !important;
  border-bottom: 2px solid #94a3b8 !important;
}"""

# Normalize CRLF
c_norm = c.replace('\r\n', '\n')
target_norm = target.replace('\r\n', '\n')
replacement_norm = replacement.replace('\r\n', '\n')

if target_norm in c_norm:
    c_norm = c_norm.replace(target_norm, replacement_norm)
    with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\style.css', 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(c_norm)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND")
