import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import {
  Bug,
  Camera,
  Send,
  X,
  ChevronDown,
  AlertTriangle,
} from "lucide-react-native";
import { bugReportApi, type BugReportSeverity } from "../lib/api/bug-reports";
import { readLocalImage, uploadImageToR2 } from "../lib/api";
import { retailerApi } from "../lib/api";
import { showError } from "../lib/errors";
import { COLORS } from "@kanchuki/shared";
import { AnimatedPressable } from "./AnimatedPressable";
import { GradientButton } from "./GradientButton";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** If triggered from ErrorBoundary, pass the error context */
  errorContext?: {
    errorMessage?: string;
    errorStack?: string;
  };
  /** Current screen name for context */
  screenName?: string;
  /** Previous screen for navigation trail */
  lastScreen?: string;
};

const SEVERITY_OPTIONS: {
  value: BugReportSeverity;
  label: string;
  color: string;
}[] = [
  { value: "LOW", label: "Minor", color: "#4ade80" },
  { value: "MEDIUM", label: "Moderate", color: "#facc15" },
  { value: "HIGH", label: "Major", color: "#fb923c" },
  { value: "CRITICAL", label: "Critical", color: "#ef4444" },
];

export function ReportProblem({
  visible,
  onClose,
  errorContext,
  screenName,
  lastScreen,
}: Props) {
  const insets = useSafeAreaInsets();
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<BugReportSeverity>(
    errorContext ? "HIGH" : "MEDIUM",
  );
  const [notes, setNotes] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotR2Key, setScreenshotR2Key] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Auto-fill description from error context
  useEffect(() => {
    if (errorContext?.errorMessage && !description) {
      setDescription(`Error: ${errorContext.errorMessage}`);
    }
  }, [errorContext]);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSubmitted(false);
      if (!errorContext) {
        setDescription("");
        setNotes("");
        setScreenshot(null);
        setScreenshotR2Key(null);
        setSeverity("MEDIUM");
      }
    }
  }, [visible, errorContext]);

  const handlePickScreenshot = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setScreenshot(uri);

    // Upload to R2 in background
    setUploadingScreenshot(true);
    try {
      const blob = await readLocalImage(uri);
      const uploadResult = await retailerApi.getLogoUploadUrl(
        "image/jpeg",
        blob.size,
      );
      const info = uploadResult.data as {
        upload_url: string;
        r2_key: string;
        public_url: string;
      };
      await uploadImageToR2(
        uri,
        info.upload_url,
        "image/jpeg",
        undefined,
        undefined,
        {
          compress: true,
        },
      );
      setScreenshotR2Key(info.r2_key);
    } catch (err) {
      showError(err, "Failed to upload screenshot — continuing without it");
      setScreenshot(null);
      setScreenshotR2Key(null);
    } finally {
      setUploadingScreenshot(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (description.trim().length < 10) {
      Alert.alert(
        "More detail needed",
        "Please describe the issue in at least 10 characters.",
      );
      return;
    }

    setSubmitting(true);
    try {
      // Auto-capture device info
      const osVersion = `${Platform.OS === "android" ? "Android" : "iOS"} ${Platform.Version}`;
      const appVersion =
        Constants.expoConfig?.version ??
        Constants.expoConfig?.ios?.bundleIdentifier ??
        "unknown";

      await bugReportApi.submit({
        description: description.trim(),
        severity,
        app_version: appVersion,
        os_version: osVersion,
        device_model: `${Platform.OS} ${Platform.Version} (${Platform.OS === "android" ? (Constants.expoConfig?.android?.package ?? "unknown") : (Constants.expoConfig?.ios?.bundleIdentifier ?? "unknown")})`,
        screen_name: screenName,
        last_screen: lastScreen,
        error_message: errorContext?.errorMessage,
        error_stack: errorContext?.errorStack,
        screenshot_url: undefined, // R2 key is enough; admin can build URL
        screenshot_r2_key: screenshotR2Key ?? undefined,
        notes: notes.trim() || undefined,
      });

      setSubmitted(true);
    } catch (err) {
      showError(err, "Failed to submit report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [
    description,
    severity,
    notes,
    screenshotR2Key,
    screenName,
    lastScreen,
    errorContext,
  ]);

  if (submitted) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View className="flex-1 bg-black/50 justify-center px-6">
          <View className="bg-white rounded-3xl w-full p-8 items-center">
            <View className="w-16 h-16 rounded-3xl bg-green-100 items-center justify-center mb-4">
              <Send size={28} color="#22c55e" />
            </View>
            <Text className="text-lg font-bold text-sand-900 mb-2">
              Report Submitted
            </Text>
            <Text className="text-sm text-sand-500 text-center mb-6 leading-5">
              Thank you! Our team will review this and get back to you. Your
              feedback helps us improve Kanchuki for everyone.
            </Text>
            <GradientButton label="Done" onPress={onClose} />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-black/50 justify-end"
        style={{ paddingBottom: insets.bottom }}
      >
        <View
          className="bg-white rounded-t-3xl w-full"
          style={{ maxHeight: "90%" }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
            <View className="flex-row items-center gap-2">
              <View className="w-9 h-9 rounded-xl bg-rust-100 items-center justify-center">
                <Bug size={18} color={COLORS.danger} />
              </View>
              <Text className="text-lg font-bold text-sand-900">
                Report a Problem
              </Text>
            </View>
            <AnimatedPressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Close"
            >
              <X size={22} color="#9ca3af" />
            </AnimatedPressable>
          </View>

          <ScrollView className="px-5 pb-6" keyboardShouldPersistTaps="handled">
            {/* Error context banner */}
            {errorContext?.errorMessage && (
              <View className="bg-rust-50 border border-rust-200 rounded-2xl p-3.5 mb-4">
                <View className="flex-row items-center gap-2 mb-1.5">
                  <AlertTriangle size={14} color={COLORS.danger} />
                  <Text className="text-xs font-semibold text-rust-600">
                    Auto-captured error
                  </Text>
                </View>
                <Text className="text-xs text-rust-500" numberOfLines={3}>
                  {errorContext.errorMessage}
                </Text>
              </View>
            )}

            {/* Description */}
            <View className="mb-4">
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
                What went wrong? *
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the issue you're facing..."
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                className="bg-sand-50 px-4 py-3 rounded-2xl text-sm text-sand-900 min-h-[100px]"
                placeholderTextColor="#9ca3af"
              />
            </View>

            {/* Severity */}
            <View className="mb-4">
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
                How severe is this?
              </Text>
              <View className="flex-row gap-2">
                {SEVERITY_OPTIONS.map((opt) => (
                  <AnimatedPressable
                    key={opt.value}
                    onPress={() => setSeverity(opt.value)}
                    className={`flex-1 py-2.5 rounded-xl items-center border ${
                      severity === opt.value
                        ? "border-ink-600 bg-ink-50"
                        : "border-sand-200 bg-white"
                    }`}
                  >
                    <View
                      className="w-2.5 h-2.5 rounded-full mb-1"
                      style={{ backgroundColor: opt.color }}
                    />
                    <Text
                      className={`text-[10px] font-semibold ${
                        severity === opt.value
                          ? "text-ink-600"
                          : "text-sand-500"
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>
            </View>

            {/* Screenshot */}
            <View className="mb-4">
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
                Screenshot (optional)
              </Text>
              {screenshot ? (
                <View className="relative">
                  <Image
                    source={{ uri: screenshot }}
                    className="w-full h-40 rounded-2xl"
                    resizeMode="cover"
                  />
                  {uploadingScreenshot && (
                    <View className="absolute inset-0 bg-black/40 rounded-2xl items-center justify-center">
                      <ActivityIndicator color="white" />
                      <Text className="text-white text-xs mt-2">
                        Uploading...
                      </Text>
                    </View>
                  )}
                  <AnimatedPressable
                    onPress={() => {
                      setScreenshot(null);
                      setScreenshotR2Key(null);
                    }}
                    className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5"
                  >
                    <X size={14} color="white" />
                  </AnimatedPressable>
                </View>
              ) : (
                <AnimatedPressable
                  onPress={() => void handlePickScreenshot()}
                  disabled={uploadingScreenshot}
                  className="bg-sand-50 border border-dashed border-sand-300 rounded-2xl py-8 items-center"
                >
                  <Camera size={24} color="#9ca3af" />
                  <Text className="text-xs text-sand-400 mt-2">
                    Tap to add a screenshot
                  </Text>
                </AnimatedPressable>
              )}
            </View>

            {/* Additional notes */}
            <View className="mb-5">
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
                Any extra details? (optional)
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Steps to reproduce, what you expected..."
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                className="bg-sand-50 px-4 py-3 rounded-2xl text-sm text-sand-900 min-h-[60px]"
                placeholderTextColor="#9ca3af"
              />
            </View>

            {/* Device info badge */}
            <View className="bg-sand-50 rounded-xl px-3 py-2 mb-4 flex-row items-center gap-2">
              <Text className="text-[10px] text-sand-400">
                📱 Device info auto-captured for troubleshooting
              </Text>
            </View>

            {/* Submit */}
            <GradientButton
              label={submitting ? "Submitting..." : "Submit Report"}
              onPress={() => void handleSubmit()}
              disabled={
                submitting ||
                description.trim().length < 10 ||
                uploadingScreenshot
              }
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
