import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '@/app/utils/api';

interface ProfileContextType {
  profileName: string;
  profileRole: string;
  setProfileName: (name: string) => void;
  setProfileRole: (role: string) => void;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  profileName: '',
  profileRole: '',
  setProfileName: () => {},
  setProfileRole: () => {},
  refreshProfile: async () => {},
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  // Restore from localStorage for instant display, then refresh from server
  const [profileName, setProfileNameState] = useState(() => localStorage.getItem('fio_profile_name') || '');
  const [profileRole, setProfileRoleState] = useState(() => localStorage.getItem('fio_profile_role') || '');

  const setProfileName = useCallback((name: string) => {
    setProfileNameState(name);
    try { localStorage.setItem('fio_profile_name', name); } catch {}
  }, []);
  const setProfileRole = useCallback((role: string) => {
    setProfileRoleState(role);
    try { localStorage.setItem('fio_profile_role', role); } catch {}
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const settings = await api.getSettings();
      if (settings?.profile?.name) setProfileName(settings.profile.name);
      if (settings?.profile?.role) setProfileRole(settings.profile.role);
    } catch (err) {
      console.debug('ProfileContext: Failed to refresh profile:', err);
    }
  }, [setProfileName, setProfileRole]);

  useEffect(() => {
    // If we have a cached name in localStorage, no rush — fetch after main waterfall
    // If no cached name, fetch quickly so the user sees their name soon
    const hasCache = !!localStorage.getItem('fio_profile_name');
    const delay = hasCache ? 12000 : 3000;
    const t = setTimeout(() => refreshProfile(), delay);
    return () => clearTimeout(t);
  }, [refreshProfile]);

  // Listen for instant profile updates from Settings page
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.name) setProfileName(detail.name);
      if (detail?.role) setProfileRole(detail.role);
    };
    window.addEventListener('fiotech-profile-update', handler);
    return () => window.removeEventListener('fiotech-profile-update', handler);
  }, []);

  return (
    <ProfileContext.Provider value={{ profileName, profileRole, setProfileName, setProfileRole, refreshProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}