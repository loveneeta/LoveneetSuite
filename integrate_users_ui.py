import re

app_file = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
style_file = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\style.css'

with open(app_file, 'r', encoding='utf-8') as f:
    app_text = f.read()

# 1. Add user state variables in App.tsx
state_anchor = "  const [newProdImagePreview, setNewProdImagePreview] = useState<string>('');"
user_states = """  const [newProdImagePreview, setNewProdImagePreview] = useState<string>('');

  // USER & STAFF MANAGEMENT STATE
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('ALL');
  const [userCompanyFilter, setUserCompanyFilter] = useState('ALL');
  const [userForm, setUserForm] = useState<any>({
    username: '',
    displayName: '',
    email: '',
    password: '',
    role: 'STAFF',
    isActive: true,
    companyAccess: []
  });

  async function loadUsers() {
    try {
      setLoadingUsers(true);
      const uList = await call('/auth/users');
      setSystemUsers(uList || []);
    } catch (e: any) {
      console.error('Failed to load users:', e);
    } finally {
      setLoadingUsers(false);
    }
  }

  function handleOpenCreateUser(defaultCompanyId?: number) {
    const initialAccess = companies.map((c) => ({
      companyId: Number(c.id),
      companyCode: c.code,
      companyName: c.name,
      canView: defaultCompanyId ? Number(c.id) === Number(defaultCompanyId) : true,
      canManageProducts: defaultCompanyId ? Number(c.id) === Number(defaultCompanyId) : false,
      canManageOrders: defaultCompanyId ? Number(c.id) === Number(defaultCompanyId) : false,
      canDispatch: false,
      canCancelDispatch: false,
      canViewReports: true,
      canManageSettings: false
    }));

    setUserForm({
      username: '',
      displayName: '',
      email: '',
      password: '',
      role: 'STAFF',
      isActive: true,
      companyAccess: initialAccess
    });
    setShowAddUserModal(true);
  }

  function handleOpenEditUser(u: any) {
    setEditingUser(u);
    const existingMap = new Map();
    if (Array.isArray(u.company_access)) {
      u.company_access.forEach((ca: any) => existingMap.set(Number(ca.companyId), ca));
    }

    const accessList = companies.map((c) => {
      const match = existingMap.get(Number(c.id));
      return {
        companyId: Number(c.id),
        companyCode: c.code,
        companyName: c.name,
        canView: match ? Boolean(match.canView) : false,
        canManageProducts: match ? Boolean(match.canManageProducts) : false,
        canManageOrders: match ? Boolean(match.canManageOrders) : false,
        canDispatch: match ? Boolean(match.canDispatch) : false,
        canCancelDispatch: match ? Boolean(match.canCancelDispatch) : false,
        canViewReports: match ? Boolean(match.canViewReports) : true,
        canManageSettings: match ? Boolean(match.canManageSettings) : false
      };
    });

    setUserForm({
      username: u.username,
      displayName: u.display_name,
      email: u.email || '',
      password: '', // leave empty to keep current password
      role: u.role,
      isActive: u.is_active,
      companyAccess: accessList
    });
  }

  async function handleCreateUserSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await call('/auth/users', {
        method: 'POST',
        body: JSON.stringify(userForm)
      });
      setSuccess(`Employee login "${userForm.username}" created successfully.`);
      setShowAddUserModal(false);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user account');
    }
  }

  async function handleUpdateUserSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await call(`/auth/users/${editingUser.id}`, {
        method: 'PUT',
        body: JSON.stringify(userForm)
      });
      setSuccess(`User "${editingUser.username}" updated successfully.`);
      setEditingUser(null);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update user account');
    }
  }

  async function handleToggleUserStatus(u: any) {
    try {
      await call(`/auth/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !u.is_active })
      });
      setSuccess(`Account "${u.username}" ${u.is_active ? 'deactivated' : 'activated'}.`);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update user status');
    }
  }"""

app_text = app_text.replace(state_anchor, user_states)

# 2. Add loadUsers to loadInitialData() and page switch
app_text = app_text.replace(
    "      const comps = await call('/companies');\n      setCompanies(comps);",
    "      const comps = await call('/companies');\n      setCompanies(comps);\n      if (u.user?.role === 'CENTRAL_ADMIN') loadUsers();"
)

