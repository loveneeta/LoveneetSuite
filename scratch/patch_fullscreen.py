app_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add Maximize2 and Minimize2 to imports
if 'Maximize2' not in code:
    code = code.replace("  Download,\n", "  Download,\n  Maximize2,\n  Minimize2,\n", 1)

# 2. Add matrixFullscreen state
target_state = "  const [editingOrder, setEditingOrder] = useState<any | null>(null);"
replacement_state = target_state + "\n  const [matrixFullscreen, setMatrixFullscreen] = useState<boolean>(false);"
code = code.replace(target_state, replacement_state, 1)

# 3. Update Escape key listener to close matrixFullscreen
target_esc = "      if (e.key === 'Escape') {"
replacement_esc = '''      if (e.key === 'Escape') {
        setMatrixFullscreen(false);'''
code = code.replace(target_esc, replacement_esc, 1)

# 4. Add Fullscreen button to Matrix actions bar
old_actions_bar = '''                <div className="actions-bar" style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-excel" onClick={exportMatrixToExcel} title="Download Matrix as Excel (.xlsx)">
                    <Download size={15} /> Download Excel
                  </button>'''

new_actions_bar = '''                <div className="actions-bar" style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="btn-secondary"
                    style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => setMatrixFullscreen(true)}
                    title="Enter Fullscreen Mode (Press ESC to exit)"
                  >
                    <Maximize2 size={15} /> Fullscreen
                  </button>
                  <button className="btn-excel" onClick={exportMatrixToExcel} title="Download Matrix as Excel (.xlsx)">
                    <Download size={15} /> Download Excel
                  </button>'''

code = code.replace(old_actions_bar, new_actions_bar, 1)

# 5. Also add Fullscreen button into matrix-toolbar-row navigation buttons
old_toolbar_end = '''                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ height: '32px', padding: '0 10px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                    onClick={() => {
                      if (tableContainerRef.current) {
                        tableContainerRef.current.scrollTo({ left: tableContainerRef.current.scrollWidth, behavior: 'smooth' });
                      }
                    }}
                    title="Jump to Last Column (End)"
                  >
                    End &raquo;
                  </button>
                </div>'''

new_toolbar_end = '''                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ height: '32px', padding: '0 10px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                    onClick={() => {
                      if (tableContainerRef.current) {
                        tableContainerRef.current.scrollTo({ left: tableContainerRef.current.scrollWidth, behavior: 'smooth' });
                      }
                    }}
                    title="Jump to Last Column (End)"
                  >
                    End &raquo;
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ height: '32px', padding: '0 10px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', borderColor: '#4338ca', color: '#4338ca' }}
                    onClick={() => setMatrixFullscreen(true)}
                    title="View whole table on Fullscreen (Esc to exit)"
                  >
                    <Maximize2 size={14} /> Fullscreen
                  </button>
                </div>'''

code = code.replace(old_toolbar_end, new_toolbar_end, 1)

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(code)

print('Updated App.tsx with fullscreen buttons and ESC handler')
