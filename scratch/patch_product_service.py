prod_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\services\product-service.ts'
with open(prod_path, 'r', encoding='utf-8') as f:
    prod_code = f.read()

# 1. Update CreateProductInput interface
old_interface = '''  box2Length?: number;
  box2Width?: number;
  box2Height?: number;
  masterCbm?: number;'''

new_interface = '''  box2Length?: number;
  box2Width?: number;
  box2Height?: number;
  box3Length?: number;
  box3Width?: number;
  box3Height?: number;
  cartonsCount?: number;
  masterCbm?: number;'''

prod_code = prod_code.replace(old_interface, new_interface, 1)

# 2. Update createProduct INSERT
old_insert = '''        `INSERT INTO products (
           company_id, item_code, buyer_code, description, finish,
           product_length, product_width, product_height,
           box1_length, box1_width, box1_height,
           box2_length, box2_width, box2_height,
           master_cbm, weight_value, weight_uom,
           custom_attributes
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8,
           $9, $10, $11,
           $12, $13, $14,
           $15, $16, $17,
           $18
         ) RETURNING *`,
        [
          companyId,
          itemCode,
          input.buyerCode?.trim() || null,
          description,
          input.finish?.trim() || null,
          input.productLength ?? null,
          input.productWidth ?? null,
          input.productHeight ?? null,
          input.box1Length ?? null,
          input.box1Width ?? null,
          input.box1Height ?? null,
          input.box2Length ?? null,
          input.box2Width ?? null,
          input.box2Height ?? null,
          input.masterCbm ?? null,
          input.weightValue ?? null,
          input.weightUom || 'KG',
          JSON.stringify(validatedAttributes)
        ]'''

new_insert = '''        `INSERT INTO products (
           company_id, item_code, buyer_code, description, finish,
           product_length, product_width, product_height,
           box1_length, box1_width, box1_height,
           box2_length, box2_width, box2_height,
           box3_length, box3_width, box3_height,
           cartons_count,
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
         ) RETURNING *`,
        [
          companyId,
          itemCode,
          input.buyerCode?.trim() || null,
          description,
          input.finish?.trim() || null,
          input.productLength ?? null,
          input.productWidth ?? null,
          input.productHeight ?? null,
          input.box1Length ?? null,
          input.box1Width ?? null,
          input.box1Height ?? null,
          input.box2Length ?? null,
          input.box2Width ?? null,
          input.box2Height ?? null,
          input.box3Length ?? null,
          input.box3Width ?? null,
          input.box3Height ?? null,
          input.cartonsCount ?? 1,
          input.masterCbm ?? null,
          input.weightValue ?? null,
          input.weightUom || 'KG',
          JSON.stringify(validatedAttributes)
        ]'''

prod_code = prod_code.replace(old_insert, new_insert, 1)

# 3. Update updateProduct UPDATE query
old_update = '''      `UPDATE products SET
         item_code = $1, buyer_code = $2, description = $3, finish = $4,
         product_length = $5,
         product_width = $6,
         product_height = $7,
         box1_length = $8,
         box1_width = $9,
         box1_height = $10,
         box2_length = COALESCE($11, box2_length),
         box2_width = COALESCE($12, box2_width),
         box2_height = COALESCE($13, box2_height),
         master_cbm = $14,
         weight_value = COALESCE($15, weight_value),
         weight_uom = COALESCE($16, weight_uom),
         custom_attributes = $17,
         is_active = $18
       WHERE company_id = $19 AND id = $20
       RETURNING *`'''

new_update = '''      `UPDATE products SET
         item_code = $1, buyer_code = $2, description = $3, finish = $4,
         product_length = $5,
         product_width = $6,
         product_height = $7,
         box1_length = $8,
         box1_width = $9,
         box1_height = $10,
         box2_length = $11,
         box2_width = $12,
         box2_height = $13,
         box3_length = $14,
         box3_width = $15,
         box3_height = $16,
         cartons_count = COALESCE($17, cartons_count),
         master_cbm = $18,
         weight_value = $19,
         weight_uom = COALESCE($20, weight_uom),
         custom_attributes = $21,
         is_active = $22
       WHERE company_id = $23 AND id = $24
       RETURNING *`'''

prod_code = prod_code.replace(old_update, new_update, 1)

# And update params array for updateProduct
old_params = '''        input.box2Length ?? null,
        input.box2Width ?? null,
        input.box2Height ?? null,
        masterCbm,
        input.weightValue ?? null,
        input.weightUom ?? null,
        JSON.stringify(validatedAttributes),
        isActive,
        companyId,
        productId'''

new_params = '''        input.box2Length !== undefined ? input.box2Length : current.box2_length,
        input.box2Width !== undefined ? input.box2Width : current.box2_width,
        input.box2Height !== undefined ? input.box2Height : current.box2_height,
        input.box3Length !== undefined ? input.box3Length : current.box3_length,
        input.box3Width !== undefined ? input.box3Width : current.box3_width,
        input.box3Height !== undefined ? input.box3Height : current.box3_height,
        input.cartonsCount !== undefined ? input.cartonsCount : current.cartons_count,
        masterCbm,
        input.weightValue !== undefined ? input.weightValue : current.weight_value,
        input.weightUom ?? null,
        JSON.stringify(validatedAttributes),
        isActive,
        companyId,
        productId'''

prod_code = prod_code.replace(old_params, new_params, 1)

with open(prod_path, 'w', encoding='utf-8') as f:
    f.write(prod_code)

print('Updated product-service.ts successfully')
