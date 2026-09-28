/* Capa de datos: Supabase (nube) si config.js esta completo; si no, localStorage (solo este navegador). */
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const usaNube = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
  let sb = null;
  if (usaNube) sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

  const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
  const ck = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };

  /* --- filas <-> objetos de la app --- */
  const cliToRow = (c) => ({ codigo_persat: c.codigo, x: c.x, y: c.y, nombre: c.nombre, dias_cerrados: c.diasCerrados || '', horario: c.horario || '' });
  const rowToCli = (r) => ({ codigo: r.codigo_persat, x: r.x, y: r.y, nombre: r.nombre, diasCerrados: r.dias_cerrados || '', horario: r.horario || '' });
  const pedToRow = (p) => ({
    codigo_persat: p.codigo, tipo_ruta: p.tipoRuta, num_ruta: p.numRuta, tipo_mantenimiento: p.tipoMant, zona: p.zona,
    orden: p.orden, fecha_programada: p.fechaProgramada, obs: p.obs || '', estado: p.estado || 'Pendiente',
    fecha_realizado: p.fechaRealizado || null, tipo_realizado: p.tipoRealizado || null
  });
  const rowToPed = (r) => ({
    codigo: r.codigo_persat, tipoRuta: r.tipo_ruta, numRuta: r.num_ruta, tipoMant: r.tipo_mantenimiento, zona: r.zona,
    orden: r.orden, fechaProgramada: r.fecha_programada, obs: r.obs || '', estado: r.estado,
    fechaRealizado: r.fecha_realizado, tipoRealizado: r.tipo_realizado
  });

  /* ===================== Modo nube ===================== */
  const nube = {
    async getClientes() {
      const out = []; let from = 0;
      for (;;) { const d = ck(await sb.from('clientes').select('*').range(from, from + 999)); out.push(...d); if (d.length < 1000) break; from += 1000; }
      return out.map(rowToCli);
    },
    async upsertClientes(list) { for (const c of chunk(list.map(cliToRow), 500)) ck(await sb.from('clientes').upsert(c)); },
    async getHistorial() {
      const out = []; let from = 0;
      for (;;) { const d = ck(await sb.from('historial').select('codigo_persat,fecha,tipo').range(from, from + 999)); out.push(...d); if (d.length < 1000) break; from += 1000; }
      return out.map((r) => ({ codigo: r.codigo_persat, fecha: r.fecha, tipo: r.tipo || '' }));
    },
    async addHistorial(list) {
      const rows = list.map((h) => ({ codigo_persat: h.codigo, fecha: h.fecha, tipo: h.tipo || '' }));
      for (const c of chunk(rows, 500)) ck(await sb.from('historial').upsert(c, { onConflict: 'codigo_persat,fecha' }));
    },
    async removeHistorial(codigo, fecha) { ck(await sb.from('historial').delete().eq('codigo_persat', codigo).eq('fecha', fecha)); },
    async getPedidos() {
      const out = []; let from = 0;
      for (;;) { const d = ck(await sb.from('mantenimientos').select('*').range(from, from + 999)); out.push(...d); if (d.length < 1000) break; from += 1000; }
      return out.map(rowToPed);
    },
    async replacePedidos(list, soloPendientes) {
      // borra pedidos (todos o solo pendientes) e inserta los nuevos
      let q = sb.from('mantenimientos').delete();
      q = soloPendientes ? q.eq('estado', 'Pendiente') : q.neq('codigo_persat', '');
      ck(await q);
      for (const c of chunk(list.map(pedToRow), 500)) ck(await sb.from('mantenimientos').upsert(c));
    },
    async updatePedido(codigo, patch) {
      const m = { estado: 'estado', fechaRealizado: 'fecha_realizado', tipoRealizado: 'tipo_realizado' };
      const row = {}; Object.keys(patch).forEach((k) => { row[m[k]] = patch[k]; });
      ck(await sb.from('mantenimientos').update(row).eq('codigo_persat', codigo));
    },
    async clearPedidos() { ck(await sb.from('mantenimientos').delete().neq('codigo_persat', '')); },
    // borra clientes, historial y mantenimientos (historial/mantenimientos caen solos por la referencia "on delete cascade" del esquema)
    async clearTodo() { ck(await sb.from('clientes').delete().neq('codigo_persat', '')); },
    // autenticacion
    async sesion() { const { data } = await sb.auth.getSession(); return data.session; },
    async login(email, password) { const r = await sb.auth.signInWithPassword({ email, password }); if (r.error) throw new Error(r.error.message); },
    async logout() { await sb.auth.signOut(); }
  };

  /* ===================== Modo local ===================== */
  const K = { c: 'gp_clientes', h: 'gp_historial', p: 'gp_mantenimientos' };
  const rd = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
  const wr = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const local = {
    async getClientes() { return rd(K.c); },
    async upsertClientes(list) { const m = new Map(rd(K.c).map((c) => [c.codigo, c])); list.forEach((c) => m.set(c.codigo, c)); wr(K.c, [...m.values()]); },
    async getHistorial() { return rd(K.h); },
    async addHistorial(list) {
      const m = new Map(rd(K.h).map((h) => [h.codigo + '|' + h.fecha, h]));
      list.forEach((h) => m.set(h.codigo + '|' + h.fecha, { codigo: h.codigo, fecha: h.fecha, tipo: h.tipo || '' }));
      wr(K.h, [...m.values()]);
    },
    async removeHistorial(codigo, fecha) { wr(K.h, rd(K.h).filter((h) => !(h.codigo === codigo && h.fecha === fecha))); },
    async getPedidos() { return rd(K.p); },
    async replacePedidos(list, soloPendientes) {
      const keep = soloPendientes ? rd(K.p).filter((p) => p.estado !== 'Pendiente') : [];
      wr(K.p, keep.concat(list));
    },
    async updatePedido(codigo, patch) { wr(K.p, rd(K.p).map((p) => (p.codigo === codigo ? Object.assign(p, patch) : p))); },
    async clearPedidos() { wr(K.p, []); },
    async clearTodo() { wr(K.c, []); wr(K.h, []); wr(K.p, []); },
    async sesion() { return true; },
    async login() {}, async logout() {}
  };

  window.DB = Object.assign({ usaNube }, usaNube ? nube : local);
})();
