// Medición de movimiento de cámara por correlación de perfiles marginales.
//
// Por qué no vidstab: `vidstabdetect` escribe un .trf binario con campos de
// movimiento locales, no transformaciones globales legibles.
//
// Dos decisiones que salieron de calibrar contra video de movimiento conocido
// (ver referencias/calibracion.md, y scripts/calibrar.mjs para reproducirlo):
//
// 1. La deriva se mide entre los EXTREMOS del plano, no acumulando cuadro a
//    cuadro. Acumular pierde todo movimiento de menos de 1 px por cuadro —que es
//    justo el rango de los movimientos cinematográficos— porque cada paso
//    redondea a cero. Un paneo lento real dio recorrido 0 con el método acumulado.
//
// 2. El zoom se detecta por DIVERGENCIA entre mitades del cuadro. En un zoom in
//    la mitad izquierda se corre a la izquierda y la derecha a la derecha; en un
//    paneo ambas se corren para el mismo lado. Distinguirlos por la dispersión
//    del perfil era ruidoso porque depende del contenido, no de la escala.

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

// Perfil de columnas de una franja horizontal del frame.
function perfilCols(buf, off, w, h, desdeCol = 0, hastaCol = w) {
  const n = hastaCol - desdeCol;
  const p = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    const base = off + y * w;
    for (let x = 0; x < n; x++) p[x] += buf[base + desdeCol + x];
  }
  return p;
}

function perfilFilas(buf, off, w, h) {
  const p = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const base = off + y * w;
    for (let x = 0; x < w; x++) acc += buf[base + x];
    p[y] = acc;
  }
  return p;
}

// Correlación por suma de diferencias cuadradas, con refinamiento subpíxel por
// interpolación parabólica sobre el mínimo. Devuelve también cuán marcado es ese
// mínimo: si no destaca, la medición no vale.
function desplazamiento(a, b, max) {
  const n = a.length;
  const errores = new Map();
  let mejor = 0, mejorErr = Infinity;

  for (let d = -max; d <= max; d++) {
    let err = 0, cuenta = 0;
    for (let i = 0; i < n; i++) {
      const j = i + d;
      if (j < 0 || j >= n) continue;
      const dif = a[i] - b[j];
      err += dif * dif;
      cuenta++;
    }
    if (cuenta < n * 0.5) continue;
    const norm = err / cuenta;
    errores.set(d, norm);
    if (norm < mejorErr) { mejorErr = norm; mejor = d; }
  }
  if (!errores.size) return { d: 0, nitidez: 0 };

  // Refinamiento subpíxel: vértice de la parábola por los tres puntos del mínimo.
  const e0 = errores.get(mejor - 1), e1 = mejorErr, e2 = errores.get(mejor + 1);
  let sub = mejor;
  if (e0 !== undefined && e2 !== undefined) {
    const denom = e0 - 2 * e1 + e2;
    if (denom !== 0) {
      const ajuste = (0.5 * (e0 - e2)) / denom;
      if (Math.abs(ajuste) <= 1) sub = mejor + ajuste;
    }
  }

  const vals = [...errores.values()].sort((x, y) => x - y);
  const mediana = vals[Math.floor(vals.length / 2)];
  const nitidez = mediana > 0 ? 1 - mejorErr / mediana : 0;
  return { d: sub, nitidez };
}

