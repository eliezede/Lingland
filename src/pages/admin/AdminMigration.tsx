
import React, { useState, useEffect } from 'react';
import { Database, Download, CheckCircle2, AlertCircle, Loader2, Users, Mail } from 'lucide-react';
import { AirtableService } from '../../services/airtableService';
import { MigrationService } from '../../services/migrationService';
import { useToast } from '../../context/ToastContext';

export const AdminMigration = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; deduplicated: number } | null>(null);
  const [migrationResult, setMigrationResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const [inviteResult, setInviteResult] = useState<{ sent: number; errors: number } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const { showToast } = useToast();

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await AirtableService.fetchActiveInterpreters();
      setStats({
        total: data.length,
        deduplicated: data.filter(d => d.languages && d.languages.length > 1).length
      });
    } catch (err) {
      showToast('Error loading Airtable stats', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMigrate = async () => {
    if (!window.confirm('Are you sure you want to start the migration? This will create new profiles in the system.')) return;
    
    setLoading(true);
    setLogs(['Starting migration...']);
    try {
      // Monkey patch console.log to capture migration logs
      const oldLog = console.log;
      console.log = (...args) => {
        setLogs(prev => [...prev, args.join(' ')]);
        oldLog(...args);
      };

      const result = await MigrationService.migrateActiveInterpreters();
      
      console.log = oldLog; // Restore
      
      setMigrationResult(result);
      showToast(`Migration complete: ${result.created} created, ${result.skipped} skipped.`, 'success');
    } catch (err) {
      showToast('Migration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvites = async () => {
    if (!window.confirm('Are you sure you want to send activation emails to ALL imported interpreters?')) return;
    
    setLoading(true);
    try {
      const result = await MigrationService.sendActivationInvites();
      setInviteResult(result);
      showToast(`Invites sent: ${result.sent} successful, ${result.errors} failed.`, 'success');
    } catch (err) {
      showToast('Failed to send invites', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Airtable Migration</h1>
          <p className="text-slate-500 dark:text-slate-400">Import active team members from Airtable Master 2026</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg">
              <Users size={20} />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Airtable Status</h3>
          </div>
          {loading && !stats ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              <span>Checking records...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{stats?.total || 0}</p>
              <p className="text-sm text-slate-500">Unique active interpreters found</p>
              {stats?.deduplicated ? (
                <p className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded inline-block">
                  {stats.deduplicated} merged from multiple rows
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm col-span-2">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Migration Actions</h3>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-lg flex gap-3">
              <AlertCircle className="text-amber-600 shrink-0" size={20} />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">Before you proceed:</p>
                <ul className="list-disc ml-4 mt-1 space-y-1">
                  <li>This will create documents in Firestore collections `users` and `interpreters`.</li>
                  <li>Emails will NOT be sent automatically yet.</li>
                  <li>Duplicate emails will be skipped.</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleMigrate}
                disabled={loading || !stats}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-sm"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                Start Import
              </button>
              <button
                onClick={loadStats}
                disabled={loading}
                className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-6 py-2 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Refresh Stats
              </button>
            </div>
            
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
               <button
                onClick={handleSendInvites}
                disabled={loading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-sm"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                Send Activation Emails (Batch)
              </button>
              <p className="mt-2 text-xs text-slate-500 italic">
                * Only sends to users with status 'IMPORTED'
              </p>
            </div>
          </div>
        </div>
      </div>

      {(migrationResult || inviteResult) && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-white">Migration & Invite Results</h3>
            <button onClick={() => { setMigrationResult(null); setInviteResult(null); }} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {migrationResult && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Import Results</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900/30">
                    <p className="text-xs text-green-600 font-semibold uppercase tracking-wider">Created</p>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">{migrationResult.created}</p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Skipped</p>
                    <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{migrationResult.skipped}</p>
                  </div>
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/30">
                    <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">Errors</p>
                    <p className="text-2xl font-bold text-red-700 dark:text-red-400">{migrationResult.errors}</p>
                  </div>
                </div>
              </div>
            )}

            {inviteResult && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Invite Results</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/30">
                    <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Sent</p>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{inviteResult.sent}</p>
                  </div>
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/30">
                    <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">Failed</p>
                    <p className="text-2xl font-bold text-red-700 dark:text-red-400">{inviteResult.errors}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 font-mono text-xs text-slate-400 max-h-64 overflow-y-auto">
          <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
            <span className="font-bold text-slate-200">Migration Log</span>
            <button onClick={() => setLogs([])} className="hover:text-white">Clear</button>
          </div>
          {logs.map((log, i) => (
            <div key={i} className="py-0.5">{log}</div>
          ))}
        </div>
      )}
    </div>
  );
};
