import React,{useState} from "react";
import {FileImage,Upload,Plus,Trash2,ArrowUp,ArrowDown,Download,LoaderCircle,ScanText} from "lucide-react";
import "./ppt-excel.css";
type Img={id:string;name:string;mime:string;data:string;ocrText?:string};
type Slide={slideNumber:number;sourceFile:string;title:string;text:string[];tables:string[][][];images:Img[];preview?:string};
type Col={id:string;header:string;type:"text"|"image"};
type Row={id:string;slideNumber:number;sourceFile:string;values:Record<string,string>;images:Record<string,Img|null>};
const uid=()=>Math.random().toString(36).slice(2,10),uri=(i:Img)=>`data:${i.mime};base64,${i.data}`;
const initial=["Product Name","Item Code","Material","Length","Width","Height","Description","Product Image"];
function parseProductFields(lines:string[]){
 const raw=lines.map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean),all=raw.join(" | "),fields:Record<string,string>={};
 const skuLine=raw.find(x=>/^\s*\d{4,10}\s*(?:[|–—:-])/.test(x)||/\b(?:SKU|ITEM\s*CODE|MODEL)\s*[:#-]?\s*[A-Z0-9-]{3,}\b/i.test(x));
 if(skuLine){const m=skuLine.match(/^\s*(\d{4,10})\s*(?:[|–—:-])/);const labeled=skuLine.match(/\b(?:SKU|ITEM\s*CODE|MODEL)\s*[:#-]?\s*([A-Z0-9-]{3,})\b/i);fields.sku=m?.[1]||labeled?.[1]||"";}
 const dims:{unit:string;values:string[]}[]=[];
 const dimRe=/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*(CM|CMS|CENTIMETERS?|INCH(?:ES)?|IN)\b)?/ig;
 for(const line of raw){let m:RegExpExecArray|null;while((m=dimRe.exec(line))!==null){const unit=(m[4]||(/\bCM\b/i.test(line)?"CM":/\bIN(?:CH(?:ES)?)?\b/i.test(line)?"IN":"")).toUpperCase();dims.push({unit:unit.startsWith("C")?"CM":unit.startsWith("I")?"IN":"",values:[m[1],m[2],m[3]]});}dimRe.lastIndex=0;}
 const cm=dims.find(d=>d.unit==="CM"),inch=dims.find(d=>d.unit==="IN"),unitless=dims.find(d=>!d.unit);
 const dimension=(d:{unit:string;values:string[]}|undefined,index:number)=>d?.values[index]||"";
 fields.lengthCm=dimension(cm||(!inch?unitless:undefined),0);fields.widthCm=dimension(cm||(!inch?unitless:undefined),1);fields.heightCm=dimension(cm||(!inch?unitless:undefined),2);
 fields.lengthIn=dimension(inch,0);fields.widthIn=dimension(inch,1);fields.heightIn=dimension(inch,2);
 const cbm=all.match(/\bCBM\s*[:=]?\s*(\d+(?:\.\d+)?)/i);fields.cbm=cbm?.[1]||"";
 const priceRe=/(?:\b(?:price|retail|wholesale|trade|cost|usd|eur|gbp|inr|aud|aed)\b\s*[:=-]?\s*)?([₹$€£])?\s*(\d+(?:[.,]\d{1,4})?)\s*(USD|EUR|GBP|INR|AUD|AED|\$|€|£|₹)?/ig;
 const prices:{value:string;currency:string;label:string}[]=[];
 for(const line of raw){if(!/\b(price|retail|wholesale|trade|cost)\b|[$€£₹]/i.test(line))continue;let m:RegExpExecArray|null;while((m=priceRe.exec(line))!==null){const value=m[2]?.replace(",",".");if(!value||!/[0-9]/.test(value))continue;const before=line.slice(Math.max(0,m.index-18),m.index);if(/\b(?:CM|IN|CBM)\s*$/i.test(before))continue;const curr=(m[3]||m[1]||"").toUpperCase();const currency=({"$":"USD","€":"EUR","£":"GBP","₹":"INR"} as Record<string,string>)[curr]||curr;const label=(line.match(/\b(price|retail|wholesale|trade|cost)\b/i)||[])[1]||"";if(!prices.some(p=>p.value===value&&p.currency===currency&&p.label===label))prices.push({value,currency,label});}priceRe.lastIndex=0;}
 fields.prices=JSON.stringify(prices);
 const materialLine=raw.find(x=>/\b(?:mango wood|sheesham|acacia|oak|pine|bamboo|teak|metal|iron|marble|travertine|wood|fabric|leather|glass|stainless steel)\b/i.test(x));
 fields.material=materialLine?materialLine.replace(/^material\s*[:=-]\s*/i,""):"";
 const titleLine=raw.find(x=>!/(?:\d+(?:\.\d+)?\s*[x×*]\s*\d|\bCBM\b|\b(?:price|retail|wholesale|trade|cost)\b|\b(?:CM|INCHES?)\b|\b(?:mango wood|sheesham|acacia|oak|pine|bamboo|teak|metal|iron|marble|wood|fabric)\b)/i.test(x)&&x.length>1);
 fields.name=titleLine?titleLine.replace(/^\s*\d{4,10}\s*[|–—:-]\s*/,"").replace(/^\s*(?:product\s*name|name)\s*[:=-]\s*/i,"").trim():"";
 fields.description=raw.filter(x=>x!==titleLine&&!/^\s*\d{4,10}\s*[|–—:-]/.test(x)).join(" | ");
 fields.raw=all;
 return fields;
}
function suggest(lines:string[],header:string){
 const h=header.toLowerCase(),p=parseProductFields(lines);
 if(/sku|item\s*code|product\s*code|model\s*(?:no|number)?/.test(h))return p.sku||"";
 if(/product\s*name|item\s*name|^name$|title/.test(h))return p.name||"";
 if(/material|wood\s*type/.test(h))return p.material||"";
 if(/cbm|cubic/.test(h))return p.cbm||"";
 if(/price|cost|retail|wholesale|trade/.test(h)){
  const prices=JSON.parse(p.prices||"[]") as {value:string;currency:string;label:string}[];
  const n=Number((h.match(/\b(\d+)\b/)||[])[1]||1)-1,price=prices[n];
  if(/currency|curr\b/.test(h))return price?.currency||"";
  return price?.value||"";
 }
 const unitIn=/\bin\b|inch/.test(h),unitCm=/\bcm\b|centimeter/.test(h);
 if(/length|^l\b/.test(h))return unitIn?p.lengthIn:unitCm?p.lengthCm:(p.lengthCm||p.lengthIn);
 if(/width|^w\b/.test(h))return unitIn?p.widthIn:unitCm?p.widthCm:(p.widthCm||p.widthIn);
 if(/height|^h\b/.test(h))return unitIn?p.heightIn:unitCm?p.heightCm:(p.heightCm||p.heightIn);
 if(/description|details|features/.test(h))return p.description;
 const re=h.includes("name")||h.includes("title")?/product\s*name|item\s*name|title|name\s*:/i:h.includes("code")||h.includes("sku")||h.includes("model")?/item\s*code|sku|model|code\s*:/i:h.includes("material")||h.includes("wood")?/material|made of|wood|metal|fabric/i:h.includes("length")?/length|\bL\s*[:=]/i:h.includes("width")?/width|\bW\s*[:=]/i:h.includes("height")?/height|\bH\s*[:=]/i:null;
 const line=re&&lines.find(x=>re.test(x));return line?line.replace(/^\s*[^:：=]{1,35}\s*[:：=]\s*/,"").trim()||line.trim():"";
}
function getProfiles():Record<string,Col[]>{try{return JSON.parse(typeof localStorage!=="undefined"?localStorage.getItem("pptExcelProfiles")||"{}":"{}")}catch{return {}}}
export default function PptExcelTool(){
 const [files,SF]=useState<File[]>([]),[slides,SS]=useState<Slide[]>([]),[sel,SEL]=useState(0),[cols,SC]=useState<Col[]>(initial.map((h,i)=>({id:"c"+i,header:h,type:/image/i.test(h)?"image":"text"}))),[rows,SR]=useState<Row[]>([]),[mode,SM]=useState("slide"),[source,SOURCE]=useState(true),[embed,EMBED]=useState(true),[status,STATUS]=useState(""),[error,ERROR]=useState(""),[busy,BUSY]=useState(false),[ocr,OCR]=useState(false),[profile,PROFILE]=useState("");
 const cur=slides[sel],lines=cur?[...cur.text,...cur.tables.flat(2),...cur.images.map(x=>x.ocrText||"")].filter(Boolean):[];
 function makeRows(list:Slide[]){const out:Row[]=[];list.forEach(s=>{const txt=[...s.text,...s.tables.flat(2),...s.images.map(x=>x.ocrText||"")].filter(Boolean);(mode==="product"&&s.images.length?s.images:[null]).forEach(im=>{const values:Record<string,string>={},images:Record<string,Img|null>={};cols.forEach(c=>{values[c.id]=c.type==="text"?suggest(txt,c.header):"";images[c.id]=c.type==="image"?(im||s.images[0]||null):null});out.push({id:uid(),slideNumber:s.slideNumber,sourceFile:s.sourceFile,values,images})})});SR(out)}
 async function process(){
  if(!files.length)return;
  BUSY(true);ERROR("");SS([]);SR([]);
  try{
   const JSZip=(await import("jszip")).default;
   const all:Slide[]=[];
   for(const file of files){
    if(!file.name.toLowerCase().endsWith(".pptx"))throw Error(file.name+": Free browser processing supports .pptx. Open this file in PowerPoint and use Save As → .pptx, then retry.");
    STATUS("Reading "+file.name+" locally — no upload to server");
    const zip=await JSZip.loadAsync(file);
    const slideNames=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)?.[1])-Number(b.match(/slide(\d+)/)?.[1]));
    if(!slideNames.length)throw Error(file.name+": no slides found in this PPTX.");
    for(let ix=0;ix<slideNames.length;ix++){
     const path=slideNames[ix],xmlText=await zip.file(path)!.async("text"),xml=new DOMParser().parseFromString(xmlText,"application/xml");
     if(xml.querySelector("parsererror"))throw Error("Could not read slide XML: "+path);
     const texts=Array.from(xml.getElementsByTagNameNS("*","t")).map(n=>(n.textContent||"").trim()).filter(Boolean);
     const tables:string[][][]=[];
     Array.from(xml.getElementsByTagNameNS("*","tbl")).forEach(tbl=>{
      const table:string[][]=[];
      Array.from(tbl.getElementsByTagNameNS("*","tr")).forEach(tr=>table.push(Array.from(tr.getElementsByTagNameNS("*","tc")).map(tc=>Array.from(tc.getElementsByTagNameNS("*","t")).map(t=>t.textContent||"").join("").trim())));
      if(table.length)tables.push(table);
     });
     const relPath=path.replace("slides/","slides/_rels/")+".rels";
     const relText=await zip.file(relPath)?.async("text");
     const rels=new Map<string,string>();
     if(relText){const relXml=new DOMParser().parseFromString(relText,"application/xml");Array.from(relXml.getElementsByTagNameNS("*","Relationship")).forEach(r=>{const id=r.getAttribute("Id"),target=r.getAttribute("Target"),type=r.getAttribute("Type")||"";if(id&&target&&!type.endsWith("/slideLayout")&&!type.endsWith("/notesSlide"))rels.set(id,target);});}
     const images:Img[]=[];
     const embeds=Array.from(xml.getElementsByTagNameNS("*","blip")).map(n=>n.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","embed")).filter((x):x is string=>!!x);
     for(let im=0;im<embeds.length;im++){
      const target=rels.get(embeds[im]);if(!target)continue;
      const imagePath=target.startsWith("/")?target.slice(1):("ppt/slides/"+target).split("/").reduce((a,p)=>{if(p==="..")a.pop();else if(p!==".")a.push(p);return a;},[] as string[]).join("/");
      const imageFile=zip.file(imagePath);if(!imageFile)continue;
      const ext=(imagePath.split(".").pop()||"png").toLowerCase(),data=await imageFile.async("base64"),mime=({"jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","gif":"image/gif","bmp":"image/bmp","svg":"image/svg+xml","tif":"image/tiff","tiff":"image/tiff"} as Record<string,string>)[ext]||"image/png";
      images.push({id:"s"+(ix+1)+"i"+(im+1),name:imagePath.split("/").pop()||("image"+im+"."+ext),mime,data});
     }
     const tableLines=tables.flatMap(t=>t.map(r=>r.join(" | ")));
     all.push({slideNumber:ix+1,sourceFile:file.name,title:texts[0]||("Slide "+(ix+1)),text:texts,tables,images});
     if((ix+1)%5===0)STATUS(file.name+": read "+(ix+1)+" of "+slideNames.length+" slides");
    }
   }
   SS(all);SEL(0);makeRows(all);STATUS("Extracted "+all.length+" slides locally. Files were not uploaded.");
  }catch(e:any){ERROR(e.message||"Could not extract presentation")}finally{BUSY(false)}
 }
 function cell(row:Row,col:Col,value:string){SR(prev=>prev.map(r=>r.id===row.id?{...r,values:{...r.values,[col.id]:value}}:r))}
 function saveProfile(){const name=window.prompt("Profile name");if(!name)return;try{const old=JSON.parse(localStorage.getItem("pptExcelProfiles")||"{}");old[name]=cols;localStorage.setItem("pptExcelProfiles",JSON.stringify(old));PROFILE(name);STATUS("Saved mapping profile: "+name)}catch{ERROR("Could not save profile in this browser")}}
 function loadProfile(name:string){PROFILE(name);try{const p=JSON.parse(localStorage.getItem("pptExcelProfiles")||"{}");if(p[name])SC(p[name])}catch{}}
 async function doOcr(){if(!cur?.images.length)return;OCR(true);try{const T=await import("tesseract.js"),copy=[...slides];for(let i=0;i<cur.images.length;i++){STATUS("OCR image "+(i+1)+" of "+cur.images.length);const img=cur.images[i],res=await T.recognize(uri(img),"eng");copy[sel]={...copy[sel],images:copy[sel].images.map(x=>x.id===img.id?{...x,ocrText:res.data.text.trim()}:x)}}SS(copy);makeRows(copy);STATUS("OCR completed. Review extracted image text.")}catch(e:any){ERROR("OCR failed: "+(e.message||"unknown error"))}finally{OCR(false)}}
 async function exportXlsx(){BUSY(true);ERROR("");try{
  const ExcelJS=(await import("exceljs")).default,wb=new ExcelJS.Workbook();wb.creator="Loveneet Suite";const ws=wb.addWorksheet("PPT Extract");
  const headers=cols.map(c=>c.header||"Column");if(source)headers.push("Source File","Slide Number");ws.addRow(headers);ws.views=[{state:"frozen",ySplit:1}];ws.autoFilter={from:{row:1,column:1},to:{row:rows.length+1,column:headers.length}};ws.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};ws.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF263D70"}};ws.getRow(1).alignment={vertical:"middle",horizontal:"center",wrapText:true};ws.getRow(1).height=32;
  cols.forEach((c,i)=>ws.getColumn(i+1).width=c.type==="image"?22:Math.min(42,Math.max(15,(c.header||"Column").length+3)));if(source){ws.getColumn(cols.length+1).width=30;ws.getColumn(cols.length+2).width=14;}
  for(let ri=0;ri<rows.length;ri++){const r=rows[ri],vals:any[]=[];cols.forEach(c=>vals.push(c.type==="image"?"":(r.values[c.id]||"")));if(source)vals.push(r.sourceFile,r.slideNumber);ws.addRow(vals);const rowNum=ri+2;
   if(embed)cols.forEach((c,ci)=>{const im=c.type==="image"?r.images[c.id]:null;if(!im?.data)return;try{const ext=(im.mime.split("/")[1]||"png").replace("jpeg","jpg");if(!["png","jpg","gif"].includes(ext))return;const imageId=wb.addImage({base64:"data:"+im.mime+";base64,"+im.data,extension:ext as "png"|"jpg"|"gif"});ws.addImage(imageId,{tl:{col:ci,row:rowNum-1},br:{col:ci+1,row:rowNum-0.05},editAs:"oneCell"});ws.getRow(rowNum).height=68;}catch{}});
  }
  const buf=await wb.xlsx.writeBuffer(),blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="PPT_to_Excel_with_Images.xlsx";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);STATUS("Workbook created locally and downloaded.");
 }catch(e:any){ERROR(e.message||"Export failed")}finally{BUSY(false)}}
 const move=(i:number,d:number)=>SC(prev=>{const n=[...prev],j=i+d;if(j<0||j>=n.length)return prev;[n[i],n[j]]=[n[j],n[i]];return n});
 return <section className="pptx-tool"><header className="pptx-head"><FileImage size={26}/><div><h2>PPT to Excel with Images</h2><p>Extract editable slide content, map custom headers and export embedded images.</p></div></header>
 <section className="pptx-panel"><h3>1 · Upload presentations</h3><label className="pptx-drop"><Upload size={24}/><strong>{files.length?files.map(f=>f.name).join(" · "):"Choose PPT or PPTX files"}</strong><small>For free-tier processing, save legacy .ppt files as .pptx first. Files are processed locally in your browser.</small><input type="file" accept=".ppt,.pptx" multiple onChange={e=>SF(Array.from(e.target.files||[]))}/></label><button className="pptx-primary" disabled={!files.length||busy} onClick={process}>{busy?<LoaderCircle className="pptx-spin"/>:"Extract slides"}</button><span className="pptx-status">{status}</span>{error&&<p className="pptx-error">{error}</p>}</section>
 <section className="pptx-panel"><div className="pptx-bar"><div><h3>2 · Configure Excel columns</h3><p>Change, delete, reorder or add any headers.</p></div><button className="pptx-secondary" onClick={()=>SC(p=>[...p,{id:uid(),header:"New column",type:"text"}])}><Plus size={15}/> Add column</button></div>{cols.map((c,i)=><div className="pptx-col" key={c.id}><input aria-label="Column header" value={c.header} onChange={e=>SC(p=>p.map(x=>x.id===c.id?{...x,header:e.target.value}:x))}/><select value={c.type} onChange={e=>SC(p=>p.map(x=>x.id===c.id?{...x,type:e.target.value as "text"|"image"}:x))}><option value="text">Text/value</option><option value="image">Image cell</option></select><button onClick={()=>move(i,-1)} disabled={!i} aria-label="Move up"><ArrowUp size={14}/></button><button onClick={()=>move(i,1)} disabled={i===cols.length-1} aria-label="Move down"><ArrowDown size={14}/></button><button onClick={()=>SC(p=>p.filter(x=>x.id!==c.id))} aria-label="Delete"><Trash2 size={14}/></button></div>)}<div className="pptx-options"><label><input type="radio" checked={mode==="slide"} onChange={()=>SM("slide")}/> One row per slide</label><label><input type="radio" checked={mode==="product"} onChange={()=>SM("product")}/> One row per product image</label><label><input type="checkbox" checked={source} onChange={e=>SOURCE(e.target.checked)}/> Include source file and slide number</label><label><input type="checkbox" checked={embed} onChange={e=>EMBED(e.target.checked)}/> Embed images</label><button className="pptx-secondary" onClick={()=>makeRows(slides)} disabled={!slides.length}>Refresh mappings</button><button className="pptx-secondary" onClick={saveProfile}>Save profile</button><select value={profile} onChange={e=>loadProfile(e.target.value)}><option value="">Load saved profile…</option>{Object.keys(getProfiles()).map(x=><option key={x}>{x}</option>)}</select></div></section>
 {slides.length>0&&<section className="pptx-panel"><h3>3 · Slide browser, original preview and mapping</h3><div className="pptx-work"><aside className="pptx-slides">{slides.map((s,i)=><button key={s.sourceFile+s.slideNumber+i} className={sel===i?"selected":""} onClick={()=>SEL(i)}>{s.preview&&<img src={uri({mime:"image/jpeg",data:s.preview,id:"",name:""})} alt="slide thumbnail"/>}<span>Slide {s.slideNumber}</span><small>{s.sourceFile}</small></button>)}</aside><div className="pptx-original"><strong>{cur?.sourceFile} · Slide {cur?.slideNumber}</strong>{cur?.preview&&<img className="pptx-preview" src={uri({mime:"image/jpeg",data:cur.preview,id:"",name:""})} alt="Original slide"/>}<h4>Extracted text (select to map)</h4><div className="pptx-lines">{lines.map((line,i)=><button key={i} onClick={()=>{const r=rows.find(x=>x.slideNumber===cur?.slideNumber&&x.sourceFile===cur?.sourceFile),c=cols.find(x=>x.type==="text");if(r&&c)cell(r,c,line)}}>{line}</button>)}</div>{cur?.images.length>0&&<><h4>Embedded images</h4><div className="pptx-gallery">{cur.images.map(im=><div key={im.id}><img src={uri(im)} alt={im.name}/><small>{im.name}</small>{im.ocrText&&<p>{im.ocrText}</p>}</div>)}</div><button className="pptx-secondary" onClick={doOcr} disabled={ocr}><ScanText size={14}/>{ocr?"OCR running…":"OCR embedded images"}</button></>}</div><aside className="pptx-map"><strong>Mapping · slide {cur?.slideNumber}</strong>{cols.map(c=>{const r=rows.find(x=>x.slideNumber===cur?.slideNumber&&x.sourceFile===cur?.sourceFile);if(!r)return null;return <div className="pptx-mapfield" key={c.id}><label>{c.header}</label>{c.type==="image"?<><select value={r.images[c.id]?.id||""} onChange={e=>{const im=cur?.images.find(x=>x.id===e.target.value)||null;SR(p=>p.map(x=>x.id===r.id?{...x,images:{...x.images,[c.id]:im}}:x))}}><option value="">No image</option>{cur?.images.map(im=><option key={im.id} value={im.id}>{im.name}</option>)}</select>{r.images[c.id]&&<img src={uri(r.images[c.id]!)} alt="Mapped"/>}</>:<input value={r.values[c.id]||""} onChange={e=>cell(r,c,e.target.value)} placeholder="Missing — type or select source text"/>}</div>})}</aside></div></section>}
 {rows.length>0&&<section className="pptx-panel"><h3>4 · Editable Excel preview ({rows.length} rows)</h3><div className="pptx-tablewrap"><table><thead><tr>{cols.map(c=><th key={c.id}>{c.header}</th>)}{source&&<><th>Source file</th><th>Slide</th></>}</tr></thead><tbody>{rows.map(r=><tr key={r.id}>{cols.map(c=><td key={c.id}>{c.type==="image"?(r.images[c.id]?<img className="pptx-cellimg" src={uri(r.images[c.id]!)} alt="cell"/>:"Missing image"):<input value={r.values[c.id]||""} onChange={e=>cell(r,c,e.target.value)}/>}</td>)}{source&&<><td>{r.sourceFile}</td><td>{r.slideNumber}</td></>}</tr>)}</tbody></table></div><div className="pptx-bar"><p>Actual images will be embedded into Excel cells, not exported as external URLs.</p><button className="pptx-primary" onClick={exportXlsx} disabled={busy}><Download size={15}/> Export .xlsx</button></div></section>}
 </section>
}