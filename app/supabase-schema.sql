-- Ejecutar completo en Supabase > SQL Editor > New query > Run

create table if not exists clientes (
  codigo_persat text primary key,
  x double precision,            -- longitud
  y double precision,            -- latitud
  nombre text,
  dias_cerrados text default '',
  horario text default '',
  inhabilitado boolean default false,   -- estado de deuda 'Inhabilitado': el mantenimiento sale Express con la leyenda 'Cliente inhabilitado'
  updated_at timestamptz default now()
);

-- Historial de mantenimientos realizados (se usan los ultimos 3 por cliente).
-- codigo_persat es texto libre, SIN referencia a "clientes": "Cerrar ciclo" borra todos los clientes
-- pero conserva el historial de los ultimos 180 dias, para que si el cliente vuelve a aparecer en el
-- proximo Excel no pierda el criterio Express/Profundo por el que va.
create table if not exists historial (
  id bigint generated always as identity primary key,
  codigo_persat text not null,
  fecha date not null,
  tipo text default '',
  unique (codigo_persat, fecha)
);

-- Pedidos del ciclo actual (se limpia manualmente cada ~2 meses con "Cerrar ciclo")
create table if not exists mantenimientos (
  codigo_persat text primary key references clientes(codigo_persat) on delete cascade,
  tipo_ruta text,
  num_ruta int,
  tipo_mantenimiento text,
  zona text,
  orden int,
  fecha_programada date,
  obs text default '',
  estado text default 'Pendiente',
  fecha_realizado date,
  tipo_realizado text
);

-- Seguridad: solo usuarios logueados pueden leer/escribir
alter table clientes enable row level security;
alter table historial enable row level security;
alter table mantenimientos enable row level security;

create policy "auth all" on clientes for all to authenticated using (true) with check (true);
create policy "auth all" on historial for all to authenticated using (true) with check (true);
create policy "auth all" on mantenimientos for all to authenticated using (true) with check (true);

-- Si la base ya estaba creada antes de agregar la columna, correr esto una sola vez:
-- alter table clientes add column if not exists inhabilitado boolean default false;
