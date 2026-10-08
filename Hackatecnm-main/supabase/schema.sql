-- =====================================================================
--  SONORA · Esquema para Supabase (PostgreSQL)
--  Ejecuta este archivo completo en: Supabase → SQL Editor → New query
--  Después ejecuta seed.sql para cargar las 6 bandas de ejemplo.
--
--  Se puede volver a ejecutar sin perder datos: si ya lo corriste antes,
--  córrelo otra vez para agregar el reparto 95/5 y las reglas de agenda.
-- =====================================================================

-- Reparto de cada pago: porcentaje que recibe la banda o artista.
-- El resto (5 %) va a la cooperación.
create or replace function public.artist_share()
returns numeric
language sql
immutable
as $$ select 0.95::numeric $$;

-- ---------------------------------------------------------------------
-- 1. PERFILES (1 a 1 con auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrarse (correo, Google o invitado)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      initcap(split_part(coalesce(new.email, ''), '@', 1)),
      'Invitado'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. CATÁLOGO: BANDAS, PAQUETES Y CANCIONES
-- ---------------------------------------------------------------------
create table if not exists public.bands (
  id                 text primary key,              -- slug, ej. 'son-de-mexico'
  name               text not null,
  genre              text not null,
  rating             numeric(2,1) not null default 0 check (rating between 0 and 5),
  reviews            integer not null default 0,
  hourly_rate        integer not null check (hourly_rate > 0),   -- MXN
  successful_events  integer not null default 0,
  years_active       integer not null default 0,
  bio                text,
  cover              text,
  avatar             text,
  sections           text[] not null default '{}',  -- 'talento' | 'tradiciones' | 'nuevas'
  availability       text[] not null default '{}',  -- ej. {'Viernes','Sábado'}
  created_at         timestamptz not null default now()
);

create table if not exists public.packages (
  id          text primary key,
  band_id     text not null references public.bands (id) on delete cascade,
  label       text not null,
  hours       integer not null check (hours between 1 and 12),
  perks       text[] not null default '{}',
  popular     boolean not null default false,
  sort_order  integer not null default 0
);
create index if not exists packages_band_idx on public.packages (band_id);

create table if not exists public.songs (
  id          text primary key,
  band_id     text not null references public.bands (id) on delete cascade,
  title       text not null,
  duration    text,                 -- '3:12'
  plays       text,                 -- '128K'
  price       integer not null default 20,  -- MXN
  audio_url   text,                 -- opcional: URL del audio (Storage)
  sort_order  integer not null default 0
);
create index if not exists songs_band_idx on public.songs (band_id);

-- ---------------------------------------------------------------------
-- 3. RESERVAS
-- ---------------------------------------------------------------------
create table if not exists public.bookings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  band_id     text not null references public.bands (id),
  event_date  date not null,
  event_time  text not null,                         -- '18:00'
  hours       integer not null check (hours between 1 and 8),
  address     text not null check (char_length(trim(address)) >= 5),
  total       integer not null default 0,            -- calculado por trigger
  status      text not null default 'confirmada'
              check (status in ('confirmada', 'completada', 'cancelada')),
  created_at  timestamptz not null default now()
);
create index if not exists bookings_user_idx on public.bookings (user_id, event_date);
create index if not exists bookings_band_date_idx on public.bookings (band_id, event_date) where status = 'confirmada';

-- Reparto del total del evento
alter table public.bookings add column if not exists artist_amount integer not null default 0;  -- 95 % banda
alter table public.bookings add column if not exists coop_amount   integer not null default 0;  -- 5 % cooperación

-- Ya no se maneja anticipo: se paga el total del evento
alter table public.bookings drop column if exists deposit;

