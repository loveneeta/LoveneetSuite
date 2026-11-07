import sys

with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

def find_line(pat):
    for i, l in enumerate(lines):
        if pat in l:
            return i
    return -1

print("page === 'matrix':", find_line("page === 'matrix'"))
print("/* PAGE: PRODUCT MASTER */:", find_line("/* PAGE: PRODUCT MASTER */"))
print("/* PAGE: SALES ORDERS */:", find_line("/* PAGE: SALES ORDERS */"))
print("/* PAGE: DISPATCH MANAGEMENT */:", find_line("/* PAGE: DISPATCH MANAGEMENT */"))
print("/* PAGE: CONSOLIDATED CENTRAL DASHBOARD */:", find_line("/* PAGE: CONSOLIDATED CENTRAL DASHBOARD */"))
print("/* PAGE: AUDIT TRAIL */:", find_line("/* PAGE: AUDIT TRAIL */"))
print("{matrixFullscreen && (:", find_line("{matrixFullscreen && ("))
