import psycopg2
conn = psycopg2.connect('postgresql://postgres:AdminPassword123!@localhost:5433/loveneet_business_system')
cur = conn.cursor()
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'products'")
print('products:', [c[0] for c in cur.fetchall()])

cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sales_order_items'")
print('sales_order_items:', [c[0] for c in cur.fetchall()])
