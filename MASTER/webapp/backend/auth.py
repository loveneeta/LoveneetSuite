from __future__ import annotations
import base64, hashlib, hmac, json, os, secrets, sqlite3, time, uuid, io, re, zipfile, smtplib
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
from pathlib import Path
from typing import Any
from fastapi import APIRouter, HTTPException, Request, Response, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router=APIRouter(prefix="/api/auth",tags=["authentication"])
output_router=APIRouter(tags=["output watermarking"])
COOKIE="loveneet_session"; SESSION_SECONDS=43200
TOOLS=["dashboard","pdf-studio","business-system","collector","convert","organize","ppt","pdf-excel","excel-ppt","ppt-excel"]+["pdf:"+x for x in ["merge","split","remove-pages","extract-pages","organize-pages","scan-to-pdf","compress","repair","ocr","image-to-pdf","word-to-pdf","pptx-to-pdf","excel-to-pdf","html-to-pdf","pdf-to-jpg","pdf-to-word","pdf-to-pptx","pdf-to-excel","pdf-to-markdown","rotate","watermark","page-numbers","crop","edit-pdf","redact","forms","sign","unlock","protect","compare","pdf-to-pdfa","ai-summarizer","translate"]]
LABELS={x:x.replace("pdf:","").replace("-"," ").title() for x in TOOLS}
def now(): return datetime.now(timezone.utc).isoformat()
def path():
 p=Path(os.getenv("LOVENEET_AUTH_DB") or (Path(__file__).resolve().parent/"data"/"auth.db")); p.parent.mkdir(parents=True,exist_ok=True); return p
def db():
 c=sqlite3.connect(path(),timeout=20); c.row_factory=sqlite3.Row; c.execute("PRAGMA foreign_keys=ON"); c.execute("PRAGMA journal_mode=WAL"); return c
def init_db():
 with db() as c:
  c.executescript("""
  CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'active',plan_id TEXT,max_users INTEGER NOT NULL DEFAULT 6,tool_access TEXT NOT NULL DEFAULT '[]',plan_started_at TEXT,plan_expires_at TEXT,watermark_enabled INTEGER NOT NULL DEFAULT 1,watermark_text TEXT NOT NULL DEFAULT '{company} · Loveneet Suite',watermark_position TEXT NOT NULL DEFAULT 'bottom-right',watermark_opacity REAL NOT NULL DEFAULT .35,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,description TEXT DEFAULT '',price REAL DEFAULT 0,currency TEXT DEFAULT 'INR',duration_days INTEGER DEFAULT 30,max_users INTEGER DEFAULT 6,tool_access TEXT NOT NULL DEFAULT '[]',active INTEGER DEFAULT 1,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,email TEXT UNIQUE COLLATE NOCASE NOT NULL,full_name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,status TEXT DEFAULT 'active',must_change_password INTEGER DEFAULT 0,last_login TEXT,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_user_id TEXT,company_id TEXT,action TEXT NOT NULL,detail TEXT DEFAULT '{}',created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS password_resets(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL,expires_at REAL NOT NULL,used INTEGER DEFAULT 0);
  CREATE INDEX IF NOT EXISTS users_company_idx ON users(company_id);
  """)
  cols={row[1] for row in c.execute("PRAGMA table_info(companies)").fetchall()}
  if "plan_started_at" not in cols:c.execute("ALTER TABLE companies ADD COLUMN plan_started_at TEXT")
  if "plan_expires_at" not in cols:c.execute("ALTER TABLE companies ADD COLUMN plan_expires_at TEXT")
  defaults={"tool_labels":json.dumps(LABELS),"watermark_enabled":"true","watermark_text":"{company} · Loveneet Suite","watermark_position":"bottom-right","watermark_opacity":"0.35"}
  for k,v in defaults.items(): c.execute("INSERT OR IGNORE INTO settings VALUES(?,?)",(k,v))
def secret():
 s=os.getenv("LOVENEET_AUTH_SECRET","")
 if s:
  if len(s)<32: raise RuntimeError("LOVENEET_AUTH_SECRET must be at least 32 characters.")
  return s.encode()
 f=path().parent/".session-secret"
 if not f.exists():
  t=f.with_suffix(".tmp"); t.write_bytes(secrets.token_bytes(48))
  try: os.chmod(t,0o600)
  except OSError: pass
  try: t.replace(f)
  except FileExistsError: t.unlink(missing_ok=True)
 return f.read_bytes()
def b64(x): return base64.urlsafe_b64encode(x).rstrip(b"=").decode()
def hashpw(p):
 salt=secrets.token_bytes(16); rounds=600000; d=hashlib.pbkdf2_hmac("sha256",p.encode(),salt,rounds)
 return "pbkdf2_sha256$"+str(rounds)+"$"+b64(salt)+"$"+b64(d)
