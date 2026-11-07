import os

patterns = ['OFFLINE / STANDBY', 'The ERP server at', 'Double-click Start Loveneet Business System.bat']
for base in [r'E:\LOVENEET_BUSINESS_SYSTEM', r'C:\Users\Machine28\.gemini\antigravity\scratch']:
    for root, dirs, files in os.walk(base):
        if any(skip in root for skip in ['node_modules', '.git']):
            continue
        for file in files:
            if file.endswith(('.html', '.js', '.ts', '.tsx', '.jsx', '.py', '.bat')):
                fp = os.path.join(root, file)
                try:
                    with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
                        txt = f.read()
                        for p in patterns:
                            if p in txt:
                                print(f'Found "{p}" in {fp}')
                except:
                    pass
