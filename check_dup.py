with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx', 'r', encoding='utf-8') as f:
    cur = f.read()

for marker in ['export default function App', 'Dynamic Matrix Dashboard', 'Company Product Master', 'Sales Orders', 'Dispatch Management', 'Central Administrator']:
    print(f'Count of "{marker}": {cur.count(marker)}')
