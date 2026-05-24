import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Slot, useRouter } from 'expo-router';
import { getGroups, getIdToken } from '../lib/auth';

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; role: 'athlete' | 'coach' };

export default function RootLayout() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const navigated = useRef(false);
  const router = useRouter();

  useEffect(() => {
    async function check() {
      try {
        const token = await getIdToken();
        if (!token) {
          setAuth({ status: 'unauthenticated' });
          return;
        }
        const groups = await getGroups();
        setAuth({
          status: 'authenticated',
          role: groups.includes('coaches') ? 'coach' : 'athlete',
        });
      } catch (e) {
        console.warn('Auth check failed, defaulting to unauthenticated:', e);
        setAuth({ status: 'unauthenticated' });
      }
    }
    check();
  }, []);

  // Navigate once when auth state is first resolved.
  useEffect(() => {
    if (auth.status === 'loading' || navigated.current) return;
    navigated.current = true;
    if (auth.status === 'unauthenticated') {
      router.replace('/sign-in');
    } else {
      router.replace(auth.role === 'coach' ? '/(coach)' : '/(athlete)');
    }
  }, [auth]);

  // Always render <Slot> so the navigation tree is mounted and router works.
  // Overlay the spinner on top while we're still checking.
  return (
    <View style={styles.root}>
      <Slot />
      {auth.status === 'loading' && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
