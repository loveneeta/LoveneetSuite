import sys, re

app_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Convert useMemo to IIFEs
# Pattern 1: filteredSortedMatrixProducts
content = re.sub(
    r'const filteredSortedMatrixProducts = React\.useMemo\(\(\) => \{([\s\S]*?)\}, \[matrixData\.products, matrixStockFilter, matrixFinishFilter, matrixSearch, matrixSort\]\);',
    r'const filteredSortedMatrixProducts = (() => {\1})();',
    content
)

# Pattern 2: filteredProducts
content = re.sub(
    r'const filteredProducts = React\.useMemo\(\(\) => \{([\s\S]*?)\}, \[products, productStatusFilter, prodFinishFilter, search, prodSort\]\);',
    r'const filteredProducts = (() => {\1})();',
    content
)

# Pattern 3: filteredSortedOrders
content = re.sub(
    r'const filteredSortedOrders = React\.useMemo\(\(\) => \{([\s\S]*?)\}, \[orders, orderStatusFilter, orderStockFilter, orderSearch, orderSort\]\);',
    r'const filteredSortedOrders = (() => {\1})();',
    content
)

# Pattern 4: filteredSortedDispatches
content = re.sub(
    r'const filteredSortedDispatches = React\.useMemo\(\(\) => \{([\s\S]*?)\}, \[dispatches, dispatchStatusFilter, dispatchSearch, dispatchSort\]\);',
    r'const filteredSortedDispatches = (() => {\1})();',
    content
)

# Pattern 5: filteredSortedCompanies
content = re.sub(
    r'const filteredSortedCompanies = React\.useMemo\(\(\) => \{([\s\S]*?)\}, \[consolidatedSummary\?\.companies, centralSearch, centralSort\]\);',
    r'const filteredSortedCompanies = (() => {\1})();',
    content
)

# Pattern 6: filteredSortedAudits
content = re.sub(
    r'const filteredSortedAudits = React\.useMemo\(\(\) => \{([\s\S]*?)\}, \[auditLogs, auditActionFilter, auditEntityFilter, auditSearch, auditSort\]\);',
    r'const filteredSortedAudits = (() => {\1})();',
    content
)

# 2. Fix the duplicate <td ...> in Matrix table
dup_td = """                        <td>{p.master_cbm ? Number(p.master_cbm).toFixed(3) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#047857' }}>{(p.unit_price || p.latest_rate) ? `${activeCompany?.currency_code || '$'} ${Number(p.unit_price || p.latest_rate).toFixed(2)}` : '—'}</td>
                        <td className="col-price" style={{ textAlign: 'right', fontWeight: 600, color: '#047857' }}>{p.latest_rate ? `${activeCompany?.currency_code || '$'} ${Number(p.latest_rate).toFixed(2)}` : '—'}</td>"""

single_td = """                        <td>{p.master_cbm ? Number(p.master_cbm).toFixed(3) : '—'}</td>
                        <td className="col-price" style={{ textAlign: 'right', fontWeight: 600, color: '#047857' }}>{p.latest_rate ? `${activeCompany?.currency_code || '$'} ${Number(p.latest_rate).toFixed(2)}` : '—'}</td>"""

if dup_td in content:
    content = content.replace(dup_td, single_td, 1)
    print("Fixed duplicate td in Matrix table!")
else:
    # Let's search line-by-line if exact match failed due to special characters
    lines = content.splitlines()
    for idx, l in enumerate(lines):
        if 'col-price' in l and idx > 0 and 'textAlign' in lines[idx - 1] and 'unit_price' in lines[idx - 1]:
            print(f"Removing duplicate line {idx}: {lines[idx - 1]}")
            lines.pop(idx - 1)
            content = '\n'.join(lines)
            break

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied fix for React hooks and duplicates!")
