import { useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { createVideoRecord, uploadVideoFile } from '../../lib/videos';

type Phase = 'camera' | 'form' | 'uploading' | 'done';

const CONTENT_TYPE = 'video/quicktime';

export default function Record() {
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [phase, setPhase] = useState<Phase>('camera');
  const [isRecording, setIsRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [exercise, setExercise] = useState('');
  const [notes, setNotes] = useState('');
  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [progress, setProgress] = useState(0);

  // ── Permission gate ─────────────────────────────────────────────────────

  if (!cameraPermission || !micPermission) {
    return <View style={styles.center} />;
  }

  if (!cameraPermission.granted || !micPermission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera and microphone access needed.</Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={async () => {
            await requestCameraPermission();
            await requestMicPermission();
          }}
        >
          <Text style={styles.btnText}>Grant permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Camera phase ────────────────────────────────────────────────────────

  async function startRecording() {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 300 });
      if (video?.uri) {
        setVideoUri(video.uri);
        setPhase('form');
      }
    } catch (e) {
      Alert.alert('Recording failed', String(e));
    } finally {
      setIsRecording(false);
    }
  }

  function stopRecording() {
    cameraRef.current?.stopRecording();
  }

  if (phase === 'camera') {
    return (
      <View style={styles.fullscreen}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} mode="video" facing="back" />
        <View style={styles.recordRow}>
          <TouchableOpacity
            style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <View style={isRecording ? styles.stopIcon : styles.recordIcon} />
          </TouchableOpacity>
        </View>
        {isRecording && <Text style={styles.recLabel}>● REC</Text>}
      </View>
    );
  }

  // ── Metadata form ───────────────────────────────────────────────────────

  async function handleUpload() {
    if (!videoUri) return;
    setPhase('uploading');
    setProgress(0);
    try {
      const { videoId, uploadUrl } = await createVideoRecord({
        exercise,
        notes,
        sessionDate,
        contentType: CONTENT_TYPE,
      });
      await uploadVideoFile(uploadUrl, videoUri, CONTENT_TYPE, setProgress);
      console.log('Uploaded videoId:', videoId);
      setPhase('done');
    } catch (e) {
      Alert.alert('Upload failed', String(e));
      setPhase('form');
    }
  }

  if (phase === 'form') {
    return (
      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.heading}>Add details</Text>
        <Text style={styles.label}>Exercise</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. squat"
          value={exercise}
          onChangeText={setExercise}
        />
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Optional notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />
        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={sessionDate}
          onChangeText={setSessionDate}
        />
        <TouchableOpacity style={styles.btn} onPress={handleUpload}>
          <Text style={styles.btnText}>Upload</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => { setVideoUri(null); setPhase('camera'); }}
        >
          <Text style={styles.secondaryBtnText}>Re-record</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Uploading ───────────────────────────────────────────────────────────

  if (phase === 'uploading') {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>Uploading…</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{Math.round(progress * 100)}%</Text>
      </View>
    );
  }

  // ── Done ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.center}>
      <Text style={styles.doneEmoji}>✓</Text>
      <Text style={styles.heading}>Upload complete</Text>
      <Text style={styles.subText}>Your coach will be notified.</Text>
      <TouchableOpacity
        style={[styles.btn, { marginTop: 32 }]}
        onPress={() => {
          setVideoUri(null);
          setExercise('');
          setNotes('');
          setProgress(0);
          setPhase('camera');
        }}
      >
        <Text style={styles.btnText}>Record another</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreen: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  form: { padding: 24, backgroundColor: '#fff' },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 24 },
  subText: { color: '#666', marginTop: 8 },
  label: { fontSize: 12, color: '#999', textTransform: 'uppercase', marginBottom: 4, marginTop: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  multiline: { height: 80, textAlignVertical: 'top' },
  btn: { backgroundColor: '#007AFF', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 24 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  secondaryBtn: { alignItems: 'center', marginTop: 12, padding: 12 },
  secondaryBtnText: { color: '#007AFF', fontSize: 16 },
  permText: { fontSize: 16, textAlign: 'center', marginBottom: 20, color: '#444' },
  recordRow: { position: 'absolute', bottom: 60, left: 0, right: 0, alignItems: 'center' },
  recordBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordBtnActive: { borderColor: '#FF3B30' },
  recordIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FF3B30' },
  stopIcon: { width: 28, height: 28, borderRadius: 4, backgroundColor: '#FF3B30' },
  recLabel: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    color: '#FF3B30',
    fontWeight: '700',
    fontSize: 16,
  },
  progressTrack: {
    width: '80%',
    height: 8,
    backgroundColor: '#eee',
    borderRadius: 4,
    marginTop: 24,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#007AFF', borderRadius: 4 },
  progressLabel: { marginTop: 8, color: '#666' },
  doneEmoji: { fontSize: 56, marginBottom: 8 },
});
