app_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    code = f.read()

target_create_prod = '''  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      await call(`/companies/${activeCompanyId}/products`, {
        method: 'POST',
        body: JSON.stringify({
          itemCode: newProd.itemCode,
          buyerCode: newProd.buyerCode || null,
          description: newProd.description,
          finish: newProd.finish || null,
          masterCbm: newProd.masterCbm ? Number(newProd.masterCbm) : null,
          weightValue: newProd.weightValue ? Number(newProd.weightValue) : null,
          box1Length: newProd.box1Length ? Number(newProd.box1Length) : null,
          box1Width: newProd.box1Width ? Number(newProd.box1Width) : null,
          box1Height: newProd.box1Height ? Number(newProd.box1Height) : null
        })
      });
      setShowAddProduct(false);
      setSuccess(`Product '${newProd.itemCode}' created!`);
      setNewProd({ itemCode: '', buyerCode: '', description: '', finish: '', masterCbm: '', weightValue: '', box1Length: '', box1Width: '', box1Height: '' });
      await refreshCompanyData();
    } catch (e: any) {
      setError(e.message);
    }
  }'''

new_create_and_edit = '''  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await call(`/companies/${activeCompanyId}/products`, {
        method: 'POST',
        body: JSON.stringify({
          itemCode: newProd.itemCode,
          buyerCode: newProd.buyerCode || null,
          description: newProd.description,
          finish: newProd.finish || null,
          box1Length: newProd.box1Length ? Number(newProd.box1Length) : null,
          box1Width: newProd.box1Width ? Number(newProd.box1Width) : null,
          box1Height: newProd.box1Height ? Number(newProd.box1Height) : null,
          box2Length: newProd.box2Length ? Number(newProd.box2Length) : null,
          box2Width: newProd.box2Width ? Number(newProd.box2Width) : null,
          box2Height: newProd.box2Height ? Number(newProd.box2Height) : null,
          box3Length: newProd.box3Length ? Number(newProd.box3Length) : null,
          box3Width: newProd.box3Width ? Number(newProd.box3Width) : null,
          box3Height: newProd.box3Height ? Number(newProd.box3Height) : null,
          cartonsCount: newProd.cartonsCount ? Number(newProd.cartonsCount) : 1,
          masterCbm: newProd.masterCbm ? Number(newProd.masterCbm) : null,
          weightValue: newProd.weightValue ? Number(newProd.weightValue) : null
        })
      });

      // If an image was attached during creation, upload it
      if (newProd.imageBase64) {
        await call(`/companies/${activeCompanyId}/products/${encodeURIComponent(newProd.itemCode)}/image`, {
          method: 'POST',
          body: JSON.stringify({
            imageBase64: newProd.imageBase64,
            filename: newProd.imageFilename || `${newProd.itemCode}.jpg`
          })
        }).catch(() => {});
      }

      setShowAddProduct(false);
      setSuccess(`Product '${newProd.itemCode}' created successfully!`);
      setNewProd({
        itemCode: '', buyerCode: '', description: '', finish: '',
        box1Length: '', box1Width: '', box1Height: '',
        box2Length: '', box2Width: '', box2Height: '',
        box3Length: '', box3Width: '', box3Height: '',
        cartonsCount: 1, masterCbm: '', weightValue: '',
        imageBase64: '', imageFilename: ''
      });
      await refreshCompanyData();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function handleOpenEditProduct(p: any) {
    setEditingProduct(p);
    setEditProdForm({
      itemCode: p.item_code || '',
      buyerCode: p.buyer_code || '',
      description: p.description || '',
      finish: p.finish || '',
      box1Length: p.box1_length ?? '',
      box1Width: p.box1_width ?? '',
      box1Height: p.box1_height ?? '',
      box2Length: p.box2_length ?? '',
      box2Width: p.box2_width ?? '',
      box2Height: p.box2_height ?? '',
      box3Length: p.box3_length ?? '',
      box3Width: p.box3_width ?? '',
      box3Height: p.box3_height ?? '',
      cartonsCount: p.cartons_count ?? 1,
      masterCbm: p.master_cbm ?? '',
      weightValue: p.weight_value ?? '',
      imageBase64: '',
      imageFilename: ''
    });
    setEditProdImagePreview(`${API}/companies/${activeCompanyId}/products/${encodeURIComponent(p.item_code)}/image?t=${Date.now()}`);
  }

  async function handleSaveEditProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProduct) return;
    try {
      await call(`/companies/${activeCompanyId}/products/${editingProduct.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          itemCode: editProdForm.itemCode,
          buyerCode: editProdForm.buyerCode || null,
          description: editProdForm.description,
          finish: editProdForm.finish || null,
          box1Length: editProdForm.box1Length ? Number(editProdForm.box1Length) : null,
          box1Width: editProdForm.box1Width ? Number(editProdForm.box1Width) : null,
          box1Height: editProdForm.box1Height ? Number(editProdForm.box1Height) : null,
          box2Length: editProdForm.box2Length ? Number(editProdForm.box2Length) : null,
          box2Width: editProdForm.box2Width ? Number(editProdForm.box2Width) : null,
          box2Height: editProdForm.box2Height ? Number(editProdForm.box2Height) : null,
          box3Length: editProdForm.box3Length ? Number(editProdForm.box3Length) : null,
          box3Width: editProdForm.box3Width ? Number(editProdForm.box3Width) : null,
          box3Height: editProdForm.box3Height ? Number(editProdForm.box3Height) : null,
          cartonsCount: editProdForm.cartonsCount ? Number(editProdForm.cartonsCount) : 1,
          masterCbm: editProdForm.masterCbm ? Number(editProdForm.masterCbm) : null,
          weightValue: editProdForm.weightValue ? Number(editProdForm.weightValue) : null
        })
      });

      // If user selected a new photo, upload it
      if (editProdForm.imageBase64) {
        await call(`/companies/${activeCompanyId}/products/${encodeURIComponent(editProdForm.itemCode)}/image`, {
          method: 'POST',
          body: JSON.stringify({
            imageBase64: editProdForm.imageBase64,
            filename: editProdForm.imageFilename || `${editProdForm.itemCode}.jpg`
          })
        });
      }

      setEditingProduct(null);
      setSuccess(`Product '${editProdForm.itemCode}' updated successfully!`);
      await refreshCompanyData();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function handleOpenEditOrder(o: any) {
    setEditingOrder(o);
    let dateStr = '';
    if (o.ex_fac_date) {
      const d = new Date(o.ex_fac_date);
      if (!isNaN(d.getTime())) {
        dateStr = d.toISOString().slice(0, 10);
      }
    }
    setEditOrderForm({
      buyerOrderNo: o.buyer_order_no || '',
      customerName: o.customer_name_snapshot || o.customer_name || '',
      exFacDate: dateStr,
      status: o.status || 'OPEN'
    });
  }

  async function handleSaveEditOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOrder) return;
    try {
      await call(`/companies/${activeCompanyId}/sales-orders/${editingOrder.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          buyerOrderNo: editOrderForm.buyerOrderNo,
          customerName: editOrderForm.customerName,
          exFacDate: editOrderForm.exFacDate || null,
          status: editOrderForm.status
        })
      });
      setEditingOrder(null);
      setSuccess(`Sales Order ${editingOrder.so_number} updated successfully!`);
      await refreshCompanyData();
    } catch (e: any) {
      setError(e.message);
    }
  }'''

if target_create_prod in code:
    code = code.replace(target_create_prod, new_create_and_edit, 1)
    with open(app_path, 'w', encoding='utf-8') as f:
        f.write(code)
    print('Inserted new product and order edit handlers')
else:
    print('target_create_prod not found')
