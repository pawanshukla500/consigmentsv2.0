import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Boxes, Package, Clock, TrendingUp, Activity,
  User, Calendar, Download, RefreshCw, CheckCircle2, AlertCircle,
  FileSpreadsheet, ChevronDown
} from 'lucide-react';
import { productivityAPI, consignmentsAPI } from '../services/api';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

// ── Quick date presets ────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Today',       getRange: () => { const d = format(new Date(), 'yyyy-MM-dd'); return { start: d, end: d }; } },
  { label: 'Yesterday',   getRange: () => { const d = format(subDays(new Date(), 1), 'yyyy-MM-dd'); return { start: d, end: d }; } },
  { label: 'This Week',   getRange: () => ({ start: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), end: format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd') }) },
  { label: 'Last 7 Days', getRange: () => ({ start: format(subDays(new Date(), 6), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'This Month',  getRange: () => ({ start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), end: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
];

const actionColor = (action) => ({
  create: 'bg-emerald-100 text-emerald-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  pack: 'bg-purple-100 text-purple-800',
  save_box: 'bg-amber-100 text-amber-800',
  upload: 'bg-cyan-100 text-cyan-800',
  login: 'bg-indigo-100 text-indigo-800',
  finish: 'bg-emerald-100 text-emerald-800',
}[action] || 'bg-slate-100 text-slate-800');

const Productivity = () => {
  const [stats,       setStats]       = useState(null);
  const [auditLogs,   setAuditLogs]   = useState([]);
  const [consignments,setConsignments]= useState([]);
  const [loading,     setLoading]     = useState(true);
  const [activePreset,setActivePreset]= useState('Today');
  const [dateRange,   setDateRange]   = useState(PRESETS[0].getRange());
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (range) => {
    try {
      setLoading(true);
      const r = range || dateRange;
      const [prodRes, auditRes, conRes] = await Promise.all([
        productivityAPI.getStats({ startDate: r.start, endDate: r.end }),
        productivityAPI.getAuditLogs({ limit: 100 }),
        consignmentsAPI.getAll({ limit: 200 })
      ]);
      setStats(prodRes.data);
      setAuditLogs(auditRes.data.logs || []);
      setConsignments(conRes.data.consignments || []);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Productivity fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchData(); }, []);

  const applyPreset = (preset) => {
    const r = preset.getRange();
    setActivePreset(preset.label);
    setDateRange(r);
    fetchData(r);
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const completedToday = consignments.filter(c =>
    c.status === 'completed' &&
    c.updatedAt && new Date(c.updatedAt).toDateString() === new Date().toDateString()
  ).length;

  const inProgress = consignments.filter(c => c.status === 'in_progress').length;
  const pending    = consignments.filter(c => c.status === 'pending').length;

  // Per-consignment packing summary (from productivity records)
  const byConsignment = {};
  (stats?.recentActivity || []).filter(r => r.eventType === 'box_saved').forEach(r => {
    if (!byConsignment[r.consignmentId]) byConsignment[r.consignmentId] = { boxes: 0, items: 0 };
    byConsignment[r.consignmentId].boxes++;
    byConsignment[r.consignmentId].items += r.itemsCount || 0;
  });
  const conRows = Object.entries(byConsignment)
    .sort((a, b) => b[1].boxes - a[1].boxes)
    .slice(0, 15);

  // ── Export CSV ────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const headers = ['Consignment ID', 'Internal Shipment No', 'Status', 'Ship Status',
      'Total Required', 'Total Packed', 'Boxes', 'Progress %'];
    const rows = consignments.map(c => {
      const pct = c.totalRequiredQty > 0 ? Math.round((c.totalPackedQty / c.totalRequiredQty) * 100) : 0;
      return [c.id, c.internalShipmentNo || '', c.status || '', c.shipmentStatus || '',
        c.totalRequiredQty || 0, c.totalPackedQty || 0, c.boxIds?.length || 0, pct + '%'];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a   = document.createElement('a');
    a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download= `productivity_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const exportAuditCsv = () => {
    const headers = ['Timestamp', 'Action', 'Entity Type', 'Entity ID', 'User'];
    const rows    = auditLogs.map(l => [
      format(new Date(l.timestamp), 'dd/MM/yyyy HH:mm:ss'),
      l.action, l.entityType, l.entityId, l.userId
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a   = document.createElement('a');
    a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download= `audit_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Productivity & Reports</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Last refreshed: {format(lastRefresh, 'h:mm:ss a')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchData()} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
            <Download className="w-4 h-4" /> Export Report
          </button>
        </div>
      </div>

      {/* Date preset tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activePreset === p.label
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {p.label}
            </button>
          ))}
          <div className="h-5 w-px bg-slate-200 mx-1" />
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={dateRange.start}
              onChange={e => setDateRange(r => ({ ...r, start: e.target.value }))}
              className="px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
            <span className="text-slate-400">→</span>
            <input type="date" value={dateRange.end}
              onChange={e => setDateRange(r => ({ ...r, end: e.target.value }))}
              className="px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
            <button onClick={() => { setActivePreset('Custom'); fetchData(); }}
              className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-6">
        {[
          { icon: Boxes,        color: 'primary', label: 'Boxes Today',      value: stats?.today?.boxes ?? '—' },
          { icon: Package,      color: 'blue',    label: 'Items Today',       value: stats?.today?.items ?? '—' },
          { icon: TrendingUp,   color: 'purple',  label: 'Avg Items/Box',     value: stats?.summary?.avgItemsPerBox ?? '—' },
          { icon: Clock,        color: 'amber',   label: 'Avg Time/Box',      value: stats?.summary?.avgTimePerBoxSeconds ? `${stats.summary.avgTimePerBoxSeconds}s` : '—' },
          { icon: CheckCircle2, color: 'emerald', label: 'Completed Today',   value: completedToday },
          { icon: Activity,     color: 'orange',  label: 'In Progress',       value: inProgress },
          { icon: AlertCircle,  color: 'red',     label: 'Pending',           value: pending },
        ].map(({ icon: Icon, color, label, value }) => (
          <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 bg-${color}-100`}>
              <Icon className={`w-4 h-4 text-${color}-600`} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{loading ? '…' : value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Consignment Status Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Per-shipment packing in selected period */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary-600" /> Packing Activity — {activePreset}
            </h2>
            <span className="text-xs text-slate-400">{conRows.length} consignments</span>
          </div>
          <div className="overflow-x-auto">
            {conRows.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-slate-500 font-semibold uppercase">Consignment</th>
                    <th className="text-center px-3 py-2 text-slate-500 font-semibold uppercase">Boxes Saved</th>
                    <th className="text-center px-3 py-2 text-slate-500 font-semibold uppercase">Items Packed</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase">Bar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {conRows.map(([cid, data]) => {
                    const maxItems = Math.max(...conRows.map(([, d]) => d.items), 1);
                    return (
                      <tr key={cid} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono font-medium text-slate-700">{cid}</td>
                        <td className="px-3 py-2 text-center font-bold text-primary-600">{data.boxes}</td>
                        <td className="px-3 py-2 text-center font-bold text-emerald-600">{data.items}</td>
                        <td className="px-3 py-2 w-32">
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div className="bg-primary-500 h-1.5 rounded-full"
                              style={{ width: `${Math.round(data.items / maxItems * 100)}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="py-10 text-center text-slate-400 text-sm">No packing activity in this period</div>
            )}
          </div>
        </div>

        {/* Consignment status breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Status Snapshot</h2>
            <span className="text-xs text-slate-400">{consignments.length} total</span>
          </div>
          <div className="p-4 space-y-3">
            {[
              { label: 'Completed',   key: 'completed',   color: 'emerald' },
              { label: 'In Progress', key: 'in_progress', color: 'blue' },
              { label: 'Pending',     key: 'pending',     color: 'amber' },
            ].map(({ label, key, color }) => {
              const count = consignments.filter(c => c.status === key).length;
              const pct   = consignments.length > 0 ? Math.round(count / consignments.length * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">{label}</span>
                    <span className={`font-bold text-${color}-600`}>{count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className={`bg-${color}-500 h-2 rounded-full transition-all`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Total Required</span>
                <span className="font-semibold text-slate-700">
                  {consignments.reduce((s, c) => s + (c.totalRequiredQty || 0), 0).toLocaleString()} units
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Packed</span>
                <span className="font-semibold text-emerald-700">
                  {consignments.reduce((s, c) => s + (c.totalPackedQty || 0), 0).toLocaleString()} units
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* All Consignments Summary Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-primary-600" /> All Consignments Summary
          </h2>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0 z-[1]">
              <tr>
                <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase whitespace-nowrap">Internal Shipment No</th>
                <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase whitespace-nowrap">Pack Status</th>
                <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase whitespace-nowrap">Ship Status</th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase whitespace-nowrap">Required</th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase whitespace-nowrap">Packed</th>
                <th className="text-right px-3 py-2 text-slate-500 font-semibold uppercase whitespace-nowrap">Boxes</th>
                <th className="text-left px-3 py-2 text-slate-500 font-semibold uppercase whitespace-nowrap">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan="7" className="py-6 text-center text-slate-400">Loading…</td></tr>
              ) : consignments.length > 0 ? consignments.map(c => {
                const pct = c.totalRequiredQty > 0 ? Math.round((c.totalPackedQty / c.totalRequiredQty) * 100) : 0;
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{c.internalShipmentNo || c.id}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        c.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                        c.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>{c.status?.replace('_', ' ')}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap text-[10px]">{c.shipmentStatus || 'Planned'}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-700">{c.totalRequiredQty || 0}</td>
                    <td className="px-3 py-2 text-right font-medium text-emerald-600">{c.totalPackedQty || 0}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{c.boxIds?.length || 0}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2 min-w-[90px]">
                        <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-blue-500' : 'bg-amber-400'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-semibold text-slate-600 w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="7" className="py-6 text-center text-slate-400">No consignments found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity + Audit side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Activity className="w-4 h-4 text-primary-600" />
            <h2 className="text-sm font-semibold text-slate-900">Recent Packing Activity</h2>
          </div>
          <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
            {stats?.recentActivity?.length > 0 ? stats.recentActivity.slice(0, 30).map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  a.eventType === 'box_saved' ? 'bg-primary-500' :
                  a.eventType === 'consignment_finished' ? 'bg-emerald-500' : 'bg-amber-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800">
                    {a.eventType === 'box_saved' ? 'Box Saved' :
                     a.eventType === 'consignment_finished' ? 'Consignment Finished' : 'Event'}
                    {' — '}
                    <span className="font-mono text-[10px] text-slate-500">{a.consignmentId}</span>
                    {a.boxNo ? <span className="text-slate-400"> / Box #{a.boxNo}</span> : ''}
                  </p>
                  <p className="text-[10px] text-slate-400">{format(new Date(a.timestamp), 'dd MMM, h:mm a')}</p>
                </div>
                {a.itemsCount > 0 && (
                  <span className="text-[10px] font-semibold bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full flex-shrink-0">
                    {a.itemsCount} items
                  </span>
                )}
              </div>
            )) : (
              <p className="text-center text-slate-400 py-8 text-sm">No activity yet</p>
            )}
          </div>
        </div>

        {/* Audit Logs */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary-600" />
              <h2 className="text-sm font-semibold text-slate-900">Audit Log</h2>
            </div>
            <button onClick={exportAuditCsv}
              className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
              <Download className="w-3 h-3" /> Export
            </button>
          </div>
          <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
            {auditLogs.length > 0 ? auditLogs.map(log => (
              <div key={log.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold capitalize flex-shrink-0 mt-0.5 ${actionColor(log.action)}`}>
                  {log.action}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700">
                    <span className="font-medium">{log.entityType}</span>
                    {' · '}
                    <span className="font-mono text-[10px] text-slate-500 truncate">{log.entityId}</span>
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <User className="w-3 h-3" />{log.userId === 'default-admin' ? 'Admin' : log.userId}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Calendar className="w-3 h-3" />{format(new Date(log.timestamp), 'dd MMM, h:mm a')}
                    </span>
                  </div>
                </div>
              </div>
            )) : (
              <p className="text-center text-slate-400 py-8 text-sm">No audit logs</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Productivity;