-- El precio y el reparto se calculan en el servidor: el cliente no puede alterarlos.
-- Además se validan las reglas de agenda (excepciones).
create or replace function public.bookings_compute_amounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b           public.bands%rowtype;
  day_names   text[] := array['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  weekday     text;
  start_hour  integer;
  avail       text[];
begin
  select * into b from public.bands where id = new.band_id;
  if not found then
    raise exception 'Banda no encontrada';
  end if;

  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.status  := 'confirmada';
  end if;

  -- Validaciones solo al crear o al cambiar fecha/horario/horas
  if tg_op = 'INSERT'
     or new.event_date is distinct from old.event_date
     or new.event_time is distinct from old.event_time
     or new.hours      is distinct from old.hours then

    -- 1. Fecha no pasada
    if new.event_date < current_date then
      raise exception 'La fecha del evento no puede ser en el pasado.';
    end if;

    -- 2. Día de la semana dentro de la disponibilidad de la banda
    weekday := day_names[extract(dow from new.event_date)::int + 1];
    select array_agg(translate(lower(trim(x)), 'áéíóúü', 'aeiouu'))
      into avail
      from unnest(b.availability) as x;
    if coalesce(array_length(avail, 1), 0) > 0 and not (weekday = any (avail)) then
      raise exception '% no se presenta ese día. Disponible: %.',
        b.name, array_to_string(b.availability, ', ');
    end if;

    -- 3. Horario de inicio entre 12:00 y 21:00 y fin a más tardar 23:00
    if new.event_time !~ '^\d{1,2}:\d{2}$' then
      raise exception 'Horario inválido.';
    end if;
    start_hour := split_part(new.event_time, ':', 1)::int;
    if start_hour < 12 or start_hour > 21 then
      raise exception 'El horario de inicio debe ser entre 12:00 y 21:00.';
    end if;
    if start_hour + new.hours > 23 then
      raise exception 'El evento debe terminar a más tardar a las 23:00.';
    end if;

    -- 4. Mismo día: al menos 2 horas de anticipación (hora de México)
    if new.event_date = (now() at time zone 'America/Mexico_City')::date
       and start_hour < extract(hour from (now() at time zone 'America/Mexico_City'))::int + 2 then
      raise exception 'Para hoy, reserva con al menos 2 horas de anticipación.';
    end if;

    -- 5. La banda no puede tener dos eventos el mismo día
    if exists (
      select 1 from public.bookings o
       where o.band_id = new.band_id
         and o.event_date = new.event_date
         and o.status = 'confirmada'
         and o.id <> new.id
    ) then
      raise exception 'La banda ya tiene un evento ese día. Elige otra fecha.';
    end if;
  end if;

  -- Montos
  new.total         := new.hours * b.hourly_rate;
  new.coop_amount   := round(new.total * (1 - public.artist_share()));
  new.artist_amount := new.total - new.coop_amount;
  return new;
end;
$$;

drop trigger if exists bookings_amounts on public.bookings;
create trigger bookings_amounts
  before insert or update of hours, band_id, event_date, event_time on public.bookings
  for each row execute function public.bookings_compute_amounts();

-- Fechas ocupadas de una banda (sin exponer datos de otros clientes)
create or replace function public.band_booked_dates(p_band_id text)
returns setof date
language sql
stable
security definer
set search_path = public
as $$
  select distinct event_date
    from public.bookings
   where band_id = p_band_id
     and status = 'confirmada'
     and event_date >= current_date
   order by event_date
$$;
grant execute on function public.band_booked_dates(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. COMPRAS DEL BAZAR DIGITAL
-- ---------------------------------------------------------------------
create table if not exists public.song_purchases (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id     text not null references public.songs (id) on delete cascade,
  price       integer not null default 0,     -- se copia de songs.price
  created_at  timestamptz not null default now(),
  primary key (user_id, song_id)
);

alter table public.song_purchases add column if not exists artist_amount integer not null default 0;  -- 95 %
alter table public.song_purchases add column if not exists coop_amount   integer not null default 0;  -- 5 %

create or replace function public.song_purchases_set_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  select price into new.price from public.songs where id = new.song_id;
  if new.price is null then
    raise exception 'Canción no encontrada';
  end if;
  new.coop_amount   := round(new.price * (1 - public.artist_share()));
  new.artist_amount := new.price - new.coop_amount;
  return new;
end;
$$;

drop trigger if exists song_purchases_price on public.song_purchases;
create trigger song_purchases_price
  before insert on public.song_purchases
  for each row execute function public.song_purchases_set_price();

-- ---------------------------------------------------------------------
-- 5. SEGURIDAD A NIVEL DE FILA (RLS)
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.bands          enable row level security;
alter table public.packages       enable row level security;
alter table public.songs          enable row level security;
alter table public.bookings       enable row level security;
alter table public.song_purchases enable row level security;

-- Catálogo: lectura pública
drop policy if exists "bands_read"    on public.bands;
drop policy if exists "packages_read" on public.packages;
drop policy if exists "songs_read"    on public.songs;
create policy "bands_read"    on public.bands    for select using (true);
create policy "packages_read" on public.packages for select using (true);
create policy "songs_read"    on public.songs    for select using (true);

-- Perfil: cada quien el suyo
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Reservas: ver, crear y cancelar las propias
drop policy if exists "bookings_select_own" on public.bookings;
drop policy if exists "bookings_insert_own" on public.bookings;
drop policy if exists "bookings_cancel_own" on public.bookings;
create policy "bookings_select_own" on public.bookings
  for select using (auth.uid() = user_id);
create policy "bookings_insert_own" on public.bookings
  for insert with check (auth.uid() = user_id);
-- Solo se permite actualizar para marcar como cancelada
create policy "bookings_cancel_own" on public.bookings
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'cancelada');

-- Compras: ver y crear las propias
drop policy if exists "purchases_select_own" on public.song_purchases;
drop policy if exists "purchases_insert_own" on public.song_purchases;
create policy "purchases_select_own" on public.song_purchases
  for select using (auth.uid() = user_id);
create policy "purchases_insert_own" on public.song_purchases
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 6. RESUMEN DE INGRESOS (para reportes del lado de la banda / cooperación)
-- ---------------------------------------------------------------------
create or replace view public.band_earnings
with (security_invoker = true) as
select
  b.id                                             as band_id,
  b.name                                           as band_name,
  coalesce(sum(bk.artist_amount), 0)               as bookings_artist,
  coalesce(sum(bk.coop_amount), 0)                 as bookings_coop,
  coalesce((select sum(sp.artist_amount) from public.song_purchases sp
             join public.songs s on s.id = sp.song_id where s.band_id = b.id), 0) as music_artist,
  coalesce((select sum(sp.coop_amount) from public.song_purchases sp
             join public.songs s on s.id = sp.song_id where s.band_id = b.id), 0) as music_coop
from public.bands b
left join public.bookings bk on bk.band_id = b.id and bk.status <> 'cancelada'
group by b.id, b.name;
-- Nota: con security_invoker y RLS, cada usuario solo suma sus propios registros.
-- Para ver el total real consúltala desde el panel de Supabase (rol de servicio).

-- Recalcula el reparto de reservas y compras que ya existían
update public.bookings
   set coop_amount   = round(total * (1 - public.artist_share())),
       artist_amount = total - round(total * (1 - public.artist_share()))
 where coop_amount = 0 and total > 0;
update public.song_purchases
   set coop_amount   = round(price * (1 - public.artist_share())),
       artist_amount = price - round(price * (1 - public.artist_share()))
 where coop_amount = 0 and price > 0;

-- =====================================================================
-- 7. PANEL DEL ARTISTA
--    Dueño de la banda, integrantes con porcentajes, canciones subidas
--    por la banda y hash de cada pago para la trazabilidad en blockchain.
-- =====================================================================

-- 7.1 Dueño de la banda (cuenta del artista que la administra)
alter table public.bands add column if not exists owner_id uuid references auth.users (id) on delete set null;
create index if not exists bands_owner_idx on public.bands (owner_id);

create or replace function public.owns_band(p_band_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.bands where id = p_band_id and owner_id = auth.uid())
$$;
grant execute on function public.owns_band(text) to authenticated;

-- El artista no puede asignarse calificación, reseñas ni eventos; la portada
-- y la sección se ponen por defecto si no las envía.
create or replace function public.bands_protect()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then   -- SQL Editor / service role: sin restricciones
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.owner_id          := auth.uid();
    new.rating            := 0;
    new.reviews           := 0;
    new.successful_events := 0;
    if coalesce(array_length(new.sections, 1), 0) = 0 then
      new.sections := array['nuevas'];
    end if;
    if new.cover is null or new.cover = '' then
      new.cover := 'https://picsum.photos/seed/' || new.id || '-cover/800/500';
    end if;
    if new.avatar is null or new.avatar = '' then
      new.avatar := 'https://picsum.photos/seed/' || new.id || '-avatar/200/200';
    end if;
  else
    new.owner_id          := old.owner_id;
    new.rating            := old.rating;
    new.reviews           := old.reviews;
    new.successful_events := old.successful_events;
    new.sections          := old.sections;
  end if;
  return new;
end;
$$;

drop trigger if exists bands_protect on public.bands;
create trigger bands_protect
  before insert or update on public.bands
  for each row execute function public.bands_protect();

-- Paquetes por defecto para que la banda nueva se pueda reservar de inmediato
create or replace function public.bands_default_packages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.packages where band_id = new.id) then
    insert into public.packages (id, band_id, label, hours, perks, popular, sort_order) values
      (new.id || '-p1', new.id, 'Básico',   2, array['2 horas de show en vivo'], false, 0),
      (new.id || '-p2', new.id, 'Estándar', 3, array['3 horas de show en vivo', 'Equipo de sonido incluido'], true, 1),
      (new.id || '-p3', new.id, 'Completo', 5, array['5 horas de show en vivo', 'Equipo de sonido incluido', 'Repertorio a solicitud'], false, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists bands_default_packages on public.bands;
create trigger bands_default_packages
  after insert on public.bands
  for each row execute function public.bands_default_packages();

drop policy if exists "bands_insert_owner" on public.bands;
drop policy if exists "bands_update_owner" on public.bands;
create policy "bands_insert_owner" on public.bands
  for insert to authenticated with check (owner_id = auth.uid());
create policy "bands_update_owner" on public.bands
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 7.2 Integrantes y su porcentaje del 95 % que recibe la banda
create table if not exists public.band_members (
  id          uuid primary key default gen_random_uuid(),
  band_id     text not null references public.bands (id) on delete cascade,
  name        text not null check (char_length(trim(name)) >= 2),
  role        text,
  share       numeric(5,2) not null check (share > 0 and share <= 100),
  wallet      text check (wallet is null or wallet ~ '^0x[0-9a-fA-F]{40}$'),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists band_members_band_idx on public.band_members (band_id);
alter table public.band_members enable row level security;

drop policy if exists "members_select_owner" on public.band_members;
create policy "members_select_owner" on public.band_members
  for select to authenticated using (public.owns_band(band_id));

-- Guarda todos los integrantes de una vez y exige que sumen 100 %
create or replace function public.save_band_members(p_band_id text, p_members jsonb)
returns setof public.band_members
language plpgsql
security definer
set search_path = public
as $$
declare
  total numeric;
begin
  if not public.owns_band(p_band_id) then
    raise exception 'No tienes permiso para editar esta banda.';
  end if;
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0 then
    raise exception 'Agrega al menos un integrante.';
  end if;
  select sum((m ->> 'share')::numeric) into total from jsonb_array_elements(p_members) m;
  if total <> 100 then
    raise exception 'Los porcentajes deben sumar 100%%; ahora suman % %%.', total;
  end if;

  delete from public.band_members where band_id = p_band_id;
  insert into public.band_members (band_id, name, role, share, wallet, sort_order)
  select p_band_id,
         trim(m ->> 'name'),
         nullif(trim(m ->> 'role'), ''),
         (m ->> 'share')::numeric,
         nullif(trim(m ->> 'wallet'), ''),
         (t.ord - 1)::int
    from jsonb_array_elements(p_members) with ordinality as t(m, ord);

  return query select * from public.band_members where band_id = p_band_id order by sort_order;
end;
$$;
grant execute on function public.save_band_members(text, jsonb) to authenticated;

-- 7.3 Canciones subidas por la banda
alter table public.songs alter column id set default ('s-' || substr(md5(random()::text), 1, 12));
alter table public.songs add column if not exists published boolean not null default true;
alter table public.songs alter column plays set default '0';

drop policy if exists "songs_insert_owner" on public.songs;
drop policy if exists "songs_update_owner" on public.songs;
create policy "songs_insert_owner" on public.songs
  for insert to authenticated with check (public.owns_band(band_id));
create policy "songs_update_owner" on public.songs
  for update to authenticated using (public.owns_band(band_id)) with check (public.owns_band(band_id));
-- Las canciones no se borran (perderían su historial de ventas): se ocultan con published = false.

-- Archivos de audio: bucket público "songs", carpeta = id de la banda
insert into storage.buckets (id, name, public)
values ('songs', 'songs', true)
on conflict (id) do nothing;

drop policy if exists "songs_files_upload_owner" on storage.objects;
drop policy if exists "songs_files_delete_owner" on storage.objects;
create policy "songs_files_upload_owner" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'songs' and public.owns_band((storage.foldername(name))[1]));
create policy "songs_files_delete_owner" on storage.objects
  for delete to authenticated
  using (bucket_id = 'songs' and public.owns_band((storage.foldername(name))[1]));

-- 7.4 Ingresos: el artista ve las reservas y ventas de SU banda
drop policy if exists "bookings_select_band_owner" on public.bookings;
create policy "bookings_select_band_owner" on public.bookings
  for select to authenticated using (public.owns_band(band_id));

drop policy if exists "purchases_select_band_owner" on public.song_purchases;
create policy "purchases_select_band_owner" on public.song_purchases
  for select to authenticated
  using (exists (select 1 from public.songs s where s.id = song_id and public.owns_band(s.band_id)));

-- 7.5 Trazabilidad: hash de la transacción en blockchain
--     Lo escribe el servicio que registra el pago en la cadena (rol de servicio).
--     Mientras sea null, el panel lo muestra como "Pendiente de registro".
alter table public.bookings       add column if not exists tx_hash text;
alter table public.song_purchases add column if not exists tx_hash text;

-- Solo el servicio puede escribir tx_hash (desde el navegador se ignora)
create or replace function public.protect_tx_hash()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.tx_hash := case when tg_op = 'UPDATE' then old.tx_hash else null end;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_protect_tx on public.bookings;
create trigger bookings_protect_tx
  before insert or update on public.bookings
  for each row execute function public.protect_tx_hash();

drop trigger if exists purchases_protect_tx on public.song_purchases;
create trigger purchases_protect_tx
  before insert or update on public.song_purchases
  for each row execute function public.protect_tx_hash();
