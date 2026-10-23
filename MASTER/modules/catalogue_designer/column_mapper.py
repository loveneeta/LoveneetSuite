# ==========================================================
# CATALOGUE DESIGNER — Column Mapper
# Step 2: Map Excel columns to data types (Image, Name, Price, etc.)
# ==========================================================

import os
import sys
import re
from typing import Optional, Callable, Dict, List

import customtkinter as ctk
from tkinter import messagebox

# Add parent for imports
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

from data_models import (
    ExcelMetadata, ColumnMapping, ColumnType
)
from column_detector import ColumnTypeDetector


# ──────────────────────────────────────────────────────────
# COLUMN MAPPER
# ──────────────────────────────────────────────────────────

class ColumnMapper(ctk.CTkFrame):
    """Step 2: Map Excel columns to data types"""
    
    def __init__(self, parent, excel_metadata: ExcelMetadata, on_complete: Callable = None):
        super().__init__(parent)
        
        self.excel_metadata = excel_metadata
        self.on_complete = on_complete
        
        # ─────────────────────────────────────
        # STATE
        # ─────────────────────────────────────
        
        # Column mapping UI elements
        self.column_rows: List[Dict] = []  # [{header, label, dropdown, confidence_label}, ...]
        
        # Column type selector dropdown options
        self.column_type_options = [
            ColumnType.IMAGE.value,
            ColumnType.PRODUCT_NAME.value,
            ColumnType.PRICE.value,
            ColumnType.DESCRIPTION.value,
            ColumnType.SKU.value,
            ColumnType.MATERIAL.value,
            ColumnType.QUANTITY.value,
            ColumnType.CUSTOM.value,
        ]
        
        # ─────────────────────────────────────
        # BUILD UI
        # ─────────────────────────────────────
        
        self.build_ui()
    
    # ══════════════════════════════════════════════════════
    # UI CONSTRUCTION
    # ══════════════════════════════════════════════════════
    
    def build_ui(self):
        """Build the column mapper UI"""
        
        # ─────────────────────────────────────
        # TITLE
        # ─────────────────────────────────────
        
        title = ctk.CTkLabel(
            self,
            text="Step 2: Map Excel Columns",
            font=("Arial", 24, "bold")
        )
        
        title.pack(pady=(20, 5), padx=20)
        
        desc = ctk.CTkLabel(
            self,
            text="Verify and adjust column type mappings. We've auto-detected them for you.",
            font=("Arial", 13),
            text_color="#AAAAAA"
        )
        
        desc.pack(pady=(0, 20), padx=20)
        
        # ─────────────────────────────────────
        # SCROLLABLE CONTAINER
        # ─────────────────────────────────────
        
        scroll_frame = ctk.CTkScrollableFrame(
            self,
            corner_radius=8
        )
        
        scroll_frame.pack(
            fill="both",
            expand=True,
            padx=20,
            pady=(0, 20)
        )
        
        # ─────────────────────────────────────
        # HEADERS
        # ─────────────────────────────────────
        
        header_frame = ctk.CTkFrame(scroll_frame, fg_color="transparent")
        header_frame.pack(fill="x", pady=(0, 10))
        
        h1 = ctk.CTkLabel(header_frame, text="Column Name", font=("Arial", 12, "bold"))
        h1.pack(side="left", fill="x", expand=True, padx=(0, 10))
        
        h2 = ctk.CTkLabel(header_frame, text="Detected Type", font=("Arial", 12, "bold"))
        h2.pack(side="left", fill="x", expand=False, padx=(0, 10), width=160)
        
        h3 = ctk.CTkLabel(header_frame, text="Confidence", font=("Arial", 12, "bold"))
        h3.pack(side="left", fill="x", expand=False, width=80)
        
        # ─────────────────────────────────────
        # COLUMN ROWS
        # ─────────────────────────────────────
        
        for idx, header in enumerate(self.excel_metadata.headers):
            
            # Detect column type
            detected_type = ColumnTypeDetector.detect(header)
            confidence = ColumnTypeDetector.get_confidence(header, detected_type)
            
            # Create row frame
            row_frame = ctk.CTkFrame(scroll_frame, fg_color="transparent")
            row_frame.pack(fill="x", pady=5)
            
            # Column name label
            name_label = ctk.CTkLabel(
                row_frame,
                text=header or f"Column {idx+1}",
                font=("Arial", 11),
                text_color="#CCCCCC"
            )
            name_label.pack(side="left", fill="x", expand=True, padx=(0, 10))
            
            # Column type dropdown
            dropdown = ctk.CTkOptionMenu(
                row_frame,
                values=self.column_type_options,
                command=lambda val, idx=idx: self.on_type_changed(idx, val),
                width=150,
                height=28
            )
            dropdown.set(detected_type.value)
            dropdown.pack(side="left", fill="x", expand=False, padx=(0, 10))
            
            # Confidence label
            confidence_text = f"{int(confidence * 100)}%"
            confidence_color = self._get_confidence_color(confidence)
            
            conf_label = ctk.CTkLabel(
                row_frame,
                text=confidence_text,
                font=("Arial", 10),
                text_color=confidence_color
            )
            conf_label.pack(side="left", fill="x", expand=False, width=60)
            
            # Store row data
            self.column_rows.append({
                "header": header,
                "column_index": idx,
                "dropdown": dropdown,
                "confidence_label": conf_label,
                "detected_type": detected_type,
            })
        
        # ─────────────────────────────────────
        # ACTION BUTTONS
        # ─────────────────────────────────────
        
        button_frame = ctk.CTkFrame(self)
        button_frame.pack(fill="x", padx=20, pady=(0, 20))
        
        back_btn = ctk.CTkButton(
            button_frame,
            text="← Back",
            command=self.on_back,
            width=120,
            height=40,
            fg_color="#333333"
        )
        back_btn.pack(side="left", padx=(0, 10))
        
        self.next_btn = ctk.CTkButton(
            button_frame,
            text="Next →",
            command=self.on_next,
            width=120,
            height=40
        )
        self.next_btn.pack(side="right")
    
    # ══════════════════════════════════════════════════════
    # HELPERS
    # ══════════════════════════════════════════════════════
    
    def _get_confidence_color(self, confidence: float) -> str:
        """Get color based on confidence score"""
        if confidence >= 0.9:
            return "#66BB6A"  # Green - high confidence
        elif confidence >= 0.5:
            return "#FFBB33"  # Yellow - medium confidence
        else:
            return "#FF6B6B"  # Red - low confidence
    
    # ══════════════════════════════════════════════════════
    # EVENTS
    # ══════════════════════════════════════════════════════
    
    def on_type_changed(self, row_idx: int, new_type: str):
        """Called when user changes column type"""
        row = self.column_rows[row_idx]
        
        # Update confidence
        col_type = ColumnType(new_type)
        confidence = ColumnTypeDetector.get_confidence(row["header"], col_type)
        
        conf_text = f"{int(confidence * 100)}%"
        conf_color = self._get_confidence_color(confidence)
        
        row["confidence_label"].configure(text=conf_text, text_color=conf_color)
    
    def on_back(self):
        """Go back to previous step"""
        if messagebox.askyesno("Back", "Go back to import step? (mappings will be lost)"):
            self.destroy()
    
    def on_next(self):
        """Proceed to next step with mappings"""
        
        # Validate: at least one image and one product name column
        mappings = self.get_mappings()
        
        has_image = any(m.column_type == ColumnType.IMAGE for m in mappings.values())
        has_product_name = any(m.column_type == ColumnType.PRODUCT_NAME for m in mappings.values())
        
        if not has_image:
            messagebox.showwarning(
                "Missing Image Column",
                "Please assign at least one column as 'image'."
            )
            return
        
        if not has_product_name:
            messagebox.showwarning(
                "Missing Product Name",
                "Please assign at least one column as 'product_name'."
            )
            return
        
        # Save mappings to metadata
        self.excel_metadata.column_mappings = mappings
        
        # Proceed
        if self.on_complete:
            self.on_complete(self.excel_metadata)
    
    # ══════════════════════════════════════════════════════
    # DATA ACCESS
    # ══════════════════════════════════════════════════════
    
    def get_mappings(self) -> Dict[str, ColumnMapping]:
        """Get current column mappings"""
        
        mappings = {}
        
        for row in self.column_rows:
            header = row["header"]
            column_index = row["column_index"]
            
            # Get selected type from dropdown
            selected_type_value = row["dropdown"].get()
            try:
                column_type = ColumnType(selected_type_value)
            except ValueError:
                column_type = ColumnType.CUSTOM
            
            # Create mapping
            mapping = ColumnMapping(
                display_name=header or f"Column {column_index + 1}",
                column_index=column_index,
                column_letter=self._index_to_letter(column_index),
                column_type=column_type,
                required=(column_type in [ColumnType.IMAGE, ColumnType.PRODUCT_NAME])
            )
            
            mappings[mapping.display_name] = mapping
        
        return mappings
    
    def _index_to_letter(self, n: int) -> str:
        """Convert 0-based column index to letter (0→A, 1→B, etc.)"""
        result = ""
        while n >= 0:
            result = chr(65 + (n % 26)) + result
            n = n // 26 - 1
        return result
    
    def get_excel_metadata(self) -> ExcelMetadata:
        """Get updated metadata with mappings"""
        return self.excel_metadata
