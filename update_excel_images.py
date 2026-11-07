import re

file_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\services\report-service.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add getImageDimensions helper function
helper_func = '''
/**
 * Reads intrinsic width and height from image buffer (PNG, JPEG, WebP, GIF)
 * without external C/native binaries, guaranteeing preservation of original aspect ratio.
 */
function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (!buffer || buffer.length < 24) return null;

  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // GIF
  if (buffer.toString('ascii', 0, 3) === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }

  // JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xFF) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      if (
        (marker >= 0xC0 && marker <= 0xC3) ||
        (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) ||
        (marker >= 0xCD && marker <= 0xCF)
      ) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        if (width > 0 && height > 0) {
          return { width, height };
        }
      }
      if (marker === 0xD9 || marker === 0xDA) break;
      const len = buffer.readUInt16BE(offset + 2);
      if (len < 2) break;
      offset += 2 + len;
    }
  }

  // WebP
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const format = buffer.toString('ascii', 12, 16);
    if (format === 'VP8 ' && buffer.length >= 30) {
      return { width: buffer.readUInt16LE(26) & 0x3FFF, height: buffer.readUInt16LE(28) & 0x3FFF };
    }
    if (format === 'VP8L' && buffer.length >= 25) {
      const b0 = buffer[21], b1 = buffer[22], b2 = buffer[23], b3 = buffer[24];
      const width = 1 + (((b1 & 0x3F) << 8) | b0);
      const height = 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));
      return { width, height };
    }
    if (format === 'VP8X' && buffer.length >= 30) {
      const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
      const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
      return { width, height };
    }
  }

  return null;
}
'''

# Insert helper function after imports
code = code.replace("import { OrderService } from './order-service.js';", "import { OrderService } from './order-service.js';\n" + helper_func)

# 2. Adjust Image Column Width & Row Height for cleaner presentation
code = code.replace(
    "{ header: 'IMAGE', key: 'image', width: 15 },",
    "{ header: 'IMAGE', key: 'image', width: 17 },"
)
code = code.replace(
    "row.height = 54; // Sufficient height for image thumbnail",
    "row.height = 58; // Proportional row height for clean image display"
)

# 3. Update image embedding logic to preserve original aspect ratio
old_embed = """      // Find and embed product image in Column 2 (Col B)
      for (const ext of exts) {
        const candidate = path.join(imagesDir, `${p.item_code}${ext}`);
        if (fs.existsSync(candidate)) {
          try {
            const imgBuffer = fs.readFileSync(candidate);
            const imgId = workbook.addImage({
              buffer: imgBuffer as any,
              extension: ext === '.png' ? 'png' : 'jpeg'
            });
            worksheet.addImage(imgId, {
              tl: { col: 1.1, row: rowIndex - 1 + 0.1 },
              ext: { width: 52, height: 48 },
              editAs: 'oneCell'
            });
          } catch (e) {
            // Ignore unreadable images
          }
          break;
        }
      }"""

new_embed = """      // Find and embed product image in Column 2 (Col B) while strictly preserving original aspect ratio
      for (const ext of exts) {
        const candidate = path.join(imagesDir, `${p.item_code}${ext}`);
        if (fs.existsSync(candidate)) {
          try {
            const imgBuffer = fs.readFileSync(candidate);
            const size = getImageDimensions(imgBuffer);

            // Bounding box inside the Excel cell (pixels)
            const MAX_BOUND_W = 82;
            const MAX_BOUND_H = 66;

            let finalW = 54;
            let finalH = 50;

            if (size && size.width > 0 && size.height > 0) {
              const aspect = size.width / size.height;
              if (aspect >= (MAX_BOUND_W / MAX_BOUND_H)) {
                // Wide / Landscape image: scale by width, compute proportional height
                finalW = MAX_BOUND_W;
                finalH = Math.max(16, Math.round(MAX_BOUND_W / aspect));
              } else {
                // Tall / Portrait image: scale by height, compute proportional width
                finalH = MAX_BOUND_H;
                finalW = Math.max(16, Math.round(MAX_BOUND_H * aspect));
              }
            }

            // Center image within cell boundaries (Col B width ~128px, Row height ~77px)
            const cellWidthPx = 17 * 7.5; // ~127.5px
            const cellHeightPx = 58 * 1.333; // ~77.3px
            const colOffset = Math.max(0.02, Math.min(0.42, ((cellWidthPx - finalW) / 2) / cellWidthPx));
            const rowOffset = Math.max(0.02, Math.min(0.42, ((cellHeightPx - finalH) / 2) / cellHeightPx));

            const imgId = workbook.addImage({
              buffer: imgBuffer as any,
              extension: ext === '.png' ? 'png' : ext === '.webp' ? 'png' : 'jpeg'
            });

            worksheet.addImage(imgId, {
              tl: {
                col: 1 + Number(colOffset.toFixed(3)),
                row: (rowIndex - 1) + Number(rowOffset.toFixed(3))
              },
              ext: { width: finalW, height: finalH },
              editAs: 'oneCell'
            });
          } catch (e) {
            // Ignore unreadable images
          }
          break;
        }
      }"""

code_norm = code.replace('\r\n', '\n')
old_embed_norm = old_embed.replace('\r\n', '\n')
new_embed_norm = new_embed.replace('\r\n', '\n')

if old_embed_norm in code_norm:
    code_norm = code_norm.replace(old_embed_norm, new_embed_norm)
    print("SUCCESS: Image embedding updated with aspect ratio preservation!")
else:
    print("ERROR: old_embed target not found!")

with open(file_path, 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(code_norm)
print("Updated report-service.ts")
