with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

bal = 0
for i, line in enumerate(lines, 1):
    in_s = False
    s_char = ''
    for c in line:
        if in_s:
            if c == s_char:
                in_s = False
        else:
            if c in ('"', "'", '`'):
                in_s = True
                s_char = c
            elif c == '{':
                bal += 1
            elif c == '}':
                bal -= 1
    if i >= 82 and bal == 0:
        print(f'Balance reached 0 at line {i}: {line.strip()[:60]}')
