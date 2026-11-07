import re

file_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\services\order-service.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# Replace interface ValidatedRawRow and RawDataValidationResult
old_interfaces = """export interface ValidatedRawRow {
  rowNumber: number;
  shipDate: string | null;
  orderRef: string;
  buyerOrderNo: string | null;
  productDisplayName: string;
  sku: string;
  buyerProductCode: string | null;
  customerName: string | null;
  description: string;
  finish: string | null;
  quantity: number;
  priceReduce: number | null;
  priceUnit: number | null;
  discountedLineValue: number | null;
  currency: string;
  unitCbm: number | null;
  totalCbm: number | null;
  uom: string;
  status: 'VALID' | 'DUPLICATE' | 'INVALID';
  errors: string[];
  duplicateKey: string;
  isExistingInDb: boolean;
  isInFileDuplicate: boolean;
  originalData?: any;
}

export interface RawDataValidationResult {
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  validatedRecords: ValidatedRawRow[];
}"""

new_interfaces = """export type RowClassification = 'NEW' | 'EXACT_DUPLICATE' | 'MODIFIED' | 'INTERNAL_DUPLICATE' | 'INVALID';
export type ConflictResolutionAction = 'OVERWRITE' | 'SKIP' | 'MAKE_DUPLICATE' | 'IMPORT';

export interface FieldDifference {
  field: string;
  fieldKey: string;
  oldValue: any;
  newValue: any;
}

export interface ExistingRecordSnapshot {
  soId: number;
  soNumber: string;
  buyerOrderNo: string | null;
  customerName: string | null;
  exFacDate: string | null;
  lineItemId: number | null;
  sku: string;
  description: string;
  finish: string | null;
  quantity: number;
  priceUnit: number | null;
  priceReduce: number | null;
  dispatchedQty: number;
  availableQty: number;
}

export interface ValidatedRawRow {
  rowNumber: number;
  shipDate: string | null;
  orderRef: string;
  buyerOrderNo: string | null;
  productDisplayName: string;
  sku: string;
  buyerProductCode: string | null;
  customerName: string | null;
  description: string;
  finish: string | null;
  quantity: number;
  priceReduce: number | null;
  priceUnit: number | null;
  discountedLineValue: number | null;
  currency: string;
  unitCbm: number | null;
  totalCbm: number | null;
  uom: string;
  status: 'VALID' | 'DUPLICATE' | 'INVALID';
  classification: RowClassification;
  selectedAction: ConflictResolutionAction;
  allowedActions: ConflictResolutionAction[];
  fieldChanges: FieldDifference[];
  existingRecordSnapshot?: ExistingRecordSnapshot | null;
  errors: string[];
  duplicateKey: string;
  isExistingInDb: boolean;
  isInFileDuplicate: boolean;
  originalData?: any;
}

export interface RawDataValidationResult {
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  newRows: number;
  exactDuplicateRows: number;
  modifiedRows: number;
  internalDuplicateRows: number;
  validatedRecords: ValidatedRawRow[];
}"""

code_norm = code.replace('\r\n', '\n')
old_interfaces_norm = old_interfaces.replace('\r\n', '\n')
new_interfaces_norm = new_interfaces.replace('\r\n', '\n')

if old_interfaces_norm in code_norm:
    code_norm = code_norm.replace(old_interfaces_norm, new_interfaces_norm)
    print("Replaced interfaces successfully")
else:
    print("FAILED to replace interfaces")

# Write helper comparison functions before validateRawDataImport
helper_code = """
  private static areStringsEqual(a: any, b: any): boolean {
    const sA = String(a ?? '').trim().replace(/\\s+/g, ' ').toLowerCase();
    const sB = String(b ?? '').trim().replace(/\\s+/g, ' ').toLowerCase();
    return sA === sB;
  }

  private static areNumbersEqual(a: any, b: any, tolerance = 0.001): boolean {
    if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true;
    const nA = Number(a);
    const nB = Number(b);
    if (isNaN(nA) && isNaN(nB)) return true;
    if (isNaN(nA) || isNaN(nB)) return false;
    return Math.abs(nA - nB) < tolerance;
  }

  private static normalizeDateStr(d: any): string {
    if (!d) return '';
    const str = String(d).trim();
    const m = str.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const m2 = str.match(/^(\\d{2})-(\\d{2})-(\\d{4})/);
    if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return str;
  }
"""

