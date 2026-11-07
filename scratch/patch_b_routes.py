b_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\routes\business-routes.ts'
with open(b_path, 'r', encoding='utf-8') as f:
    b_code = f.read()

target = '''businessRouter.patch('/:companyId/sales-orders/:orderId/status', requireAuth, authorizeCompany, async (req: Request, res: Response) => {
  if (!req.companyAccess!.canManageOrders && req.user!.role !== 'CENTRAL_ADMIN') {
    return res.status(403).json({ error: 'PERMISSION_DENIED', message: 'Not authorized to change order status.' });
  }

  const { status } = req.body ?? {};
  if (!status) return res.status(400).json({ error: 'STATUS_REQUIRED' });

  try {
    const updated = await OrderService.updateOrderStatus(req.companyId!, Number(req.params.orderId), status, req.user!.id);
    res.json({ success: true, order: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});'''

replacement = target + '''\n
businessRouter.put('/:companyId/sales-orders/:orderId', requireAuth, authorizeCompany, async (req: Request, res: Response) => {
  if (!req.companyAccess!.canManageOrders && req.user!.role !== 'CENTRAL_ADMIN') {
    return res.status(403).json({ error: 'PERMISSION_DENIED', message: 'Not authorized to edit sales orders. Admin privilege required.' });
  }

  try {
    const updated = await OrderService.updateSalesOrder(
      req.companyId!,
      Number(req.params.orderId),
      req.body,
      req.user!.id
    );
    res.json({ success: true, order: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});'''

if target in b_code:
    b_code = b_code.replace(target, replacement, 1)
    with open(b_path, 'w', encoding='utf-8') as f:
        f.write(b_code)
    print('Added PUT /:companyId/sales-orders/:orderId route')
else:
    print('Target not found in business-routes.ts')
