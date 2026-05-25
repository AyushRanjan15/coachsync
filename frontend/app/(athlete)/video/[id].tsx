import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { fetchVideo, Video } from '../../../lib/videos';

export default function VideoDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);

  const player = useVideoPlayer(video?.playbackUrl ?? null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    fetchVideo(id)
      .then((v) => {
        setVideo(v);
        navigation.setOptions({ title: v.exercise || 'Video' });
      })
      .catch(() => Alert.alert('Error', 'Could not load video.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!video) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Video not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.playerContainer}>
        {video.playbackUrl ? (
          <VideoView
            player={player}
            style={styles.player}
            allowsFullscreen
            allowsPictureInPicture
          />
        ) : (
          <View style={[styles.player, styles.playerPlaceholder]}>
            <Text style={styles.playerPlaceholderText}>
              {video.uploaded ? 'Playback unavailable' : 'Processing…'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.meta}>
        <Text style={styles.title}>{video.exercise || 'Untitled'}</Text>
        <Text style={styles.date}>{video.sessionDate}</Text>

        {video.notes ? (
          <>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.notes}>{video.notes}</Text>
          </>
        ) : null}

        <View style={styles.statusRow}>
          <View style={[styles.badge, video.uploaded ? styles.badgeDone : styles.badgePending]}>
            <Text style={styles.badgeText}>{video.uploaded ? 'Ready' : 'Processing'}</Text>
          </View>
          {video.durationSec ? (
            <Text style={styles.duration}>{formatDuration(video.durationSec)}</Text>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  errorText: { color: '#999', fontSize: 16 },
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 40 },
  playerContainer: { backgroundColor: '#000' },
  player: { width: '100%', aspectRatio: 16 / 9 },
  playerPlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  playerPlaceholderText: { color: '#666', fontSize: 15 },
  meta: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  date: { fontSize: 14, color: '#999', marginTop: 4 },
  sectionLabel: { fontSize: 12, color: '#999', textTransform: 'uppercase', marginTop: 20, marginBottom: 6 },
  notes: { fontSize: 16, color: '#333', lineHeight: 22 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeDone: { backgroundColor: '#E6F4EA' },
  badgePending: { backgroundColor: '#FFF3E0' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#444' },
  duration: { fontSize: 14, color: '#666' },
});
