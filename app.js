/* ============================================================================
 *  TELEPROMPTER PWA — app.js
 *  HTML + CSS + JavaScript vanilla. Sin frameworks, sin build, sin npm.
 *
 *  ---------------------------------------------------------------------------
 *  ¿POR QUÉ EL TEXTO NO SE GRABA EN EL VÍDEO?  (requisito crítico)
 *  ---------------------------------------------------------------------------
 *  La grabación NO usa la pantalla, ni un <canvas>, ni getDisplayMedia().
 *  Usa exactamente el mismo MediaStream que devuelve getUserMedia():
 *
 *      stream = await navigator.mediaDevices.getUserMedia({ video, audio })
 *      video.srcObject = stream            // solo lo pinta en el <video>
 *      recorder = new MediaRecorder(stream) // graba el stream original
 *
 *  Un MediaStream es una colección de pistas (tracks) producidas por la
 *  cámara y el micrófono. MediaRecorder consume esas pistas: los fotogramas
 *  y el audio llegan directamente del hardware a la grabación. El texto del
 *  teleprompter es un <div> del DOM que el navegador compone ENCIMA del
 *  <video> al pintar la pantalla; ese pintado (compositor) jamás forma parte
 *  del stream, así que es imposible que el guion acabe en el archivo.
 *  Lo único que podría grabarlo sería capturar la pantalla (getDisplayMedia)
 *  o dibujar el vídeo en un canvas y añadir el texto ahí. Aquí no se hace
 *  ninguna de las dos cosas: no hay ni un solo <canvas> en este archivo.
 * ========================================================================== */

