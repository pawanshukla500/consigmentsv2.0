import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Settings as SettingsIcon, Save, Trash2, AlertTriangle, ChevronLeft, Loader2, Clock, Database, Play } from 'lucide-react';
import { settingsAPI } from '../services/api';
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
  const [settings, setSettings] = useState({
    consignmentRetentionDays: 450,
    videoRetentionDays: 60,
    cleanupEnabled: true,
    lastCleanupRun: null
  });

  useEffect(() => {
    fetchSettings();
  }, []);

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
    </div>
  );
}
