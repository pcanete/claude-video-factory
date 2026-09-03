// Clasificación de transiciones entre planos.
//
// La v1 del escáner detectaba las transiciones suaves y las TIRABA: fusionaba
// las detecciones cercanas y seguía. Pero cómo se pasa de un plano al siguiente
// es parte de la gramática — un video que encadena con disolvencias no se parece
// a uno que corta seco, aunque tengan el mismo ritmo.
//
// Se clasifica cruzando dos series ya medidas: el score de cambio de escena por
// cuadro y la luma media por cuadro. No hace falta decodificar de nuevo.

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

// Ventana de cuadros alrededor de un tiempo dado.
function ventana(serie, t, radio) {
  return serie.filter((f) => f.t >= t - radio && f.t <= t + radio);
}

/**
 * @param {number} t          tiempo del corte
 * @param {Array}  scores     [{t, score}] de todos los cuadros
 * @param {Array}  luma       [{t, YAVG, YMIN, YMAX}] de todos los cuadros
 * @param {number} fusionadas cuántas detecciones se agruparon en este evento
 */
export function clasificar(t, scores, luma, fusionadas = 0) {
  const RADIO = 0.6;
  const vs = ventana(scores, t, RADIO);
  const vl = ventana(luma, t, RADIO);
  if (!vs.length) return { tipo: "indeterminado", motivo: "sin datos alrededor del corte" };

  const picos = vs.filter((f) => f.score > 0.06);
  const maxScore = Math.max(...vs.map((f) => f.score));
  // Ancho del evento: cuántos cuadros consecutivos tienen cambio apreciable.
  // Un corte duro concentra todo en uno o dos; una disolvencia lo reparte.
  const anchoEvento = picos.length;

  const lumas = vl.map((f) => f.YAVG ?? 0);
  const minLuma = lumas.length ? Math.min(...lumas) : null;
  const maxLuma = lumas.length ? Math.max(...lumas) : null;

  // Fundido a negro: la luma cae muy abajo justo en la transición.
  if (minLuma !== null && minLuma < 18) {
    return {
      tipo: "fundido_a_negro",
      evidencia: { luma_minima: round(minLuma, 1), ancho_evento: anchoEvento },
      termino_prompt: "fade to black",
      lectura: "el cuadro pasa por negro: marca un cambio de bloque, no solo de plano",
    };
  }

  // Flash o fundido a blanco: la luma se dispara.
  if (maxLuma !== null && maxLuma > 240 && maxLuma - (minLuma ?? 0) > 90) {
    return {
      tipo: "flash_o_fundido_blanco",
      evidencia: { luma_maxima: round(maxLuma, 1), ancho_evento: anchoEvento },
      termino_prompt: "flash transition, white flash cut",
      lectura: "golpe de blanco entre planos: recurso de ritmo, suele ir montado al audio",
    };
  }

  // Disolvencia: el cambio se reparte en varios cuadros en vez de concentrarse.
  if (anchoEvento >= 4 || fusionadas >= 2) {
    return {
      tipo: "disolvencia",
      evidencia: { ancho_evento: anchoEvento, detecciones_agrupadas: fusionadas, score_maximo: round(maxScore) },
      termino_prompt: "cross dissolve",
      lectura: "los dos planos se superponen: encadenado, no corte",
    };
  }

  // Corte duro: pico único y agudo.
  if (maxScore > 0.25 && anchoEvento <= 2) {
    return {
      tipo: "corte_duro",
      evidencia: { score_maximo: round(maxScore), ancho_evento: anchoEvento },
      termino_prompt: "hard cut",
      lectura: "cambio instantáneo de plano",
    };
  }

  // Cambio suave que no llega a disolvencia clara: puede ser un match cut, un
  // barrido rápido, o dos planos parecidos entre sí.
  return {
    tipo: "corte_suave_o_similar",
    evidencia: { score_maximo: round(maxScore), ancho_evento: anchoEvento },
    lectura: "corte entre planos parecidos, o transición rápida que no deja rastro claro. Mirar los frames de ambos lados antes de afirmar.",
  };
}

// Resumen de conjunto: qué tan homogéneo es el sistema de transiciones.
export function resumir(transiciones) {
  if (!transiciones.length) return null;
  const cuenta = {};
  for (const tr of transiciones) cuenta[tr.tipo] = (cuenta[tr.tipo] ?? 0) + 1;
  const orden = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
  const [dominante, n] = orden[0];
  const proporcion = n / transiciones.length;
  return {
    total: transiciones.length,
    por_tipo: cuenta,
    dominante,
    homogeneidad: round(proporcion, 2),
    lectura: proporcion > 0.85
      ? `sistema homogéneo: casi todo el video usa ${dominante.replace(/_/g, " ")}`
      : `sistema mixto: convive ${orden.map(([k, v]) => `${k.replace(/_/g, " ")} (${v})`).join(", ")}`,
  };
}
