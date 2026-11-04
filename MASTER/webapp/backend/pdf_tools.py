import io, json, re, shutil, subprocess, tempfile, zipfile
from pathlib import Path
from typing import Annotated
import fitz
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image

router = APIRouter()
MAX_UPLOAD = 100 * 1024 * 1024

def clean_name(value: str) -> str:
    return re.sub(r'[^A-Za-z0-9._-]+', '_', Path(value or "document").name).strip("._") or "document"

def parse_pages(value: str, total: int) -> list[int]:
    if not value.strip(): return list(range(total))
    chosen=set()
    for part in value.split(","):
        part=part.strip()
        if not part: continue
        if "-" in part:
            a,b=part.split("-",1); start,end=int(a),int(b)
            if start < 1 or end < start or end > total: raise ValueError("Page range is outside the document.")
            chosen.update(range(start-1,end))
        else:
            n=int(part)
            if n < 1 or n > total: raise ValueError("Page number is outside the document.")
            chosen.add(n-1)
    return sorted(chosen)

def response(data: bytes, filename: str, media="application/pdf"):
    return StreamingResponse(io.BytesIO(data), media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}"'})

def zip_response(files: list[tuple[str, bytes]], filename="pdf_output.zip"):
    out=io.BytesIO()
    with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
        for name,data in files: z.writestr(name,data)
    out.seek(0)
    return StreamingResponse(out,media_type="application/zip",headers={"Content-Disposition":f'attachment; filename="{filename}"'})

