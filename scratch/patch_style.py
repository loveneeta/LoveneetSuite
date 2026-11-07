css_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# Make sure .content-container does NOT have overflow-x: auto (so it never scrolls horizontally)
css = css.replace(
'''/* Outer scroll container allows horizontal passage if needed */
.content-scroll,
.content-container {
  overflow-x: auto !important;
  overflow-y: auto !important;
}''',
'''/* Outer container strictly handles page vertical flow, no horizontal drift */
.content-scroll,
.content-container {
  overflow-x: hidden !important;
  overflow-y: auto !important;
}'''
)

# Enhance .matrix-scroll-container with permanent, visible horizontal scrollbar
old_msc = '''.matrix-scroll-container {
  width: 100% !important;
  max-width: 100% !important;
  max-height: calc(100vh - 300px) !important;
  min-height: 440px !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
  border-radius: 10px !important;
  border: 1px solid #cbd5e1 !important;
  background: #ffffff !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05) !important;
  position: relative !important;
  scroll-behavior: smooth !important;
}'''

new_msc = '''.matrix-scroll-container {
  width: 100% !important;
  max-width: 100% !important;
  max-height: calc(100vh - 275px) !important;
  min-height: 480px !important;
  overflow-x: scroll !important; /* ALWAYS show horizontal scrollbar track */
  overflow-y: auto !important;
  border-radius: 10px !important;
  border: 1px solid #cbd5e1 !important;
  background: #ffffff !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06) !important;
  position: relative !important;
  scroll-behavior: smooth !important;
  scrollbar-gutter: stable both-edges !important;
}'''

if old_msc in css:
    css = css.replace(old_msc, new_msc, 1)
    print('Updated .matrix-scroll-container')
else:
    print('old_msc not found')

# Enhance scrollbar thumb styling
old_thumb = '''.matrix-scroll-container::-webkit-scrollbar {
  width: 12px !important;
  height: 12px !important;
}

.matrix-scroll-container::-webkit-scrollbar-track {
  background: #e2e8f0 !important;
  border-radius: 6px !important;
}

.matrix-scroll-container::-webkit-scrollbar-thumb {
  background: #475569 !important;
  border-radius: 6px !important;
  border: 2px solid #e2e8f0 !important;
}

.matrix-scroll-container::-webkit-scrollbar-thumb:hover {
  background: #1e293b !important;
}'''

new_thumb = '''.matrix-scroll-container::-webkit-scrollbar {
  width: 14px !important;
  height: 14px !important;
}

.matrix-scroll-container::-webkit-scrollbar-track {
  background: #f1f5f9 !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 8px !important;
}

.matrix-scroll-container::-webkit-scrollbar-thumb {
  background: #1e293b !important; /* High-contrast dark slate */
  border-radius: 8px !important;
  border: 3px solid #f1f5f9 !important;
}

.matrix-scroll-container::-webkit-scrollbar-thumb:hover {
  background: #0284c7 !important; /* Vibrant blue hover */
}'''

if old_thumb in css:
    css = css.replace(old_thumb, new_thumb, 1)
    print('Updated scrollbar styling')
else:
    print('old_thumb not found')

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)
print('style.css updated successfully')
