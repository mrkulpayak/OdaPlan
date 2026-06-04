import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { LoginPage } from './pages/LoginPage';
import { PlannerPage } from './pages/PlannerPage';
import { useCatalogStore } from './store/catalogStore';

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return isOnline;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const isOnline = useOnlineStatus();
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) setWasOffline(true);
    // Re-sync catalog when back online
    if (isOnline && wasOffline && session) {
      useCatalogStore.getState().loadCatalog(session.user.id);
      setWasOffline(false);
    }
  }, [isOnline, wasOffline, session]);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 3000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      setSession(session);
      setLoading(false);
    }).catch(() => {
      clearTimeout(timeout);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center w-full h-screen bg-background"
        style={{ fontFamily: 'var(--font-body)', color: 'var(--color-text-muted)', fontSize: 'var(--text-base)' }}
      >
        Loading...
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <>
      {!isOnline && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--color-warning)',
            color: '#fff',
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            textAlign: 'center',
            padding: '6px 16px',
            pointerEvents: 'none',
          }}
        >
          No internet connection. You can continue planning, but catalog changes won't save.
        </div>
      )}
      <PlannerPage session={session} />
    </>
  );
}

export default App;
