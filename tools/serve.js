const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.xlsx':'application/octet-stream'};
http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/app/index.html';const f=path.join(root,p);if(!f.startsWith(root)||!fs.existsSync(f)){s.writeHead(404);return s.end();}s.writeHead(200,{'Content-Type':types[path.extname(f)]||'text/plain','Cache-Control':'no-store'});fs.createReadStream(f).pipe(s);}).listen(5174);
