import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { tokenStore } from '../src/auth/tokenStore';
import { getMe, updateProfile } from '../src/api/user';
import type { User } from '../src/types';
import { COLORS } from '../src/constants';
import Constants from 'expo-constants';
import { useState } from 'react';

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const { data: userData } = useQuery<{ success: boolean; data: User }>({
    queryKey: ['me'],
    queryFn: () => getMe().then((r) => r.data),
  });
  const user = userData?.data;

  const { mutate: saveName, isPending: isSaving } = useMutation({
    mutationFn: (name: string) => updateProfile(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setEditingName(false);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to update name. Please try again.');
    },
  });

  const handleEditName = () => {
    setNameInput(user?.name ?? '');
    setEditingName(true);
  };

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    saveName(trimmed);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await GoogleSignin.signOut();
          await tokenStore.clearTokens();
          queryClient.clear();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {/* 계정 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.card}>
            {/* 닉네임 행 */}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Name</Text>
              {editingName ? (
                <View style={styles.editRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                    maxLength={30}
                  />
                  <TouchableOpacity onPress={handleSaveName} disabled={isSaving}>
                    <Text style={styles.saveText}>{isSaving ? '...' : 'Save'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingName(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.editRow} onPress={handleEditName}>
                  <Text style={styles.rowValue}>{user?.name ?? '—'}</Text>
                  <Text style={styles.editText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{user?.email ?? '—'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Provider</Text>
              <Text style={styles.rowValue}>Google</Text>
            </View>
          </View>
        </View>

        {/* 앱 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>APP</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Version</Text>
              <Text style={styles.rowValue}>v{appVersion}</Text>
            </View>
          </View>
        </View>

        {/* 로그아웃 */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F5F5F5',
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: '#1a1a1a', fontSize: 22 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1a1a1a' },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 24,
  },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: { fontSize: 15, color: '#1a1a1a', fontWeight: '500' },
  rowValue: { fontSize: 15, color: COLORS.textSecondary },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 16 },
  signOutButton: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFCCCC',
  },
  signOutText: { fontSize: 16, fontWeight: '600', color: '#E55' },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nameInput: {
    fontSize: 15,
    color: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    minWidth: 120,
    paddingVertical: 2,
  },
  saveText: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  cancelText: { fontSize: 14, color: COLORS.textSecondary },
  editText: { fontSize: 13, color: COLORS.textSecondary },
});
