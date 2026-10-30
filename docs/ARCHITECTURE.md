# SYSTEM ARCHITECTURE: PERSONAL AI ASSISTANT

## 1. Overview & Clean Architecture

The Personal AI Assistant follows modern Android Architecture Components adhering to Clean Architecture principles:

```
┌─────────────────────────────────────────────────────────────┐
│                       UI Layer                              │
│  - Jetpack Compose Screens (Material 3)                     │
│  - StateFlow & ViewModel (Unidirectional Data Flow)          │
│  - Bottom Navigation & Dialogs                              │
└──────────────────────────────┬──────────────────────────────┘
                               │ Observes UI State / Sends Intents
┌──────────────────────────────▼──────────────────────────────┐
│                    Domain & Service Layer                   │
│  - AudioRecordingService (Foreground Service + Notification)│
│  - SpeechTranscriptionManager (Whisper.cpp / Vosk STT)      │
│  - MeetingMinutesExtractor (Deterministic NLP + LLM hybrid) │
│  - DailySummarySynthesizer (End-of-day aggregator)          │
│  - PersonalMemorySearchEngine (Room FTS + RAG retrieval)    │
│  - ScheduledSummaryWorker (WorkManager periodic task)       │
└──────────────────────────────┬──────────────────────────────┘
                               │ Interacts with Repositories
┌──────────────────────────────▼──────────────────────────────┐
│                      Data Layer                             │
│  - Room Database (Entities: Recordings, Transcripts,         │
│                   Meetings, ActionItems, Summaries, Notes)  │
│  - DataStore Preferences (Model paths, settings, schedules) │
│  - App-Private Storage (Encrypted / Sandboxed audio files)  │
└─────────────────────────────────────────────────────────────┘
```

## 2. Key Modules & Subsystems

### A. Foreground Audio Recording Service (`AudioRecordingService`)
- Operates as a foreground service with `foregroundServiceType="microphone"`.
- Emits a persistent Android notification with playback controls (Pause, Resume, Stop).
- Records audio in WAV/AAC format to app-private storage (`context.filesDir/recordings/`).
- Incremental segmentation: automatically splits long audio into chunks (e.g. 15-30 minutes) to avoid memory starvation and data loss if terminated.
- Crash recovery: If the service or device reboots, incomplete segments are cleanly closed and registered into the database upon app relaunch.

### B. On-Device Speech-to-Text Transcription (`TranscriptionManager`)
- Supported models:
  - English & Hindi (`whisper-tiny`, `whisper-base`, `whisper-small`, `vosk-model-small-en-in`, `vosk-model-small-hi`).
- Background Processing Queue:
  - Recordings are processed sequentially in a background coroutine dispatcher (`Dispatchers.Default`).
  - Audio files are converted or streamed in 16 kHz 16-bit mono PCM chunks.
  - Generates timestamped segment entries with start/end offset and formatted text.
  - Transcripts are persisted directly to Room SQLite database.
