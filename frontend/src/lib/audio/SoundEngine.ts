/**
 * Sound Engine — Web Audio API synthesizer for insight moments.
 * All sounds are generated programmatically, no external files needed.
 * Designed for "tech + academic" feel: clean, crisp, spatial.
 */

type SoundType = "connect" | "insight" | "hover" | "error" | "achievement";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.6; // 0-1

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  setEnabled(v: boolean) { this.enabled = v; }
  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); }

  /** Short crisp tone — node connection, UI action */
  connect() {
    if (!this.enabled) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

    gain.gain.setValueAtTime(this.volume * 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** Layered ascending tone — insight discovery */
  insight() {
    if (!this.enabled) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    // Layer 1: rising sine
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(440, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.4);
    gain1.gain.setValueAtTime(this.volume * 0.1, now);
    gain1.gain.linearRampToValueAtTime(this.volume * 0.18, now + 0.15);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);

    // Layer 2: shimmer triangle
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(660, now + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.5);
    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.linearRampToValueAtTime(this.volume * 0.08, now + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.7);

    // Layer 3: harmonic bell (delayed)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = "sine";
    osc3.frequency.setValueAtTime(1320, now + 0.2);
    gain3.gain.setValueAtTime(0.001, now);
    gain3.gain.linearRampToValueAtTime(this.volume * 0.12, now + 0.3);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    osc3.connect(gain3).connect(ctx.destination);
    osc3.start(now + 0.2);
    osc3.stop(now + 1.0);
  }

  /** Spatial subtle tone — drag/hover */
  hover() {
    if (!this.enabled) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, now); // C5
    gain.gain.setValueAtTime(this.volume * 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Soft warning */
  error() {
    if (!this.enabled) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.setValueAtTime(280, now + 0.15);
    gain.gain.setValueAtTime(this.volume * 0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /** Achievement — celebratory ascending arpeggio */
  achievement() {
    if (!this.enabled) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.12;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(this.volume * 0.12, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  }

  play(type: SoundType) {
    switch (type) {
      case "connect": this.connect(); break;
      case "insight": this.insight(); break;
      case "hover": this.hover(); break;
      case "error": this.error(); break;
      case "achievement": this.achievement(); break;
    }
  }
}

// Singleton
export const soundEngine = new SoundEngine();
