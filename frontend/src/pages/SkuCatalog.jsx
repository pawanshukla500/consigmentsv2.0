import React, { useState, useEffect, useCallback } from 'react';
import { Boxes, Plus, Search, Trash2, Loader2, Upload, X, Pencil, CheckCircle2, Download } from 'lucide-react';
import { skuCatalogAPI } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import ConfirmModal from '../components/ConfirmModal';

export default function SkuCatalog() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ barcode: '', marketplaceSku: '', internalSku: '', name: '' });
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const debounced = useDebounce(search, 350);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await skuCatalogAPI.getAll({ search: debounced || undefined });
      setItems(res.data.items || []);
    } catch { addToast('Failed to load catalog', 'error'); }
    setLoading(false);
  }, [debounced, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => { setEditId(null); setForm({ barcode: '', marketplaceSku: '', internalSku: '', name: '' }); setShowForm(true); };
  const openEdit = (i) => { setEditId(i.id); setForm({ barcode: i.barcode || '', marketplaceSku: i.marketplaceSku || '', internalSku: i.internalSku || '', name: i.name || '' }); setShowForm(true); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) { await skuCatalogAPI.update(editId, form); addToast('SKU updated', 'success'); }
      else { await skuCatalogAPI.create(form); addToast('SKU added to catalog', 'success'); }
      setShowForm(false); fetchData();
    } catch (err) { addToast(err.response?.data?.error || 'Save failed', 'error'); }
    setSaving(false);
  };

  const doDelete = async () => {
    if (!deleteItem) return;
    try { await skuCatalogAPI.delete(deleteItem.id); addToast('Deleted', 'success'); setDeleteItem(null); fetchData(); }
    catch { addToast('Delete failed', 'error'); setDeleteItem(null); }
  };

  const handleCsv = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const lines = ev.target.result.trim().split(/\r?\n/);
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
        const iBar = headers.findIndex(h => h.includes('barcode'));
        const iMp = headers.findIndex(h => h.includes('marketplace'));
        const iInt = headers.findIndex(h => h.includes('internal'));
        const iName = headers.findIndex(h => h.includes('name'));
        const parsed = [];
        for (let i = 1; i < lines.length; i++) {
          const c = lines[i].split(',').map(x => x.trim().replace(/^"|"$/g, ''));
          if (!c[0]) continue;
          parsed.push({
            barcode: iBar >= 0 ? c[iBar] : c[0],
            marketplaceSku: iMp >= 0 ? c[iMp] : c[0],
            internalSku: iInt >= 0 ? c[iInt] : (c[1] || ''),
            name: iName >= 0 ? c[iName] : ''
          });
        }
        if (!parsed.length) { addToast('No rows found', 'warning'); return; }
        const res = await skuCatalogAPI.bulk(parsed);
        addToast(`Imported: ${res.data.added} added, ${res.data.updated} updated`, 'success');
        fetchData();
      } catch (err) { addToast('Import failed: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportCsv = () => {
    const headers = ['barcode', 'marketplaceSku', 'internalSku', 'name'];
    const rows = items.map(i => [i.barcode, i.marketplaceSku, i.internalSku, i.name]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'sku_catalog.csv'; a.click();
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">SKU Catalog</h1>
          <p className="text-slate-500 mt-1 text-sm">Reusable master list of all SKUs — auto-fills when creating consignments</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50"><Download className="w-4 h-4" />Export</button>
          <label className="flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"><Upload className="w-4 h-4" />Import CSV<input type="file" accept=".csv" className="hidden" onChange={handleCsv} /></label>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"><Plus className="w-4 h-4" />Add SKU</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by barcode, marketplace SKU, internal SKU, or name..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Barcode</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Marketplace SKU</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Internal SKU (OMS)</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? <tr><td colSpan="5" className="py-12 text-center"><Loader2 className="w-7 h-7 animate-spin mx-auto text-primary-600" /></td></tr>
              : items.length ? items.map(i => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{i.barcode || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">{i.marketplaceSku || '—'}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{i.internalSku || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{i.name || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => openEdit(i)} className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                    {isAdmin && <button onClick={() => setDeleteItem(i)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>}
                  </td>
                </tr>
              )) : <tr><td colSpan="5" className="py-12 text-center text-slate-400"><Boxes className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p>No SKUs in catalog yet. Add one or create a consignment — SKUs auto-save here.</p></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-pop-in">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{editId ? 'Edit SKU' : 'Add SKU to Catalog'}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Barcode (scanned)</label><input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} className="inp font-mono" placeholder="Scan/enter barcode" /></div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Marketplace SKU</label><input value={form.marketplaceSku} onChange={e => setForm({ ...form, marketplaceSku: e.target.value })} className="inp" placeholder="e.g., B08N5WRWNW" /></div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Internal SKU (OMS) <span className="text-red-500">*</span></label><input required value={form.internalSku} onChange={e => setForm({ ...form, internalSku: e.target.value })} className="inp" placeholder="e.g., TSHIRT-BLK-M" /></div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Name / Description</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="inp" placeholder="Optional" /></div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 text-sm">Cancel</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}{editId ? 'Save' : 'Add'}</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal show={!!deleteItem} title="Delete SKU?" message={<span>Remove <strong>{deleteItem?.internalSku}</strong> from the catalog? This does not affect existing consignments.</span>} confirmLabel="Delete" onConfirm={doDelete} onCancel={() => setDeleteItem(null)} />
    </div>
  );
}
