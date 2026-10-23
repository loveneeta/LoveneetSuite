# ==========================================================
# MASTER — Image Organizer Module
# Integrates ImageOrganizerPro into Loveneet Business Suite
# ==========================================================

import os
import sys
import json
import threading
import datetime
import customtkinter as ctk
from tkinter import filedialog, messagebox, StringVar, IntVar

# Make sure ImageOrganizer core is on the path
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)                          # adds modules/
sys.path.insert(0, os.path.join(_HERE, "modules")) # adds modules/modules/ fallback

from image_organizer.organizer import ImageOrganizer, OrganizerConfig


# ── Helpers ────────────────────────────────────────────────

def col_letter(n: int) -> str:
    result = ""
    while n:
        n, r = divmod(n - 1, 26)
        result = chr(65 + r) + result
    return result


def col_num(s: str) -> int:
    s = s.strip().upper()
    result = 0
    for c in s:
        result = result * 26 + (ord(c) - 64)
    return result


MODE_NAMES = {
    1: "Mode 1 — Nested Folders (Column Range)",
    2: "Mode 2 — KEEP / DELETE + Collection",
    3: "Mode 3 — KEEP / DELETE + Multi-Level",
}
MODE_DESC = {
    1: "Builds nested folder tree from a column range (e.g. G→Q). Images placed in deepest folder found.",
    2: "Top folder = KEEP or DELETE. Second folder = Collection name from one column.",
    3: "Top folder = KEEP or DELETE. Sub-folders from custom column list you define.",
}

CONFIG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(_HERE)),
    "settings", "image_organizer_session.json"
)


# ==========================================================
# IMAGE ORGANIZER FRAME
# Drop-in CTkFrame for MASTER — mirrors the standalone app UI
# ==========================================================