(() => {
  'use strict';

  /* ==========================================================================
   *  1. Utilidades
   * ========================================================================== */

  const $ = (selector, root = document) => root.querySelector(selector);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

  const pad2 = (n) => String(n).padStart(2, '0');

  function formatClock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    if (minutes >= 60) return `${Math.floor(minutes / 60)}:${pad2(minutes % 60)}:${pad2(seconds)}`;
    return `${pad2(minutes)}:${pad2(seconds)}`;
  }

  function formatDuration(totalSeconds) {
    const s = Math.round(totalSeconds);
    if (s < 60) return `${s} s`;
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 0.1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  }

  /** Marca de tiempo local para el nombre del archivo: 2025-06-14-1832 */
  function fileStamp(date = new Date()) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}`;
  }

  /* ==========================================================================
   *  2. Almacenamiento local (con protección para navegación privada)
   * ========================================================================== */

  const STORE = {
    script: 'tp.script.v1',
    settings: 'tp.settings.v1',
    hint: 'tp.hint.v1'
  };

  const storage = {
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        return false; // cuota llena o almacenamiento bloqueado
      }
    }
  };

  /* ==========================================================================
   *  3. Estado y constantes
   * ========================================================================== */

  /*
   * Línea de lectura: por defecto muy alta (16 % de la pantalla), casi pegada a
   * la cámara frontal. Así, mientras se lee, la mirada queda junto al objetivo
   * y en cámara no se nota el barrido vertical. El usuario puede bajarla con el
   * control «Lectura» si prefiere más texto a la vista.
   * MIN_TEXT_TOP: la línea nunca sube tanto como para meterse debajo del chip
   * de grabación (que está a 62 px + 34 px de alto).
   */
  const MIN_TEXT_TOP = 104;          // px
  const WORDS_PER_MINUTE = 140;      // estimación de tiempo de lectura
  const COUNTDOWN_SECONDS = 3;

  const LIMITS = {
    speed: { min: 5, max: 300 },
    size: { min: 18, max: 96 },
    opacity: { min: 0, max: 0.9 },
    guide: { min: 12, max: 50 }
  };

  const DEFAULTS = {
    speed: 32,        // px por segundo
    size: 34,         // px de tamaño de letra
    opacity: 0.45,    // opacidad del fondo del texto
    guide: 16,        // altura de la línea de lectura (% desde arriba)
    advance: 'smooth', // 'smooth' desliza · 'step' salta de línea en línea
    mirror: false,    // texto en espejo
    facing: 'user'    // 'user' frontal · 'environment' trasera
  };

  /*
   * Guion de bienvenida: se carga SOLO la primera vez que se abre la app en
   * este dispositivo (cuando todavía no hay nada guardado en localStorage).
   * Sirve de demo y de mini-tutorial. Si lo borras con «Borrar guion», se
   * guarda un guion vacío y ya no vuelve a aparecer al recargar.
   * Cámbialo libremente: es el texto de la demo inicial.
   */
  const WELCOME_SCRIPT = [
    'Hola, este es tu teleprompter.',
    'Este texto es un guion de bienvenida: bórralo cuando quieras y pega el tuyo en su lugar.',
    'Toca la pantalla mientras lees para ocultar o mostrar los controles. Desliza el texto con el dedo si quieres colocarlo tú mismo.',
    'Ajusta la velocidad, el tamaño y el fondo con los controles de abajo: se aplican al instante, incluso mientras grabas.',
    'Pulsa Grabar y verás una cuenta atrás de tres segundos. Después empiezan a la vez la grabación y el desplazamiento. La línea de arriba marca por dónde vas leyendo.',
    'Cuando termines, pulsa Detener, revisa la vista previa y descarga el vídeo: se guarda como teleprompter-fecha-hora.mp4 (o .webm).',
    'Y lo más importante: este texto nunca aparece en el vídeo, porque solo se graba la cámara y el micrófono.'
  ].join('\n\n');

  /*
   * Orden de preferencia de formatos de grabación.
   * MP4/H.264 primero: es el formato que iOS Safari graba y el que mejor
   * comparte/guarda (Fotos, WhatsApp, editores). Después WebM/VP9 → VP8,
   * que es lo que soportan Chrome/Android/Firefox. Se comprueba de verdad
   * con MediaRecorder.isTypeSupported: nunca se usa un tipo "a ciegas".
   */
  const MIME_CANDIDATES = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.4D401F,mp4a.40.2',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/x-matroska;codecs=avc1',
    'video/x-matroska'
  ];

  const state = {
    screen: 'editor',
    settings: { ...DEFAULTS },
    script: '',

    // Motor de desplazamiento
    pos: 0,          // píxeles desplazados desde el inicio
    maxPos: 0,       // desplazamiento máximo (fin del guion)
    lineHeight: 46,  // alto de línea medido (para el avance «por líneas»)
    stepAcc: 0,      // tiempo acumulado en el modo «por líneas»
    stepTarget: 0,   // posición a la que debe llegar el salto
    startY: 0,       // posición Y donde arranca la primera línea
    playing: false,
    dragging: false,
    playedToEnd: false,

    // Bucle
    rafId: 0,
    lastTs: 0,

    // Cuenta atrás
    countdown: null,

    // Cámara
    stream: null,
    camGen: 0,

    // Grabación
    recording: false,
    recorder: null,
    chunks: [],
    mimeType: '',
    recStart: 0,
    recSeconds: 0,
    shownSeconds: -1,

    // Resultado
    blob: null,
    blobUrl: '',
    fileName: '',

    discard: false,
    wakeLock: null
  };

  /* ==========================================================================
   *  4. Referencias del DOM
   * ========================================================================== */

  const el = {
    screens: {
      editor: $('#screen-editor'),
      cam: $('#screen-cam'),
      preview: $('#screen-preview')
    },

    // Editor
    script: $('#script'),
    saveState: $('#save-state'),
    saveStateText: $('#save-state-text'),
    wordCount: $('#word-count'),
    readTime: $('#read-time'),
    btnStart: $('#btn-start'),
    btnInstall: $('#btn-install'),
    btnClear: $('#btn-clear'),
    btnClearText: $('#btn-clear-text'),

    // Cámara
    video: $('#camera'),
    camStatus: $('#cam-status'),
    camSpinner: $('#cam-spinner'),
    camStatusTitle: $('#cam-status-title'),
    camStatusText: $('#cam-status-text'),
    camStatusActions: $('#cam-status-actions'),
    btnRetryCam: $('#btn-retry-cam'),
    btnCamBack: $('#btn-cam-back'),

    // Texto
    scrim: $('#scrim'),
    guide: $('#guide'),
    promptLayer: $('#prompt-layer'),
    promptText: $('#prompt-text'),
    chromeTop: $('#screen-cam .chrome-top'),
    chromeBottom: $('#screen-cam .chrome-bottom'),

    // Controles
    btnExit: $('#btn-exit'),
    btnMirror: $('#btn-mirror'),
    btnFlip: $('#btn-flip'),
    btnFullscreen: $('#btn-fullscreen'),
    btnRestart: $('#btn-restart'),
    btnPlay: $('#btn-play'),
    playLabel: $('#play-label'),
    btnRecord: $('#btn-record'),
    btnHide: $('#btn-hide'),
    speed: $('#speed'),
    size: $('#size'),
    bg: $('#bg'),
    readline: $('#readline'),
    btnAdvanceSmooth: $('#btn-advance-smooth'),
    btnAdvanceStep: $('#btn-advance-step'),
    speedOut: $('#speed-out'),
    sizeOut: $('#size-out'),
    bgOut: $('#bg-out'),
    readlineOut: $('#readline-out'),
    recChip: $('#rec-chip'),
    recTime: $('#rec-time'),
    countdown: $('#countdown'),
    countdownNum: $('#countdown-num'),
    btnCancelCountdown: $('#btn-cancel-countdown'),

    // Vista previa
    previewVideo: $('#preview-video'),
    previewMeta: $('#preview-meta'),
    downloadLink: $('#btn-download'),
    btnShare: $('#btn-share'),
    btnAgain: $('#btn-again'),
    btnToEditor: $('#btn-to-editor'),
    previewHint: $('#preview-hint'),

    toast: $('#toast')
  };

  /* ==========================================================================
   *  5. Avisos (toast)
   * ========================================================================== */

  let toastTimer = 0;

  function toast(message, ms = 2800) {
    if (!message) return;
    el.toast.textContent = message;
    el.toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.toast.classList.remove('is-visible'), ms);
  }

  /* ==========================================================================
   *  6. Navegación entre pantallas
   * ========================================================================== */

  function showScreen(name) {
    const valid = Object.prototype.hasOwnProperty.call(el.screens, name);
    if (!valid) return;
    if (name === 'cam') resetChrome();
    state.screen = name;
    Object.keys(el.screens).forEach((key) => {
      el.screens[key].classList.toggle('is-active', key === name);
    });
    document.body.classList.toggle('is-cam', name === 'cam');
    document.body.classList.toggle('no-scroll', name === 'cam');
  }

  /** Al entrar en la cámara siempre mostramos los controles. */
  function resetChrome() {
    el.screens.cam.classList.remove('chrome-hidden');
    document.body.classList.remove('chrome-hidden');
    el.toast.classList.remove('is-visible');
  }

  /* ==========================================================================
   *  7. Editor: guion, autoguardado y contadores
   * ========================================================================== */

  let saveTimer = 0;

  function setSaveState(kind) {
    const saved = kind === 'saved';
    el.saveState.classList.toggle('is-saving', !saved);
    el.saveStateText.textContent = saved ? 'Guardado' : 'Guardando…';
  }

  function saveScript(immediate = false) {
    window.clearTimeout(saveTimer);
    const value = el.script.value;
    const write = () => {
      const ok = storage.set(STORE.script, value);
      state.script = value;
      setSaveState('saved');
      if (!ok) toast('No se pudo guardar el guion en este dispositivo (almacenamiento bloqueado).', 4000);
    };
    if (immediate) {
      write();
      return;
    }
    setSaveState('saving');
    saveTimer = window.setTimeout(write, 350);
  }

  function updateCounts() {
    const text = el.script.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    el.wordCount.textContent = `${words} ${words === 1 ? 'palabra' : 'palabras'}`;
    const seconds = (words / WORDS_PER_MINUTE) * 60;
    el.readTime.textContent = words ? `≈ ${formatDuration(seconds)}` : '≈ 0 s';
  }

  /* ==========================================================================
   *  8. Ajustes (velocidad, tamaño, fondo, espejo) y persistencia
   * ========================================================================== */

  let settingsTimer = 0;

  function saveSettings() {
    window.clearTimeout(settingsTimer);
    settingsTimer = window.setTimeout(() => storage.set(STORE.settings, state.settings), 300);
  }

  function sanitizeSettings(raw) {
    const s = { ...DEFAULTS };
    if (raw && typeof raw === 'object') {
      s.speed = clamp(Math.round(num(raw.speed, DEFAULTS.speed)), LIMITS.speed.min, LIMITS.speed.max);
      s.size = clamp(Math.round(num(raw.size, DEFAULTS.size)), LIMITS.size.min, LIMITS.size.max);
      s.opacity = clamp(num(raw.opacity, DEFAULTS.opacity), LIMITS.opacity.min, LIMITS.opacity.max);
      s.guide = clamp(Math.round(num(raw.guide, DEFAULTS.guide)), LIMITS.guide.min, LIMITS.guide.max);
      s.advance = raw.advance === 'step' ? 'step' : 'smooth';
      s.mirror = Boolean(raw.mirror);
      s.facing = raw.facing === 'environment' ? 'environment' : 'user';
    }
    return s;
  }

  function applyMirror() {
    const mirror = Boolean(state.settings.mirror);
    el.screens.cam.classList.toggle('is-mirror', mirror);
    el.btnMirror.setAttribute('aria-pressed', String(mirror));
    el.btnMirror.setAttribute('aria-label', mirror ? 'Texto en espejo: activado' : 'Texto en espejo: desactivado');
  }

  function applyOpacity() {
    const opacity = state.settings.opacity;
    el.scrim.style.setProperty('--panel-op', String(opacity));
    el.bg.value = String(Math.round(opacity * 100));
    el.bgOut.textContent = `${Math.round(opacity * 100)} %`;
  }

  function applySpeed() {
    const speed = state.settings.speed;
    el.speed.value = String(speed);
    el.speedOut.textContent = `${speed} px/s`;
  }

  function applyGuideValue() {
    const guide = state.settings.guide;
    el.readline.value = String(guide);
    el.readlineOut.textContent = `${guide} %`;
  }

  function applyAdvance() {
    const step = state.settings.advance === 'step';
    el.btnAdvanceSmooth.classList.toggle('is-active', !step);
    el.btnAdvanceStep.classList.toggle('is-active', step);
    el.btnAdvanceSmooth.setAttribute('aria-pressed', String(!step));
    el.btnAdvanceStep.setAttribute('aria-pressed', String(step));
  }

  function applySettingsToUI() {
    applySpeed();
    applyOpacity();
    applyGuideValue();
    applyAdvance();
    applyMirror();
    el.size.value = String(state.settings.size);
    el.sizeOut.textContent = `${state.settings.size} px`;
    el.promptText.style.fontSize = `${state.settings.size}px`;
  }

  function setSpeed(value, persist) {
    state.settings.speed = clamp(Math.round(value), LIMITS.speed.min, LIMITS.speed.max);
    applySpeed();
    if (persist) saveSettings();
  }

  /**
   * Cambia entre deslizamiento continuo y salto de línea en línea.
   * En modo «por líneas» el texto queda inmóvil mientras lees: en cámara el ojo
   * no recorre la pantalla y no se nota el barrido.
   */
  function setAdvance(mode, persist) {
    state.settings.advance = mode === 'step' ? 'step' : 'smooth';
    state.stepAcc = 0;
    state.stepTarget = state.pos;
    applyAdvance();
    if (persist) saveSettings();
    if (state.settings.advance === 'step') {
      toast('Avance por líneas: el texto se queda quieto y salta una línea', 3000);
    }
  }

  function setOpacity(value, persist) {
    state.settings.opacity = clamp(value, LIMITS.opacity.min, LIMITS.opacity.max);
    applyOpacity();
    if (persist) saveSettings();
  }

  /**
   * Sube o baja la línea de lectura. El texto y la guía se mueven juntos, así
   * que la posición de lectura (la frase que estás leyendo) no cambia.
   */
  function setGuide(value, persist) {
    state.settings.guide = clamp(Math.round(value), LIMITS.guide.min, LIMITS.guide.max);
    applyGuideValue();
    if (state.screen === 'cam') measure();
    if (persist) saveSettings();
  }

  /**
   * Cambiar el tamaño de letra cambia la altura del guion, así que hay que
   * volver a medir y conservar la posición relativa de lectura.
   */
  function setSize(value, persist) {
    const previousMax = state.maxPos;
    const ratio = previousMax > 0 ? clamp(state.pos / previousMax, 0, 1) : 0;
    state.settings.size = clamp(Math.round(value), LIMITS.size.min, LIMITS.size.max);
    el.promptText.style.fontSize = `${state.settings.size}px`;
    el.size.value = String(state.settings.size);
    el.sizeOut.textContent = `${state.settings.size} px`;
    if (state.screen === 'cam') {
      measure();
      state.pos = ratio * state.maxPos;
      applyOffset();
    }
    if (persist) saveSettings();
  }

  function toggleMirror() {
    state.settings.mirror = !state.settings.mirror;
    applyMirror();
    saveSettings();
    toast(state.settings.mirror ? 'Texto en espejo activado' : 'Texto en espejo desactivado', 1600);
  }

  /* ==========================================================================
   *  9. Motor de desplazamiento (requestAnimationFrame, sin setInterval)
   * ========================================================================== */

  function renderPrompt(text) {
    const normalized = String(text || '').replace(/\r\n?/g, '\n').trim();
    el.promptText.replaceChildren();

    if (!normalized) {
      const p = document.createElement('p');
      p.className = 'prompt-placeholder';
      p.textContent = 'Tu guion está vacío. Vuelve al editor y escribe algo.';
      el.promptText.append(p);
      return;
    }

    // Cada bloque separado por una línea en blanco es un párrafo.
    normalized.split(/\n{2,}/).forEach((block) => {
      const p = document.createElement('p');
      p.textContent = block;
      el.promptText.append(p);
    });
  }

  function measure() {
    const viewport = el.scrim.clientHeight || window.innerHeight;
    const pct = clamp(state.settings.guide, LIMITS.guide.min, LIMITS.guide.max);
    const desired = Math.round((viewport * pct) / 100);
    // La guía nunca sube por debajo del chip de grabación (ni se pega al borde
    // en pantallas muy bajas, como el móvil en horizontal).
    const topLimit = Math.min(MIN_TEXT_TOP, Math.round(viewport * 0.34));
    state.startY = Math.max(desired, topLimit);
    el.guide.style.top = `${state.startY}px`;

    // El degradado superior termina 5 puntos por encima de la línea de lectura,
    // para que el texto se vea nítido aunque la línea esté muy arriba.
    const fadeTop = Math.max(4, (state.startY / viewport) * 100 - 5);
    el.scrim.style.setProperty('--fade-top', `${fadeTop.toFixed(1)}%`);

    state.maxPos = Math.max(el.promptText.offsetHeight, 1);
    state.pos = clamp(state.pos, 0, state.maxPos);

    // Alto de línea real (para el avance «por líneas»).
    let lineHeight = 0;
    try {
      lineHeight = parseFloat(window.getComputedStyle(el.promptText).lineHeight);
    } catch (error) {
      lineHeight = 0;
    }
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) lineHeight = state.settings.size * 1.34;
    else if (lineHeight < 4) lineHeight *= state.settings.size; // valor multiplicador (1.34)
    state.lineHeight = lineHeight;

    applyOffset();
  }

  function applyOffset() {
    const y = state.startY - state.pos;
    el.promptText.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
  }

  function resetPos() {
    state.pos = 0;
    state.stepTarget = 0;
    state.stepAcc = 0;
    state.playedToEnd = false;
    applyOffset();
  }

  function setPlaying(on) {
    const next = Boolean(on) && state.maxPos > 0;
    state.playing = next;
    el.btnPlay.classList.toggle('is-playing', next);
    el.btnPlay.setAttribute('aria-label', next ? 'Pausar el desplazamiento' : 'Reproducir el desplazamiento');
    el.playLabel.textContent = next ? 'Pausa' : 'Seguir';
    if (next) {
      state.playedToEnd = false;
      state.stepTarget = state.pos; // sin saltos pendientes al reanudar
      state.stepAcc = 0;
    }
  }

  function togglePlay() {
    if (state.countdown) return;
    if (!state.playing && state.pos >= state.maxPos - 0.5) resetPos();
    setPlaying(!state.playing);
  }

  function startLoop() {
    if (state.rafId) return;
    state.lastTs = 0;
    state.rafId = window.requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (state.rafId) window.cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    state.lastTs = 0;
  }

  function loop(ts) {
    if (!state.lastTs) state.lastTs = ts;
    let dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;
    if (dt < 0) dt = 0;
    if (dt > 0.1) dt = 0.1; // si la pestaña se durmió, no damos un salto enorme

    if (state.countdown) {
      tickCountdown(ts);
    } else if (state.playing && !state.dragging && state.maxPos > 0) {
      if (state.settings.advance === 'step') {
        advanceByLine(dt);
      } else {
        state.pos += state.settings.speed * dt;
      }
      if (state.pos >= state.maxPos) {
        state.pos = state.maxPos;
        applyOffset();
        setPlaying(false);
        if (!state.playedToEnd) {
          state.playedToEnd = true;
          toast('Fin del guion', 1800);
        }
      } else {
        applyOffset();
      }
    }

    if (state.recording) tickRecordingClock(ts);

    state.rafId = window.requestAnimationFrame(loop);
  }

  /**
   * Avance «por líneas»: no hay deslizamiento continuo. El texto se queda
   * quieto mientras lees y, cada cierto intervalo, salta una línea (con un
   * desplazamiento muy rápido de ~80 ms). En cámara el ojo no recorre la
   * pantalla, así que se nota mucho menos que estás leyendo.
   */
  function advanceByLine(dt) {
    const lineHeight = state.lineHeight || state.settings.size * 1.34;
    // Misma «velocidad de lectura» que el modo continuo: una línea cada
    // (alto de línea / velocidad) segundos, con un mínimo para que no sea
    // un temblor.
    const interval = Math.max(0.45, lineHeight / Math.max(1, state.settings.speed));

    state.stepAcc += dt;
    if (state.stepAcc >= interval) {
      state.stepAcc = 0;
      state.stepTarget = Math.min(state.maxPos, state.stepTarget + lineHeight);
    }

    if (state.pos < state.stepTarget) {
      state.pos = Math.min(state.stepTarget, state.pos + 620 * dt);
    }
  }

  /* ------------------------------------------------------------------ cuenta atrás */

  function setCountdownNumber(n) {
    el.countdownNum.textContent = String(n);
    // Reinicia la animación CSS para que "pop" se vea en cada número.
    el.countdownNum.style.animation = 'none';
    void el.countdownNum.offsetWidth;
    el.countdownNum.style.animation = '';
  }

  function beginCountdown(seconds, onDone) {
    if (state.countdown) return;
    el.countdown.hidden = false;
    setCountdownNumber(seconds);
    el.btnRecord.setAttribute('aria-label', 'Cancelar la cuenta atrás');
    el.btnFlip.disabled = true;
    state.countdown = { endAt: performance.now() + seconds * 1000, shown: seconds, onDone };
  }

  function hideCountdown() {
    el.countdown.hidden = true;
    el.countdownNum.style.animation = '';
    updateRecordUI();
  }

  function cancelCountdown() {
    if (!state.countdown) return;
    state.countdown = null;
    hideCountdown();
    toast('Cuenta atrás cancelada', 1800);
  }

  function tickCountdown(now) {
    const current = state.countdown;
    if (!current) return;
    const remaining = current.endAt - now;
    if (remaining <= 0) {
      state.countdown = null;
      hideCountdown();
      if (typeof current.onDone === 'function') current.onDone();
      return;
    }
    const n = Math.ceil(remaining / 1000);
    if (n !== current.shown) {
      current.shown = n;
      setCountdownNumber(n);
    }
  }

  /* ==========================================================================
   *  10. Gestos: deslizar el texto con el dedo y toque para ocultar controles
   * ========================================================================== */

  let pointer = null;

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (state.countdown) return;
    pointer = {
      id: event.pointerId,
      startY: event.clientY,
      startPos: state.pos,
      moved: false,
      at: performance.now(),
      wasPlaying: state.playing
    };
    try {
      el.scrim.setPointerCapture(event.pointerId);
    } catch (error) {
      /* algunos navegadores antiguos no lo permiten */
    }
  }

  function onPointerMove(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dy = event.clientY - pointer.startY;

    if (!pointer.moved && Math.abs(dy) > 6) {
      pointer.moved = true;
      state.dragging = true;
      setPlaying(false);
      el.screens.cam.classList.add('is-dragging');
    }

    if (pointer.moved) {
      event.preventDefault();
      state.pos = clamp(pointer.startPos - dy, 0, state.maxPos);
      applyOffset();
    }
  }

  function onPointerUp(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const { moved, at, wasPlaying } = pointer;
    const quick = performance.now() - at < 380;
    pointer = null;

    state.dragging = false;
    el.screens.cam.classList.remove('is-dragging');

    if (moved) {
      // Tras arrastrar, el «salto pendiente» del modo por líneas parte de aquí.
      state.stepTarget = state.pos;
      state.stepAcc = 0;
    }

    if (!moved && quick) {
      toggleChrome();
    } else if (moved && wasPlaying && state.pos < state.maxPos) {
      setPlaying(true);
    }
  }

  function onPointerCancel() {
    if (!pointer) return;
    pointer = null;
    state.dragging = false;
    el.screens.cam.classList.remove('is-dragging');
  }

  /* ------------------------------------------------------------------ chrome */

  function toggleChrome(force) {
    const hidden = typeof force === 'boolean'
      ? force
      : !el.screens.cam.classList.contains('chrome-hidden');
    el.screens.cam.classList.toggle('chrome-hidden', hidden);
    document.body.classList.toggle('chrome-hidden', hidden);
    // Los controles ocultos no deben poder enfocarse con teclado/lector.
    [el.chromeTop, el.chromeBottom].forEach((node) => {
      if (node && 'inert' in node) node.inert = hidden;
    });
  }

  /* ==========================================================================
   *  11. Cámara (getUserMedia)
   * ========================================================================== */

  const AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

  function buildConstraintSets(facing) {
    const quality = (width, height) => ({
      facingMode: { ideal: facing },
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: 30, max: 60 }
    });
    // De la más exigente a la más permisiva: si algo no se soporta, se baja.
    return [
      { audio: AUDIO_CONSTRAINTS, video: quality(1920, 1080) },
      { audio: AUDIO_CONSTRAINTS, video: quality(1280, 720) },
      { audio: AUDIO_CONSTRAINTS, video: { facingMode: { ideal: facing } } },
      { audio: AUDIO_CONSTRAINTS, video: true },
      { audio: false, video: quality(1280, 720) },           // por si no hay micrófono
      { audio: false, video: { facingMode: { ideal: facing } } },
      { audio: false, video: true }
    ];
  }

  function describeCameraError(error) {
    const name = (error && error.name) || '';
    switch (name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
      case 'SecurityError':
        return 'Permiso denegado. Toca el icono del candado (o de la cámara) en la barra del navegador, permite Cámara y Micrófono y pulsa Reintentar.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No se encontró ninguna cámara en este dispositivo.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'La cámara está siendo usada por otra aplicación. Ciérrala y pulsa Reintentar.';
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        return 'Este dispositivo no admite la resolución solicitada. Pulsa Reintentar: se usará una resolución menor.';
      case 'AbortError':
        return 'La cámara se cerró de forma inesperada. Pulsa Reintentar.';
      default:
        return `No se pudo abrir la cámara${name ? ` (${name})` : ''}. Revisa los permisos y pulsa Reintentar.`;
    }
  }

  function setCamLoading() {
    el.camStatus.hidden = false;
    el.camSpinner.hidden = false;
    el.camStatusTitle.textContent = 'Activando cámara…';
    el.camStatusText.textContent = 'Acepta el permiso de cámara y micrófono.';
    el.camStatusActions.hidden = true;
    el.btnRetryCam.hidden = true;
  }

  function setCamError(message, canRetry) {
    el.camStatus.hidden = false;
    el.camSpinner.hidden = true;
    el.camStatusTitle.textContent = 'No se pudo abrir la cámara';
    el.camStatusText.textContent = message;
    el.camStatusActions.hidden = false;
    el.btnRetryCam.hidden = !canRetry;
    updateRecordUI();
  }

  function hideCamStatus() {
    el.camStatus.hidden = true;
  }

  function releaseStream() {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => {
        try { track.stop(); } catch (error) { /* nada */ }
      });
      state.stream = null;
    }
    if (el.video.srcObject) {
      try { el.video.srcObject = null; } catch (error) { /* nada */ }
    }
  }

  /** Detiene la cámara e invalida cualquier getUserMedia en curso. */
  function stopCamera() {
    state.camGen += 1;
    releaseStream();
    updateRecordUI();
  }

  async function startCamera(facing) {
    const gen = ++state.camGen;
    releaseStream();

    if (!window.isSecureContext) {
      setCamError('La cámara solo funciona con HTTPS (o en localhost). Abre la app desde https://.', false);
      return false;
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setCamError('Este navegador no permite acceder a la cámara. Actualiza Chrome o Safari.', true);
      return false;
    }

    setCamLoading();

    let stream = null;
    let lastError = null;

    for (const constraints of buildConstraintSets(facing)) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (error) {
        lastError = error;
        if (gen !== state.camGen) return false;
        // Si el usuario deniega el permiso, no insistimos con más variantes.
        if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) break;
      }
    }

    if (gen !== state.camGen || state.screen !== 'cam') {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      return false;
    }

    if (!stream) {
      setCamError(describeCameraError(lastError), true);
      return false;
    }

    state.stream = stream;
    el.video.muted = true;
    el.video.srcObject = stream;
    try {
      await el.video.play();
    } catch (error) {
      // iOS a veces necesita un gesto extra: el usuario puede tocar el vídeo.
    }

    hideCamStatus();
    updateRecordUI();

    if (!stream.getAudioTracks().length) {
      toast('No se detectó micrófono: el vídeo se grabará sin audio.', 4200);
    }

    return true;
  }

  async function flipCamera() {
    if (state.recording || state.countdown) return;
    state.settings.facing = state.settings.facing === 'user' ? 'environment' : 'user';
    saveSettings();
    await startCamera(state.settings.facing);
    if (!state.stream) return;
    toast(state.settings.facing === 'user' ? 'Cámara frontal' : 'Cámara trasera', 1400);
  }

  /* ==========================================================================
   *  12. Grabación (MediaRecorder sobre el stream original)
   * ========================================================================== */

  function pickMimeType() {
    if (typeof window.MediaRecorder === 'undefined') return '';
    if (typeof window.MediaRecorder.isTypeSupported !== 'function') return '';
    for (const type of MIME_CANDIDATES) {
      try {
        if (window.MediaRecorder.isTypeSupported(type)) return type;
      } catch (error) {
        /* tipo inválido en este navegador: seguimos probando */
      }
    }
    return ''; // sin tipo: el navegador elige su formato por defecto
  }

  function extensionFor(mimeType) {
    const type = String(mimeType || '').toLowerCase();
    if (type.includes('mp4')) return 'mp4';
    if (type.includes('matroska')) return 'mkv';
    if (type.includes('webm')) return 'webm';
    if (type.includes('ogg')) return 'ogv';
    return 'mp4';
  }

  function bitrateForStream() {
    const track = state.stream && state.stream.getVideoTracks()[0];
    const settings = track ? track.getSettings() : {};
    const pixels = (settings.width || 1280) * (settings.height || 720);
    if (pixels >= 1920 * 1080) return 9_000_000;
    if (pixels >= 1280 * 720) return 5_000_000;
    return 2_500_000;
  }

  function updateRecordUI() {
    const recording = state.recording;
    el.btnRecord.classList.toggle('is-on', recording);
    el.btnRecord.disabled = !recording && !state.stream;
    el.btnRecord.setAttribute('aria-label', recording ? 'Detener la grabación' : 'Grabar');
    el.btnRecord.title = recording ? 'Detener' : 'Grabar';
    el.screens.cam.classList.toggle('is-recording', recording);
    el.recChip.hidden = !recording;
    el.btnFlip.disabled = recording || Boolean(state.countdown);
  }

  function tickRecordingClock(now) {
    if (!state.recStart) return;
    const seconds = Math.floor((now - state.recStart) / 1000);
    if (seconds === state.shownSeconds) return;
    state.shownSeconds = seconds;
    state.recSeconds = seconds;
    el.recTime.textContent = formatClock(seconds);
  }

  function startRecording() {
    if (state.recording || state.countdown) return;

    if (!state.stream) {
      toast('La cámara todavía no está lista.');
      return;
    }
    if (typeof window.MediaRecorder === 'undefined') {
      toast('Este navegador no puede grabar vídeo. Puedes usar el teleprompter en modo ensayo.', 4200);
      return;
    }

    // La toma empieza siempre desde el principio del guion.
    resetPos();
    setPlaying(false);

    beginCountdown(COUNTDOWN_SECONDS, () => {
      beginTake();
    });
  }

  /**
   * Aquí empieza la grabación de verdad. Ojo al detalle importante:
   * `new MediaRecorder(state.stream)` graba EL STREAM ORIGINAL de cámara +
   * micrófono. El <div> del texto vive en el DOM y no aporta ni un píxel a
   * ese stream, por eso el guion no aparece en el vídeo.
   */
  function beginTake() {
    if (!state.stream) {
      toast('La cámara se cerró. Pulsa Reintentar.');
      return;
    }

    const mimeType = pickMimeType();
    const options = { videoBitsPerSecond: bitrateForStream(), audioBitsPerSecond: 128_000 };
    if (mimeType) options.mimeType = mimeType;

    let recorder;
    try {
      recorder = new window.MediaRecorder(state.stream, options);
    } catch (error) {
      try {
        recorder = new window.MediaRecorder(state.stream);
      } catch (error2) {
        toast('No se pudo iniciar la grabación en este navegador.', 4200);
        return;
      }
    }

    state.chunks = [];

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) state.chunks.push(event.data);
    });

    recorder.addEventListener('error', (event) => {
      const message = (event && event.error && event.error.name) || 'desconocido';
      toast(`Error al grabar (${message}).`, 4200);
      abortRecording();
    });

    recorder.addEventListener('stop', finalizeRecording);

    try {
      recorder.start(1000);
    } catch (error) {
      toast('No se pudo iniciar la grabación. Prueba a recargar la app.', 4200);
      return;
    }

    state.recorder = recorder;
    state.mimeType = recorder.mimeType || mimeType || 'video/webm';
    state.recording = true;
    state.recStart = performance.now();
    state.recSeconds = 0;
    state.shownSeconds = -1;
    el.recTime.textContent = '00:00';
    updateRecordUI();
    setPlaying(true);
  }

  function stopRecording() {
    const recorder = state.recorder;
    if (!recorder) return;
    if (recorder.state === 'inactive') return;
    try {
      recorder.stop(); // dispara 'stop' → finalizeRecording()
    } catch (error) {
      abortRecording();
    }
  }

  function abortRecording() {
    const recorder = state.recorder;
    state.discard = true; // el 'stop' que viene no debe abrir la vista previa
    state.recorder = null;
    state.recording = false;
    state.chunks = [];
    state.recStart = 0;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (error) { /* nada */ }
    }
    el.recChip.hidden = true;
    el.recTime.textContent = '00:00';
    updateRecordUI();
  }

  function finalizeRecording() {
    const recorder = state.recorder;
    const type = (recorder && recorder.mimeType) || state.mimeType || 'video/webm';
    const seconds = Math.max(state.recSeconds, 0);
    const blob = new Blob(state.chunks, { type });
    const discarded = state.discard;

    state.discard = false;
    state.recorder = null;
    state.recording = false;
    state.chunks = [];
    state.recStart = 0;
    state.shownSeconds = -1;
    el.recChip.hidden = true;
    el.recTime.textContent = '00:00';
    updateRecordUI();
    setPlaying(false);

    if (discarded) return;

    if (!blob.size) {
      toast('La grabación quedó vacía. Vuelve a intentarlo.', 3600);
      return;
    }
    openPreview(blob, type, seconds);
  }

  /* ==========================================================================
   *  13. Vista previa, descarga y compartir
   * ========================================================================== */

  function openPreview(blob, mimeType, seconds) {
    closeCam();

    // Libera el objeto anterior antes de crear el nuevo.
    if (state.blobUrl) {
      URL.revokeObjectURL(state.blobUrl);
      state.blobUrl = '';
    }

    const url = URL.createObjectURL(blob);
    state.blob = blob;
    state.blobUrl = url;
    state.fileName = `teleprompter-${fileStamp()}.${extensionFor(mimeType)}`;

    el.previewVideo.src = url;
    el.previewVideo.load();
    el.downloadLink.href = url;
    el.downloadLink.download = state.fileName;
    el.previewMeta.textContent = `${formatClock(seconds)} · ${formatBytes(blob.size)} · ${extensionFor(mimeType).toUpperCase()}`;

    updateShareUI();
    showScreen('preview');
    window.scrollTo(0, 0);
  }

  function updateShareUI() {
    let supported = false;
    try {
      if (navigator.canShare && state.blob) {
        const file = new File([state.blob], state.fileName, { type: state.blob.type });
        supported = navigator.canShare({ files: [file] });
      }
    } catch (error) {
      supported = false;
    }
    el.btnShare.hidden = !supported;
  }

  async function shareVideo() {
    if (!state.blob || !navigator.share) return;
    try {
      const file = new File([state.blob], state.fileName, { type: state.blob.type });
      await navigator.share({ files: [file], title: 'Teleprompter', text: 'Mi grabación' });
    } catch (error) {
      if (!error || error.name !== 'AbortError') toast('No se pudo compartir el vídeo.', 3200);
    }
  }

  /** Cierra la vista previa y libera recursos (la URL se revoca con margen). */
  function closePreview() {
    try { el.previewVideo.pause(); } catch (error) { /* nada */ }
    el.previewVideo.removeAttribute('src');
    try { el.previewVideo.load(); } catch (error) { /* nada */ }
    const url = state.blobUrl;
    state.blobUrl = '';
    state.blob = null;
    if (url) {
      // Damos margen por si la descarga aún está en curso.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  }

  /* ==========================================================================
   *  14. Wake Lock (la pantalla no se apaga)
   * ========================================================================== */

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (document.visibilityState !== 'visible') return;
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
    } catch (error) {
      state.wakeLock = null; // sin permiso, batería baja o pestaña oculta
    }
  }

  async function releaseWakeLock() {
    const lock = state.wakeLock;
    state.wakeLock = null;
    if (!lock) return;
    try { await lock.release(); } catch (error) { /* ya liberado */ }
  }

  /* ==========================================================================
   *  15. Pantalla completa
   * ========================================================================== */

  function supportsFullscreen() {
    const root = document.documentElement;
    return Boolean(root.requestFullscreen || root.webkitRequestFullscreen);
  }

  async function toggleFullscreen() {
    const doc = document;
    try {
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        if (doc.documentElement.requestFullscreen) {
          await doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
        } else if (doc.documentElement.webkitRequestFullscreen) {
          doc.documentElement.webkitRequestFullscreen();
        } else {
          toast('Pantalla completa no disponible en este navegador.');
          return;
        }
      } else if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      }
    } catch (error) {
      toast('No se pudo cambiar a pantalla completa.', 2600);
    }
  }

  /* ==========================================================================
   *  16. Entrar / salir de la pantalla de cámara
   * ========================================================================== */

  let hintShown = Boolean(storage.get(STORE.hint, false));

  function openCam() {
    showScreen('cam');
    setPlaying(false);

    renderPrompt(el.script.value);
    state.pos = 0;
    measure();
    applyOffset();
    updateRecordUI();

    startLoop();

    const camera = startCamera(state.settings.facing);
    requestWakeLock();

    if (!hintShown && !state.recording) {
      hintShown = true;
      storage.set(STORE.hint, true);
      window.setTimeout(() => {
        if (state.screen === 'cam') toast('Toca la pantalla para ocultar los controles · desliza el texto para ajustarlo', 4200);
      }, 900);
    }

    if (typeof window.MediaRecorder === 'undefined') {
      window.setTimeout(() => toast('Este navegador no puede grabar vídeo; el teleprompter funciona igual.', 4200), 2600);
    }

    return camera;
  }

  function closeCam() {
    setPlaying(false);
    if (state.countdown) {
      state.countdown = null;
      hideCountdown();
    }
    stopLoop();
    stopCamera();
    releaseWakeLock();
    pointer = null;
    state.dragging = false;
    el.screens.cam.classList.remove('is-dragging');
  }

  function exitCam() {
    if (state.recording) {
      stopRecording(); // al terminar se muestra la vista previa: no perdemos la toma
      return;
    }
    if (state.countdown) cancelCountdown();
    closeCam();
    showScreen('editor');
  }

  /* ==========================================================================
   *  17. Instalación PWA
   * ========================================================================== */

  let installPrompt = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    el.btnInstall.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    el.btnInstall.hidden = true;
    toast('App instalada. Búscala en tu pantalla de inicio.', 3400);
  });

  async function promptInstall() {
    if (!installPrompt) {
      toast('Para instalar: menú del navegador → «Instalar app» o «Añadir a pantalla de inicio».', 4200);
      return;
    }
    installPrompt.prompt();
    try {
      await installPrompt.userChoice;
    } catch (error) {
      /* nada */
    }
    installPrompt = null;
    el.btnInstall.hidden = true;
  }

  /* ==========================================================================
   *  18. Service worker (offline)
   * ========================================================================== */

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Ruta relativa: así funciona en /nombre-del-repo/ de GitHub Pages.
      navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.warn('[teleprompter] No se pudo registrar el service worker:', error);
      });
    });
  }

  /* ==========================================================================
   *  19. Eventos
   * ========================================================================== */

  function bindEvents() {
    /* ---- editor ---- */
    el.script.addEventListener('input', () => {
      updateCounts();
      saveScript(false);
    });

    el.btnStart.addEventListener('click', () => {
      const text = el.script.value.trim();
      if (!text) {
        toast('Escribe o pega tu guion para empezar.', 3000);
        el.script.focus();
        return;
      }
      saveScript(true);
      openCam();
    });

    el.btnClear.addEventListener('click', () => {
      if (!el.btnClear.classList.contains('is-confirming')) {
        el.btnClear.classList.add('is-confirming');
        el.btnClearText.textContent = '¿Seguro? Toca otra vez';
        window.setTimeout(() => {
          el.btnClear.classList.remove('is-confirming');
          el.btnClearText.textContent = 'Borrar guion';
        }, 3200);
        return;
      }
      el.btnClear.classList.remove('is-confirming');
      el.btnClearText.textContent = 'Borrar guion';
      el.script.value = '';
      updateCounts();
      saveScript(true);
      el.script.focus();
      toast('Guion borrado', 1600);
    });

    el.btnInstall.addEventListener('click', promptInstall);

    /* ---- cámara / controles ---- */
    el.btnExit.addEventListener('click', exitCam);
    el.btnCamBack.addEventListener('click', exitCam);
    el.btnRetryCam.addEventListener('click', () => startCamera(state.settings.facing));
    el.btnFlip.addEventListener('click', flipCamera);
    el.btnMirror.addEventListener('click', toggleMirror);
    el.btnFullscreen.addEventListener('click', toggleFullscreen);
    el.btnHide.addEventListener('click', () => toggleChrome(true));

    el.btnPlay.addEventListener('click', togglePlay);
    el.btnRestart.addEventListener('click', () => {
      resetPos();
      if (state.maxPos > 0) toast('Texto al inicio', 1400);
    });

    el.btnRecord.addEventListener('click', () => {
      if (state.countdown) {
        cancelCountdown();
        return;
      }
      if (state.recording) stopRecording();
      else startRecording();
    });

    el.btnCancelCountdown.addEventListener('click', cancelCountdown);

    /* ---- sliders ---- */
    el.speed.addEventListener('input', () => setSpeed(Number(el.speed.value), false));
    el.speed.addEventListener('change', () => setSpeed(Number(el.speed.value), true));

    el.size.addEventListener('input', () => setSize(Number(el.size.value), false));
    el.size.addEventListener('change', () => setSize(Number(el.size.value), true));

    el.bg.addEventListener('input', () => setOpacity(Number(el.bg.value) / 100, false));
    el.bg.addEventListener('change', () => setOpacity(Number(el.bg.value) / 100, true));

    el.readline.addEventListener('input', () => setGuide(Number(el.readline.value), false));
    el.readline.addEventListener('change', () => setGuide(Number(el.readline.value), true));

    el.btnAdvanceSmooth.addEventListener('click', () => setAdvance('smooth', true));
    el.btnAdvanceStep.addEventListener('click', () => setAdvance('step', true));

    /* ---- gestos sobre el texto ---- */
    el.scrim.addEventListener('pointerdown', onPointerDown);
    el.scrim.addEventListener('pointermove', onPointerMove, { passive: false });
    el.scrim.addEventListener('pointerup', onPointerUp);
    el.scrim.addEventListener('pointercancel', onPointerCancel);
    el.screens.cam.addEventListener('contextmenu', (event) => event.preventDefault());

    // Si iOS bloquea el autoplay del stream, un toque en el vídeo lo arranca.
    el.video.addEventListener('click', () => {
      const playing = el.video.play();
      if (playing && typeof playing.catch === 'function') playing.catch(() => {});
    });

    /* ---- vista previa ---- */
    el.btnAgain.addEventListener('click', () => {
      closePreview();
      openCam();
      toast('Listo. Pulsa Grabar cuando quieras.', 2600);
    });

    el.btnToEditor.addEventListener('click', () => {
      closePreview();
      showScreen('editor');
    });

    el.btnShare.addEventListener('click', shareVideo);

    el.downloadLink.addEventListener('click', (event) => {
      if (!state.blobUrl) {
        event.preventDefault();
        toast('El vídeo ya no está disponible. Graba de nuevo.', 3000);
        return;
      }
      // Navegadores sin soporte de <a download>: abrimos el blob en una pestaña.
      if (!('download' in document.createElement('a'))) {
        event.preventDefault();
        window.open(state.blobUrl, '_blank');
      }
    });

    el.previewVideo.addEventListener('error', () => {
      if (state.blobUrl) toast('Este navegador no puede previsualizar el formato grabado, pero puedes descargarlo.', 4200);
    });

    /* ---- teclado (escritorio) ---- */
    document.addEventListener('keydown', (event) => {
      if (state.screen !== 'cam') return;
      const tag = (event.target && event.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;

      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault();
          togglePlay();
          break;
        case 'r':
        case 'R':
          event.preventDefault();
          if (state.recording) stopRecording();
          else startRecording();
          break;
        case 'm':
        case 'M':
          toggleMirror();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'Escape':
          exitCam();
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSpeed(state.settings.speed + 5, true);
          break;
        case 'ArrowDown':
          event.preventDefault();
          setSpeed(state.settings.speed - 5, true);
          break;
        case 'h':
        case 'H':
          toggleChrome();
          break;
        default:
          break;
      }
    });

    /* ---- ciclo de vida ---- */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.screen === 'cam') requestWakeLock();
    });

    window.addEventListener('pageshow', () => {
      if (state.screen === 'cam' && !state.stream) startCamera(state.settings.facing);
    });

    window.addEventListener('pagehide', () => {
      storage.set(STORE.script, el.script.value);
      if (state.screen === 'cam') stopCamera();
      releaseWakeLock();
    });

    window.addEventListener('beforeunload', (event) => {
      if (state.recording) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    let resizeRaf = 0;
    const scheduleMeasure = () => {
      if (resizeRaf) return;
      resizeRaf = window.requestAnimationFrame(() => {
        resizeRaf = 0;
        if (state.screen !== 'cam') return;
        const previousStart = state.startY;
        measure();
        if (previousStart) {
          state.pos = clamp(state.pos + (state.startY - previousStart), 0, state.maxPos);
          applyOffset();
        }
      });
    };

    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('orientationchange', () => window.setTimeout(scheduleMeasure, 220));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleMeasure);
    }
  }

  /* ==========================================================================
   *  20. Arranque
   * ========================================================================== */

  function init() {
    // Guion guardado. Si en este dispositivo nunca se ha guardado nada
    // (la clave no existe), cargamos el guion de bienvenida.
    const savedScript = storage.get(STORE.script, null);
    const isFirstRun = savedScript === null;

    el.script.value = typeof savedScript === 'string' ? savedScript : '';

    if (isFirstRun) {
      el.script.value = WELCOME_SCRIPT;
      // Guardarlo ya marca la primera ejecución: si luego lo borras, no vuelve.
      storage.set(STORE.script, WELCOME_SCRIPT);
      window.setTimeout(() => {
        toast('Guion de bienvenida cargado. Edítalo o bórralo cuando quieras.', 4200);
      }, 900);
    }

    updateCounts();
    setSaveState('saved');

    // Ajustes guardados (o tamaño inicial proporcional a la pantalla)
    const savedSettings = storage.get(STORE.settings, null);
    state.settings = savedSettings
      ? sanitizeSettings(savedSettings)
      : { ...DEFAULTS, size: clamp(Math.round(window.innerWidth * 0.09), 20, 46) };
    applySettingsToUI();

    if (typeof window.MediaRecorder === 'undefined') {
      el.btnRecord.disabled = true;
    }
    if (!supportsFullscreen()) {
      el.btnFullscreen.hidden = true;
    }

    // La nota sobre «Archivos» solo tiene sentido en iPhone/iPad.
    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isApple) el.previewHint.hidden = true;

    el.btnFlip.disabled = true;

    bindEvents();
    showScreen('editor');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
