/**
 * AlarmAlertMonitor — Headless component that combines:
 *   1) Supabase Realtime Broadcast for INSTANT push (< 1 sec)
 *   2) 30s polling as fallback (in case Realtime connection drops)
 *
 * When the backend webhook detects a critical alarm (water leak, fire, smoke),
 * it POSTs to the Supabase Realtime Broadcast API. This component subscribes
 * to the user's personal channel and fires a sonner toast + alert beep immediately.
 *
 * Tracks seen alarm IDs in localStorage so refreshing the page doesn't re-toast old alarms.
 * Dispatches a 'fiotech-new-alarm' custom event when new alarms arrive, so
 * NotificationDropdown can update its badge immediately.
 */
import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { api, type Notification } from '@/app/utils/api';
import { supabase } from '@/app/utils/AuthContext';

// ─── Seen-ID persistence ────────────────────────────────────────
const SEEN_KEY = 'fiotech_seen_alarm_ids';

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* corrupt data — start fresh */ }
  return new Set();
}

function saveSeenIds(ids: Set<string>) {
  try {
    // Keep only latest 200 IDs to prevent unbounded growth
    const arr = [...ids].slice(-200);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch { /* quota — best effort */ }
}

// ─── Helpers ─────────────────────────────────────────────────────

function getAlarmEmoji(type: string): string {
  if (/water|leak/i.test(type)) return '💧';
  if (/fire/i.test(type)) return '🔥';
  if (/smoke/i.test(type)) return '💨';
  if (/temp/i.test(type)) return '🌡️';
  if (/humid/i.test(type)) return '💦';
  if (/offline/i.test(type)) return '📡';
  return '⚠️';
}

function isCritical(type: string): boolean {
  return /water|leak|fire|smoke/i.test(type);
}

function alarmPageUrl(type: string): string {
  if (/water|leak/i.test(type)) return '/alarms/water';
  if (/fire/i.test(type)) return '/alarms/fire';
  if (/smoke/i.test(type)) return '/alarms/smoke';
  return '/alarms';
}

// ─── Alert sound (Web Audio API) ─────────────────────────────────
// Two-tone beep: 880 Hz → 1100 Hz, each 200ms, volume 0.3
function playAlertSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const beep = (freq: number, startAt: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.2);
      osc.start(startAt);
      osc.stop(startAt + 0.25);
    };

    beep(880, ctx.currentTime);
    beep(1100, ctx.currentTime + 0.25);
    beep(880, ctx.currentTime + 0.5);
  } catch { /* AudioContext not available */ }
}

// ─── Component ───────────────────────────────────────────────────

const POLL_INTERVAL = 30_000;   // 30 seconds (fallback — Realtime handles instant)
const INITIAL_DELAY = 5_000;    // 5 seconds after mount
const TOAST_DURATION = 15_000;  // 15 seconds visible

export function AlarmAlertMonitor() {
  const seenIdsRef = useRef<Set<string>>(loadSeenIds());
  const isFirstPollRef = useRef(true);
  const isFetchingRef = useRef(false);

  /** Show a single alarm as a toast + sound */
  const showAlarmToast = useCallback((alarm: { id: string; type: string; description: string; property?: string; location?: string }) => {
    if (seenIdsRef.current.has(alarm.id)) return; // already seen
    seenIdsRef.current.add(alarm.id);
    saveSeenIds(seenIdsRef.current);

    const emoji = getAlarmEmoji(alarm.type);
    const critical = isCritical(alarm.type);
    const toastFn = critical ? toast.error : toast.warning;

    toastFn(`${emoji}  ${alarm.type}`, {
      description: `${alarm.description}\n📍 ${alarm.property || ''} · ${alarm.location || ''}`,
      duration: TOAST_DURATION,
      action: {
        label: 'View',
        onClick: () => { window.location.href = alarmPageUrl(alarm.type); },
      },
    });

    if (critical) playAlertSound();
    window.dispatchEvent(new Event('fiotech-new-alarm'));
  }, []);

  const checkAlarms = useCallback(async () => {
    if (isFetchingRef.current || document.hidden) return;
    isFetchingRef.current = true;

    try {
      const data = await api.getNotifications();
      const notifications: Notification[] = data?.notifications ?? [];

      if (isFirstPollRef.current) {
        // First poll after mount: seed the seen IDs (no toasting)
        notifications.forEach((n) => seenIdsRef.current.add(n.id));
        saveSeenIds(seenIdsRef.current);
        isFirstPollRef.current = false;
        return;
      }

      // Detect new (unseen) alarms
      const newAlarms = notifications.filter((n) => !seenIdsRef.current.has(n.id));

      if (newAlarms.length > 0) {
        let soundPlayed = false;

        newAlarms.forEach((alarm) => {
          seenIdsRef.current.add(alarm.id);

          const emoji = getAlarmEmoji(alarm.type);
          const critical = isCritical(alarm.type);
          const toastFn = critical ? toast.error : toast.warning;

          toastFn(`${emoji}  ${alarm.type}`, {
            description: `${alarm.description}\n📍 ${alarm.property} · ${alarm.location}`,
            duration: TOAST_DURATION,
            action: {
              label: 'View',
              onClick: () => {
                window.location.href = alarmPageUrl(alarm.type);
              },
            },
          });

          // Play alert sound once per batch for critical alarms
          if (critical && !soundPlayed) {
            playAlertSound();
            soundPlayed = true;
          }
        });

        saveSeenIds(seenIdsRef.current);

        // Notify NotificationDropdown to refresh its badge immediately
        window.dispatchEvent(new Event('fiotech-new-alarm'));
      }
    } catch (err) {
      console.debug('AlarmAlertMonitor: poll failed', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // ─── Supabase Realtime: instant push from backend ──────────────
  useEffect(() => {
    // Get user ID from supabase session for channel subscription
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtime = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) {
          console.debug('AlarmAlertMonitor: no session, Realtime not subscribed');
          return;
        }

        const channelName = `alarm-push-${userId}`;
        channelRef = supabase.channel(channelName);

        channelRef
          .on('broadcast', { event: 'critical-alarm' }, (msg: any) => {
            console.log('[Realtime] Received critical alarm push:', msg);
            const alarm = msg?.payload?.alarm;
            if (alarm && alarm.id) {
              showAlarmToast(alarm);
              // Also trigger a full refresh to catch any other new alarms
              checkAlarms();
            }
          })
          .subscribe((status: string) => {
            console.log(`[Realtime] alarm-push channel: ${status}`);
          });
      } catch (err) {
        console.debug('AlarmAlertMonitor: Realtime setup failed', err);
      }
    };

    setupRealtime();

    return () => {
      if (channelRef) {
        supabase.removeChannel(channelRef);
      }
    };
  }, [showAlarmToast, checkAlarms]);

  // ─── Fallback polling (30s) + visibility change ───────────────
  useEffect(() => {
    const initialTimer = setTimeout(checkAlarms, INITIAL_DELAY);
    const interval = setInterval(checkAlarms, POLL_INTERVAL);

    // Also check when tab becomes visible again
    const onVisibilityChange = () => {
      if (!document.hidden) checkAlarms();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkAlarms]);

  return null; // headless — no rendered UI
}