def checkpw(p,s):
 try:
  a,n,salt,w=s.split("$",3); d=hashlib.pbkdf2_hmac("sha256",p.encode(),base64.urlsafe_b64decode(salt+"==="),int(n)); return a=="pbkdf2_sha256" and hmac.compare_digest(b64(d),w)
 except Exception:return False
def token(u):
 body=b64(json.dumps({"sub":u["id"],"exp":int(time.time())+SESSION_SECONDS},separators=(",",":")).encode())
 return body+"."+b64(hmac.new(secret(),body.encode(),hashlib.sha256).digest())
def decode(t):
 try:
  body,sig=t.split(".",1); good=b64(hmac.new(secret(),body.encode(),hashlib.sha256).digest())
  if not hmac.compare_digest(sig,good):return None
  p=json.loads(base64.urlsafe_b64decode(body+"===")); return p if p["exp"]>=time.time() else None
 except Exception:return None
def user_token(t):
 p=decode(t or "")
 if not p:return None
 with db() as c:
  u=c.execute("SELECT * FROM users WHERE id=? AND status='active'",(p["sub"],)).fetchone()
  if u and u["company_id"]:
   co=c.execute("SELECT status,plan_expires_at FROM companies WHERE id=?",(u["company_id"],)).fetchone()
   if not co or co["status"]!="active" or (co["plan_expires_at"] and datetime.fromisoformat(co["plan_expires_at"]) < datetime.now(timezone.utc)):return None
  return u
def current(r):
 u=getattr(r.state,"auth_user",None)
 if not u:raise HTTPException(401,"Please sign in.")
 return u
def roles(u,*allowed):
 if u["role"] not in allowed:raise HTTPException(403,"Permission denied.")
def audit(u,action,cid=None,detail=None):
 with db() as c:c.execute("INSERT INTO audit_logs(actor_user_id,company_id,action,detail,created_at) VALUES(?,?,?,?,?)",(u["id"] if u else None,cid,action,json.dumps(detail or {}),now()))
def setting(k,d=""):
 with db() as c:
  x=c.execute("SELECT value FROM settings WHERE key=?",(k,)).fetchone();return x["value"] if x else d
def access(cid):
 with db() as c:
  x=c.execute("SELECT tool_access FROM companies WHERE id=?",(cid,)).fetchone();return json.loads(x["tool_access"] or "[]") if x else []
def public(u):
 co=None
 if u["company_id"]:
  with db() as c:
   x=c.execute("SELECT c.*,p.name plan_name FROM companies c LEFT JOIN plans p ON p.id=c.plan_id WHERE c.id=?",(u["company_id"],)).fetchone()
  if x:
   co=dict(x);co["tool_access"]=json.loads(co["tool_access"]);co["watermark_enabled"]=bool(co["watermark_enabled"])
 return {"id":u["id"],"email":u["email"],"full_name":u["full_name"],"role":u["role"],"company_id":u["company_id"],"company":co,"must_change_password":bool(u["must_change_password"])}
def temp_password():return secrets.token_urlsafe(16)+"aA1!"
def setpw(c,uid,p,must=True):c.execute("UPDATE users SET password_hash=?,must_change_password=? WHERE id=?",(hashpw(p),int(must),uid))
class Setup(BaseModel):
 setup_key:str;email:str=Field(pattern=r"^[^@ ]+@[^@ ]+\.[^@ ]+$");full_name:str=Field(min_length=2,max_length=100);password:str=Field(min_length=12,max_length=200)
class Login(BaseModel):
 email:EmailStr;password:str=Field(min_length=1,max_length=200)
class Company(BaseModel):
 name:str=Field(min_length=2,max_length=120);admin_name:str=Field(min_length=2,max_length=100);admin_email:str=Field(pattern=r"^[^@ ]+@[^@ ]+\.[^@ ]+$")
 plan_id:str|None=None;status:str="active";max_users:int=Field(default=6,ge=1,le=500);tool_access:list[str]=Field(default_factory=list)
class Plan(BaseModel):
 name:str=Field(min_length=2,max_length=80);description:str="";price:float=Field(default=0,ge=0);currency:str="INR"
 duration_days:int=Field(default=30,ge=1,le=3650);max_users:int=Field(default=6,ge=1,le=500);tool_access:list[str]=Field(default_factory=list);active:bool=True
class Wm(BaseModel):
 enabled:bool=True;text:str=Field(default="{company} · Loveneet Suite",min_length=1,max_length=180);position:str="bottom-right";opacity:float=Field(default=.35,ge=.05,le=1)