@router.post("/api/pdf-tools/{tool}")
async def pdf_tool(tool: str, files: Annotated[list[UploadFile], File()], options: Annotated[str, Form()] = "{}"):
    allowed = {"merge","split","remove-pages","extract-pages","organize-pages","page-numbers","edit-pdf","scan-to-pdf","repair","compress","rotate","watermark","crop","unlock","protect","redact","compare","pdf-to-jpg","pdf-to-word","pdf-to-pptx","pdf-to-excel","pdf-to-markdown","ocr","image-to-pdf","word-to-pdf","pptx-to-pdf","excel-to-pdf","pdf-to-pdfa","sign","forms","html-to-pdf","scan-to-pdf"}
    if tool not in allowed: raise HTTPException(404,"Unknown PDF operation.")
    if tool in {"ai-summarizer","translate"}: raise HTTPException(501,"Local AI is not configured. No document has been uploaded to an external service.")
    if not files: raise HTTPException(400,"Select at least one file.")
    raw=[]
    for f in files:
        data=await f.read()
        if len(data)>MAX_UPLOAD: raise HTTPException(413,"Each file must be 100 MB or smaller.")
        raw.append((clean_name(f.filename or "document"),data))
    try: opt=json.loads(options or "{}")
    except Exception: raise HTTPException(400,"Invalid operation settings.")
    try:
        if tool in {"merge","compare"} and len(raw)<2: raise HTTPException(400,"Select at least two PDF files.")
        if tool in {"pdf-to-jpg","pdf-to-word","pdf-to-pptx","pdf-to-excel","pdf-to-markdown","ocr","repair","compress","rotate","watermark","crop","unlock","protect","redact","extract-pages","remove-pages","split","organize-pages","pdf-to-pdfa","sign","forms"} and not raw[0][0].lower().endswith(".pdf"):
            raise HTTPException(400,"The first file must be a PDF.")
        if tool=="image-to-pdf" or tool=="scan-to-pdf":
            doc=fitz.open()
            for name,data in raw:
                img=Image.open(io.BytesIO(data)).convert("RGB")
                b=io.BytesIO(); img.save(b,format="PNG")
                page=doc.new_page(width=img.width,height=img.height); page.insert_image(page.rect,stream=b.getvalue())
            return response(doc.tobytes(garbage=4,deflate=True),"images.pdf")
        if tool in {"word-to-pdf","pptx-to-pdf","excel-to-pdf"}:
            ext={"word-to-pdf":".docx","pptx-to-pdf":".pptx","excel-to-pdf":".xlsx"}[tool]
            if not raw[0][0].lower().endswith(ext): raise HTTPException(400,"Upload the matching Office file format.")
            office=shutil.which("soffice") or shutil.which("libreoffice")
            if not office: raise HTTPException(501,"LibreOffice is not installed on the local server. Install it to enable Office-to-PDF conversion.")
            with tempfile.TemporaryDirectory() as td:
                src=Path(td)/clean_name(raw[0][0]); src.write_bytes(raw[0][1])
                p=subprocess.run([office,"--headless","--convert-to","pdf","--outdir",td,str(src)],capture_output=True,text=True,timeout=120)
                target=src.with_suffix(".pdf")
                if p.returncode or not target.exists(): raise ValueError((p.stderr or p.stdout or "Office conversion failed.")[:500])
                return response(target.read_bytes(),target.name)
        if tool=="html-to-pdf":
            html=raw[0][1].decode("utf-8-sig",errors="replace")
            text=re.sub(r"(?i)<\s*br\s*/?>","\n",html)
            text=re.sub(r"(?i)</\s*(p|div|h[1-6]|li|tr)\s*>","\n\n",text)
            text=re.sub(r"<[^>]+>"," ",text)
            import html as html_lib
            text=html_lib.unescape(re.sub(r"[ \t]+"," ",text))
            doc=fitz.open(); page=doc.new_page()
            rect=fitz.Rect(48,48,547,794)
            remaining=page.insert_textbox(rect,text[:12000],fontsize=10,fontname="helv",lineheight=1.35)
            if remaining<0: raise ValueError("HTML content is too long for this basic local text renderer. Print complex layouts to PDF from your browser.")
            return response(doc.tobytes(),"html.pdf")
        if tool=="compare":
            a=fitz.open(stream=raw[0][1],filetype="pdf"); b=fitz.open(stream=raw[1][1],filetype="pdf")
            lines=["PDF COMPARISON",f"File A: {raw[0][0]} ({a.page_count} pages)",f"File B: {raw[1][0]} ({b.page_count} pages)",""]
            for i in range(max(a.page_count,b.page_count)):
                ta=a[i].get_text() if i<a.page_count else "[Page missing]"
                tb=b[i].get_text() if i<b.page_count else "[Page missing]"
                if ta!=tb:
                    lines += [f"PAGE {i+1}: DIFFERENT", "--- FILE A ---",ta[:5000],"--- FILE B ---",tb[:5000],""]
            if len(lines)==4: lines.append("No text differences detected. Visual-only differences may not be detected.")
            return response("\n".join(lines).encode(),"pdf_comparison.txt","text/plain")
        name,data=raw[0]
        if tool=="pdf-to-markdown":
            doc=fitz.open(stream=data,filetype="pdf")
            md=[]
            for i,p in enumerate(doc): md += [f"## Page {i+1}","",p.get_text("text"),""]
            return response("\n".join(md).encode(),"document.md","text/markdown")
        if tool=="pdf-to-word":
            from docx import Document
            doc=fitz.open(stream=data,filetype="pdf"); out=Document()
            for i,p in enumerate(doc):
                if i: out.add_page_break()
                out.add_paragraph(p.get_text("text"))
            buf=io.BytesIO(); out.save(buf); return response(buf.getvalue(),"document.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        if tool=="pdf-to-excel":
            from openpyxl import Workbook
            doc=fitz.open(stream=data,filetype="pdf"); wb=Workbook(); ws=wb.active; ws.title="Extracted Text"
            ws.append(["Page","Extracted text"])
            for i,p in enumerate(doc): ws.append([i+1,p.get_text("text")])
            buf=io.BytesIO(); wb.save(buf); return response(buf.getvalue(),"document.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        if tool=="pdf-to-pptx":
            from pptx import Presentation
            from pptx.util import Inches,Pt
            doc=fitz.open(stream=data,filetype="pdf"); prs=Presentation()
            for p in doc:
                slide=prs.slides.add_slide(prs.slide_layouts[6]); pix=p.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False)
                image=io.BytesIO(pix.tobytes("png")); slide.shapes.add_picture(image,0,0,width=prs.slide_width,height=prs.slide_height)
            buf=io.BytesIO(); prs.save(buf); return response(buf.getvalue(),"document.pptx","application/vnd.openxmlformats-officedocument.presentationml.presentation")
        doc=fitz.open(stream=data,filetype="pdf")
        password=str(opt.get("password",""))
        if doc.needs_pass:
            if not password or not doc.authenticate(password): raise HTTPException(400,"The PDF password is missing or incorrect.")
        if tool=="unlock":
            doc.save_clean = False
            out=doc.tobytes(encryption=fitz.PDF_ENCRYPT_NONE,garbage=4,deflate=True)
            return response(out,"unlocked.pdf")
        if tool=="protect":
            newpass=str(opt.get("newPassword",""))
            if len(newpass)<4: raise HTTPException(400,"Set a new password with at least 4 characters.")
            return response(doc.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256,owner_pw=newpass,user_pw=newpass,permissions=fitz.PDF_PERM_ACCESSIBILITY|fitz.PDF_PERM_PRINT,garbage=4,deflate=True),"protected.pdf")
        if tool in {"repair","compress"}:
            if tool=="compress":
                for p in doc:
                    for img in p.get_images(full=True):
                        xref=img[0]
                        try:
                            pix=fitz.Pixmap(doc,xref)
                            if pix.width>1800 or pix.height>1800:
                                scaled=fitz.Pixmap(pix,0.7)
                                doc.update_stream(xref,scaled.tobytes("jpeg"))
                        except Exception: pass
            return response(doc.tobytes(garbage=4,deflate=True,clean=True),"optimized.pdf")
        if tool=="rotate":
            angle=int(opt.get("angle",90))
            if angle not in {90,180,270,-90,-180,-270}: raise HTTPException(400,"Rotation must be 90, 180 or 270 degrees.")
            for i in parse_pages(str(opt.get("pages","")),doc.page_count): doc[i].set_rotation((doc[i].rotation+angle)%360)
            return response(doc.tobytes(garbage=4,deflate=True),"rotated.pdf")
        if tool=="watermark":
            label=str(opt.get("text","CONFIDENTIAL"))[:120]
            for i in parse_pages(str(opt.get("pages","")),doc.page_count):
                p=doc[i]; p.insert_textbox(p.rect, label, fontsize=36, fontname="helv", color=(0.65,0.65,0.65), align=1, overlay=True, rotate=45)
            return response(doc.tobytes(garbage=4,deflate=True),"watermarked.pdf")
        if tool=="crop":
            margin=max(0,min(200,float(opt.get("margin",24))))
            for i in parse_pages(str(opt.get("pages","")),doc.page_count):
                p=doc[i]; r=p.rect + (margin,margin,-margin,-margin)
                if r.width>50 and r.height>50: p.set_cropbox(r)
            return response(doc.tobytes(garbage=4,deflate=True),"cropped.pdf")
        if tool=="redact":
            term=str(opt.get("text","")).strip()
            if not term: raise HTTPException(400,"Enter text to redact.")
            count=0
            for p in doc:
                for rect in p.search_for(term):
                    p.add_redact_annot(rect,fill=(0,0,0)); count+=1
                p.apply_redactions()
            if not count: raise HTTPException(404,"No matching text was found. Scanned image-only text needs OCR first.")
            return response(doc.tobytes(garbage=4,deflate=True),"redacted.pdf")
        if tool=="extract-pages":
            ids=parse_pages(str(opt.get("pages","")),doc.page_count); out=fitz.open()
            for i in ids: out.insert_pdf(doc,from_page=i,to_page=i)
            return response(out.tobytes(garbage=4,deflate=True),"extracted_pages.pdf")
        if tool=="remove-pages":
            ids=set(parse_pages(str(opt.get("pages","")),doc.page_count))
            if len(ids)>=doc.page_count: raise HTTPException(400,"Cannot remove every page.")
            for i in sorted(ids,reverse=True): doc.delete_page(i)
            return response(doc.tobytes(garbage=4,deflate=True),"pages_removed.pdf")
        if tool=="organize-pages":
            order=[int(x.strip())-1 for x in str(opt.get("order","")).split(",") if x.strip()]
            if not order or any(i<0 or i>=doc.page_count for i in order): raise HTTPException(400,"Enter a valid page order, e.g. 3,1,2.")
            out=fitz.open()
            for i in order: out.insert_pdf(doc,from_page=i,to_page=i)
            return response(out.tobytes(garbage=4,deflate=True),"organized.pdf")
        if tool=="split":
            files=[]
            for i in range(doc.page_count):
                part=fitz.open(); part.insert_pdf(doc,from_page=i,to_page=i)
                files.append((f"page_{i+1:03}.pdf",part.tobytes(garbage=4,deflate=True)))
            return zip_response(files,"split_pages.zip")
        if tool=="pdf-to-jpg":
            scale=max(0.5,min(4,float(opt.get("scale",1.5)))); files=[]
            for i in parse_pages(str(opt.get("pages","")),doc.page_count):
                pix=doc[i].get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False)
                files.append((f"page_{i+1:03}.jpg",pix.tobytes("jpeg",jpg_quality=90)))
            return zip_response(files,"pdf_pages_jpg.zip")
        if tool=="ocr":
            text=[]
            for i,p in enumerate(doc): text += [f"PAGE {i+1}",p.get_text("text")]
            return response("\n\n".join(text).encode(),"ocr_text.txt","text/plain")
        if tool=="pdf-to-pdfa": raise HTTPException(501,"PDF/A archival conversion requires a validated Ghostscript installation; it is not enabled on this server.")
        if tool=="sign": raise HTTPException(501,"Add a drawn-signature or signature-image workflow in the next phase. Cryptographic certificate signing is not simulated.")
        if tool=="forms":
            fields=[]
            for pno,p in enumerate(doc):
                w=p.first_widget
                while w:
                    fields.append({"page":pno+1,"name":w.field_name,"type":str(w.field_type_string),"value":w.field_value})
                    w=w.next
            return response(json.dumps(fields,indent=2).encode(),"pdf_form_fields.json","application/json")
        raise HTTPException(501,"This PDF operation is not yet implemented.")
    except HTTPException: raise
    except (ValueError,RuntimeError,fitz.FileDataError) as exc: raise HTTPException(400,str(exc)[:500])
    except Exception as exc: raise HTTPException(500,"PDF operation failed: "+str(exc)[:300])
