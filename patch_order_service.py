import re

with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\services\order-service.ts', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace block from let rowIdx = 0; to validatedRecords.push
old_block_start = '    let internalDuplicateCount = 0;'
old_block_end = '    return {\n      totalRows: rows.length,'

new_code_section = '''    let internalDuplicateCount = 0;
    let roundedCount = 0;

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
      let quantity: number | null = null;
      if (qtyRaw === null || qtyRaw === undefined || String(qtyRaw).trim() === '') {
        errors.push("Missing quantity ('product_uom_qty')");
      } else {
        const qNum = Number(qtyRaw);
        if (isNaN(qNum)) {
          errors.push(`Invalid quantity '${qtyRaw}': must be a valid number`);
        } else if (qNum <= 0) {
          errors.push(`Quantity must be greater than zero (got ${qtyRaw})`);
        } else {
          quantity = roundHalfUp(qNum, 2);
        }
      }

      // 4. Strict Decimal Normalization for Monetary & CBM (PAN HOMES Standards)
      const normPrice = parseAndNormalizeMoney(priceUnitRaw, 'Unit Price');
      if (normPrice.error) errors.push(normPrice.error);
      const priceUnit = normPrice.value;

      const normReduce = parseAndNormalizeMoney(priceReduceRaw, 'Reduced Price');
      if (normReduce.error) errors.push(normReduce.error);
      const priceReduce = normReduce.value;

      const normCbm = parseAndNormalizeCbm(unitCbmRaw);
      if (normCbm.error) errors.push(normCbm.error);
      const unitCbm = normCbm.value;

      const normTotalCbm = parseAndNormalizeCbm(totalCbmRaw);
      if (normTotalCbm.error) errors.push(normTotalCbm.error);
      const totalCbm = normTotalCbm.value !== null ? normTotalCbm.value : (unitCbm && quantity ? roundHalfUp(unitCbm * quantity, 3) : null);

      const isRowRounded = Boolean(normCbm.isRounded || normPrice.isRounded || normReduce.isRounded || normTotalCbm.isRounded);
      if (isRowRounded && errors.length === 0) {
        roundedCount++;
      }

      let validationCategory: 'VALID' | 'ROUNDED' | 'WARNING' | 'ERROR' = 'VALID';
      if (errors.length > 0) {
        validationCategory = 'ERROR';
      } else if (isRowRounded) {
        validationCategory = 'ROUNDED';
      }

      const shipDate = this.parseDate(shipDateRaw);

      let discountedLineValue: number | null = null;
      if (quantity !== null) {
        const effectiveRate = (priceReduce !== null && priceReduce !== undefined && priceReduce > 0) ? priceReduce : (priceUnit ?? null);
        if (effectiveRate !== null) {
          discountedLineValue = roundHalfUp(quantity * effectiveRate, 2);
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
          unitCbm: matchingLine ? matchingLine.unitCbm : null,
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
          // Line Comparisons with standardized decimal precision
          if (quantity !== null && !this.areNumbersEqual(matchingLine.orderedQty, quantity, 0.005)) {
            fieldChanges.push({
              field: 'Quantity',
              fieldKey: 'quantity',
              oldValue: formatQty(matchingLine.orderedQty),
              newValue: formatQty(quantity)
            });
          }

          if (priceUnit !== null && !this.areNumbersEqual(matchingLine.unitPrice, priceUnit, 0.005)) {
            fieldChanges.push({
              field: 'Price',
              fieldKey: 'priceUnit',
              oldValue: matchingLine.unitPrice !== null ? formatMoney(matchingLine.unitPrice) : '—',
              newValue: priceUnit !== null ? formatMoney(priceUnit) : '—'
            });
          }

          // Check if there is an actual discount / price reduction.
          // If price_reduce equals unitPrice, or is null / 0, it represents standard unit price without discount.
          const effectiveBasePrice = priceUnit ?? matchingLine.unitPrice;
          const existingDiscount = (matchingLine.priceReduce !== null && matchingLine.priceReduce !== undefined && Number(matchingLine.priceReduce) > 0 && !this.areNumbersEqual(matchingLine.priceReduce, matchingLine.unitPrice, 0.005))
            ? Number(matchingLine.priceReduce)
            : null;

          const incomingDiscount = (priceReduce !== null && priceReduce !== undefined && Number(priceReduce) > 0 && (effectiveBasePrice === null || !this.areNumbersEqual(priceReduce, effectiveBasePrice, 0.005)))
            ? Number(priceReduce)
            : null;

          if (!this.areNumbersEqual(existingDiscount, incomingDiscount, 0.005)) {
            fieldChanges.push({
              field: 'Reduced Price',
              fieldKey: 'priceReduce',
              oldValue: existingDiscount !== null ? formatMoney(existingDiscount) : '—',
              newValue: incomingDiscount !== null ? formatMoney(incomingDiscount) : '—'
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

          if (unitCbm !== null && !this.areNumbersEqual(matchingLine.unitCbm, unitCbm, 0.0005)) {
            fieldChanges.push({
              field: 'Unit CBM',
              fieldKey: 'unitCbm',
              oldValue: matchingLine.unitCbm !== null ? formatCbm(matchingLine.unitCbm) : '—',
              newValue: unitCbm !== null ? formatCbm(unitCbm) : '—'
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
            newValue: `${finalSku} (Qty: ${formatQty(quantity)})`
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
        isRounded: isRowRounded,
        validationCategory,
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
      roundedRows: roundedCount,'''

# Normalize newlines
code_norm = code.replace('\r\n', '\n')
start_idx = code_norm.find(old_block_start)
end_idx = code_norm.find(old_block_end)

if start_idx != -1 and end_idx != -1:
    code_norm = code_norm[:start_idx] + new_code_section + code_norm[end_idx + len(old_block_end):]
    with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\services\order-service.ts', 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(code_norm)
    print('Updated validateRawDataImport in order-service.ts!')
else:
    print('Could not find markers in order-service.ts:', start_idx, end_idx)
