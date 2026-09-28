/* Motor de ruteo. Funciona en navegador (window.Routing) y en Node (module.exports). */
(function (root) {
  'use strict';

  const DEFAULTS = {
    centro: { lat: -34.5990, lon: -58.4400 },   // Palermo - Villa Crespo: punto de convergencia de las 3 zonas
    // Localidades de referencia. La zona de cada cliente es la del punto de este listado mas cercano.
    // CABA: microcentro/Retiro/Puerto Madero/Recoleta y alrededores -> Sur; Belgrano/Nuñez/Saavedra/Palermo -> Norte; el resto -> Centro (se reparte con el balanceo).
    // GBA: se usa la Zona Norte/Sur/Oeste habitual del Gran Buenos Aires (Oeste se muestra como "Centro" para no romper la nomenclatura Norte/Sur/Centro del resto de la app).
    // Lejana: localidades mas alla del Gran Buenos Aires (no participan del reparto igualitario entre Norte/Sur/Centro).
    zonaPuntos: [
      // --- CABA: Sur (microcentro / Retiro / Puerto Madero / Recoleta y alrededores) ---
      { nombre: 'Retiro', lat: -34.5925, lon: -58.3746, zona: 'Sur' },
      { nombre: 'San Nicolás (Microcentro)', lat: -34.6037, lon: -58.3816, zona: 'Sur' },
      { nombre: 'Monserrat', lat: -34.6117, lon: -58.3816, zona: 'Sur' },
      { nombre: 'Puerto Madero', lat: -34.6111, lon: -58.3630, zona: 'Sur' },
      { nombre: 'Recoleta', lat: -34.5875, lon: -58.3974, zona: 'Sur' },
      { nombre: 'San Telmo', lat: -34.6211, lon: -58.3731, zona: 'Sur' },
      { nombre: 'Constitución', lat: -34.6257, lon: -58.3808, zona: 'Sur' },
      { nombre: 'Balvanera', lat: -34.6083, lon: -58.3987, zona: 'Sur' },
      // --- CABA: Norte (Belgrano / Nuñez / Saavedra / Palermo) ---
      { nombre: 'Belgrano', lat: -34.5601, lon: -58.4562, zona: 'Norte' },
      { nombre: 'Núñez', lat: -34.5453, lon: -58.4634, zona: 'Norte' },
      { nombre: 'Saavedra', lat: -34.5556, lon: -58.4869, zona: 'Norte' },
      // --- CABA: Centro (el resto de los barrios; Palermo queda afuera de la lista a proposito: es zona limitrofe,
      //     su cliente se asigna segun a que otro barrio/localidad le quede geograficamente mas cerca) ---
      { nombre: 'Colegiales', lat: -34.5745, lon: -58.4507, zona: 'Centro' },
      { nombre: 'Coghlan', lat: -34.5626, lon: -58.4652, zona: 'Centro' },
      { nombre: 'Villa Urquiza', lat: -34.5709, lon: -58.4926, zona: 'Centro' },
      { nombre: 'Chacarita', lat: -34.5869, lon: -58.4526, zona: 'Centro' },
      { nombre: 'Villa Crespo', lat: -34.5996, lon: -58.4392, zona: 'Centro' },
      { nombre: 'Paternal', lat: -34.5936, lon: -58.4661, zona: 'Centro' },
      { nombre: 'Agronomía', lat: -34.5928, lon: -58.4869, zona: 'Centro' },
      { nombre: 'Parque Chas', lat: -34.5847, lon: -58.4772, zona: 'Centro' },
      { nombre: 'Villa Ortúzar', lat: -34.5799, lon: -58.4674, zona: 'Centro' },
      { nombre: 'Villa Pueyrredón', lat: -34.5834, lon: -58.5023, zona: 'Centro' },
      { nombre: 'Villa del Parque', lat: -34.6021, lon: -58.4931, zona: 'Centro' },
      { nombre: 'Villa Devoto', lat: -34.5989, lon: -58.5228, zona: 'Centro' },
      { nombre: 'Villa Santa Rita', lat: -34.6157, lon: -58.4933, zona: 'Centro' },
      { nombre: 'Monte Castro', lat: -34.6187, lon: -58.5087, zona: 'Centro' },
      { nombre: 'Vélez Sarsfield', lat: -34.6291, lon: -58.4963, zona: 'Centro' },
      { nombre: 'Villa Luro', lat: -34.6383, lon: -58.5040, zona: 'Centro' },
      { nombre: 'Floresta', lat: -34.6290, lon: -58.4690, zona: 'Centro' },
      { nombre: 'Versalles', lat: -34.6323, lon: -58.5251, zona: 'Centro' },
      { nombre: 'Liniers', lat: -34.6435, lon: -58.5228, zona: 'Centro' },
      { nombre: 'Mataderos', lat: -34.6598, lon: -58.5030, zona: 'Centro' },
      { nombre: 'Villa Lugano', lat: -34.6779, lon: -58.4744, zona: 'Centro' },
      { nombre: 'Villa Riachuelo', lat: -34.6879, lon: -58.4636, zona: 'Centro' },
      { nombre: 'Villa Soldati', lat: -34.6672, lon: -58.4392, zona: 'Centro' },
      { nombre: 'Nueva Pompeya', lat: -34.6478, lon: -58.4223, zona: 'Centro' },
      { nombre: 'Parque Patricios', lat: -34.6362, lon: -58.4038, zona: 'Centro' },
      { nombre: 'Boedo', lat: -34.6295, lon: -58.4176, zona: 'Centro' },
      { nombre: 'Caballito', lat: -34.6180, lon: -58.4407, zona: 'Centro' },
      { nombre: 'Almagro', lat: -34.6083, lon: -58.4210, zona: 'Centro' },
      { nombre: 'San Cristóbal', lat: -34.6198, lon: -58.4008, zona: 'Centro' },
      { nombre: 'Barracas', lat: -34.6459, lon: -58.3872, zona: 'Centro' },
      { nombre: 'Parque Chacabuco', lat: -34.6376, lon: -58.4363, zona: 'Centro' },
      { nombre: 'Flores', lat: -34.6289, lon: -58.4633, zona: 'Centro' },
      // --- Gran Buenos Aires: Zona Norte ---
      { nombre: 'Vicente López', lat: -34.5260, lon: -58.4770, zona: 'Norte' },
      { nombre: 'San Isidro', lat: -34.4720, lon: -58.5270, zona: 'Norte' },
      { nombre: 'San Fernando', lat: -34.4410, lon: -58.5590, zona: 'Norte' },
      { nombre: 'Tigre', lat: -34.4260, lon: -58.5800, zona: 'Norte' },
      { nombre: 'Nordelta', lat: -34.4010, lon: -58.6520, zona: 'Norte' },
      { nombre: 'San Miguel', lat: -34.5430, lon: -58.7120, zona: 'Norte' },
      { nombre: 'José C. Paz', lat: -34.5120, lon: -58.7660, zona: 'Norte' },
      { nombre: 'Malvinas Argentinas (Tortuguitas)', lat: -34.4700, lon: -58.7350, zona: 'Norte' },
      { nombre: 'Escobar', lat: -34.3490, lon: -58.7910, zona: 'Norte' },
      { nombre: 'Pilar', lat: -34.4580, lon: -58.9140, zona: 'Norte' },
      { nombre: 'General San Martín', lat: -34.5750, lon: -58.5370, zona: 'Norte' },
      // --- Gran Buenos Aires: Zona Oeste (se guarda como "Centro") ---
      { nombre: 'Tres de Febrero (Caseros)', lat: -34.6010, lon: -58.5630, zona: 'Centro' },
      { nombre: 'Hurlingham', lat: -34.5910, lon: -58.6370, zona: 'Centro' },
      { nombre: 'Ituzaingó', lat: -34.6600, lon: -58.6710, zona: 'Centro' },
      { nombre: 'Morón', lat: -34.6530, lon: -58.6190, zona: 'Centro' },
      { nombre: 'Merlo', lat: -34.6650, lon: -58.7280, zona: 'Centro' },
      { nombre: 'Moreno', lat: -34.6340, lon: -58.7920, zona: 'Centro' },
      { nombre: 'La Matanza (San Justo)', lat: -34.6790, lon: -58.5630, zona: 'Centro' },
      { nombre: 'General Rodríguez', lat: -34.6060, lon: -58.9580, zona: 'Centro' },
      { nombre: 'Marcos Paz', lat: -34.7800, lon: -58.8410, zona: 'Centro' },
      { nombre: 'Luján', lat: -34.5700, lon: -59.1050, zona: 'Centro' },
      // --- Gran Buenos Aires: Zona Sur ---
      { nombre: 'Avellaneda', lat: -34.6630, lon: -58.3650, zona: 'Sur' },
      { nombre: 'Lanús', lat: -34.7060, lon: -58.3940, zona: 'Sur' },
      { nombre: 'Lomas de Zamora', lat: -34.7600, lon: -58.4020, zona: 'Sur' },
      { nombre: 'Quilmes', lat: -34.7200, lon: -58.2540, zona: 'Sur' },
      { nombre: 'Almirante Brown (Adrogué)', lat: -34.7990, lon: -58.3930, zona: 'Sur' },
      { nombre: 'Esteban Echeverría (Monte Grande)', lat: -34.8120, lon: -58.4620, zona: 'Sur' },
      { nombre: 'Ezeiza', lat: -34.8480, lon: -58.5310, zona: 'Sur' },
      { nombre: 'Florencio Varela', lat: -34.8220, lon: -58.2760, zona: 'Sur' },
      { nombre: 'Berazategui', lat: -34.7660, lon: -58.2120, zona: 'Sur' },
      { nombre: 'San Vicente', lat: -35.0300, lon: -58.4230, zona: 'Sur' },
      { nombre: 'Presidente Perón (Guernica)', lat: -34.9750, lon: -58.5540, zona: 'Sur' },
      { nombre: 'La Plata', lat: -34.9210, lon: -57.9530, zona: 'Sur' },
      { nombre: 'Berisso', lat: -34.8760, lon: -57.8840, zona: 'Sur' },
      { nombre: 'Ensenada', lat: -34.8550, lon: -57.9120, zona: 'Sur' },
      // --- Lejana: mas alla del Gran Buenos Aires ---
      { nombre: 'Zárate', lat: -34.0980, lon: -59.0240, zona: 'Lejana' },
      { nombre: 'Campana', lat: -34.1640, lon: -58.9580, zona: 'Lejana' },
      { nombre: 'Exaltación de la Cruz (Los Cardales)', lat: -34.2220, lon: -59.0780, zona: 'Lejana' },
      { nombre: 'San Andrés de Giles', lat: -34.4430, lon: -59.4410, zona: 'Lejana' },
      { nombre: 'Mercedes', lat: -34.6510, lon: -59.4310, zona: 'Lejana' },
      { nombre: 'Navarro', lat: -35.0050, lon: -59.2720, zona: 'Lejana' },
      { nombre: 'Cañuelas', lat: -35.0520, lon: -58.7600, zona: 'Lejana' },
      { nombre: 'Lobos', lat: -35.1860, lon: -59.0980, zona: 'Lejana' },
      { nombre: 'General Las Heras', lat: -34.9290, lon: -58.9430, zona: 'Lejana' },
      { nombre: 'Chascomús', lat: -35.5750, lon: -58.0140, zona: 'Lejana' },
      { nombre: 'Magdalena', lat: -35.0870, lon: -57.5160, zona: 'Lejana' },
      { nombre: 'Brandsen', lat: -35.1660, lon: -58.2300, zona: 'Lejana' },
      { nombre: 'Suipacha', lat: -34.7670, lon: -59.6740, zona: 'Lejana' },
      { nombre: 'Chivilcoy', lat: -34.8970, lon: -60.0170, zona: 'Lejana' },
      { nombre: 'Carmen de Areco', lat: -34.3970, lon: -59.8270, zona: 'Lejana' },
      { nombre: 'Junín', lat: -34.5840, lon: -60.9490, zona: 'Lejana' },
      { nombre: 'Baradero', lat: -33.8080, lon: -59.5070, zona: 'Lejana' },
      { nombre: 'San Pedro', lat: -33.6780, lon: -59.6630, zona: 'Lejana' },
      { nombre: 'San Nicolás', lat: -33.3360, lon: -60.2130, zona: 'Lejana' },
      { nombre: 'Salto', lat: -34.2930, lon: -60.2530, zona: 'Lejana' }
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

  /* La zona de cada cliente arranca siendo la del punto de cfg.zonaPuntos (barrios de CABA + partidos del Gran
     Buenos Aires + localidades "Lejana") mas cercano. Con eso ya queda asignada Lejana (no participa del reparto).
     Para Norte/Sur/Centro no alcanza con repartir la MISMA CANTIDAD DE CLIENTES: tambien tienen que quedar
     con la misma cantidad de rutas a pie entre si (y por lo tanto, ya con eso, tambien la misma cantidad en
     camioneta). Por eso primero se detectan los grupos de 6 clientes a <=300m entre si SIN importar la zona,
     se balancea la CANTIDAD DE GRUPOS entre las tres zonas moviendolos enteros (nunca se separa un grupo), y
     recien despues se reparten los clientes sueltos, moviendo de a uno los mas "al borde" hacia la zona con
     menos clientes, hasta que el total tambien quede lo mas parejo posible entre las tres. */
  function asignarZonas(clientes, cfg) {
    const puntos = cfg.zonaPuntos, zonas3 = ['Norte', 'Sur', 'Centro'];
    function dist3(pt) {
      const d = {};
      puntos.forEach((p) => { const dd = haversineKm(pt, p); if (!(p.zona in d) || dd < d[p.zona]) d[p.zona] = dd; });
      return d;
    }
    function masCercana(d) { return Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b)); }
    function masCercana3(d) { return zonas3.reduce((a, b) => (d[a] <= d[b] ? a : b)); }
    function balancear(items, cuenta, tamano) {
      let guard = 0;
      while (guard++ < items.length * 2) {
        const max = zonas3.reduce((a, b) => (cuenta[a] >= cuenta[b] ? a : b));
        const min = zonas3.reduce((a, b) => (cuenta[a] <= cuenta[b] ? a : b));
        if (cuenta[max] - cuenta[min] <= tamano) break;
        let cand = null, costo = Infinity;
        items.forEach((it) => {
          if (it._zona !== max) return;
          const k = it._dist3[min] - it._dist3[max];
          if (k < costo) { costo = k; cand = it; }
        });
        if (!cand) break;
        cuenta[max] -= tamano; cand._zona = min; cuenta[min] += tamano;
      }
    }

    // 1) Lejana (no entra en el reparto) vs. el resto
    const libres = [];
    clientes.forEach((c) => {
      const d = dist3(c);
      if (masCercana(d) === 'Lejana') { c.zona = 'Lejana'; return; }
      c._dist3 = d; libres.push(c);
    });

    // 2) grupos "a pie" (>=6 a <=300m) detectados sin distinguir zona, para poder balancear la cantidad de rutas a pie
    const pool = libres.slice().sort((a, b) => b.dist - a.dist);
    const usados = new Set(), descartados = new Set(), grupos = [];
    pool.forEach((start) => {
      if (usados.has(start.codigo) || descartados.has(start.codigo)) return;
      const g = crecer(start, pool, new Set(usados), cfg.walkSize, cfg.walkMaxM / 1000);
      if (g.length === cfg.walkSize) { g.forEach((c) => usados.add(c.codigo)); grupos.push(g); } else descartados.add(start.codigo);
    });
    grupos.forEach((g) => {
      const centroide = { lat: g.reduce((s, c) => s + c.lat, 0) / g.length, lon: g.reduce((s, c) => s + c.lon, 0) / g.length };
      g._dist3 = dist3(centroide);
      g._zona = masCercana3(g._dist3);
    });
    const cuentaGrupos = {}; zonas3.forEach((z) => { cuentaGrupos[z] = 0; });
    grupos.forEach((g) => cuentaGrupos[g._zona]++);
    balancear(grupos, cuentaGrupos, 1);

    // 3) fijar la zona de los clientes agrupados (van todos juntos) y sacarlos del reparto individual
    const enGrupo = new Set();
    grupos.forEach((g) => { g.forEach((c) => { c.zona = g._zona; enGrupo.add(c.codigo); }); });
    const sueltos = libres.filter((c) => !enGrupo.has(c.codigo));
    sueltos.forEach((c) => { c._zona = masCercana3(c._dist3); });

    // 4) balancear la cantidad TOTAL de clientes por zona (arrancando desde lo que ya aportaron los grupos)
    const cuenta = {}; zonas3.forEach((z) => { cuenta[z] = cuentaGrupos[z] * cfg.walkSize; });
    sueltos.forEach((c) => cuenta[c._zona]++);
    balancear(sueltos, cuenta, 1);
    sueltos.forEach((c) => { c.zona = c._zona; });

    libres.forEach((c) => { delete c._dist3; delete c._zona; });
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
