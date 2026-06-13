export const playAudio = (text: string) => {
  if (!window.speechSynthesis) {
    console.warn("Speech Synthesis API not supported in this browser.");
    return;
  }
  
  // Cancel any ongoing speech to avoid overlapping
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US'; // Default to US English
  utterance.rate = 0.9; // Slightly slower for clear pronunciation
  
  window.speechSynthesis.speak(utterance);
};
