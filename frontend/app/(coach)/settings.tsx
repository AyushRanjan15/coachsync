import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from '../../lib/auth';
import { api, MeResponse } from '../../lib/api';

export default function CoachSettings() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    api.get<MeResponse>('/me').then(setMe).finally(() => setLoading(false));
  }, []);

  function handleSignOut() {
    signOut();
    router.replace('/sign-in');
  }

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{me?.email}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Role</Text>
        <Text style={styles.value}>{me?.role}</Text>
      </View>
      <TouchableOpacity style={styles.signOut} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
  label: { fontSize: 12, color: '#999', textTransform: 'uppercase', marginBottom: 2 },
  value: { fontSize: 16 },
  signOut: {
    marginTop: 40,
    padding: 16,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    alignItems: 'center',
  },
  signOutText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
