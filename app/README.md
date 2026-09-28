# Gestión de rutas de mantenimiento

Web estática (HTML + JS). No necesita servidor propio.

## Probar en local
Abrir `index.html` con un servidor estático (ej. `node ../tools/serve.js` y entrar a http://localhost:5173/app/index.html).
Sin configurar Supabase funciona en **modo local** (datos solo en ese navegador).

## Pasar a la nube (gratis)
1. Crear proyecto en https://supabase.com (plan Free).
2. SQL Editor → pegar y ejecutar `supabase-schema.sql`.
3. Authentication → Users → *Add user* (tu email y contraseña). Desactivar "Allow new users to sign up" en Authentication → Providers → Email.
4. Project Settings → API → copiar *Project URL* y *anon public key* en `config.js`.
5. Publicar la carpeta `app/` en un hosting estático gratuito (Cloudflare Pages, Netlify o GitHub Pages).

## Tablas
- `clientes`: datos del Excel.
- `historial`: mantenimientos realizados (se usan los últimos 3 por cliente).
- `mantenimientos`: pedidos del ciclo actual.
- "Cerrar ciclo" borra todos los pedidos del ciclo y, del historial, los mantenimientos de hace más de 180 días (se conservan los últimos ~6 meses para no perder el criterio Express/Profundo de los clientes que se repiten). Los clientes no se tocan.
