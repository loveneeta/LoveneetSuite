import re

app_path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add Edit/Pencil icon to imports
if 'Pencil,' not in code and 'Edit,' not in code:
    code = code.replace("  Download,\n", "  Download,\n  Pencil,\n  Edit,\n", 1)
    print('Added Pencil/Edit icon imports')

# 2. Add state for edit modals in App()
old_states = "  const [showAddCompany, setShowAddCompany] = useState(false);"
new_states = '''  const [showAddCompany, setShowAddCompany] = useState(false);

  // EDIT PRODUCT MODAL STATE
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [editProdForm, setEditProdForm] = useState<any>({
    itemCode: '',
    buyerCode: '',
    description: '',
    finish: '',
    box1Length: '', box1Width: '', box1Height: '',
    box2Length: '', box2Width: '', box2Height: '',
    box3Length: '', box3Width: '', box3Height: '',
    cartonsCount: 1,
    masterCbm: '',
    weightValue: '',
    imageBase64: '',
    imageFilename: ''
  });
  const [editProdImagePreview, setEditProdImagePreview] = useState<string>('');

  // EDIT SALES ORDER MODAL STATE
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [editOrderForm, setEditOrderForm] = useState<any>({
    buyerOrderNo: '',
    customerName: '',
    exFacDate: '',
    status: 'OPEN'
  });'''

if old_states in code:
    code = code.replace(old_states, new_states, 1)
    print('Added edit modal states')
else:
    print('old_states not found')

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(code)

print('Step 1 complete')
