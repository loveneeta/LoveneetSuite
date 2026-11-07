import re

# 1. Patch order-service.ts
order_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\services\order-service.ts'
with open(order_path, 'r', encoding='utf-8') as f:
    order_code = f.read()

# Update listSalesOrders
old_list_so = '''  public static async listSalesOrders(companyId: number): Promise<any[]> {
    const q = await pool.query(
      `SELECT so.*,
              c.customer_name,
              COUNT(soi.id)::int as total_lines,
              COALESCE(SUM(soi.ordered_qty), 0)::numeric as total_ordered_qty,
              COALESCE(SUM(soi.total_cbm), 0)::numeric as total_cbm
       FROM sales_orders so
       LEFT JOIN customers c ON c.id = so.customer_id
       LEFT JOIN sales_order_items soi ON soi.sales_order_id = so.id
       WHERE so.company_id = $1
       GROUP BY so.id, c.customer_name
       ORDER BY so.created_at DESC`,
      [companyId]
    );
    return q.rows;
  }'''

new_list_so = '''  public static async listSalesOrders(companyId: number): Promise<any[]> {
    const q = await pool.query(
      `SELECT so.*,
              COALESCE(so.customer_name_snapshot, c.customer_name) as customer_name,
              COUNT(v.sales_order_item_id)::int as line_count,
              COUNT(v.sales_order_item_id)::int as total_lines,
              COALESCE(SUM(v.ordered_qty), 0)::numeric as total_ordered_qty,
              COALESCE(SUM(v.dispatched_qty), 0)::numeric as total_dispatched_qty,
              COALESCE(SUM(v.available_qty), 0)::numeric as total_available_qty,
              COALESCE(soi_agg.total_cbm, 0)::numeric as total_cbm
       FROM sales_orders so
       LEFT JOIN customers c ON c.id = so.customer_id
       LEFT JOIN v_sales_order_item_balance v ON v.sales_order_id = so.id AND v.company_id = so.company_id
       LEFT JOIN (
         SELECT sales_order_id, COALESCE(SUM(total_cbm), 0) as total_cbm
         FROM sales_order_items
         GROUP BY sales_order_id
       ) soi_agg ON soi_agg.sales_order_id = so.id
       WHERE so.company_id = $1
       GROUP BY so.id, c.customer_name, soi_agg.total_cbm
       ORDER BY so.created_at DESC`,
      [companyId]
    );
    return q.rows;
  }

  public static async updateSalesOrder(
    companyId: number,
    orderId: number,
    input: {
      buyerOrderNo?: string;
      customerName?: string;
      exFacDate?: string;
      status?: string;
    },
    operatorUserId?: number
  ): Promise<any> {
    const currentQ = await pool.query(
      `SELECT * FROM sales_orders WHERE company_id = $1 AND id = $2`,
      [companyId, orderId]
    );
    if (!currentQ.rowCount) throw new Error('SALES_ORDER_NOT_FOUND');
    const curr = currentQ.rows[0];

    const buyerOrderNo = input.buyerOrderNo !== undefined ? input.buyerOrderNo.trim() : curr.buyer_order_no;
    const customerName = input.customerName !== undefined ? input.customerName.trim() : curr.customer_name_snapshot;
    const exFacDate = input.exFacDate !== undefined ? (input.exFacDate ? input.exFacDate : null) : curr.ex_fac_date;
    const status = input.status !== undefined ? input.status.toUpperCase().trim() : curr.status;

    const q = await pool.query(
      `UPDATE sales_orders SET
         buyer_order_no = $1,
         customer_name_snapshot = $2,
         ex_fac_date = $3,
         status = $4
       WHERE company_id = $5 AND id = $6
       RETURNING *`,
      [buyerOrderNo, customerName, exFacDate, status, companyId, orderId]
    );

    await AuditService.log({
      userId: operatorUserId,
      action: 'UPDATE',
      entityType: 'SALES_ORDER',
      entityId: orderId,
      oldValues: curr,
      newValues: q.rows[0]
    });

    return q.rows[0];
  }'''

if old_list_so in order_code:
    order_code = order_code.replace(old_list_so, new_list_so, 1)
    print('Updated order-service.ts with listSalesOrders and updateSalesOrder')
    with open(order_path, 'w', encoding='utf-8') as f:
        f.write(order_code)
else:
    print('old_list_so not found')