# 3. Add filteredSortedUsers calculation
comp_calc_anchor = "  // 1. FILTERED & SORTED MATRIX PRODUCTS"
user_calc = """  // FILTERED & SORTED USERS
  const filteredSortedUsers = (() => {
    let list = [...systemUsers];
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      list = list.filter((u: any) =>
        u.username?.toLowerCase().includes(q) ||
        u.display_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    }
    if (userRoleFilter !== 'ALL') {
      list = list.filter((u: any) => u.role === userRoleFilter);
    }
    if (userCompanyFilter !== 'ALL') {
      const compId = Number(userCompanyFilter);
      list = list.filter((u: any) =>
        u.role === 'CENTRAL_ADMIN' ||
        (Array.isArray(u.company_access) && u.company_access.some((ca: any) => Number(ca.companyId) === compId && ca.canView))
      );
    }
    return list;
  })();

  // 1. FILTERED & SORTED MATRIX PRODUCTS"""

app_text = app_text.replace(comp_calc_anchor, user_calc)

# 4. Add sidebar navigation button for users
sidebar_anchor = """          <button
            className={`nav-btn ${page === 'companies' ? 'active' : ''}`}
            onClick={() => setPage('companies')}
            title="Company Management"
          >
            <Building2 size={17} className="nav-icon" />
            <span className="nav-text">Company Management</span>
          </button>"""

sidebar_replacement = """          <button
            className={`nav-btn ${page === 'companies' ? 'active' : ''}`}
            onClick={() => setPage('companies')}
            title="Company Management"
          >
            <Building2 size={17} className="nav-icon" />
            <span className="nav-text">Company Management</span>
          </button>
          {user.role === 'CENTRAL_ADMIN' && (
            <button
              className={`nav-btn ${page === 'users' ? 'active' : ''}`}
              onClick={() => { setPage('users'); loadUsers(); }}
              title="Staff & User Logins"
            >
              <Users size={17} className="nav-icon" />
              <span className="nav-text">Staff Logins ({systemUsers.length})</span>
            </button>
          )}"""

app_text = app_text.replace(sidebar_anchor, sidebar_replacement)

# 5. Add "+ Add Staff / Employee Login" button to Company Management header & Cards
co_head_anchor = """                {user.role === 'CENTRAL_ADMIN' && (
                  <button className="btn-primary" onClick={() => setShowAddCompany(true)}>
                    <Plus size={15} /> Add Company
                  </button>
                )}"""

co_head_replacement = """                <div style={{ display: 'flex', gap: '8px' }}>
                  {user.role === 'CENTRAL_ADMIN' && (
                    <>
                      <button
                        className="btn-secondary"
                        onClick={() => { setPage('users'); loadUsers(); }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        title="Manage Employee and Staff Login Accounts"
                      >
                        <Users size={15} /> Staff & User Logins
                      </button>
                      <button className="btn-primary" onClick={() => setShowAddCompany(true)}>
                        <Plus size={15} /> Add Company
                      </button>
                    </>
                  )}
                </div>"""

app_text = app_text.replace(co_head_anchor, co_head_replacement)

# Also enhance company cards with assigned staff count and "+ Add Staff for this Company"
card_action_anchor = """                    <div className="card-actions">
                      <button
                        className={Number(c.id) === Number(activeCompanyId) ? 'btn-current' : 'btn-switch'}
                        onClick={() => {
                          setActiveCompanyId(Number(c.id));
                          setPage('matrix');
                          setSuccess(`Switched workspace to ${c.name}`);
                        }}
                        title={`Switch to ${c.name} and view Matrix Dashboard`}
                      >
                        {Number(c.id) === Number(activeCompanyId) ? 'Active Workspace' : 'Switch & Open Matrix'}
                      </button>
                    </div>"""

