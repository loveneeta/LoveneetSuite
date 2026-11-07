import sys

path_prod = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\services\product-service.ts'
with open(path_prod, 'r', encoding='utf-8') as f:
    text_prod = f.read()

# 1. Add unitPrice to CreateProductInput
old_inp = "  rate?: number;"
new_inp = "  rate?: number;\n  unitPrice?: number;"
if old_inp in text_prod and "unitPrice?: number;" not in text_prod:
    text_prod = text_prod.replace(old_inp, new_inp, 1)

# 2. Add unit_price to INSERT
old_insert = """           cartons_count,
           master_cbm, weight_value, weight_uom,
           custom_attributes
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8,
           $9, $10, $11,
           $12, $13, $14,
           $15, $16, $17,
           $18,
           $19, $20, $21,
           $22
         ) RETURNING *`,"""

new_insert = """           cartons_count,
           master_cbm, weight_value, weight_uom,
           custom_attributes,
           unit_price
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8,
           $9, $10, $11,
           $12, $13, $14,
           $15, $16, $17,
           $18,
           $19, $20, $21,
           $22,
           $23
         ) RETURNING *`,"""

if old_insert in text_prod:
    text_prod = text_prod.replace(old_insert, new_insert, 1)

# In insert params array:
old_params = """          input.weightUom || 'KG',
          JSON.stringify(validatedAttributes)
        ]"""
new_params = """          input.weightUom || 'KG',
          JSON.stringify(validatedAttributes),
          input.unitPrice ?? input.rate ?? null
        ]"""
if old_params in text_prod:
    text_prod = text_prod.replace(old_params, new_params, 1)

# In updateProduct:
old_upd_query = """         weight_uom = COALESCE($20, weight_uom),
         custom_attributes = $21,
         is_active = $22
       WHERE company_id = $23 AND id = $24
       RETURNING *`,"""

new_upd_query = """         weight_uom = COALESCE($20, weight_uom),
         custom_attributes = $21,
         is_active = $22,
         unit_price = COALESCE($25, unit_price)
       WHERE company_id = $23 AND id = $24
       RETURNING *`,"""

if old_upd_query in text_prod:
    text_prod = text_prod.replace(old_upd_query, new_upd_query, 1)

old_upd_params = """        JSON.stringify(validatedAttributes),
        isActive,
        companyId,
        productId
      ]"""
new_upd_params = """        JSON.stringify(validatedAttributes),
        isActive,
        companyId,
        productId,
        input.unitPrice !== undefined ? input.unitPrice : (input.rate !== undefined ? input.rate : null)
      ]"""
if old_upd_params in text_prod:
    text_prod = text_prod.replace(old_upd_params, new_upd_params, 1)

# In listProducts:
old_list_q = "`SELECT * FROM products"
new_list_q = """`SELECT p.*,
          COALESCE(p.unit_price, (SELECT soi.unit_price FROM sales_order_items soi WHERE soi.product_id = p.id AND soi.company_id = p.company_id ORDER BY soi.id DESC LIMIT 1)) as latest_rate
       FROM products p"""
if old_list_q in text_prod:
    text_prod = text_prod.replace(old_list_q, new_list_q, 1)

with open(path_prod, 'w', encoding='utf-8') as f:
    f.write(text_prod)

print("product-service.ts updated!")

# Now update report-service.ts for Excel export & getMatrixDashboard fallback
path_rep = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\services\report-service.ts'
with open(path_rep, 'r', encoding='utf-8') as f:
    text_rep = f.read()

# Fallback to p.unit_price in getMatrixDashboard
old_q = "(SELECT soi.unit_price FROM sales_order_items soi WHERE soi.product_id = p.id AND soi.company_id = $1 ORDER BY soi.id DESC LIMIT 1) as latest_rate,"
new_q = "COALESCE((SELECT soi.unit_price FROM sales_order_items soi WHERE soi.product_id = p.id AND soi.company_id = $1 ORDER BY soi.id DESC LIMIT 1), p.unit_price) as latest_rate,"
if old_q in text_rep:
    text_rep = text_rep.replace(old_q, new_q, 1)

# Add PRICE column in exportMatrixToExcel
old_cbm_col = "{ header: 'CBM', key: 'cbm', width: 10 }\n    ];"
new_cbm_col = "{ header: 'CBM', key: 'cbm', width: 10 },\n      { header: 'PRICE', key: 'price', width: 12 }\n    ];"
if old_cbm_col in text_rep:
    text_rep = text_rep.replace(old_cbm_col, new_cbm_col, 1)

old_row_cbm = "cbm: p.master_cbm ? Number(p.master_cbm) : '—'\n      };"
new_row_cbm = "cbm: p.master_cbm ? Number(p.master_cbm) : '—',\n        price: p.latest_rate ? Number(p.latest_rate) : '—'\n      };"
if old_row_cbm in text_rep:
    text_rep = text_rep.replace(old_row_cbm, new_row_cbm, 1)

with open(path_rep, 'w', encoding='utf-8') as f:
    f.write(text_rep)

print("report-service.ts updated!")
