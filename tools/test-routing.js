const XLSX = require('xlsx'); const R = require('../app/js/routing.js');
const wb = XLSX.readFile('ejemplo-clientes.xlsx'); const rows = XLSX.utils.sheet_to_json(wb.Sheets.Clientes, {defval:''});
const num = (v)=>Number(String(v).replace(',','.'));
const parse = (s)=>{const [d,m,y]=s.split('/');return `${y}-${m}-${d}`};
const cl = rows.map(r=>({codigo:r['ID'], y:num(r['Latitud']), x:num(r['Longitud']), nombre:r['Nombre del cliente'], diasCerrados:r['Días cerrados'], horario:r['Horario'],
 historial:[1,2,3].filter(i=>r['Fecha último mantenimiento '+i]).map(i=>({fecha:parse(r['Fecha último mantenimiento '+i]), tipo:r['Tipo '+i]}))}));
console.time('gen'); const out = R.generar(cl,{cicloInicio:'2026-09-28'}); console.timeEnd('gen');
console.log(out.resumen, out.avisos);
const rutas = {}; out.pedidos.forEach(p=>{const k=p.numRuta+'/'+p.tipoRuta+'/'+p.zona; (rutas[k]=rutas[k]||[]).push(p)});
const sizes = {}; Object.entries(rutas).forEach(([k,v])=>{const t=k.split('/')[1]; sizes[t+v.length]=(sizes[t+v.length]||0)+1});
console.log('tamaños de ruta', sizes);
console.log(Object.keys(rutas).slice(0,12).map(k=>k+' '+rutas[k][0].fechaProgramada).join('\n'));
console.log('codigos unicos', new Set(out.pedidos.map(p=>p.codigo)).size, 'de', cl.length);
