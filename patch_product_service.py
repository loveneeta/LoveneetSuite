with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\services\product-service.ts', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Interface
old_iface = '''export interface CreateProductInput {
  itemCode: string;
  buyerCode?: string;
  description: string;'''

new_iface = '''export interface CreateProductInput {
  itemCode: string;
  buyerCode?: string;
  collection?: string;
  description: string;'''

assert old_iface in text, 'old_iface not found'
text = text.replace(old_iface, new_iface)

# 2. createProduct
old_ins = '''        `INSERT INTO products (
           company_id, item_code, buyer_code, description, finish,'''

new_ins = '''        `INSERT INTO products (
           company_id, item_code, buyer_code, collection, description, finish,'''

assert old_ins in text, 'old_ins not found'
text = text.replace(old_ins, new_ins)

# Values
old_vals = '''         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8,
           $9, $10, $11,
           $12, $13, $14,
           $15, $16, $17,
           $18,
           $19, $20, $21,
           $22,
           $23
         ) RETURNING *`,
        [
          companyId,
          itemCode,
          input.buyerCode?.trim() || null,
          description,
          input.finish?.trim() || null,'''

new_vals = '''         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9,
           $10, $11, $12,
           $13, $14, $15,
           $16, $17, $18,
           $19,
           $20, $21, $22,
           $23,
           $24
         ) RETURNING *`,
        [
          companyId,
          itemCode,
          input.buyerCode?.trim() || null,
          input.collection?.trim() || null,
          description,
          input.finish?.trim() || null,'''

assert old_vals in text, 'old_vals not found'
text = text.replace(old_vals, new_vals)

# 3. updateProduct
old_up_vars = '''    const itemCode = input.itemCode !== undefined ? input.itemCode.trim() : current.item_code;
    const buyerCode = input.buyerCode !== undefined ? input.buyerCode.trim() : current.buyer_code;
    const description = input.description !== undefined ? input.description.trim() : current.description;'''

new_up_vars = '''    const itemCode = input.itemCode !== undefined ? input.itemCode.trim() : current.item_code;
    const buyerCode = input.buyerCode !== undefined ? input.buyerCode.trim() : current.buyer_code;
    const collection = input.collection !== undefined ? (input.collection ? input.collection.trim() : null) : current.collection;
    const description = input.description !== undefined ? input.description.trim() : current.description;'''

assert old_up_vars in text, 'old_up_vars not found'
text = text.replace(old_up_vars, new_up_vars)

old_up_sql = '''    const q = await pool.query(
      `UPDATE products SET
         item_code = $1, buyer_code = $2, description = $3, finish = $4,'''

new_up_sql = '''    const q = await pool.query(
      `UPDATE products SET
         item_code = $1, buyer_code = $2, collection = $26, description = $3, finish = $4,'''

assert old_up_sql in text, 'old_up_sql not found'
text = text.replace(old_up_sql, new_up_sql)

old_up_params = '''        productId,
        input.unitPrice !== undefined ? input.unitPrice : (input.rate !== undefined ? input.rate : null)
      ]
    );'''

new_up_params = '''        productId,
        input.unitPrice !== undefined ? input.unitPrice : (input.rate !== undefined ? input.rate : null),
        collection
      ]
    );'''

assert old_up_params in text, 'old_up_params not found'
text = text.replace(old_up_params, new_up_params)

with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\services\product-service.ts', 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(text)

print('Updated product-service.ts with collection support successfully!')
