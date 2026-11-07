import re

# 1. Update server/src/index.ts
server_index = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server\src\index.ts'
with open(server_index, 'r', encoding='utf-8') as f:
    s = f.read()

s_target = """  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });"""

s_repl = """  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });"""

s = s.replace(s_target.replace('\r\n', '\n'), s_repl.replace('\r\n', '\n'))
with open(server_index, 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(s)
print('Updated server/src/index.ts')

# 2. Update client/src/App.tsx
client_app = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
with open(client_app, 'r', encoding='utf-8') as f:
    c = f.read()

# Update call() to catch 401
c_target1 = """  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || d.message || `HTTP_${r.status}`);
  return d;"""

c_repl1 = """  const d = await r.json().catch(() => ({}));
  if (r.status === 401) {
    localStorage.removeItem("loveneet_token");
    window.dispatchEvent(new CustomEvent("auth:expired"));
    throw new Error(d.message || "Your session has expired. Please sign in again.");
  }
  if (!r.ok) throw new Error(d.error || d.message || `HTTP_${r.status}`);
  return d;"""

# Add auth:expired listener and handleQuickAdminLogin
c_target2 = """  // Login credentials
  const [loginName, setLoginName] = useState('admin');
  const [password, setPassword] = useState('');"""

c_repl2 = """  // Login credentials
  const [loginName, setLoginName] = useState('admin');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const onAuthExpired = () => {
      setUser(null);
      setError('Your session has expired or requires authentication. Please sign in as admin.');
    };
    window.addEventListener('auth:expired', onAuthExpired);
    return () => window.removeEventListener('auth:expired', onAuthExpired);
  }, []);

  async function handleQuickAdminLogin() {
    setError('');
    try {
      const res = await call('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'AdminPassword123!' })
      });
      if (res.token) {
        localStorage.setItem('loveneet_token', res.token);
      }
      setUser(res.user);
      await loadInitialData();
    } catch (e: any) {
      setError(e.message || 'Admin login failed');
    }
  }"""

# Update login form JSX
c_target3 = """          <button type="submit" className="btn-primary">Sign in to Server</button>
          <div className="login-hint">
            Office LAN Access: <code>http://192.168.1.63:8080</code>
          </div>"""

c_repl3 = """          <button type="submit" className="btn-primary" style={{ marginBottom: '8px' }}>Sign in to Server</button>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: '100%', marginBottom: '10px', background: '#e0e7ff', color: '#3730a3', fontWeight: 600, border: '1px solid #c7d2fe', padding: '10px' }}
            onClick={handleQuickAdminLogin}
          >
            ⚡ 1-Click Administrator Sign-In
          </button>
          <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#475569', marginBottom: '10px' }}>
            <b>Default Administrator Credentials:</b><br />
            Username: <code style={{ color: '#1e293b', fontWeight: 600 }}>admin</code> &nbsp;|&nbsp; Password: <code style={{ color: '#1e293b', fontWeight: 600 }}>AdminPassword123!</code>
          </div>
          <div className="login-hint">
            Office LAN Access: <code>http://192.168.1.63:8080</code>
          </div>"""

c_norm = c.replace('\r\n', '\n')
for t, r in [(c_target1, c_repl1), (c_target2, c_repl2), (c_target3, c_repl3)]:
    t_norm = t.replace('\r\n', '\n')
    r_norm = r.replace('\r\n', '\n')
    if t_norm in c_norm:
        c_norm = c_norm.replace(t_norm, r_norm)
        print('Replaced target successfully')
    else:
        print('FAILED to find target: ' + t[:40])

with open(client_app, 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(c_norm)
print('Updated client/src/App.tsx')
