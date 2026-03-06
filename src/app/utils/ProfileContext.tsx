import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '@/app/utils/api';

interface ProfileContextType {
  profileName: string;
  profileRole: string;
  profileAvatar: string;
  setProfileName: (name: string) => void;
  setProfileRole: (role: string) => void;
  setProfileAvatar: (url: string) => void;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  profileName: '',
  profileRole: '',
  profileAvatar: '',
  setProfileName: () => {},
  setProfileRole: () => {},
  setProfileAvatar: () => {},
  refreshProfile: async () => {},
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  // Restore from localStorage for instant display, then refresh from server
  const [profileName, setProfileNameState] = useState(() => localStorage.getItem('fio_profile_name') || '');
  const [profileRole, setProfileRoleState] = useState(() => localStorage.getItem('fio_profile_role') || '');
  const [profileAvatar, setProfileAvatarState] = useState(() => localStorage.getItem('fio_profile_avatar') || '');

  const setProfileName = useCallback((name: string) => {
    setProfileNameState(name);
    try { localStorage.setItem('fio_profile_name', name); } catch {}
  }, []);
  const setProfileRole = useCallback((role: string) => {
    setProfileRoleState(role);
    try { localStorage.setItem('fio_profile_role', role); } catch {}
  }, []);
  const setProfileAvatar = useCallback((url: string) => {
    setProfileAvatarState(url);
    try { localStorage.setItem('fio_profile_avatar', url); } catch {}
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const settings = await api.getSettings();
      if (settings?.profile?.name) setProfileName(settings.profile.name);
      if (settings?.profile?.role) setProfileRole(settings.profile.role);
      if (settings?.profile?.avatar !== undefined) setProfileAvatar(settings.profile.avatar || '');
    } catch (err) {
      console.debug('ProfileContext: Failed to refresh profile:', err);
    }
  }, [setProfileName, setProfileRole, setProfileAvatar]);

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
      if (detail?.avatar !== undefined) setProfileAvatar(detail.avatar || '');
    };
    window.addEventListener('fiotec-profile-update', handler);
    return () => window.removeEventListener('fiotec-profile-update', handler);
  }, []);

  return (
    <ProfileContext.Provider value={{ profileName, profileRole, profileAvatar, setProfileName, setProfileRole, setProfileAvatar, refreshProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}