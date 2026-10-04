import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Image, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Guide box sized to a standard trading card aspect ratio (2.5:3.5)
const GUIDE_WIDTH = SCREEN_WIDTH * 0.75;
const GUIDE_HEIGHT = GUIDE_WIDTH * 1.4;

// Your desktop's local IP address, from ipconfig (e.g. "192.168.0.13")
const MATCH_SERVER_URL = 'http://192.168.0.13:5000/match';

export default function Index() {
  const [activeTab, setActiveTab] = useState('scan');
  const [scanHistory, setScanHistory] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [pendingPhotoUri, setPendingPhotoUri] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const takePhoto = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });

      // Crop to the same relative region the guide box shows on-screen,
      // so the background/table doesn't dilute the match
      const scaleX = photo.width / SCREEN_WIDTH;
      const guideLeft = (SCREEN_WIDTH - GUIDE_WIDTH) / 2;
      const guideTop = (Dimensions.get('window').height - GUIDE_HEIGHT) / 2;

      const cropped = await ImageManipulator.manipulateAsync(
        photo.uri,
        [
          {
            crop: {
              originX: guideLeft * scaleX,
              originY: guideTop * scaleX,
              width: GUIDE_WIDTH * scaleX,
              height: GUIDE_HEIGHT * scaleX,
            },
          },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      setPendingPhotoUri(cropped.uri);
      setSearchResults([]);
      runImageMatch(cropped.uri);
    }
  };

  const runImageMatch = async (uri) => {
    setSearching(true);
    try {
      const formData = new FormData();
      formData.append('image', {
        uri,
        name: 'card.jpg',
        type: 'image/jpeg',
      });

      const res = await fetch(MATCH_SERVER_URL, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = await res.json();

      // Reuse the existing results list UI — map match fields to what it expects
      const mapped = (data.matches || []).map((m) => ({
        id: m.id,
        name: m.name,
        set: { name: m.set_name },
        images: { small: m.image_url },
        similarity: m.similarity,
      }));
      setSearchResults(mapped);
    } catch (err) {
      console.error('Image match failed', err);
    }
    setSearching(false);
  };

  const confirmCard = (match) => {
    // Pricing isn't wired up yet — TCGdex's pricing coverage is inconsistent,
    // so this stays at 0 until a dedicated pricing source is added.
    const newCard = {
      id: Date.now().toString(),
      name: match.name,
      set: match.set?.name || 'Unknown Set',
      marketPrice: 0,
      gradedPrice: 0,
      imageUri: pendingPhotoUri,
      referenceImage: match.images?.small,
      similarity: match.similarity,
      dateScanned: new Date().toLocaleDateString(),
    };
    setScanHistory((prev) => [...prev, newCard]);
    setPendingPhotoUri(null);
    setSearchResults([]);
    setActiveTab('history');
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <Text>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>We need camera access to scan cards</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Search / confirm screen shown right after taking a photo
  if (pendingPhotoUri) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity
          onPress={() => {
            setPendingPhotoUri(null);
            setSearchResults([]);
          }}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Retake</Text>
        </TouchableOpacity>
        <Image source={{ uri: pendingPhotoUri }} style={styles.previewThumb} />
        <TouchableOpacity style={styles.rescanButton} onPress={() => runImageMatch(pendingPhotoUri)}>
          <Text style={styles.buttonText}>Rescan</Text>
        </TouchableOpacity>
        {searching && <ActivityIndicator style={{ marginTop: 20 }} />}
        {!searching && searchResults.length === 0 && (
          <Text style={styles.emptyText}>No matches found — try rescanning with better lighting/angle.</Text>
        )}
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.resultItem} onPress={() => confirmCard(item)}>
              {item.images?.small && <Image source={{ uri: item.images.small }} style={styles.resultThumb} />}
              <View>
                <Text style={styles.listName}>{item.name}</Text>
                <Text style={styles.listSet}>{item.set?.name}</Text>
                <Text style={styles.similarityText}>{Math.round(item.similarity * 100)}% match</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    );
  }

  // Card detail screen
  if (selectedCard) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity onPress={() => setSelectedCard(null)} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.detailBox}>
          {selectedCard.imageUri && <Image source={{ uri: selectedCard.imageUri }} style={styles.cardImage} />}
          <Text style={styles.cardName}>{selectedCard.name}</Text>
          <Text style={styles.cardSet}>{selectedCard.set}</Text>
          <View style={styles.priceRow}>
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Market Value</Text>
              <Text style={styles.priceValue}>${selectedCard.marketPrice.toFixed(2)}</Text>
            </View>
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Graded Value*</Text>
              <Text style={styles.priceValue}>${selectedCard.gradedPrice.toFixed(2)}</Text>
            </View>
          </View>
          <Text style={styles.disclaimer}>*Estimated placeholder until real graded data is added</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Main scan / history screens
  return (
    <SafeAreaView style={styles.container}>
      {activeTab === 'scan' ? (
        <View style={{ flex: 1 }}>
          <CameraView style={{ flex: 1 }} facing="back" ref={cameraRef} />
          <View style={styles.guideBoxContainer} pointerEvents="none">
            <View style={styles.guideBox} />
          </View>
          <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
            <Text style={styles.buttonText}>Capture Card</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <Text style={styles.header}>History</Text>
          {scanHistory.length === 0 ? (
            <Text style={styles.emptyText}>No scans yet.</Text>
          ) : (
            <FlatList
              data={scanHistory}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.listItem} onPress={() => setSelectedCard(item)}>
                  {item.imageUri && <Image source={{ uri: item.imageUri }} style={styles.thumb} />}
                  <View>
                    <Text style={styles.listName}>{item.name}</Text>
                    <Text style={styles.listSet}>{item.set}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('scan')}>
          <Text style={activeTab === 'scan' ? styles.tabActive : styles.tabInactive}>Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('history')}>
          <Text style={activeTab === 'history' ? styles.tabActive : styles.tabInactive}>History</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 18, marginBottom: 20, color: '#555', textAlign: 'center' },
  button: { backgroundColor: '#007AFF', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  captureButton: { backgroundColor: '#007AFF', padding: 16, alignItems: 'center' },
  header: { fontSize: 28, fontWeight: 'bold', padding: 16 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40 },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  thumb: { width: 50, height: 50, borderRadius: 6, marginRight: 12 },
  listName: { fontSize: 17, fontWeight: '600' },
  listSet: { fontSize: 14, color: '#888' },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#ddd', paddingVertical: 10 },
  tabButton: { flex: 1, alignItems: 'center' },
  tabActive: { color: '#007AFF', fontWeight: '700', fontSize: 15 },
  tabInactive: { color: '#999', fontSize: 15 },
  backButton: { padding: 16 },
  backText: { color: '#007AFF', fontSize: 16 },
  detailBox: { padding: 24, alignItems: 'center' },
  cardImage: { width: 200, height: 280, borderRadius: 10, marginBottom: 16 },
  cardName: { fontSize: 26, fontWeight: 'bold' },
  cardSet: { fontSize: 16, color: '#888', marginBottom: 20 },
  priceRow: { flexDirection: 'row', gap: 30, marginTop: 20 },
  priceBox: { alignItems: 'center' },
  priceLabel: { fontSize: 13, color: '#888' },
  priceValue: { fontSize: 20, fontWeight: '700' },
  disclaimer: { fontSize: 11, color: '#aaa', marginTop: 12 },
  previewThumb: { width: 120, height: 168, borderRadius: 8, alignSelf: 'center', marginBottom: 12 },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 10 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginRight: 8 },
  searchButton: { backgroundColor: '#007AFF', paddingHorizontal: 16, justifyContent: 'center', borderRadius: 8 },
  resultItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  resultThumb: { width: 40, height: 56, borderRadius: 4, marginRight: 12 },
  rescanButton: { backgroundColor: '#007AFF', marginHorizontal: 16, marginBottom: 12, padding: 10, borderRadius: 8, alignItems: 'center' },
  similarityText: { fontSize: 12, color: '#34C759', fontWeight: '600', marginTop: 2 },
  guideBoxContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  guideBox: { width: GUIDE_WIDTH, height: GUIDE_HEIGHT, borderWidth: 3, borderColor: '#00FF00', borderRadius: 8, backgroundColor: 'transparent' },
});