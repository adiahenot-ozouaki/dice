let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;

function context(): AudioContext {
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    const seconds = 0.25;
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

export function unlockAudio() {
  const audio = context();
  if (audio.state === "suspended") void audio.resume();
}

export function setMuted(next: boolean) {
  muted = next;
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(next ? 0 : 0.8, ctx.currentTime, 0.02);
}

export function isMuted() {
  return muted;
}

function burst(when: number, freq: number, peak: number, dur: number) {
  if (!ctx || !master || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.75 + Math.random() * 0.7;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq, when);
  filter.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), when + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(when);
  src.stop(when + dur + 0.03);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

export function playRattle() {
  const audio = context();
  const run = () => {
    if (!ctx) return;
    const now = audio.currentTime + 0.01;
    const hits = [0, 0.055, 0.12, 0.19, 0.27, 0.36, 0.47, 0.6, 0.74];
    hits.forEach((t, i) => {
      const falloff = 1 - i / hits.length;
      burst(now + t, 700 + Math.random() * 1600, 0.16 * falloff, 0.05 + Math.random() * 0.02);
    });
  };
  if (audio.state === "running") run();
  else void audio.resume().then(run);
}

export function playLand() {
  const audio = context();
  const run = () => {
    if (!ctx || !master) return;
    const now = audio.currentTime + 0.005;
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(168, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.2);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.42, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.28);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    burst(now, 1800 + Math.random() * 600, 0.2, 0.045);
  };
  if (audio.state === "running") run();
  else void audio.resume().then(run);
}
