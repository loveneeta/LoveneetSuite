import os
import sys

# Ensure imports resolve relative to this file, not the working directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import customtkinter as ctk
from modules.image_converter import ImageConverterFrame
from modules.ppt_exporter import PPTExporterFrame
from modules.image_organizer_module import ImageOrganizerFrame

# =========================================================
# APP
# =========================================================

class MasterApp(ctk.CTk):

    def __init__(self):
        super().__init__()

        # WINDOW
        self.title("Loveneet Business Suite")
        self.geometry("1400x850")

        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        # =================================================
        # SIDEBAR
        # =================================================

        self.sidebar = ctk.CTkFrame(
            self,
            width=260,
            corner_radius=0
        )

        self.sidebar.pack(
            side="left",
            fill="y"
        )

        # LOGO
        self.logo = ctk.CTkLabel(
            self.sidebar,
            text="LOVENEET\nSUITE",
            font=("Arial", 26, "bold")
        )

        self.logo.pack(
            pady=(30, 40)
        )

        # =================================================
        # SIDEBAR BUTTONS
        # =================================================

        self.buttons = {}

        menu_items = [
            "Dashboard",
            "Catalog Generator",
            "PPT Exporter",
            "Image Converter",
            "Image Organizer",       # ← NEW
            "Images To PPT",
            "Template Designer",
            "Settings"
        ]

        for item in menu_items:

            btn = ctk.CTkButton(
                self.sidebar,
                text=item,
                height=45,
                anchor="w",
                command=lambda x=item: self.load_page(x)
            )

            btn.pack(
                fill="x",
                padx=15,
                pady=6
            )

            self.buttons[item] = btn

        # =================================================
        # MAIN AREA
        # =================================================

        self.main = ctk.CTkFrame(
            self,
            corner_radius=0
        )

        self.main.pack(
            side="left",
            fill="both",
            expand=True
        )

        # TITLE
        self.page_title = ctk.CTkLabel(
            self.main,
            text="Dashboard",
            font=("Arial", 28, "bold")
        )

        self.page_title.pack(
            anchor="nw",
            padx=30,
            pady=(30, 10)
        )

        # CONTENT AREA
        self.content = ctk.CTkFrame(
            self.main
        )

        self.content.pack(
            fill="both",
            expand=True,
            padx=20,
            pady=20
        )

        # DEFAULT PAGE
        self.load_dashboard()

    # =====================================================
    # PAGE LOADER
    # =====================================================

    def clear_content(self):

        for widget in self.content.winfo_children():
            widget.destroy()

    def load_page(self, page_name):

        self.page_title.configure(
            text=page_name
        )

        self.clear_content()

        if page_name == "Dashboard":
            self.load_dashboard()

        elif page_name == "Catalog Generator":
            self.placeholder(page_name)

        elif page_name == "PPT Exporter":

            frame = PPTExporterFrame(
                self.content
            )

            frame.pack(
                fill="both",
                expand=True
            )

        elif page_name == "Image Converter":

            frame = ImageConverterFrame(
                self.content
            )

            frame.pack(
                fill="both",
                expand=True
            )

        elif page_name == "Image Organizer":        # ← NEW

            frame = ImageOrganizerFrame(
                self.content
            )

            frame.pack(
                fill="both",
                expand=True,
                padx=10,
                pady=10
            )

        elif page_name == "Images To PPT":
            self.placeholder(page_name)

        elif page_name == "Template Designer":
            self.placeholder(page_name)

        elif page_name == "Settings":
            self.placeholder(page_name)

    # =====================================================
    # DASHBOARD
    # =====================================================

    def load_dashboard(self):

        self.clear_content()

        cards = [
            "Catalog Generator",
            "PPT Exporter",
            "Image Converter",
            "Image Organizer",       # ← NEW card
            "Images To PPT",
            "Template Designer"
        ]

        row = 0
        col = 0

        for card in cards:

            frame = ctk.CTkFrame(
                self.content,
                width=260,
                height=150
            )

            frame.grid(
                row=row,
                column=col,
                padx=20,
                pady=20
            )

            frame.grid_propagate(False)

            label = ctk.CTkLabel(
                frame,
                text=card,
                font=("Arial", 20, "bold")
            )

            label.place(
                relx=0.5,
                rely=0.5,
                anchor="center"
            )

            # Make card clickable
            frame.bind("<Button-1>", lambda e, c=card: self.load_page(c))
            label.bind("<Button-1>", lambda e, c=card: self.load_page(c))

            col += 1

            if col > 2:
                col = 0
                row += 1

    # =====================================================
    # PLACEHOLDER PAGE
    # =====================================================

    def placeholder(self, text):

        label = ctk.CTkLabel(
            self.content,
            text=f"{text} Module Coming Soon",
            font=("Arial", 24)
        )

        label.pack(
            expand=True
        )


# =========================================================
# START APP
# =========================================================

if __name__ == "__main__":

    app = MasterApp()

    app.mainloop()