with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

bal = 0
for i in range(81, 430):
    line = lines[i]
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
    if bal == 0:
        print(f'Line {i+1} dropped balance to 0: {line.strip()[:70]}')
        break
