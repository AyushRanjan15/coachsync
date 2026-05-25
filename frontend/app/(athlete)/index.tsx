import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { listVideos, Video } from '../../lib/videos';

export default function AthleteLibrary() {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setVideos(await listVideos());
    } catch (e) {
      setError('Could not load videos. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  const onRefresh = useCallback(() => load(true), []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <FlatList
      data={videos}
      keyExtractor={(v) => v.videoId}
      contentContainerStyle={videos.length === 0 ? styles.emptyContainer : styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No videos yet</Text>
          <Text style={styles.emptySubtext}>
            {error ?? 'Head to the Record tab to upload your first clip.'}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push(`/(athlete)/video/${item.videoId}`)}
          activeOpacity={0.7}
        >
          <View style={styles.cardIcon}>
            <Text style={styles.cardIconText}>▶</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.exercise || 'Untitled'}
            </Text>
            <Text style={styles.cardDate}>{item.sessionDate}</Text>
            {item.notes ? (
              <Text style={styles.cardNotes} numberOfLines={1}>{item.notes}</Text>
            ) : null}
          </View>
          <View style={[styles.badge, item.uploaded ? styles.badgeDone : styles.badgePending]}>
            <Text style={styles.badgeText}>{item.uploaded ? 'Ready' : 'Processing'}</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyContainer: { flex: 1 },
  list: { padding: 16, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#F0F4FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardIconText: { fontSize: 18, color: '#007AFF' },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  cardDate: { fontSize: 13, color: '#999', marginTop: 2 },
  cardNotes: { fontSize: 13, color: '#666', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginLeft: 8 },
  badgeDone: { backgroundColor: '#E6F4EA' },
  badgePending: { backgroundColor: '#FFF3E0' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#444' },
});
