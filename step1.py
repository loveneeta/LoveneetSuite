import sys

path = r'E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\client\src\App.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update lucide-react imports
old_import = "  Image as ImageIcon\n} from 'lucide-react';"
new_import = """  Image as ImageIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  SlidersHorizontal
} from 'lucide-react';"""
assert old_import in content, "old_import not found"
content = content.replace(old_import, new_import, 1)

# 2. Add Sort helpers and SortTh component before "export default function App()"
helper_code = """
type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  key: string;
  dir: SortDirection;
}

function parseDateForSort(val: any): number {
  if (!val) return 0;
  if (val instanceof Date) return val.getTime();
  const s = String(val).trim();
  const ddmmyyyy = s.match(/^(\\d{2})-(\\d{2})-(\\d{4})$/);
  if (ddmmyyyy) {
    const t = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`).getTime();
    return isNaN(t) ? 0 : t;
  }
  const t = new Date(s).getTime();
  return isNaN(t) ? 0 : t;
}

function parseNumberForSort(val: any): number {
  if (val == null || val === '' || val === '—' || val === '-') return -999999999;
  const n = Number(val);
  return isNaN(n) ? -999999999 : n;
}

function toggleSort(setSort: React.Dispatch<React.SetStateAction<SortState>>) {
  return (key: string) => {
    setSort((prev) => {
      if (prev.key !== key) {
        return { key, dir: 'asc' };
      }
      if (prev.dir === 'asc') {
        return { key, dir: 'desc' };
      }
      return { key: '', dir: null };
    });
  };
}

function SortTh({
  label,
  sortKey,
  currentSort,
  onSort,
  className = '',
  style = {},
  align = 'left'
}: {
  label: React.ReactNode;
  sortKey: string;
  currentSort: SortState;
  onSort: (key: string) => void;
  className?: string;
  style?: React.CSSProperties;
  align?: 'left' | 'center' | 'right';
}) {
  const isSorted = currentSort.key === sortKey && currentSort.dir !== null;
  const dir = isSorted ? currentSort.dir : null;

  return (
    <th
      className={`${className} sortable-th`}
      style={{
        ...style,
        textAlign: align,
        cursor: 'pointer',
        userSelect: 'none'
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSort(sortKey);
      }}
      title={`Click to sort by ${typeof label === 'string' ? label : sortKey} (${dir === 'asc' ? 'Click for Descending' : dir === 'desc' ? 'Click to Clear' : 'Click for Ascending'})`}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
          width: '100%'
        }}
      >
        <span style={{ fontWeight: isSorted ? 700 : undefined, color: isSorted ? '#312e81' : undefined }}>
          {label}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            opacity: isSorted ? 1 : 0.35,
            color: isSorted ? '#4f46e5' : '#94a3b8',
            transition: 'opacity 0.15s ease'
          }}
        >
          {dir === 'asc' ? (
            <ArrowUp size={13} strokeWidth={2.6} />
          ) : dir === 'desc' ? (
            <ArrowDown size={13} strokeWidth={2.6} />
          ) : (
            <ArrowUpDown size={12} strokeWidth={1.7} />
          )}
        </span>
      </div>
    </th>
  );
}
"""

app_decl = "export default function App() {"
assert app_decl in content, "export default function App() not found"
content = content.replace(app_decl, helper_code + "\n" + app_decl, 1)

# 3. Add states for table filtering & sorting
old_states = """  // Search filter
  const [search, setSearch] = useState('');
  const [productStatusFilter, setProductStatusFilter] = useState<'ALL' | 'ON' | 'OFF'>('ALL');"""

