# ==========================================================
# CATALOGUE DESIGNER — Column Type Detector
# Utility for detecting Excel column types (no GUI dependencies)
# ==========================================================

from typing import Dict
import sys
import os

try:
    from modules.catalogue_designer.data_models import ColumnType
except ImportError:
    _HERE = os.path.dirname(os.path.abspath(__file__))
    if _HERE not in sys.path:
        sys.path.insert(0, _HERE)
    from data_models import ColumnType


class ColumnTypeDetector:
    """Auto-detect column types based on header names"""
    
    # Keywords for each column type
    KEYWORDS = {
        ColumnType.IMAGE: [
            "image", "photo", "picture", "img", "file", "filename",
            "path", "url", "image_path", "image_file", "product_image"
        ],
        ColumnType.PRODUCT_NAME: [
            "name", "product", "product_name", "title", "item",
            "description_short", "product_title"
        ],
        ColumnType.PRICE: [
            "price", "cost", "amount", "rate", "value", "selling_price",
            "mrp", "unit_price", "$", "₹", "€", "£"
        ],
        ColumnType.DESCRIPTION: [
            "description", "desc", "details", "info", "information",
            "product_description", "long_description"
        ],
        ColumnType.SKU: [
            "sku", "code", "product_code", "item_code", "barcode",
            "product_id", "id"
        ],
        ColumnType.MATERIAL: [
            "material", "fabric", "composition", "type", "product_type",
            "category", "material_type"
        ],
        ColumnType.QUANTITY: [
            "quantity", "qty", "stock", "count", "units", "available"
        ],
    }
    
    @staticmethod
    def detect(header: str) -> ColumnType:
        """Detect column type from header name"""
        
        if not header or not isinstance(header, str):
            return ColumnType.CUSTOM
        
        header_lower = header.lower().strip()
        
        # Check each column type
        for col_type, keywords in ColumnTypeDetector.KEYWORDS.items():
            for keyword in keywords:
                if keyword in header_lower:
                    return col_type
        
        # Default to custom
        return ColumnType.CUSTOM
    
    @staticmethod
    def get_confidence(header: str, col_type: ColumnType) -> float:
        """Get confidence score (0.0 to 1.0) for a mapping"""
        
        if not header:
            return 0.0
        
        header_lower = header.lower().strip()
        keywords = ColumnTypeDetector.KEYWORDS.get(col_type, [])
        
        for keyword in keywords:
            if header_lower == keyword:
                return 1.0  # Perfect match
            elif keyword in header_lower:
                return 0.8  # Partial match
        
        return 0.0
    
    @staticmethod
    def detect_all(headers: list) -> Dict[str, ColumnType]:
        """Detect types for multiple headers"""
        return {header: ColumnTypeDetector.detect(header) for header in headers}
    
    @staticmethod
    def get_all_types() -> list:
        """Get list of all column types"""
        return [t.value for t in ColumnType]
