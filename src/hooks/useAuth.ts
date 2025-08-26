import { useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import api from '../api';

export type AppRole = 'admin' | 'student';
export type Profile = { id: string; user_id: string; full_name?: string; avatar_url?: string; role: AppRole };

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setProfile(null); // reset profile; will refetch
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (!session) { setProfile(null); return; }
      try {
        const p = await api.getMyProfile();
        setProfile(p);
        // Ensure a workspace is selected/created and saved to localStorage
        try {
          const wsList = await api.listWorkspaces();
          // Try read existing selection
          let selected: string | null = null;
          try { selected = localStorage.getItem('currentWorkspaceId'); } catch {}
          const exists = wsList.find(w => w.id === selected);
          if (exists) {
            // keep current selection
          } else if (wsList.length > 0) {
            // pick the first workspace
            try { localStorage.setItem('currentWorkspaceId', wsList[0].id); } catch {}
          } else {
            // create a default workspace
            const created = await api.createWorkspace({ name: 'Default Workspace' });
            try { localStorage.setItem('currentWorkspaceId', created.id); } catch {}
          }
          // eslint-disable-next-line no-console
          console.log('[auth] workspace ready:', localStorage.getItem('currentWorkspaceId'));
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[auth] workspace setup skipped:', e);
        }
      } catch (e: any) {
        // Profile may be auto-created on BE; ignore 404, show other errors
        setError(e?.message || 'Không thể tải hồ sơ');
      }
    })();
  }, [session]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { session, user, profile, loading, error, signIn, signUp, signOut, refreshProfile: async () => setProfile(await api.getMyProfile()) };
}

export default useAuth;
