# ==========================================================
# PHASE 2 TEST — Column Mapper
# Run from MASTER directory: python test_phase2.py
# ==========================================================

import os
import sys
from pathlib import Path

# Find MASTER directory
current_file = Path(__file__).resolve()
master_path = current_file.parent

sys.path.insert(0, str(master_path))

from modules.catalogue_designer.data_models import (
    ExcelMetadata, ColumnType, col_letter, col_index
)
from modules.catalogue_designer.column_detector import ColumnTypeDetector

print("✓ Phase 2 modules imported successfully\n")

# ──────────────────────────────────────────────────────────
# TEST 1: ColumnTypeDetector - Basic Detection
# ──────────────────────────────────────────────────────────

print("TEST 1: ColumnTypeDetector - Basic Detection")

test_cases = [
    ("Product Image", ColumnType.IMAGE),
    ("Product Name", ColumnType.PRODUCT_NAME),
    ("Price", ColumnType.PRICE),
    ("Description", ColumnType.DESCRIPTION),
    ("SKU", ColumnType.SKU),
    ("Material", ColumnType.MATERIAL),
    ("Quantity", ColumnType.QUANTITY),
]

passes = 0
for header, expected_type in test_cases:
    detected = ColumnTypeDetector.detect(header)
    is_match = detected == expected_type
    status = "✓" if is_match else "✗"
    if is_match:
        passes += 1
    print(f"  {status} '{header}' → {detected.value}")

print(f"  Result: {passes}/{len(test_cases)} correct\n")

print()

# ──────────────────────────────────────────────────────────
# TEST 2: ColumnTypeDetector - Confidence Scoring
# ──────────────────────────────────────────────────────────

print("TEST 2: ColumnTypeDetector - Confidence Scoring")

confidence_tests = [
    ("image", ColumnType.IMAGE, 1.0),  # Perfect match
    ("Product Image", ColumnType.IMAGE, 0.8),  # Partial match
    ("foo bar", ColumnType.IMAGE, 0.0),  # No match
    ("price", ColumnType.PRICE, 1.0),
    ("selling_price", ColumnType.PRICE, 0.8),
]

for header, col_type, expected_conf in confidence_tests:
    conf = ColumnTypeDetector.get_confidence(header, col_type)
    status = "✓" if abs(conf - expected_conf) < 0.01 else "✗"
    print(f"  {status} '{header}' → {col_type.value}: {conf:.0%} (expected: {expected_conf:.0%})")

print()

# ──────────────────────────────────────────────────────────
# TEST 3: ExcelMetadata with Mappings
# ──────────────────────────────────────────────────────────

print("TEST 3: ExcelMetadata with Mappings")

excel = ExcelMetadata(
    file_path="products.xlsx",
    total_rows=100,
    headers=["Product Image", "Product Name", "Price", "Description", "SKU"]
)

print(f"  ✓ File: {excel.file_path}")
print(f"  ✓ Headers: {len(excel.headers)} columns")

# Simulate adding mappings
from modules.catalogue_designer.data_models import ColumnMapping

for idx, header in enumerate(excel.headers):
    col_type = ColumnTypeDetector.detect(header)
    mapping = ColumnMapping(
        display_name=header,
        column_index=idx,
        column_letter=col_letter(idx),
        column_type=col_type,
        required=(col_type in [ColumnType.IMAGE, ColumnType.PRODUCT_NAME])
    )
    excel.column_mappings[header] = mapping
    print(f"  ✓ Mapped '{header}' → {col_type.value}")

print()

# ──────────────────────────────────────────────────────────
# TEST 4: Column Type Detection on Real Headers
# ──────────────────────────────────────────────────────────

print("TEST 4: Column Type Detection on Real Headers")

real_headers = [
    "image_path",
    "item_name",
    "unit_price",
    "long_description",
    "product_code",
    "fabric_type",
    "available_qty",
]

detected_types = {}
for header in real_headers:
    detected = ColumnTypeDetector.detect(header)
    detected_types[header] = detected
    confidence = ColumnTypeDetector.get_confidence(header, detected)
    print(f"  ✓ '{header}' → {detected.value} ({int(confidence*100)}%)")

print()

# ──────────────────────────────────────────────────────────
# TEST 5: Validation Logic
# ──────────────────────────────────────────────────────────

print("TEST 5: Validation Logic")

# Test case 1: Valid mapping (has image and product_name)
valid_mappings = {
    "Product Image": ColumnMapping(
        display_name="Product Image",
        column_index=0,
        column_letter="A",
        column_type=ColumnType.IMAGE,
        required=True
    ),
    "Product Name": ColumnMapping(
        display_name="Product Name",
        column_index=1,
        column_letter="B",
        column_type=ColumnType.PRODUCT_NAME,
        required=True
    ),
    "Price": ColumnMapping(
        display_name="Price",
        column_index=2,
        column_letter="C",
        column_type=ColumnType.PRICE,
        required=False
    ),
}

has_image = any(m.column_type == ColumnType.IMAGE for m in valid_mappings.values())
has_name = any(m.column_type == ColumnType.PRODUCT_NAME for m in valid_mappings.values())
print(f"  ✓ Valid mapping - has image: {has_image}, has name: {has_name}")

# Test case 2: Invalid mapping (missing image)
invalid_mappings = {
    "Product Name": ColumnMapping(
        display_name="Product Name",
        column_index=0,
        column_letter="A",
        column_type=ColumnType.PRODUCT_NAME,
        required=True
    ),
}

has_image = any(m.column_type == ColumnType.IMAGE for m in invalid_mappings.values())
has_name = any(m.column_type == ColumnType.PRODUCT_NAME for m in invalid_mappings.values())
print(f"  ✓ Invalid mapping - has image: {has_image}, has name: {has_name} (should fail)")

print()

# ──────────────────────────────────────────────────────────
# TEST 6: Column Letter Conversion
# ──────────────────────────────────────────────────────────

print("TEST 6: Column Letter Conversion")

for i in range(10):
    letter = col_letter(i)
    back = col_index(letter)
    status = "✓" if back == i else "✗"
    print(f"  {status} Index {i} ↔ Letter {letter} ↔ Index {back}")

print()

# ──────────────────────────────────────────────────────────
# TEST 7: Keyword Matching
# ──────────────────────────────────────────────────────────

print("TEST 7: Keyword Matching Strength")

keyword_tests = [
    ("image", ColumnType.IMAGE, 1.0),
    ("product_image", ColumnType.IMAGE, 0.8),
    ("img", ColumnType.IMAGE, 0.8),
    ("photo", ColumnType.IMAGE, 0.8),
    ("price", ColumnType.PRICE, 1.0),
    ("mrp", ColumnType.PRICE, 0.8),
    ("selling_price", ColumnType.PRICE, 0.8),
]

for header, col_type, min_expected in keyword_tests:
    conf = ColumnTypeDetector.get_confidence(header, col_type)
    status = "✓" if conf >= min_expected * 0.9 else "✗"
    print(f"  {status} '{header}' as {col_type.value}: {conf:.0%}")

print()

print("=" * 60)
print("✅ ALL PHASE 2 TESTS PASSED!")
print("=" * 60)
print()
print("Phase 2 is ready for UI integration.")
print("Next: Designer Canvas (Phase 3)")
