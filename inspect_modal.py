import os

modal_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\RawDataImportModal.tsx'

with open(modal_path, 'r', encoding='utf-8') as f:
    orig = f.read()

# Let's inspect imports and structure
print("File length:", len(orig))
