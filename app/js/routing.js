/* Motor de ruteo. Funciona en navegador (window.Routing) y en Node (module.exports). */
(function (root) {
  'use strict';

  const DEFAULTS = {
    centro: { lat: -34.5990, lon: -58.4400 },   // Palermo - Villa Crespo: punto de convergencia de las 3 zonas
    // Pueblos que marcan el limite de la zona "Lejana" (mas alla de ellos, no entran en el reparto por igual de Norte/Sur/Centro)
    lejanaAnchors: [
      { nombre: 'Zárate', lat: -34.098, lon: -59.024 },
      { nombre: 'Pilar', lat: -34.458, lon: -58.914 },
      { nombre: 'La Plata', lat: -34.921, lon: -57.953 },
      { nombre: 'Luján', lat: -34.570, lon: -59.105 }
    ],
    // Pueblo de referencia de cada zona (define la direccion "hacia" la que apunta cada una)
    zonaAnchors: [
      { nombre: 'Norte', lat: -34.472, lon: -58.527 },   // San Isidro
      { nombre: 'Sur', lat: -34.760, lon: -58.402 },     // Lomas de Zamora
      { nombre: 'Centro', lat: -34.653, lon: -58.619 }   // Morón (zona oeste)
    ],
    walkMaxM: 300,             // distancia maxima entre clientes de una ruta a pie
    walkSize: 6,
    vanMin: 4,
    vanMax: 6,
    vanMaxHopKm: 6,            // salto maximo entre clientes de camioneta
    velocidadKmh: 25,
    factorCalle: 1.3,
    jornadaMin: 480,
    minExpress: 30,
    minProfundo: 60,
    diasObjetivo: 60,
    tolerancia: 7,
    tipoPrimeraVez: 'Profundo',
    cicloInicio: null,         // 'YYYY-MM-DD'
    numeroInicial: 1           // primer numero de ruta a asignar
  };

  const DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
  const ZONAS = ['Norte', 'Sur', 'Centro', 'Lejana'];

  const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
  function haversineKm(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }
  function bearingDeg(a, b) {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  const angDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /* ---------- Fechas ---------- */
  function isoToDate(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  function dateToIso(dt) { return dt.toISOString().slice(0, 10); }
  function addDays(iso, n) { const d = isoToDate(iso); d.setUTCDate(d.getUTCDate() + n); return dateToIso(d); }
  function diffDays(a, b) { return Math.round((isoToDate(a) - isoToDate(b)) / 86400000); }
  function diaSemana(iso) { return isoToDate(iso).getUTCDay(); }

  /* Dias cerrados: texto libre -> set de numeros de dia (0=dom..6=sab) */
  function parseDiasCerrados(txt) {
    const t = norm(txt);
    const set = new Set();
    if (!t) return set;
    DIAS.forEach((d, i) => {
      if (new RegExp('\\b' + d).test(t)) set.add(i);
    });
    return set;
  }

  /* ---------- Tipo de mantenimiento: ciclo 2 express + 1 profundo ---------- */
  function tipoSiguiente(hist, cfg) {
    if (!hist || !hist.length) return cfg.tipoPrimeraVez;
    const t = hist.map((h) => norm(h.tipo));
    if (t[0] === 'profundo') return 'Express';
    if (t[0] === 'express' && t[1] === 'express') return 'Profundo';
    if (t[0] === 'express') return 'Express';
    // tipos desconocidos en el historial: si no hay ningun profundo registrado, tocaria profundo
    return hist.length >= 3 && !t.includes('profundo') ? 'Profundo' : 'Express';
  }

  /* ---------- Preparacion ---------- */
  function prepararClientes(clientes, cfg) {
    const out = clientes.map((c) => {
      const lat = Number(c.y), lon = Number(c.x);
      const dist = haversineKm(cfg.centro, { lat, lon });
      const bearing = bearingDeg(cfg.centro, { lat, lon });
      const hist = (c.historial || []).slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 3);
      const objetivo = hist.length ? addDays(hist[0].fecha, cfg.diasObjetivo) : null;
      return {
        codigo: c.codigo, nombre: c.nombre, x: lon, y: lat, lat, lon, dist, bearing, zona: null,
        diasCerrados: c.diasCerrados || '', horario: c.horario || '',
        cerrados: parseDiasCerrados(c.diasCerrados),
        historial: hist,
        tipoMant: tipoSiguiente(hist, cfg),
        objetivo
      };
    });
    asignarZonas(out, cfg);
    return out;
  }

  /* Zona "Lejana": mas alla del pueblo mas cercano (interpolado por rumbo) entre los limites cargados en cfg.lejanaAnchors.
     Zonas Norte/Sur/Centro: cada cliente restante se asigna primero al pueblo de referencia mas cercano en rumbo
     (cfg.zonaAnchors) y despues se balancea moviendo, de a uno, los clientes mas "al borde" hacia la zona con menos
     clientes, hasta repartir la cantidad lo mas parejo posible entre las tres (la zona Lejana no participa del reparto). */
  function asignarZonas(clientes, cfg) {
    const anchorsL = cfg.lejanaAnchors.map((a) => ({ nombre: a.nombre, bearing: bearingDeg(cfg.centro, a), dist: haversineKm(cfg.centro, a) })).sort((a, b) => a.bearing - b.bearing);
    function limiteLejana(b) {
      const n = anchorsL.length;
      for (let i = 0; i < n; i++) {
        const a1 = anchorsL[i], a2 = anchorsL[(i + 1) % n];
        const b2 = i === n - 1 ? a2.bearing + 360 : a2.bearing;
        const bb = b < a1.bearing ? b + 360 : b;
        if (bb >= a1.bearing && bb <= b2) return a1.dist + (bb - a1.bearing) / (b2 - a1.bearing) * (a2.dist - a1.dist);
      }
      return Math.max(...anchorsL.map((a) => a.dist));
    }

    const anchorsZ = cfg.zonaAnchors.map((a) => ({ nombre: a.nombre, bearing: bearingDeg(cfg.centro, a) }));
    const libres = [];
    clientes.forEach((c) => {
      if (c.dist > limiteLejana(c.bearing)) { c.zona = 'Lejana'; return; }
      let best = anchorsZ[0].nombre, bd = Infinity;
      anchorsZ.forEach((a) => { const d = angDist(c.bearing, a.bearing); if (d < bd) { bd = d; best = a.nombre; } });
      c.zona = best; libres.push(c);
    });

    const cuenta = {}; anchorsZ.forEach((a) => { cuenta[a.nombre] = 0; });
    libres.forEach((c) => cuenta[c.zona]++);
    let guard = 0;
    while (guard++ < libres.length * 2) {
      const nombres = anchorsZ.map((a) => a.nombre);
      const max = nombres.reduce((a, b) => (cuenta[a] >= cuenta[b] ? a : b));
      const min = nombres.reduce((a, b) => (cuenta[a] <= cuenta[b] ? a : b));
      if (cuenta[max] - cuenta[min] <= 1) break;
      const aMax = anchorsZ.find((a) => a.nombre === max), aMin = anchorsZ.find((a) => a.nombre === min);
      let cand = null, costo = Infinity;
      libres.forEach((c) => {
        if (c.zona !== max) return;
        const k = angDist(c.bearing, aMin.bearing) - angDist(c.bearing, aMax.bearing);
        if (k < costo) { costo = k; cand = c; }
      });
      if (!cand) break;
      cuenta[max]--; cand.zona = min; cuenta[min]++;
    }
  }

  const d2 = (a, b) => haversineKm(a, b);

  /* Crecimiento de un grupo por vecino mas cercano a cualquier miembro */
  function crecer(start, pool, used, size, maxKm) {
    const grupo = [start];
    used.add(start.codigo);
    while (grupo.length < size) {
      let best = null, bd = Infinity;
      for (const c of pool) {
        if (used.has(c.codigo)) continue;
        for (const m of grupo) {
          const d = d2(c, m);
          if (d < bd) { bd = d; best = c; }
        }
      }
      if (!best || bd > maxKm) break;
      grupo.push(best);
      used.add(best.codigo);
    }
    return grupo;
  }

  /* ---------- Rutas a pie ---------- */
  function rutasAPie(clientes, cfg) {
    const rutas = [], sinRuta = [];
    for (const zona of ZONAS) {
      const pool = clientes.filter((c) => c.zona === zona).sort((a, b) => b.dist - a.dist);
      const usados = new Set();
      const descartados = new Set();
      for (const start of pool) {
        if (usados.has(start.codigo) || descartados.has(start.codigo)) continue;
        const tmp = new Set(usados);
        const g = crecer(start, pool, tmp, cfg.walkSize, cfg.walkMaxM / 1000);
        if (g.length === cfg.walkSize) {
          g.forEach((c) => usados.add(c.codigo));
          rutas.push({ tipo: 'A pie', zona, clientes: g });
        } else {
          descartados.add(start.codigo);
        }
      }
    }
    const usadosAll = new Set(rutas.flatMap((r) => r.clientes.map((c) => c.codigo)));
    clientes.forEach((c) => { if (!usadosAll.has(c.codigo)) sinRuta.push(c); });
    return { rutas, resto: sinRuta };
  }

  /* ---------- Rutas en camioneta ---------- */
  function rutasCamioneta(clientes, cfg) {
    const rutas = [];
    for (const zona of ZONAS) {
      const pool = clientes.filter((c) => c.zona === zona).sort((a, b) => b.dist - a.dist);
      const usados = new Set();
      const grupos = [];
      for (const start of pool) {
        if (usados.has(start.codigo)) continue;
        grupos.push(crecer(start, pool, usados, cfg.vanMax, cfg.vanMaxHopKm));
      }
      // fusionar grupos chicos con el grupo mas cercano que tenga lugar
      const cent = (g) => ({ lat: g.reduce((s, c) => s + c.lat, 0) / g.length, lon: g.reduce((s, c) => s + c.lon, 0) / g.length });
      grupos.sort((a, b) => a.length - b.length);
      for (let i = 0; i < grupos.length; i++) {
        const g = grupos[i];
        if (g.length >= cfg.vanMin) break;
        let mejor = null, md = Infinity;
        grupos.forEach((h, j) => {
          if (j === i || h.length + g.length > cfg.vanMax) return;
          const d = d2(cent(g), cent(h));
          if (d < md && d <= cfg.vanMaxHopKm) { md = d; mejor = j; }
        });
        if (mejor !== null) {
          grupos[mejor].push(...g);
          grupos.splice(i, 1);
          i--;
        }
      }
      grupos.forEach((g) => rutas.push({ tipo: 'Camioneta', zona, clientes: g }));
    }
    return rutas;
  }

  /* Orden de visita: arranca en el mas lejano al centro y va por vecino mas cercano */
  function ordenar(clientes) {
    const rest = clientes.slice();
    rest.sort((a, b) => b.dist - a.dist);
    const out = [rest.shift()];
    while (rest.length) {
      const last = out[out.length - 1];
      let bi = 0, bd = Infinity;
      rest.forEach((c, i) => { const d = d2(last, c); if (d < bd) { bd = d; bi = i; } });
      out.push(rest.splice(bi, 1)[0]);
    }
    return out;
  }

  const centroide = (cs) => ({ lat: cs.reduce((s, c) => s + c.lat, 0) / cs.length, lon: cs.reduce((s, c) => s + c.lon, 0) / cs.length });
  const distCentro = (cs, cfg) => haversineKm(centroide(cs), cfg.centro);

  /* Alterna extremos: mas lejano, mas cercano, 2do mas lejano, 2do mas cercano... */
  function alternar(listaDescendente) {
    const a = listaDescendente.slice(), out = [];
    let lejos = true;
    while (a.length) { out.push(lejos ? a.shift() : a.pop()); lejos = !lejos; }
    return out;
  }

  /* ---------- Tiempos de camioneta ---------- */
  function minutosCamioneta(van, walker, cfg) {
    const cs = van.clientes;
    const kmH = cfg.velocidadKmh / cfg.factorCalle;
    const drive = (a, b) => d2(a, b) / kmH * 60;
    let t = 0;
    for (let i = 1; i < cs.length; i++) t += drive(cs[i - 1], cs[i]);
    cs.forEach((c) => { t += c.tipoMant === 'Profundo' ? cfg.minProfundo : cfg.minExpress; });
    if (walker) {
      const w = walker.clientes;
      t += drive(w[0], cs[0]);                 // lleva al tecnico a pie hasta su primer cliente
      t += drive(cs[cs.length - 1], w[w.length - 1]); // lo busca al finalizar
    }
    return Math.round(t);
  }

  /* ---------- Agenda ---------- */
  function diasLaborales(inicio, n) {
    const out = [];
    let d = inicio;
    while (out.length < n) {
      const w = diaSemana(d);
      if (w !== 0 && w !== 6) out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }

  function generar(clientesIn, opts) {
    const cfg = Object.assign({}, DEFAULTS, opts || {});
    cfg.centro = Object.assign({}, DEFAULTS.centro, (opts && opts.centro) || {});
    if (!cfg.cicloInicio) cfg.cicloInicio = dateToIso(new Date());
    const avisos = [];

    const clientes = prepararClientes(clientesIn, cfg);
    if (!clientes.length) return { pedidos: [], resumen: { total: 0 }, avisos };

    // 1) primero las rutas a pie, 2) con el resto, camioneta
    const pie = rutasAPie(clientes, cfg);
    const van = rutasCamioneta(pie.resto, cfg);
    pie.rutas.forEach((r) => { r.clientes = ordenar(r.clientes); });
    van.forEach((r) => { r.clientes = ordenar(r.clientes); });

    // 3) armar "dias": un tecnico a pie + una camioneta de su misma zona
    const dias = [];
    for (const zona of ZONAS) {
      const W = alternar(pie.rutas.filter((r) => r.zona === zona).sort((a, b) => distCentro(b.clientes, cfg) - distCentro(a.clientes, cfg)));
      let V = van.filter((r) => r.zona === zona).sort((a, b) => distCentro(b.clientes, cfg) - distCentro(a.clientes, cfg));
      const libres = new Set(V);
      const zonaDias = [];
      for (const w of W) {
        let mejor = null, md = Infinity;
        for (const v of libres) {
          const d = d2(centroide(w.clientes), centroide(v.clientes));
          if (d < md) { md = d; mejor = v; }
        }
        if (mejor) libres.delete(mejor);
        zonaDias.push({ zona, walker: w, van: mejor });
      }
      alternar(V.filter((v) => libres.has(v))).forEach((v) => zonaDias.push({ zona, walker: null, van: v }));
      dias.push(...zonaDias);
    }

    // recorte de camioneta si excede la jornada (minimo vanMin)
    const extra = [];
    dias.forEach((d) => {
      if (!d.van) return;
      while (d.van.clientes.length > cfg.vanMin && minutosCamioneta(d.van, d.walker, cfg) > cfg.jornadaMin) {
        extra.push(d.van.clientes.pop());
      }
      d.van.minutos = minutosCamioneta(d.van, d.walker, cfg);
      if (d.van.minutos > cfg.jornadaMin) d.van.excede = true;
    });
    if (extra.length) {
      // los recortados se agrupan en rutas de camioneta adicionales
      const zonasExtra = ZONAS.map((z) => ({ z, cs: extra.filter((c) => c.zona === z) }));
      zonasExtra.forEach(({ z, cs }) => {
        if (!cs.length) return;
        rutasCamioneta(cs, cfg).forEach((r) => {
          r.clientes = ordenar(r.clientes);
          r.minutos = minutosCamioneta(r, null, cfg);
          dias.push({ zona: z, walker: null, van: r });
        });
      });
    }

    // fecha objetivo de cada dia = promedio de los objetivos de sus clientes con historial
    dias.forEach((d) => {
      const all = [...(d.walker ? d.walker.clientes : []), ...(d.van ? d.van.clientes : [])];
      d.clientes = all;
      const obj = all.filter((c) => c.objetivo).map((c) => diffDays(c.objetivo, cfg.cicloInicio));
      d.objetivoOffset = obj.length ? obj.reduce((s, x) => s + x, 0) / obj.length : null;
      d.cerrados = new Set();
      all.forEach((c) => c.cerrados.forEach((x) => d.cerrados.add(x)));
    });

    // 4) asignar numero de ruta / fecha: rotando zonas, alternando lejos-cerca, priorizando vencidos
    const colas = {};
    ZONAS.forEach((z) => { colas[z] = dias.filter((d) => d.zona === z); });
    const fechas = diasLaborales(addDays(cfg.cicloInicio, 0), dias.length + 400).slice(cfg.numeroInicial - 1);
    const orden = [];
    let t = 0, zi = 0;
    while (orden.length < dias.length) {
      let z = ZONAS[zi % ZONAS.length]; zi++;
      let guard = 0;
      while (!colas[z].length && guard++ < ZONAS.length) { z = ZONAS[zi % ZONAS.length]; zi++; }
      const cola = colas[z];
      const fecha = fechas[t];
      const wd = diaSemana(fecha);
      const offsetHoy = diffDays(fecha, cfg.cicloInicio);
      const urgentes = cola.filter((d) => d.objetivoOffset !== null && d.objetivoOffset <= offsetHoy + cfg.tolerancia)
        .sort((a, b) => a.objetivoOffset - b.objetivoOffset);
      const candidatos = urgentes.concat(cola.filter((d) => !urgentes.includes(d)));
      let elegido = candidatos.find((d) => !d.cerrados.has(wd));
      let conflicto = false;
      if (!elegido) { elegido = candidatos[0]; conflicto = true; }
      cola.splice(cola.indexOf(elegido), 1);
      elegido.numero = cfg.numeroInicial + t;
      elegido.fecha = fecha;
      elegido.conflictoCierre = conflicto;
      orden.push(elegido);
      t++;
    }

    // 5) salida por cliente
    const pedidos = [];
    orden.forEach((d) => {
      [['A pie', d.walker], ['Camioneta', d.van]].forEach(([tipoRuta, r]) => {
        if (!r) return;
        r.clientes.forEach((c, i) => {
          const obs = [];
          if (c.cerrados.has(diaSemana(d.fecha))) obs.push('Cliente cerrado el dia programado');
          if (c.objetivo) {
            const desvio = diffDays(d.fecha, c.objetivo);
            if (Math.abs(desvio) > cfg.tolerancia) obs.push(`Fuera de ventana (${desvio > 0 ? '+' : ''}${desvio} dias vs. objetivo de ${cfg.diasObjetivo})`);
          }
          if (r.excede) obs.push('Ruta excede la jornada');
          if (tipoRuta === 'Camioneta' && r.clientes.length < cfg.vanMin) obs.push('Ruta corta (<' + cfg.vanMin + ' clientes)');
          pedidos.push({
            codigo: c.codigo, tipoRuta, numRuta: d.numero, tipoMant: c.tipoMant, zona: d.zona,
            orden: i + 1, fechaProgramada: d.fecha, obs: obs.join('; '),
            estado: 'Pendiente', fechaRealizado: null, tipoRealizado: null
          });
        });
      });
    });

    const resumen = {
      total: pedidos.length,
      rutasAPie: pie.rutas.length,
      rutasCamioneta: dias.filter((d) => d.van).length,
      dias: dias.length,
      porZona: ZONAS.reduce((o, z) => { o[z] = pedidos.filter((p) => p.zona === z).length; return o; }, {}),
      conObservaciones: pedidos.filter((p) => p.obs).length
    };
    if (resumen.conObservaciones) avisos.push(`${resumen.conObservaciones} pedidos con observaciones (ver columna Observaciones).`);
    return { pedidos, resumen, avisos, cfg };
  }

  const api = { DEFAULTS, ZONAS, generar, haversineKm, tipoSiguiente, parseDiasCerrados, addDays, diffDays, diaSemana, dateToIso, prepararClientes, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Routing = api;
})(typeof window !== 'undefined' ? window : globalThis);
