# ==========================================================
# PHASE 1 TEST — Import Wizard
# Run this to test data models and import wizard
# ==========================================================

import os
import sys

# Add MASTER to path
master_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, master_path)

from modules.catalogue_designer.data_models import (
    ImageFile, ExcelMetadata, ColumnMapping, ColumnType,
    ProductData, CanvasObject, CardTemplate, DesignSession,
    CanvasObjectType, col_letter, col_index
)

print("✓ Data models imported successfully\n")
print("NOTE: ImportWizard requires tkinter/display (tested separately)\n")

# ──────────────────────────────────────────────────────────
# TEST 1: ImageFile
# ──────────────────────────────────────────────────────────

print("TEST 1: ImageFile")
img = ImageFile(
    path="/home/user/images/product_001.jpg",
    filename="product_001.jpg",
    file_size=2048576
)
print(f"  • Image: {img.filename}")
print(f"  • Size: {img.file_size / 1024 / 1024:.2f} MB")
print()

# ──────────────────────────────────────────────────────────
# TEST 2: ExcelMetadata
# ──────────────────────────────────────────────────────────

print("TEST 2: ExcelMetadata")
excel = ExcelMetadata(
    file_path="/home/user/products.xlsx",
    total_rows=150,
    headers=["Image", "Product Name", "Price", "SKU", "Material"]
)
print(f"  • File: {excel.file_path}")
print(f"  • Rows: {excel.total_rows}")
print(f"  • Headers: {', '.join(excel.headers)}")
print()

# ──────────────────────────────────────────────────────────
# TEST 3: ColumnMapping
# ──────────────────────────────────────────────────────────

print("TEST 3: ColumnMapping")
mapping = ColumnMapping(
    display_name="Product Name",
    column_index=1,
    column_letter="B",
    column_type=ColumnType.PRODUCT_NAME,
    required=True
)
print(f"  • {mapping.display_name} → Column {mapping.column_letter}")
print(f"  • Type: {mapping.column_type.value}")
print()

# ──────────────────────────────────────────────────────────
# TEST 4: ProductData
# ──────────────────────────────────────────────────────────

print("TEST 4: ProductData")
product = ProductData(
    product_id=1,
    image=img,
    excel_row_index=1,
    excel_data={
        "Product Name": "Canvas Shoes",
        "Price": "$29.99",
        "SKU": "SKU-001",
        "Material": "Cotton/Rubber"
    },
    matched=True
)
print(f"  • Product ID: {product.product_id}")
print(f"  • Name: {product.get_field('Product Name')}")
print(f"  • Price: {product.get_field('Price')}")
print(f"  • Matched: {product.matched}")
print()

# ──────────────────────────────────────────────────────────
# TEST 5: CanvasObject
# ──────────────────────────────────────────────────────────

print("TEST 5: CanvasObject")
obj = CanvasObject(
    obj_id=1,
    obj_type=CanvasObjectType.TEXT,
    x=50,
    y=50,
    width=300,
    height=40,
    bound_column="Product Name",
    text_content="{Product Name}",
    text_size=24
)
print(f"  • Object ID: {obj.obj_id}")
print(f"  • Type: {obj.obj_type.value}")
print(f"  • Position: ({obj.x}, {obj.y})")
print(f"  • Bound to: {obj.bound_column}")
print()

# ──────────────────────────────────────────────────────────
# TEST 6: CardTemplate
# ──────────────────────────────────────────────────────────

print("TEST 6: CardTemplate")
template = CardTemplate(
    template_id="template_001",
    name="Product Card v1",
    width=300,
    height=450
)
template.add_object(obj)
print(f"  • Template: {template.name}")
print(f"  • Size: {template.width}x{template.height}px")
print(f"  • Objects: {len(template.objects)}")
print()

# ──────────────────────────────────────────────────────────
# TEST 7: DesignSession
# ──────────────────────────────────────────────────────────

print("TEST 7: DesignSession")
session = DesignSession(
    session_id="session_001",
    session_name="Summer Collection 2025",
    cards_per_page=4
)
session.add_product(product)
session.template = template
print(f"  • Session: {session.session_name}")
print(f"  • Products: {len(session.products)}")
print(f"  • Cards/Page: {session.cards_per_page}")
print(f"  • Total Pages: {session.total_pages()}")
print()

# ──────────────────────────────────────────────────────────
# TEST 8: Column conversions
# ──────────────────────────────────────────────────────────

print("TEST 8: Column letter/index conversions")
from modules.catalogue_designer.data_models import col_letter, col_index

for i in range(5):
    letter = col_letter(i)
    back_to_index = col_index(letter)
    print(f"  • Index {i} ↔ Letter {letter} ↔ Index {back_to_index}")
print()

print("✅ All Phase 1 tests passed!")
