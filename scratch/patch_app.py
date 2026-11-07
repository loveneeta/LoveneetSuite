import os

app_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_call_lines = [
    'async function call(url: string, init: RequestInit = {}) {\n',
    '  const token = localStorage.getItem("loveneet_token");\n',
    '  const headers: Record<string, string> = {\n',
    '    "Content-Type": "application/json",\n',
    '    ...((init.headers as any) || {})\n',
    '  };\n',
    '  if (token) {\n',
    '    headers["Authorization"] = `Bearer ${token}`;\n',
    '  }\n',
    '  const r = await fetch(API + url, {\n',
    '    credentials: "include",\n',
    '    headers,\n',
    '    ...init\n',
    '  });\n',
    '  const d = await r.json().catch(() => ({}));\n',
    '  if (!r.ok) throw new Error(d.error || d.message || `HTTP_${r.status}`);\n',
    '  return d;\n',
    '}\n'
]

# Find call() start
call_idx = -1
for i, l in enumerate(lines[:60]):
    if l.startswith('async function call'):
        call_idx = i
        break
assert call_idx != -1, 'call() not found'

call_end = -1
for i in range(call_idx, call_idx + 20):
    if lines[i].strip() == '}':
        call_end = i + 1
        break
assert call_end != -1, 'call() end not found'

lines[call_idx:call_end] = new_call_lines
print('Updated call()')

# Now find exportMatrixToExcel
exp_idx = -1
for i, l in enumerate(lines):
    if 'async function exportMatrixToExcel()' in l:
        exp_idx = i
        break
assert exp_idx != -1, 'exportMatrixToExcel not found'

# Find the end of exportMatrixToExcel
end_idx = -1
for i in range(exp_idx, exp_idx + 45):
    if lines[i].strip() == '}' and lines[i-1].strip() == 'setLoading(false);':
        end_idx = i + 1
        break
assert end_idx != -1, 'end of exportMatrixToExcel not found'

new_export_lines = [
    '  async function exportMatrixToExcel() {\n',
    '    try {\n',
    '      const compId = Number(activeCompanyId) || (companies.length ? Number(companies[0].id) : 1);\n',
    '      const token = localStorage.getItem("loveneet_token") || "";\n',
    '      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";\n',
    '      const exportUrl = `${API}/companies/${compId}/matrix/export-excel${tokenParam}`;\n',
    '      const compName = activeCompany?.name || "Company";\n',
    '      setSuccess(`Exporting ${compName} Matrix with embedded product photos... Download has started!`);\n',
    '      const a = document.createElement("a");\n',
    '      a.href = exportUrl;\n',
    '      a.setAttribute("download", "");\n',
    '      document.body.appendChild(a);\n',
    '      a.click();\n',
    '      a.remove();\n',
    '    } catch (e: any) {\n',
    '      setError(e.message || "Failed to download Excel file");\n',
    '    }\n',
    '  }\n'
]
lines[exp_idx:end_idx] = new_export_lines
print('Updated exportMatrixToExcel()')

with open(app_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('Saved App.tsx successfully')
