app_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Check lines 420-430
for i in range(415, 430):
    if lines[i].strip() == '}' and lines[i+1].strip() == '}':
        print(f'Found double }} at line {i+1} and {i+2}')
        del lines[i+1]
        break

with open(app_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('Fixed duplicate }')