class Labels(BaseModel):labels:dict[str,str]
class Password(BaseModel):current_password:str;new_password:str=Field(min_length=12,max_length=200)
class Member(BaseModel):full_name:str=Field(min_length=2,max_length=100);email:EmailStr
class Status(BaseModel):status:str
class Reset(BaseModel):new_password:str|None=Field(default=None,min_length=12,max_length=200)
@router.get("/status")
def status():
 init_db()
 with db() as c:n=c.execute("SELECT COUNT(*) n FROM users WHERE role='super_admin'").fetchone()["n"]
 return {"setup_required":n==0,"setup_enabled":bool(os.getenv("SUPERADMIN_SETUP_KEY")),"password_reset_email_enabled":bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_FROM"))}
@router.post("/setup")
def setup(x:Setup,r:Request,res:Response):
 init_db();key=os.getenv("SUPERADMIN_SETUP_KEY","")
 if not key or not hmac.compare_digest(x.setup_key,key):raise HTTPException(403,"Super Admin setup is disabled or key is incorrect.")
 with db() as c:
  if c.execute("SELECT 1 FROM users WHERE role='super_admin'").fetchone():raise HTTPException(409,"Super Admin already exists.")
  uid=uuid.uuid4().hex;c.execute("INSERT INTO users(id,email,full_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",(uid,x.email.lower(),x.full_name,hashpw(x.password),"super_admin",now()));u=c.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
 res.set_cookie(COOKIE,token(u),httponly=True,secure=os.getenv("AUTH_COOKIE_SECURE","false").lower()=="true",samesite=os.getenv("AUTH_COOKIE_SAMESITE","lax").lower(),max_age=SESSION_SECONDS,path="/")
 audit(u,"super_admin_created");return {"user":public(u)}
@router.post("/login")
def login(x:Login,r:Request,res:Response):
 init_db();ip=r.client.host if r.client else "unknown";nowsec=int(time.time());attempts=getattr(login,"attempts",{});recent=[v for v in attempts.get(ip,[]) if nowsec-v<300]
 if len(recent)>=12:raise HTTPException(429,"Too many login attempts. Wait five minutes.")
 recent.append(nowsec);attempts[ip]=recent;login.attempts=attempts
 with db() as c:
  u=c.execute("SELECT * FROM users WHERE email=? COLLATE NOCASE",(x.email,)).fetchone()
  if not u or u["status"]!="active" or not checkpw(x.password,u["password_hash"]):raise HTTPException(401,"Email or password is incorrect.")
  if u["company_id"]:
   co=c.execute("SELECT status,plan_expires_at FROM companies WHERE id=?",(u["company_id"],)).fetchone()
   if not co or co["status"]!="active":raise HTTPException(403,"Company account is suspended.")
   if co["plan_expires_at"] and datetime.fromisoformat(co["plan_expires_at"]) < datetime.now(timezone.utc):raise HTTPException(403,"Company subscription has expired. Contact the Super Admin.")
  c.execute("UPDATE users SET last_login=? WHERE id=?",(now(),u["id"]));u=c.execute("SELECT * FROM users WHERE id=?",(u["id"],)).fetchone()
 attempts[ip]=[];res.set_cookie(COOKIE,token(u),httponly=True,secure=os.getenv("AUTH_COOKIE_SECURE","false").lower()=="true",samesite="lax",max_age=SESSION_SECONDS,path="/")
 return {"user":public(u)}
@router.post("/logout")
def logout(res:Response):
 res.delete_cookie(COOKIE,path="/",httponly=True,samesite=os.getenv("AUTH_COOKIE_SAMESITE","lax").lower());return {"ok":True}
@router.get("/me")
def me(r:Request):return {"user":public(current(r))}
@router.post("/change-password")
def change(x:Password,r:Request):
 u=current(r)
 with db() as c:
  row=c.execute("SELECT password_hash FROM users WHERE id=?",(u["id"],)).fetchone()
  if not row or not checkpw(x.current_password,row["password_hash"]):raise HTTPException(400,"Current password is incorrect.")
  setpw(c,u["id"],x.new_password,False)
 audit(u,"password_changed",u["company_id"]);return {"ok":True}
@router.post("/forgot-password")
def forgot(x:dict):
 email=str(x.get("email","")).strip().lower()
 if not email:raise HTTPException(400,"Enter your email.")
 with db() as c:u=c.execute("SELECT * FROM users WHERE email=? COLLATE NOCASE AND status='active'",(email,)).fetchone()
 if not u:return {"ok":True,"message":"If the account exists, reset instructions will be sent."}
 host=os.getenv("SMTP_HOST");sender=os.getenv("SMTP_FROM");base=os.getenv("PUBLIC_APP_URL","").rstrip("/")
 if not host or not sender or not base:return {"ok":True,"message":"Email reset is not configured. Contact your company administrator or Super Admin."}
 tok=secrets.token_urlsafe(32)
 with db() as c:c.execute("INSERT INTO password_resets VALUES(?,?,?,?,0)",(uuid.uuid4().hex,u["id"],hashlib.sha256(tok.encode()).hexdigest(),time.time()+1800))
 from email.message import EmailMessage
 m=EmailMessage();m["Subject"]="Loveneet Suite password reset";m["From"]=sender;m["To"]=email;m.set_content(f"Reset your password within 30 minutes: {base}/?reset={tok}")
 try:
  with smtplib.SMTP(host,int(os.getenv("SMTP_PORT","587")),timeout=15) as s:
   if os.getenv("SMTP_STARTTLS","true").lower()=="true":s.starttls()
   if os.getenv("SMTP_USER"):s.login(os.getenv("SMTP_USER"),os.getenv("SMTP_PASSWORD",""))
   s.send_message(m)
 except Exception:raise HTTPException(503,"Reset email could not be sent. Contact administrator.")
 return {"ok":True,"message":"If the account exists, reset instructions will be sent."}
@router.post("/reset-password")
def reset(x:dict):
 tok=str(x.get("token",""));pw=str(x.get("new_password",""))
 if len(pw)<12:raise HTTPException(400,"Password must be at least 12 characters.")
 with db() as c:
  row=c.execute("SELECT * FROM password_resets WHERE token_hash=? AND used=0 AND expires_at>?",(hashlib.sha256(tok.encode()).hexdigest(),time.time())).fetchone()
  if not row:raise HTTPException(400,"Reset link is invalid or expired.")
  setpw(c,row["user_id"],pw,False);c.execute("UPDATE password_resets SET used=1 WHERE id=?",(row["id"],))
 return {"ok":True}
@router.get("/tools")
def tools(r:Request):
 u=current(r);labels=json.loads(setting("tool_labels",json.dumps(LABELS)));allowed=TOOLS if u["role"]=="super_admin" else [t for t in access(u["company_id"]) if t not in {"business-system","collector"}]
 has_pdf=any(t.startswith("pdf:") for t in allowed)
 return {"tools":[{"id":t,"name":labels.get(t,LABELS[t]),"allowed":u["role"]=="super_admin" or t in allowed or (t=="pdf-studio" and has_pdf) or (t.startswith("pdf:") and "pdf-studio" in allowed)} for t in TOOLS]}
def company_obj(x):
 d=dict(x);d["tool_access"]=json.loads(d.get("tool_access") or "[]");d["watermark_enabled"]=bool(d.get("watermark_enabled",1));return d
def plan_obj(x):
 d=dict(x);d["tool_access"]=json.loads(d.get("tool_access") or "[]");d["active"]=bool(d.get("active",1));return d
def wm_global():return {"enabled":setting("watermark_enabled","true")=="true","text":setting("watermark_text","{company} · Loveneet Suite"),"position":setting("watermark_position","bottom-right"),"opacity":float(setting("watermark_opacity",".35"))}
@router.get("/admin/overview")
def overview(r:Request):
 u=current(r);roles(u,"super_admin")
 with db() as c:
  counts={k:c.execute(q).fetchone()["n"] for k,q in {"companies":"SELECT COUNT(*) n FROM companies","active_companies":"SELECT COUNT(*) n FROM companies WHERE status='active'","users":"SELECT COUNT(*) n FROM users","plans":"SELECT COUNT(*) n FROM plans"}.items()}
  cos=c.execute("SELECT c.*,p.name plan_name,(SELECT COUNT(*) FROM users WHERE company_id=c.id) user_count FROM companies c LEFT JOIN plans p ON p.id=c.plan_id ORDER BY c.created_at DESC").fetchall()
  plans=c.execute("SELECT * FROM plans ORDER BY created_at DESC").fetchall();logs=c.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100").fetchall()
 return {"counts":counts,"companies":[company_obj(x) for x in cos],"plans":[plan_obj(x) for x in plans],"logs":[dict(x) for x in logs],"tools":TOOLS,"labels":json.loads(setting("tool_labels",json.dumps(LABELS))),"watermark":wm_global()}
@router.post("/admin/companies")
def create_company(x:Company,r:Request):
 u=current(r);roles(u,"super_admin")
 if x.status not in {"active","suspended"} or any(t not in TOOLS or t in {"business-system","collector"} for t in x.tool_access):raise HTTPException(400,"Invalid company status or tool access.")
 cid=uuid.uuid4().hex;slug="-".join(x.name.lower().split())[:80]+"-"+cid[:6];pw=temp_password()
 with db() as c:
  if c.execute("SELECT 1 FROM users WHERE email=? COLLATE NOCASE",(x.admin_email,)).fetchone():raise HTTPException(409,"Email already registered.")
  planrow=c.execute("SELECT * FROM plans WHERE id=? AND active=1",(x.plan_id,)).fetchone() if x.plan_id else None
  if x.plan_id and not planrow:raise HTTPException(400,"Plan is not active.")
  max_users=planrow["max_users"] if planrow else x.max_users
  tools=x.tool_access or (json.loads(planrow["tool_access"]) if planrow else [])
  expiry=(datetime.now(timezone.utc)+timedelta(days=planrow["duration_days"])).isoformat() if planrow else None
  c.execute("INSERT INTO companies(id,name,slug,status,plan_id,max_users,tool_access,plan_started_at,plan_expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",(cid,x.name,slug,x.status,x.plan_id,max_users,json.dumps(tools),now() if planrow else None,expiry,now()))
  uid=uuid.uuid4().hex;c.execute("INSERT INTO users(id,company_id,email,full_name,password_hash,role,status,must_change_password,created_at) VALUES(?,?,?,?,?,'company_admin','active',1,?)",(uid,cid,x.admin_email.lower(),x.admin_name,hashpw(pw),now()))
 audit(u,"company_created",cid,{"name":x.name,"admin_email":x.admin_email})
 return {"company_id":cid,"company_name":x.name,"admin_email":x.admin_email,"temporary_password":pw}
@router.patch("/admin/companies/{cid}")
def update_company(cid:str,x:dict,r:Request):
 u=current(r);roles(u,"super_admin");allowed={"name","status","plan_id","max_users","tool_access","plan_started_at","plan_expires_at"};v={k:z for k,z in x.items() if k in allowed}
 if not v:raise HTTPException(400,"No valid changes supplied.")
 if "status" in v and v["status"] not in {"active","suspended"}:raise HTTPException(400,"Invalid status.")
 if "tool_access" in v and any(t not in TOOLS or t in {"business-system","collector"} for t in v["tool_access"]):raise HTTPException(400,"Unknown tool.")
 if "max_users" in v and not 1<=int(v["max_users"])<=500:raise HTTPException(400,"Invalid user limit.")
 if v.get("plan_id"):
  with db() as c:
   p=c.execute("SELECT max_users,tool_access,duration_days FROM plans WHERE id=?",(v["plan_id"],)).fetchone()
  if not p:raise HTTPException(400,"Plan not found.")
  v.setdefault("max_users",p["max_users"]);v.setdefault("tool_access",json.loads(p["tool_access"]));v["plan_started_at"]=now();v["plan_expires_at"]=(datetime.now(timezone.utc)+timedelta(days=p["duration_days"])).isoformat()
 with db() as c:
  if not c.execute("SELECT 1 FROM companies WHERE id=?",(cid,)).fetchone():raise HTTPException(404,"Company not found.")
  sets=[];vals=[]
  for k,z in v.items():sets.append(k+"=?");vals.append(json.dumps(z) if k=="tool_access" else z)
  c.execute("UPDATE companies SET "+",".join(sets)+" WHERE id=?",(*vals,cid))
 audit(u,"company_updated",cid,v);return {"ok":True}
@router.post("/admin/plans")
def create_plan(x:Plan,r:Request):
 u=current(r);roles(u,"super_admin")
 if any(t not in TOOLS or t in {"business-system","collector"} for t in x.tool_access):raise HTTPException(400,"Unknown or tenant-restricted tool in plan.")
 pid=uuid.uuid4().hex
 with db() as c:
  try:c.execute("INSERT INTO plans(id,name,description,price,currency,duration_days,max_users,tool_access,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",(pid,x.name,x.description,x.price,x.currency,x.duration_days,x.max_users,json.dumps(x.tool_access),int(x.active),now()))
  except sqlite3.IntegrityError:raise HTTPException(409,"Plan name already exists.")
 audit(u,"plan_created",None,{"name":x.name});return {"id":pid}
@router.patch("/admin/plans/{pid}")
def update_plan(pid:str,x:Plan,r:Request):
 u=current(r);roles(u,"super_admin")
 if any(t not in TOOLS or t in {"business-system","collector"} for t in x.tool_access):raise HTTPException(400,"Unknown or tenant-restricted tool.")
 with db() as c:
  cur=c.execute("UPDATE plans SET name=?,description=?,price=?,currency=?,duration_days=?,max_users=?,tool_access=?,active=? WHERE id=?",(x.name,x.description,x.price,x.currency,x.duration_days,x.max_users,json.dumps(x.tool_access),int(x.active),pid))
  if not cur.rowcount:raise HTTPException(404,"Plan not found.")
 audit(u,"plan_updated",None,{"id":pid});return {"ok":True}
@router.put("/admin/tool-labels")
def labels(x:Labels,r:Request):
 u=current(r);roles(u,"super_admin")
 if any(k not in TOOLS or not v.strip() or len(v)>80 for k,v in x.labels.items()):raise HTTPException(400,"Invalid tool ID or label.")
 v=json.loads(setting("tool_labels",json.dumps(LABELS)));v.update({k:z.strip() for k,z in x.labels.items()})
 with db() as c:c.execute("INSERT OR REPLACE INTO settings VALUES('tool_labels',?)",(json.dumps(v),))
 audit(u,"tool_labels_updated",None,{"count":len(x.labels)});return {"ok":True}
@router.put("/admin/watermark")
def watermark(x:Wm,r:Request):
 u=current(r);roles(u,"super_admin")
 if x.position not in {"bottom-right","bottom-left","top-right","top-left","center"}:raise HTTPException(400,"Invalid watermark position.")
 vals={"watermark_enabled":str(x.enabled).lower(),"watermark_text":x.text,"watermark_position":x.position,"watermark_opacity":str(x.opacity)}
 with db() as c:
  for k,v in vals.items():c.execute("INSERT OR REPLACE INTO settings VALUES(?,?)",(k,v))
 audit(u,"watermark_settings_changed",None,vals);return {"ok":True}
@router.get("/admin/users")
def all_users(r:Request):
 u=current(r);roles(u,"super_admin")
 with db() as c:rows=c.execute("SELECT id,company_id,email,full_name,role,status,last_login,created_at FROM users ORDER BY created_at DESC").fetchall()
 return {"users":[dict(x) for x in rows]}
@router.get("/company/overview")
def company_overview(r:Request):
 u=current(r);roles(u,"company_admin","member")
 with db() as c:
  co=c.execute("SELECT c.*,p.name plan_name FROM companies c LEFT JOIN plans p ON p.id=c.plan_id WHERE c.id=?",(u["company_id"],)).fetchone()
  members=c.execute("SELECT id,email,full_name,role,status,last_login,created_at FROM users WHERE company_id=? ORDER BY created_at",(u["company_id"],)).fetchall()
  logs=c.execute("SELECT action,detail,created_at FROM audit_logs WHERE company_id=? ORDER BY id DESC LIMIT 50",(u["company_id"],)).fetchall()
 return {"company":company_obj(co),"members":[dict(x) for x in members],"logs":[dict(x) for x in logs]}
@router.patch("/company/profile")
def profile(x:dict,r:Request):
 u=current(r);roles(u,"company_admin");name=str(x.get("name","")).strip()
 if not 2<=len(name)<=120:raise HTTPException(400,"Company name must be 2–120 characters.")
 with db() as c:c.execute("UPDATE companies SET name=? WHERE id=?",(name,u["company_id"]))
 audit(u,"company_profile_changed",u["company_id"],{"name":name});return {"ok":True}
@router.post("/company/users")
def create_member(x:Member,r:Request):
 u=current(r);roles(u,"company_admin");pw=temp_password();cid=u["company_id"]
 with db() as c:
  co=c.execute("SELECT max_users FROM companies WHERE id=?",(cid,)).fetchone();n=c.execute("SELECT COUNT(*) n FROM users WHERE company_id=?",(cid,)).fetchone()["n"]
  if n>=co["max_users"]:raise HTTPException(403,f"Plan limit is {co['max_users']} total accounts, including the company administrator.")
  if c.execute("SELECT 1 FROM users WHERE email=? COLLATE NOCASE",(x.email,)).fetchone():raise HTTPException(409,"Email already registered.")
  uid=uuid.uuid4().hex;c.execute("INSERT INTO users(id,company_id,email,full_name,password_hash,role,status,must_change_password,created_at) VALUES(?,?,?,?,?,'member','active',1,?)",(uid,cid,x.email.lower(),x.full_name,hashpw(pw),now()))
 audit(u,"member_created",cid,{"email":x.email});return {"user_id":uid,"email":x.email,"temporary_password":pw}
@router.patch("/company/users/{uid}")
def member_status(uid:str,x:Status,r:Request):
 u=current(r);roles(u,"company_admin")
 if x.status not in {"active","suspended"}:raise HTTPException(400,"Invalid status.")
 with db() as c:
  cur=c.execute("UPDATE users SET status=? WHERE id=? AND company_id=? AND role='member'",(x.status,uid,u["company_id"]))
  if not cur.rowcount:raise HTTPException(404,"Team member not found.")
 audit(u,"member_status_changed",u["company_id"],{"user_id":uid,"status":x.status});return {"ok":True}
@router.post("/admin/users/{uid}/reset-password")
def reset_by_admin(uid:str,r:Request):
 u=current(r);roles(u,"super_admin","company_admin");pw=temp_password()
 with db() as c:
  target=c.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
  if not target:raise HTTPException(404,"User not found.")
  if u["role"]=="company_admin" and (target["company_id"]!=u["company_id"] or target["role"]!="member"):raise HTTPException(403,"You may reset only your own company team members.")
  setpw(c,uid,pw,True)
 audit(u,"password_reset",target["company_id"],{"target":uid});return {"temporary_password":pw}
def wm_config(cid):
 g=wm_global()
 if cid:
  with db() as c:x=c.execute("SELECT name,watermark_enabled,watermark_text,watermark_position,watermark_opacity FROM companies WHERE id=?",(cid,)).fetchone()
  if x:return {"enabled":g["enabled"] and bool(x["watermark_enabled"]),"text":g["text"],"position":g["position"],"opacity":g["opacity"],"company":x["name"]}
 return {**g,"company":"Loveneet Suite"}
def wm_bytes(data,filename,cfg,company,user):
 if not cfg["enabled"] or not data:return data
 ext=Path(filename).suffix.lower();label=cfg["text"].replace("{company}",company).replace("{user}",user).replace("{date}",datetime.now().strftime("%Y-%m-%d"))[:180]
 try:
  if ext==".pdf":
   import fitz
   doc=fitz.open(stream=data,filetype="pdf")
   for p in doc:
    r=p.rect;pos=cfg["position"]
    point={"top-left":(28,30),"top-right":(max(28,r.width-220),30),"center":(max(28,r.width/2-100),r.height/2),"bottom-left":(28,r.height-24)}.get(pos,(max(28,r.width-220),r.height-24))
    p.insert_text(point,label,fontsize=9,fontname="helv",color=(.4,.4,.4),overlay=True)
   return doc.tobytes(garbage=4,deflate=True)
  if ext in {".png",".jpg",".jpeg",".webp",".bmp",".tif",".tiff"}:
   from PIL import Image,ImageDraw,ImageFont
   im=Image.open(io.BytesIO(data)).convert("RGBA");d=ImageDraw.Draw(im);f=ImageFont.load_default();box=d.textbbox((0,0),label,font=f);w=box[2]-box[0];h=box[3]-box[1];pos=cfg["position"]
   xy={"top-left":(12,12),"top-right":(max(12,im.width-w-12),12),"center":((im.width-w)//2,(im.height-h)//2),"bottom-left":(12,max(12,im.height-h-12))}.get(pos,(max(12,im.width-w-12),max(12,im.height-h-12)))
   alpha=int(255*cfg["opacity"]);d.text(xy,label,font=f,fill=(40,40,40,alpha),stroke_width=1,stroke_fill=(255,255,255,int(150*cfg["opacity"])))
   out=io.BytesIO();fmt={".jpg":"JPEG",".jpeg":"JPEG",".png":"PNG",".webp":"WEBP",".bmp":"BMP",".tif":"TIFF",".tiff":"TIFF"}[ext];im.convert("RGB" if fmt in {"JPEG","BMP"} else "RGBA").save(out,format=fmt);return out.getvalue()
  if ext==".docx":
   from docx import Document
   doc=Document(io.BytesIO(data))
   for section in doc.sections:
    section.header.paragraphs[0].text=label
    section.footer.paragraphs[0].text=label
   out=io.BytesIO();doc.save(out);return out.getvalue()
  if ext==".pptx":
   from pptx import Presentation
   from pptx.util import Inches,Pt
   from pptx.dml.color import RGBColor
   prs=Presentation(io.BytesIO(data))
   for slide in prs.slides:
    box=slide.shapes.add_textbox(Inches(.2),prs.slide_height-Inches(.35),prs.slide_width-Inches(.4),Inches(.25))
    p=box.text_frame.paragraphs[0];p.text=label;p.font.size=Pt(9);p.font.color.rgb=RGBColor(125,125,125)
   out=io.BytesIO();prs.save(out);return out.getvalue()
  if ext in {".xlsx",".xlsm"}:
   from openpyxl import load_workbook
   book=load_workbook(io.BytesIO(data),keep_vba=ext==".xlsm")
   for sheet in book.worksheets:
    sheet.oddHeader.center.text=label;sheet.oddFooter.right.text="Loveneet Suite"
   sheet=book.create_sheet("Document Watermark");sheet["A1"]=label
   from openpyxl.styles import Font
   sheet["A1"].font=Font(size=18,bold=True,color="777777")
   out=io.BytesIO();book.save(out);return out.getvalue()
  if ext in {".txt",".md",".csv"}:return (label+"\n"+data.decode("utf-8",errors="replace")).encode()
  return data
 except Exception:raise
def watermark_download(data,filename,u):
 cfg=wm_config(u["company_id"])
 if not cfg["enabled"]:return data
 company=cfg["company"];name=u["full_name"]
 if filename.lower().endswith(".zip"):
  src=zipfile.ZipFile(io.BytesIO(data));out=io.BytesIO()
  with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
   for item in src.infolist():
    if not item.is_dir():z.writestr(item.filename,wm_bytes(src.read(item.filename),item.filename,cfg,company,name))
  return out.getvalue()
 return wm_bytes(data,filename,cfg,company,name)
class AuthMiddleware:
 def __init__(self,app):self.app=app
 async def __call__(self,scope,receive,send):
  path=scope.get("path","")
  public=path in {"/api/health","/api/auth/status","/api/auth/setup","/api/auth/login","/api/auth/forgot-password","/api/auth/reset-password"}
  if scope["type"]!="http" or not path.startswith("/api/") or public:return await self.app(scope,receive,send)
  headers={k.decode().lower():v.decode() for k,v in scope.get("headers",[])};t=None
  for p in headers.get("cookie","").split(";"):
   k,sep,v=p.strip().partition("=")
   if sep and k==COOKIE:t=v
  u=user_token(t)
  if not u:
   body=b'{"detail":"Authentication required. Please sign in."}'
   await send({"type":"http.response.start","status":401,"headers":[(b"content-type",b"application/json"),(b"content-length",str(len(body)).encode())]});await send({"type":"http.response.body","body":body});return
  scope.setdefault("state",{})["auth_user"]=u
  if u["role"]!="super_admin":
   tool=None
   if path.startswith("/api/pdf-tools/"):tool="pdf:"+path.rsplit("/",1)[-1]
   elif path.startswith("/api/collector/"):tool="collector"
   else:tool={"/api/convert":"convert","/api/organize":"organize","/api/ppt-export":"ppt"}.get(path)
   if tool:
    allowed=access(u["company_id"])
    if tool not in allowed and not(tool.startswith("pdf:") and "pdf-studio" in allowed):
     body=b'{"detail":"This tool is not included in your company plan."}'
     await send({"type":"http.response.start","status":403,"headers":[(b"content-type",b"application/json"),(b"content-length",str(len(body)).encode())]});await send({"type":"http.response.body","body":body});return
  await self.app(scope,receive,send)
class WatermarkMiddleware:
 def __init__(self,app):self.app=app
 async def __call__(self,scope,receive,send):
  if scope["type"]!="http" or not scope.get("path","").startswith("/api/") or scope["path"].startswith("/api/auth/") or scope["path"]=="/api/output/watermark":return await self.app(scope,receive,send)
  u=scope.get("state",{}).get("auth_user")
  if not u:return await self.app(scope,receive,send)
  start=None;parts=[];total=0
  async def capture(msg):
   nonlocal start,total
   if msg["type"]=="http.response.start":start=msg;return
   if msg["type"]!="http.response.body":return await send(msg)
   chunk=msg.get("body",b"");total+=len(chunk)
   if total>400*1024*1024:
    err=b'{"detail":"Output exceeds watermark processing size. Reduce batch size."}'
    await send({"type":"http.response.start","status":413,"headers":[(b"content-type",b"application/json"),(b"content-length",str(len(err)).encode())]});await send({"type":"http.response.body","body":err});return
   parts.append(chunk)
   if msg.get("more_body",False):return
   headers={k.decode().lower():v.decode() for k,v in (start or {}).get("headers",[])}
   disp=headers.get("content-disposition","")
   if disp and (start or {}).get("status",200)<400:
    m=re.search(r'filename="?([^";]+)',disp,re.I);filename=m.group(1) if m else "output.bin"
    try:data=watermark_download(b"".join(parts),filename,u)
    except Exception:
     err=b'{"detail":"Mandatory watermark failed. Download blocked."}'
     await send({"type":"http.response.start","status":500,"headers":[(b"content-type",b"application/json"),(b"content-length",str(len(err)).encode())]});await send({"type":"http.response.body","body":err});return
    hs=[(k,v) for k,v in start["headers"] if k.lower() not in {b"content-length",b"transfer-encoding"}];hs.append((b"content-length",str(len(data)).encode()))
    await send({**start,"headers":hs});await send({"type":"http.response.body","body":data})
   else:
    if start:await send(start)
    await send({"type":"http.response.body","body":b"".join(parts)})
  await self.app(scope,receive,capture)


@output_router.post("/api/output/watermark")
async def watermark_client_output(request: Request, file: UploadFile = File(...)):
    u=current(request)
    filename=Path(file.filename or "output.bin").name
    data=await file.read(400*1024*1024+1)
    if len(data)>400*1024*1024:raise HTTPException(413,"Output is too large for watermark processing.")
    try:processed=watermark_download(data,filename,u)
    except Exception:raise HTTPException(500,"Mandatory watermark failed. Output was not released.")
    from mimetypes import guess_type
    return StreamingResponse(io.BytesIO(processed),media_type=guess_type(filename)[0] or "application/octet-stream",
        headers={"Content-Disposition":f'attachment; filename="{filename}"',"X-Watermark-Applied":"1"})
