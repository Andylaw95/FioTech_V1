import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';


const supabaseUrl = `https://${projectId}.supabase.co`;
const BASE_URL = `${supabaseUrl}/functions/v1/make-server-4916a0b9`;

// Singleton Supabase client for the frontend
const supabase = createClient(supabaseUrl, publicAnonKey);

export { supabase };

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name: string, accountType?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  accessToken: null,
  loading: true,
  isAdmin: false,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin status from server whenever accessToken changes
  const checkAdminStatus = useCallback(async (token: string | null) => {
    if (!token) {
      setIsAdmin(false);
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/admin/check`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'x-user-token': token,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(!!data.isAdmin);
      } else {
        setIsAdmin(false);
      }
    } catch {
      setIsAdmin(false);
    }
  }, []);

  // Guard: block onAuthStateChange from setting user until initial
  // checkSession has validated the session server-side.
  const initialCheckDone = useRef(false);

  // Detect if the URL contains auth callback hash params (e.g. after
  // email confirmation or password recovery redirect from Supabase).
  // When present, Supabase JS will process them asynchronously, so we
  // keep showing the loading state until onAuthStateChange fires.
  const hasAuthCallbackHash = useRef(() => {
    try {
      const hash = window.location.hash;
      return hash.includes('access_token=') || hash.includes('type=');
    } catch { return false; }
  });

  useEffect(() => {
    const urlHasAuthCallback = hasAuthCallbackHash.current();

    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        let session = data?.session;

        if (session?.access_token) {
          // Validate the session server-side. getSession() only reads
          // from localStorage and can return a stale/invalid JWT whose
          // signature the Edge Function gateway will reject.
          const { data: userData, error: userError } =
            await supabase.auth.getUser(session.access_token);

          if (userError || !userData?.user) {
            console.debug('AuthContext: Stored JWT invalid, attempting refresh...');
            const { data: refreshData, error: refreshError } =
              await supabase.auth.refreshSession();

            if (!refreshError && refreshData?.session) {
              session = refreshData.session;
            } else {
              console.error(
                'AuthContext: Refresh failed, signing out:',
                refreshError?.message ?? 'no session returned',
              );
              await supabase.auth.signOut();
              session = null;
            }
          }
        }

        if (session) {
          setAccessToken(session.access_token);
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name:
              session.user.user_metadata?.name ||
              session.user.email?.split('@')[0] ||
              '',
          });
          checkAdminStatus(session.access_token);
          initialCheckDone.current = true;
          setLoading(false);
        } else if (urlHasAuthCallback) {
          // Hash tokens present but session not ready yet.
          // Keep loading=true — onAuthStateChange will fire once
          // Supabase processes the hash, then we'll update state.
          // Safety timeout: if nothing happens within 10s, stop waiting.
          initialCheckDone.current = true;
          const fallback = setTimeout(() => {
            // Clean the hash so user sees the login page cleanly
            if (window.location.hash) {
              window.history.replaceState(null, '', window.location.pathname);
            }
            setLoading(false);
          }, 10000);
          // Store for cleanup
          (window as any).__authFallbackTimer = fallback;
        } else {
          initialCheckDone.current = true;
          setLoading(false);
        }
      } catch (err) {
        console.error('AuthContext: Error checking session:', err);
        initialCheckDone.current = true;
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes (sign-in, sign-out, token refresh,
    // email confirmation callback, password recovery callback).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!initialCheckDone.current) {
        // Skip — checkSession() will handle the initial session.
        return;
      }

      // Clear the auth callback fallback timer if it was set
      if ((window as any).__authFallbackTimer) {
        clearTimeout((window as any).__authFallbackTimer);
        delete (window as any).__authFallbackTimer;
      }

      // Clean hash fragment from URL after processing auth callback
      if (window.location.hash && (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY')) {
        window.history.replaceState(null, '', window.location.pathname);
      }

      if (session) {
        setAccessToken(session.access_token);
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name:
            session.user.user_metadata?.name ||
            session.user.email?.split('@')[0] ||
            '',
        });
        checkAdminStatus(session.access_token);
      } else {
        setUser(null);
        setAccessToken(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [checkAdminStatus]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      // Use rate-limited login proxy via Edge Function
      const res = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || data.error_description || data.msg || 'Login failed';
        console.error('Sign in error:', msg);
        return { error: msg };
      }
      // Set session from the proxied auth response
      if (data.access_token && data.refresh_token) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (setErr) {
          console.error('Session set error:', setErr.message);
          return { error: setErr.message };
        }
        setAccessToken(data.access_token);
        setUser({
          id: data.user?.id || '',
          email: data.user?.email || email,
          name: data.user?.user_metadata?.name || email.split('@')[0],
        });
        checkAdminStatus(data.access_token);
      }
      return {};
    } catch (err: any) {
      console.error('Sign in exception:', err);
      return { error: err.message || 'Sign in failed' };
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string, accountType?: string) => {
      try {
        const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-4916a0b9`;
        const res = await fetch(`${BASE_URL}/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
            apikey: publicAnonKey,
          },
          body: JSON.stringify({ email, password, name, accountType: accountType || 'standard' }),
        });

        const result = await res.json();
        if (!res.ok || result.error) {
          return { error: result.error || 'Signup failed' };
        }

        // Account created. A confirmation email has been sent.
        // Do NOT auto-signIn — the user must verify their email first.
        return {};
      } catch (err: any) {
        console.error('Signup exception:', err);
        return { error: err.message || 'Signup failed' };
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAccessToken(null);
    setIsAdmin(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, loading, isAdmin, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}