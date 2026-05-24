import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { signIn, getGroups } from '../lib/auth';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignIn() {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      const groups = await getGroups();
      router.replace(groups.includes('coaches') ? '/(coach)' : '/(athlete)');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Check your credentials.';
      Alert.alert('Sign in failed', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>CoachSync</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSignIn}
          returnKeyType="go"
        />
        <TouchableOpacity style={styles.button} onPress={handleSignIn} disabled={loading}>
          {loading
            ? <ActivityIndicator color="white" />
            : <Text style={styles.buttonText}>Sign in</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 34, fontWeight: '700', textAlign: 'center', marginBottom: 48 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
