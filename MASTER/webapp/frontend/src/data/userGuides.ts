export interface GuideStep {
  stepNumber: number;
  title: string;
  instruction: string;
  tip?: string;
}

export interface GuideControl {
  name: string;
  type: "Button" | "Input" | "Dropdown" | "Checkbox" | "Toggle" | "Slider" | "File Picker";
  purpose: string;
  whenToUse: string;
}

export interface GuideTroubleshooting {
  issue: string;
  cause: string;
  solution: string;
}

export interface ToolUserGuide {
  id: string;
  title: string;
  badge: string;
  tagline: string;
  overview: {
    description: string;
    benefits: string[];
    useCases: string[];
  };
  beforeYouStart: {
    requiredInputs: string[];
    supportedFormats: string[];
    requiredStructure: string[];
    limitations: string[];
  };
  stepByStep: GuideStep[];
  controlsReference: GuideControl[];
  examples: {
    inputExample: string;
    outputExample: string;
    explanation: string;
  };
  troubleshooting: GuideTroubleshooting[];
  offlineAndRequirements: {
    worksOffline: boolean;
    localProcessing: boolean;
    internetDetails: string;
  };
}

export const USER_GUIDES: Record<string, ToolUserGuide> = {
  collector: {
    id: "collector",
    title: "File Collector & Bulk Image Compressor",
    badge: "Core Workflow",
    tagline: "Recursively scan nested subfolders, flatten and collect files with folder prefixing, and compress images on the fly.",
    overview: {
      description: "File Collector traverses deeply nested folder structures (e.g. Products > Category > Subcategory > Item.jpg), gathers all contained files into a single flat output folder, prefixes files with their parent folder hierarchy, and optionally optimizes image sizes while preserving original source files safely.",
      benefits: [
        "Eliminates hours of manual subfolder navigation and file copying.",
        "Generates clean, traceable filenames: 'Chairs-Wooden-Chair01.jpg'.",
        "Prevents accidental overwrites through smart duplicate resolution.",
        "Built-in multi-mode compression targets specific file sizes (e.g. 200 KB or 1 MB).",
        "Safe Copy-Only: Never modifies, moves, or deletes source files on disk."
      ],
      useCases: [
        "Flattening multi-category product photo folders for ERP / e-commerce upload.",
        "Collecting render batches distributed across 60+ collection folders into one catalog folder.",
        "Compressing high-resolution photo archives down to 1 MB for PowerPoint and email sharing."
      ]
    },
    beforeYouStart: {
      requiredInputs: ["A source directory containing files or nested subfolders."],
      supportedFormats: [
        "All file extensions: JPG, PNG, WEBP, BMP, TIFF, GIF, HEIC, AVIF, PDF, Excel, Word, PowerPoint, ZIP, DWG, and more.",
        "Image Compression supports: JPG, JPEG, PNG, WebP, BMP, TIFF, GIF, HEIC, AVIF."
      ],
      requiredStructure: [
        "Any directory structure at any depth (1 to 20+ levels of subfolders).",
        "If output folder is inside the input folder, the tool automatically nests into 'Collected_Files' to avoid self-copy loops."
      ],
      limitations: [
        "Web mode requires granting browser directory access via the 'Browse' button.",
        "Inaccessible system-locked or permission-denied files are skipped and reported in the export error log."
      ]
    },
    stepByStep: [
      {
        stepNumber: 1,
        title: "Choose Input and Output Folders",
        instruction: "Click 'Browse' next to Input Folder to select your source directory. The Output Folder defaults to a 'Collected_Files' subfolder inside your input directory. You can optionally change the Output Folder to any other location.",
        tip: "In the Windows Desktop App, you can select any drive (C:\\, D:\\, E:\\) directly."
      },
      {
        stepNumber: 2,
        title: "Configure File Collection Rules",
        instruction: "Ensure 'Include Subfolders' is checked to scan all nested depths. Leave 'Prefix with Subfolder Names' checked to retain folder context (e.g., 'Dining-Chairs-Vase01.jpg'). Set Duplicate Handling to 'Auto Rename' (recommended) to prevent overwriting identical filenames.",
        tip: "Auto Rename appends (1), (2), etc. to subsequent conflicting filenames."
      },
      {
        stepNumber: 3,
        title: "Configure Image Compression (Optional)",
        instruction: "Turn ON 'Enable Bulk Image Compression' if you want to optimize images during collection. Select Mode ('Target Size Goal' e.g. 1 MB, 'Reduce File Size' with Quality slider, or 'Resize + Compress').",
        tip: "Check 'Skip Images Already Below Target' so already optimized photos are left untouched."
      },
      {
        stepNumber: 4,
        title: "Scan Files First",
        instruction: "Click 'Scan Files' to run a dry-run analysis. The dashboard will show the total files found, total images, and duplicate count before any copy takes place."
      },
      {
        stepNumber: 5,
        title: "Start Collection",
        instruction: "Click 'Start Collection'. Watch file-by-file progress, copied count, compression space saved, and final status.",
        tip: "Click 'Open Output Folder' upon completion to view your collected files directly in Windows File Explorer."
      }
    ],
    controlsReference: [
      { name: "Input Folder", type: "Input", purpose: "Specifies the root directory to scan recursively.", whenToUse: "Always specify before scanning." },
      { name: "Browse (Input)", type: "Button", purpose: "Opens native Windows folder picker.", whenToUse: "To select the source directory without typing paths." },
      { name: "Output Folder", type: "Input", purpose: "Destination directory where collected files are copied.", whenToUse: "Optional; defaults to 'Collected_Files'." },
      { name: "Include Subfolders", type: "Checkbox", purpose: "Recursively scans all subfolders at any depth.", whenToUse: "Keep checked for nested folders." },
      { name: "Prefix with Subfolder Names", type: "Checkbox", purpose: "Prepends parent folder names to the output filename.", whenToUse: "Keep checked to avoid ambiguous names like 'IMG_01.jpg'." },
      { name: "Include Hidden Files", type: "Checkbox", purpose: "Includes dotfiles and hidden system files.", whenToUse: "Leave unchecked unless you need hidden configuration files." },
      { name: "Duplicate Filename Handling", type: "Dropdown", purpose: "Selects collision strategy: Auto Rename, Skip Duplicates, or Overwrite.", whenToUse: "Use Auto Rename for safety." },
      { name: "Enable Bulk Image Compression", type: "Toggle", purpose: "Compresses images during collection.", whenToUse: "When images are too large for PowerPoint or web upload." },
      { name: "Compression Mode", type: "Dropdown", purpose: "Choose Target Size (e.g. 1 MB), Reduce File Size (Quality %), or Resize Dimensions.", whenToUse: "Target Size is ideal for catalog guidelines." },
      { name: "Scan Files", type: "Button", purpose: "Performs dry-run count of eligible files, images, and duplicates.", whenToUse: "Before starting collection to verify file totals." },
      { name: "Start Collection", type: "Button", purpose: "Executes copy and compression operations.", whenToUse: "When ready to copy files." },
      { name: "Cancel", type: "Button", purpose: "Aborts active copying after the current file finishes.", whenToUse: "To stop a mistaken job." },
      { name: "Open Output Folder", type: "Button", purpose: "Opens Windows File Explorer directly to the output folder.", whenToUse: "After collection finishes." },
      { name: "Download Report (CSV)", type: "Button", purpose: "Exports detailed CSV log of all copied, skipped, and failed files.", whenToUse: "For auditing and error verification." }
    ],
    examples: {
      inputExample: "E:\\Products\\Chairs\\Wooden\\Chair01.jpg (12.4 MB)\nE:\\Products\\Tables\\Table01.jpg (8.2 MB)\nE:\\Products\\Chairs\\Metal\\Chair01.jpg (11.1 MB)",
      outputExample: "Collected_Files\\Chairs-Wooden-Chair01.jpg (842 KB — compressed)\nCollected_Files\\Tables-Table01.jpg (795 KB — compressed)\nCollected_Files\\Chairs-Metal-Chair01 (1).jpg (810 KB — auto-renamed & compressed)",
      explanation: "Subfolder hierarchy was prefixed to filenames, duplicate 'Chair01' was automatically renamed with '(1)', and high-res photos were compressed to under 1 MB."
    },
    troubleshooting: [
      {
        issue: "Input folder does not exist error in web browser",
        cause: "Web browser cloud backend cannot reach physical drive letters like E:\\ directly without user permission.",
        solution: "Click the 'Browse' button to select the folder through the browser's folder dialog, or run the native Windows Desktop App which has direct disk access."
      },
      {
        issue: "Permission denied writing files",
        cause: "Destination folder is in a read-only directory or owned by another Windows process.",
        solution: "Choose an output folder in your User directory or Desktop, or close apps that have files locked."
      },
      {
        issue: "Images did not compress",
        cause: "Image was already smaller than target size, or format was unsupported vector/raw.",
        solution: "Check target size settings; ensure image format is JPG, PNG, WebP, BMP, or TIFF."
      }
    ],
    offlineAndRequirements: {
      worksOffline: true,
      localProcessing: true,
      internetDetails: "In the Windows Desktop App, scanning, file copying, and image compression run 100% locally and offline without internet. In web mode, processing runs in your browser via File System Access API."
    }
  },

  convert: {
    id: "convert",
    title: "Image Converter & Resizer",
    badge: "Batch Processing",
    tagline: "Batch convert multiple images between formats, adjust compression quality, and resize dimensions.",
    overview: {
      description: "Quickly convert image collections between JPG, PNG, WebP, BMP, and TIFF formats. Resize images by custom pixel width and height, adjust compression quality percentages, and download the entire converted batch as a packaged ZIP archive.",
      benefits: [
        "Batch convert hundreds of images in one operation.",
        "Modern WebP conversion reduces file size by up to 80% while retaining sharpness.",
        "Automatic ZIP packaging makes distribution effortless.",
        "Maintains aspect ratio when resizing."
      ],
      useCases: [
        "Converting heavy PNG/TIFF photoshoot assets to lightweight JPG/WebP for website uploads.",
        "Standardizing product images to max width 1200px for catalog production.",
        "Converting BMP or TIFF files into universally viewable JPEG formats."
      ]
    },
    beforeYouStart: {
      requiredInputs: ["One or more image files."],
      supportedFormats: ["JPG, JPEG, PNG, WebP, BMP, TIFF."],
      requiredStructure: ["Loose image files (multiple file selection supported)."],
      limitations: [
        "Resizing requires specifying both Width and Height (or leaving both empty to keep original dimensions).",
        "Animated GIF files are best kept in original format."
      ]
    },
    stepByStep: [
      {
        stepNumber: 1,
        title: "Choose Images",
        instruction: "Drag and drop your images into the dropzone or click 'Click to browse your device' to select one or multiple files."
      },
      {
        stepNumber: 2,
        title: "Select Output Format",
        instruction: "Select your desired output format from the dropdown: JPG, PNG, WebP, BMP, or TIFF.",
        tip: "WebP provides the best balance of visual quality and small file size."
      },
      {
        stepNumber: 3,
        title: "Adjust Quality and Dimensions",
        instruction: "Use the Quality slider (default 90%). Optionally enter target Width and Height in pixels (e.g. 1200 x 1200). Leave blank to keep original dimensions.",
        tip: "Enter both Width and Height if resizing; leaving both empty preserves full original resolution."
      },
      {
        stepNumber: 4,
        title: "Convert and Download",
        instruction: "Click 'Convert & download ZIP'. Your browser will download 'converted_images.zip' with all converted files."
      }
    ],
    controlsReference: [
      { name: "Choose image files", type: "File Picker", purpose: "Selects source images from your computer.", whenToUse: "Step 1." },
      { name: "Output format", type: "Dropdown", purpose: "Chooses target format (JPG, PNG, WebP, BMP, TIFF).", whenToUse: "Select based on your publishing destination." },
      { name: "Quality", type: "Slider", purpose: "Sets compression quality from 10% to 100%.", whenToUse: "Use 80-90% for optimal balance; 95%+ for print." },
      { name: "Resize width (px)", type: "Input", purpose: "Sets target image width in pixels.", whenToUse: "When standardizing image dimensions." },
      { name: "Resize height (px)", type: "Input", purpose: "Sets target image height in pixels.", whenToUse: "Must match width resize." },
      { name: "Convert & download ZIP", type: "Button", purpose: "Executes batch conversion and downloads ZIP file.", whenToUse: "When settings are configured." }
    ],
    examples: {
      inputExample: "ProductA.png (4.2 MB), ProductB.bmp (8.5 MB)",
      outputExample: "converted_images.zip containing:\nProductA.webp (320 KB)\nProductB.webp (410 KB)",
      explanation: "Images were converted to modern WebP format at 90% quality, reducing file size by ~90%."
    },
    troubleshooting: [
      {
        issue: "Error: Enter both resize dimensions or leave both empty",
        cause: "You entered a width without a height, or height without width.",
        solution: "Fill in both pixel dimensions or clear both fields to maintain original image resolution."
      },
      {
        issue: "Conversion failed with unsupported format",
        cause: "File has an unsupported extension or corrupted header.",
        solution: "Ensure files are valid JPG, PNG, WebP, BMP, or TIFF."
      }
    ],
    offlineAndRequirements: {
      worksOffline: true,
      localProcessing: true,
      internetDetails: "In the desktop app and modern browsers, image conversion is processed locally using Pillow / Canvas without uploading to third-party cloud services."
    }
  },

  organize: {
    id: "organize",
    title: "Image Organizer",
    badge: "Catalog Sorting",
    tagline: "Match image filenames with Excel catalog data and organize them into structured folder hierarchies.",
    overview: {
      description: "Image Organizer reads an Excel spreadsheet containing product metadata (SKUs, collections, categories, keep/delete flags) and a ZIP archive of product images. It matches each image with its corresponding spreadsheet row, sorts the files into organized folders according to your chosen strategy, and exports a clean ZIP archive.",
      benefits: [
        "Sorts thousands of raw camera images into clean buyer/catalog folders in seconds.",
        "Separates approved KEEP images from rejected DELETE images automatically.",
        "Generates multi-level nested folders based on category, collection, or product hierarchy.",
        "Original images remain safe inside your original archive."
      ],
      useCases: [
        "Organizing raw photoshoot dumps into buyer-ready collection directories.",
        "Filtering out sample selection rejects marked 'DELETE' in Excel.",
        "Creating multi-tier folder trees (e.g. Living > Tables > Coffee Tables > SKU)."
      ]
    },
    beforeYouStart: {
      requiredInputs: [
        "An Excel spreadsheet (.xlsx or .xlsm) with product codes and folder categories.",
        "A ZIP archive (.zip) containing the images to be organized."
      ],
      supportedFormats: ["Excel (.xlsx, .xlsm)", "ZIP Archive (.zip) containing images."],
      requiredStructure: [
        "Excel column mapping defaults:\n• Mode 1: Uses Columns G to Q for nested directory levels.\n• Mode 2: Sorts by KEEP / DELETE status, then collection name.\n• Mode 3: Sorts by KEEP / DELETE status, then Column H hierarchy.",
        "Image filenames in the ZIP must match product codes or image names listed in Excel."
      ],
      limitations: ["Image filenames must match the codes specified in the Excel sheet."]
    },
    stepByStep: [
      {
        stepNumber: 1,
        title: "Upload Product Spreadsheet",
        instruction: "Click 'Choose Excel workbook' and select your .xlsx or .xlsm file containing product rows."
      },
      {
        stepNumber: 2,
        title: "Upload Images Archive",
        instruction: "Compress your source image folder into a .zip archive and select it under 'Choose images ZIP'."
      },
      {
        stepNumber: 3,
        title: "Select Folder Structure Mode",
        instruction: "Choose your organization mode:\n• Mode 1: Nested folders (uses Excel columns G to Q).\n• Mode 2: KEEP / DELETE + collection.\n• Mode 3: KEEP / DELETE + custom levels (column H)."
      },
      {
        stepNumber: 4,
        title: "Organize and Download",
        instruction: "Click 'Organize & download ZIP'. The system processes each image and returns 'organized_images.zip' with your structured folders."
      }
    ],
    controlsReference: [
      { name: "Choose Excel workbook", type: "File Picker", purpose: "Selects product data spreadsheet (.xlsx, .xlsm).", whenToUse: "Step 1." },
      { name: "Choose images ZIP", type: "File Picker", purpose: "Selects source images zipped together.", whenToUse: "Step 2." },
      { name: "Nested folders (Mode 1)", type: "Dropdown", purpose: "Builds deep multi-tier folders from columns G through Q.", whenToUse: "When catalog requires deep categorization." },
      { name: "KEEP / DELETE + collection (Mode 2)", type: "Dropdown", purpose: "Sorts into KEEP vs DELETE folders, sub-sorted by collection.", whenToUse: "For buyer selections and approvals." },
      { name: "KEEP / DELETE + custom levels (Mode 3)", type: "Dropdown", purpose: "Sorts into KEEP vs DELETE, sub-sorted by Column H hierarchy.", whenToUse: "When custom taxonomy is present in column H." },
      { name: "Organize & download ZIP", type: "Button", purpose: "Starts matching and produces downloadable organized ZIP.", whenToUse: "When files and mode are selected." }
    ],
    examples: {
      inputExample: "Excel row: SKU 'CH-101', Status 'KEEP', Collection 'Autumn 2026'\nImage archive: 'CH-101.jpg', 'TB-202.jpg'",
      outputExample: "organized_images.zip:\n  KEEP/\n    Autumn 2026/\n      CH-101.jpg\n  DELETE/\n    ...",
      explanation: "Images were sorted into KEEP/DELETE root folders, then grouped by collection."
    },
    troubleshooting: [
      {
        issue: "No images organized or empty folders in ZIP",
        cause: "Image filenames in the ZIP do not match product codes or image names in Excel.",
        solution: "Verify that image filenames (e.g. 'CH101.jpg') match the text in your Excel SKU/Image column."
      },
      {
        issue: "Corrupt ZIP file error",
        cause: "ZIP archive was partially uploaded or created with incompatible compression.",
        solution: "Re-zip the images folder using standard Windows 'Send to -> Compressed (zipped) folder'."
      }
    ],
    offlineAndRequirements: {
      worksOffline: true,
      localProcessing: true,
      internetDetails: "Runs locally on your computer in desktop mode. Web version processes via local webapp server."
    }
  },

  ppt: {
    id: "ppt",
    title: "PowerPoint Exporter",
    badge: "Slide Rendering",
    tagline: "Batch export PowerPoint slides into high-resolution JPG, PNG, and WebP images.",
    overview: {
      description: "PowerPoint Exporter renders each slide of uploaded .ppt and .pptx presentations into standalone, high-quality images. It supports multi-format exporting (JPG, PNG, WebP) simultaneously, adjustable quality, and automatic naming using text extracted before a '|' delimiter on slides.",
      benefits: [
        "Converts entire slide decks into high-res images in one click.",
        "Exports multiple formats at once (e.g. JPG for printing + WebP for catalog flipbooks).",
        "Preserves slide fonts, shapes, and exact layouts.",
        "Automatic naming from slide headings."
      ],
      useCases: [
        "Generating slide image assets for online flipbooks and digital catalogs.",
        "Extracting slide designs for social media and customer email previews.",
        "Archiving presentations as universal image packages."
      ]
    },
    beforeYouStart: {
      requiredInputs: ["One or more PowerPoint presentations (.ppt or .pptx)."],
      supportedFormats: [".pptx (PowerPoint 2007+), .ppt (PowerPoint 97-2003)."],
      requiredStructure: ["Standard presentation files."],
      limitations: [
        "Slide text before a '|' delimiter can be used as the filename.",
        "Server-rendered presentations require LibreOffice on the host."
      ]
    },
    stepByStep: [
      {
        stepNumber: 1,
        title: "Choose Presentations",
        instruction: "Click 'Choose PowerPoint files' and select one or more .ppt or .pptx presentations from your device."
      },
      {
        stepNumber: 2,
        title: "Select Export Formats",
        instruction: "Check one or more formats: High-quality JPG, PNG, and/or WEBP.",
        tip: "You can select all three formats simultaneously to produce all variants in one ZIP."
      },
      {
        stepNumber: 3,
        title: "Adjust WEBP Quality",
        instruction: "Use the WEBP quality slider (default 95%) to tune file size."
      },
      {
        stepNumber: 4,
        title: "Export Slides",
        instruction: "Click 'Export slides & download ZIP'. The rendered slides will download in 'powerpoint_exports.zip'."
      }
    ],
    controlsReference: [
      { name: "Choose PowerPoint files", type: "File Picker", purpose: "Selects .ppt or .pptx files.", whenToUse: "Step 1." },
      { name: "High-quality JPG", type: "Checkbox", purpose: "Renders slides as crisp JPEG images.", whenToUse: "For standard distribution and emails." },
      { name: "PNG", type: "Checkbox", purpose: "Renders lossless PNG slide images.", whenToUse: "When maximum crispness and graphics fidelity are required." },
      { name: "WEBP", type: "Checkbox", purpose: "Renders lightweight WebP images.", whenToUse: "For website flipbooks and digital catalogs." },
      { name: "WEBP quality", type: "Slider", purpose: "Adjusts WebP compression quality from 10% to 100%.", whenToUse: "When tuning output file size." },
      { name: "Export slides & download ZIP", type: "Button", purpose: "Initiates slide rendering and downloads ZIP archive.", whenToUse: "When settings are configured." }
    ],
    examples: {
      inputExample: "Presentation: 'Noble_Catalog_2026.pptx' (24 slides)",
      outputExample: "powerpoint_exports.zip containing:\n  Noble_Catalog_2026_Slide_01.jpg\n  Noble_Catalog_2026_Slide_01.webp\n  Noble_Catalog_2026_Slide_02.jpg\n  ...",
      explanation: "Each slide was rendered at high DPI into selected formats and packed into a single download."
    },
    troubleshooting: [
      {
        issue: "LibreOffice required error",
        cause: "Server-side rendering engine requires LibreOffice for headless PPTX conversion.",
        solution: "Ensure LibreOffice is installed on the server or use modern PPTX files."
      },
      {
        issue: "Missing custom presentation fonts",
        cause: "Presentation uses non-standard fonts not embedded in the PPTX file.",
        solution: "In PowerPoint, go to File -> Options -> Save -> 'Embed fonts in the file' before exporting."
      }
    ],
    offlineAndRequirements: {
      worksOffline: true,
      localProcessing: true,
      internetDetails: "Runs locally on your workstation or internal local server without external internet access."
    }
  },

  "pdf-excel": {
    id: "pdf-excel",
    title: "PO PDF to Excel Converter",
    badge: "OCR & Document Extraction",
    tagline: "Extract purchase orders, sales orders, and quotation PDFs into a structured 27-column Excel template.",
    overview: {
      description: "PO PDF to Excel extracts critical manufacturing and purchasing fields from purchase order and quotation PDFs. It parses Customer Name, Sales Order (SO) Number, Multi-Quantities, Item Codes, Dimensions (Length, Width, Height), Board Ply, and Box Types, and outputs them into a 27-column Bulk Calculation Template Excel sheet with corporate blue styling, auto-filters, and frozen headers.",
      benefits: [
        "Eliminates manual re-typing of purchase order items.",
        "Extracts dimensions, quantities, and box types automatically.",
        "Interactive grid highlights low-confidence values ('review' vs 'high') for quick human validation.",
        "Inline editable grid cells allow editing dimensions before exporting.",
        "Automatically saves extracted rows to local SQLite database in desktop mode."
      ],
      useCases: [
        "Converting Noble Art and Craft House purchase orders into costing spreadsheets.",
        "Extracting dimension tables from quotation PDFs for packaging calculations.",
        "Creating bulk ERP import files from PDF purchase orders."
      ]
    },
    beforeYouStart: {
      requiredInputs: ["One or more purchase order or quotation PDF documents."],
      supportedFormats: [".pdf (both text-based digital PDFs and scanned image PDFs with OCR)."],
      requiredStructure: ["Standard PO documents containing item codes, dimensions, and quantities."],
      limitations: [
        "Highly degraded or blurry scans may produce 'review' confidence ratings and require quick manual verification in the grid."
      ]
    },
    stepByStep: [
      {
        stepNumber: 1,
        title: "Upload PDF Documents",
        instruction: "Drag and drop one or more PDF purchase orders into the dropzone or click to browse files."
      },
      {
        stepNumber: 2,
        title: "Extract PO Data",
        instruction: "Click 'Convert all to Excel'. The extractor parses text streams and extracts SO numbers, item codes, dimensions, quantities, and board plies."
      },
      {
        stepNumber: 3,
        title: "Review and Edit Grid Rows",
        instruction: "Check rows marked with a yellow 'review' badge. Click any cell (SO, Item Code, Qty, L, W, H, Ply, Type) to edit the value directly.",
        tip: "The review counter shows how many fields need a quick glance before exporting."
      },
      {
        stepNumber: 4,
        title: "Export to Excel",
        instruction: "Choose your export format:\n• 'Export Combined Excel': Merges all PDFs into one master spreadsheet.\n• 'Export Separate Excel files': Generates an individual Excel file for each PDF.",
        tip: "In desktop mode, extracted records are also automatically saved to your local SQLite database."
      }
    ],
    controlsReference: [
      { name: "Choose PO PDF files", type: "File Picker", purpose: "Selects PDF purchase orders to extract.", whenToUse: "Step 1." },
      { name: "Convert all to Excel", type: "Button", purpose: "Runs text and OCR extraction on all loaded PDFs.", whenToUse: "When PDFs are loaded." },
      { name: "Grid cell editors", type: "Input", purpose: "Allows direct inline modification of extracted values.", whenToUse: "When a review badge appears or a value needs correction." },
      { name: "Export Combined Excel", type: "Button", purpose: "Downloads a 27-column Excel workbook combining all PDF rows.", whenToUse: "For bulk production costing." },
      { name: "Export Separate Excel files", type: "Button", purpose: "Downloads a separate .xlsx file for each source PDF.", whenToUse: "When keeping PO records segregated by order." }
    ],
    examples: {
      inputExample: "PO_12345.pdf with text: 'SO/600 Item: W-CHAIR Qty: 400 Dim: 18x16x34 PLY: 5 Type: DF'",
      outputExample: "Excel Row:\nCustomer: Noble Art And Craft House\nSO: 600\nItem Code: W-CHAIR\nQty: 400\nL: 18, W: 16, H: 34, Ply: 5, Type: DF",
      explanation: "Data was parsed, mapped into standard manufacturing template columns, and styled with corporate header fills."
    },
    troubleshooting: [
      {
        issue: "Row has yellow 'review' confidence badge",
        cause: "Text in PDF had unusual spacing or was a low-resolution scan.",
        solution: "Click directly on the cell in the table to verify or type the correct dimension."
      },
      {
        issue: "No item rows found in PDF",
        cause: "PDF is an image scan without an embedded text layer.",
        solution: "Wait a few seconds for optical character recognition (OCR) worker to complete rendering, or verify PDF is readable."
      }
    ],
    offlineAndRequirements: {
      worksOffline: true,
      localProcessing: true,
      internetDetails: "Runs 100% locally in your browser and desktop app using pdfjs-dist and local WebAssembly OCR. No PDF data leaves your computer."
    }
  },

  "excel-ppt": {
    id: "excel-ppt",
    title: "Excel to Catalogue PPT Generator",
    badge: "Automation",
    tagline: "Generate presentation-ready product catalogues in PowerPoint from an Excel spreadsheet and image folder.",
    overview: {
      description: "Excel to Catalogue PPT turns rows of product information in an Excel spreadsheet into a beautifully laid out, formatted PowerPoint presentation. It matches product SKUs with corresponding image files, automatically formats titles, dimensions, prices, materials, and collection names, and embeds high-resolution photos into slides.",
      benefits: [
        "Creates a 50+ slide product catalogue in seconds instead of hours of manual copy-paste.",
        "Automatic image matching: Finds photos by SKU or filename without manual insertion.",
        "Customizable layouts: 1 product per slide, 2 products per slide, or 4 products per slide.",
        "Professional styling with customizable color palettes, slide dimensions, and typography."
      ],
      useCases: [
        "Generating seasonal buyer catalogues (Autumn/Spring furniture collections).",
        "Creating client quotation decks with embedded product photos and specs.",
        "Exporting trade show product line-up presentations."
      ]
    },
    beforeYouStart: {
      requiredInputs: [
        "An Excel spreadsheet (.xlsx, .xls) containing product data.",
        "A directory or ZIP archive containing product photos."
      ],
      supportedFormats: ["Excel (.xlsx, .xls)", "Images: JPG, PNG, WebP."],
      requiredStructure: [
        "Excel must include at least: SKU / Item Code and Image Name (or photos named after the SKU).",
        "Optional columns: Product Title, Collection, Dimensions, Material, Finish, Price, Description."
      ],
      limitations: ["Images must be accessible on your drive or in the uploaded archive."]
    },
    stepByStep: [
      {
        stepNumber: 1,
        title: "Upload Excel Spreadsheet",
        instruction: "Select your product workbook (.xlsx or .xls). The tool will read the sheet names and columns."
      },
      {
        stepNumber: 2,
        title: "Select Product Images",
        instruction: "In desktop mode, click 'Browse' to select your images folder. In web mode, select your images ZIP archive or image files."
      },
      {
        stepNumber: 3,
        title: "Map Excel Columns",
        instruction: "Verify the column dropdowns match your sheet headers: SKU/Code, Title, Collection, Dimensions, Material, Price, and Image filename."
      },
      {
        stepNumber: 4,
        title: "Choose Layout & Styling",
        instruction: "Select products per slide (1, 2, or 4), slide ratio (16:9 widescreen or 4:3 standard), and color accents."
      },
      {
        stepNumber: 5,
        title: "Generate Presentation",
        instruction: "Click 'Generate Catalogue PPT'. The presentation is generated and downloaded as a .pptx file."
      }
    ],
    controlsReference: [
      { name: "Choose Excel workbook", type: "File Picker", purpose: "Uploads spreadsheet containing product rows.", whenToUse: "Step 1." },
      { name: "Product Images", type: "File Picker", purpose: "Folder or archive containing product images.", whenToUse: "Step 2." },
      { name: "Worksheet selector", type: "Dropdown", purpose: "Selects which tab of the Excel file to read.", whenToUse: "When workbook has multiple sheets." },
      { name: "Header Row Number", type: "Input", purpose: "Specifies which row contains column titles (default: 1).", whenToUse: "If sheet has blank rows at top." },
      { name: "Column Mappings", type: "Dropdown", purpose: "Maps Excel columns to catalogue slide fields.", whenToUse: "To link data to slide cards." },
      { name: "Products per Slide", type: "Dropdown", purpose: "Sets slide density (1, 2, or 4 products per slide).", whenToUse: "Choose based on catalog format." },
      { name: "Generate Catalogue PPT", type: "Button", purpose: "Builds and downloads the completed .pptx file.", whenToUse: "When mappings and files are ready." }
    ],
    examples: {
      inputExample: "Excel: SKU 'WD-401', Title 'Oak Dining Table', Price '$450', Image 'WD-401.jpg'\nFolder: contains 'WD-401.jpg'",
      outputExample: "Generated PPTX: Slide with high-res photo of Oak Dining Table on left, styled metadata card on right.",
      explanation: "Product data was merged with matched photo into a professional branded slide."
    },
    troubleshooting: [
      {
        issue: "Images missing on generated slides",
        cause: "Image filename in Excel does not match photo name in folder, or image folder was not selected.",
        solution: "Ensure filenames in Excel (e.g. 'Chair01.jpg') match photo filenames exactly."
      },
      {
        issue: "Column names not showing in dropdowns",
        cause: "Header row number is incorrect.",
        solution: "Set Header Row Number to the exact row where your column titles start."
      }
    ],
    offlineAndRequirements: {
      worksOffline: true,
      localProcessing: true,
      internetDetails: "Works 100% offline. Presentations are generated locally using client-side or desktop PPTX generation libraries."
    }
  },

  "ppt-excel": {
    id: "ppt-excel",
    title: "PPT to Excel with Images",
    badge: "Reverse Catalog",
    tagline: "Extract text, tables, and embedded product images from PowerPoint slides into an Excel spreadsheet.",
    overview: {
      description: "PPT to Excel extracts content from existing PowerPoint presentations back into an editable Excel spreadsheet. It extracts slide text boxes, tables, and embedded high-res images, places product photo thumbnails directly into Excel cells using ExcelJS, and allows visual review before exporting.",
      benefits: [
        "Recovers lost product data and catalogs from slide decks.",
        "Embeds visual image thumbnails directly inside Excel rows.",
        "Recognizes baked-in slide text via OCR with smart header/footer filtering.",
        "Allows direct spreadsheet review and row filtering before export."
      ],
      useCases: [
        "Converting legacy supplier PowerPoint catalogues into master product Excel sheets.",
        "Extracting product images and descriptions from buyer presentations.",
        "Creating image-enabled inventory sheets from sales decks."
      ]
    },
    beforeYouStart: {
      requiredInputs: ["One or more PowerPoint presentations (.pptx)."],
      supportedFormats: [".pptx (PowerPoint 2007+ XML format)."],
      requiredStructure: ["Slides containing product photos, text boxes, or specification tables."],
      limitations: [".ppt (binary 97-2003) must first be saved as .pptx in PowerPoint."]
    },
    stepByStep: [
      {
        stepNumber: 1,
        title: "Choose Presentation",
        instruction: "Select or drag and drop your .pptx presentation file."
      },
      {
        stepNumber: 2,
        title: "Select Extraction Options",
        instruction: "Choose whether to extract slide text, embedded pictures, tables, and enable OCR for image-only slides."
      },
      {
        stepNumber: 3,
        title: "Review Extracted Data",
        instruction: "Inspect the interactive preview table showing slide thumbnails, detected titles, codes, and text."
      },
      {
        stepNumber: 4,
        title: "Export to Excel",
        instruction: "Click 'Export to Excel with Images'. The workbook will download with image thumbnails embedded inside rows."
      }
    ],
    controlsReference: [
      { name: "Choose presentation file", type: "File Picker", purpose: "Selects .pptx file to extract.", whenToUse: "Step 1." },
      { name: "Extract Slide Text", type: "Checkbox", purpose: "Extracts text from all slide text boxes.", whenToUse: "Checked by default." },
      { name: "Extract Embedded Images", type: "Checkbox", purpose: "Extracts photos embedded inside slides.", whenToUse: "Checked by default." },
      { name: "Extract Tables", type: "Checkbox", purpose: "Extracts PowerPoint table data as rows.", whenToUse: "When slides contain spec tables." },
      { name: "Enable OCR", type: "Checkbox", purpose: "Performs optical character recognition on text rendered inside pictures.", whenToUse: "When text is part of the image." },
      { name: "Export to Excel with Images", type: "Button", purpose: "Generates and downloads the final .xlsx workbook.", whenToUse: "After reviewing extraction preview." }
    ],
    examples: {
      inputExample: "Catalogue slide with photo of 'Noble Vase', SKU 'NV-10', Material 'Ceramic', Size '12x12x30'",
      outputExample: "Excel row with Thumbnail image in Col A, NV-10 in Col B, Noble Vase in Col C, Specs in Col D.",
      explanation: "PowerPoint visual content was parsed and structured into a standard Excel database table."
    },
    troubleshooting: [
      {
        issue: "File format not supported error",
        cause: "Uploaded file is a legacy binary .ppt file instead of .pptx.",
        solution: "Open the file in PowerPoint and choose File -> Save As -> PowerPoint Presentation (.pptx)."
      },
      {
        issue: "Images do not show inside Excel",
        cause: "Excel viewer does not support embedded drawings.",
        solution: "Open the exported file in Microsoft Excel or Google Sheets, which fully render embedded images."
      }
    ],
    offlineAndRequirements: {
      worksOffline: true,
      localProcessing: true,
      internetDetails: "Runs locally in browser and desktop using JSZip and ExcelJS. No slide content is transmitted across the internet."
    }
  },

  dashboard: {
    id: "dashboard",
    title: "Loveneet Business Suite Overview",
    badge: "Suite Guide",
    tagline: "Your comprehensive manufacturing, purchasing, catalog, and image workflow platform.",
    overview: {
      description: "Loveneet Suite is a dual-platform business application designed for product manufacturers, export houses, and merchandisers. It integrates 7 core workflow tools covering file flattening, image compression, catalog generation, PO data extraction, presentation rendering, and Excel synchronization.",
      benefits: [
        "Dual-Platform: Runs both as an offline-first Windows Desktop application and as a Web app on Vercel.",
        "Persistent Local Database: SQLite database stores PO extraction records, file collection jobs, and application settings locally.",
        "One-Click Updates: In-app updates download and install automatically via GitHub Releases.",
        "Privacy & Data Safety: All file processing and compression run locally without external cloud dependencies."
      ],
      useCases: [
        "End-to-end catalog production from photos to customer presentation.",
        "Processing bulk purchase orders and calculating box manufacturing metrics.",
        "Organizing raw photo folders across 60+ collection tiers for buyers."
      ]
    },
    beforeYouStart: {
      requiredInputs: ["Files relevant to the specific mini-app you choose."],
      supportedFormats: ["Images, PDFs, Excel workbooks, PowerPoint files, ZIP archives."],
      requiredStructure: ["Standard product directories and spreadsheets."],
      limitations: ["Desktop mode recommended for direct drive access (C:\\, D:\\, E:\\)."]
    },
    stepByStep: [
      {
        stepNumber: 1,
        title: "Choose a Workflow Tool",
        instruction: "Select any mini-app from the left sidebar or the tool grid on the dashboard."
      },
      {
        stepNumber: 2,
        title: "Follow Tool Instructions",
        instruction: "Click 'How to Use' at the top-right of any tool at any time to open its comprehensive guide."
      },
      {
        stepNumber: 3,
        title: "Manage Database & Backups",
        instruction: "Click 'Settings & Database' in the bottom-left sidebar to view local SQLite statistics, download database backups, or check for software updates."
      }
    ],
    controlsReference: [
      { name: "Tool Grid / Sidebar", type: "Button", purpose: "Navigates between the 7 specialized mini-apps.", whenToUse: "To switch workflows." },
      { name: "How to Use", type: "Button", purpose: "Opens this interactive user guide for the active tool.", whenToUse: "Whenever you need step-by-step help." },
      { name: "Settings & Database", type: "Button", purpose: "Opens local database stats, backup/restore, and auto-updater.", whenToUse: "For maintenance and updates." },
      { name: "Status Indicator", type: "Badge", purpose: "Displays Desktop vs Web runtime and online/offline connectivity.", whenToUse: "To check platform state." }
    ],
    examples: {
      inputExample: "Product PDFs, PPTX decks, raw photos, Excel spreadsheets.",
      outputExample: "Clean cost calculation templates, organized image folders, PowerPoint catalogs, and compressed media.",
      explanation: "Loveneet Suite connects each phase of your product data lifecycle."
    },
    troubleshooting: [
      {
        issue: "How do I switch between desktop and web?",
        cause: "Suite runs as a native Windows app or via browser.",
        solution: "Use the desktop installer 'LoveneetSuite-Setup.exe' for full drive access, or use the web URL for browser access on other devices."
      }
    ],
    offlineAndRequirements: {
      worksOffline: true,
      localProcessing: true,
      internetDetails: "Desktop app is 100% offline-first. Internet is only used when checking for new software updates or syncing."
    }
  }
};
