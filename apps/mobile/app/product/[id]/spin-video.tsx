import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { productApi, readLocalImage, uploadImageToR2 } from '../../../src/lib/api';

type Step = 'camera' | 'recording' | 'preview' | 'uploading';

const MAX_DURATION_SECONDS = 6;

export default function SpinVideoScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [step, setStep] = useState<Step>('camera');
  const [permission, requestPermission] = useCameraPermissions();
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const handleRecord = async () => {
    if (!cameraRef.current) return;
    setStep('recording');
    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION_SECONDS,
      });
      if (!video?.uri) throw new Error('No video captured');
      setVideoUri(video.uri);
      setStep('preview');
    } catch (err) {
      setStep('camera');
      Alert.alert(
        'Recording Error',
        err instanceof Error ? err.message : 'Could not record spin video',
      );
    }
  };

  const handleStop = () => {
    cameraRef.current?.stopRecording();
  };

  const handleUpload = async () => {
    if (!videoUri) return;
    setStep('uploading');
    try {
      const file = await readLocalImage(videoUri);
      const uploadResult = await productApi.getSpinVideoUploadUrl(id, 'video/mp4', file.size);
      const info = uploadResult.data;
      await uploadImageToR2(videoUri, info.upload_url, 'video/mp4', 60_000);
      await productApi.submitSpinVideo(id, info.r2_key);

      Alert.alert('Spin Video Uploaded', 'Processing the 360° view now — check back in a minute.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      setStep('preview');
      Alert.alert(
        'Upload Error',
        err instanceof Error ? err.message : 'Could not upload spin video',
      );
    }
  };

  if (!permission) return <View className="flex-1 bg-black" />;

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        <Text className="text-white text-center text-base mb-6">
          Camera access needed to record a spin video
        </Text>
        <TouchableOpacity
          onPress={() => void requestPermission()}
          className="bg-cyan-600 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'preview') {
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        <View className="w-20 h-20 rounded-full bg-cyan-600/20 items-center justify-center mb-6">
          <Check size={36} color="#0891B2" />
        </View>
        <Text className="text-white text-center text-base mb-1">Spin video captured</Text>
        <Text className="text-white/50 text-center text-sm mb-8">
          We'll extract 24 frames for the 360° viewer
        </Text>
        <TouchableOpacity
          onPress={() => void handleUpload()}
          className="bg-cyan-600 px-8 py-4 rounded-2xl mb-3 w-full items-center"
        >
          <Text className="text-white font-semibold">Upload</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setVideoUri(null);
            setStep('camera');
          }}
          className="py-3"
        >
          <Text className="text-white/60 font-medium">Retake</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'uploading') {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#0891B2" />
        <Text className="text-white mt-4">Uploading spin video...</Text>
      </View>
    );
  }

  // camera + recording
  return (
    <View className="flex-1 bg-black">
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" mode="video" mute />

      <TouchableOpacity
        onPress={() => router.back()}
        className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center"
        style={{ top: insets.top + 8 }}
      >
        <X size={20} color="white" />
      </TouchableOpacity>

      <View className="absolute left-0 right-0 items-center" style={{ top: insets.top + 8 }}>
        <Text className="text-white text-sm font-semibold bg-black/50 px-3 py-1 rounded-full">
          {step === 'recording'
            ? 'Slowly spin the garment...'
            : `Rotate the garment a full turn (${MAX_DURATION_SECONDS}s)`}
        </Text>
      </View>

      <View className="flex-1 items-center justify-center">
        <View className="w-72 h-80 border-2 border-white/40 rounded-3xl" />
      </View>

      <View className="items-center gap-4" style={{ paddingBottom: 48 + insets.bottom }}>
        <TouchableOpacity
          onPress={() => (step === 'recording' ? handleStop() : void handleRecord())}
          className={`w-20 h-20 rounded-full border-4 items-center justify-center ${
            step === 'recording' ? 'border-red-500' : 'border-white'
          }`}
        >
          <View
            className={
              step === 'recording'
                ? 'w-8 h-8 bg-red-500 rounded-md'
                : 'w-14 h-14 bg-white rounded-full'
            }
          />
        </TouchableOpacity>
        <Text className="text-white/50 text-xs">
          {step === 'recording' ? 'Tap to stop early' : 'Tap to start recording'}
        </Text>
      </View>
    </View>
  );
}
