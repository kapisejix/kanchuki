import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, X, Zap, ZapOff } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { productApi, readLocalImage, uploadImageToR2 } from '../../../src/lib/api';
import { showError } from '../../../src/lib/errors';
import { useTheme } from '../../../src/lib/theme';

type Step = 'camera' | 'recording' | 'preview' | 'uploading';

const MAX_DURATION_SECONDS = 6;

export default function SpinVideoScreen() {
  const { primaryColor } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [step, setStep] = useState<Step>('camera');
  const [permission, requestPermission] = useCameraPermissions();
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [flashMode, setFlashMode] = useState<'off' | 'on'>('off');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const recordingStartedAt = useRef(0);
  const cameraRetryCount = useRef(0);

  // ponytail: some devices never fire onCameraReady over the RN bridge —
  // fall back to ready after 5s so the shutter doesn't hang forever.
  useEffect(() => {
    if (step !== 'camera' || isCameraReady || cameraError) return;
    const t = setTimeout(() => {
      // Only mark ready if no error surfaced — camera might still work
      // even if onCameraReady was silently dropped.
      setIsCameraReady(true);
    }, 5000);
    return () => clearTimeout(t);
  }, [step, isCameraReady, cameraError]);

  // If camera never initialises within 12s, show a "Camera unavailable"
  // state so the user isn't staring at a black screen forever.
  useEffect(() => {
    if (step !== 'camera' || cameraError) return;
    const t = setTimeout(() => {
      if (!isCameraReady) {
        setCameraError('Camera initialisation timed out. Tap Retry to try again.');
      }
    }, 12000);
    return () => clearTimeout(t);
  }, [step, isCameraReady, cameraError]);

  const handleRecord = async () => {
    // Starting a recording session before the native camera has finished
    // initializing silently produces an empty/near-zero-length video on some
    // devices — recordAsync still resolves, so wait for onCameraReady first.
    if (!cameraRef.current || !isCameraReady) return;
    setStep('recording');
    recordingStartedAt.current = Date.now();
    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION_SECONDS,
      });
      if (!video?.uri) throw new Error('No video captured');
      setVideoUri(video.uri);
      setStep('preview');
    } catch (err) {
      setStep('camera');
      showError(err, 'Could not record spin video', 'Recording Error');
    }
  };

  const handleStop = () => {
    // stopRecording before the native encoder has produced a frame throws
    // "Recording was stopped before any data could be produced" — ignore
    // stop taps in that dead window, recordAsync's own maxDuration still caps it.
    if (Date.now() - recordingStartedAt.current < 1000) return;
    cameraRef.current?.stopRecording();
  };

  const handleUpload = async () => {
    if (!videoUri) return;
    setStep('uploading');
    setUploadPercent(0);
    try {
      const file = await readLocalImage(videoUri);
      const uploadResult = await productApi.getSpinVideoUploadUrl(id, 'video/mp4', file.size);
      const info = uploadResult.data;
      await uploadImageToR2(videoUri, info.upload_url, 'video/mp4', 60_000, (fraction) =>
        setUploadPercent(Math.round(fraction * 100)),
      );
      await productApi.submitSpinVideo(id, info.r2_key);

      Alert.alert('Spin Video Uploaded', 'Processing the 360° view now — check back in a minute.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      setStep('preview');
      showError(err, 'Could not upload spin video', 'Upload Error');
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
          className="bg-ink-600 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'preview') {
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        <View className="w-20 h-20 rounded-full bg-ink-600/20 items-center justify-center mb-6">
          <Check size={36} color={primaryColor} />
        </View>
        <Text className="text-white text-center text-base mb-1">Spin video captured</Text>
        <Text className="text-white/50 text-center text-sm mb-8">
          {"We'll extract 24 frames for the 360° viewer"}
        </Text>
        <TouchableOpacity
          onPress={() => void handleUpload()}
          className="bg-ink-600 px-8 py-4 rounded-2xl mb-3 w-full items-center"
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
      <View className="flex-1 bg-black items-center justify-center px-10">
        <ActivityIndicator size="large" color={primaryColor} />
        <Text className="text-white mt-4">Uploading spin video... {uploadPercent}%</Text>
        <View className="w-full h-2 bg-white/10 rounded-full overflow-hidden mt-4">
          <View
            className="h-full bg-ink-500 rounded-full"
            style={{ width: `${uploadPercent}%` }}
          />
        </View>
      </View>
    );
  }

  // camera + recording
  return (
    <View className="flex-1 bg-black">
      <CameraView
        key={cameraRetryCount.current}
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="video"
        mute
        flash={flashMode}
        autofocus="on"
        onCameraReady={() => {
          setCameraError(null);
          setIsCameraReady(true);
        }}
        onMountError={(event) => {
          const msg =
            typeof event === 'object' && event !== null
              ? (event as { nativeEvent?: { message?: string } }).nativeEvent?.message ??
                'Camera failed to initialise'
              : 'Camera failed to initialise';
          setCameraError(msg);
        }}
      />

      {/* Top bar — close left, torch right */}
      <TouchableOpacity
        onPress={() => router.back()}
        className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center"
        style={{ top: insets.top + 8 }}
      >
        <X size={20} color="white" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setFlashMode((prev) => (prev === 'off' ? 'on' : 'off'))}
        disabled={step === 'recording' || !!cameraError}
        className={`absolute right-4 w-10 h-10 rounded-full items-center justify-center ${
          step === 'recording' ? 'opacity-30' : ''
        } ${flashMode === 'on' ? 'bg-turmeric-400' : 'bg-black/50'}`}
        style={{ top: insets.top + 8 }}
      >
        {flashMode === 'on' ? (
          <Zap size={20} color="black" />
        ) : (
          <ZapOff size={20} color="white" />
        )}
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
        {cameraError && !isCameraReady ? (
          <TouchableOpacity
            onPress={() => {
              // Increment retry count to force CameraView remount via key prop
              cameraRetryCount.current += 1;
              setCameraError(null);
              setIsCameraReady(false);
            }}
            className="bg-ink-600 px-6 py-3 rounded-xl"
          >
            <Text className="text-white font-semibold">Retry Camera</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => (step === 'recording' ? handleStop() : void handleRecord())}
              disabled={step !== 'recording' && !isCameraReady}
              className={`w-20 h-20 rounded-full border-4 items-center justify-center ${
                step === 'recording' ? 'border-rust-500' : 'border-white'
              } ${!isCameraReady && step !== 'recording' ? 'opacity-40' : ''}`}
            >
              {!isCameraReady && step !== 'recording' ? (
                <ActivityIndicator color="white" />
              ) : (
                <View
                  className={
                    step === 'recording'
                      ? 'w-8 h-8 bg-rust-500 rounded-md'
                      : 'w-14 h-14 bg-white rounded-full'
                  }
                />
              )}
            </TouchableOpacity>
            <Text className="text-white/50 text-xs">
              {step === 'recording'
                ? 'Tap to stop early'
                : isCameraReady
                  ? 'Tap to start recording'
                  : 'Preparing camera...'}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
