import React, { useState, useEffect, useCallback } from 'react';
import {
  Webhook,
  Copy,
  RefreshCcw,
  Check,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  CircleAlert,
  Image as ImageIcon,
  Clock,
  CheckCircle2,
  XCircle,
  Play,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api, type WebhookConfig, type WebhookTestResult } from '@/app/utils/api';
import { copyToClipboard as clipboardCopy } from '@/app/utils/clipboard';
import { toast } from 'sonner';
import { Button } from '@/app/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
// UG65 screenshot placeholder — the original Figma asset is not available outside Figma
const ug65Screenshot = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" fill="%23f8fafc"><rect width="600" height="300" fill="%23f1f5f9" rx="8"/><text x="300" y="140" text-anchor="middle" font-family="system-ui" font-size="16" fill="%2364748b">UG65 Network Server — Data Transmission Settings</text><text x="300" y="168" text-anchor="middle" font-family="system-ui" font-size="12" fill="%2394a3b8">Paste the webhook URL into the Uplink data field</text></svg>');

/** Format a relative time string from an ISO timestamp */
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0 || isNaN(diff)) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.round(diff / 3600_000)}h ago`;
  return `${Math.round(diff / 86400_000)}d ago`;
}

export function WebhookConfigPanel() {
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showScreenshot, setShowScreenshot] = useState(false);

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await api.getWebhookConfig();
      setConfig(data);
    } catch (e) {
      console.debug('Failed to fetch webhook config:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await api.generateWebhookToken();
      setConfig(data);
      setTestResult(null); // Clear previous test result
      toast.success(config?.hasToken ? 'Webhook token regenerated' : 'Webhook token generated');
    } catch (e) {
      console.error('Failed to generate webhook token:', e);
      const msg = e instanceof Error ? e.message : 'Failed to generate webhook token';
      toast.error(msg.length > 120 ? 'Failed to generate webhook token. Check console for details.' : msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testWebhookConnection();
      setTestResult(result);
      if (result.success) {
        toast.success(`Webhook connected (${result.latencyMs}ms)`);
        // Refresh config to update lastReceived
        fetchConfig();
      } else {
        toast.error(result.error || 'Connection test failed');
      }
    } catch (e) {
      console.error('Webhook test error:', e);
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      setTestResult({ success: false, error: errMsg });
      toast.error('Failed to test webhook connection');
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    clipboardCopy(text).then(() => {
      setCopiedField(field);
      toast.success(`${field} copied to clipboard`);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          <span className="text-sm text-slate-500">Loading webhook configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-50 rounded-lg">
            <Webhook className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Gateway Webhook Integration</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Receive real sensor data from your Milesight UG65/UG67 or other LoRaWAN gateways
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {config?.hasToken ? (
            <div className="flex items-center gap-2">
              {config.lastReceived && (
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700" title={`Last received: ${new Date(config.lastReceived).toLocaleString('en-GB', { timeZone: 'Asia/Hong_Kong' })}`}>
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(config.lastReceived)}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                <ShieldCheck className="h-3 w-3" />
                Active
              </span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
              Not configured
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {!config?.hasToken ? (
          <div className="text-center py-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-violet-50 flex items-center justify-center mb-3">
              <Webhook className="h-6 w-6 text-violet-500" />
            </div>
            <h4 className="text-sm font-medium text-slate-900 mb-1">No webhook token configured</h4>
            <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
              Generate a webhook token to allow your gateway to push sensor data directly to FioTec.
            </p>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Webhook className="h-4 w-4 mr-2" />
              )}
              Generate Webhook Token
            </Button>
          </div>
        ) : (
          <>
            {/* Webhook URL */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                Webhook URL
                <span className="ml-1.5 text-slate-400 font-normal">— paste into your gateway's "Uplink data" URL field</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs text-slate-700 truncate">
                  {config.webhookUrl}
                </div>
                <button
                  onClick={() => copyToClipboard(config.webhookUrl!, 'URL')}
                  className={clsx(
                    'p-2 rounded-lg border transition-all shrink-0',
                    copiedField === 'URL'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                      : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'
                  )}
                  title="Copy URL"
                >
                  {copiedField === 'URL' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Token */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Webhook Token</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs text-slate-700">
                  <span className="select-all">{config.token}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(config.token!, 'Token')}
                  className={clsx(
                    'p-2 rounded-lg border transition-all shrink-0',
                    copiedField === 'Token'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                      : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'
                  )}
                  title="Copy token"
                >
                  {copiedField === 'Token' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Last Received & Connection Status */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-600">Last Received</p>
                  {config.lastReceived ? (
                    <p className="text-xs text-slate-500 truncate" title={new Date(config.lastReceived).toLocaleString('en-GB', { timeZone: 'Asia/Hong_Kong' })}>
                      {new Date(config.lastReceived).toLocaleString('en-GB', { timeZone: 'Asia/Hong_Kong' })} ({formatRelativeTime(config.lastReceived)})
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No data received yet</p>
                  )}
                </div>
              </div>

              {/* Test result indicator (inline) */}
              <AnimatePresence mode="wait">
                {testResult && (
                  <motion.div
                    key={testResult.success ? 'ok' : 'fail'}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={clsx(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0',
                      testResult.success
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    )}
                  >
                    {testResult.success ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        Connected ({testResult.latencyMs}ms)
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3" />
                        Failed
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="text-xs"
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Regenerate Token
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className={clsx(
                    'text-xs',
                    testResult?.success && 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                  )}
                >
                  {testing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Test Connection
                </Button>
              </div>

              <button
                onClick={() => setShowSetup(!showSetup)}
                className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 font-medium"
              >
                <Info className="h-3.5 w-3.5" />
                Setup Instructions
                {showSetup ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>

            {/* Test failure details */}
            <AnimatePresence>
              {testResult && !testResult.success && testResult.error && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-3">
                    <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="text-xs text-red-700 space-y-1">
                      <p className="font-semibold">Connection test failed</p>
                      <p className="text-red-600">{testResult.error}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Setup Instructions */}
        <AnimatePresence>
          {showSetup && config?.hasToken && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="bg-violet-50/50 border border-violet-100 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-violet-900 flex items-center gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Milesight UG65/UG67 — Embedded Network Server Setup
                  </h4>
                  <a
                    href="https://www.milesight.com/beaver-iot/zh-Hans/docs/user-guides/published-integrations/milesight-gateway-embedded-ns/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-violet-500 hover:text-violet-700 font-medium"
                  >
                    Milesight Docs <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>

                {/* Step-by-step instructions */}
                <div className="space-y-3">
                  {/* Step 1 */}
                  <div className="flex gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-violet-800 text-[10px] font-bold shrink-0 mt-0.5">1</span>
                    <div className="text-xs text-violet-800">
                      Open your UG65/UG67 admin panel (default: <code className="bg-violet-100 px-1 py-0.5 rounded text-[10px]">192.168.23.150</code>).
                      Navigate to{' '}
                      <strong>Network Server</strong> <ArrowRight className="inline h-3 w-3 -mt-0.5" />{' '}
                      <strong>Applications</strong>. Create a new application or open an existing one (e.g. "FioTec").
                      Add your LoRaWAN end-devices (sensors) to this application if not already added.
                    </div>
                  </div>

                  {/* Step 2 — Payload Codec */}
                  <div className="flex gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-violet-800 text-[10px] font-bold shrink-0 mt-0.5">2</span>
                    <div className="text-xs text-violet-800">
                      In the application settings, find <strong>Payload Codec</strong>.
                      Select a built-in codec for your Milesight end-device model (e.g. <em>AM307</em>, <em>EM300</em>,{' '}
                      <em>VS121</em>, etc.). This enables the gateway to decode raw LoRaWAN frames into
                      human-readable JSON objects (temperature, humidity, CO2, etc.) before forwarding to FioTec.
                      If set to <strong>"None"</strong>, only raw Base64 data will be sent.
                    </div>
                  </div>

                  {/* Step 3 — Data Transmission */}
                  <div className="flex gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-violet-800 text-[10px] font-bold shrink-0 mt-0.5">3</span>
                    <div className="text-xs text-violet-800">
                      Scroll to the <strong>Data Transmission</strong> section.
                      Set <strong>Type</strong> to{' '}
                      <code className="bg-violet-100 px-1 py-0.5 rounded text-[10px]">HTTP</code>.
                      Leave the <strong>HTTP Header</strong> table empty — the webhook token is passed as a
                      query parameter in the URL, so no custom headers are needed.
                    </div>
                  </div>

                  {/* Step 4 — URL fields */}
                  <div className="flex gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-violet-800 text-[10px] font-bold shrink-0 mt-0.5">4</span>
                    <div className="text-xs text-violet-800 flex-1 space-y-2">
                      <p>In the <strong>URL</strong> section, paste the webhook URL into the following fields:</p>

                      {/* URL fields table */}
                      <div className="bg-white rounded-md border border-violet-200 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-violet-100/60">
                              <th className="text-left px-3 py-1.5 font-semibold text-violet-700 w-40">Data Type</th>
                              <th className="text-left px-3 py-1.5 font-semibold text-violet-700">URL</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-violet-100">
                            <tr className="bg-emerald-50/40">
                              <td className="px-3 py-2 font-medium text-slate-800">
                                Uplink data
                                <span className="ml-1 text-[10px] text-emerald-600 font-semibold">(required)</span>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <code className="text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded text-[10px] break-all flex-1">
                                    {config.webhookUrl}
                                  </code>
                                  <button
                                    onClick={() => copyToClipboard(config.webhookUrl!, 'Uplink URL')}
                                    className="p-1 rounded text-slate-400 hover:text-violet-600 shrink-0"
                                    title="Copy"
                                  >
                                    {copiedField === 'Uplink URL' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 font-medium text-slate-800">
                                Join notification
                                <span className="ml-1 text-[10px] text-slate-400">(optional)</span>
                              </td>
                              <td className="px-3 py-2 text-slate-500">
                                Same URL, or leave empty
                              </td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 font-medium text-slate-800">
                                ACK notification
                                <span className="ml-1 text-[10px] text-slate-400">(optional)</span>
                              </td>
                              <td className="px-3 py-2 text-slate-500">
                                Leave empty
                              </td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 font-medium text-slate-800">
                                Error notification
                                <span className="ml-1 text-[10px] text-slate-400">(optional)</span>
                              </td>
                              <td className="px-3 py-2 text-slate-500">
                                Same URL, or leave empty
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Step 5 */}
                  <div className="flex gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-violet-800 text-[10px] font-bold shrink-0 mt-0.5">5</span>
                    <div className="text-xs text-violet-800">
                      Click <strong>Save &amp; Apply</strong> at the bottom of the page. The gateway will now
                      POST uplink data to FioTec whenever a registered device transmits.
                    </div>
                  </div>

                  {/* Step 6 — Verification */}
                  <div className="flex gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-emerald-800 text-[10px] font-bold shrink-0 mt-0.5">6</span>
                    <div className="text-xs text-violet-800">
                      Return to this panel and click <strong>Test Connection</strong> to verify the webhook is
                      reachable. A successful test will create a test entry in your sensor data feed and update
                      the "Last Received" timestamp. You can also check the{' '}
                      <strong>Live Sensor Data</strong> widget on the Dashboard for incoming uplinks.
                    </div>
                  </div>
                </div>

                {/* Codec warning callout */}
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3">
                  <CircleAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-800 space-y-1">
                    <p className="font-semibold">Payload Codec note</p>
                    <p>
                      Without a codec, FioTec will only receive raw Base64-encoded data in each uplink.
                      To get decoded sensor values (e.g. <code className="bg-amber-100 px-0.5 rounded">temperature: 25.5</code>,{' '}
                      <code className="bg-amber-100 px-0.5 rounded">smoke_status: 0</code>), select a
                      built-in codec matching your end-device model in the Application's Payload Codec dropdown,
                      or write a custom JavaScript decoder in the UG65/UG67's codec editor.
                    </p>
                  </div>
                </div>

                {/* Reference screenshot */}
                <div>
                  <button
                    onClick={() => setShowScreenshot(!showScreenshot)}
                    className="flex items-center gap-1.5 text-[11px] text-violet-600 hover:text-violet-700 font-medium"
                  >
                    <ImageIcon className="h-3 w-3" />
                    {showScreenshot ? 'Hide' : 'Show'} reference screenshot
                    {showScreenshot ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  <AnimatePresence>
                    {showScreenshot && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 rounded-md border border-violet-200 overflow-hidden bg-white">
                          <img
                            src={ug65Screenshot}
                            alt="Milesight UG65 Network Server — Applications configuration page showing Data Transmission HTTP settings with Uplink data, Join notification, ACK notification, and Error notification URL fields"
                            className="w-full h-auto"
                          />
                          <p className="px-3 py-2 text-[10px] text-slate-500 bg-slate-50 border-t border-slate-100">
                            UG65 Network Server &rarr; Applications &rarr; Data Transmission — paste the webhook URL into the "Uplink data" field
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Success note */}
                <p className="text-[11px] text-violet-600 border-t border-violet-100 pt-3">
                  Once configured, every uplink from devices in this application will be pushed to FioTec.
                  The parent gateway's heartbeat and signal strength will auto-update using the RSSI from each uplink
                  (formula: signal% = 2 &times; (dBm + 100), clamped 0-100).
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}