card_action_replacement = """                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={13} className="text-indigo-600" />
                        <b>{systemUsers.filter((u: any) => u.role === 'CENTRAL_ADMIN' || (Array.isArray(u.company_access) && u.company_access.some((ca: any) => Number(ca.companyId) === Number(c.id) && ca.canView))).length}</b> Staff Access
                      </span>
                      {user.role === 'CENTRAL_ADMIN' && (
                        <button
                          style={{ border: 'none', background: 'transparent', color: '#4f46e5', fontWeight: 600, cursor: 'pointer', fontSize: '11px', padding: '2px 4px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCreateUser(Number(c.id));
                          }}
                          title={`Create a staff login specifically for ${c.name}`}
                        >
                          + Add Staff Login
                        </button>
                      )}
                    </div>
                    <div className="card-actions" style={{ marginTop: '8px' }}>
                      <button
                        className={Number(c.id) === Number(activeCompanyId) ? 'btn-current' : 'btn-switch'}
                        onClick={() => {
                          setActiveCompanyId(Number(c.id));
                          setPage('matrix');
                          setSuccess(`Switched workspace to ${c.name}`);
                        }}
                        title={`Switch to ${c.name} and view Matrix Dashboard`}
                      >
                        {Number(c.id) === Number(activeCompanyId) ? 'Active Workspace' : 'Switch & Open Matrix'}
                      </button>
                    </div>"""

app_text = app_text.replace(card_action_anchor, card_action_replacement)

