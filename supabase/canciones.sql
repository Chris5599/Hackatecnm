-- =====================================================================
--  SONORA · Solo quien compró una canción puede escucharla
--  Ejecutar en Supabase → SQL Editor, DESPUÉS de schema.sql.
--  No crea tablas. Se puede volver a ejecutar sin problema.
--
--  1. Oculta la columna songs.audio_url: el catálogo sigue siendo público
--     (título, precio, duración…), pero la dirección del audio ya no.
--  2. song_audio_url(id): devuelve el audio solo al que la compró
--     (o al dueño de la banda).
--  3. band_songs_audio(banda): el panel del artista obtiene los audios
--     de SUS canciones.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. El catálogo se puede leer, pero sin audio_url
-- ---------------------------------------------------------------------
revoke select on public.songs from anon, authenticated;

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'songs' and column_name <> 'audio_url';
  execute format('grant select (%s) on public.songs to anon, authenticated', cols);
end $$;

-- ---------------------------------------------------------------------
-- 2. Audio de una canción: solo si la compraste o es de tu banda
-- ---------------------------------------------------------------------
create or replace function public.song_audio_url(p_song_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.audio_url
    from public.songs s
   where s.id = p_song_id
     and (
       exists (select 1 from public.song_purchases p
                where p.song_id = s.id and p.user_id = auth.uid())
       or public.owns_band(s.band_id)
     )
$$;

revoke all on function public.song_audio_url(text) from public;
grant execute on function public.song_audio_url(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Panel del artista: audios de todas las canciones de su banda
-- ---------------------------------------------------------------------
create or replace function public.band_songs_audio(p_band_id text)
returns table (song_id text, audio_url text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.audio_url
    from public.songs s
   where s.band_id = p_band_id
     and public.owns_band(p_band_id)
$$;

revoke all on function public.band_songs_audio(text) from public;
grant execute on function public.band_songs_audio(text) to authenticated;

-- Avisa a la API de Supabase que cambiaron los permisos
notify pgrst, 'reload schema';
