// Luz, color y textura, medidos cuadro a cuadro con `signalstats` de ffmpeg.
//
// Una sola pasada devuelve, por cuadro: niveles de luma (mínimo, percentil bajo,
// medio, percentil alto, máximo), balance de croma U y V, saturación, matiz y
// diferencia temporal. De ahí salen esquema de luz, paleta y una aproximación
// a la textura.
//
// Lo que estas métricas NO son: un análisis de grading ni una medición de
// temperatura de color en kelvin. Son estadística de píxeles. El agente
// interpreta con el frame a la vista.

import { spawnSync } from "node:child_process";

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// Serie temporal de estadísticas. `extra` permite anteponer filtros: se usa para
// medir alta frecuencia espacial sobre la diferencia con una versión suavizada.
export function serieSignalstats(video, extra = null) {
  const cadena = (extra ? extra + "," : "") + "signalstats,metadata=print:file=-";
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-vf", cadena, "-f", "null", "-"],
    { encoding: "buffer", maxBuffer: 1 << 28 });
  const texto = (r.stdout || Buffer.alloc(0)).toString("utf8");

  const serie = [];
  let actual = null;
  for (const linea of texto.split("\n")) {
    const mt = linea.match(/pts_time:([0-9.]+)/);
    if (mt) {
      if (actual) serie.push(actual);
      actual = { t: Number(mt[1]) };
      continue;
    }
    const mv = linea.match(/lavfi\.signalstats\.(\w+)=([0-9.eE+-]+)/);
    if (mv && actual) actual[mv[1]] = Number(mv[2]);
  }
  if (actual) serie.push(actual);
  return serie;
}

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

// Resume la serie dentro de un intervalo de tiempo (un plano).
export function resumirTramo(serie, desde, hasta) {
  const tramo = serie.filter((f) => f.t >= desde && f.t < hasta);
  if (!tramo.length) return null;

  const yavg = media(tramo.map((f) => f.YAVG ?? 0));
  const ylow = media(tramo.map((f) => f.YLOW ?? 0));
  const yhigh = media(tramo.map((f) => f.YHIGH ?? 0));
  const ymin = media(tramo.map((f) => f.YMIN ?? 0));
  const ymax = media(tramo.map((f) => f.YMAX ?? 0));
  const uavg = media(tramo.map((f) => f.UAVG ?? 128));
  const vavg = media(tramo.map((f) => f.VAVG ?? 128));
  const sat = media(tramo.map((f) => f.SATAVG ?? 0));
  const satmax = media(tramo.map((f) => f.SATMAX ?? 0));
  const ydif = media(tramo.map((f) => f.YDIF ?? 0));

  // U y V son diferencias de color centradas en 128. V alto = hacia el rojo,
  // U alto = hacia el azul. La diferencia entre ambos da el eje cálido/frío.
  const ejeCalidoFrio = round(vavg - uavg, 1);

  return {
    cuadros: tramo.length,
    luma: {
      medio: round(yavg, 1),
      minimo: round(ymin, 1),
      maximo: round(ymax, 1),
      percentil_bajo: round(ylow, 1),
      percentil_alto: round(yhigh, 1),
      rango_util: round(yhigh - ylow, 1),
      rango_total: round(ymax - ymin, 1),
    },
    color: {
      u_medio: round(uavg, 1),
      v_medio: round(vavg, 1),
      eje_calido_frio: ejeCalidoFrio,
      saturacion_media: round(sat, 1),
      saturacion_maxima: round(satmax, 1),
    },
    textura: {
      diferencia_temporal: round(ydif, 2),
      nota: "la diferencia temporal mezcla grano con movimiento: alta en un plano quieto sugiere grano o ruido; alta en un plano con acción no dice nada por sí sola",
    },
    lectura: leer({ yavg, ylow, yhigh, ymin, ymax, sat, ejeCalidoFrio }),
  };
}

