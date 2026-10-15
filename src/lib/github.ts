import { db } from './db';
import { getSettings } from './settings';

export async function syncToGithub() {
  const settings = await getSettings();
  if (!settings.github_repo || !settings.github_token) {
    throw new Error('GitHub repository URL or Personal Access Token is missing.');
  }

  const { github_repo, github_token } = settings;
  // Clean repo format in case user provided full url or leading/trailing slashes
  const cleanRepo = github_repo.replace('https://github.com/', '').replace(/^\/+|\/+$/g, '');
  
  const apiUrl = `https://api.github.com/repos/${cleanRepo}/contents/english-learning-backup.json`;
  
  // 1. Gather Data
  const words = await db.words.toArray();
  const grammar_notes = await db.grammar_notes.toArray();
  const review_history = await db.review_history.toArray();
  const todos = await db.todos.toArray();

  const backupData = {
    export_date: new Date().toISOString(),
    words,
    grammar_notes,
    review_history,
    todos,
  };

  const contentBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(backupData, null, 2))));

  // 2. Check if file exists to get its SHA (required for updating an existing file in GitHub)
  let sha = undefined;
  try {
    const getRes = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${github_token}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    });

    if (getRes.ok) {
      const getJson = await getRes.json();
      sha = getJson.sha;
    }
  } catch (error) {
    console.warn('File might not exist yet, continuing to create new file.');
  }

  // 3. Push to GitHub
  const body = {
    message: `Sync vocabulary backup - ${new Date().toLocaleString()}`,
    content: contentBase64,
    ...(sha ? { sha } : {})
  };

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${github_token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });

  if (!putRes.ok) {
    const errData = await putRes.json();
    throw new Error(`GitHub API Error: ${errData.message || putRes.statusText}`);
  }

  return true;
}

export async function syncFromGithub() {
  const settings = await getSettings();
  if (!settings.github_repo || !settings.github_token) {
    throw new Error('GitHub repository URL or Personal Access Token is missing.');
  }

  const { github_repo, github_token } = settings;
  const cleanRepo = github_repo.replace('https://github.com/', '').replace(/^\/+|\/+$/g, '');
  
  const apiUrl = `https://api.github.com/repos/${cleanRepo}/contents/english-learning-backup.json`;

  const getRes = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${github_token}`,
      'Accept': 'application/vnd.github.v3+json',
    }
  });

  if (!getRes.ok) {
    if (getRes.status === 404) {
      throw new Error(settings.language === 'vi' 
        ? 'Không tìm thấy tệp sao lưu (english-learning-backup.json) trên kho lưu trữ GitHub.' 
        : 'No backup file (english-learning-backup.json) found on GitHub repository.');
    }
    const errData = await getRes.json();
    throw new Error(`GitHub API Error: ${errData.message || getRes.statusText}`);
  }

  const getJson = await getRes.json();
  const contentDecoded = decodeURIComponent(escape(atob(getJson.content)));
  const backupData = JSON.parse(contentDecoded);

  const words = backupData.words || [];
  const grammar_notes = backupData.grammar_notes || [];
  const review_history = backupData.review_history || [];
  const todos = backupData.todos || [];

  const processedWords = words.map((w: any) => ({
    ...w,
    created_at: w.created_at ? new Date(w.created_at) : new Date(),
    next_review: w.next_review ? new Date(w.next_review) : new Date(),
  }));

  const processedGrammar = grammar_notes.map((g: any) => ({
    ...g,
    created_at: g.created_at ? new Date(g.created_at) : new Date(),
    next_review: g.next_review ? new Date(g.next_review) : new Date(),
  }));

  const processedHistory = review_history.map((h: any) => ({
    ...h,
    reviewed_at: h.reviewed_at ? new Date(h.reviewed_at) : new Date(),
  }));

  await db.transaction('rw', [db.words, db.grammar_notes, db.review_history, db.todos], async () => {
    if (processedWords.length > 0) {
      await db.words.bulkPut(processedWords);
    }
    if (processedGrammar.length > 0) {
      await db.grammar_notes.bulkPut(processedGrammar);
    }
    if (processedHistory.length > 0) {
      await db.review_history.bulkPut(processedHistory);
    }
    if (todos.length > 0) {
      await db.todos.bulkPut(todos);
    }
  });

  return true;
}
