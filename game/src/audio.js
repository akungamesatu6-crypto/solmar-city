// Audio for Harbor Heat — pure WebAudio synthesis, no audio files.
// Everything is oscillators and filtered noise. unlock() must run from a user
// gesture (a key press, click or tap) before any sound can start, because
// browsers block audio before the first gesture.

function buildNoiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  // The engine hum: a sawtooth plus a low sine, pitched by speed.
  let engineOsc = null;
  let engineSub = null;
  let engineGain = null;
  let engineFilter = null;

  // The siren: a triangle wave wobbling between two notes on a square LFO.
  let sirenOsc = null;
  let sirenLfo = null;
  let sirenGain = null;
  let sirenOn = false;

  // The music loop: a slow bass-and-pluck groove, scheduled on an interval.
  let musicTimer = null;
  let musicOn = false;
  let musicStep = 0;

  function ensureContext() {
    if (ctx) return ctx;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    ctx = new AudioContextClass();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuffer = buildNoiseBuffer(ctx, 1);
    return ctx;
  }

  // Create / resume the AudioContext. Call from a keydown, click or tap.
  function unlock() {
    const audio = ensureContext();
    if (!audio) return;
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  }

  // The running context, or null when sound is not available yet.
  function ready() {
    return ctx && ctx.state === 'running' ? ctx : null;
  }

  // One short oscillator note, optionally sliding to another pitch.
  function tone(freq, duration, type, volume, slideTo) {
    const audio = ready();
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, audio.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(audio.currentTime + duration + 0.02);
  }

  // One short burst of filtered noise (impacts, gunfire, thuds).
  function noiseHit(duration, filterFreq, volume, type) {
    const audio = ready();
    if (!audio) return;
    const source = audio.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = audio.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    source.stop(audio.currentTime + duration + 0.02);
  }

  // Continuous engine note. speed01 is 0..1; call with 0 to idle, and on foot
  // the hum fades out.
  function engine(speed01) {
    const audio = ready();
    if (!audio) return;
    const speed = Math.max(0, Math.min(1, speed01 || 0));
    if (!engineOsc) {
      engineOsc = audio.createOscillator();
      engineOsc.type = 'sawtooth';
      engineSub = audio.createOscillator();
      engineSub.type = 'sine';
      engineFilter = audio.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = audio.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineSub.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineSub.start();
    }
    const now = audio.currentTime;
    engineOsc.frequency.setTargetAtTime(46 + speed * 130, now, 0.08);
    engineSub.frequency.setTargetAtTime(23 + speed * 65, now, 0.08);
    engineFilter.frequency.setTargetAtTime(320 + speed * 1400, now, 0.1);
    engineGain.gain.setTargetAtTime(speed > 0.01 ? 0.05 + speed * 0.06 : 0, now, 0.1);
  }

  // Two-tone police siren. Pass false to stop it.
  function siren(on) {
    if (on === sirenOn) return;
    sirenOn = on;
    const audio = ready();
    if (!on) {
      if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      return;
    }
    if (!audio) return;
    if (!sirenOsc) {
      sirenOsc = audio.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 780;
      sirenLfo = audio.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.55;
      const lfoGain = audio.createGain();
      lfoGain.gain.value = 190;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = audio.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
    }
    sirenGain.gain.setTargetAtTime(0.045, audio.currentTime, 0.2);
  }

  function pickup() {
    tone(660, 0.12, 'sine', 0.22, 990);
    setTimeout(() => tone(990, 0.14, 'sine', 0.2, 1320), 70);
  }

  function shot() {
    noiseHit(0.14, 2400, 0.5, 'highpass');
    tone(190, 0.1, 'square', 0.25, 60);
  }

  function punch() {
    noiseHit(0.09, 500, 0.45);
    tone(120, 0.09, 'sine', 0.3, 55);
  }

  function cash() {
    tone(880, 0.1, 'triangle', 0.22);
    setTimeout(() => tone(1174, 0.12, 'triangle', 0.22), 80);
    setTimeout(() => tone(1568, 0.18, 'triangle', 0.2), 160);
  }

  // A slow harbor groove in A minor: bass roots with a plucked fifth on top.
  const GROOVE_BASS = [55, 55, 65.41, 49];
  const GROOVE_PLUCK = [220, 261.63, 329.63, 261.63, 220, 196, 164.81, 196];

  function musicTick() {
    if (!musicOn) return;
    const bar = Math.floor(musicStep / 8) % GROOVE_BASS.length;
    const beat = musicStep % 8;
    if (beat === 0 || beat === 4) tone(GROOVE_BASS[bar], 0.5, 'triangle', 0.16);
    if (beat % 2 === 0) {
      const note = GROOVE_PLUCK[(bar * 2 + beat / 2) % GROOVE_PLUCK.length];
      tone(note, 0.22, 'sine', 0.07);
    }
    musicStep += 1;
  }

  // Start or stop the background groove.
  function music(on) {
    if (on === musicOn) return;
    musicOn = on;
    if (on) {
      unlock();
      musicStep = 0;
      musicTimer = setInterval(musicTick, 240);
    } else if (musicTimer !== null) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return { unlock, engine, siren, pickup, shot, punch, cash, music };
}