export function analizarPlano(buf, w, h, desde, hasta, fpsMuestreo) {
  const tam = w * h;
  const n = hasta - desde;
  if (n < 3) {
    return { confianza: "insuficiente", motivo: "plano demasiado corto para medir movimiento" };
  }

  const maxX = Math.round(w * 0.45);
  const maxY = Math.round(h * 0.45);
  const offA = desde * tam;
  const offB = (hasta - 1) * tam;

  // --- Deriva global entre extremos del plano -----------------------------
  const gx = desplazamiento(perfilCols(buf, offA, w, h), perfilCols(buf, offB, w, h), maxX);
  const gy = desplazamiento(perfilFilas(buf, offA, w, h), perfilFilas(buf, offB, w, h), maxY);

  // --- Zoom por divergencia entre mitades ---------------------------------
  const medio = Math.floor(w / 2);
  const izq = desplazamiento(
    perfilCols(buf, offA, w, h, 0, medio),
    perfilCols(buf, offB, w, h, 0, medio),
    Math.round(medio * 0.45)
  );
  const der = desplazamiento(
    perfilCols(buf, offA, w, h, medio, w),
    perfilCols(buf, offB, w, h, medio, w),
    Math.round((w - medio) * 0.45)
  );
  // Positivo = las mitades se separan = el encuadre se cierra = push in.
  const divergencia = (der.d - izq.d) / w;

  // --- Monotonía: ¿el movimiento es sostenido o va y vuelve? --------------
  const tercio = Math.floor(n / 3);
  let monotonia = null;
  if (tercio >= 2) {
    const t1 = desplazamiento(
      perfilCols(buf, offA, w, h),
      perfilCols(buf, (desde + tercio) * tam, w, h), maxX
    ).d;
    const t2 = desplazamiento(
      perfilCols(buf, (desde + tercio) * tam, w, h),
      perfilCols(buf, (desde + 2 * tercio) * tam, w, h), maxX
    ).d;
    const t3 = desplazamiento(
      perfilCols(buf, (desde + 2 * tercio) * tam, w, h),
      perfilCols(buf, offB, w, h), maxX
    ).d;
    const signos = [t1, t2, t3].map(Math.sign).filter((s) => s !== 0);
    monotonia = signos.length ? signos.every((s) => s === signos[0]) : true;
  }

  // --- Jitter: cambios de dirección cuadro a cuadro -----------------------
  const pasos = [];
  const salto = Math.max(1, Math.floor(n / 40)); // hasta 40 mediciones por plano
  for (let i = desde; i + salto < hasta; i += salto) {
    const p = desplazamiento(
      perfilCols(buf, i * tam, w, h),
      perfilCols(buf, (i + salto) * tam, w, h),
      Math.round(w * 0.15)
    );
    pasos.push(p.d);
  }
  let cambios = 0;
  for (let i = 1; i < pasos.length; i++) {
    if (Math.sign(pasos[i]) !== Math.sign(pasos[i - 1]) && pasos[i] !== 0 && pasos[i - 1] !== 0) cambios++;
  }
  const jitter = pasos.length > 1 ? cambios / (pasos.length - 1) : 0;
  const recorrido = pasos.reduce((s, x) => s + Math.abs(x), 0) / w;

  // La nitidez se evalúa POR EJE, no promediada. Un patrón repetitivo en una
  // dirección engancha la correlación en un mínimo falso solo en ese eje: al
  // promediar, el eje bueno tapaba al malo y aparecía un tilt que no existía.
  const nitidez = (gx.nitidez + gy.nitidez) / 2;
  const confianza = nitidez > 0.35 ? "alta" : nitidez > 0.15 ? "media" : "baja";
  const NITIDEZ_EJE = 0.5;

  // El signo se invierte a propósito: la correlación mide hacia dónde se movió el
  // CONTENIDO, y el movimiento de cámara es el opuesto (si la cámara panea a la
  // derecha, el contenido se corre a la izquierda). Sin esta inversión el módulo
  // reportaba "paneo izquierda" para un paneo a la derecha, con la magnitud
  // correcta — lo detectó el banco de calibración.
  const medidas = {
    frames_analizados: n,
    fps_muestreo: fpsMuestreo,
    deriva_x_frac: round(-gx.d / w),
    deriva_y_frac: round(-gy.d / h),
    recorrido_x_frac: round(recorrido),
    divergencia_mitades: round(divergencia),
    jitter: round(jitter, 2),
    movimiento_sostenido: monotonia,
    nitidez_correlacion: round(nitidez),
    nitidez_x: round(gx.nitidez),
    nitidez_y: round(gy.nitidez),
    eje_x_confiable: gx.nitidez >= NITIDEZ_EJE,
    eje_y_confiable: gy.nitidez >= NITIDEZ_EJE,
    confianza,
  };
  return { ...medidas, clasificacion: clasificar(medidas) };
}

// Umbrales calibrados contra video sintético de movimiento conocido.
// El caso límite que los fija: un paneo de 6,25% del ancho de cuadro tiene que
// dar "paneo", y un plano fijo con acción interna tiene que dar "fija".
const QUIETO = 0.025;   // fracción de cuadro
// Divergencia entre mitades. Calibrado contra falsos positivos reales, no solo
// contra el banco sintético: un plano de dos personas con cámara verificadamente
// fija daba 0,068 porque el movimiento de los sujetos deforma los perfiles de
// cada mitad de forma asimétrica. Los push-in verdaderos miden 0,15 y 0,24.
// Se elige 0,10: prefiere perder un push-in muy sutil antes que inventar uno.
const ZOOM_MIN = 0.10;
const HANDHELD = 0.4;

