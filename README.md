# English Extension 🚀

<div align="center">

![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript_6.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_8.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Dexie.js](https://img.shields.io/badge/IndexedDB-Dexie.js-FFA500?style=for-the-badge&logo=databricks&logoColor=white)
![Ant Design](https://img.shields.io/badge/Ant_Design_6-0170FE?style=for-the-badge&logo=antdesign&logoColor=white)

**An intelligent, all-in-one English learning assistant & productivity suite built directly into Google Chrome.**

[Features](#-key-features) • [Installation](#-installation--setup) • [Keyboard Shortcuts](#-keyboard-shortcuts) • [AI Integration](#-ai-engine--configuration) • [Google Docs Workflow](#-google-docs-workflow) • [Data & Backup](#-data-management--backup)

</div>

---

## 📖 Overview

**English Extension** transforms everyday web browsing into an effortless language acquisition experience. Seamlessly integrated into Chrome via **Manifest V3**, it empowers learners and professionals to capture new vocabulary in context, look up definitions with state-of-the-art AI, review words with an adaptive **Spaced Repetition System (SRS)**, write more confidently, and manage daily study goals with built-in productivity tools.

Whether reading research papers, working inside **Google Docs**, or watching videos, English Extension stays unobtrusive until called—accessible via a single keystroke.

---

## ✨ Key Features

### 🔍 1. Smart Lookup & Contextual Translation
* **Instant Hover & Selection**: Highlight any word or phrase across any webpage to see IPA phonetics, definitions, parts of speech, and translated meanings.
* **Dual Translation Engines**: Choose between lightweight Free Dictionary APIs for instant speed or LLM-powered AI explanations for contextual nuances.
* **Passive Learning & Highlights**: Automatically highlights words you have previously saved as you browse, reinforcing vocabulary retention naturally.

### ⚡ 2. Zero-Latency Side Panel Toggle
* Toggle the extension side panel instantly from anywhere with `Cmd + Shift + E` (macOS) or `Ctrl + Shift + E` (Windows/Linux).
* Pressing the shortcut opens the panel; pressing it again closes it immediately—no mouse clicks required.
* Fully responsive and designed with a modern, glassmorphic layout supporting both **Dark** and **Light** modes.

### 🧠 3. Spaced Repetition (SRS) & Adaptive Flashcards
* **SM-2 Algorithm**: Dynamically calculates future review dates based on 4 retention feedback tiers (*Again*, *Hard*, *Good*, *Easy*).
* **Interactive Flashcards**: Flip cards to test recall, hear audio pronunciations via Web Speech API, and review contextual sentences.
* **Multiple-Choice Quizzes**: Auto-generates randomized quizzes from your vocabulary bank; missed words automatically enter a high-priority review queue.
* **Activity & Streak Tracking**: Visual GitHub-style contribution heatmaps, retention metrics, and daily review targets.

### 🤖 4. AI-Powered Assistant & Chat
* **Context-Aware Chat**: Select text on any web page to automatically attach it as context for your next prompt.
* **Google Docs Formatted Export**: Copy AI responses formatted as markdown or structured rich text (headings, bold, lists, and tables) directly into Google Docs via `Cmd + V`.
* **Flexible Provider Support**:
  * 🌐 **Google Gemini** (Gemini 1.5 Pro / Flash)
  * 🟢 **OpenAI Platform** (GPT-4o, GPT-4o-mini, etc.)
  * 🦙 **Ollama** (Local LLMs without cloud dependency: Llama 3, Mistral, Qwen)
  * ⚡ **DeepSeek API & Custom Proxies**
  * 💬 **ChatGPT Web Sign-In** (Zero-configuration OAuth via native desktop companion)

### 📄 5. Seamless Google Docs Integration
* **Non-Intrusive Word Lookups**: Reads selected words in Google Docs using screen-reader accessibility announcements—preserving your clipboard contents.
* Press `Shift` on any selection inside Google Docs for instantaneous inline definitions.
* Direct AI text insertion into Google Docs with preserved formatting.

### 🍅 6. Built-in Study Productivity Suite
* **Pomodoro Timer**: Configurable focus/break cycles with desktop notifications, sound alerts, and a lightweight floating widget that remains accessible across tabs.
* **Task & To-Do Management**: Organize study tasks by priority, tags, and due dates. Includes an active badge counter on the extension icon for pending tasks.

### 🔄 7. Data Sovereignty & Cloud Backup
* **Local-First Storage**: Powered by **IndexedDB (Dexie.js)** for ultra-fast, offline-ready operation.
* **CSV Import & Export**: Import your existing Anki or custom spreadsheets, or export your vocabulary database anytime.
* **Automated GitHub Backup**: Sync your entire vocabulary, grammar notebooks, and review logs directly to a private GitHub repository.

---

## ⌨️ Keyboard Shortcuts

| Shortcut (macOS) | Shortcut (Win / Linux) | Action | Scope |
| :--- | :--- | :--- | :--- |
| <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd> | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd> | **Toggle Side Panel** (Open / Close) | Global (any tab) |
| <kbd>Shift</kbd> | <kbd>Shift</kbd> | Quick translation of selected text | Google Docs & Webpages |
| <kbd>Esc</kbd> | <kbd>Esc</kbd> | Dismiss active popups & overlays | Webpage |
| <kbd>⌘</kbd> + <kbd>V</kbd> | <kbd>Ctrl</kbd> + <kbd>V</kbd> | Paste formatted AI response | Google Docs / Editors |

> 💡 *Note: Shortcuts can be customized anytime via `chrome://extensions/shortcuts`.*

---

## 🚀 Installation & Setup

### Prerequisites
* **Node.js** >= 18.0.0
* **npm** >= 9.0.0
* Google Chrome, Brave, Arc, or any Chromium-based browser supporting **Manifest V3**.

### Step-by-Step Build

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/english-extension.git
   cd english-extension
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the production bundle:**
   ```bash
   npm run build
   ```

4. **Load into Google Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** using the toggle in the top-right corner.
   - Click **Load unpacked** and select the generated `dist/` directory inside this project.
   - The extension is now active! Pin it to your toolbar for quick access.

### Development Mode
For live hot-reloading during development:
```bash
npm run dev
```

Run automated tests (Vitest + JSDOM):
```bash
npm test
```

---

## 🤖 AI Engine & Configuration

Navigate to **Settings** (`⚙️`) inside the extension to choose your preferred AI backend:

```
Settings ➔ AI Configuration ➔ Select Provider
```

| Provider | Requirement | Notes |
| :--- | :--- | :--- |
| **Google Gemini** | Google AI Studio API Key | Ultra-fast responses with generous free limits. |
| **OpenAI API** | OpenAI Platform Secret Key | Full access to GPT-4o, GPT-4o-mini, and custom endpoints. |
| **DeepSeek** | DeepSeek API Key / Proxy | Cost-effective, high-reasoning translation models. |
| **Ollama** | Local installation (`localhost:11434`) | 100% private & offline. Run `ollama run llama3`. |
| **ChatGPT Sign-In** | Personal / Work ChatGPT Account | Uses your active ChatGPT subscription via Native Companion. |

### Setting Up ChatGPT Sign-In (macOS Chrome)
To sign in using your existing ChatGPT account without paying for API keys:
1. In the project directory, run the native host installer once:
   ```bash
   npm run chatgpt:install-host -- <extension-id>
   ```
2. Reload the extension in `chrome://extensions`.
3. In Extension Settings, click **Continue with ChatGPT**, complete the authorization in your browser, and click **Auto-detect Models**.
4. The local helper runs securely over `127.0.0.1` via Chrome Native Messaging with owner-only access permissions (`~/.config/english-extension/chatgpt.json`).

---

## 📑 Google Docs Workflow

1. Open any document on [Google Docs](https://docs.google.com/document/).
2. Enable accessibility support once:
   * **Tools** $\rightarrow$ **Accessibility** $\rightarrow$ Check **Turn on screen reader support**.
3. Select any English word or paragraph and tap <kbd>Shift</kbd> to see the instant translation card without polluting your system clipboard.
4. To paste rich AI explanations back into the document, click **Copy for Google Docs** in the AI chat response, switch to Docs, and press <kbd>Cmd</kbd> + <kbd>V</kbd>.

---

## 📊 Data Management & Backup

### CSV Import & Export
You can batch import existing vocabulary or export your deck anytime:
* Supported columns: `word`, `meaning` *(required)*; `phonetic`, `example`, `description`, `tags` *(optional, semicolon-separated)*.
* Maximum file size: **5 MB**.
* Non-destructive: Existing review progress is never overwritten on duplicate imports.

### GitHub Cloud Sync
1. Generate a GitHub Personal Access Token (PAT) with `repo` scope.
2. In **Settings** $\rightarrow$ **GitHub Backup**, specify your repository name (e.g., `username/my-vocab-backup`).
3. Back up all words, grammar notes, and review history with one click, or restore your learning data on any new device.

---

## 🏗️ Project Architecture

```
english-extension/
├── src/
│   ├── background.ts             # Service worker: shortcuts, alarms, context menus, native messaging
│   ├── content.tsx               # In-page overlay, text selection listener, Docs tracker
│   ├── App.tsx                   # Multi-mode root router (popup, sidepanel, dashboard)
│   ├── components/
│   │   ├── CompactView.tsx       # Core Side Panel & Popup UI (Vocabulary, AI Chat, Flashcards)
│   │   ├── PomodoroTimerWidget.tsx # Floating Pomodoro timer widget
│   │   ├── WritingAssistantOverlay.tsx # In-place writing & grammar corrector
│   │   └── MainLayout.tsx        # Desktop Dashboard container
│   ├── pages/
│   │   ├── Dashboard.tsx         # Learning analytics & streak statistics
│   │   ├── VocabularyManager.tsx # Full-screen vocabulary table & bulk editor
│   │   ├── FlashcardReview.tsx   # Spaced repetition study mode
│   │   ├── QuizPage.tsx          # Multiple-choice review quizzes
│   │   ├── TodoPage.tsx          # Task & study organizer
│   │   └── SettingsPage.tsx      # Comprehensive AI, Sync, & Theme settings
│   └── lib/
│       ├── db.ts                 # Dexie.js (IndexedDB) database schema
│       ├── translator.ts         # Multi-provider translation & AI pipeline
│       ├── srs.ts                # SM-2 spaced repetition calculation logic
│       └── googleDocsA11y.ts     # Google Docs accessibility bridge
├── companion/                    # ChatGPT Native Messaging host & OAuth bridge
├── vite.config.ts                # Vite + CRXJS plugin configuration
└── package.json                  # Dependencies, test scripts, and build tooling
```

---

## 🛠️ Tech Stack

* **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Ant Design 6](https://ant.design/), [Lucide React](https://lucide.dev/)
* **Build System**: [Vite 8](https://vitejs.dev/) with [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin/)
* **Database**: [Dexie.js](https://dexie.org/) (Client-side IndexedDB with reactive live queries)
* **Testing**: [Vitest](https://vitest.dev/) & [Testing Library](https://testing-library.com/) with JSDOM
* **Standards**: Chrome Extensions **Manifest V3**

---

## 🛡️ Privacy & Security

* **Zero Tracking**: English Extension does not collect, track, or sell your browsing history, selected text, or personal data.
* **Local-First Architecture**: Your vocabulary, grammar notes, and flashcard history reside exclusively in your browser's local IndexedDB.
* **Direct API Connections**: AI requests are transmitted directly between your browser and the configured AI provider. No intermediate tracking servers are used.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
