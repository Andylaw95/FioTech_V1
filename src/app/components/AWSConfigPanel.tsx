import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Copy,
  Wifi,
  WifiOff,
  Database,
  Server,
  ArrowRightLeft,
  ExternalLink,
  ShieldCheck,
  Settings2,
  Zap,
  CloudDownload,
  CloudUpload,
  Info,
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import {
  api,
  type AWSStatus,
  type AWSConfig,
  type AWSIoTThing,
  type AWSSyncResult,
} from '@/app/utils/api';
import { toast } from 'sonner';

// ── Shared UI helpers (consistent with Settings.tsx) ──

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100">
        <h3 className="text-sm sm:text-base font-semibold text-slate-900">{title}</h3>
        {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
      </div>
      <div className="px-4 sm:px-6 py-4 sm:py-5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={clsx('text-xs font-medium text-slate-700', mono && 'font-mono')}>{value || '—'}</span>
    </div>
  );
}

function StatusBadge({ connected, label, checking = false }: { connected: boolean; label: string; checking?: boolean }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
      checking ? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' :
      connected ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
      'bg-red-50 text-red-700 ring-1 ring-red-200'
    )}>
      {checking ? <Loader2 className="h-3 w-3 animate-spin" /> :
       connected ? <CheckCircle2 className="h-3 w-3" /> :
       <WifiOff className="h-3 w-3" />}
      {checking ? 'Checking' : label}
    </span>
  );
}

// ── AWS Regions ──

const AWS_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'ap-east-1', label: 'Asia Pacific (Hong Kong)' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { value: 'ap-northeast-3', label: 'Asia Pacific (Osaka)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'eu-west-2', label: 'Europe (London)' },
  { value: 'eu-west-3', label: 'Europe (Paris)' },
  { value: 'me-south-1', label: 'Middle East (Bahrain)' },
  { value: 'sa-east-1', label: 'South America (São Paulo)' },
];

// ── Main Component ──

