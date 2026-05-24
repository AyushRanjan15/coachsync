import { View, Text, StyleSheet } from 'react-native';

export default function AthleteLibrary() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Your videos will appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  placeholder: { color: '#999', fontSize: 16 },
});
