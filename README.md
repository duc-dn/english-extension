# English Extension

Chrome extension for saving English vocabulary while browsing, translating selected text, and reviewing words with flashcards and quizzes. The interface supports Vietnamese and English.

## Features

- Save a selected word or phrase from a page, add meanings and examples, and organize entries with tags.
- Look up definitions and Vietnamese meanings; optionally use Gemini, OpenAI API, Ollama, or ChatGPT sign-in for AI explanations.
- Review due words with four spaced-repetition ratings. Mastered words return when their next review is due.
- Practice with a multiple-choice quiz. Missed words return to the review queue shortly afterward.
- Track activity, streaks, mastery, and a configurable daily review goal.
- Import and export vocabulary as CSV. Import skips existing words without overwriting review progress.
- Back up vocabulary, grammar notes, and review history to a configured GitHub repository.
- With AI Chat open, select text on a web page to attach it as context for your next question. A short preview appears above the chat input and can be removed there. On send, the context is attached to that message and the input preview clears. Selection does not change the clipboard.
- In an AI Chat reply, click the Copy icon and choose **Copy Markdown** for the source text or **Copy for Google Docs** for formatted headings, bold text, lists, and tables. After choosing the Google Docs format, paste with `Cmd+V` or `Ctrl+V`.

## Google Docs

Open a document at `docs.google.com/document/` and turn on **Screen reader support** in Google Docs accessibility settings. Select an English word or passage, then press **Shift** to translate it immediately. This reads Docs' accessibility announcement and does not change the clipboard. You can also press **Copy** (`Cmd+C` on macOS or `Ctrl+C` on Windows/Linux) and click the English Extension button for lookup and saving. Reload the extension and the Google Docs tab after building this version. The extension reads the clipboard only after your Copy action.

## Install locally

```bash
npm install
npm run build
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select this project's `dist` folder. After rebuilding, press **Reload** on the extension card.

For development, run `npm run dev`. Run `npm test` for the automated checks.

## Vocabulary CSV

Use **Import CSV** and **Export CSV** on the Vocabulary page. The file needs `word` and `meaning` columns. Optional columns are `phonetic`, `example`, `description`, and `tags`. Separate multiple tags with semicolons. Files are limited to 5 MB. CSV import adds new words with a fresh review schedule; it does not replace existing entries or import review history.

For a full backup that also includes grammar notes and review history, use GitHub backup in Settings.

## AI connection

Choose a provider in Settings and use **Test AI connection** before translating. OpenAI API requires an API key from the OpenAI Platform.

For ChatGPT sign-in on macOS Chrome, run the **native host install command shown in Settings once** from the project directory. Reload the extension, click **Continue with ChatGPT**, complete consent in the browser, then click **Check connection** and **Auto-detect Models**. Chrome starts the local helper automatically through Native Messaging; no terminal process or pairing code is needed after installation. The helper listens only on `127.0.0.1`, keeps OAuth credentials in `~/.config/english-extension/chatgpt.json` with owner-only permissions, and sends requests to the public Responses API. ChatGPT plan usage requires an eligible account and explicit permission during sign-in.

For development without a native host, run `npm run chatgpt:companion` and enter its pairing code under **Manual connection** in Settings. The installer copies the helper into `~/.config/english-extension` so Chrome does not need access to the project folder. Run the install command again after changing the helper or moving Node.

If OpenAI shows “Your organization hasn't enabled access for this app” (`3p_delegated_access_policy_denied`), the organization must approve the app in Admin Console → External access. You can use **Use another account** to start a fresh registration with an eligible personal account; select that account in the OpenAI sign-in page. The app cannot override an organization policy.
