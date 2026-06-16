import os
import threading
import customtkinter as ctk

from tkinter import filedialog, messagebox
from PIL import Image, ImageTk


VALID_EXT = (
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".tiff"
)


# =========================================================
# IMAGE CONVERTER FRAME
# =========================================================

class ImageConverterFrame(ctk.CTkFrame):

    def __init__(self, parent):

        super().__init__(parent)

        self.selected_files = []

        self.output_folder = ""

        self.thumbnail_refs = []

        self.preview_image_ref = None

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
            text="Image Converter Pro",
            font=("Arial", 30, "bold")
        )

        title.pack(
            pady=(15, 10)
        )

        # =================================================
        # TOP AREA
        # =================================================

        top_frame = ctk.CTkFrame(self)

        top_frame.pack(
            fill="both",
            expand=True,
            padx=15,
            pady=10
        )

        # =================================================
        # LEFT PANEL
        # =================================================

        left_panel = ctk.CTkFrame(
            top_frame,
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
            text="Select Images",
            command=self.select_images,
            height=40
        ).pack(
            fill="x",
            pady=5
        )

        ctk.CTkButton(
            button_frame,
            text="Select Folder",
            command=self.select_folder,
            height=40
        ).pack(
            fill="x",
            pady=5
        )

        ctk.CTkButton(
            button_frame,
            text="Select Output Folder",
            command=self.select_output,
            height=40
        ).pack(
            fill="x",
            pady=5
        )

        # =================================================
        # FORMAT
        # =================================================

        format_frame = ctk.CTkFrame(left_panel)

        format_frame.pack(
            fill="x",
            padx=10,
            pady=10
        )

        ctk.CTkLabel(
            format_frame,
            text="Output Format",
            font=("Arial", 16, "bold")
        ).pack(
            anchor="w",
            padx=10,
            pady=(10, 5)
        )

        self.output_format = ctk.StringVar(
            value="jpg"
        )

        ctk.CTkOptionMenu(
            format_frame,
            values=[
                "jpg",
                "png",
                "webp",
                "bmp",
                "tiff"
            ],
            variable=self.output_format
        ).pack(
            fill="x",
            padx=10,
            pady=(0, 10)
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
            text="Quality: 90"
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

        self.quality_slider.set(90)

        # =================================================
        # RESIZE OPTIONS
        # =================================================

        resize_frame = ctk.CTkFrame(left_panel)

        resize_frame.pack(
            fill="x",
            padx=10,
            pady=10
        )

        ctk.CTkLabel(
            resize_frame,
            text="Resize Options",
            font=("Arial", 16, "bold")
        ).pack(
            anchor="w",
            padx=10,
            pady=(10, 5)
        )

        size_inner = ctk.CTkFrame(resize_frame)

        size_inner.pack(
            fill="x",
            padx=10,
            pady=10
        )

        self.width_entry = ctk.CTkEntry(
            size_inner,
            placeholder_text="Width"
        )

        self.width_entry.pack(
            side="left",
            expand=True,
            fill="x",
            padx=(0, 5)
        )

        self.height_entry = ctk.CTkEntry(
            size_inner,
            placeholder_text="Height"
        )

        self.height_entry.pack(
            side="left",
            expand=True,
            fill="x",
            padx=(5, 0)
        )

        # =================================================
        # OUTPUT SUBFOLDER
        # =================================================

        subfolder_frame = ctk.CTkFrame(left_panel)

        subfolder_frame.pack(
            fill="x",
            padx=10,
            pady=10
        )

        ctk.CTkLabel(
            subfolder_frame,
            text="Output Subfolder Name"
        ).pack(
            anchor="w",
            padx=10,
            pady=(10, 5)
        )

        self.subfolder_entry = ctk.CTkEntry(
            subfolder_frame,
            placeholder_text="converted_images"
        )

        self.subfolder_entry.pack(
            fill="x",
            padx=10,
            pady=(0, 10)
        )

        # =================================================
        # PROGRESS
        # =================================================

        self.progress = ctk.CTkProgressBar(left_panel)

        self.progress.pack(
            fill="x",
            padx=15,
            pady=15
        )

        self.progress.set(0)

        # =================================================
        # CONVERT BUTTON
        # =================================================

        self.convert_btn = ctk.CTkButton(
            left_panel,
            text="START CONVERSION",
            height=50,
            font=("Arial", 16, "bold"),
            command=self.start_thread
        )

        self.convert_btn.pack(
            fill="x",
            padx=15,
            pady=(5, 15)
        )

        # =================================================
        # RIGHT PANEL
        # =================================================

        right_panel = ctk.CTkFrame(top_frame)

        right_panel.pack(
            side="left",
            fill="both",
            expand=True
        )

        # =================================================
        # PREVIEW TITLE
        # =================================================

        ctk.CTkLabel(
            right_panel,
            text="Preview Panel",
            font=("Arial", 22, "bold")
        ).pack(
            pady=(10, 5)
        )

        # =================================================
        # PREVIEW IMAGE
        # =================================================

        self.preview_label = ctk.CTkLabel(
            right_panel,
            text="No Image Selected"
        )

        self.preview_label.pack(
            pady=10
        )

        # =================================================
        # IMAGE LIST
        # =================================================

        self.image_list = ctk.CTkScrollableFrame(
            right_panel
        )

        self.image_list.pack(
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
            text=f"Quality: {int(value)}"
        )

    # =====================================================
    # SELECT OUTPUT
    # =====================================================

    def select_output(self):

        folder = filedialog.askdirectory()

        if folder:

            self.output_folder = folder

    # =====================================================
    # SELECT IMAGES
    # =====================================================

    def select_images(self):

        files = filedialog.askopenfilenames(

            title="Select Images",

            filetypes=[
                (
                    "Images",
                    "*.png *.jpg *.jpeg *.webp *.bmp *.tiff"
                )
            ]
        )

        if files:

            self.selected_files.extend(list(files))

            self.refresh_image_list()

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

                if file.lower().endswith(VALID_EXT):

                    files.append(
                        os.path.join(root, file)
                    )

        self.selected_files.extend(files)

        self.refresh_image_list()

    # =====================================================
    # REFRESH IMAGE LIST
    # =====================================================

    def refresh_image_list(self):

        for widget in self.image_list.winfo_children():

            widget.destroy()

        self.thumbnail_refs.clear()

        for file_path in self.selected_files:

            row = ctk.CTkFrame(self.image_list)

            row.pack(
                fill="x",
                pady=5,
                padx=5
            )

            # =============================================
            # THUMBNAIL
            # =============================================

            try:

                img = Image.open(file_path)

                img.thumbnail((70, 70))

                thumb = ImageTk.PhotoImage(img)

                self.thumbnail_refs.append(thumb)

                thumb_label = ctk.CTkLabel(
                    row,
                    image=thumb,
                    text=""
                )

                thumb_label.pack(
                    side="left",
                    padx=10,
                    pady=10
                )

            except:

                pass

            # =============================================
            # FILE NAME
            # =============================================

            file_label = ctk.CTkLabel(
                row,
                text=os.path.basename(file_path),
                anchor="w"
            )

            file_label.pack(
                side="left",
                fill="x",
                expand=True,
                padx=10
            )

            # =============================================
            # PREVIEW BUTTON
            # =============================================

            preview_btn = ctk.CTkButton(
                row,
                text="Preview",
                width=90,
                command=lambda f=file_path: self.show_preview(f)
            )

            preview_btn.pack(
                side="right",
                padx=5
            )

            # =============================================
            # REMOVE BUTTON
            # =============================================

            remove_btn = ctk.CTkButton(
                row,
                text="Remove",
                width=90,
                fg_color="red",
                command=lambda f=file_path: self.remove_image(f)
            )

            remove_btn.pack(
                side="right",
                padx=5
            )

    # =====================================================
    # SHOW PREVIEW
    # =====================================================

    def show_preview(self, file_path):

        try:

            img = Image.open(file_path)

            img.thumbnail((500, 500))

            preview = ImageTk.PhotoImage(img)

            self.preview_image_ref = preview

            self.preview_label.configure(
                image=preview,
                text=""
            )

        except Exception as e:

            print(e)

    # =====================================================
    # REMOVE IMAGE
    # =====================================================

    def remove_image(self, file_path):

        if file_path in self.selected_files:

            self.selected_files.remove(file_path)

            self.refresh_image_list()

    # =====================================================
    # THREAD START
    # =====================================================

    def start_thread(self):

        threading.Thread(
            target=self.start_conversion,
            daemon=True
        ).start()

    # =====================================================
    # START CONVERSION
    # =====================================================

    def start_conversion(self):

        if not self.selected_files:

            messagebox.showerror(
                "Error",
                "No images selected"
            )

            return

        fmt = self.output_format.get()

        quality = int(
            self.quality_slider.get()
        )

        width = self.width_entry.get().strip()

        height = self.height_entry.get().strip()

        resize_w = int(width) if width else None

        resize_h = int(height) if height else None

        # =================================================
        # OUTPUT FOLDER
        # =================================================

        if not self.output_folder:

            self.output_folder = os.path.dirname(
                self.selected_files[0]
            )

        subfolder = self.subfolder_entry.get().strip()

        final_output = self.output_folder

        if subfolder:

            final_output = os.path.join(
                self.output_folder,
                subfolder
            )

        os.makedirs(
            final_output,
            exist_ok=True
        )

        # =================================================
        # PROCESS
        # =================================================

        total = len(self.selected_files)

        for index, file_path in enumerate(self.selected_files):

            try:

                img = Image.open(file_path)

                # =========================================
                # RESIZE
                # =========================================

                if resize_w and resize_h:

                    img = img.resize(
                        (resize_w, resize_h)
                    )

                filename = os.path.basename(file_path)

                name = os.path.splitext(filename)[0]

                output = os.path.join(
                    final_output,
                    f"{name}.{fmt}"
                )

                # =========================================
                # SAVE
                # =========================================

                if fmt in ["jpg", "jpeg"]:

                    img = img.convert("RGB")

                    img.save(
                        output,
                        "JPEG",
                        quality=quality
                    )

                elif fmt == "webp":

                    img.save(
                        output,
                        "WEBP",
                        quality=quality
                    )

                else:

                    img.save(output)

            except Exception as e:

                print(e)

            progress = (index + 1) / total

            self.progress.set(progress)

            self.update_idletasks()

        messagebox.showinfo(
            "Done",
            "Conversion Complete"
        )