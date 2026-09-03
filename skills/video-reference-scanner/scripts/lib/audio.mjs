// Análisis de la pista de audio: energía, golpes, tempo, loudness y relación
// con el montaje.
//
// La envolvente se calcula sobre PCM crudo en vez de pedirle métricas a ffmpeg
// porque hace falta la serie completa para autocorrelacionarla y estimar tempo.

import { spawnSync } from "node:child_process";

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

const SR = 8000;
const VENTANA_S = 0.02; // 20 ms: suficiente resolución para ubicar golpes

function pcmMono(video) {
  const r = spawnSync("ffmpeg",
    ["-v", "error", "-i", video, "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"],
    { encoding: "buffer", maxBuffer: 1 << 28 });
  return r.stdout && r.stdout.length > SR ? r.stdout : null;
}

// Loudness integrado según EBU R128, en LUFS. Es la medida que usan las
// plataformas para normalizar; dice más sobre el "peso" percibido que un pico.
function loudness(video) {
  const r = spawnSync("ffmpeg",
    ["-v", "info", "-i", video, "-af", "ebur128=peak=true", "-f", "null", "-"],
    { encoding: "buffer", maxBuffer: 1 << 26 });
  const txt = (r.stderr || Buffer.alloc(0)).toString("utf8");
  const bloque = txt.slice(txt.lastIndexOf("Integrated loudness"));
  const lufs = bloque.match(/I:\s*(-?[\d.]+)\s*LUFS/);
  const rango = bloque.match(/LRA:\s*(-?[\d.]+)\s*LU/);
  const pico = txt.match(/Peak:\s*(-?[\d.]+)\s*dBFS/);
  if (!lufs) return null;
  return {
    integrado_lufs: Number(lufs[1]),
    rango_lu: rango ? Number(rango[1]) : null,
    pico_dbfs: pico ? Number(pico[1]) : null,
    lectura: Number(lufs[1]) > -12 ? "muy comprimido y fuerte, típico de redes"
      : Number(lufs[1]) < -20 ? "dinámico y con aire, típico de pieza cinematográfica"
      : "nivel intermedio",
  };
}

// Tempo por autocorrelación de la envolvente de energía. Solo tiene sentido con
// pulso regular: se reporta junto a cuán marcado es el pico, para poder
// descartarlo cuando no hay música con beat.
function estimarTempo(env, ventanaS) {
  const n = env.length;
  if (n < 100) return null;
  const m = media(env);
  const centrada = env.map((v) => v - m);

  // 60 a 180 BPM cubre casi toda la música de uso publicitario.
  const minLag = Math.round(60 / 180 / ventanaS);
  const maxLag = Math.min(Math.round(60 / 60 / ventanaS), Math.floor(n / 2));
  if (maxLag <= minLag) return null;

  let mejorLag = 0, mejorVal = -Infinity;
  const valores = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < n; i++) acc += centrada[i] * centrada[i + lag];
    const v = acc / (n - lag);
    valores.push(v);
    if (v > mejorVal) { mejorVal = v; mejorLag = lag; }
  }
  if (mejorLag === 0) return null;

  const prom = media(valores);
  const desvio = Math.sqrt(media(valores.map((v) => (v - prom) ** 2)));
  // Cuántas desviaciones sobresale el pico: por debajo de 2 no hay pulso claro.
  const relieve = desvio > 0 ? (mejorVal - prom) / desvio : 0;
  const bpm = 60 / (mejorLag * ventanaS);

  return {
    bpm_estimado: round(bpm, 1),
    relieve_pico: round(relieve, 2),
    confianza: relieve > 3 ? "alta" : relieve > 2 ? "media" : "baja",
    nota: relieve <= 2
      ? "no hay pulso regular detectable: probablemente no es música con beat, o es voz sola"
      : "el tempo sale de autocorrelar la energía; puede caer en la mitad o el doble del real",
  };
}

export function analizar(video, duracion, planos) {
  const pcm = pcmMono(video);
  if (!pcm) return null;

  const ventana = Math.round(SR * VENTANA_S);
  const env = [];
  const totalMuestras = Math.floor(pcm.length / 2);
  for (let i = 0; i + ventana <= totalMuestras; i += ventana) {
    let suma = 0;
    for (let j = 0; j < ventana; j++) {
      const s = pcm.readInt16LE((i + j) * 2) / 32768;
      suma += s * s;
    }
    env.push(Math.sqrt(suma / ventana));
  }
  if (!env.length) return null;

  let pico = 0;
  for (const v of env) if (v > pico) pico = v;
  if (pico === 0) {
    return {
      pista: "presente pero muda",
      nota: "hay stream de audio pero su contenido es silencio digital",
      onsets_detectados: 0,
      cortes_totales: Math.max(planos.length - 1, 0),
      cortes_sobre_onset: 0,
      proporcion_cortes_montados_al_audio: null,
    };
  }

  const norm = env.map((v) => v / pico);
  const mediaGlobal = media(norm);

  // Onsets: subidas bruscas de energía por encima del nivel medio.
  const onsets = [];
  for (let i = 1; i < norm.length; i++) {
    if (norm[i] - norm[i - 1] > 0.14 && norm[i] > mediaGlobal) {
      const t = round(i * VENTANA_S);
      // Evitar contar el mismo golpe dos veces.
      if (!onsets.length || t - onsets[onsets.length - 1] > 0.08) onsets.push(t);
    }
  }

  const cortes = planos.slice(1).map((p) => p.inicio_s);
  const sobreOnset = cortes.filter((c) => onsets.some((o) => Math.abs(o - c) <= 0.15)).length;

  const silencios = [];
  let ini = null;
  for (let i = 0; i < norm.length; i++) {
    if (norm[i] < 0.02) { if (ini === null) ini = i; }
    else if (ini !== null) {
      const largo = (i - ini) * VENTANA_S;
      if (largo >= 0.4) silencios.push({ inicio_s: round(ini * VENTANA_S), duracion_s: round(largo) });
      ini = null;
    }
  }

  // Proporción de tiempo con energía apreciable: separa una pieza con música
  // continua de una con voz y silencios, o de una casi vacía.
  const densidad = norm.filter((v) => v > 0.1).length / norm.length;

  const tempo = estimarTempo(norm, VENTANA_S);
  const proporcionMontaje = cortes.length ? round(sobreOnset / cortes.length) : null;

  return {
    pista: "con contenido",
    ventana_ms: VENTANA_S * 1000,
    energia_media_norm: round(mediaGlobal, 3),
    densidad_sonora: round(densidad),
    onsets_detectados: onsets.length,
    densidad_onsets_por_s: round(onsets.length / duracion),
    tempo,
    loudness: loudness(video),
    cortes_totales: cortes.length,
    cortes_sobre_onset: sobreOnset,
    proporcion_cortes_montados_al_audio: proporcionMontaje,
    montaje_al_ritmo: proporcionMontaje === null ? null
      : proporcionMontaje > 0.6 ? "sí: la mayoría de los cortes cae sobre un golpe"
      : proporcionMontaje > 0.3 ? "en parte: algunos cortes acompañan el audio"
      : "no: el montaje sigue la imagen, no el audio",
    silencios: silencios.slice(0, 60),
    onsets: onsets.slice(0, 200),
  };
}