export function AWSConfigPanel() {
  const [status, setStatus] = useState<AWSStatus | null>(null);
  const [config, setConfig] = useState<AWSConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<AWSSyncResult | null>(null);
  const [things, setThings] = useState<AWSIoTThing[]>([]);
  const [thingsLoading, setThingsLoading] = useState(false);

  // Form state
  const [formRegion, setFormRegion] = useState('');
  const [formEndpoint, setFormEndpoint] = useState('');
  const [formDynamoTable, setFormDynamoTable] = useState('');
  const [formDynamoPartition, setFormDynamoPartition] = useState('deviceId');
  const [formDynamoSort, setFormDynamoSort] = useState('timestamp');
  const [formEnabled, setFormEnabled] = useState(false);

  const loadStatus = useCallback(async () => {
    setChecking(true);
    try {
      const s = await api.getAWSStatus();
      setStatus(s);
    } catch (e) {
      console.error('Failed to load AWS status:', e);
    } finally {
      setChecking(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const c = await api.getAWSConfig();
      setConfig(c);
      setFormRegion(c.region || '');
      setFormEndpoint(c.iotEndpoint || '');
      setFormDynamoTable(c.dynamoTableName || '');
      setFormDynamoPartition(c.dynamoPartitionKey || 'deviceId');
      setFormDynamoSort(c.dynamoSortKey || 'timestamp');
      setFormEnabled(c.enabled);
    } catch (e) {
      console.error('Failed to load AWS config:', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadStatus(), loadConfig()]);
      setLoading(false);
    })();
  }, [loadStatus, loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.updateAWSConfig({
        region: formRegion,
        iotEndpoint: formEndpoint,
        dynamoTableName: formDynamoTable,
        dynamoPartitionKey: formDynamoPartition,
        dynamoSortKey: formDynamoSort,
        enabled: formEnabled,
      });
      setConfig(res.config);
      toast.success('AWS configuration saved');
      // Re-check connectivity
      await loadStatus();
    } catch (e) {
      toast.error('Failed to save AWS configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.syncAWSDevices();
      setSyncResult(result);
      toast.success(`Synced ${result.summary.created} new + ${result.summary.updated} updated devices from AWS`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to sync AWS devices');
    } finally {
      setSyncing(false);
    }
  };

  const handleLoadThings = async () => {
    setThingsLoading(true);
    try {
      const res = await api.getAWSThings(50);
      setThings(res.things);
    } catch (e) {
      toast.error('Failed to load AWS IoT Things');
    } finally {
      setThingsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        <span className="ml-2 text-sm text-slate-500">Loading AWS configuration...</span>
      </div>
    );
  }

  const credsMissing = !status?.credentialsSet;

  return (
    <div className="space-y-6">
      {/* ── Connection Status ── */}
      <SectionCard title="AWS Connection Status" description="Overview of your AWS IoT Core connectivity.">
        <div className="space-y-4">
          {/* Credentials status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={clsx('p-2 rounded-lg', credsMissing ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600')}>
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">AWS Credentials</p>
                <p className="text-xs text-slate-500">
                  {credsMissing ? 'Not configured — set Supabase secrets' : 'Configured via Supabase secrets'}
                </p>
              </div>
            </div>
            <StatusBadge connected={!credsMissing} label={credsMissing ? 'Missing' : 'Set'} checking={checking} />
          </div>

          {/* IoT Core */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={clsx('p-2 rounded-lg', status?.iotCoreConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
                <Cloud className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">AWS IoT Core</p>
                <p className="text-xs text-slate-500">Thing Registry & Device Shadows</p>
              </div>
            </div>
            <StatusBadge connected={!!status?.iotCoreConnected} label={status?.iotCoreConnected ? 'Connected' : 'Disconnected'} checking={checking} />
          </div>

          {/* DynamoDB */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={clsx('p-2 rounded-lg', status?.dynamoDBConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
                <Database className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">DynamoDB</p>
                <p className="text-xs text-slate-500">Historical telemetry data</p>
              </div>
            </div>
            <StatusBadge connected={!!status?.dynamoDBConnected} label={status?.dynamoDBConnected ? 'Connected' : 'Not Connected'} checking={checking} />
          </div>

          {/* Test button */}
          <div className="pt-2">
            <button
              onClick={loadStatus}
              disabled={checking}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Test Connection
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── Credentials Setup Guide (shown when missing) ── */}
      {credsMissing && (
        <SectionCard title="Setup Required — AWS Credentials" description="Your IT team needs to provide AWS credentials to enable this integration.">
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">AWS credentials are not yet configured</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Ask your IT team to create an IAM user with the required permissions and provide the access keys. 
                    These need to be set as Supabase Edge Function secrets.
                  </p>
                </div>
              </div>
            </div>

            {/* Step-by-step guide */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">Setup Steps for IT Team:</h4>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
                  <h5 className="text-sm font-semibold text-slate-900">Create IAM User</h5>
                </div>
                <div className="ml-8 space-y-2">
                  <p className="text-xs text-slate-600">
                    In the AWS Console → IAM → Users → Create User. Name it <span className="font-mono bg-slate-100 px-1 rounded">fiotech-iot-integration</span>.
                  </p>
                  <p className="text-xs text-slate-600">
                    Attach the following managed policies (or create a custom policy):
                  </p>
                  <div className="bg-slate-900 rounded-lg p-3 overflow-x-auto">
                    <pre className="text-xs text-green-400 font-mono whitespace-pre">{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iot:ListThings",
        "iot:DescribeThing",
        "iot:ListThingGroupsForThing",
        "iot:GetThingShadow",
        "iot:UpdateThingShadow",
        "iot:Publish"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:DescribeTable"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/your-iot-table*"
    }
  ]
}`}</pre>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
                  <h5 className="text-sm font-semibold text-slate-900">Generate Access Keys</h5>
                </div>
                <div className="ml-8">
                  <p className="text-xs text-slate-600">
                    Go to the IAM user → Security Credentials → Create Access Key. Choose "Third-party service". Save the <span className="font-mono bg-slate-100 px-1 rounded">Access Key ID</span> and <span className="font-mono bg-slate-100 px-1 rounded">Secret Access Key</span>.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">3</span>
                  <h5 className="text-sm font-semibold text-slate-900">Set Supabase Secrets</h5>
                </div>
                <div className="ml-8 space-y-2">
                  <p className="text-xs text-slate-600">
                    Run these commands using the Supabase CLI (or set via Supabase Dashboard → Project Settings → Edge Functions → Secrets):
                  </p>
                  <div className="bg-slate-900 rounded-lg p-3 overflow-x-auto">
                    <pre className="text-xs text-green-400 font-mono whitespace-pre">{`supabase secrets set AWS_ACCESS_KEY_ID=AKIA...your-key
supabase secrets set AWS_SECRET_ACCESS_KEY=wJal...your-secret
supabase secrets set AWS_REGION=ap-east-1`}</pre>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">4</span>
                  <h5 className="text-sm font-semibold text-slate-900">Get IoT Core Endpoint</h5>
                </div>
                <div className="ml-8 space-y-2">
                  <p className="text-xs text-slate-600">
                    To find your IoT Data endpoint, run:
                  </p>
                  <div className="bg-slate-900 rounded-lg p-3 overflow-x-auto">
                    <pre className="text-xs text-green-400 font-mono whitespace-pre">{`aws iot describe-endpoint --endpoint-type iot:Data-ATS`}</pre>
                  </div>
                  <p className="text-xs text-slate-500">
                    It will return something like <span className="font-mono bg-slate-100 px-1 rounded text-slate-700">a1b2c3d4e5-ats.iot.ap-east-1.amazonaws.com</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-xs text-blue-800">
                <span className="font-semibold">After credentials are set:</span> Redeploy the Supabase Edge Function to pick up the new secrets, then return here to configure your IoT endpoint and test the connection.
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Configuration Form ── */}
      <SectionCard title="AWS Configuration" description="Configure your AWS IoT Core and DynamoDB settings.">
        <div className="space-y-5">
          {/* Region */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">AWS Region</label>
            <select
              value={formRegion}
              onChange={(e) => setFormRegion(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select region...</option>
              {AWS_REGIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label} ({r.value})</option>
              ))}
            </select>
          </div>

          {/* IoT Endpoint */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">IoT Core Data Endpoint</label>
            <input
              type="text"
              value={formEndpoint}
              onChange={(e) => setFormEndpoint(e.target.value)}
              placeholder="a1b2c3d4e5-ats.iot.ap-east-1.amazonaws.com"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-mono text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Get this via: <span className="font-mono">aws iot describe-endpoint --endpoint-type iot:Data-ATS</span>
            </p>
          </div>

          {/* DynamoDB Table */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">DynamoDB Table Name</label>
            <input
              type="text"
              value={formDynamoTable}
              onChange={(e) => setFormDynamoTable(e.target.value)}
              placeholder="iot-sensor-data"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-mono text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
            />
            <p className="text-[11px] text-slate-400 mt-1">Optional — for reading historical sensor data from DynamoDB.</p>
          </div>

          {/* DynamoDB Keys */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Partition Key</label>
              <input
                type="text"
                value={formDynamoPartition}
                onChange={(e) => setFormDynamoPartition(e.target.value)}
                placeholder="deviceId"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-mono text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Sort Key</label>
              <input
                type="text"
                value={formDynamoSort}
                onChange={(e) => setFormDynamoSort(e.target.value)}
                placeholder="timestamp"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-mono text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between py-3 border-t border-slate-100">
            <div>
              <p className="text-sm font-medium text-slate-900">Enable AWS Integration</p>
              <p className="text-xs text-slate-500">When enabled, AWS data sources appear across the dashboard.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formEnabled}
              onClick={() => setFormEnabled(!formEnabled)}
              className={clsx(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                formEnabled ? 'bg-blue-600' : 'bg-slate-200',
              )}
            >
              <span className={clsx(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                formEnabled ? 'translate-x-5' : 'translate-x-0'
              )} />
            </button>
          </div>

          {/* Save button */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
              Save Configuration
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── Device Sync ── */}
      {!credsMissing && (
        <SectionCard title="Device Synchronization" description="Sync AWS IoT Things with FioTec devices for unified management.">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Sync AWS IoT Things → FioTec</p>
                <p className="text-xs text-slate-500">
                  Import AWS things as FioTec devices. Existing matches are updated, new things are created.
                  {config?.lastSyncAt && (
                    <span className="ml-1 text-slate-400">Last sync: {new Date(config.lastSyncAt).toLocaleString()}</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm"
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                onClick={handleLoadThings}
                disabled={thingsLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all"
              >
                {thingsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                Preview AWS Things
              </button>
            </div>

            {/* Sync result */}
            <AnimatePresence>
              {syncResult && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-4 rounded-xl bg-emerald-50 border border-emerald-100"
                >
                  <p className="text-sm font-medium text-emerald-800 mb-2">Sync Complete</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-lg font-bold text-emerald-700">{syncResult.summary.awsThingsFound}</p>
                      <p className="text-[11px] text-emerald-600">AWS Things</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-700">{syncResult.summary.created}</p>
                      <p className="text-[11px] text-blue-600">Created</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-amber-700">{syncResult.summary.updated}</p>
                      <p className="text-[11px] text-amber-600">Updated</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-slate-700">{syncResult.summary.totalFioTechDevices}</p>
                      <p className="text-[11px] text-slate-600">Total Devices</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Preview list */}
            {things.length > 0 && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-medium text-slate-600">AWS IoT Things ({things.length})</p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {things.map((thing) => (
                    <div key={thing.thingName} className="flex items-center justify-between px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{thing.thingName}</p>
                        <p className="text-xs text-slate-500">
                          {thing.thingTypeName || 'No type'} • {Object.keys(thing.attributes).length} attributes
                        </p>
                      </div>
                      <span className="text-xs font-mono text-slate-400 truncate max-w-[200px]">
                        {thing.thingArn?.split(':').pop() || ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Data Flow Info ── */}
      {!credsMissing && (
        <SectionCard title="Bidirectional Data Flow" description="How data flows between FioTec and AWS.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CloudDownload className="h-4 w-4 text-blue-600" />
                <h5 className="text-sm font-semibold text-blue-900">AWS → FioTec</h5>
              </div>
              <ul className="text-xs text-blue-800 space-y-1.5 list-disc ml-4">
                <li>List & import IoT Things as devices</li>
                <li>Read Device Shadows for real-time state</li>
                <li>Query DynamoDB for historical telemetry</li>
                <li>Auto-sync device statuses</li>
              </ul>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CloudUpload className="h-4 w-4 text-violet-600" />
                <h5 className="text-sm font-semibold text-violet-900">FioTec → AWS</h5>
              </div>
              <ul className="text-xs text-violet-800 space-y-1.5 list-disc ml-4">
                <li>Update Device Shadows (desired state)</li>
                <li>Publish MQTT commands to devices</li>
                <li>Push sensor telemetry to IoT Core</li>
                <li>Control devices remotely via shadows</li>
              </ul>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