# 6. Add PAGE: USERS
page_users_jsx = """          {/* PAGE: STAFF & USER LOGINS MANAGEMENT */}
          {page === 'users' && (
            <div className="section-block">
              <div className="section-head">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={22} className="text-indigo-600" />
                    <h2 style={{ margin: 0 }}>Staff & Employee Login Accounts</h2>
                  </div>
                  <p>Create and assign secure login accounts for staff members, company managers, and central administrators</p>
                </div>
                {user.role === 'CENTRAL_ADMIN' && (
                  <button className="btn-primary" onClick={() => handleOpenCreateUser()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={16} /> Create New Staff Login
                  </button>
                )}
              </div>

              {/* FILTER & SEARCH TOOLBAR FOR USERS */}
              <div className="filter-toolbar">
                <div className="filter-group">
                  <div className="search-bar" style={{ maxWidth: '320px' }}>
                    <Search size={15} className="search-icon" />
                    <input
                      placeholder="Search username, staff name, or email..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                    {userSearch && (
                      <button
                        onClick={() => setUserSearch('')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '0 2px' }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Filter size={14} className="text-slate-400" />
                    <select
                      className="filter-select"
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value)}
                    >
                      <option value="ALL">All Roles</option>
                      <option value="STAFF">Staff Only</option>
                      <option value="COMPANY_ADMIN">Company Admin Only</option>
                      <option value="CENTRAL_ADMIN">Central Admin Only</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building2 size={14} className="text-slate-400" />
                    <select
                      className="filter-select"
                      value={userCompanyFilter}
                      onChange={(e) => setUserCompanyFilter(e.target.value)}
                    >
                      <option value="ALL">All Companies</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="filter-group">
                  <span className="filter-count-badge">
                    Showing <b>{filteredSortedUsers.length}</b> of {systemUsers.length} accounts
                  </span>
                  <button
                    className="btn-secondary"
                    onClick={loadUsers}
                    style={{ height: '32px', padding: '0 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <RefreshCw size={13} className={loadingUsers ? 'spin' : ''} /> Refresh
                  </button>
                </div>
              </div>

              {/* USERS TABLE */}
              <div className="table-responsive card-table">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '220px' }}>STAFF / EMPLOYEE</th>
                      <th style={{ width: '130px' }}>ROLE</th>
                      <th style={{ minWidth: '220px' }}>ASSIGNED WORKSPACES</th>
                      <th style={{ minWidth: '240px' }}>FEATURE PERMISSIONS</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>STATUS</th>
                      <th style={{ width: '120px' }}>LAST LOGIN</th>
                      <th style={{ width: '180px', textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedUsers.map((u: any) => {
                      const isSelf = Number(u.id) === Number(user.id);
                      return (
                        <tr key={u.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                width: '36px', height: '36px', borderRadius: '50%',
                                background: u.role === 'CENTRAL_ADMIN' ? '#e0e7ff' : u.role === 'COMPANY_ADMIN' ? '#e0f2fe' : '#dcfce7',
                                color: u.role === 'CENTRAL_ADMIN' ? '#4338ca' : u.role === 'COMPANY_ADMIN' ? '#0369a1' : '#15803d',
                                display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '13px'
                              }}>
                                {(u.display_name || u.username).substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>{u.display_name}</div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                  <code>@{u.username}</code> {u.email && <span>&bull; {u.email}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            {u.role === 'CENTRAL_ADMIN' && (
                              <span style={{ fontSize: '11px', fontWeight: 700, background: '#e0e7ff', color: '#4338ca', padding: '3px 8px', borderRadius: '12px' }}>
                                CENTRAL ADMIN
                              </span>
                            )}
                            {u.role === 'COMPANY_ADMIN' && (
                              <span style={{ fontSize: '11px', fontWeight: 700, background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '12px' }}>
                                COMPANY ADMIN
                              </span>
                            )}
                            {u.role === 'STAFF' && (
                              <span style={{ fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '12px' }}>
                                STAFF
                              </span>
                            )}
                          </td>
                          <td>
                            {u.role === 'CENTRAL_ADMIN' ? (
                              <span style={{ fontSize: '12px', color: '#4338ca', fontWeight: 600 }}>
                                🌐 All Companies (Global Enterprise Access)
                              </span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {Array.isArray(u.company_access) && u.company_access.filter((ca: any) => ca.canView).map((ca: any) => (
                                  <span
                                    key={ca.companyId}
                                    style={{
                                      fontSize: '11px', fontWeight: 600, background: '#f1f5f9', color: '#334155',
                                      padding: '2px 7px', borderRadius: '6px', border: '1px solid #e2e8f0'
                                    }}
                                  >
                                    {ca.companyName}
                                  </span>
                                ))}
                                {(!u.company_access || !u.company_access.some((ca: any) => ca.canView)) && (
                                  <span style={{ fontSize: '11px', color: '#ef4444', fontStyle: 'italic' }}>No company assigned</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td>
                            {u.role === 'CENTRAL_ADMIN' ? (
                              <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>
                                Full Permissions (All Modules & Settings)
                              </span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {Array.isArray(u.company_access) && u.company_access.some((ca: any) => ca.canManageProducts) && (
                                  <span style={{ fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px' }}>Products & CBM</span>
                                )}
                                {Array.isArray(u.company_access) && u.company_access.some((ca: any) => ca.canManageOrders) && (
                                  <span style={{ fontSize: '10px', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '4px' }}>Orders & Import</span>
                                )}
                                {Array.isArray(u.company_access) && u.company_access.some((ca: any) => ca.canDispatch) && (
                                  <span style={{ fontSize: '10px', background: '#f3e8ff', color: '#6b21a8', padding: '1px 6px', borderRadius: '4px' }}>Dispatch</span>
                                )}
                                {Array.isArray(u.company_access) && u.company_access.some((ca: any) => ca.canViewReports) && (
                                  <span style={{ fontSize: '10px', background: '#e2e8f0', color: '#475569', padding: '1px 6px', borderRadius: '4px' }}>Reports</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {u.is_active ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16a34a' }}></span> Active
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#dc2626', fontWeight: 600 }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#dc2626' }}></span> Disabled
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: '11px', color: '#64748b' }}>
                            {u.last_login_at ? formatDate(u.last_login_at) : 'Never'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                className="btn-secondary"
                                style={{ height: '28px', padding: '0 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => handleOpenEditUser(u)}
                                title="Edit Role, Workspace Access & Permissions"
                              >
                                <Pencil size={12} /> Edit
                              </button>
                              {!isSelf && (
                                <button
                                  style={{
                                    height: '28px', padding: '0 8px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer',
                                    border: '1px solid',
                                    borderColor: u.is_active ? '#fecaca' : '#bbf7d0',
                                    background: u.is_active ? '#fff1f2' : '#f0fdf4',
                                    color: u.is_active ? '#b91c1c' : '#15803d',
                                    fontWeight: 600
                                  }}
                                  onClick={() => handleToggleUserStatus(u)}
                                  title={u.is_active ? 'Deactivate this login account' : 'Reactivate this login account'}
                                >
                                  {u.is_active ? 'Disable' : 'Enable'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredSortedUsers.length && (
                      <tr>
                        <td colSpan={7} className="empty-row">
                          No staff or employee accounts match the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
"""

page_companies_end = "          {page === 'companies' && (\n"
# Find where page === 'companies' ends and page === 'backups' begins
app_text = app_text.replace(
    "          {/* PAGE: AUTOMATED 6-HOURLY BACKUP SYSTEM */}\n          {page === 'backups'",
    page_users_jsx + "\n          {/* PAGE: AUTOMATED 6-HOURLY BACKUP SYSTEM */}\n          {page === 'backups'"
)

