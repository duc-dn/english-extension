// Web Speech Recognition Helper for Pronunciation Practice

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
}

export interface PronunciationScore {
  score: number; // 0 - 100
  feedback: string;
  matched: boolean;
  transcript: string;
}

// Clean string for loose matching
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate Levenshtein similarity ratio (0 to 1)
export function calculateSimilarity(target: string, spoken: string): number {
  const s1 = normalizeText(target);
  const s2 = normalizeText(spoken);

  if (!s1 && !s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  if (s1 === s2) return 1.0;

  // Check if spoken contains target word or vice-versa
  if (s2.includes(s1) || s1.includes(s2)) {
    const lenRatio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
    return Math.max(0.85, lenRatio);
  }

  const track = Array(s2.length + 1).fill(null).map(() =>
    Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;

  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator, // substitution
      );
    }
  }

  const distance = track[s2.length][s1.length];
  const maxLen = Math.max(s1.length, s2.length);
  return Math.max(0, 1 - distance / maxLen);
}

export function evaluatePronunciation(targetText: string, spokenText: string, lang: 'vi' | 'en' = 'vi'): PronunciationScore {
  const similarity = calculateSimilarity(targetText, spokenText);
  const score = Math.round(similarity * 100);

  let feedback = '';
  let matched = false;

  if (score >= 85) {
    matched = true;
    feedback = lang === 'vi' ? '🎉 Phát âm rất xuất sắc!' : '🎉 Excellent pronunciation!';
  } else if (score >= 65) {
    matched = true;
    feedback = lang === 'vi' ? '👍 Khá tốt! Cố gắng phát âm rõ hơn một chút.' : '👍 Good! Try to pronounce a bit clearer.';
  } else {
    matched = false;
    feedback = lang === 'vi' ? '💪 Chưa chuẩn lắm, hãy nghe lại audio và thử lại nhé!' : '💪 Keep trying! Listen to the audio and try again.';
  }

  return {
    score,
    feedback,
    matched,
    transcript: spokenText
  };
}

export class VoiceRecognitionService {
  private recognition: any = null;
  private isListening: boolean = false;

  constructor() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
    }
  }

  public isSupported(): boolean {
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  public startListening(
    onResult: (transcript: string) => void,
    onError: (err: string) => void,
    onEnd: () => void
  ) {
    if (!this.recognition) {
      onError('Trình duyệt không hỗ trợ nhận diện giọng nói (Web Speech API).');
      return;
    }

    if (this.isListening) {
      this.stopListening();
    }

    this.recognition.onstart = () => {
      this.isListening = true;
    };

    this.recognition.onresult = (event: any) => {
      if (event.results && event.results.length > 0) {
        const transcript = event.results[0][0].transcript;
        onResult(transcript);
      }
    };

    this.recognition.onerror = (event: any) => {
      this.isListening = false;
      onError(event.error || 'Lỗi nhận diện giọng nói.');
    };

    this.recognition.onend = () => {
      this.isListening = false;
      onEnd();
    };

    try {
      this.recognition.start();
    } catch (e: any) {
      this.isListening = false;
      onError(e.message || 'Không thể mở microphone.');
    }
  }

  public stopListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.isListening = false;
    }
  }
}