# Now write complete new validateRawDataImport and executeRawDataImport
new_methods = helper_code + """
  /**
   * Validate raw data rows against database constraints, mandatory fields,
   * with deep duplicate and field-level change detection (NEW, EXACT_DUPLICATE, MODIFIED, INTERNAL_DUPLICATE).
   */
  public static async validateRawDataImport(
    companyId: number,
    rows: any[]
  ): Promise<RawDataValidationResult> {
    // 1. Fetch all existing Sales Orders and Line Items for this company
    const existingQ = await pool.query(
      `SELECT
         so.id as sales_order_id,
         so.so_number,
         so.buyer_order_no,
         so.customer_name_snapshot,
         so.ex_fac_date,
         soi.id as line_item_id,
         soi.line_no,
         soi.product_id,
         p.item_code as sku,
         p.buyer_code,
         soi.description_snapshot,
         soi.finish_snapshot,
         soi.ordered_qty,
         soi.unit_price,
         soi.price_reduce,
         soi.currency_code,
         soi.unit_cbm,
         soi.total_cbm,
         soi.uom,
         (SELECT COALESCE(SUM(di.dispatched_qty), 0) FROM dispatch_items di WHERE di.sales_order_item_id = soi.id) as dispatched_qty
       FROM sales_orders so
       LEFT JOIN sales_order_items soi ON soi.sales_order_id = so.id AND soi.company_id = so.company_id
       LEFT JOIN products p ON p.id = soi.product_id AND p.company_id = so.company_id
       WHERE so.company_id = $1
       ORDER BY so.id ASC, soi.line_no ASC`,
      [companyId]
    );

    // Map existing orders by lowercased SO number
    const soMap = new Map<string, {
      soId: number;
      soNumber: string;
      buyerOrderNo: string | null;
      customerName: string | null;
      exFacDate: string | null;
      lines: any[];
    }>();

    for (const r of existingQ.rows) {
      const soKey = String(r.so_number || '').trim().toLowerCase();
      if (!soMap.has(soKey)) {
        soMap.set(soKey, {
          soId: Number(r.sales_order_id),
          soNumber: r.so_number,
          buyerOrderNo: r.buyer_order_no,
          customerName: r.customer_name_snapshot,
          exFacDate: r.ex_fac_date ? new Date(r.ex_fac_date).toISOString().slice(0, 10) : null,
          lines: []
        });
      }
      if (r.line_item_id) {
        soMap.get(soKey)!.lines.push({
          lineItemId: Number(r.line_item_id),
          lineNo: Number(r.line_no),
          productId: Number(r.product_id),
          sku: String(r.sku || '').trim(),
          buyerCode: r.buyer_code,
          description: r.description_snapshot || '',
          finish: r.finish_snapshot || '',
          orderedQty: Number(r.ordered_qty),
          unitPrice: r.unit_price !== null ? Number(r.unit_price) : null,
          priceReduce: r.price_reduce !== null ? Number(r.price_reduce) : null,
          currencyCode: r.currency_code || 'USD',
          unitCbm: r.unit_cbm !== null ? Number(r.unit_cbm) : null,
          totalCbm: r.total_cbm !== null ? Number(r.total_cbm) : null,
          uom: r.uom || 'PCS',
          dispatchedQty: Number(r.dispatched_qty || 0)
        });
      }
    }

    const seenInFileKeys = new Set<string>();
    const validatedRecords: ValidatedRawRow[] = [];

    let validCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;
    let newCount = 0;
    let exactDuplicateCount = 0;
    let modifiedCount = 0;
    let internalDuplicateCount = 0;

    let rowIdx = 0;
    for (const r of rows) {
      rowIdx++;
      const errors: string[] = [];

      // Extract raw / mapped fields
      const shipDateRaw = r.ship_date ?? r.shipDate ?? r.exFacDate ?? r.ex_fac_date;
      const orderRef = String(r['order_id/display_name'] ?? r.orderRef ?? r.order_id ?? r.so_number ?? r.soNumber ?? '').trim();
      const buyerOrderNo = r.buyer_order_no ? String(r.buyer_order_no).trim() : (r.buyerOrderNo ? String(r.buyerOrderNo).trim() : null);
      const productDisplayName = String(r['product_id/display_name'] ?? r.productDisplayName ?? r.product_id ?? r.sku ?? '').trim();
      const buyerCode = r.buyer_code ? String(r.buyer_code).trim() : (r.buyerProductCode ? String(r.buyerProductCode).trim() : null);
      const partnerName = r['partner_id/display_name'] ? String(r['partner_id/display_name']).trim() : (r.customerName ? String(r.customerName).trim() : null);
      const descName = r.name ? String(r.name).trim() : (r.description ? String(r.description).trim() : null);
      const finishName = r['finish_id/display_name'] ? String(r['finish_id/display_name']).trim() : (r.finish ? String(r.finish).trim() : null);

      const qtyRaw = r.product_uom_qty ?? r.quantity ?? r.qty;
      const priceReduceRaw = r.price_reduce ?? r.priceReduce;
      const priceUnitRaw = r.price_unit ?? r.unitPrice ?? r.unit_price;
      const currencyRaw = r['currency_id/display_name'] ?? r.currency ?? 'USD';
      const unitCbmRaw = r.unit_cbm ?? r.unitCbm;
      const totalCbmRaw = r.cbm ?? r.totalCbm ?? r.total_cbm;
      const uomRaw = r['product_uom/display_name'] ?? r.uom ?? 'PCS';

      // 1. Mandatory Order Reference
      if (!orderRef) {
        errors.push("Missing mandatory order reference ('order_id/display_name')");
      }

      // 2. Parse SKU and Description
      if (!productDisplayName) {
        errors.push("Missing mandatory product ('product_id/display_name')");
      }
      const { sku: parsedSku, parsedDesc } = this.parseProductCodeAndDesc(productDisplayName);
      const finalSku = parsedSku || (buyerCode || '');
      if (!finalSku) {
        errors.push("Missing product SKU ('product_id/display_name')");
      }
      const finalDesc = descName || parsedDesc || (finalSku ? `Product ${finalSku}` : 'Untitled Item');

      // 3. Numeric Quantity
      const quantity = this.parseNum(qtyRaw);
      if (quantity === null) {
        errors.push("Quantity ('product_uom_qty') must be a valid number");
      } else if (quantity <= 0) {
        errors.push("Quantity ('product_uom_qty') must be greater than 0");
      }

      // 4. Numeric Prices & CBM
      const priceUnit = this.parseNum(priceUnitRaw);
      const priceReduce = this.parseNum(priceReduceRaw);
      const unitCbm = this.parseNum(unitCbmRaw);
      const totalCbm = this.parseNum(totalCbmRaw);
      const shipDate = this.parseDate(shipDateRaw);

      let discountedLineValue: number | null = null;
      if (quantity !== null) {
        const effectiveRate = (priceReduce !== null && priceReduce !== undefined) ? priceReduce : (priceUnit ?? null);
        if (effectiveRate !== null) {
          discountedLineValue = Math.round((quantity * effectiveRate) * 10000) / 10000;
        }
      }

      // Duplicate Key: SO Number + SKU + Description
      const dupKey = `${orderRef}|${buyerOrderNo || ''}|${finalSku}|${finalDesc}`.toLowerCase();
      const fileLineKey = `${orderRef.toLowerCase()}|${finalSku.toLowerCase()}|${finalDesc.toLowerCase()}`;
      const isInFileDuplicate = seenInFileKeys.has(fileLineKey);
      seenInFileKeys.add(fileLineKey);

      const soKey = orderRef.toLowerCase();
      const existingSo = soMap.get(soKey);
      const isExistingInDb = Boolean(existingSo);

      let status: 'VALID' | 'DUPLICATE' | 'INVALID' = 'VALID';
      let classification: RowClassification = 'NEW';
      let selectedAction: ConflictResolutionAction = 'IMPORT';
      let allowedActions: ConflictResolutionAction[] = ['IMPORT', 'SKIP'];
      const fieldChanges: FieldDifference[] = [];
      let existingRecordSnapshot: ExistingRecordSnapshot | null = null;

      if (errors.length > 0) {
        status = 'INVALID';
        classification = 'INVALID';
        selectedAction = 'SKIP';
        allowedActions = ['SKIP'];
        invalidCount++;
      } else if (isInFileDuplicate) {
        status = 'DUPLICATE';
        classification = 'INTERNAL_DUPLICATE';
        selectedAction = 'SKIP';
        allowedActions = ['SKIP', 'MAKE_DUPLICATE'];
        errors.push('Duplicate line item within the uploaded Excel file');
        duplicateCount++;
        internalDuplicateCount++;
      } else if (!existingSo) {
        // Completely New Sales Order
        status = 'VALID';
        classification = 'NEW';
        selectedAction = 'IMPORT';
        allowedActions = ['IMPORT', 'SKIP'];
        validCount++;
        newCount++;
      } else {
        // SO exists in database -> Check line items & compare fields
        duplicateCount++;
        const exLines = existingSo.lines;
        const matchingLine = exLines.find(l =>
          l.sku.toLowerCase() === finalSku.toLowerCase() ||
          (l.description && this.areStringsEqual(l.description, finalDesc))
        );

        // Populate existing record snapshot
        existingRecordSnapshot = {
          soId: existingSo.soId,
          soNumber: existingSo.soNumber,
          buyerOrderNo: existingSo.buyerOrderNo,
          customerName: existingSo.customerName,
          exFacDate: existingSo.exFacDate,
          lineItemId: matchingLine ? matchingLine.lineItemId : null,
          sku: matchingLine ? matchingLine.sku : finalSku,
          description: matchingLine ? matchingLine.description : finalDesc,
          finish: matchingLine ? matchingLine.finish : null,
          quantity: matchingLine ? matchingLine.orderedQty : 0,
          priceUnit: matchingLine ? matchingLine.unitPrice : null,
          priceReduce: matchingLine ? matchingLine.priceReduce : null,
          dispatchedQty: matchingLine ? matchingLine.dispatchedQty : 0,
          availableQty: matchingLine ? Math.max(0, matchingLine.orderedQty - matchingLine.dispatchedQty) : 0
        };

        // Header Comparisons
        if (buyerOrderNo && !this.areStringsEqual(existingSo.buyerOrderNo, buyerOrderNo)) {
          fieldChanges.push({
            field: 'Buyer Order No',
            fieldKey: 'buyerOrderNo',
            oldValue: existingSo.buyerOrderNo || '—',
            newValue: buyerOrderNo || '—'
          });
        }

        if (partnerName && !this.areStringsEqual(existingSo.customerName, partnerName)) {
          fieldChanges.push({
            field: 'Customer',
            fieldKey: 'customerName',
            oldValue: existingSo.customerName || '—',
            newValue: partnerName || '—'
          });
        }

        const oldDateNorm = this.normalizeDateStr(existingSo.exFacDate);
        const newDateNorm = this.normalizeDateStr(shipDate);
        if (newDateNorm && oldDateNorm && oldDateNorm !== newDateNorm) {
          fieldChanges.push({
            field: 'Ex-Factory Date',
            fieldKey: 'shipDate',
            oldValue: oldDateNorm,
            newValue: newDateNorm
          });
        }

        if (matchingLine) {
          // Line Comparisons
          if (quantity !== null && !this.areNumbersEqual(matchingLine.orderedQty, quantity)) {
            fieldChanges.push({
              field: 'Quantity',
              fieldKey: 'quantity',
              oldValue: matchingLine.orderedQty,
              newValue: quantity
            });
          }

          if (priceUnit !== null && !this.areNumbersEqual(matchingLine.unitPrice, priceUnit)) {
            fieldChanges.push({
              field: 'Price',
              fieldKey: 'priceUnit',
              oldValue: matchingLine.unitPrice !== null ? matchingLine.unitPrice : '—',
              newValue: priceUnit !== null ? priceUnit : '—'
            });
          }

          if (priceReduce !== null && !this.areNumbersEqual(matchingLine.priceReduce, priceReduce)) {
            fieldChanges.push({
              field: 'Reduced Price',
              fieldKey: 'priceReduce',
              oldValue: matchingLine.priceReduce !== null ? matchingLine.priceReduce : '—',
              newValue: priceReduce !== null ? priceReduce : '—'
            });
          }

          if (finishName && !this.areStringsEqual(matchingLine.finish, finishName)) {
            fieldChanges.push({
              field: 'Finish',
              fieldKey: 'finish',
              oldValue: matchingLine.finish || '—',
              newValue: finishName || '—'
            });
          }

          if (descName && !this.areStringsEqual(matchingLine.description, descName)) {
            fieldChanges.push({
              field: 'Description',
              fieldKey: 'description',
              oldValue: matchingLine.description || '—',
              newValue: descName || '—'
            });
          }

          if (unitCbm !== null && !this.areNumbersEqual(matchingLine.unitCbm, unitCbm, 0.0001)) {
            fieldChanges.push({
              field: 'Unit CBM',
              fieldKey: 'unitCbm',
              oldValue: matchingLine.unitCbm !== null ? matchingLine.unitCbm : '—',
              newValue: unitCbm !== null ? unitCbm : '—'
            });
          }

          if (fieldChanges.length === 0) {
            // EXACT DUPLICATE
            status = 'DUPLICATE';
            classification = 'EXACT_DUPLICATE';
            selectedAction = 'SKIP';
            allowedActions = ['SKIP', 'MAKE_DUPLICATE'];
            exactDuplicateCount++;
          } else {
            // MODIFIED EXISTING RECORD
            status = 'DUPLICATE';
            classification = 'MODIFIED';
            selectedAction = 'OVERWRITE';
            allowedActions = ['OVERWRITE', 'SKIP', 'MAKE_DUPLICATE'];
            modifiedCount++;
          }
        } else {
          // SO exists, but this SKU is a new line item on the existing SO
          fieldChanges.push({
            field: 'New Line Item',
            fieldKey: 'sku',
            oldValue: 'Not on SO',
            newValue: `${finalSku} (Qty: ${quantity})`
          });
          status = 'DUPLICATE';
          classification = 'MODIFIED';
          selectedAction = 'OVERWRITE';
          allowedActions = ['OVERWRITE', 'SKIP', 'MAKE_DUPLICATE'];
          modifiedCount++;
        }
      }

      validatedRecords.push({
        rowNumber: rowIdx,
        shipDate,
        orderRef,
        buyerOrderNo,
        productDisplayName: productDisplayName || finalSku,
        sku: finalSku,
        buyerProductCode: buyerCode,
        customerName: partnerName,
        description: finalDesc,
        finish: finishName,
        quantity: quantity ?? 0,
        priceReduce,
        priceUnit,
        discountedLineValue,
        currency: String(currencyRaw).trim() || 'USD',
        unitCbm,
        totalCbm,
        uom: String(uomRaw).trim() || 'PCS',
        status,
        classification,
        selectedAction,
        allowedActions,
        fieldChanges,
        existingRecordSnapshot,
        errors,
        duplicateKey: dupKey,
        isExistingInDb,
        isInFileDuplicate,
        originalData: r
      });
    }

    return {
      totalRows: rows.length,
      validRows: validCount,
      duplicateRows: duplicateCount,
      invalidRows: invalidCount,
      newRows: newCount,
      exactDuplicateRows: exactDuplicateCount,
      modifiedRows: modifiedCount,
      internalDuplicateRows: internalDuplicateCount,
      validatedRecords
    };
  }

  /**
   * Execute validated raw data import with smart conflict resolution:
   * OVERWRITE, SKIP, MAKE_DUPLICATE, or IMPORT with atomic transactions and full audit history.
   */
  public static async executeRawDataImport(
    companyId: number,
    records: ValidatedRawRow[],
    allowOverwrite = false,
    sourceFilename = 'EXCEL_RAW_DATA.xlsx',
    operatorUserId = 1
  ): Promise<{
    batchId: number;
    recordsProcessed: number;
    recordsSucceeded: number;
    recordsOverwritten: number;
    recordsSkipped: number;
    recordsDuplicated: number;
    recordsFailed: number;
    ordersCreated: number;
    linesCreated: number;
    errors: string[];
  }> {
    const client = await pool.connect();
    let batchId = 0;
    const errors: string[] = [];
    let recordsSucceeded = 0;
    let recordsOverwritten = 0;
    let recordsSkipped = 0;
    let recordsDuplicated = 0;
    let recordsFailed = 0;
    let ordersCreated = 0;
    let linesCreated = 0;

    try {
      // 1. Create audit batch
      const bRes = await client.query(
        `INSERT INTO import_batches (company_id, user_id, import_type, source_filename, status)
         VALUES ($1, $2, 'RAW_DATA', $3, 'PROCESSING')
         RETURNING id`,
        [companyId, operatorUserId, sourceFilename]
      );
      batchId = Number(bRes.rows[0].id);

      await client.query('BEGIN');

      // Helper to generate a unique duplicate SO Number
      const generateUniqueDuplicateSoNumber = async (baseSo: string): Promise<string> => {
        let suffix = 1;
        let candidate = `${baseSo}-DUP`;
        while (true) {
          const checkQ = await client.query(
            `SELECT id FROM sales_orders WHERE company_id = $1 AND so_number = $2`,
            [companyId, candidate]
          );
          if (!checkQ.rowCount) return candidate;
          suffix++;
          candidate = `${baseSo}-DUP${suffix}`;
        }
      };

      // Process records
      for (const rec of records) {
        if (rec.status === 'INVALID' || rec.classification === 'INVALID') {
          recordsFailed++;
          errors.push(`Row ${rec.rowNumber} (${rec.sku || 'Unknown'}): ${rec.errors.join('; ')}`);
          continue;
        }

        // Determine effective action: record.selectedAction has highest precedence
        const action: ConflictResolutionAction = rec.selectedAction ||
          (rec.classification === 'NEW' ? 'IMPORT' : (allowOverwrite ? 'OVERWRITE' : 'SKIP'));

        if (action === 'SKIP') {
          recordsSkipped++;
          continue;
        }

        try {
          // Upsert customer if provided
          let customerId: number | null = null;
          if (rec.customerName) {
            const custCode = rec.customerName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
            const cRes = await client.query(
              `INSERT INTO customers (company_id, customer_code, customer_name)
               VALUES ($1, $2, $3)
               ON CONFLICT (company_id, customer_code) WHERE customer_code IS NOT NULL DO UPDATE
               SET customer_name = EXCLUDED.customer_name
               RETURNING id`,
              [companyId, custCode, rec.customerName]
            );
            customerId = Number(cRes.rows[0].id);
          }

          // 1. Upsert product in Product Master
          const pRes = await client.query(
            `INSERT INTO products (
               company_id, item_code, buyer_code, description, finish, master_cbm, unit_price
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (company_id, item_code) DO UPDATE
             SET buyer_code = COALESCE(EXCLUDED.buyer_code, products.buyer_code),
                 finish = COALESCE(EXCLUDED.finish, products.finish),
                 master_cbm = COALESCE(EXCLUDED.master_cbm, products.master_cbm),
                 unit_price = COALESCE(EXCLUDED.unit_price, products.unit_price)
             RETURNING id`,
            [companyId, rec.sku, rec.buyerProductCode, rec.description, rec.finish, rec.unitCbm, rec.priceUnit]
          );
          const productId = Number(pRes.rows[0].id);

          if (action === 'MAKE_DUPLICATE') {
            // Create a separate duplicated SO with unique suffix
            const dupSoNumber = await generateUniqueDuplicateSoNumber(rec.orderRef);
            const newSo = await client.query(
              `INSERT INTO sales_orders (
                 company_id, customer_id, so_number, buyer_order_no, customer_name_snapshot, ex_fac_date, custom_attributes
               ) VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id`,
              [
                companyId,
                customerId,
                dupSoNumber,
                rec.buyerOrderNo,
                rec.customerName,
                rec.shipDate,
                JSON.stringify({ original_so_number: rec.orderRef, is_duplicate: true, source_batch: batchId })
              ]
            );
            const soId = Number(newSo.rows[0].id);
            ordersCreated++;

            await client.query(
              `INSERT INTO sales_order_items (
                 company_id, sales_order_id, line_no, product_id, ordered_qty,
                 unit_price, price_reduce, discounted_line_value,
                 currency_code, unit_cbm, total_cbm, uom,
                 buyer_order_no, buyer_product_code, description_snapshot, finish_snapshot, custom_attributes
               ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
              [
                companyId,
                soId,
                productId,
                rec.quantity,
                rec.priceUnit,
                rec.priceReduce,
                rec.discountedLineValue,
                rec.currency,
                rec.unitCbm,
                rec.totalCbm,
                rec.uom,
                rec.buyerOrderNo,
                rec.buyerProductCode,
                rec.description,
                rec.finish,
                JSON.stringify({ original_so_number: rec.orderRef, is_duplicate: true })
              ]
            );
            linesCreated++;
            recordsDuplicated++;
            recordsSucceeded++;

          } else if (action === 'OVERWRITE') {
            // Find existing SO
            const existingSo = await client.query(
              `SELECT id FROM sales_orders WHERE company_id = $1 AND so_number = $2`,
              [companyId, rec.orderRef]
            );

            let soId: number;
            if (existingSo.rowCount) {
              soId = Number(existingSo.rows[0].id);
              // Update SO Header
              await client.query(
                `UPDATE sales_orders
                 SET buyer_order_no = COALESCE($1, buyer_order_no),
                     customer_id = COALESCE($2, customer_id),
                     customer_name_snapshot = COALESCE($3, customer_name_snapshot),
                     ex_fac_date = COALESCE($4, ex_fac_date)
                 WHERE id = $5 AND company_id = $6`,
                [rec.buyerOrderNo, customerId, rec.customerName, rec.shipDate, soId, companyId]
              );
            } else {
              // Create if didn't exist
              const newSo = await client.query(
                `INSERT INTO sales_orders (company_id, customer_id, so_number, buyer_order_no, customer_name_snapshot, ex_fac_date)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id`,
                [companyId, customerId, rec.orderRef, rec.buyerOrderNo, rec.customerName, rec.shipDate]
              );
              soId = Number(newSo.rows[0].id);
              ordersCreated++;
            }

            // Find matching line item by lineItemId or by (so_id, product_id)
            let existingLineId: number | null = rec.existingRecordSnapshot?.lineItemId || null;
            if (!existingLineId) {
              const elQ = await client.query(
                `SELECT id FROM sales_order_items
                 WHERE company_id = $1 AND sales_order_id = $2 AND product_id = $3
                 LIMIT 1`,
                [companyId, soId, productId]
              );
              if (elQ.rowCount) existingLineId = Number(elQ.rows[0].id);
            }

            if (existingLineId) {
              // Update existing line item in place (preserving dispatch history and foreign keys)
              await client.query(
                `UPDATE sales_order_items
                 SET ordered_qty = $1,
                     unit_price = $2,
                     price_reduce = $3,
                     discounted_line_value = $4,
                     currency_code = $5,
                     unit_cbm = $6,
                     total_cbm = $7,
                     uom = $8,
                     buyer_order_no = COALESCE($9, buyer_order_no),
                     buyer_product_code = COALESCE($10, buyer_product_code),
                     description_snapshot = COALESCE($11, description_snapshot),
                     finish_snapshot = COALESCE($12, finish_snapshot)
                 WHERE id = $13 AND company_id = $14`,
                [
                  rec.quantity,
                  rec.priceUnit,
                  rec.priceReduce,
                  rec.discountedLineValue,
                  rec.currency,
                  rec.unitCbm,
                  rec.totalCbm,
                  rec.uom,
                  rec.buyerOrderNo,
                  rec.buyerProductCode,
                  rec.description,
                  rec.finish,
                  existingLineId,
                  companyId
                ]
              );
              linesCreated++;
              recordsOverwritten++;
              recordsSucceeded++;
            } else {
              // Line doesn't exist on this SO -> add as new line item
              const maxLineQ = await client.query(
                `SELECT COALESCE(MAX(line_no), 0) as max_line FROM sales_order_items WHERE company_id = $1 AND sales_order_id = $2`,
                [companyId, soId]
              );
              const nextLineNo = Number(maxLineQ.rows[0].max_line) + 1;

              await client.query(
                `INSERT INTO sales_order_items (
                   company_id, sales_order_id, line_no, product_id, ordered_qty,
                   unit_price, price_reduce, discounted_line_value,
                   currency_code, unit_cbm, total_cbm, uom,
                   buyer_order_no, buyer_product_code, description_snapshot, finish_snapshot
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                [
                  companyId,
                  soId,
                  nextLineNo,
                  productId,
                  rec.quantity,
                  rec.priceUnit,
                  rec.priceReduce,
                  rec.discountedLineValue,
                  rec.currency,
                  rec.unitCbm,
                  rec.totalCbm,
                  rec.uom,
                  rec.buyerOrderNo,
                  rec.buyerProductCode,
                  rec.description,
                  rec.finish
                ]
              );
              linesCreated++;
              recordsOverwritten++;
              recordsSucceeded++;
            }

          } else {
            // Action === 'IMPORT' (Standard New Record)
            const existingSo = await client.query(
              `SELECT id FROM sales_orders WHERE company_id = $1 AND so_number = $2`,
              [companyId, rec.orderRef]
            );

            let soId: number;
            if (existingSo.rowCount) {
              soId = Number(existingSo.rows[0].id);
            } else {
              const newSo = await client.query(
                `INSERT INTO sales_orders (company_id, customer_id, so_number, buyer_order_no, customer_name_snapshot, ex_fac_date)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id`,
                [companyId, customerId, rec.orderRef, rec.buyerOrderNo, rec.customerName, rec.shipDate]
              );
              soId = Number(newSo.rows[0].id);
              ordersCreated++;
            }

            const maxLineQ = await client.query(
              `SELECT COALESCE(MAX(line_no), 0) as max_line FROM sales_order_items WHERE company_id = $1 AND sales_order_id = $2`,
              [companyId, soId]
            );
            const nextLineNo = Number(maxLineQ.rows[0].max_line) + 1;

            await client.query(
              `INSERT INTO sales_order_items (
                 company_id, sales_order_id, line_no, product_id, ordered_qty,
                 unit_price, price_reduce, discounted_line_value,
                 currency_code, unit_cbm, total_cbm, uom,
                 buyer_order_no, buyer_product_code, description_snapshot, finish_snapshot
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
              [
                companyId,
                soId,
                nextLineNo,
                productId,
                rec.quantity,
                rec.priceUnit,
                rec.priceReduce,
                rec.discountedLineValue,
                rec.currency,
                rec.unitCbm,
                rec.totalCbm,
                rec.uom,
                rec.buyerOrderNo,
                rec.buyerProductCode,
                rec.description,
                rec.finish
              ]
            );
            linesCreated++;
            recordsSucceeded++;
          }
        } catch (rowErr: any) {
          errors.push(`Row ${rec.rowNumber} (${rec.orderRef} / ${rec.sku}): ${rowErr.message}`);
          recordsFailed++;
        }
      }

      await client.query('COMMIT');

      // 4. Update import batch log
      await client.query(
        `UPDATE import_batches
         SET records_processed = $1,
             records_succeeded = $2,
             records_skipped = $3,
             records_duplicated = $4,
             records_failed = $5,
             status = 'COMPLETED',
             error_log = $6
         WHERE id = $7`,
        [records.length, recordsSucceeded, recordsSkipped, recordsDuplicated, recordsFailed, JSON.stringify(errors), batchId]
      );

      // 5. Audit Log
      await AuditService.log({
        companyId,
        userId: operatorUserId,
        action: 'IMPORT_RAW_DATA_EXCEL',
        entityType: 'IMPORT_BATCH',
        entityId: batchId,
        afterData: {
          sourceFilename,
          recordsProcessed: records.length,
          recordsSucceeded,
          recordsOverwritten,
          recordsSkipped,
          recordsDuplicated,
          recordsFailed,
          ordersCreated,
          linesCreated
        }
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      errors.push(`Critical import failure: ${err.message}`);
      if (batchId) {
        await pool.query(
          `UPDATE import_batches SET status = 'FAILED', error_log = $1 WHERE id = $2`,
          [JSON.stringify(errors), batchId]
        );
      }
      throw err;
    } finally {
      client.release();
    }

    return {
      batchId,
      recordsProcessed: records.length,
      recordsSucceeded,
      recordsOverwritten,
      recordsSkipped,
      recordsDuplicated,
      recordsFailed,
      ordersCreated,
      linesCreated,
      errors
    };
  }
"""

# Replace from `public static async validateRawDataImport` to the end of `executeRawDataImport`
pattern = r"  public static async validateRawDataImport\([\s\S]*?return \{\s*batchId,\s*recordsProcessed: records\.length,\s*recordsSucceeded,\s*recordsSkipped,\s*recordsDuplicated,\s*recordsFailed,[\s\S]*?\};\s*\}"

if re.search(pattern, code_norm):
    code_norm = re.sub(pattern, lambda m: new_methods.strip(), code_norm)
    print("Replaced validateRawDataImport and executeRawDataImport successfully")
else:
    print("FAILED to find methods pattern")

with open(file_path, 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(code_norm)
print("Updated order-service.ts")
