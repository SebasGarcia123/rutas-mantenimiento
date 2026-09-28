const XLSX = require('xlsx');
let s = 42; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
// nucleos de clientes: [lat, lon, n] (incluye CABA, GBA en las 3 direcciones y algunos "Lejana" mas alla de Zárate/Pilar/La Plata/Luján)
const nuc = [
  [-34.60,-58.44,60],[-34.472,-58.527,40],[-34.526,-58.477,25],[-34.760,-58.402,35],[-34.663,-58.365,20],[-34.653,-58.619,30],[-34.720,-58.254,15],[-34.611,-58.373,20],
  [-34.098,-59.024,6],[-34.458,-58.914,6],[-34.921,-57.953,6],[-34.570,-59.105,6]
];
const rows = []; let n = 1000;
const pad = (x)=>String(x).padStart(2,'0');
const f = (d)=>`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
const dias = ['', '', '', 'Sábado', 'Domingo', 'Lunes', 'Sábado y Domingo'];
const hor = ['', '', '9 a 13', '8 a 17', '14 a 18', '10 a 12 y 15 a 18'];
for (const [la, lo, k] of nuc) for (let i=0;i<k;i++) {
  const cl = i % 4 === 0; // cluster denso
  const lat = la + (rnd()-.5)*(cl?0.008:0.09), lon = lo + (rnd()-.5)*(cl?0.008:0.09);
  const h = Math.floor(rnd()*4); // 0..3 historial
  const base = new Date(2026, 6, 1 + Math.floor(rnd()*60));
  const tipos = ['Express','Express','Profundo'];
  const r = { 'ID': 'P' + (n++), 'Latitud': lat.toFixed(6).replace('.',','), 'Longitud': lon.toFixed(6).replace('.',','), 'Nombre del cliente': 'Cliente ' + n, 'Fecha último mantenimiento 1':'', 'Tipo 1':'', 'Fecha último mantenimiento 2':'','Tipo 2':'','Fecha último mantenimiento 3':'','Tipo 3':'', 'Días cerrados': dias[Math.floor(rnd()*dias.length)], 'Horario': hor[Math.floor(rnd()*hor.length)] };
  for (let j=0;j<h;j++){ const d=new Date(base); d.setDate(d.getDate()-60*j); r[`Fecha último mantenimiento ${j+1}`]=f(d); r[`Tipo ${j+1}`]=tipos[(j+ (h))%3===2?2:0]; }
  rows.push(r);
}
const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
XLSX.writeFile(wb, 'ejemplo-clientes.xlsx'); console.log(rows.length, 'clientes');
