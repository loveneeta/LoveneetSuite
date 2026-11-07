with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

open_b = 0
for i, line in enumerate(lines):
    # simple tally
    ob = line.count('{')
    cb = line.count('}')
    open_b += (ob - cb)
    if open_b < 0:
        print(f'Negative balance at line {i+1}: {repr(line)}')
        break

print('Total brace imbalance:', open_b)

# Check parenthesis
open_p = 0
for i, line in enumerate(lines):
    op = line.count('(')
    cp = line.count(')')
    open_p += (op - cp)
    if open_p < 0:
        print(f'Negative paren balance at line {i+1}: {repr(line)}')
        break

print('Total paren imbalance:', open_p)
