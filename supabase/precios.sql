-- =====================================================================
--  SONORA · Ajuste de precios (tarifa por hora, MXN)
--  Ejecutar en Supabase → SQL Editor. Se puede correr más de una vez.
--  Base: ~$400 por integrante por hora, más extra para metales/tuba
--  y mariachi de gala. Las reservas ya hechas conservan su total.
-- =====================================================================
begin;

-- Tabla de la app (de aquí salen los precios y el total de cada reserva)
update public.bands as b set hourly_rate = v.tarifa
  from (values
    ('los-plebes-del-cerro-grande', 1200),   -- Los Plebes del Cerro Grande: Trío sierreño, 3 integrantes (antes $2,100)
    ('los-de-la-cantera', 1500),   -- Los de la Cantera: Sierreño con tuba, 4 integrantes (antes $2,900)
    ('los-cardenales-del-chuviscar', 1600),   -- Los Cardenales del Chuviscar: Norteño tradicional, 4 integrantes (antes $2,250)
    ('rodeo-614', 1700),   -- Rodeo 614: Country / norteño, 4 integrantes (antes $4,000)
    ('conjunto-rio-sacramento', 2000),   -- Conjunto Río Sacramento: Norteño con sax, 5 integrantes (antes $4,500)
    ('los-reyes-de-la-20', 2000),   -- Los Reyes de la 20: Cumbia norteña, 5 integrantes (antes $3,500)
    ('grupo-alianza-614', 2200),   -- Grupo Alianza 614: Norteño versátil (repertorio amplio), 5 integrantes (antes $4,900)
    ('mariachi-los-dorados', 2600),   -- Mariachi Los Dorados: Mariachi de gala, 6 integrantes (antes $3,000)
    ('escuadron-del-desierto', 2700),   -- Escuadrón del Desierto: Norteño-banda con tuba, 6 integrantes (antes $5,500)
    ('banda-la-calicanto', 3200)    -- Banda La Calicanto: Banda sinaloense (metales), 5 integrantes (antes $8,750)
  ) as v(id, tarifa)
 where b.id = v.id;

-- Tabla del equipo "bandas" (si la banda está registrada con el mismo nombre)
update public.bandas as x set tarifa_hora = b.hourly_rate
  from public.bands as b
 where lower(trim(x.nombre_banda)) = lower(trim(b.name));

commit;

-- Verificación
select name, genre, hourly_rate from public.bands order by hourly_rate;
