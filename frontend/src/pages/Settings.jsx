import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Settings as SettingsIcon, Save, Trash2, AlertTriangle, ChevronLeft, Loader2, Clock, Database, Play, Server, CheckCircle2, RefreshCw, ShieldCheck, HardDrive } from 'lucide-react';
import { settingsAPI, usersAPI } from '../services/api';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';

export default function Settings() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningCleanup, setRunningCleanup] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [dbInfo, setDbInfo] = useState(null);
  const [dbLoading, setDbLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [fbAuthEnabled, setFbAuthEnabled] = useState(null);
  const [syncingFb, setSyncingFb] = useState(false);
  const [fbSyncResult, setFbSyncResult] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);
  const [showMigrateConfirm, setShowMigrateConfirm] = useState(false);
  const [settings, setSettings] = useState({
    consignmentRetentionDays: 450,
    videoRetentionDays: 60,
    cleanupEnabled: true,
    lastCleanupRun: null
  });

  useEffect(() => {
    fetchSettings();
    fetchDbInfo();
    usersAPI.firebaseAuthStatus().then(r => setFbAuthEnabled(r.data.enabled)).catch(() => setFbAuthEnabled(false));
  }, []);

  const handleFirebaseSync = async () => {
    setSyncingFb(true);
    setFbSyncResult(null);
    try {
      const res = await usersAPI.syncFirebaseAuth();
      setFbSyncResult(res.data);
      addToast(`Synced ${res.data.synced} user(s) — ${res.data.created} new in Firebase Auth`, 'success');
    } catch (e) {
      addToast(e.response?.data?.error || 'Firebase Auth sync failed', 'error');
    }
    setSyncingFb(false);
  };

  const fetchDbInfo = async () => {
    setDbLoading(true);
    try {
      const res = await settingsAPI.getDbInfo();
      setDbInfo(res.data);
    } catch (e) {
      addToast('Failed to load database info', 'error');
    }
    setDbLoading(false);
  };

  const handleReconcile = async () => {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const res = await settingsAPI.reconcile();
      setReconcileResult(res.data);
      addToast(`Reconciled ${res.data.scanned} consignments — fixed ${res.data.fixedConsignments}`, 'success');
      fetchDbInfo();
    } catch (e) {
      addToast(e.response?.data?.error || 'Reconcile failed', 'error');
    }
    setReconciling(false);
  };

  const handleMigration = async () => {
    setShowMigrateConfirm(false);
    setMigrating(true);
    setMigrationResult(null);
    try {
      const res = await settingsAPI.migrateToPostgres();
      setMigrationResult(res.data);
      addToast(`Successfully migrated ${res.data.total} documents to PostgreSQL!`, 'success');
      fetchDbInfo();
    } catch (e) {
      addToast(e.response?.data?.error || 'Migration failed', 'error');
    }
    setMigrating(false);
  };

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await settingsAPI.get();
      setSettings(prev => ({ ...prev, ...res.data.settings }));
    } catch (err) {
      addToast('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsAPI.update({
        consignmentRetentionDays: parseInt(settings.consignmentRetentionDays),
        videoRetentionDays: parseInt(settings.videoRetentionDays),
        cleanupEnabled: settings.cleanupEnabled
      });
      addToast('Settings saved', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save', 'error');
    }
    setSaving(false);
  };

  const handleRunCleanup = async () => {
    setRunningCleanup(true);
    try {
      const res = await settingsAPI.runCleanup();
      const r = res.data;
      addToast(`Cleanup done: ${r.consignmentsDeleted||0} consignments, ${r.videosDeleted||0} videos deleted`, 'success');
      fetchSettings();
    } catch (err) {
      addToast(err.response?.data?.error || 'Cleanup failed', 'error');
    }
    setRunningCleanup(false);
  };

  const fmtDate = (d) => {
    if (!d) return 'Never';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleString('en-GB');
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500 mt-1">Data retention and system configuration</p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" /></div>
      ) : (
        <div className="max-w-3xl space-y-6">

          {/* ═══ DATABASE CONNECTION (admin) ═══ */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg"><Server className="w-5 h-5 text-indigo-600" /></div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Database Connection</h2>
                  <p className="text-sm text-slate-500">Live datastore status &amp; configuration</p>
                </div>
              </div>
              <button onClick={fetchDbInfo} disabled={dbLoading}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50">
                <RefreshCw className={`w-3.5 h-3.5 ${dbLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            <div className="p-6">
              {dbLoading ? (
                <div className="py-6 text-center text-slate-400 text-sm">Loading…</div>
              ) : dbInfo ? (
                <>
                  {/* Status banner */}
                  <div className={`flex items-center gap-2 px-4 py-3 rounded-xl mb-5 ${dbInfo.connected ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
                    {dbInfo.connected
                      ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" /><span className="text-sm font-medium text-emerald-700">Connected — {dbInfo.datastore}</span></>
                      : <><AlertTriangle className="w-4 h-4 text-red-600" /><span className="text-sm font-medium text-red-700">Not connected{dbInfo.error ? `: ${dbInfo.error}` : ''}</span></>}
                  </div>

                  {/* Connection details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                    {[
                      { label: 'Datastore', value: dbInfo.datastore },
                      { label: 'Instance', value: dbInfo.instanceConnectionName || '—' },
                      { label: 'Database', value: dbInfo.database },
                      { label: 'User', value: dbInfo.user },
                      { label: 'Region', value: dbInfo.region || '—' },
                      { label: 'SSL', value: dbInfo.ssl ? 'Enabled' : 'Local' },
                      { label: 'Server', value: dbInfo.serverVersion || '—' },
                      { label: 'File Storage', value: dbInfo.storageBucket || '—' },
                    ].map(item => (
                      <div key={item.label} className="bg-slate-50 rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400">{item.label}</p>
                        <p className="text-sm font-medium text-slate-800 truncate font-mono">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Record counts */}
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="w-4 h-4 text-slate-400" />
                    <p className="text-sm font-semibold text-slate-700">Stored Records ({dbInfo.totalDocuments?.toLocaleString()} total)</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(dbInfo.counts || {}).map(([col, n]) => (
                      <div key={col} className="bg-indigo-50/50 border border-indigo-100 rounded-lg px-3 py-2">
                        <p className="text-lg font-bold text-indigo-700">{n}</p>
                        <p className="text-[10px] text-slate-500 capitalize">{col}</p>
                      </div>
                    ))}
                  </div>

                  {/* Migration section */}
                  {dbInfo.connected && dbInfo.datastore.includes('PostgreSQL') && (
                    <>
                      <div className="border-t border-slate-100 my-6"></div>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Database className="w-5 h-5 text-indigo-600" />
                          <h3 className="text-base font-semibold text-slate-900">Migrate Firestore to PostgreSQL</h3>
                        </div>
                        <p className="text-sm text-slate-500">
                          Copy all existing documents from Firebase Firestore collections into your PostgreSQL long-term preservation datastore. This will upsert records (merging gracefully if they exist).
                        </p>

                        {migrationResult && (
                          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Successfully migrated {migrationResult.total} documents!</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                              {Object.entries(migrationResult.migrated || {}).map(([col, n]) => (
                                <div key={col} className="bg-white border border-slate-100 rounded p-2 flex justify-between items-center">
                                  <span className="text-slate-500 capitalize truncate mr-1">{col}</span>
                                  <span className="font-bold text-slate-800">{n}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => setShowMigrateConfirm(true)}
                          disabled={migrating}
                          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                          {migrating ? 'Migrating Data…' : 'Start Migration Now'}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">Unable to load database info.</p>
              )}
            </div>
          </div>

          {/* ═══ DATA INTEGRITY / RECONCILE ═══ */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg"><ShieldCheck className="w-5 h-5 text-emerald-600" /></div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Data Integrity</h2>
                <p className="text-sm text-slate-500">Recalculate all packed totals from physical boxes so every number matches</p>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3 p-4 bg-indigo-50 rounded-xl border border-indigo-100 mb-4">
                <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-sm text-indigo-800">
                  This recomputes every SKU's packed quantity, box breakdown, and each consignment's totals
                  <strong> directly from the saved boxes</strong> — the physical source of truth. Use it if the
                  Packing Station, SKU list, Boxes tab, or Reports ever show different numbers. It's safe to run anytime.
                </div>
              </div>

              {reconcileResult && (
                <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                  <p className="font-semibold text-slate-800 mb-1">
                    ✅ Scanned {reconcileResult.scanned} consignments — fixed {reconcileResult.fixedConsignments} consignment(s), {reconcileResult.fixedSkus} SKU(s)
                  </p>
                  {reconcileResult.issues?.length > 0 ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-indigo-600">View {reconcileResult.issues.length} adjustments</summary>
                      <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                        {reconcileResult.issues.map((it, i) => <li key={i} className="text-[11px] text-slate-500 font-mono">{it}</li>)}
                      </ul>
                    </details>
                  ) : <p className="text-xs text-emerald-600">All data already consistent — nothing to fix. 🎯</p>}
                </div>
              )}

              <button onClick={handleReconcile} disabled={reconciling}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50">
                {reconciling ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {reconciling ? 'Reconciling…' : 'Reconcile All Data'}
              </button>
            </div>
          </div>

          {/* ═══ FIREBASE AUTHENTICATION ═══ */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 rounded-lg"><ShieldCheck className="w-5 h-5 text-amber-600" /></div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Firebase Authentication</h2>
                  <p className="text-sm text-slate-500">Mirror app users into Firebase Auth — manage them from the Firebase Console</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${fbAuthEnabled === null ? 'bg-slate-100 text-slate-500' : fbAuthEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {fbAuthEnabled === null ? 'Checking…' : fbAuthEnabled ? 'Connected' : 'Not Available'}
              </span>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100 mb-4">
                <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="mb-1"><strong>What this does:</strong> New users created here are automatically mirrored into Firebase Authentication (and updated/deleted/password-changed accordingly).</p>
                  <p className="text-xs">For <strong>existing</strong> users, click below to backfill — their accounts will be created in Firebase Auth without a password. They can use Firebase's "send password reset" to set one.</p>
                </div>
              </div>

              {fbSyncResult && (
                <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                  <p className="font-semibold text-slate-800">
                    ✅ {fbSyncResult.synced}/{fbSyncResult.total} users synced — {fbSyncResult.created} newly created in Firebase Auth{fbSyncResult.failed > 0 ? ` (${fbSyncResult.failed} failed)` : ''}
                  </p>
                </div>
              )}

              <button onClick={handleFirebaseSync} disabled={syncingFb || !fbAuthEnabled}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium transition-colors disabled:opacity-50">
                {syncingFb ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {syncingFb ? 'Syncing…' : 'Backfill All Users to Firebase Auth'}
              </button>
            </div>
          </div>

          {/* Retention Policy */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="p-2 bg-primary-50 rounded-lg">
                <Database className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Data Retention Policy</h2>
                <p className="text-sm text-slate-500">Configure how long consignments and videos are kept</p>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Consignment Retention (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    value={settings.consignmentRetentionDays}
                    onChange={e => setSettings({ ...settings, consignmentRetentionDays: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">
                    Consignments older than this will be auto-deleted. Default: 450 days
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Video Retention (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    value={settings.videoRetentionDays}
                    onChange={e => setSettings({ ...settings, videoRetentionDays: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">
                    Videos older than Date of Inward + this period will be deleted. Default: 60 days
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-100">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="text-sm text-amber-800">
                  <strong>Warning:</strong> Reducing these values will cause more data to be deleted during the next cleanup run. Deleted data cannot be recovered.
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Clock className="w-4 h-4" />
                  <span>Last cleanup run: <strong className="text-slate-700">{fmtDate(settings.lastCleanupRun)}</strong></span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCleanupConfirm(true)}
                    disabled={runningCleanup}
                    className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors"
                  >
                    {runningCleanup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Run Cleanup Now
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium transition-colors"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Trash2 className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-semibold text-slate-900">Consignment Cleanup</h3>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                Consignments and all related data (SKUs, boxes, documents) are permanently removed after 
                <strong className="text-slate-700"> {settings.consignmentRetentionDays} days</strong> from creation.
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Trash2 className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-semibold text-slate-900">Video Cleanup</h3>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                Packing videos are permanently removed from Firebase Storage <strong className="text-slate-700">{settings.videoRetentionDays} days</strong> after 
                the consignment's Date of Inward. Orphaned videos are also cleaned up.
              </p>
              <div className="mt-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                <p className="text-xs text-emerald-700">
                  <strong>Protected:</strong> Videos are NEVER deleted if the consignment has a <strong>Ticket ID</strong> filled in. Clear the Ticket ID to allow normal 60-day deletion.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        show={showCleanupConfirm}
        title="Run Retention Cleanup?"
        variant="warning"
        confirmLabel="Yes, Run Cleanup"
        loading={runningCleanup}
        message={
          <span>
            This will permanently delete consignments older than <strong>{settings.consignmentRetentionDays} days</strong> and
            videos older than <strong>{settings.videoRetentionDays} days</strong> after inward date.
            <br /><br />
            <span className="text-amber-700 font-medium">Deleted data cannot be recovered.</span>
          </span>
        }
        onConfirm={handleRunCleanup}
        onCancel={() => setShowCleanupConfirm(false)}
      />

      <ConfirmModal
        show={showMigrateConfirm}
        title="Migrate Firestore to PostgreSQL?"
        variant="warning"
        confirmLabel="Yes, Start Migration"
        loading={migrating}
        message={
          <span>
            This will retrieve all existing documents from the 11 Firebase Firestore collections and insert/upsert them directly into PostgreSQL.
            <br /><br />
            <span className="text-amber-700 font-medium">Any existing records in PostgreSQL with the same ID will be merged or overwritten. Proceed with caution.</span>
          </span>
        }
        onConfirm={handleMigration}
        onCancel={() => setShowMigrateConfirm(false)}
      />
    </div>
  );
}
