// Sound, speech and vibration. While scanning the phone lies screen-down,
// so this is the only way to talk to the user. The AudioContext has to be
// created from a user gesture, hence unlock() on the Start button.

export type Cue = "tick" | "ready" | "measured" | "warning";

const CUES: Record<Cue, { freq: number; ms: number }[]> = {
  tick: [{ freq: 880, ms: 70 }],
  ready: [
    { freq: 660, ms: 120 },
    { freq: 990, ms: 180 },
  ],
  measured: [{ freq: 1320, ms: 140 }],
  warning: [{ freq: 220, ms: 450 }],
};

const VIBRATION: Record<Cue, number[]> = {
  tick: [30],
  ready: [60, 60, 60],
  measured: [120],
  warning: [400],
};

export class Feedback {
  private ctx: AudioContext | null = null;
  voice = true;

  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        this.ctx = null;
      }
    }
    void this.ctx?.resume();
    // Some Android voices only start speaking after a gesture-initiated call.
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }

  cue(cue: Cue): void {
    navigator.vibrate?.(VIBRATION[cue]);
    const ctx = this.ctx;
    if (!ctx) return;
    let at = ctx.currentTime + 0.01;
    for (const { freq, ms } of CUES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.4, at + 0.01);
      gain.gain.setValueAtTime(0.4, at + ms / 1000 - 0.02);
      gain.gain.linearRampToValueAtTime(0, at + ms / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + ms / 1000);
      at += ms / 1000 + 0.06;
    }
  }

  say(text: string, interrupt = false): void {
    if (!this.voice || !("speechSynthesis" in window)) return;
    if (interrupt) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking(): void {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }
}
