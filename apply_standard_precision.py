import re

# 1. Update order-service.ts
with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\services\order-service.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# Add imports if missing
if 'decimal.js' not in text:
    text = text.replace(
        "import { AuditService } from './audit-service.js';",
        "import { AuditService } from './audit-service.js';\nimport { roundHalfUp, formatCbm, formatMoney, formatDimension, formatQty, parseAndNormalizeCbm, parseAndNormalizeMoney } from '../utils/decimal.js';"
    )

# Add unitCbm to ExistingRecordSnapshot interface if missing
if 'unitCbm?: number | null;' not in text and 'unitCbm: number | null;' not in text:
    text = text.replace(
        "  priceReduce: number | null;\n  dispatchedQty: number;",
        "  priceReduce: number | null;\n  unitCbm?: number | null;\n  dispatchedQty: number;"
    )

# Add isRounded and validationCategory to ValidatedRawRow interface
if 'isRounded: boolean;' not in text:
    text = text.replace(
        "  isInFileDuplicate: boolean;\n  originalData: any;",
        "  isInFileDuplicate: boolean;\n  isRounded: boolean;\n  validationCategory: 'VALID' | 'ROUNDED' | 'WARNING' | 'ERROR';\n  originalData: any;"
    )

# Add roundedRows to RawDataValidationResult interface
if 'roundedRows: number;' not in text:
    text = text.replace(
        "  internalDuplicateRows: number;\n  validatedRecords: ValidatedRawRow[];",
        "  internalDuplicateRows: number;\n  roundedRows: number;\n  validatedRecords: ValidatedRawRow[];"
    )

with open(r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\services\order-service.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated interfaces in order-service.ts!')
