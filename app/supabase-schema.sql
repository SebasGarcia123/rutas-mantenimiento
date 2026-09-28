-- Ejecutar completo en Supabase > SQL Editor > New query > Run

create table if not exists clientes (
  codigo_persat text primary key,
  x double precision,            -- longitud
  y double precision,            -- latitud
  nombre text,
  dias_cerrados text default '',
  horario text default '',
  updated_at timestamptz default now()
);

-- Historial de mantenimientos realizados (se usan los ultimos 3 por cliente)
create table if not exists historial (
  id bigint generated always as identity primary key,
  codigo_persat text not null references clientes(codigo_persat) on delete cascade,
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
