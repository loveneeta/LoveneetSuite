# Personal AI — Android Voice Memory & Meeting Assistant

A native, on-device personal AI assistant for Android built with Kotlin, Jetpack Compose (Material 3), Room SQLite, and foreground audio recording.

**Budget Rule:** ₹0 ongoing cost. No subscriptions, no paid APIs, no credit-based AI services, no mandatory purchases, and no expiring trial dependencies. Core recording, transcription, and summarization operate completely offline.

---

## 🚀 Status: Phase 3 Completed

- **Phase 1 (Toolchain & Zero-Cost Architecture):** Completed.
- **Phase 2 (Android Foundation & Reliable Recording):** Completed & Verified.
- **Phase 3 (On-Device Speech-to-Text Transcription):** Completed & Deployed.

### Features Implemented in Phase 3:
1. **On-Device STT Engine (`VoskTranscriptionEngine`):**
   - High-performance, offline Kaldi C++ engine (`libvosk.so`) native for ARM64/ARMv7/x86_64.
   - 100% on-device local execution; zero network transmission during speech recognition.
   - Produces timestamped segments (`startOffsetMs`, `endOffsetMs`) with word confidence metrics and sentence-level punctuation.
2. **Speech Model Management (`ModelManager` & `ModelsScreen`):**
   - Pre-configured catalog of verified, genuinely free models:
     - **Indian English Accent (`vosk-model-small-en-in-0.4`):** 36 MB download, ~80 MB RAM. Optimized for Indian English pronunciations and corporate terms.
     - **Hindi (`vosk-model-small-hi-0.22`):** 42 MB download, ~90 MB RAM. Lightweight pure Hindi model.
     - **Universal English (`vosk-model-small-en-us-0.15`):** 40 MB download, ~80 MB RAM.
   - In-app downloader with live progress percentage bar, automatic ZIP extraction to app-private storage, and one-tap active model selection.
3. **Background Transcription Queue (`TranscriptionQueueManager`):**
   - Resumes automatically after phone reboots or app restarts.
   - Idempotent and concurrency-safe, preventing duplicate transcriptions.
   - Automatically stores recognized segments into Room database (`TranscriptEntity`) with virtual FTS indexing (`TranscriptFtsEntity`).
4. **Interactive Transcript UI (`RecordingDetailsScreen`):**
   - **Click-to-Seek Timestamps:** Tapping any segment timestamp (e.g. `[00:04 - 00:09]`) jumps the audio player directly to that millisecond.
   - **Manual Transcript Correction:** Tapping any segment allows inline text editing, saving corrections with `VERIFIED` status in SQLite.
   - **Reprocess Action:** Allows retranscribing any recording if a new or different language model is activated.

### Features Implemented in Phase 2:
1. **Room SQLite Database (`AppDatabase` v1):**
   - Versioned relational schema with `RecordingEntity`, `TranscriptEntity`, `TranscriptFtsEntity` (FTS4 full-text search), `MeetingEntity`, `TaskEntity`, and `NoteEntity`.
   - Foreign key cascading deletion for transcripts when parent recording is deleted.
   - Relationship preservation (`SET_NULL`) for meetings, tasks, and notes so deleting audio does not delete user notes or meeting minutes.
2. **Foreground Audio Recording Service (`AudioRecordingService`):**
   - Compliant with Android 14+ foreground service restrictions (`foregroundServiceType="microphone"`).
   - Direct 16 kHz 16-bit mono PCM recording to app-private storage (`context.filesDir/recordings`).
   - Incremental streaming `WavWriter` writes valid RIFF/WAVE containers without holding large audio chunks in RAM.
   - Persistent Android notification with duration timer, Pause, Resume, Stop, and Open App actions.
   - Concurrency protection preventing multiple simultaneous recording sessions.
3. **Crash Recovery & Reconciliation:**
   - Detects unfinished sessions upon app startup.
   - Computes actual audio size and duration, repairs WAV RIFF headers in-place, and marks records as `INTERRUPTED` rather than discarding data.
4. **Jetpack Compose User Interface (Material 3):**
   - **Home Screen:** Live recording timer, status badges (`RECORDING`, `PAUSED`, `IDLE`), large start/stop controls, today's recording count/duration metrics, recent recordings list, and runtime permission handling (`RECORD_AUDIO`, `POST_NOTIFICATIONS`).
   - **Recordings Screen:** Searchable list of saved sessions, inline audio playback, title renaming, and deletion with confirmation.
   - **Recording Details Screen:** Comprehensive metadata, interactive audio playback with seek bar, live file integrity diagnostics, and transcription readiness indicators.
   - **Settings Screen:** App-private disk usage calculator, audio specifications, manual crash recovery tool, and privacy policy overview.

---

## 🧪 Automated Unit Tests

All test suites pass with 100% success:
- `RoomDatabaseDaoTest`: Verifies CRUD, cascading deletes, relationship preservation, and FTS/LIKE transcript search.
- `WavWriterTest`: Verifies 44-byte RIFF/WAVE header generation, little-endian chunk offsets, and file finalization.
- `RecordingStateTest`: Verifies state machine transitions and millisecond-to-clock formatting.

Run tests:
```powershell
cd personal-ai-android
.\gradlew.bat testDebugUnitTest
```

---

## 📦 Verified APK Delivery

- **Output APK Path:**
  `personal-ai-android/app/build/outputs/apk/debug/app-debug.apk`
- **File Size:** ~30.08 MB
- **Package Name:** `com.personalai.assistant`
- **Target SDK:** 36 (Android 16 Developer Preview / Android 14+ baseline)
- **Minimum SDK:** 26 (Android 8.0 Oreo)

### Installation Instructions via ADB:
```powershell
adb install -r personal-ai-android\app\build\outputs\apk\debug\app-debug.apk
```
Or transfer `app-debug.apk` to any Android phone (Android 8.0+) via USB/Share and tap to install.
