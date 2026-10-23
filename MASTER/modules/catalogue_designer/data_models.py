# ==========================================================
# CATALOGUE DESIGNER — Data Models
# Shared data structures for all components
# ==========================================================

from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Any
from enum import Enum
import os


# ──────────────────────────────────────────────────────────
# ENUMS
# ──────────────────────────────────────────────────────────

class ColumnType(Enum):
    """Excel column data types for mapping"""
    IMAGE = "image"
    PRODUCT_NAME = "product_name"
    PRICE = "price"
    DESCRIPTION = "description"
    SKU = "sku"
    MATERIAL = "material"
    QUANTITY = "quantity"
    CUSTOM = "custom"


class CanvasObjectType(Enum):
    """Types of objects on the design canvas"""
    IMAGE = "image"
    TEXT = "text"
    RECTANGLE = "rectangle"
    CIRCLE = "circle"
    LINE = "line"


# ──────────────────────────────────────────────────────────
# IMAGE & PRODUCT DATA
# ──────────────────────────────────────────────────────────

@dataclass
class ImageFile:
    """Represents a single image file"""
    path: str
    filename: str
    file_size: int  # bytes
    
    def __post_init__(self):
        self.filename = os.path.basename(self.path)


@dataclass
class ProductData:
    """Single product with image + Excel row data"""
    product_id: int
    image: Optional[ImageFile] = None
    excel_row_index: int = -1
    excel_data: Dict[str, Any] = field(default_factory=dict)
    matched: bool = False  # True if image auto-matched to Excel row
    
    def get_field(self, column_name: str) -> Any:
        """Get Excel field by column name"""
        return self.excel_data.get(column_name, "N/A")


# ──────────────────────────────────────────────────────────
# EXCEL & COLUMN MAPPING
# ──────────────────────────────────────────────────────────

@dataclass
class ColumnMapping:
    """Maps display name to Excel column index"""
    display_name: str  # e.g., "Product Name"
    column_index: int  # 0-based (A=0, B=1, etc.)
    column_letter: str  # Excel column (A, B, C, etc.)
    column_type: ColumnType = ColumnType.CUSTOM
    required: bool = False


@dataclass
class ExcelMetadata:
    """Metadata about imported Excel file"""
    file_path: str
    total_rows: int
    headers: List[str]  # Row 1 headers
    column_mappings: Dict[str, ColumnMapping] = field(default_factory=dict)
    # column_mappings: {display_name → ColumnMapping}


# ──────────────────────────────────────────────────────────
# CANVAS OBJECTS & TEMPLATE
# ──────────────────────────────────────────────────────────

@dataclass
class CanvasObject:
    """Represents a single object on the design canvas"""
    obj_id: int  # Unique ID for this object
    obj_type: CanvasObjectType
    x: float  # Position
    y: float
    width: float
    height: float
    
    # Binding to Excel column (for data substitution)
    bound_column: Optional[str] = None  # Column name if bound
    
    # Content (varies by type)
    image_path: Optional[str] = None  # For IMAGE type
    text_content: Optional[str] = None  # For TEXT type (template, e.g., "{Product Name}")
    text_size: int = 12  # Font size
    text_color: str = "#FFFFFF"
    
    fill_color: str = "#333333"  # For RECTANGLE, CIRCLE
    outline_color: str = "#FFFFFF"
    outline_width: int = 1
    
    rotation: float = 0.0  # Rotation in degrees
    opacity: float = 1.0  # 0.0 to 1.0


@dataclass
class CardTemplate:
    """Design template for a product card"""
    template_id: str  # Unique identifier (e.g., "template_001")
    name: str  # User-friendly name
    width: float  # Canvas width (pixels)
    height: float  # Canvas height (pixels)
    objects: List[CanvasObject] = field(default_factory=list)
    
    def add_object(self, obj: CanvasObject) -> None:
        """Add object to template"""
        self.objects.append(obj)
    
    def remove_object(self, obj_id: int) -> bool:
        """Remove object by ID"""
        for i, obj in enumerate(self.objects):
            if obj.obj_id == obj_id:
                self.objects.pop(i)
                return True
        return False
    
    def get_object(self, obj_id: int) -> Optional[CanvasObject]:
        """Get object by ID"""
        for obj in self.objects:
            if obj.obj_id == obj_id:
                return obj
        return None


# ──────────────────────────────────────────────────────────
# DESIGN SESSION
# ──────────────────────────────────────────────────────────

@dataclass
class DesignSession:
    """Complete design session state"""
    session_id: str
    session_name: str
    
    # Files
    images: List[ImageFile] = field(default_factory=list)
    excel_metadata: Optional[ExcelMetadata] = None
    
    # Data
    products: List[ProductData] = field(default_factory=list)
    
    # Design
    template: Optional[CardTemplate] = None
    cards_per_page: int = 4  # 1, 2, 4, 6, 8, or custom
    
    # Generation
    generated_pptx_path: Optional[str] = None
    
    def add_product(self, product: ProductData) -> None:
        """Add product to session"""
        self.products.append(product)
    
    def get_column_mapping(self, display_name: str) -> Optional[ColumnMapping]:
        """Get column mapping"""
        if self.excel_metadata:
            return self.excel_metadata.column_mappings.get(display_name)
        return None
    
    def get_products_for_page(self, page_num: int) -> List[ProductData]:
        """Get products for a specific page"""
        start = (page_num - 1) * self.cards_per_page
        end = start + self.cards_per_page
        return self.products[start:end]
    
    def total_pages(self) -> int:
        """Calculate total pages needed"""
        import math
        return math.ceil(len(self.products) / self.cards_per_page)


# ──────────────────────────────────────────────────────────
# TEMPLATE STORAGE
# ──────────────────────────────────────────────────────────

@dataclass
class TemplateFile:
    """Template stored on disk"""
    template_name: str
    template_path: str  # Path to template.json
    assets_folder: str  # Folder containing images
    created_at: str  # ISO format timestamp
    description: str = ""


# ──────────────────────────────────────────────────────────
# HELPER FUNCTIONS
# ──────────────────────────────────────────────────────────

def col_letter(n: int) -> str:
    """Convert 0-based column index to letter (0 → A, 1 → B, etc.)"""
    result = ""
    while n >= 0:
        result = chr(65 + (n % 26)) + result
        n = n // 26 - 1
    return result


def col_index(letter: str) -> int:
    """Convert column letter to 0-based index (A → 0, B → 1, etc.)"""
    letter = letter.strip().upper()
    result = 0
    for char in letter:
        result = result * 26 + (ord(char) - ord('A') + 1)
    return result - 1