- Idempotency & Recovery:
  - Status flags (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
  - Automatically recovers uncompleted items on next launch without duplicate work.

### C. Meeting Minutes Extraction & Daily Summaries
- **Meeting Minutes Extractor:**
  - Analyzes transcript segments using deterministic NLP pattern matching:
    - Title & Objective inference.
    - Attendees (manually confirmed or detected).
    - Executive summary (key sentence extraction via TextRank scoring).
    - Action items with assignees and deadlines (regex and grammatical tense detection: "will do", "by tomorrow", "assigned to", etc.).
    - Decisions made & Risks/Blockers.
    - Full bidirectional timestamp linking to audio playback positions.
- **Daily Personal AI Summary:**
  - WorkManager job triggers at configurable time (default: 8:30 PM).
  - Collects all recordings, transcripts, notes, and tasks created or discussed during the day.
  - Groups items by topics and generates high-level briefing.

### D. Personal Memory & Searchable History
- Room SQLite with FTS (Full-Text Search) across all transcripts, meetings, summaries, and notes.
- Clickable timestamp navigation: tapping any transcript phrase jumps the audio player directly to that millisecond.
- Knowledge Base: tracks people, entities, tags, and pinned notes.

### E. Personal AI Chat (RAG - Retrieval-Augmented Generation)
- Purely on-device retrieval: queries Room FTS for relevant context across conversations, meetings, and notes.
- Synthesizes answers strictly from retrieved source context with exact timestamp citations.
- When no information is found in records, honestly reports lack of data rather than hallucinating.

### F. Security, Privacy & Export
- Hardware-backed AES-256-GCM encryption for backups.
- Clean PDF generation using native Android `PdfDocument`.
- Plaintext exports: Markdown (`.md`), TXT, JSON, CSV.
- Zero analytics, zero cloud beacons, zero 3rd party tracker SDKs.

---

## 3. Phase 2 Implementation Summary

- **Room SQLite Database (`AppDatabase` v1):**
  - Entities: `RecordingEntity`, `TranscriptEntity`, `TranscriptFtsEntity` (FTS4 full-text search), `MeetingEntity`, `TaskEntity`, `NoteEntity`.
  - Cascading deletion: Deleting a recording deletes associated transcript segments automatically.
  - Relationship preservation: Deleting a recording sets `sourceRecordingId` to `null` on Meetings, Tasks, and Notes, preventing accidental data loss.
- **Microphone Foreground Service (`AudioRecordingService`):**
  - Uses `AudioRecord` with native 16 kHz 16-bit mono linear PCM.
  - Streaming incremental writer (`WavWriter`) generates valid RIFF/WAVE containers directly in `context.filesDir/recordings`.
  - State machine: `IDLE -> RECORDING <-> PAUSED -> FINALIZING -> COMPLETED` (plus `ERROR`).
  - Persistent notification with duration timer, Pause/Resume, Stop, and Open App intents.
  - Automatic crash recovery: `reconcileIncompleteRecordings` detects unfinalized recordings at startup, calculates duration, repairs WAV RIFF headers in place, and preserves data.
- **Audio Playback Engine (`AudioPlayer`):**
  - Native `MediaPlayer` implementation for in-app playback with progress tracking, pause/resume, and seeking.
- **Jetpack Compose UI (Material 3):**
  - `HomeScreen`: Runtime permission handling (`RECORD_AUDIO`, `POST_NOTIFICATIONS`), live recording status/timer, Pause/Stop controls, today's metrics, recent recordings.
  - `RecordingsScreen`: Complete list of sessions, inline playback, rename dialog, delete confirmation.
  - `RecordingDetailsScreen`: In-depth metadata, interactive audio playback with seek slider, live file integrity verification.
  - `SettingsScreen`: App-private disk usage calculator, audio specifications, manual crash recovery tool, privacy statement.

---

## 4. Phase 3 Implementation Summary: On-Device Speech-to-Text

- **Native Offline STT Engine (`VoskTranscriptionEngine`):**
  - Bundled native Kaldi C++ engine (`libvosk.so` & `libjnidispatch.so`) compiled for `arm64-v8a`.
  - Directly processes 16kHz 16-bit mono PCM WAV audio with 0 transcoding latency.
  - Extracts word-level and sentence-level timestamps (`startOffsetMs`, `endOffsetMs`) and average confidence metrics.
  - Applies automated sentence capitalization and sentence-ending punctuation.
- **Model Downloader & Catalog (`ModelManager`):**
  - Pre-configured catalog of verified, genuinely free models:
    - `vosk-model-small-en-in-0.4` (Indian English Accent, 36 MB)
    - `vosk-model-small-hi-0.22` (Hindi हिन्दी, 42 MB)
    - `vosk-model-small-en-us-0.15` (Universal English, 40 MB)
  - One-tap download with live progress indicator, direct extraction into `context.filesDir/models/`, and active model switching.
- **Background Transcription Queue (`TranscriptionQueueManager`):**
  - Queues recordings marked `PENDING`.
  - Startup recovery: automatically resumes interrupted or pending transcriptions on app launch.
  - Atomically guards against duplicate processing.
  - Persists recognized segments directly into Room SQLite `TranscriptEntity` and virtual `TranscriptFtsEntity`.
- **Interactive Transcript UI:**
  - `RecordingDetailsScreen`:
    - Shows live transcription progress bar with percentage.
    - Timestamp navigation: clicking any transcript segment (`[00:04 - 00:09]`) jumps the audio player to that exact millisecond.
    - User editing: tapping any segment opens an inline correction dialog, updating text and marking status as `VERIFIED`.
    - "Reprocess" button to retranscribe with active or updated speech model.

---

## 5. Phase 4 Implementation Summary: Meeting Minutes & Daily AI Summaries

- **Deterministic NLP Meeting Minutes Extractor (`MeetingMinutesExtractor`):**
  - Parses transcript segments (text and timestamps) directly on-device with zero cloud dependencies.
  - Extracts:
    - Meeting title & objective
    - Attendees / participants (from conversational cues)
    - Executive summary (extractive frequency scoring / TextRank)
    - Discussion points with timestamp links
    - **Decisions Made** (cues: "agreed", "decided", "approved", "going with", "consensus")
    - **Action Items** (cues: "will do", "need to", "action item", "assigned to") with inferred assignees and relative deadlines ("by tomorrow", "by Friday", "by Monday")
    - Open questions, risks, and blockers
  - Persists structured meeting records to `MeetingEntity` and extracted tasks into `TaskEntity`.
- **Daily Personal AI Summary & Background Scheduler (`DailySummaryWorker`):**
  - Android `WorkManager` background task scheduled at 8:30 PM daily (`PeriodicWorkRequestBuilder`).
  - Aggregates the day's audio recordings, meetings, and completed/pending action items.
  - Generates an end-of-day markdown briefing and posts an Android notification.
  - Saves the summary as a pinned note in Room SQLite.
  - "Generate Today's Summary Now" manual trigger available in UI anytime.
- **Meeting & Task Management UI:**
  - `MeetingsScreen`: List of all meeting minutes with executive summaries and timestamps.
  - `MeetingDetailsScreen`: In-depth breakdown with editable executive summary, action items, and spoken segments.
  - `TasksScreen`: Filterable task board (All / Pending / Completed), checkbox toggles, and manual task creation.

---

## 6. Phase 5 Implementation Summary: Personal Memory, FTS & Local AI Chat

- **Fast Offline Full-Text Search (`MemoryScreen`):**
  - Sub-millisecond search across transcripts (`TranscriptFtsEntity`), meetings, tasks, and personal notes.
  - Instant categorized results with clickable cards linking to source recordings and meetings.
- **Personal Notes & Knowledge Base:**
  - Create, edit, pin/unpin, and delete thoughts, ideas, and meeting notes.
- **Source-Grounded Local RAG AI Chat (`ChatScreen` & `LocalRagChatEngine`):**
  - Conversational interface answering queries based strictly on local voice memory.
  - Interactive citation chips (`[RECORDING #1 @ 01:23]`, `[MEETING]`, `[TASK]`).
  - Strict zero-hallucination guarantee: explicitly reports when no matching records are found.

---

## 7. Phase 6 & 7 Implementation Summary: Export, Hardware Backup & Delivery

- **Multi-Format Export Engine (`ExportManager`):**
  - **Native PDF:** Generates clean, styled PDF documents using Android's built-in `PdfDocument` with title, executive summary, decisions, and action items table.
  - **Markdown (`.md`), Plain Text (`.txt`), JSON, and CSV** exporters.
  - Android system share sheet integration (`FileProvider`).
- **Hardware-Backed AES-256-GCM Encrypted Backup (`BackupManager`):**
  - Full database snapshot encrypted with AES-256-GCM using PBKDF2-derived key from user passphrase.
  - Snapshot verification and restoration.
- **Audio Retention & Privacy Controls (`RetentionManager`):**
  - Automatic retention policies: Keep Forever, 7 Days, 30 Days, or Delete Audio Once Transcribed.
  - Nuclear reset option ("Clear All Data") with confirmation dialog.
- **Verification & Deployment:**
  - All 8 unit test suites passing (`BUILD SUCCESSFUL`).
  - Installed and verified on physical Android device (`Xiaomi 2406ERN9CI`).

