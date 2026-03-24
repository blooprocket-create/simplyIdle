import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

interface AuthScreenProps {
  onAuthenticated: (username: string) => void;
}

interface AccountRecord {
  username: string;
  createdAt: number;
  hashVersion: 1;
  passwordHash: string;
  passwordSalt: string;

  // Legacy support for previously stored plaintext records.
  password?: string;
}

const ACCOUNTS_KEY = 'idlerpg_accounts_v1';
const SESSION_KEY = 'idlerpg_current_account_v1';
const STORAGE_PREFIXES_TO_CLEAR = ['idlerpg_', 'simplyidle_'];
const HASH_ROUNDS = 12000;

function randomSalt(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  let current = `${salt}:${password}`;
  for (let i = 0; i < HASH_ROUNDS; i++) {
    current = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, current);
  }
  return current;
}

async function verifyPassword(record: AccountRecord, password: string): Promise<boolean> {
  if (record.passwordHash && record.passwordSalt) {
    const digest = await hashPassword(password, record.passwordSalt);
    return digest === record.passwordHash;
  }

  // Legacy fallback (migrated on successful login).
  return !!record.password && record.password === password;
}

async function migrateLegacyRecord(record: AccountRecord): Promise<AccountRecord> {
  if (record.passwordHash && record.passwordSalt) return record;
  const salt = randomSalt();
  const passwordHash = await hashPassword(record.password ?? '', salt);
  return {
    ...record,
    hashVersion: 1,
    passwordHash,
    passwordSalt: salt,
    password: undefined,
  };
}

async function loadAccounts(): Promise<AccountRecord[]> {
  const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as AccountRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAccounts(accounts: AccountRecord[]): Promise<void> {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (username.trim().length < 3) return false;
    if (password.length < 8) return false;
    if (mode === 'register' && password !== confirmPassword) return false;
    return true;
  }, [busy, username, password, confirmPassword, mode]);

  async function handleSubmit() {
    const cleanUsername = username.trim().toLowerCase();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);

    try {
      const accounts = await loadAccounts();
      const existing = accounts.find(a => a.username === cleanUsername);

      if (mode === 'register') {
        if (existing) {
          setError('Username already exists. Try logging in.');
          return;
        }

        const salt = randomSalt();
        const passwordHash = await hashPassword(password, salt);
        const nextAccounts: AccountRecord[] = [
          ...accounts,
          {
            username: cleanUsername,
            createdAt: Date.now(),
            hashVersion: 1,
            passwordHash,
            passwordSalt: salt,
          },
        ];
        await saveAccounts(nextAccounts);
        await AsyncStorage.setItem(SESSION_KEY, cleanUsername);
        onAuthenticated(cleanUsername);
        return;
      }

      if (!existing || !(await verifyPassword(existing, password))) {
        setError('Invalid username or password.');
        return;
      }

      // Upgrade any legacy plaintext account to hashed credentials.
      if (!existing.passwordHash || !existing.passwordSalt) {
        const upgraded = await migrateLegacyRecord(existing);
        const nextAccounts = accounts.map(a => a.username === cleanUsername ? upgraded : a);
        await saveAccounts(nextAccounts);
      }

      await AsyncStorage.setItem(SESSION_KEY, cleanUsername);
      onAuthenticated(cleanUsername);
    } finally {
      setBusy(false);
    }
  }

  function requestWipeAllData() {
    if (busy) return;
    Alert.alert(
      'Delete Local Data?',
      'This will erase all local accounts, sessions, saves, and telemetry on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              const keys = await AsyncStorage.getAllKeys();
              const scopedKeys = keys.filter(key => STORAGE_PREFIXES_TO_CLEAR.some(prefix => key.startsWith(prefix)));
              if (scopedKeys.length > 0) {
                await AsyncStorage.multiRemove(scopedKeys);
              }
              setUsername('');
              setPassword('');
              setConfirmPassword('');
              setMode('login');
              setError(`Local data wiped. Removed ${scopedKeys.length} storage keys.`);
            } catch {
              setError('Failed to wipe local data. Please try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A18" />
      <View style={styles.wrap}>
        <Text style={styles.title}>SimplyIdle</Text>
        <Text style={styles.subtitle}>Create an account or log in to continue.</Text>

        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
            onPress={() => {
              setMode('login');
              setError(null);
            }}
          >
            <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>Login</Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === 'register' && styles.modeBtnActive]}
            onPress={() => {
              setMode('register');
              setError(null);
            }}
          >
            <Text style={[styles.modeBtnText, mode === 'register' && styles.modeBtnTextActive]}>Create Account</Text>
          </Pressable>
        </View>

        <TextInput
          value={username}
          onChangeText={setUsername}
          style={styles.input}
          autoCapitalize="none"
          placeholder="Username"
          placeholderTextColor="#777"
          maxLength={24}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor="#777"
          maxLength={32}
        />

        {mode === 'register' && (
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={styles.input}
            secureTextEntry
            placeholder="Confirm Password"
            placeholderTextColor="#777"
            maxLength={32}
          />
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          <Text style={styles.submitBtnText}>{busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create Account'}</Text>
        </Pressable>

        <Pressable
          style={[styles.wipeBtn, busy && styles.submitBtnDisabled]}
          disabled={busy}
          onPress={requestWipeAllData}
        >
          <Text style={styles.wipeBtnText}>Delete All Local Data</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export const AUTH_STORAGE_KEYS = {
  accounts: ACCOUNTS_KEY,
  session: SESSION_KEY,
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0A18',
  },
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#9A9AB8',
    marginBottom: 20,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#3A3A58',
    borderRadius: 6,
    backgroundColor: '#111122',
    alignItems: 'center',
  },
  modeBtnActive: {
    borderColor: '#6DDB7B',
    backgroundColor: '#1a2a20',
  },
  modeBtnText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: '#FFF',
  },
  input: {
    borderWidth: 1,
    borderColor: '#3A3A58',
    borderRadius: 6,
    backgroundColor: '#111122',
    color: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  error: {
    color: '#FF7C8A',
    fontSize: 12,
    marginBottom: 8,
  },
  submitBtn: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#6DDB7B',
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  wipeBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6A2D35',
    backgroundColor: '#2A1418',
    alignItems: 'center',
  },
  wipeBtnText: {
    color: '#FF9BA4',
    fontSize: 12,
    fontWeight: '700',
  },
});