// Traducción a los términos del glosario. Umbrales sobre luma 0-255.
function leer({ yavg, ylow, yhigh, ymin, ymax, sat, ejeCalidoFrio }) {
  const rangoUtil = yhigh - ylow;
  const clave =
    yavg > 165 && rangoUtil < 90 ? "clave alta"
    : yavg < 85 ? "clave baja"
    : "clave media";

  const contraste =
    rangoUtil > 130 ? "contraste alto, sombras marcadas"
    : rangoUtil < 60 ? "contraste bajo, luz difusa"
    : "contraste medio";

  // Negros levantados: el mínimo no llega cerca de cero. Típico de grading de
  // película, filtros de difusión y look "lavado".
  const negros = ymin > 32 ? "negros levantados" : ymin < 12 ? "negros al fondo" : "negros normales";
  const altas = ymax > 248 ? "altas luces recortadas" : null;

  const temperatura =
    ejeCalidoFrio > 12 ? "dominante cálida"
    : ejeCalidoFrio < -12 ? "dominante fría"
    : "sin dominante marcada";

  // Escala calibrada forzando saturación conocida sobre material real y midiendo
  // el SATAVG que devuelve: 0 -> 1, 0,35 -> 12,6, 0,7 -> 25,3, 1,0 -> 35,8,
  // 1,5 -> 54,4, 2,2 -> 79,7. Con los umbrales anteriores casi todo caía en
  // "desaturado" y la métrica no distinguía nada.
  // Depende del contenido: una escena sin color intrínseco mide bajo aunque no
  // tenga grading desaturado. Sirve para comparar planos entre sí.
  const saturacion =
    sat < 5 ? "monocromo o casi"
    : sat < 18 ? "fuertemente desaturado"
    : sat < 30 ? "desaturado"
    : sat < 45 ? "saturación natural"
    : sat < 70 ? "saturación alta"
    : "saturación muy alta, look pop";

  const terminos = [];
  if (clave === "clave alta") terminos.push("high key lighting");
  if (clave === "clave baja") terminos.push("low key lighting");
  if (contraste.startsWith("contraste alto")) terminos.push("hard directional light, deep shadows");
  if (contraste.startsWith("contraste bajo")) terminos.push("soft diffused light");
  if (temperatura === "dominante cálida") terminos.push("warm tones");
  if (temperatura === "dominante fría") terminos.push("cool tones");
  if (negros === "negros levantados") terminos.push("lifted blacks, filmic");
  if (saturacion === "monocromo o casi") terminos.push("black and white");
  else if (saturacion === "fuertemente desaturado") terminos.push("heavily desaturated");
  else if (saturacion === "saturación muy alta, look pop") terminos.push("hypersaturated, punchy colors");

  return {
    clave, contraste, negros, altas_luces: altas, temperatura, saturacion,
    termino_prompt: terminos.join(", ") || null,
  };
}

// Textura de alta frecuencia espacial: diferencia entre el cuadro y una versión
// suavizada. Sube con el grano, pero también con el detalle fino (follaje, tramas
// de tela, texto). No los distingue; se reporta como pista, no como veredicto.
export function medirTexturaEspacial(video) {
  const serie = serieSignalstats(video, "split[a][b];[b]boxblur=2:1[c];[a][c]blend=all_mode=difference");
  if (!serie.length) return null;
  const vals = serie.map((f) => f.YAVG ?? 0);
  const m = media(vals);
  const orden = [...vals].sort((a, b) => a - b);
  return {
    alta_frecuencia_media: round(m, 2),
    alta_frecuencia_mediana: round(orden[Math.floor(orden.length / 2)], 2),
    lectura: m > 9 ? "textura marcada: grano, ruido o mucho detalle fino"
      : m < 3.5 ? "imagen muy limpia: poco grano y poco detalle fino"
      : "textura media",
    nota: "mide alta frecuencia espacial, que mezcla grano con detalle real. Confirmar mirando un frame al 100%.",
  };
}
