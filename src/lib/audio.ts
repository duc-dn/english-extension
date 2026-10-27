export const playAudio = (text: string, rate: number = 0.9, lang: string = 'en-US') => {
  if (!window.speechSynthesis) {
    console.warn("Speech Synthesis API not supported in this browser.");
    return;
  }
  
  // Cancel any ongoing speech to avoid overlapping
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  
  window.speechSynthesis.speak(utterance);
};

export const playPomodoroChime = (type: 'focus_complete' | 'break_complete' = 'focus_complete') => {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const notes = type === 'focus_complete'
      ? [
          { freq: 523.25, delay: 0.0, dur: 0.8 },
          { freq: 659.25, delay: 0.15, dur: 0.8 },
          { freq: 783.99, delay: 0.3, dur: 0.9 },
          { freq: 1046.50, delay: 0.45, dur: 1.4 },
        ]
      : [
          { freq: 659.25, delay: 0.0, dur: 0.7 },
          { freq: 880.00, delay: 0.2, dur: 1.2 },
        ];

    notes.forEach(({ freq, delay, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.2, now + delay + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.05);
    });
  } catch (err) {
    console.warn("Could not play pomodoro chime:", err);
  }
};

export const playTaskCompleteChime = () => {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const notes = [
      { freq: 587.33, delay: 0.0, dur: 0.35 },  // D5
      { freq: 880.00, delay: 0.1, dur: 0.55 },  // A5
    ];
    notes.forEach(({ freq, delay, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.15, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.05);
    });
  } catch (err) {
    console.warn("Could not play task complete chime:", err);
  }
};

export const playReminderAlertChime = () => {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const notes = [
      { freq: 659.25, delay: 0.0, dur: 0.3 },  // E5
      { freq: 523.25, delay: 0.12, dur: 0.3 }, // C5
      { freq: 783.99, delay: 0.24, dur: 0.6 }, // G5
    ];
    notes.forEach(({ freq, delay, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.2, now + delay + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.05);
    });
  } catch (err) {
    console.warn("Could not play reminder alert chime:", err);
  }
};

// Ambient Sound Generator for Focus Sessions (100% Offline Web Audio API)
let ambientSource: AudioBufferSourceNode | null = null;
let ambientGain: GainNode | null = null;
let ambientCtx: AudioContext | null = null;
let currentAmbientType: 'none' | 'rain' | 'waves' | 'cafe' = 'none';

export const getCurrentAmbientType = () => currentAmbientType;

export const startAmbientSound = (type: 'rain' | 'waves' | 'cafe', volume: number = 0.25) => {
  stopAmbientSound();
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    ambientCtx = new AudioContextClass();
    if (ambientCtx.state === 'suspended' && typeof ambientCtx.resume === 'function') {
      ambientCtx.resume().catch(() => {});
    }

    const sampleRate = ambientCtx.sampleRate;
    const bufferSize = sampleRate * 3; // 3-second seamless loop buffer
    const buffer = ambientCtx.createBuffer(2, bufferSize, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let lastLeft = 0.0;
    let lastRight = 0.0;

    for (let i = 0; i < bufferSize; i++) {
      const whiteL = Math.random() * 2 - 1;
      const whiteR = Math.random() * 2 - 1;

      if (type === 'rain') {
        // Pinkish / soft filtered noise for rain drops
        lastLeft = (lastLeft + 0.03 * whiteL) / 1.02;
        lastRight = (lastRight + 0.03 * whiteR) / 1.02;
        left[i] = lastLeft * 2.8;
        right[i] = lastRight * 2.8;
      } else if (type === 'waves') {
        // Ocean swell with slow sinusoidal gain modulation
        const waveSwell = Math.sin((i / bufferSize) * Math.PI * 2) * 0.5 + 0.5;
        lastLeft = (lastLeft + 0.015 * whiteL) / 1.015;
        lastRight = (lastRight + 0.015 * whiteR) / 1.015;
        left[i] = lastLeft * 3.5 * waveSwell;
        right[i] = lastRight * 3.5 * waveSwell;
      } else {
        // Cafe warm murmur / brown noise
        lastLeft = (lastLeft + 0.01 * whiteL) / 1.01;
        lastRight = (lastRight + 0.01 * whiteR) / 1.01;
        left[i] = lastLeft * 3.0;
        right[i] = lastRight * 3.0;
      }
    }

    ambientSource = ambientCtx.createBufferSource();
    ambientSource.buffer = buffer;
    ambientSource.loop = true;

    const filter = ambientCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = type === 'rain' ? 1200 : (type === 'waves' ? 600 : 800);

    ambientGain = ambientCtx.createGain();
    ambientGain.gain.setValueAtTime(volume, ambientCtx.currentTime);

    ambientSource.connect(filter);
    filter.connect(ambientGain);
    ambientGain.connect(ambientCtx.destination);

    ambientSource.start();
    currentAmbientType = type;
  } catch (err) {
    console.warn("Could not start ambient sound:", err);
  }
};

export const setAmbientVolume = (volume: number) => {
  if (ambientGain && ambientCtx) {
    ambientGain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ambientCtx.currentTime);
  }
};

export const stopAmbientSound = () => {
  if (ambientSource) {
    try { ambientSource.stop(); } catch (e) {}
    try { ambientSource.disconnect(); } catch (e) {}
    ambientSource = null;
  }
  if (ambientCtx) {
    try { ambientCtx.close(); } catch (e) {}
    ambientCtx = null;
  }
  currentAmbientType = 'none';
};