class ImageOrganizerFrame(ctk.CTkFrame):

    def __init__(self, master, **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)

        self._organizer = None
        self._running = False

        self._build_ui()
        self._load_session()

    # ── Layout ─────────────────────────────────────────────

    def _build_ui(self):
        self.columnconfigure(0, weight=3)
        self.columnconfigure(1, weight=2)
        self.rowconfigure(0, weight=1)
        self.rowconfigure(1, weight=0)

        left = ctk.CTkFrame(self, fg_color="transparent")
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 8), pady=(0, 8))

        right = ctk.CTkFrame(self, fg_color="transparent")
        right.grid(row=0, column=1, sticky="nsew", pady=(0, 8))

        self._build_left(left)
        self._build_right(right)
        self._build_bottom()

    def _build_bottom(self):
        bottom = ctk.CTkFrame(self, fg_color="#1A1D25", corner_radius=8, height=52)
        bottom.grid(row=1, column=0, columnspan=2, sticky="ew")

        self._run_btn = ctk.CTkButton(
            bottom, text="▶  Run", width=140, height=36,
            fg_color="#2563EB", hover_color="#1D4ED8",
            font=ctk.CTkFont("Segoe UI", 13, "bold"),
            command=self._start
        )
        self._run_btn.pack(side="right", padx=16, pady=8)

        self._cancel_btn = ctk.CTkButton(
            bottom, text="■  Cancel", width=110, height=36,
            fg_color="#374151", hover_color="#DC2626",
            font=ctk.CTkFont("Segoe UI", 13),
            command=self._cancel, state="disabled"
        )
        self._cancel_btn.pack(side="right", padx=(0, 6), pady=8)

        self._progress = ctk.CTkProgressBar(bottom, height=8, progress_color="#2563EB")
        self._progress.set(0)
        self._progress.pack(side="left", fill="x", expand=True, padx=16, pady=18)

        self._status_lbl = ctk.CTkLabel(
            bottom, text="Ready",
            font=ctk.CTkFont("Segoe UI", 11),
            text_color="#6B7280"
        )
        self._status_lbl.pack(side="left", padx=(0, 12))

    def _build_left(self, parent):
        parent.columnconfigure(0, weight=1)
        parent.rowconfigure(3, weight=1)

        # Excel Files
        sec1 = self._section(parent, "Excel Files", row=0)
        self._files_box = ctk.CTkTextbox(
            sec1, height=90,
            font=ctk.CTkFont("Consolas", 11),
            fg_color="#0D0F14", text_color="#A5B4FC",
            border_color="#2D3748", border_width=1
        )
        self._files_box.pack(fill="x", pady=(4, 4))
        btn_row = ctk.CTkFrame(sec1, fg_color="transparent")
        btn_row.pack(fill="x")
        ctk.CTkButton(
            btn_row, text="+ Add Files", width=110, height=28,
            fg_color="#1E293B", hover_color="#334155",
            command=self._add_files
        ).pack(side="left", padx=(0, 6))
        ctk.CTkButton(
            btn_row, text="Clear", width=70, height=28,
            fg_color="#1E293B", hover_color="#334155",
            command=self._clear_files
        ).pack(side="left")

        # Output Folder
        sec2 = self._section(parent, "Output Folder", row=1)
        out_row = ctk.CTkFrame(sec2, fg_color="transparent")
        out_row.pack(fill="x")
        out_row.columnconfigure(0, weight=1)
        self._out_var = StringVar()
        ctk.CTkEntry(
            out_row, textvariable=self._out_var,
            fg_color="#0D0F14", border_color="#2D3748",
            font=ctk.CTkFont("Consolas", 11)
        ).grid(row=0, column=0, sticky="ew", padx=(0, 6))
        ctk.CTkButton(
            out_row, text="Browse", width=80, height=28,
            fg_color="#1E293B", hover_color="#334155",
            command=self._browse_out
        ).grid(row=0, column=1)

        # Sort Mode
        sec3 = self._section(parent, "Sort Mode", row=2)
        self._mode_var = IntVar(value=2)
        for m in [1, 2, 3]:
            ctk.CTkRadioButton(
                sec3, text=MODE_NAMES[m], value=m,
                variable=self._mode_var,
                font=ctk.CTkFont("Segoe UI", 12),
                command=self._on_mode_change
            ).pack(anchor="w", pady=2)

        self._mode_desc = ctk.CTkLabel(
            sec3, text=MODE_DESC[2],
            font=ctk.CTkFont("Segoe UI", 11),
            text_color="#6B7280", wraplength=380, justify="left"
        )
        self._mode_desc.pack(anchor="w", pady=(4, 0))

        # Log
        sec4 = self._section(parent, "Log", row=3)
        self._log_box = ctk.CTkTextbox(
            sec4, font=ctk.CTkFont("Consolas", 10),
            fg_color="#080A0F", text_color="#9CA3AF",
            state="disabled", height=200
        )
        self._log_box.pack(fill="both", expand=True)
        ctk.CTkButton(
            sec4, text="Clear Log", height=24,
            fg_color="#1E293B", hover_color="#334155",
            font=ctk.CTkFont("Segoe UI", 10),
            command=self._clear_log
        ).pack(anchor="e", pady=(4, 0))

    def _build_right(self, parent):
        parent.columnconfigure(0, weight=1)

        sec = self._section(parent, "Column Configuration", row=0)
        sec.columnconfigure(0, weight=1)

        def lbl_entry(p, label, var, row):
            f = ctk.CTkFrame(p, fg_color="transparent")
            f.grid(row=row, column=0, sticky="ew", pady=1)
            f.columnconfigure(1, weight=1)
            ctk.CTkLabel(
                f, text=label,
                font=ctk.CTkFont("Segoe UI", 11),
                text_color="#9CA3AF", width=170, anchor="w"
            ).grid(row=0, column=0)
            ctk.CTkEntry(
                f, textvariable=var, width=56, height=24,
                fg_color="#0D0F14", border_color="#2D3748",
                font=ctk.CTkFont("Consolas", 11)
            ).grid(row=0, column=1, sticky="w")

        self._vcols = {}

        ctk.CTkLabel(
            sec, text="COMMON", text_color="#374151",
            font=ctk.CTkFont("Segoe UI", 9, "bold")
        ).grid(row=0, sticky="w")

        defaults = {
            "image_col": "E", "name_col": "C", "category_col": "J",
            "sub_category_col": "K", "material_col": "M", "sub_material_col": "N",
            "shape_col": "L", "technique_col": "O", "pattern_col": "P", "year_col": "Z"
        }
        labels = {
            "image_col": "Image Path Col",
            "name_col": "Name Col",
            "category_col": "Category Col",
            "sub_category_col": "Sub-Category Col",
            "material_col": "Material Col",
            "sub_material_col": "Sub-Material Col",
            "shape_col": "Shape Col",
            "technique_col": "Technique Col",
            "pattern_col": "Pattern Col",
            "year_col": "Year Col",
        }
        for i, (key, default) in enumerate(defaults.items(), start=1):
            self._vcols[key] = StringVar(value=default)
            lbl_entry(sec, labels[key], self._vcols[key], i)

        # Mode 1 frame
        self._m1_frame = ctk.CTkFrame(sec, fg_color="transparent")
        self._m1_frame.grid(row=20, column=0, sticky="ew")
        self._m1_frame.columnconfigure(0, weight=1)
        ctk.CTkLabel(
            self._m1_frame, text="MODE 1", text_color="#374151",
            font=ctk.CTkFont("Segoe UI", 9, "bold")
        ).grid(row=0, sticky="w", pady=(6, 0))
        self._vcols["start_col"] = StringVar(value="G")
        self._vcols["end_col"] = StringVar(value="Q")
        lbl_entry(self._m1_frame, "Folder Start Col", self._vcols["start_col"], 1)
        lbl_entry(self._m1_frame, "Folder End Col",   self._vcols["end_col"],   2)

        # Mode 2 & 3 frame
        self._m23_frame = ctk.CTkFrame(sec, fg_color="transparent")
        self._m23_frame.grid(row=21, column=0, sticky="ew")
        self._m23_frame.columnconfigure(0, weight=1)
        ctk.CTkLabel(
            self._m23_frame, text="MODE 2 / 3", text_color="#374151",
            font=ctk.CTkFont("Segoe UI", 9, "bold")
        ).grid(row=0, sticky="w", pady=(6, 0))
        self._vcols["keep_delete_col"] = StringVar(value="G")
        self._vcols["collection_col"]  = StringVar(value="Q")
        lbl_entry(self._m23_frame, "KEEP/DELETE Col",          self._vcols["keep_delete_col"], 1)
        lbl_entry(self._m23_frame, "Collection Col (Mode 2)",  self._vcols["collection_col"],  2)
        ctk.CTkLabel(
            self._m23_frame, text="Mode 3 Folder Cols (e.g. H,I,J):",
            font=ctk.CTkFont("Segoe UI", 11), text_color="#9CA3AF"
        ).grid(row=3, sticky="w", pady=(4, 0))
        self._folder_cols_var = StringVar(value="H")
        ctk.CTkEntry(
            self._m23_frame, textvariable=self._folder_cols_var,
            fg_color="#0D0F14", border_color="#2D3748",
            font=ctk.CTkFont("Consolas", 11), height=24
        ).grid(row=4, sticky="ew", pady=2)

        # Stats
        stats_sec = self._section(parent, "Last Run Stats", row=1)
        self._stats_copied  = self._stat_row(stats_sec, "Copied",  "#22C55E")
        self._stats_skipped = self._stat_row(stats_sec, "Skipped", "#F59E0B")
        self._stats_errors  = self._stat_row(stats_sec, "Errors",  "#EF4444")

        # Config save/load
        cfg_sec = self._section(parent, "Configuration", row=2)
        r = ctk.CTkFrame(cfg_sec, fg_color="transparent")
        r.pack(fill="x")
        ctk.CTkButton(
            r, text="💾  Save Config", width=110, height=28,
            fg_color="#1E293B", hover_color="#334155",
            command=self._save_config
        ).pack(side="left", padx=(0, 6))
        ctk.CTkButton(
            r, text="📂  Load Config", width=110, height=28,
            fg_color="#1E293B", hover_color="#334155",
            command=self._load_config
        ).pack(side="left")

        self._on_mode_change()

    # ── Helpers ────────────────────────────────────────────

    def _stat_row(self, parent, label, color):
        f = ctk.CTkFrame(parent, fg_color="transparent")
        f.pack(fill="x", pady=1)
        ctk.CTkLabel(
            f, text=label,
            font=ctk.CTkFont("Segoe UI", 11),
            text_color="#6B7280", width=80, anchor="w"
        ).pack(side="left")
        lbl = ctk.CTkLabel(
            f, text="—",
            font=ctk.CTkFont("Segoe UI", 14, "bold"),
            text_color=color
        )
        lbl.pack(side="left")
        return lbl

    def _section(self, parent, title, row):
        frame = ctk.CTkFrame(
            parent, fg_color="#151821", corner_radius=8,
            border_color="#1F2937", border_width=1
        )
        frame.grid(row=row, column=0, sticky="nsew", pady=(0, 10))
        frame.columnconfigure(0, weight=1)
        ctk.CTkLabel(
            frame, text=title.upper(),
            font=ctk.CTkFont("Segoe UI", 10, "bold"),
            text_color="#4B5563"
        ).pack(anchor="w", padx=12, pady=(8, 0))
        inner = ctk.CTkFrame(frame, fg_color="transparent")
        inner.pack(fill="both", expand=True, padx=12, pady=(4, 10))
        inner.columnconfigure(0, weight=1)
        return inner

    # ── UI Actions ─────────────────────────────────────────

    def _on_mode_change(self):
        m = self._mode_var.get()
        self._mode_desc.configure(text=MODE_DESC[m])
        if m == 1:
            self._m1_frame.grid()
            self._m23_frame.grid_remove()
        else:
            self._m1_frame.grid_remove()
            self._m23_frame.grid()

    def _add_files(self):
        files = filedialog.askopenfilenames(
            title="Select Excel Files",
            filetypes=[("Excel Files", "*.xlsx *.xlsm *.xls"), ("All", "*.*")]
        )
        for f in files:
            current = self._files_box.get("1.0", "end")
            if f not in current:
                self._files_box.insert("end", f + "\n")

    def _clear_files(self):
        self._files_box.delete("1.0", "end")

    def _browse_out(self):
        d = filedialog.askdirectory(title="Select Output Folder")
        if d:
            self._out_var.set(d)

    def _clear_log(self):
        self._log_box.configure(state="normal")
        self._log_box.delete("1.0", "end")
        self._log_box.configure(state="disabled")

    def _col_int(self, key, default):
        v = self._vcols.get(key, StringVar()).get().strip().upper()
        if not v:
            return default
        try:
            return col_num(v) if v.isalpha() else int(v)
        except Exception:
            return default

    def _build_config(self) -> OrganizerConfig:
        files_raw = self._files_box.get("1.0", "end").strip().splitlines()
        excel_files = [f.strip() for f in files_raw if f.strip()]

        folder_cols = []
        for part in self._folder_cols_var.get().split(","):
            p = part.strip().upper()
            if p:
                try:
                    folder_cols.append(col_num(p) if p.isalpha() else int(p))
                except Exception:
                    pass
        if not folder_cols:
            folder_cols = [8]

        return OrganizerConfig(
            excel_files=excel_files,
            output_folder=self._out_var.get().strip(),
            mode=self._mode_var.get(),
            image_col=self._col_int("image_col", 5),
            name_col=self._col_int("name_col", 3),
            category_col=self._col_int("category_col", 10),
            sub_category_col=self._col_int("sub_category_col", 11),
            material_col=self._col_int("material_col", 13),
            sub_material_col=self._col_int("sub_material_col", 14),
            shape_col=self._col_int("shape_col", 12),
            technique_col=self._col_int("technique_col", 15),
            pattern_col=self._col_int("pattern_col", 16),
            year_col=self._col_int("year_col", 26),
            start_col=self._col_int("start_col", 7),
            end_col=self._col_int("end_col", 17),
            keep_delete_col=self._col_int("keep_delete_col", 7),
            collection_col=self._col_int("collection_col", 17),
            folder_columns=folder_cols,
        )

    # ── Run / Cancel ───────────────────────────────────────

    def _start(self):
        cfg = self._build_config()
        if not cfg.excel_files:
            messagebox.showerror("Error", "No Excel files selected.")
            return
        if not cfg.output_folder:
            messagebox.showerror("Error", "Output folder not set.")
            return

        self._run_btn.configure(state="disabled")
        self._cancel_btn.configure(state="normal")
        self._progress.set(0)
        self._status_lbl.configure(text="Running…")
        self._clear_log()

        def _run():
            organizer = ImageOrganizer(
                cfg,
                log_callback=lambda lvl, msg: self.after(0, lambda: self._append_log(lvl, msg))
            )
            self._organizer = organizer
            result = organizer.run(
                progress_callback=lambda cur, tot, msg: self.after(0, lambda: [
                    self._progress.set(cur / tot if tot else 0),
                    self._status_lbl.configure(text=msg)
                ])
            )
            self.after(0, lambda: self._on_done(result))

        threading.Thread(target=_run, daemon=True).start()
        self._save_session()

    def _cancel(self):
        if self._organizer:
            self._organizer.cancel()
        self._status_lbl.configure(text="Cancelling…")

    def _on_done(self, result):
        self._run_btn.configure(state="normal")
        self._cancel_btn.configure(state="disabled")
        self._progress.set(1.0)
        self._status_lbl.configure(text=f"Done — {result['copied']} copied")
        self._stats_copied.configure(text=str(result["copied"]))
        self._stats_skipped.configure(text=str(result["skipped"]))
        self._stats_errors.configure(text=str(result["errors"]))
        self._append_log(
            "info",
            f"─── DONE | Copied:{result['copied']}  Skipped:{result['skipped']}  Errors:{result['errors']} ───"
        )

    def _append_log(self, level, msg):
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}\n"
        self._log_box.configure(state="normal")
        self._log_box.insert("end", line)
        self._log_box.see("end")
        self._log_box.configure(state="disabled")

    # ── Session / Config persistence ───────────────────────

    def _config_to_dict(self):
        return {
            "excel_files": [l for l in self._files_box.get("1.0", "end").strip().splitlines() if l.strip()],
            "output_folder": self._out_var.get(),
            "mode": self._mode_var.get(),
            "cols": {k: v.get() for k, v in self._vcols.items()},
            "folder_columns": self._folder_cols_var.get(),
        }

    def _dict_to_ui(self, d):
        self._files_box.delete("1.0", "end")
        for f in d.get("excel_files", []):
            if f.strip():
                self._files_box.insert("end", f.strip() + "\n")
        self._out_var.set(d.get("output_folder", ""))
        self._mode_var.set(d.get("mode", 2))
        for k, v in d.get("cols", {}).items():
            if k in self._vcols:
                self._vcols[k].set(v)
        self._folder_cols_var.set(d.get("folder_columns", "H"))
        self._on_mode_change()

    def _save_session(self):
        try:
            os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
            with open(CONFIG_FILE, "w") as f:
                json.dump(self._config_to_dict(), f, indent=2)
        except Exception:
            pass

    def _load_session(self):
        try:
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE) as f:
                    self._dict_to_ui(json.load(f))
        except Exception:
            pass

    def _save_config(self):
        path = filedialog.asksaveasfilename(
            title="Save Configuration",
            defaultextension=".json",
            filetypes=[("JSON", "*.json")]
        )
        if path:
            with open(path, "w") as f:
                json.dump(self._config_to_dict(), f, indent=2)
            messagebox.showinfo("Saved", f"Config saved:\n{path}")

    def _load_config(self):
        path = filedialog.askopenfilename(
            title="Load Configuration",
            filetypes=[("JSON", "*.json")]
        )
        if path:
            with open(path) as f:
                self._dict_to_ui(json.load(f))