function clasificar(m) {
  if (m.confianza === "baja") {
    return {
      movimiento: "indeterminado",
      nota: "la correlación no fue nítida: probablemente un sujeto llena el cuadro o la textura es muy uniforme. Decidir mirando la tira de frames.",
    };
  }

  const dx = m.deriva_x_frac, dy = m.deriva_y_frac, dz = m.divergencia_mitades;
  const hayZoom = Math.abs(dz) > ZOOM_MIN;
  // En un zoom puro el contenido se expande en los dos ejes, y la deriva global
  // lo lee como traslación. Solo se reporta traslación si supera al efecto del
  // zoom — en ambos ejes: sin esto, un push-in limpio reportaba un tilt espurio.
  const hayX = m.eje_x_confiable && Math.abs(dx) > QUIETO && Math.abs(dx) > Math.abs(dz) * 0.6;
  const hayY = m.eje_y_confiable && Math.abs(dy) > QUIETO && Math.abs(dy) > Math.abs(dz) * 0.95;
  // El zoom altera el perfil de forma no traslacional y dispara el contador de
  // cambios de dirección. Con zoom fuerte el jitter no mide temblor: no se afirma.
  const inestable = m.jitter > HANDHELD && !hayZoom;

  if (!hayX && !hayY && !hayZoom) {
    return {
      movimiento: "fija",
      handheld: inestable,
      nota: inestable
        ? "sin deriva neta pero con temblor: cámara en mano sostenida en el lugar"
        : "encuadre estable: si algo cambia en el plano, es acción interna, no cámara",
      termino_prompt: inestable ? "handheld static shot, subtle shake" : "locked-off shot, static camera",
    };
  }

  const etiquetas = [];
  if (hayZoom) etiquetas.push(dz > 0 ? "push_in" : "pull_out");
  if (hayX) etiquetas.push(dx > 0 ? "paneo_o_travelling_derecha" : "paneo_o_travelling_izquierda");
  if (hayY) etiquetas.push(dy > 0 ? "tilt_abajo" : "tilt_arriba");

  return {
    movimiento: etiquetas.join(" + "),
    handheld: inestable,
    intensidad: describirIntensidad(m),
    nota: m.movimiento_sostenido === false
      ? "el movimiento cambia de dirección durante el plano: no es un movimiento único"
      : inestable
        ? "movimiento con temblor: cámara en mano"
        : "movimiento sostenido en una dirección: cámara sobre soporte",
    ambiguedad: hayX
      ? "paneo y travelling desplazan el contenido igual en esta medición: distinguirlos mirando si el fondo se corre a distinta velocidad que el primer plano"
      : null,
    termino_prompt: terminoPrompt(etiquetas, inestable),
  };
}

// Magnitud en términos que sirven para un prompt: los modelos responden mejor a
// "recorre un cuarto del cuadro" que a "se mueve bastante".
function describirIntensidad(m) {
  const partes = [];
  const ax = Math.abs(m.deriva_x_frac);
  if (ax > QUIETO) partes.push(`recorre ${Math.round(ax * 100)}% del ancho de cuadro`);
  const ay = Math.abs(m.deriva_y_frac);
  if (ay > QUIETO) partes.push(`recorre ${Math.round(ay * 100)}% del alto`);
  const az = Math.abs(m.divergencia_mitades);
  if (az > ZOOM_MIN) partes.push(`cambio de escala ~${Math.round(az * 100)}%`);
  const seg = m.frames_analizados / m.fps_muestreo;
  if (partes.length) partes.push(`en ${round(seg, 1)}s`);
  return partes.join(", ") || null;
}

function terminoPrompt(etiquetas, handheld) {
  const mapa = {
    push_in: "slow dolly in",
    pull_out: "dolly out revealing",
    paneo_o_travelling_izquierda: "pan/tracking left",
    paneo_o_travelling_derecha: "pan/tracking right",
    tilt_arriba: "tilt up",
    tilt_abajo: "tilt down",
  };
  const partes = etiquetas.map((e) => mapa[e]).filter(Boolean);
  if (handheld) partes.push("handheld, subtle shake");
  return partes.join(", ") || null;
}