# 7. Add CREATE & EDIT USER MODALS before the final closing tag
modals_jsx = """      {/* CREATE NEW STAFF / EMPLOYEE LOGIN MODAL */}
      {showAddUserModal && (
        <div className="modal-backdrop" onClick={() => setShowAddUserModal(false)}>
          <div className="modal-box" style={{ maxWidth: '680px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} className="text-indigo-600" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Create New Staff / Employee Login</h3>
              </div>
              <button onClick={() => setShowAddUserModal(false)} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleCreateUserSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label>
                  Username (Login ID) *
                  <input
                    required
                    placeholder="e.g. rahul_pan or john_mercana"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value.toLowerCase().replace(/\\s+/g, '_') })}
                  />
                  <small style={{ color: '#64748b' }}>Lowercase, no spaces</small>
                </label>
                <label>
                  Staff Full Name *
                  <input
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={userForm.displayName}
                    onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label>
                  Login Password *
                  <input
                    required
                    type="password"
                    placeholder="Min 8 characters"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  />
                </label>
                <label>
                  Account Role *
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    <option value="STAFF">STAFF (Restricted to assigned companies)</option>
                    <option value="COMPANY_ADMIN">COMPANY_ADMIN (Admin for assigned companies)</option>
                    <option value="CENTRAL_ADMIN">CENTRAL_ADMIN (Global supervisor for all companies)</option>
                  </select>
                </label>
              </div>

              <label>
                Staff Email (Optional)
                <input
                  type="email"
                  placeholder="e.g. staff@example.com"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                />
              </label>

              {/* COMPANY ACCESS & PERMISSIONS TABLE */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <b style={{ fontSize: '13px', color: '#1e293b' }}>Company Workspace Access & Permissions</b>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Select which company workspaces this employee can access</span>
                </div>

                {userForm.role === 'CENTRAL_ADMIN' ? (
                  <div style={{ padding: '10px', background: '#e0e7ff', color: '#3730a3', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                    ⚡ CENTRAL_ADMIN has unrestricted access to all company workspaces and all operational modules.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#e2e8f0', color: '#334155', textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px' }}>Company</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Can View</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Products (CBM/Price)</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Orders & Import</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Dispatch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userForm.companyAccess.map((ca: any, idx: number) => (
                        <tr key={ca.companyId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px', fontWeight: 600 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={ca.canView}
                                onChange={(e) => {
                                  const updated = [...userForm.companyAccess];
                                  updated[idx] = { ...updated[idx], canView: e.target.checked };
                                  setUserForm({ ...userForm, companyAccess: updated });
                                }}
                              />
                              {ca.companyName} ({ca.companyCode})
                            </label>
                          </td>
                          <td style={{ textAlign: 'center', padding: '8px' }}>
                            <input
                              type="checkbox"
                              checked={ca.canView}
                              onChange={(e) => {
                                const updated = [...userForm.companyAccess];
                                updated[idx] = { ...updated[idx], canView: e.target.checked };
                                setUserForm({ ...userForm, companyAccess: updated });
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'center', padding: '8px' }}>
                            <input
                              type="checkbox"
                              disabled={!ca.canView}
                              checked={ca.canManageProducts}
                              onChange={(e) => {
                                const updated = [...userForm.companyAccess];
                                updated[idx] = { ...updated[idx], canManageProducts: e.target.checked };
                                setUserForm({ ...userForm, companyAccess: updated });
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'center', padding: '8px' }}>
                            <input
                              type="checkbox"
                              disabled={!ca.canView}
                              checked={ca.canManageOrders}
                              onChange={(e) => {
                                const updated = [...userForm.companyAccess];
                                updated[idx] = { ...updated[idx], canManageOrders: e.target.checked };
                                setUserForm({ ...userForm, companyAccess: updated });
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'center', padding: '8px' }}>
                            <input
                              type="checkbox"
                              disabled={!ca.canView}
                              checked={ca.canDispatch}
                              onChange={(e) => {
                                const updated = [...userForm.companyAccess];
                                updated[idx] = { ...updated[idx], canDispatch: e.target.checked };
                                setUserForm({ ...userForm, companyAccess: updated });
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowAddUserModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Staff Login</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT STAFF / EMPLOYEE LOGIN MODAL */}
      {editingUser && (
        <div className="modal-backdrop" onClick={() => setEditingUser(null)}>
          <div className="modal-box" style={{ maxWidth: '680px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={18} className="text-indigo-600" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Edit Staff Login: @{editingUser.username}</h3>
              </div>
              <button onClick={() => setEditingUser(null)} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleUpdateUserSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label>
                  Staff Full Name *
                  <input
                    required
                    value={userForm.displayName}
                    onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
                  />
                </label>
                <label>
                  Reset Password (leave blank to keep unchanged)
                  <input
                    type="password"
                    placeholder="Enter new password to reset"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label>
                  Account Role
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    <option value="STAFF">STAFF (Restricted to assigned companies)</option>
                    <option value="COMPANY_ADMIN">COMPANY_ADMIN (Admin for assigned companies)</option>
                    <option value="CENTRAL_ADMIN">CENTRAL_ADMIN (Global supervisor for all companies)</option>
                  </select>
                </label>
                <label>
                  Account Status
                  <select
                    value={userForm.isActive ? 'ACTIVE' : 'DISABLED'}
                    onChange={(e) => setUserForm({ ...userForm, isActive: e.target.value === 'ACTIVE' })}
                  >
                    <option value="ACTIVE">Active (Can Sign In)</option>
                    <option value="DISABLED">Disabled (Access Blocked)</option>
                  </select>
                </label>
              </div>

              <label>
                Staff Email (Optional)
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                />
              </label>

              {/* COMPANY ACCESS & PERMISSIONS TABLE */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <b style={{ fontSize: '13px', color: '#1e293b' }}>Workspace Access & Permissions</b>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Check companies this employee can view and manage</span>
                </div>

                {userForm.role === 'CENTRAL_ADMIN' ? (
                  <div style={{ padding: '10px', background: '#e0e7ff', color: '#3730a3', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                    ⚡ CENTRAL_ADMIN has unrestricted access to all company workspaces and all operational modules.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#e2e8f0', color: '#334155', textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px' }}>Company</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Can View</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Products (CBM/Price)</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Orders & Import</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Dispatch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userForm.companyAccess.map((ca: any, idx: number) => (
                        <tr key={ca.companyId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px', fontWeight: 600 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={ca.canView}
                                onChange={(e) => {
                                  const updated = [...userForm.companyAccess];
                                  updated[idx] = { ...updated[idx], canView: e.target.checked };
                                  setUserForm({ ...userForm, companyAccess: updated });
                                }}
                              />
                              {ca.companyName} ({ca.companyCode})
                            </label>
                          </td>
                          <td style={{ textAlign: 'center', padding: '8px' }}>
                            <input
                              type="checkbox"
                              checked={ca.canView}
                              onChange={(e) => {
                                const updated = [...userForm.companyAccess];
                                updated[idx] = { ...updated[idx], canView: e.target.checked };
                                setUserForm({ ...userForm, companyAccess: updated });
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'center', padding: '8px' }}>
                            <input
                              type="checkbox"
                              disabled={!ca.canView}
                              checked={ca.canManageProducts}
                              onChange={(e) => {
                                const updated = [...userForm.companyAccess];
                                updated[idx] = { ...updated[idx], canManageProducts: e.target.checked };
                                setUserForm({ ...userForm, companyAccess: updated });
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'center', padding: '8px' }}>
                            <input
                              type="checkbox"
                              disabled={!ca.canView}
                              checked={ca.canManageOrders}
                              onChange={(e) => {
                                const updated = [...userForm.companyAccess];
                                updated[idx] = { ...updated[idx], canManageOrders: e.target.checked };
                                setUserForm({ ...userForm, companyAccess: updated });
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'center', padding: '8px' }}>
                            <input
                              type="checkbox"
                              disabled={!ca.canView}
                              checked={ca.canDispatch}
                              onChange={(e) => {
                                const updated = [...userForm.companyAccess];
                                updated[idx] = { ...updated[idx], canDispatch: e.target.checked };
                                setUserForm({ ...userForm, companyAccess: updated });
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingUser(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
"""

# Insert before closing `    </div>\n  );`
app_text = app_text.replace(
    "      {/* EDIT PRODUCT MODAL (ADMIN ONLY) */}",
    modals_jsx + "\n      {/* EDIT PRODUCT MODAL (ADMIN ONLY) */}"
)

with open(app_file, 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(app_text)
print("Updated client/src/App.tsx with Staff / User Management!")
