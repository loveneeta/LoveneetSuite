import os
import re
import threading
from pathlib import Path

import customtkinter as ctk

from tkinter import (
    filedialog,
    messagebox
)

import win32com.client

from PIL import Image


# =========================================================
# SETTINGS
# =========================================================

VALID_PPT = (
    ".ppt",
    ".pptx"
)


# =========================================================
# PPT EXPORTER FRAME
# =========================================================

class PPTExporterFrame(ctk.CTkFrame):

    def __init__(self, parent):

        super().__init__(parent)

        self.selected_files = []

        self.output_folder = ""

        self.build_ui()

    # =====================================================
    # UI
    # =====================================================

    def build_ui(self):

        # =================================================
        # TITLE
        # =================================================

        title = ctk.CTkLabel(
            self,
            text="PPT Exporter",
            font=("Arial", 30, "bold")
        )

        title.pack(
            pady=(15, 10)
        )

        # =================================================
        # MAIN AREA
        # =================================================

        main_frame = ctk.CTkFrame(self)

        main_frame.pack(
            fill="both",
            expand=True,
            padx=15,
            pady=10
        )

        # =================================================
        # LEFT PANEL
        # =================================================

        left_panel = ctk.CTkFrame(
            main_frame,
            width=420
        )

        left_panel.pack(
            side="left",
            fill="y",
            padx=(0, 10)
        )

        left_panel.pack_propagate(False)

        # =================================================
        # BUTTONS
        # =================================================

        button_frame = ctk.CTkFrame(left_panel)

        button_frame.pack(
            fill="x",
            padx=10,
            pady=10
        )

        ctk.CTkButton(
            button_frame,
            text="Select PPT Files",
            height=40,
            command=self.select_ppts
        ).pack(
            fill="x",
            pady=5
        )

        ctk.CTkButton(
            button_frame,
            text="Select Folder",
            height=40,
            command=self.select_folder
        ).pack(
            fill="x",
            pady=5
        )

        ctk.CTkButton(
            button_frame,
            text="Select Output Folder",
            height=40,
            command=self.select_output
        ).pack(
            fill="x",
            pady=5
        )

        # =================================================
        # FORMAT OPTIONS
        # =================================================

        format_frame = ctk.CTkFrame(left_panel)

        format_frame.pack(
            fill="x",
            padx=10,
            pady=10
        )

        ctk.CTkLabel(
            format_frame,
            text="Export Formats",
            font=("Arial", 18, "bold")
        ).pack(
            anchor="w",
            padx=10,
            pady=(10, 10)
        )

        self.export_jpg = ctk.BooleanVar(
            value=True
        )

        self.export_webp = ctk.BooleanVar(
            value=True
        )

        self.export_png = ctk.BooleanVar(
            value=False
        )

        ctk.CTkCheckBox(
            format_frame,
            text="High Quality JPG",
            variable=self.export_jpg
        ).pack(
            anchor="w",
            padx=15,
            pady=5
        )

        ctk.CTkCheckBox(
            format_frame,
            text="WEBP",
            variable=self.export_webp
        ).pack(
            anchor="w",
            padx=15,
            pady=5
        )

        ctk.CTkCheckBox(
            format_frame,
            text="PNG",
            variable=self.export_png
        ).pack(
            anchor="w",
            padx=15,
            pady=(5, 10)
        )

        # =================================================
        # QUALITY
        # =================================================

        quality_frame = ctk.CTkFrame(left_panel)

        quality_frame.pack(
            fill="x",
            padx=10,
            pady=10
        )

        self.quality_label = ctk.CTkLabel(
            quality_frame,
            text="WEBP Quality: 95"
        )

        self.quality_label.pack(
            anchor="w",
            padx=10,
            pady=(10, 0)
        )

        self.quality_slider = ctk.CTkSlider(
            quality_frame,
            from_=10,
            to=100,
            number_of_steps=90,
            command=self.update_quality
        )

        self.quality_slider.pack(
            fill="x",
            padx=10,
            pady=10
        )

        self.quality_slider.set(95)

        # =================================================
        # PROGRESS
        # =================================================

        self.progress = ctk.CTkProgressBar(left_panel)

        self.progress.pack(
            fill="x",
            padx=15,
            pady=20
        )

        self.progress.set(0)

        # =================================================
        # EXPORT BUTTON
        # =================================================

        self.export_btn = ctk.CTkButton(
            left_panel,
            text="START EXPORT",
            height=50,
            font=("Arial", 16, "bold"),
            command=self.start_thread
        )

        self.export_btn.pack(
            fill="x",
            padx=15,
            pady=(0, 15)
        )

        # =================================================
        # RIGHT PANEL
        # =================================================

        right_panel = ctk.CTkFrame(main_frame)

        right_panel.pack(
            side="left",
            fill="both",
            expand=True
        )

        ctk.CTkLabel(
            right_panel,
            text="Selected PPT Files",
            font=("Arial", 24, "bold")
        ).pack(
            pady=(10, 10)
        )

        self.file_list = ctk.CTkScrollableFrame(
            right_panel
        )

        self.file_list.pack(
            fill="both",
            expand=True,
            padx=10,
            pady=10
        )

    # =====================================================
    # QUALITY UPDATE
    # =====================================================

    def update_quality(self, value):

        self.quality_label.configure(
            text=f"WEBP Quality: {int(value)}"
        )

    # =====================================================
    # SELECT PPT FILES
    # =====================================================

    def select_ppts(self):

        files = filedialog.askopenfilenames(

            title="Select PPT Files",

            filetypes=[
                (
                    "PowerPoint Files",
                    "*.ppt *.pptx"
                )
            ]
        )

        if files:

            self.selected_files.extend(
                list(files)
            )

            self.selected_files = list(
                set(self.selected_files)
            )

            self.refresh_file_list()

    # =====================================================
    # SELECT FOLDER
    # =====================================================

    def select_folder(self):

        folder = filedialog.askdirectory()

        if not folder:
            return

        files = []

        for root, _, filenames in os.walk(folder):

            for file in filenames:

                if file.lower().endswith(VALID_PPT):

                    files.append(
                        os.path.join(root, file)
                    )

        self.selected_files.extend(files)

        self.selected_files = list(
            set(self.selected_files)
        )

        self.refresh_file_list()

    # =====================================================
    # SELECT OUTPUT
    # =====================================================

    def select_output(self):

        folder = filedialog.askdirectory()

        if folder:

            self.output_folder = folder

    # =====================================================
    # REFRESH FILE LIST
    # =====================================================

    def refresh_file_list(self):

        for widget in self.file_list.winfo_children():

            widget.destroy()

        for file_path in self.selected_files:

            row = ctk.CTkFrame(self.file_list)

            row.pack(
                fill="x",
                pady=5,
                padx=5
            )

            label = ctk.CTkLabel(
                row,
                text=os.path.basename(file_path),
                anchor="w"
            )

            label.pack(
                side="left",
                fill="x",
                expand=True,
                padx=10,
                pady=10
            )

            remove_btn = ctk.CTkButton(
                row,
                text="Remove",
                width=90,
                fg_color="red",
                command=lambda f=file_path: self.remove_file(f)
            )

            remove_btn.pack(
                side="right",
                padx=10
            )

    # =====================================================
    # REMOVE FILE
    # =====================================================

    def remove_file(self, file_path):

        if file_path in self.selected_files:

            self.selected_files.remove(file_path)

            self.refresh_file_list()

    # =====================================================
    # THREAD
    # =====================================================

    def start_thread(self):

        threading.Thread(
            target=self.start_export,
            daemon=True
        ).start()

    # =====================================================
    # EXPORT
    # =====================================================

    def start_export(self):

        if not self.selected_files:

            messagebox.showerror(
                "Error",
                "No PPT selected"
            )

            return

        if (
            not self.export_jpg.get()
            and not self.export_webp.get()
            and not self.export_png.get()
        ):

            messagebox.showerror(
                "Error",
                "Select at least one format"
            )

            return

        quality = int(
            self.quality_slider.get()
        )

        ppt = win32com.client.Dispatch(
            "PowerPoint.Application"
        )

        ppt.Visible = 1

        total = len(self.selected_files)

        try:

            for index, ppt_file in enumerate(self.selected_files):

                ppt_path = Path(ppt_file)

                export_root = self.output_folder

                if not export_root:

                    export_root = str(
                        ppt_path.parent
                    )

                export_folder = os.path.join(
                    export_root,
                    ppt_path.stem
                )

                os.makedirs(
                    export_folder,
                    exist_ok=True
                )

                presentation = ppt.Presentations.Open(
                    str(ppt_path),
                    WithWindow=False
                )

                for slide in presentation.Slides:

                    slide_name = self.get_slide_name(slide)

                    # =====================================
                    # JPG
                    # =====================================

                    if self.export_jpg.get():

                        jpg_folder = os.path.join(
                            export_folder,
                            "High_Quality_JPG"
                        )

                        os.makedirs(
                            jpg_folder,
                            exist_ok=True
                        )

                        out = os.path.join(
                            jpg_folder,
                            f"{slide_name}.jpg"
                        )

                        slide.Export(
                            out,
                            "JPG"
                        )

                    # =====================================
                    # PNG
                    # =====================================

                    if self.export_png.get():

                        png_folder = os.path.join(
                            export_folder,
                            "PNG"
                        )

                        os.makedirs(
                            png_folder,
                            exist_ok=True
                        )

                        out = os.path.join(
                            png_folder,
                            f"{slide_name}.png"
                        )

                        slide.Export(
                            out,
                            "PNG"
                        )

                    # =====================================
                    # WEBP
                    # =====================================

                    if self.export_webp.get():

                        webp_folder = os.path.join(
                            export_folder,
                            "WEBP"
                        )

                        os.makedirs(
                            webp_folder,
                            exist_ok=True
                        )

                        temp_png = os.path.join(
                            webp_folder,
                            "_temp.png"
                        )

                        slide.Export(
                            temp_png,
                            "PNG"
                        )

                        img = Image.open(temp_png)

                        out = os.path.join(
                            webp_folder,
                            f"{slide_name}.webp"
                        )

                        img.save(
                            out,
                            "WEBP",
                            quality=quality
                        )

                        if os.path.exists(temp_png):

                            os.remove(temp_png)

                presentation.Close()

                progress = (index + 1) / total

                self.progress.set(progress)

                self.update_idletasks()

            ppt.Quit()

            messagebox.showinfo(
                "Done",
                "Export Complete"
            )

        except Exception as e:

            messagebox.showerror(
                "Error",
                str(e)
            )

    # =====================================================
    # GET SLIDE NAME
    # =====================================================

    def get_slide_name(self, slide):

        best_shape = None

        best_score = -1

        for shape in slide.Shapes:

            try:

                if shape.HasTextFrame:

                    if shape.TextFrame.HasText:

                        text = (
                            shape.TextFrame
                            .TextRange
                            .Text
                        )

                        if "|" in text:

                            score = (
                                shape.Top * 10000
                            ) + shape.Left

                            if score > best_score:

                                best_score = score

                                best_shape = shape

            except:
                pass

        if best_shape is None:

            return f"Slide_{slide.SlideIndex:03d}"

        text = (
            best_shape.TextFrame
            .TextRange
            .Text
        )

        candidate = (
            text.split("|")[0]
            .strip()
        )

        candidate = re.sub(
            r'[\\/:*?"<>|]',
            '-',
            candidate
        )

        candidate = re.sub(
            r'-+',
            '-',
            candidate
        )

        return (
            candidate.strip("-")
            .strip()
        )