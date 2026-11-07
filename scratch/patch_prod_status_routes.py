b_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\routes\business-routes.ts'
with open(b_path, 'r', encoding='utf-8') as f:
    b_code = f.read()

old_get_prods = '''businessRouter.get('/:companyId/products', requireAuth, authorizeCompany, async (req: Request, res: Response) => {
  try {
    const list = await ProductService.listProducts(req.companyId!, {
      search: req.query.search as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined
    });
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});'''

new_get_prods = '''businessRouter.get('/:companyId/products', requireAuth, authorizeCompany, async (req: Request, res: Response) => {
  try {
    const list = await ProductService.listProducts(req.companyId!, {
      search: req.query.search as string,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      activeOnly: req.query.activeOnly === 'true' ? true : false
    });
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

businessRouter.patch('/:companyId/products/:productId/status', requireAuth, authorizeCompany, async (req: Request, res: Response) => {
  if (!req.companyAccess!.canManageProducts && req.user!.role !== 'CENTRAL_ADMIN') {
    return res.status(403).json({ error: 'PERMISSION_DENIED', message: 'Not authorized to change product status. Admin privilege required.' });
  }

  const { isActive } = req.body ?? {};
  if (isActive === undefined) return res.status(400).json({ error: 'IS_ACTIVE_REQUIRED' });

  try {
    const updated = await ProductService.updateProduct(
      req.companyId!,
      Number(req.params.productId),
      { isActive: Boolean(isActive) },
      req.user!.id
    );
    res.json({ success: true, product: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});'''

if old_get_prods in b_code:
    b_code = b_code.replace(old_get_prods, new_get_prods, 1)
    with open(b_path, 'w', encoding='utf-8') as f:
        f.write(b_code)
    print('Updated product routes with activeOnly=false and PATCH status')
else:
    print('old_get_prods not found')
