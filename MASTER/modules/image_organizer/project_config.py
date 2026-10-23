from dataclasses import dataclass, field


@dataclass
class ProjectConfig:

    # ==========================================
    # PROJECT
    # ==========================================

    project_name: str = "Untitled Project"

    customer_name: str = ""

    # ==========================================
    # FILES
    # ==========================================

    excel_files: list = field(default_factory=list)

    output_folder: str = ""

    # ==========================================
    # PROCESSING
    # ==========================================

    mode: int = 2

    # ==========================================
    # HEADER MAPPING
    # Example:
    # {
    #   "NAME":"NAME",
    #   "URL":"URL"
    # }
    # ==========================================

    header_mapping: dict = field(default_factory=dict)

    # ==========================================
    # FILENAME BUILDER
    # ==========================================

    filename_fields: list = field(default_factory=lambda: [
        "NAME",
        "CATEGORY",
        "SUB-CATEGORY",
        "MATERIAL",
        "SUB-MATERIAL",
        "SHAPE",
        "TECHNIQUE",
        "PATTERN",
        "D. YEAR"
    ])

    separator: str = "_"

    # ==========================================
    # FOLDER BUILDER
    # ==========================================

    folder_levels: list = field(default_factory=list)

    # ==========================================
    # LOGS
    # ==========================================

    total_rows: int = 0

    processed_rows: int = 0

    copied_images: int = 0

    missing_images: int = 0

    duplicate_images: int = 0

    error_count: int = 0