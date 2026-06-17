export class AudioManager {
  constructor(scene) {
    this.scene = scene;
    this.musicVolume = 0.4;
    this.sfxVolume   = 0.8;
    this.currentBGM  = null;
    this.isEnabled   = window.MLA?.store?.settings?.musicEnabled !== false;
    this.sfxEnabled  = window.MLA?.store?.settings?.soundEnabled !== false;
  }

  playBGM(key, fade = 1000) {
    if (!this.isEnabled) return;
    if (this.currentBGM?.key === key) return;
    if (this.currentBGM) {
      this.scene.tweens.add({ targets: this.currentBGM, volume: 0, duration: fade / 2, onComplete: () => this.currentBGM?.stop() });
    }
    try {
      this.currentBGM = this.scene.sound.add(key, { loop: true, volume: 0 });
      this.currentBGM.play();
      this.scene.tweens.add({ targets: this.currentBGM, volume: this.musicVolume, duration: fade });
    } catch { /* asset not loaded yet */ }
  }

  stopBGM(fade = 1000) {
    if (!this.currentBGM) return;
    this.scene.tweens.add({ targets: this.currentBGM, volume: 0, duration: fade, onComplete: () => { this.currentBGM?.stop(); this.currentBGM = null; } });
  }

  playSFX(key, volume) {
    if (!this.sfxEnabled) return;
    try { this.scene.sound.play(key, { volume: volume ?? this.sfxVolume }); } catch { /* missing */ }
  }

  setMusicVolume(vol) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (this.currentBGM) this.currentBGM.setVolume(this.musicVolume);
  }

  setSfxVolume(vol) { this.sfxVolume = Math.max(0, Math.min(1, vol)); }

  toggleMusic(enabled) {
    this.isEnabled = enabled;
    if (!enabled) this.stopBGM(500);
  }

  toggleSFX(enabled) { this.sfxEnabled = enabled; }
}
