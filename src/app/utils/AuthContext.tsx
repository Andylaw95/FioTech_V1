import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { setDemoMode as setApiDemoMode } from '@/app/utils/demoMode';

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
  isDemoMode: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name: string, accountType?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  demoLogin: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  accessToken: null,
  loading: true,
  isDemoMode: false,
  isAdmin: false,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signOut: async () => {},
  demoLogin: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin status from server whenever accessToken changes
  const checkAdminStatus = useCallback(async (token: string | null) => {
    if (!token || token === 'demo-token') {
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

  useEffect(() => {
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
        }
      } catch (err) {
        console.error('AuthContext: Error checking session:', err);
      } finally {
        // Mark initial check as done BEFORE setting loading=false so the
        // onAuthStateChange handler can safely process future events.
        initialCheckDone.current = true;
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes (sign-in, sign-out, token refresh).
    // The listener fires IMMEDIATELY with the current localStorage session
    // before checkSession completes.  We gate it with initialCheckDone so
    // it only responds to real events (like sign-out or token refresh)
    // after the initial validation is finished.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!initialCheckDone.current) {
        // Skip — checkSession() will handle the initial session.
        return;
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
    });

    return () => subscription.unsubscribe();
  }, [checkAdminStatus]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        console.error('Sign in error:', error.message);
        return { error: error.message };
      }
      if (data.session) {
        setAccessToken(data.session.access_token);
        setUser({
          id: data.session.user.id,
          email: data.session.user.email || '',
          name:
            data.session.user.user_metadata?.name || email.split('@')[0],
        });
        checkAdminStatus(data.session.access_token);
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

        const signInResult = await signIn(email, password);
        return signInResult;
      } catch (err: any) {
        console.error('Signup exception:', err);
        return { error: err.message || 'Signup failed' };
      }
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAccessToken(null);
    setIsDemoMode(false);
    setIsAdmin(false);
    setApiDemoMode(false);
  }, []);

  const demoLogin = useCallback(() => {
    setApiDemoMode(true);
    setUser({ id: 'demo-user', email: 'demo@fiotech.io', name: 'Demo User' });
    setAccessToken('demo-token');
    setIsDemoMode(true);
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, loading, isDemoMode, isAdmin, signIn, signUp, signOut, demoLogin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}