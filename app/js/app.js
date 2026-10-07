(function () {
  'use strict';
  const R = window.Routing;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtF = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

  /* ---------------- Estado ---------------- */
  const S = { clientes: new Map(), historial: new Map(), pedidos: [], vista: 'ambas', sel: null, selRuta: null };
  const CFG_KEY = 'gp_cfg';
  const cfgGuardada = () => { try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { return {}; } };
  const getCfg = () => {
    const c = Object.assign({}, cfgGuardada());
    if (!c.cicloInicio) c.cicloInicio = hoy();
    return c;
  };

  function toast(msg, ms = 3500) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
  }
  async function conEspera(btn, fn) {
    btn.disabled = true;
    try { await fn(); } catch (e) { console.error(e); alert('Error: ' + e.message); } finally { btn.disabled = false; }
  }

  /* ---------------- Carga de datos ---------------- */
  async function cargar() {
    const [cl, hi, pe] = await Promise.all([DB.getClientes(), DB.getHistorial(), DB.getPedidos()]);
    S.clientes = new Map(cl.map((c) => [c.codigo, c]));
    S.historial = new Map();
    hi.forEach((h) => { if (!S.historial.has(h.codigo)) S.historial.set(h.codigo, []); S.historial.get(h.codigo).push(h); });
    S.historial.forEach((arr) => arr.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)));
    S.pedidos = pe;
    render();
  }
  const ultimos3 = (codigo) => (S.historial.get(codigo) || []).slice(0, 3);

  /* ---------------- Importacion de Excel ---------------- */
  const clave = (s) => R.norm(s).replace(/[^a-z0-9]/g, '');
  function num(v) {
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).trim().replace(',', '.'));
    return isNaN(n) ? NaN : n;
  }
  function fechasDeCelda(v) {
    // devuelve [{fecha:'YYYY-MM-DD', tipo}] de una celda (numero de serie, Date o texto con una o mas fechas)
    const out = [];
    const tipoDe = (t) => { t = R.norm(t || ''); return t.startsWith('prof') ? 'Profundo' : t.startsWith('exp') ? 'Express' : ''; };
    if (v === '' || v == null) return out;
    if (typeof v === 'number') { out.push({ fecha: new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10), tipo: '' }); return out; }
    if (v instanceof Date) { out.push({ fecha: R.dateToIso(new Date(v.getTime() + 12 * 3600e3)), tipo: '' }); return out; }
    const re = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\s*[-:(]?\s*(express|exp|profundo|prof)?/gi;
    let m;
    while ((m = re.exec(String(v)))) {
      let y, mo, d;
      if (m[1]) { y = +m[1]; mo = +m[2]; d = +m[3]; } else { d = +m[4]; mo = +m[5]; y = +m[6]; if (y < 100) y += 2000; }
      out.push({ fecha: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, tipo: tipoDe(m[7]) });
    }
    return out;
  }

  function parseExcel(rows) {
    const errores = [], clientes = [], historial = [];
    if (!rows.length) return { clientes, historial, errores: ['El archivo no tiene filas.'] };
    const heads = Object.keys(rows[0]);
    const H = heads.map((h) => ({ h, k: clave(h) }));
    const find = (fn) => (H.find(fn) || {}).h;
    const cCod = find((x) => /persat|^codigo|^id$/.test(x.k));
    // nombres actuales: Latitud / Longitud. Se acepta también el formato viejo (Coordenada X = longitud, Coordenada Y = latitud) por compatibilidad.
    const cLat = find((x) => /^latitud$|^lat$|coordenaday/.test(x.k));
    const cLon = find((x) => /^longitud$|^lon$|coordenadax/.test(x.k));
    const formatoViejo = !!(cLon && clave(cLon) === clave('Coordenada X'));
    const cNom = find((x) => /nombre|cliente/.test(x.k));
    const cDias = find((x) => /cerrad/.test(x.k));
    const cHor = find((x) => /horario/.test(x.k));
    // "ULT. MANT" (ultimo mantenimiento) y "FECHA INSTAL." (instalacion): solo se usan como punto de partida
    // para un cliente que todavia no tiene historial (ver importar). El resto de las columnas con "fecha"/"ultimo"
    // en el nombre se siguen leyendo como historial, salvo las de instalacion, proximo y cambio (no son visitas).
    const cUlt = find((x) => /^ultmant/.test(x.k));
    const cInst = find((x) => /^fechainstal|^instalacion/.test(x.k));
    const cFechas = H.filter((x) => /(fecha|ultim|mantenim)/.test(x.k) && !/tipo|instal|prox|cambio/.test(x.k) && x.h !== cCod && x.h !== cUlt && x.h !== cInst).map((x) => x.h);
    const cTipos = H.filter((x) => /tipo/.test(x.k) && !/ruta/.test(x.k)).map((x) => x.h);
    if (!cCod || !cLat || !cLon) return { clientes, historial, errores: ['Faltan columnas obligatorias: ID, Latitud, Longitud.'] };
    // "Estado de deuda" (o, si no existe esa columna, "ESTADO"): si dice "Inhabilitado" el mantenimiento sale Express con la leyenda "Cliente inhabilitado"
    const cDeuda = find((x) => /^estadodedeuda|^estadodeuda|^deuda/.test(x.k)) || find((x) => /^estado$/.test(x.k));
    const hoyIso = hoy();
    const fechaValida = (v) => { const f = fechasDeCelda(v)[0]; return f && +f.fecha.slice(0, 4) >= 2000 && f.fecha <= hoyIso ? f.fecha : null; };
    const referencias = [];

    rows.forEach((r, i) => {
      const fila = i + 2;
      const codigo = String(r[cCod]).trim();
      if (!codigo) return;
      let y = num(r[cLat]), x = num(r[cLon]);
      if (isNaN(x) || isNaN(y)) { errores.push(`Fila ${fila} (${codigo}): coordenadas inválidas.`); return; }
      if (formatoViejo && Math.abs(x) < Math.abs(y)) [x, y] = [y, x]; // formato viejo: X = longitud (~-58), Y = latitud (~-34)
      if (y < -56 || y > -21 || x < -74 || x > -53) { errores.push(`Fila ${fila} (${codigo}): coordenadas fuera de Argentina (lat ${y}, lon ${x}).`); return; }
      const inhabilitado = cDeuda ? R.norm(r[cDeuda]).trim().startsWith('inhabilit') : false;
      clientes.push({ codigo, x, y, nombre: cNom ? String(r[cNom]).trim() : codigo, diasCerrados: cDias ? String(r[cDias]).trim() : '', horario: cHor ? String(r[cHor]).trim() : '', inhabilitado });
      // historial: ultimas 3 fechas; el tipo puede venir en columnas "Tipo" (mismo orden) o dentro del texto de la celda
      const hs = [];
      cFechas.forEach((col, idx) => {
        const fs = fechasDeCelda(r[col]);
        fs.forEach((f) => { if (!f.tipo && cTipos[idx]) f.tipo = R.norm(r[cTipos[idx]]).startsWith('prof') ? 'Profundo' : R.norm(r[cTipos[idx]]).startsWith('exp') ? 'Express' : ''; hs.push(f); });
      });
      hs.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 3).forEach((f) => historial.push({ codigo, fecha: f.fecha, tipo: f.tipo }));
      // fechas de referencia del Excel (ULT. MANT y FECHA INSTAL.); importar decide cuando usarlas segun el historial de la base
      referencias.push({ codigo, ult: cUlt ? fechaValida(r[cUlt]) : null, inst: cInst ? fechaValida(r[cInst]) : null, conHistArchivo: hs.length > 0 });
    });
    return { clientes, historial, referencias, errores };
  }

  async function importar(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
    const { clientes, historial, referencias, errores } = parseExcel(rows);
    if (!clientes.length) { alert(errores.join('\n') || 'No se encontraron clientes.'); return; }
    // Primera vez (cliente sin historial en la base): ULT. MANT; si esa celda esta vacia es un cliente nuevo -> FECHA INSTAL.
    // Desde la segunda vez: se usa el historial de la base y, si el ULT. MANT del Excel es una visita mas reciente que la
    // ultima registrada (hecha por fuera de la herramienta), se suma al historial. Si coincide (+/- TOL dias) con una ya
    // registrada no se duplica. Su tipo se infiere en el motor segun la posicion en el ciclo Express, Express, Profundo.
    const TOL = 5, primera = getCfg().tipoPrimeraVez || R.DEFAULTS.tipoPrimeraVez;
    const semillas = []; let nuevos = 0, desdeUlt = 0, actualizados = 0;
    (referencias || []).forEach((rf) => {
      if (rf.conHistArchivo) return;
      const hist = S.historial.get(rf.codigo) || [];
      if (!hist.length) {
        if (rf.ult) { semillas.push({ codigo: rf.codigo, fecha: rf.ult, tipo: '' }); desdeUlt++; }
        else if (rf.inst) { semillas.push({ codigo: rf.codigo, fecha: rf.inst, tipo: 'Instalación' }); nuevos++; }
      } else if (rf.ult && rf.ult > R.addDays(hist[0].fecha, TOL)) {
        // si lo unico que habia era la instalacion, esta primera visita fue del tipo "primera vez"
        const soloInstalacion = hist.every((h) => R.norm(h.tipo).startsWith('instal'));
        semillas.push({ codigo: rf.codigo, fecha: rf.ult, tipo: soloInstalacion ? primera : '' }); actualizados++;
      }
    });
    await DB.upsertClientes(clientes);
    await DB.addHistorial(historial.concat(semillas));
    await cargar();
    const inhab = clientes.filter((c) => c.inhabilitado).length;
    let msg = `${clientes.length} clientes importados.`;
    if (desdeUlt || nuevos) msg += ` ${desdeUlt} con último mantenimiento del Excel, ${nuevos} nuevos (fecha de instalación).`;
    if (actualizados) msg += ` ${actualizados} con un último mantenimiento más reciente que el historial.`;
    if (inhab) msg += ` ${inhab} inhabilitados.`;
    if (DB.faltaColumnaInhabilitado) alert('Falta correr el SQL de la columna "inhabilitado" en Supabase (ver app/supabase-schema.sql). Los clientes inhabilitados NO se guardaron como tales.');
    if (errores.length) msg += ` ${errores.length} filas con problemas (ver consola).`;
    if (errores.length) console.warn(errores.join('\n'));
    toast(msg);
    mostrarAvisos(errores.length ? [`${errores.length} filas no se importaron:`, ...errores.slice(0, 8), errores.length > 8 ? '…' : ''] : []);
    if (!S.pedidos.length || confirm('Ya existen rutas. ¿Recalcular las rutas pendientes con los datos importados?')) await recalcular();
  }

  /* ---------------- Ruteo ---------------- */
  async function recalcular() {
    const realizados = S.pedidos.filter((p) => p.estado === 'Realizado');
    const hechos = new Set(realizados.map((p) => p.codigo));
    const numeroInicial = realizados.length ? Math.max(...realizados.map((p) => p.numRuta)) + 1 : 1;
    const lista = [...S.clientes.values()].filter((c) => !hechos.has(c.codigo)).map((c) => Object.assign({}, c, { historial: ultimos3(c.codigo) }));
    if (!lista.length) { toast('No hay clientes pendientes para rutear.'); return; }
    const out = R.generar(lista, Object.assign(getCfg(), { numeroInicial }));
    await DB.replacePedidos(out.pedidos, true);
    await cargar();
    const r = out.resumen;
    toast(`Rutas generadas: ${r.rutasAPie} a pie, ${r.rutasCamioneta} en camioneta, ${r.dias} días.`);
    mostrarAvisos(out.avisos);
  }
  function mostrarAvisos(list) {
    $('avisos').innerHTML = list.filter(Boolean).length ? `<div class="aviso">${list.filter(Boolean).map(esc).join('<br>')}</div>` : '';
  }

  /* ---------------- Filtrado y render ---------------- */
  function filtrados() {
    const q = R.norm($('fBuscar').value).trim();
    const est = $('fEstado').value, zona = $('fZona').value, tipoRuta = $('fTipoRuta').value;
    const rows = [];
    S.pedidos.forEach((p) => {
      const c = S.clientes.get(p.codigo); if (!c) return;
      if (est !== 'Todas' && p.estado !== est) return;
      if (zona && p.zona !== zona) return;
      if (tipoRuta && p.tipoRuta !== tipoRuta) return;
      if (q && !(R.norm(c.nombre).includes(q) || R.norm(p.codigo).includes(q))) return;
      rows.push({ p, c });
    });
    rows.sort((a, b) => a.p.numRuta - b.p.numRuta || (a.p.tipoRuta === b.p.tipoRuta ? 0 : a.p.tipoRuta === 'A pie' ? -1 : 1) || a.p.orden - b.p.orden);
    return rows;
  }

  function render() {
    const rows = filtrados();
    const total = S.pedidos.length, hechos = S.pedidos.filter((p) => p.estado === 'Realizado').length;
    $('contador').textContent = `${rows.length} mostrados · ${hechos}/${total} realizados`;
    $('vacio').classList.toggle('hidden', total > 0);
    $('tabla').classList.toggle('hidden', total === 0);
    $('tabla').querySelector('tbody').innerHTML = rows.map(({ p, c }) => {
      const hist = ultimos3(p.codigo).map((h) => `${fmtF(h.fecha)}${h.tipo ? ' (' + esc(h.tipo) + ')' : ''}`).join('<br>');
      const done = p.estado === 'Realizado';
      return `<tr class="${done ? 'done' : 'pend'}${S.sel === p.codigo ? ' sel' : ''}" data-cod="${esc(p.codigo)}">
        <td>${esc(p.codigo)}</td>
        <td><b>${esc(c.nombre)}</b>${p.obs ? `<div class="obs">${esc(p.obs)}</div>` : ''}</td>
        <td>${esc(p.zona)}</td><td>${esc(p.tipoRuta)}</td><td>${p.numRuta}</td><td>${p.orden}</td>
        <td>${esc(p.tipoMant)}</td>
        <td>${fmtF(p.fechaProgramada)}</td>
        <td class="small">${hist || '—'}</td>
        <td class="small">${esc(c.diasCerrados)}</td><td class="small">${esc(c.horario)}</td>
        <td class="estado">${done ? 'Realizado<div class="small">' + fmtF(p.fechaRealizado) + ' · ' + esc(p.tipoRealizado || '') + '</div>' : 'Pendiente'}</td>
        <td>${done ? `<button class="btn" data-undo="${esc(p.codigo)}">Deshacer</button>` : `<button class="btn primary" data-cumplir="${esc(p.codigo)}">Cumplir</button>`}</td>
      </tr>`;
    }).join('');
    dibujarMapa(rows);
  }

  /* ---------------- Mapa ---------------- */
  let map, capa, marcadores = new Map(), rutas = new Map(); // rutas: "tipoRuta|numRuta" -> { polyline, marcadores:[codigo,...], bounds }
  function initMapa() {
    map = L.map('mapa').setView([-34.6, -58.44], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    capa = L.layerGroup().addTo(map);
    map.on('zoomend', actualizarEtiquetas);
  }
  function actualizarEtiquetas() {
    const mostrar = map.getZoom() >= 14;
    marcadores.forEach((m) => { const t = m.getTooltip(); if (t) { t.options.permanent = mostrar; m.unbindTooltip(); m.bindTooltip(t._content, { permanent: mostrar, direction: 'top', className: 'nombre', offset: [0, -4] }); } });
  }
  const claveRuta = (p) => p.tipoRuta + '|' + p.numRuta;
  let primeraVez = true;
  function dibujarMapa(rows) {
    if (!map) return;
    capa.clearLayers(); marcadores = new Map(); rutas = new Map();
    const porRuta = new Map();
    const bounds = [];
    const permanente = map.getZoom() >= 14;
    rows.forEach(({ p, c }) => {
      const done = p.estado === 'Realizado';
      const color = done ? '#2e7d32' : '#d32f2f';
      const m = L.circleMarker([c.y, c.x], { radius: 7, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 0.95 }).addTo(capa);
      m.bindTooltip(esc(c.nombre), { permanent: permanente, direction: 'top', className: 'nombre', offset: [0, -4] });
      m.bindPopup(`<b>${esc(c.nombre)}</b><br>${esc(p.codigo)}<br>${esc(p.tipoRuta)} ${p.numRuta} · orden ${p.orden} · ${esc(p.zona)}<br>${esc(p.tipoMant)} · ${fmtF(p.fechaProgramada)}<br>${esc(c.diasCerrados ? 'Cerrado: ' + c.diasCerrados : '')}<br>${esc(c.horario ? 'Horario: ' + c.horario : '')}<br>${p.obs ? '<b>' + esc(p.obs) + '</b><br>' : ''}` +
        (done ? `<b style="color:#2e7d32">Realizado ${fmtF(p.fechaRealizado)}</b>` : `<button data-cumplir="${esc(p.codigo)}">Cumplir</button>`));
      m.on('click', () => seleccionar(p.codigo, false));
      marcadores.set(p.codigo, m);
      bounds.push([c.y, c.x]);
      const k = claveRuta(p);
      if (!porRuta.has(k)) porRuta.set(k, { tipo: p.tipoRuta, pts: [], codigos: [] });
      porRuta.get(k).pts.push({ o: p.orden, ll: [c.y, c.x] });
      porRuta.get(k).codigos.push(p.codigo);
    });
    porRuta.forEach((r, k) => {
      const pts = r.pts.sort((a, b) => a.o - b.o).map((x) => x.ll);
      let polyline = null;
      if (pts.length > 1) polyline = L.polyline(pts, { color: r.tipo === 'A pie' ? '#1565c0' : '#ef6c00', weight: 2, opacity: 0.6, dashArray: r.tipo === 'A pie' ? '4 4' : null }).addTo(capa);
      rutas.set(k, { polyline, codigos: r.codigos, bounds: pts });
    });
    if (bounds.length && (primeraVez || $('fBuscar').value || $('fEstado').value !== 'Todas' || $('fZona').value || $('fTipoRuta').value)) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 }); primeraVez = false;
    }
    resaltarRuta(S.selRuta);
  }
  /* Resalta (o desmarca, si key es null) la ruta indicada: linea mas gruesa y marcadores con borde azul. */
  function resaltarRuta(key) {
    rutas.forEach((r, k) => {
      const activa = k === key;
      if (r.polyline) r.polyline.setStyle({ weight: activa ? 5 : 2, opacity: activa ? 0.95 : 0.6 });
      if (r.polyline && activa) r.polyline.bringToFront();
      r.codigos.forEach((cod) => {
        const m = marcadores.get(cod);
        if (!m) return;
        m.setStyle({ color: activa ? '#1f6feb' : '#fff', weight: activa ? 3 : 1.5, radius: activa ? 9 : 7 });
        if (activa) m.bringToFront();
      });
    });
  }
  function seleccionar(codigo, mover = true) {
    S.sel = codigo;
    const p = S.pedidos.find((x) => x.codigo === codigo);
    S.selRuta = p ? claveRuta(p) : null;
    document.querySelectorAll('#tabla tbody tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.cod === codigo));
    const tr = document.querySelector(`#tabla tbody tr[data-cod="${CSS.escape(codigo)}"]`);
    if (tr && !mover) tr.scrollIntoView({ block: 'nearest' });
    resaltarRuta(S.selRuta);
    if (mover && $('main').className !== 'lista') {
      const r = S.selRuta && rutas.get(S.selRuta);
      const m = marcadores.get(codigo);
      if (r && r.bounds.length > 1) map.fitBounds(r.bounds, { padding: [40, 40], maxZoom: 16 });
      else if (m) map.setView(m.getLatLng(), Math.max(map.getZoom(), 15));
      if (m) m.openPopup();
    }
  }

  /* ---------------- Cumplir / deshacer ---------------- */
  let cumplirCod = null;
  function abrirCumplir(codigo) {
    const p = S.pedidos.find((x) => x.codigo === codigo), c = S.clientes.get(codigo);
    cumplirCod = codigo;
    $('cumplirTitulo').textContent = c ? c.nombre : codigo;
    $('cumplirFecha').value = hoy();
    $('cumplirTipo').value = p.tipoMant;
    $('dlgCumplir').showModal();
  }
  async function confirmarCumplir() {
    const p = S.pedidos.find((x) => x.codigo === cumplirCod);
    const fecha = $('cumplirFecha').value, tipo = $('cumplirTipo').value;
    if (!fecha) return;
    await DB.updatePedido(cumplirCod, { estado: 'Realizado', fechaRealizado: fecha, tipoRealizado: tipo });
    await DB.addHistorial([{ codigo: cumplirCod, fecha, tipo }]);
    Object.assign(p, { estado: 'Realizado', fechaRealizado: fecha, tipoRealizado: tipo });
    const h = S.historial.get(cumplirCod) || [];
    h.unshift({ codigo: cumplirCod, fecha, tipo }); h.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    S.historial.set(cumplirCod, h);
    render();
  }
  async function deshacer(codigo) {
    const p = S.pedidos.find((x) => x.codigo === codigo);
    if (!confirm('¿Volver este pedido a Pendiente y borrar su registro de historial?')) return;
    await DB.removeHistorial(codigo, p.fechaRealizado);
    await DB.updatePedido(codigo, { estado: 'Pendiente', fechaRealizado: null, tipoRealizado: null });
    S.historial.set(codigo, (S.historial.get(codigo) || []).filter((h) => h.fecha !== p.fechaRealizado));
    Object.assign(p, { estado: 'Pendiente', fechaRealizado: null, tipoRealizado: null });
    render();
  }

  /* ---------------- Exportacion ---------------- */
  function exportar() {
    if (!S.pedidos.length) { alert('No hay rutas para exportar.'); return; }
    const head = ['ID', 'Latitud', 'Longitud', 'Nombre del cliente', 'Tipo de ruta', 'Número de ruta', 'Tipo de mantenimiento',
      'Fecha últ. mant. 1', 'Tipo últ. mant. 1', 'Fecha últ. mant. 2', 'Tipo últ. mant. 2', 'Fecha últ. mant. 3', 'Tipo últ. mant. 3',
      'Días cerrados', 'Horario', 'Zona', 'Orden en ruta', 'Fecha programada', 'Estado', 'Fecha realizado', 'Observaciones'];
    const rows = filtradosTodos().map(({ p, c }) => {
      const h = ultimos3(p.codigo);
      return [p.codigo, c.y, c.x, c.nombre, p.tipoRuta, p.numRuta, p.tipoMant,
        ...[0, 1, 2].flatMap((i) => [h[i] ? fmtF(h[i].fecha) : '', h[i] ? h[i].tipo : '']),
        c.diasCerrados, c.horario, p.zona, p.orden, fmtF(p.fechaProgramada), p.estado, fmtF(p.fechaRealizado), p.obs];
    });
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
    ws['!cols'] = head.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Rutas');
    XLSX.writeFile(wb, `rutas_${hoy()}.xlsx`);
  }
  const filtradosTodos = () => S.pedidos.map((p) => ({ p, c: S.clientes.get(p.codigo) })).filter((x) => x.c)
    .sort((a, b) => a.p.numRuta - b.p.numRuta || (a.p.tipoRuta === b.p.tipoRuta ? 0 : a.p.tipoRuta === 'A pie' ? -1 : 1) || a.p.orden - b.p.orden);

  /* ---------------- Configuracion ---------------- */
  const CAMPOS = { cInicio: ['cicloInicio'], cLat: ['centro', 'lat'], cLon: ['centro', 'lon'], cWalk: ['walkMaxM'], cVel: ['velocidadKmh'], cJornada: ['jornadaMin'], cExp: ['minExpress'], cProf: ['minProfundo'], cObj: ['diasObjetivo'], cTol: ['tolerancia'], cPrimera: ['tipoPrimeraVez'] };
  const leer = (o, path) => path.reduce((a, k) => (a == null ? a : a[k]), o);
  function abrirConfig() {
    const cfg = Object.assign({}, R.DEFAULTS, getCfg()); cfg.centro = Object.assign({}, R.DEFAULTS.centro, getCfg().centro);
    Object.entries(CAMPOS).forEach(([id, path]) => { $(id).value = leer(cfg, path) ?? ''; });
    $('dlgConfig').showModal();
  }
  function guardarConfig() {
    const cfg = { centro: {} };
    Object.entries(CAMPOS).forEach(([id, path]) => {
      const raw = $(id).value; if (raw === '') return;
      const v = ['cicloInicio', 'tipoPrimeraVez'].includes(path[0]) ? raw : Number(raw);
      if (path.length === 2) cfg[path[0]][path[1]] = v; else cfg[path[0]] = v;
    });
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    toast('Parámetros guardados. Usá "Recalcular rutas" para aplicarlos.');
  }

  /* ---------------- Eventos ---------------- */
  function eventos() {
    $('btnImportar').onclick = () => $('fileInput').click();
    $('fileInput').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) conEspera($('btnImportar'), () => importar(f)); };
    $('btnExportar').onclick = exportar;
    $('btnRecalcular').onclick = () => conEspera($('btnRecalcular'), async () => {
      if (!S.clientes.size) { alert('Primero importá un Excel de clientes.'); return; }
      await recalcular();
    });
    $('btnCiclo').onclick = () => conEspera($('btnCiclo'), async () => {
      const DIAS_RETENER_HISTORIAL = 180;
      if (!confirm(`Esto borra todos los clientes y los pedidos del ciclo actual. Del historial se conservan los últimos ${DIAS_RETENER_HISTORIAL} días (por si algún cliente vuelve a aparecer en el próximo Excel), el resto se borra. No se puede deshacer. ¿Cerrar el ciclo?`)) return;
      const corte = R.addDays(hoy(), -DIAS_RETENER_HISTORIAL);
      await DB.clearPedidos(); await DB.clearClientes(); await DB.podarHistorial(corte); await cargar(); mostrarAvisos([]); S.sel = null; S.selRuta = null;
      toast(`Ciclo cerrado. Importá el Excel nuevo para cargar los clientes del ciclo siguiente (se conservó su historial de los últimos ${DIAS_RETENER_HISTORIAL} días).`);
    });
    $('btnConfig').onclick = abrirConfig;
    $('cfgCancelar').onclick = () => $('dlgConfig').close();
    $('cfgDefault').onclick = () => { localStorage.removeItem(CFG_KEY); $('dlgConfig').close(); toast('Parámetros restaurados.'); };
    $('formConfig').onsubmit = guardarConfig;
    $('cumplirCancelar').onclick = () => $('dlgCumplir').close();
    $('formCumplir').onsubmit = () => { confirmarCumplir().catch((e) => alert('Error: ' + e.message)); };
    ['fBuscar', 'fEstado', 'fZona', 'fTipoRuta'].forEach((id) => $(id).addEventListener('input', render));
    $('viewSeg').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      S.vista = b.dataset.v; $('main').className = S.vista;
      document.querySelectorAll('#viewSeg button').forEach((x) => x.classList.toggle('on', x === b));
      setTimeout(() => map.invalidateSize(), 50);
    };
    document.addEventListener('click', (e) => {
      const cu = e.target.closest('[data-cumplir]'); if (cu) { e.stopPropagation(); abrirCumplir(cu.dataset.cumplir); return; }
      const un = e.target.closest('[data-undo]'); if (un) { e.stopPropagation(); deshacer(un.dataset.undo).catch((er) => alert(er.message)); return; }
      const tr = e.target.closest('#tabla tbody tr'); if (tr) seleccionar(tr.dataset.cod, true);
    });
    $('btnLogout').onclick = async () => { await DB.logout(); location.reload(); };
  }

  /* ---------------- Inicio ---------------- */
  async function iniciar() {
    $('modo').textContent = DB.usaNube ? 'Base en la nube' : 'Modo local (sin nube)';
    $('modo').title = DB.usaNube ? '' : 'Los datos se guardan solo en este navegador. Configurá Supabase en config.js.';
    initMapa(); eventos();
    $('app').classList.remove('hidden');
    if (DB.usaNube) $('btnLogout').classList.remove('hidden');
    await cargar();
    setTimeout(() => map.invalidateSize(), 100);
  }

  (async function () {
    if (!DB.usaNube) { await iniciar(); return; }
    if (await DB.sesion()) { await iniciar(); return; }
    $('login').classList.remove('hidden');
    $('loginForm').onsubmit = async (e) => {
      e.preventDefault();
      try { await DB.login($('loginEmail').value, $('loginPass').value); $('login').classList.add('hidden'); await iniciar(); }
      catch (er) { $('loginErr').textContent = 'No se pudo ingresar: ' + er.message; }
    };
  })();
})();