new_states = """  // Product Master Filter & Sort
  const [search, setSearch] = useState('');
  const [productStatusFilter, setProductStatusFilter] = useState<'ALL' | 'ON' | 'OFF'>('ALL');
  const [prodFinishFilter, setProdFinishFilter] = useState('ALL');
  const [prodSort, setProdSort] = useState<SortState>({ key: '', dir: null });
  const handleProdSort = toggleSort(setProdSort);

  // Matrix Filter & Sort
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixStockFilter, setMatrixStockFilter] = useState<'ALL' | 'IN_STOCK' | 'ZERO_STOCK'>('ALL');
  const [matrixFinishFilter, setMatrixFinishFilter] = useState('ALL');
  const [matrixSort, setMatrixSort] = useState<SortState>({ key: '', dir: null });
  const handleMatrixSort = toggleSort(setMatrixSort);

  // Sales Orders Filter & Sort
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [orderStockFilter, setOrderStockFilter] = useState<'ALL' | 'IN_STOCK' | 'ZERO_STOCK'>('ALL');
  const [orderSort, setOrderSort] = useState<SortState>({ key: '', dir: null });
  const handleOrderSort = toggleSort(setOrderSort);

  // Dispatch Filter & Sort
  const [dispatchSearch, setDispatchSearch] = useState('');
  const [dispatchStatusFilter, setDispatchStatusFilter] = useState('ALL');
  const [dispatchSort, setDispatchSort] = useState<SortState>({ key: '', dir: null });
  const handleDispatchSort = toggleSort(setDispatchSort);

  // Central Dashboard Filter & Sort
  const [centralSearch, setCentralSearch] = useState('');
  const [centralSort, setCentralSort] = useState<SortState>({ key: '', dir: null });
  const handleCentralSort = toggleSort(setCentralSort);

  // Audit Trail Filter & Sort
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [auditEntityFilter, setAuditEntityFilter] = useState('ALL');
  const [auditSort, setAuditSort] = useState<SortState>({ key: '', dir: null });
  const handleAuditSort = toggleSort(setAuditSort);"""

assert old_states in content, "old_states not found"
content = content.replace(old_states, new_states, 1)

# 4. Replace filteredProducts logic with comprehensive useMemo filters
old_filters_target = """  // Filter items that exist in the selected From SO
    // Instant client-side product filter
  const filteredProducts = products.filter((p) => {
    if (productStatusFilter === 'ON' && !p.is_active) return false;
    if (productStatusFilter === 'OFF' && p.is_active) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      (p.item_code && p.item_code.toLowerCase().includes(q)) ||
      (p.buyer_code && p.buyer_code.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.finish && p.finish.toLowerCase().includes(q))
    );
  });"""

