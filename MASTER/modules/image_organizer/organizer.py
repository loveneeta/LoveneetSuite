# ==========================================================
# core/organizer.py
# All image sorting logic - Modes 1, 2, 3
# ==========================================================

import os
import re
import shutil
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Callable


@dataclass
class OrganizerConfig:
    excel_files: List[str] = field(default_factory=list)
    output_folder: str = ""
    mode: int = 2

    image_col: int = 5          # Column E
    name_col: int = 3           # Column C
    category_col: int = 10      # Column J
    sub_category_col: int = 11  # Column K
    material_col: int = 13      # Column M
    sub_material_col: int = 14  # Column N
    shape_col: int = 12         # Column L
    technique_col: int = 15     # Column O
    pattern_col: int = 16       # Column P
    year_col: int = 26          # Column Z

    # Mode 1
    start_col: int = 7          # Column G
    end_col: int = 17           # Column Q

    # Mode 2 & 3
    keep_delete_col: int = 7    # Column G
    collection_col: int = 17    # Column Q

    # Mode 3
    folder_columns: List[int] = field(default_factory=lambda: [8])


class ImageOrganizer:
    def __init__(self, config: OrganizerConfig, log_callback: Optional[Callable] = None):
        self.config = config
        self.log_callback = log_callback
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def _log(self, level: str, msg: str):
        if self.log_callback:
            self.log_callback(level, msg)
        getattr(logging, level.lower(), logging.info)(msg)

    # ----------------------------------------------------------
    # HELPERS
    # ----------------------------------------------------------

    def extract_image_path(self, cell):
        if cell.hyperlink and cell.hyperlink.target:
            return cell.hyperlink.target
        val = cell.value
        if isinstance(val, str):
            m = re.search(r'HYPERLINK\(\s*["\']([^"\']+)', val, re.I)
            if m:
                return m.group(1)
            m = re.search(r'(\\\\[^"\s]+\.(jpg|jpeg|png|tif|bmp|webp))', val, re.I)
            if m:
                return m.group(1)
            m = re.search(r'([A-Za-z]:\\[^"\s]+\.(jpg|jpeg|png|tif|bmp|webp))', val, re.I)
            if m:
                return m.group(1)
        return None

    def normalize_path(self, p):
        if not p:
            return None
        p = p.strip().replace("/", "\\")
        p = re.sub(r'^file:/*', '', p, flags=re.I)
        return p

    def clean_cell_value(self, val):
        if val is None:
            return None
        val_str = str(val).strip()
        if val_str.startswith('='):
            return None
        return val_str if val_str else None

    def generate_filename(self, ws, row, ext):
        cfg = self.config
        cols = [
            cfg.name_col, cfg.category_col, cfg.sub_category_col,
            cfg.material_col, cfg.sub_material_col,
            cfg.shape_col, cfg.technique_col,
            cfg.pattern_col, cfg.year_col
        ]
        parts = []
        for c in cols:
            v = ws.cell(row=row, column=c).value
            cleaned = self.clean_cell_value(v)
            if cleaned:
                safe = re.sub(r'[<>:"/\\|?*]', '', cleaned).replace(" ", "-")
                if safe:
                    parts.append(safe)
        if not parts:
            return f"unnamed_{row}{ext}"
        return "_".join(parts) + ext

    def copy_image(self, src, dest_folder, filename):
        os.makedirs(dest_folder, exist_ok=True)
        dest = os.path.join(dest_folder, filename)
        base, ext = os.path.splitext(dest)
        i = 1
        while os.path.exists(dest):
            dest = f"{base}_{i}{ext}"
            i += 1
        shutil.copy2(src, dest)
        return dest

    def resolve_image(self, ws, row, excel_dir):
        cell = ws.cell(row=row, column=self.config.image_col)
        raw = self.extract_image_path(cell)
        img = self.normalize_path(raw)
        if not img:
            return None
        if not os.path.isabs(img):
            img = os.path.join(excel_dir, img)
        return img if os.path.exists(img) else None

    # ----------------------------------------------------------
    # MODES
    # ----------------------------------------------------------

    def mode1_row(self, ws, row, excel_dir):
        img = self.resolve_image(ws, row, excel_dir)
        if not img:
            return False, "no_image"
        cfg = self.config
        current_folder = cfg.output_folder
        last_folder = None
        for col in range(cfg.start_col, cfg.end_col + 1):
            val = ws.cell(row=row, column=col).value
            cleaned = self.clean_cell_value(val)
            if cleaned:
                safe = re.sub(r'[<>:"/\\|?*]', '_', cleaned)
                current_folder = os.path.join(current_folder, safe)
                last_folder = current_folder
        final_folder = last_folder or os.path.join(cfg.output_folder, "UNCATEGORIZED")
        ext = os.path.splitext(img)[1]
        new_name = self.generate_filename(ws, row, ext)
        dest = self.copy_image(img, final_folder, new_name)
        return True, dest

    def mode2_row(self, ws, row, excel_dir):
        img = self.resolve_image(ws, row, excel_dir)
        if not img:
            return False, "no_image"
        cfg = self.config
        kd = self.clean_cell_value(ws.cell(row=row, column=cfg.keep_delete_col).value)
        first_folder = "DELETE" if kd and "DELETE" in kd.upper() else "KEEP"
        coll = self.clean_cell_value(ws.cell(row=row, column=cfg.collection_col).value)
        second_folder = re.sub(r'[<>:"/\\|?*]', '_', coll) if coll else "SOLE"
        final_folder = os.path.join(cfg.output_folder, first_folder, second_folder)
        ext = os.path.splitext(img)[1]
        new_name = self.generate_filename(ws, row, ext)
        dest = self.copy_image(img, final_folder, new_name)
        return True, dest

    def mode3_row(self, ws, row, excel_dir):
        img = self.resolve_image(ws, row, excel_dir)
        if not img:
            return False, "no_image"
        cfg = self.config
        kd = self.clean_cell_value(ws.cell(row=row, column=cfg.keep_delete_col).value)
        top = "DELETE" if kd and "DELETE" in kd.upper() else "KEEP"
        folders = []
        for col in cfg.folder_columns:
            v = self.clean_cell_value(ws.cell(row=row, column=col).value)
            if v:
                folders.append(re.sub(r'[<>:"/\\|?*]', '_', v))
        final_folder = os.path.join(cfg.output_folder, top, *folders)
        ext = os.path.splitext(img)[1]
        new_name = self.generate_filename(ws, row, ext)
        dest = self.copy_image(img, final_folder, new_name)
        return True, dest

    # ----------------------------------------------------------
    # MAIN PROCESS
    # ----------------------------------------------------------

    def run(self, progress_callback: Optional[Callable] = None):
        """
        progress_callback(current, total, message)
        Returns dict: {copied, skipped, errors, log_lines}
        """
        import openpyxl

        mode_funcs = {1: self.mode1_row, 2: self.mode2_row, 3: self.mode3_row}
        mode_func = mode_funcs.get(self.config.mode)

        os.makedirs(self.config.output_folder, exist_ok=True)

        total_copied = total_skipped = total_errors = 0
        self._cancelled = False

        cfg = self.config
        all_files = [f for f in cfg.excel_files if os.path.exists(f)]
        missing = [f for f in cfg.excel_files if not os.path.exists(f)]

        for mf in missing:
            self._log("warning", f"Excel not found: {mf}")

        # Count total rows first for progress
        total_rows = 0
        processed = 0

        for file in all_files:
            try:
                wb = openpyxl.load_workbook(file, data_only=False, read_only=True)
                for ws in wb.worksheets:
                    total_rows += max(0, ws.max_row - 1)
                wb.close()
            except Exception:
                total_rows += 100  # estimate

        for file in all_files:
            if self._cancelled:
                break
            self._log("info", f"Processing: {os.path.basename(file)}")
            excel_dir = os.path.dirname(file)
            try:
                wb = openpyxl.load_workbook(file, data_only=False)
            except Exception as e:
                self._log("error", f"Cannot open {file}: {e}")
                continue

            for ws in wb.worksheets:
                if self._cancelled:
                    break
                self._log("info", f"  Sheet: {ws.title} ({ws.max_row-1} rows)")
                if ws.max_row < 2:
                    continue
                for row in range(2, ws.max_row + 1):
                    if self._cancelled:
                        break
                    try:
                        ok, result = mode_func(ws, row, excel_dir)
                        if ok:
                            total_copied += 1
                            self._log("info", f"  ✓ Row {row} → {os.path.basename(result)}")
                        else:
                            total_skipped += 1
                            if result != "no_image":
                                self._log("warning", f"  ✗ Row {row}: {result}")
                    except Exception as e:
                        total_errors += 1
                        self._log("error", f"  ✗ Row {row} ERROR: {e}")

                    processed += 1
                    if progress_callback:
                        progress_callback(processed, total_rows, f"Row {row} / {ws.title}")

        return {
            "copied": total_copied,
            "skipped": total_skipped,
            "errors": total_errors
        }
