import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useApplication } from '../../context/ApplicationContext';
import applicationService from '../../services/applicationService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAMERA_SIZE = SCREEN_WIDTH - 80;

const LIVENESS_CHALLENGES = [
  { action: 'blink', instruction: 'Blink your eyes', icon: 'eye-outline' },
  { action: 'smile', instruction: 'Smile naturally', icon: 'happy-outline' },
  { action: 'turn_left', instruction: 'Turn your head slightly left', icon: 'arrow-back' },
  { action: 'turn_right', instruction: 'Turn your head slightly right', icon: 'arrow-forward' },
];

const FaceVerificationScreen = ({ navigation }) => {
  const { state, dispatch } = useApplication();
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [step, setStep] = useState('intro'); // intro, face_capture, transitioning, liveness_video, complete
  const [capturedImage, setCapturedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [livenessVideo, setLivenessVideo] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentInstruction, setCurrentInstruction] = useState('');
  const cameraRef = useRef(null);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    // Check if face verification is already done AND verified successfully
    if (state.faceVerification?.completed && state.faceVerification?.verified) {
      setCapturedImage(state.faceVerification.imageUri);
      setStep('complete');
    }
  }, []);

  useEffect(() => {
    if (step === 'face_capture' || step === 'liveness_video') {
      setCameraReady(false);
    }
  }, [step]);

  useEffect(() => {
    return () => {
      // Cleanup recording timer on unmount
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const handleCameraReady = () => {
    console.log('[FaceVerification] Camera ready. Step:', step);
    setCameraReady(true);
  };

  const requestCameraPermission = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      return result.granted;
    }
    return true;
  };

  const startFaceCapture = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert(
        'Camera Permission Required',
        'Please grant camera access to complete face verification.'
      );
      return;
    }
    setStep('face_capture');
  };

  const capturePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;
    if (!cameraReady || typeof cameraRef.current.takePictureAsync !== 'function') {
      Alert.alert('Camera', 'Camera is still initializing. Please try again.');
      return;
    }

    setIsCapturing(true);
    setCountdown(3);

    // Countdown before capture
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    setCountdown(null);

    try {
      if (!cameraRef.current || typeof cameraRef.current.takePictureAsync !== 'function') {
        throw new Error('Camera not ready');
      }

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: false,
        skipProcessing: true,
      });

      setCapturedImage(photo.uri);

      // Reset camera ready state and wait for camera to unmount before switching to video mode
      setCameraReady(false);
      setStep('transitioning'); // Show loading while camera switches modes
      await new Promise(resolve => setTimeout(resolve, 400));
      setStep('liveness_video');
    } catch (error) {
      console.error('Capture error:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  const startLivenessRecording = async () => {
    console.log('[LivenessRecording] startLivenessRecording called');
    console.log('[LivenessRecording] cameraRef.current:', !!cameraRef.current);
    console.log('[LivenessRecording] isRecording:', isRecording);
    console.log('[LivenessRecording] cameraReady:', cameraReady);
    console.log('[LivenessRecording] micPermission:', JSON.stringify(micPermission));
    console.log('[LivenessRecording] cameraPermission:', JSON.stringify(permission));

    if (!cameraRef.current || isRecording) {
      console.warn('[LivenessRecording] Aborting: cameraRef.current is null or already recording');
      return;
    }
    if (!cameraReady) {
      console.warn('[LivenessRecording] Aborting: camera not ready yet');
      Alert.alert('Camera', 'Camera is still initializing. Please try again.');
      return;
    }
    if (typeof cameraRef.current.recordAsync !== 'function') {
      console.warn('[LivenessRecording] Aborting: recordAsync is not a function on cameraRef. Available methods:', Object.keys(cameraRef.current));
      Alert.alert('Camera', 'Camera is still initializing. Please try again.');
      return;
    }

    // Request microphone permission for video recording
    if (!micPermission?.granted) {
      console.log('[LivenessRecording] Microphone not yet granted, requesting...');
      const result = await requestMicPermission();
      console.log('[LivenessRecording] Microphone permission result:', JSON.stringify(result));
      if (!result.granted) {
        console.warn('[LivenessRecording] Microphone permission denied');
        Alert.alert(
          'Microphone Permission Required',
          'Please grant microphone access to record the liveness video. This is required for identity verification.',
          [{ text: 'OK' }]
        );
        return;
      }
    } else {
      console.log('[LivenessRecording] Microphone already granted');
    }

    try {
      // Set initial state before recording starts
      setRecordingDuration(0);
      setCurrentInstruction('Starting recording...');

      console.log('[LivenessRecording] Calling cameraRef.current.recordAsync with maxDuration=8, quality=720p');

      // Start recording first
      let videoPromise;
      try {
        videoPromise = cameraRef.current.recordAsync({
          maxDuration: 6, // 6 seconds — enough frames for liveness detection
          quality: '480p',
        });
        console.log('[LivenessRecording] recordAsync() called successfully, awaiting promise...');
      } catch (recordStartError) {
        console.error('[LivenessRecording] recordAsync() threw synchronously:', recordStartError);
        throw recordStartError;
      }

      // Small delay to ensure recording has actually started
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('[LivenessRecording] 200ms delay passed — assuming recording started');

      // Now mark as recording and start showing instructions
      setIsRecording(true);
      setCurrentInstruction('Look at the camera');
      console.log('[LivenessRecording] isRecording set to true');

      // Start duration counter
      let elapsedTime = 0;
      recordingTimerRef.current = setInterval(() => {
        elapsedTime += 0.1;
        setRecordingDuration(elapsedTime);

        // Show instructions at specific times
        if (elapsedTime >= 5 && elapsedTime < 5.1) {
          console.log('[LivenessRecording] Instruction at 5s: Turn your head slightly');
          setCurrentInstruction('Turn your head slightly');
        } else if (elapsedTime >= 3 && elapsedTime < 3.1) {
          console.log('[LivenessRecording] Instruction at 3s: Smile naturally');
          setCurrentInstruction('Smile naturally');
        } else if (elapsedTime >= 1.5 && elapsedTime < 1.6) {
          console.log('[LivenessRecording] Instruction at 1.5s: Blink your eyes');
          setCurrentInstruction('Blink your eyes');
        }

        if (elapsedTime >= 6) {
          console.log('[LivenessRecording] 6s elapsed — calling stopLivenessRecording()');
          stopLivenessRecording();
        }
      }, 100);

      console.log('[LivenessRecording] Waiting for videoPromise to resolve...');
      // Wait for recording to complete
      const video = await videoPromise;

      console.log('[LivenessRecording] videoPromise resolved. video object:', JSON.stringify(video));
      console.log('[LivenessRecording] video.uri:', video?.uri);

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        console.log('[LivenessRecording] Recording timer cleared');
      }

      if (!video?.uri) {
        console.error('[LivenessRecording] video.uri is null/undefined after recording!');
        throw new Error('Recording produced no video URI');
      }

      setLivenessVideo(video.uri);
      setIsRecording(false);
      console.log('[LivenessRecording] Recording complete. URI:', video.uri);

      // Submit verification
      console.log('[LivenessRecording] Proceeding to submitVerification. capturedImage:', capturedImage);
      await submitVerification(capturedImage, video.uri);
    } catch (error) {
      console.error('[LivenessRecording] Recording error:', error);
      console.error('[LivenessRecording] Error message:', error?.message);
      console.error('[LivenessRecording] Error stack:', error?.stack);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setIsRecording(false);
      Alert.alert('Error', `Failed to record video: ${error?.message || 'Unknown error'}. Please try again.`);
    }
  };

  const stopLivenessRecording = async () => {
    console.log('[LivenessRecording] stopLivenessRecording called. cameraRef.current:', !!cameraRef.current, 'isRecording:', isRecording);
    if (cameraRef.current && isRecording) {
      try {
        console.log('[LivenessRecording] Calling cameraRef.current.stopRecording()');
        await cameraRef.current.stopRecording();
        console.log('[LivenessRecording] stopRecording() completed');
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          console.log('[LivenessRecording] Timer cleared after stop');
        }
      } catch (error) {
        console.error('[LivenessRecording] stopRecording() error:', error);
        console.error('[LivenessRecording] stopRecording() error message:', error?.message);
      }
    } else {
      console.warn('[LivenessRecording] stopLivenessRecording skipped — cameraRef.current:', !!cameraRef.current, 'isRecording:', isRecording);
    }
  };

  const submitVerification = async (faceImage, livenessVideoUri) => {
    console.log('[SubmitVerification] submitVerification called');
    console.log('[SubmitVerification] faceImage:', faceImage);
    console.log('[SubmitVerification] livenessVideoUri:', livenessVideoUri);
    console.log('[SubmitVerification] applicationId:', state.applicationId);
    setLoading(true);
    try {
      if (!faceImage) {
        console.error('[SubmitVerification] Missing face image!');
        throw new Error('Missing face image');
      }
      if (!livenessVideoUri) {
        console.error('[SubmitVerification] Missing liveness video URI!');
        throw new Error('Missing liveness video');
      }

      // Upload face capture and get verification result
      console.log('[SubmitVerification] Uploading face capture...');
      const faceResult = await applicationService.uploadFaceCapture(state.applicationId, faceImage);
      console.log('[SubmitVerification] Face capture result:', JSON.stringify(faceResult));

      // Upload liveness video
      console.log('[SubmitVerification] Uploading liveness video...');
      const livenessResult = await applicationService.uploadLivenessVideo(
        state.applicationId,
        livenessVideoUri
      );
      console.log('[SubmitVerification] Liveness video result:', JSON.stringify(livenessResult));

      // Check if face verification passed (Verified = auto-approved, Needs Review = borderline/manual review)
      const faceStatus = faceResult.verification_status;
      const faceVerified = (faceStatus === 'Verified' || faceStatus === 'Needs Review') && faceResult.is_match === true;
      const faceNeedsReview = faceStatus === 'Needs Review';
      // Video endpoint returns `status`; image endpoint returns `check_status`
      const livenessVerified =
        livenessResult.is_live === true ||
        livenessResult.status === 'Verified' ||
        livenessResult.check_status === 'Verified';
      console.log('[SubmitVerification] faceStatus:', faceStatus, '| faceVerified:', faceVerified, '| livenessVerified:', livenessVerified);

      if (!faceVerified) {
        // Face verification failed - don't mark as complete
        dispatch({
          type: 'SET_FACE_VERIFICATION',
          payload: { completed: false, imageUri: faceImage, verified: false },
        });

        const errorMsg = faceResult.error_message ||
          `Face verification failed. Similarity: ${faceResult.similarity_score?.toFixed(1) || 0}%`;
        Alert.alert(
          'Face Verification Failed',
          errorMsg + '\n\nPlease retake the verification with better lighting and ensure your face matches your ID photo.',
          [{ text: 'Retry', onPress: () => retakeVerification() }]
        );
        return;
      }

      if (faceNeedsReview) {
        // Borderline match — user can proceed but a bookkeeper will review
        Alert.alert(
          'Manual Review Required',
          `Your face similarity score (${faceResult.similarity_score?.toFixed(1) || 0}%) requires a bookkeeper to review your application before it can be approved. You may still proceed.`,
          [{ text: 'OK' }]
        );
      }

      if (!livenessVerified) {
        // Liveness check failed
        dispatch({
          type: 'SET_LIVENESS_CHECK',
          payload: { completed: false, verified: false },
        });

        Alert.alert(
          'Liveness Check Failed',
          'We could not verify that you are a real person. Please try again and follow the on-screen instructions.',
          [{ text: 'Retry', onPress: () => retakeVerification() }]
        );
        return;
      }

      // Both checks passed
      dispatch({
        type: 'SET_FACE_VERIFICATION',
        payload: { completed: true, imageUri: faceImage, verified: true },
      });
      dispatch({
        type: 'SET_LIVENESS_CHECK',
        payload: { completed: true, verified: true },
      });

      setStep('complete');
      Alert.alert(
        'Verification Complete',
        '\u2713 Face Verification: Passed\n\u2713 Liveness Check: Passed\n\nYou may now proceed to the next step.'
      );
    } catch (error) {
      console.error('[SubmitVerification] Verification error:', error);
      console.error('[SubmitVerification] Error message:', error?.message);
      console.error('[SubmitVerification] Error stack:', error?.stack);
      console.error('[SubmitVerification] Response status:', error?.response?.status);
      console.error('[SubmitVerification] Response data:', JSON.stringify(error?.response?.data));

      // Reset state to indicate verification failed
      dispatch({
        type: 'SET_FACE_VERIFICATION',
        payload: { completed: false, imageUri: null, verified: false },
      });
      dispatch({
        type: 'SET_LIVENESS_CHECK',
        payload: { completed: false, verified: false },
      });

      Alert.alert(
        'Verification Failed',
        error.response?.data?.error || error.response?.data?.message || 'Please try again with better lighting.',
        [{ text: 'Retry', onPress: () => retakeVerification() }]
      );
      // Reset to try again
      setStep('intro');
      setCapturedImage(null);
      setLivenessVideo(null);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    const faceOk = step === 'complete' && state.faceVerification?.completed && state.faceVerification?.verified;
    const livenessOk = state.livenessCheck?.verified;

    if (!faceOk) {
      Alert.alert('Verification Required', 'Face verification did not pass. Please retake the verification.');
      return;
    }
    if (!livenessOk) {
      Alert.alert('Verification Required', 'Liveness check did not pass. Please retake the verification.');
      return;
    }

    dispatch({ type: 'SET_STEP', payload: 7 });
    navigation.navigate('ReviewSubmit');
  };

  const retakeVerification = async () => {
    setCapturedImage(null);
    setLivenessVideo(null);
    setRecordingDuration(0);
    setCurrentInstruction('');
    setCameraReady(false);

    // Show transitioning state while camera resets
    setStep('transitioning');

    // Wait briefly for camera to fully unmount before switching to face_capture
    await new Promise(resolve => setTimeout(resolve, 400));

    setStep('face_capture');
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0d6efd" />
      </View>
    );
  }

  const renderIntro = () => (
    <View style={styles.introContainer}>
      <View style={styles.illustrationContainer}>
        <View style={styles.faceIllustration}>
          <Ionicons name="person-circle" size={120} color="#0d6efd" />
        </View>
      </View>

      <Text style={styles.introTitle}>Face Verification</Text>
      <Text style={styles.introSubtitle}>
        We need to verify your identity. Please ensure you're in a well-lit area and position your
        face within the frame.
      </Text>

      <View style={styles.requirementsList}>
        <View style={styles.requirementItem}>
          <Ionicons name="checkmark-circle" size={24} color="#28a745" />
          <Text style={styles.requirementText}>Good lighting</Text>
        </View>
        <View style={styles.requirementItem}>
          <Ionicons name="checkmark-circle" size={24} color="#28a745" />
          <Text style={styles.requirementText}>Face clearly visible</Text>
        </View>
        <View style={styles.requirementItem}>
          <Ionicons name="checkmark-circle" size={24} color="#28a745" />
          <Text style={styles.requirementText}>No sunglasses or face coverings</Text>
        </View>
        <View style={styles.requirementItem}>
          <Ionicons name="checkmark-circle" size={24} color="#28a745" />
          <Text style={styles.requirementText}>Neutral background</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.startButton} onPress={startFaceCapture}>
        <Ionicons name="camera" size={24} color="#fff" />
        <Text style={styles.startButtonText}>Start Verification</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFaceCapture = () => (
    <View style={styles.cameraContainer}>
      <Text style={styles.cameraTitle}>Position Your Face</Text>
      <Text style={styles.cameraSubtitle}>
        Align your face within the oval frame and keep steady
      </Text>

      <View style={styles.cameraWrapper}>
        <CameraView
          key="camera-photo"
          ref={cameraRef}
          style={styles.camera}
          facing="front"
          mode="picture"
          onCameraReady={handleCameraReady}
        >
          <View style={styles.cameraOverlay}>
            <View style={styles.faceFrame} />
          </View>
          {countdown !== null && (
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          )}
        </CameraView>
      </View>

      <TouchableOpacity
        style={styles.captureButton}
        onPress={capturePhoto}
        disabled={countdown !== null}
      >
        <View style={styles.captureButtonInner}>
          <Ionicons name="camera" size={32} color="#fff" />
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => setStep('intro')}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLivenessVideo = () => {
    return (
      <View style={styles.cameraContainer}>
        <View style={styles.livenessHeader}>
          <Text style={styles.livenessTitle}>Liveness Check</Text>
          {isRecording && (
            <View style={styles.recordingBadge}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>REC {recordingDuration.toFixed(1)}s</Text>
            </View>
          )}
        </View>

        {currentInstruction && (
          <View style={styles.instructionBanner}>
            <Ionicons name="information-circle" size={24} color="#fff" />
            <Text style={styles.instructionText}>{currentInstruction}</Text>
          </View>
        )}

        {!isRecording && (
          <View style={styles.livenessIntro}>
            <Ionicons name="videocam" size={60} color="#0d6efd" />
            <Text style={styles.livenessIntroTitle}>Video Liveness Check</Text>
            <Text style={styles.livenessIntroText}>
              We'll record a short video (8 seconds) to verify you're a real person. Please follow the
              instructions that will appear on screen.
            </Text>
          </View>
        )}

        <View style={styles.cameraWrapper}>
          <CameraView
            key="camera-video"
            ref={cameraRef}
            style={styles.camera}
            facing="front"
            mode="video"
            onCameraReady={handleCameraReady}
          >
            <View style={styles.cameraOverlay}>
              <View style={styles.faceFrame} />
            </View>
            {isRecording && currentInstruction && (
              <View style={styles.overlayInstruction}>
                <Text style={styles.overlayInstructionText}>{currentInstruction}</Text>
              </View>
            )}
          </CameraView>
        </View>

        {!isRecording ? (
          <TouchableOpacity
            style={styles.recordButton}
            onPress={startLivenessRecording}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <View style={styles.recordButtonInner}>
                <Ionicons name="videocam" size={32} color="#fff" />
                <Text style={styles.recordButtonText}>Start Recording</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.recordingIndicator}>
            <Text style={styles.recordingMessage}>Recording in progress...</Text>
            <Text style={styles.recordingSubtext}>Follow the instructions above</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => setStep('face_capture')}
          disabled={isRecording}
        >
          <Text style={styles.cancelButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTransitioning = () => (
    <View style={styles.transitionContainer}>
      <ActivityIndicator size="large" color="#0d6efd" />
      <Text style={styles.transitionText}>Preparing camera...</Text>
    </View>
  );

  const renderComplete = () => {
    const faceVerified = state.faceVerification?.verified;
    const livenessVerified = state.livenessCheck?.verified;

    return (
      <View style={styles.completeContainer}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={80} color="#28a745" />
        </View>

        <Text style={styles.completeTitle}>Verification Complete!</Text>
        <Text style={styles.completeSubtitle}>
          Both checks passed. You may proceed.
        </Text>

        {/* Verification result badges */}
        <View style={styles.verificationResults}>
          <View style={[styles.verificationBadge, faceVerified ? styles.badgePass : styles.badgeFail]}>
            <Ionicons
              name={faceVerified ? 'checkmark-circle' : 'close-circle'}
              size={22}
              color={faceVerified ? '#28a745' : '#dc3545'}
            />
            <Text style={[styles.badgeText, faceVerified ? styles.badgeTextPass : styles.badgeTextFail]}>
              Face Verification: {faceVerified ? 'Passed' : 'Failed'}
            </Text>
          </View>
          <View style={[styles.verificationBadge, livenessVerified ? styles.badgePass : styles.badgeFail]}>
            <Ionicons
              name={livenessVerified ? 'checkmark-circle' : 'close-circle'}
              size={22}
              color={livenessVerified ? '#28a745' : '#dc3545'}
            />
            <Text style={[styles.badgeText, livenessVerified ? styles.badgeTextPass : styles.badgeTextFail]}>
              Liveness Check: {livenessVerified ? 'Passed' : 'Failed'}
            </Text>
          </View>
        </View>

        {capturedImage && (
          <View style={styles.capturedImageContainer}>
            <Image source={{ uri: capturedImage }} style={styles.capturedImage} />
          </View>
        )}

        <TouchableOpacity style={styles.retakeButton} onPress={retakeVerification}>
          <Ionicons name="refresh" size={20} color="#0d6efd" />
          <Text style={styles.retakeButtonText}>Retake Verification</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '86%' }]} />
        </View>
        <Text style={styles.progressText}>Step 6 of 7</Text>
      </View>

      {step === 'intro' && renderIntro()}
      {step === 'face_capture' && renderFaceCapture()}
      {step === 'transitioning' && renderTransitioning()}
      {step === 'liveness_video' && renderLivenessVideo()}
      {step === 'complete' && renderComplete()}

      {/* Navigation Buttons (only show on intro and complete) */}
      {(step === 'intro' || step === 'complete') && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color="#666" />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.continueButton,
              step !== 'complete' && styles.continueButtonDisabled,
            ]}
            onPress={handleContinue}
            disabled={step !== 'complete'}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e9ecef',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0d6efd',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#6c757d',
    textAlign: 'center',
  },
  // Intro styles
  introContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  illustrationContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  faceIllustration: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#e7f1ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  introTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    textAlign: 'center',
    marginBottom: 12,
  },
  introSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  requirementsList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  requirementText: {
    fontSize: 15,
    color: '#495057',
    marginLeft: 12,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d6efd',
    paddingVertical: 16,
    borderRadius: 12,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  // Camera styles
  cameraContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  cameraTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 8,
  },
  cameraSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 20,
  },
  cameraWrapper: {
    width: CAMERA_SIZE,
    height: CAMERA_SIZE,
    borderRadius: CAMERA_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    width: '100%',
    height: '100%',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceFrame: {
    width: CAMERA_SIZE - 60,
    height: CAMERA_SIZE - 40,
    borderRadius: (CAMERA_SIZE - 60) / 2,
    borderWidth: 3,
    borderColor: '#0d6efd',
    borderStyle: 'dashed',
  },
  countdownContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  countdownText: {
    fontSize: 72,
    fontWeight: 'bold',
    color: '#fff',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0d6efd',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#0d6efd',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  captureButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#0d6efd',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelButtonText: {
    color: '#6c757d',
    fontSize: 16,
  },
  // Liveness styles
  livenessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  livenessTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
  },
  livenessProgress: {
    fontSize: 14,
    color: '#6c757d',
    backgroundColor: '#e9ecef',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  challengeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e7f1ff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  challengeIcon: {
    marginRight: 12,
  },
  challengeInstruction: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0d6efd',
  },
  livenessIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  livenessIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#dee2e6',
    marginHorizontal: 4,
  },
  livenessIndicatorComplete: {
    backgroundColor: '#28a745',
  },
  livenessIndicatorCurrent: {
    backgroundColor: '#0d6efd',
    width: 24,
  },
  // Video recording styles
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dc3545',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  recordingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  instructionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d6efd',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  livenessIntro: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 20,
  },
  livenessIntroTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    marginTop: 12,
    marginBottom: 8,
  },
  livenessIntroText: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 20,
  },
  overlayInstruction: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(13, 110, 253, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  overlayInstructionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#dc3545',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#dc3545',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  recordButtonInner: {
    alignItems: 'center',
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  recordingIndicator: {
    alignItems: 'center',
    marginTop: 24,
    padding: 16,
  },
  recordingMessage: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  recordingSubtext: {
    fontSize: 14,
    color: '#6c757d',
  },
  // Transition styles
  transitionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  transitionText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6c757d',
  },
  // Complete styles
  completeContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  successIcon: {
    marginBottom: 24,
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#28a745',
    marginBottom: 8,
  },
  completeSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 24,
  },
  verificationResults: {
    width: '100%',
    marginBottom: 20,
    gap: 10,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 10,
  },
  badgePass: {
    backgroundColor: '#d4edda',
  },
  badgeFail: {
    backgroundColor: '#f8d7da',
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  badgeTextPass: {
    color: '#155724',
  },
  badgeTextFail: {
    color: '#721c24',
  },
  capturedImageContainer: {
    marginBottom: 24,
  },
  capturedImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 4,
    borderColor: '#28a745',
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#0d6efd',
    borderRadius: 12,
  },
  retakeButtonText: {
    color: '#0d6efd',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Navigation buttons
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    marginRight: 12,
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  continueButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d6efd',
    paddingVertical: 14,
    borderRadius: 12,
  },
  continueButtonDisabled: {
    backgroundColor: '#adb5bd',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
});

export default FaceVerificationScreen;