new_filters = """  // Dynamically collected unique finishes for Matrix and Product Master
  const matrixFinishes = Array.from(
    new Set(matrixData.products.map((p) => p.finish).filter(Boolean))
  ).sort();

  const productFinishes = Array.from(
    new Set(products.map((p) => p.finish).filter(Boolean))
  ).sort();

  // 1. FILTERED & SORTED MATRIX PRODUCTS
  const filteredSortedMatrixProducts = React.useMemo(() => {
    let list = [...matrixData.products];
    if (matrixStockFilter === 'IN_STOCK') {
      list = list.filter((p) => (p.totalAvailableStock || 0) > 0);
    } else if (matrixStockFilter === 'ZERO_STOCK') {
      list = list.filter((p) => !p.totalAvailableStock || p.totalAvailableStock === 0);
    }
    if (matrixFinishFilter !== 'ALL') {
      list = list.filter((p) => (p.finish || '').toLowerCase() === matrixFinishFilter.toLowerCase());
    }
    if (matrixSearch.trim()) {
      const q = matrixSearch.toLowerCase().trim();
      list = list.filter(
        (p) =>
          (p.item_code && p.item_code.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.finish && p.finish.toLowerCase().includes(q))
      );
    }
    if (matrixSort.key && matrixSort.dir) {
      const k = matrixSort.key;
      list.sort((a, b) => {
        let res = 0;
        if (k === 'item_code' || k === 'description' || k === 'finish') {
          res = String(a[k] || '').localeCompare(String(b[k] || ''), undefined, { numeric: true });
        } else if (k === 'master_cbm') {
          res = parseNumberForSort(a.master_cbm) - parseNumberForSort(b.master_cbm);
        } else if (k === 'totalAvailableStock') {
          res = parseNumberForSort(a.totalAvailableStock) - parseNumberForSort(b.totalAvailableStock);
        } else {
          // Specific Sales Order column balance sort
          const stockA = a.soBalances?.[k] ?? 0;
          const stockB = b.soBalances?.[k] ?? 0;
          res = stockA - stockB;
        }
        return matrixSort.dir === 'desc' ? -res : res;
      });
    }
    return list;
  }, [matrixData.products, matrixStockFilter, matrixFinishFilter, matrixSearch, matrixSort]);

  // 2. FILTERED & SORTED PRODUCT MASTER
  const filteredProducts = React.useMemo(() => {
    let list = [...products];
    if (productStatusFilter === 'ON') list = list.filter((p) => p.is_active !== false);
    if (productStatusFilter === 'OFF') list = list.filter((p) => p.is_active === false);
    if (prodFinishFilter !== 'ALL') {
      list = list.filter((p) => (p.finish || '').toLowerCase() === prodFinishFilter.toLowerCase());
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          (p.item_code && p.item_code.toLowerCase().includes(q)) ||
          (p.buyer_code && p.buyer_code.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.finish && p.finish.toLowerCase().includes(q))
      );
    }
    if (prodSort.key && prodSort.dir) {
      const k = prodSort.key;
      list.sort((a, b) => {
        let res = 0;
        if (k === 'item_code' || k === 'buyer_code' || k === 'description' || k === 'finish') {
          res = String(a[k] || '').localeCompare(String(b[k] || ''), undefined, { numeric: true });
        } else if (k === 'master_cbm') {
          res = parseNumberForSort(a.master_cbm) - parseNumberForSort(b.master_cbm);
        } else if (k === 'weight_value') {
          res = parseNumberForSort(a.weight_value) - parseNumberForSort(b.weight_value);
        } else if (k === 'box1_length') {
          res = parseNumberForSort(a.box1_length) - parseNumberForSort(b.box1_length);
        } else if (k === 'is_active') {
          const activeA = a.is_active !== false ? 1 : 0;
          const activeB = b.is_active !== false ? 1 : 0;
          res = activeA - activeB;
        }
        return prodSort.dir === 'desc' ? -res : res;
      });
    }
    return list;
  }, [products, productStatusFilter, prodFinishFilter, search, prodSort]);

  // 3. FILTERED & SORTED SALES ORDERS
  const filteredSortedOrders = React.useMemo(() => {
    let list = [...orders];
    if (orderStatusFilter !== 'ALL') {
      list = list.filter((o) => o.status === orderStatusFilter);
    }
    if (orderStockFilter === 'IN_STOCK') {
      list = list.filter((o) => Number(o.total_available_qty || 0) > 0);
    } else if (orderStockFilter === 'ZERO_STOCK') {
      list = list.filter((o) => Number(o.total_available_qty || 0) === 0);
    }
    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase().trim();
      list = list.filter(
        (o) =>
          (o.so_number && o.so_number.toLowerCase().includes(q)) ||
          (o.buyer_order_no && o.buyer_order_no.toLowerCase().includes(q)) ||
          (o.customer_name_snapshot && o.customer_name_snapshot.toLowerCase().includes(q))
      );
    }
    if (orderSort.key && orderSort.dir) {
      const k = orderSort.key;
      list.sort((a, b) => {
        let res = 0;
        if (k === 'so_number' || k === 'buyer_order_no' || k === 'customer_name_snapshot' || k === 'status') {
          res = String(a[k] || '').localeCompare(String(b[k] || ''), undefined, { numeric: true });
        } else if (k === 'ex_fac_date') {
          res = parseDateForSort(a.ex_fac_date) - parseDateForSort(b.ex_fac_date);
        } else if (['line_count', 'total_ordered_qty', 'total_dispatched_qty', 'total_available_qty'].includes(k)) {
          res = parseNumberForSort(a[k]) - parseNumberForSort(b[k]);
        }
        return orderSort.dir === 'desc' ? -res : res;
      });
    }
    return list;
  }, [orders, orderStatusFilter, orderStockFilter, orderSearch, orderSort]);

  // 4. FILTERED & SORTED DISPATCHES
  const filteredSortedDispatches = React.useMemo(() => {
    let list = [...dispatches];
    if (dispatchStatusFilter !== 'ALL') {
      list = list.filter((d) => d.status === dispatchStatusFilter);
    }
    if (dispatchSearch.trim()) {
      const q = dispatchSearch.toLowerCase().trim();
      list = list.filter(
        (d) =>
          (d.dispatch_no && d.dispatch_no.toLowerCase().includes(q)) ||
          (d.notes && d.notes.toLowerCase().includes(q)) ||
          (d.creator_name && d.creator_name.toLowerCase().includes(q))
      );
    }
    if (dispatchSort.key && dispatchSort.dir) {
      const k = dispatchSort.key;
      list.sort((a, b) => {
        let res = 0;
        if (k === 'dispatch_no' || k === 'status' || k === 'notes' || k === 'creator_name') {
          res = String(a[k] || '').localeCompare(String(b[k] || ''), undefined, { numeric: true });
        } else if (k === 'dispatch_date') {
          res = parseDateForSort(a.dispatch_date) - parseDateForSort(b.dispatch_date);
        } else if (k === 'line_count' || k === 'total_quantity') {
          res = parseNumberForSort(a[k]) - parseNumberForSort(b[k]);
        }
        return dispatchSort.dir === 'desc' ? -res : res;
      });
    }
    return list;
  }, [dispatches, dispatchStatusFilter, dispatchSearch, dispatchSort]);

  // 5. FILTERED & SORTED CENTRAL COMPANIES
  const filteredSortedCompanies = React.useMemo(() => {
    if (!consolidatedSummary?.companies) return [];
    let list = [...consolidatedSummary.companies];
    if (centralSearch.trim()) {
      const q = centralSearch.toLowerCase().trim();
      list = list.filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.code && c.code.toLowerCase().includes(q)) ||
          (c.business_type && c.business_type.toLowerCase().includes(q))
      );
    }
    if (centralSort.key && centralSort.dir) {
      const k = centralSort.key;
      list.sort((a, b) => {
        let res = 0;
        if (k === 'name' || k === 'code' || k === 'business_type') {
          res = String(a[k] || '').localeCompare(String(b[k] || ''), undefined, { numeric: true });
        } else {
          res = parseNumberForSort(a[k]) - parseNumberForSort(b[k]);
        }
        return centralSort.dir === 'desc' ? -res : res;
      });
    }
    return list;
  }, [consolidatedSummary?.companies, centralSearch, centralSort]);

  // 6. FILTERED & SORTED AUDIT LOGS
  const auditActions = Array.from(
    new Set(auditLogs.map((a) => a.action).filter(Boolean))
  ).sort();
  const auditEntities = Array.from(
    new Set(auditLogs.map((a) => a.entity_type).filter(Boolean))
  ).sort();

  const filteredSortedAudits = React.useMemo(() => {
    let list = [...auditLogs];
    if (auditActionFilter !== 'ALL') {
      list = list.filter((a) => a.action === auditActionFilter);
    }
    if (auditEntityFilter !== 'ALL') {
      list = list.filter((a) => a.entity_type === auditEntityFilter);
    }
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase().trim();
      list = list.filter(
        (a) =>
          (a.username && a.username.toLowerCase().includes(q)) ||
          (a.entity_type && a.entity_type.toLowerCase().includes(q)) ||
          (a.entity_id && a.entity_id.toLowerCase().includes(q)) ||
          (a.action && a.action.toLowerCase().includes(q)) ||
          String(a.id).includes(q)
      );
    }
    if (auditSort.key && auditSort.dir) {
      const k = auditSort.key;
      list.sort((a, b) => {
        let res = 0;
        if (k === 'id') {
          res = parseNumberForSort(a.id) - parseNumberForSort(b.id);
        } else if (k === 'created_at') {
          res = parseDateForSort(a.created_at) - parseDateForSort(b.created_at);
        } else {
          res = String(a[k] || '').localeCompare(String(b[k] || ''), undefined, { numeric: true });
        }
        return auditSort.dir === 'desc' ? -res : res;
      });
    }
    return list;
  }, [auditLogs, auditActionFilter, auditEntityFilter, auditSearch, auditSort]);"""

assert old_filters_target in content, "old_filters_target not found"
content = content.replace(old_filters_target, new_filters, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Step 1 (imports, helpers, states, useMemos) applied successfully!")
