-- Datos de ejemplo (migrados de data/bands.json). Ejecutar después de schema.sql.
begin;

insert into public.bands (id,name,genre,rating,reviews,hourly_rate,successful_events,years_active,bio,cover,avatar,sections,availability) values
  ('son-de-mexico','Son de México','Mariachi Tradicional',4.9,182,1200,340,18,'Mariachi de tradición familiar que lleva más de 15 años musicalizando bodas, quinceañeras y serenatas con el sonido más auténtico de México.','https://picsum.photos/seed/son-cover/800/500','https://picsum.photos/seed/son-avatar/200/200',array['tradiciones']::text[],array['Viernes','Sábado','Domingo']::text[]),
  ('los-cometas','Los Cometas del Norte','Norteño',4.7,96,1000,210,12,'Norteño puro con acordeón y bajo sexto. Especialistas en bailes de caballo, fiestas patronales y reuniones familiares donde nadie se queda sentado.','https://picsum.photos/seed/cometas-cover/800/500','https://picsum.photos/seed/cometas-avatar/200/200',array['tradiciones']::text[],array['Jueves','Sábado']::text[]),
  ('vortice','Vórtice','Rock Alternativo',4.8,214,1500,415,7,'Rock alternativo con energía de estadio. Mezclan originals con covers de los 90 y 2000 para que tu evento suene potente de principio a fin.','https://picsum.photos/seed/vortice-cover/800/500','https://picsum.photos/seed/vortice-avatar/200/200',array['talento']::text[],array['Miércoles','Viernes','Sábado']::text[]),
  ('las-vibras','Las Vibras','Cumbia Sonidera',4.6,67,900,120,2,'Cumbia sonidera con sazón moderno. Un sonido fresco que mezcla lo clásico de los pueblos con beats que prenden cualquier pista.','https://picsum.photos/seed/vibras-cover/800/500','https://picsum.photos/seed/vibras-avatar/200/200',array['nuevas','talento']::text[],array['Sábado','Domingo']::text[]),
  ('neon-palido','Neón Pálido','Indie Pop',4.9,158,1100,260,4,'Indie pop melódico con sintetizadores y guitarras brillantes. Perfectos para bodas íntimas, cumpleaños y eventos de marca con onda.','https://picsum.photos/seed/neon-cover/800/500','https://picsum.photos/seed/neon-avatar/200/200',array['nuevas','talento']::text[],array['Viernes','Sábado','Domingo']::text[]),
  ('trio-azul','Trío Azul','Jazz Fusión',4.8,89,1300,150,10,'Jazz fusión con raíces mexicanas. Saxofón, contrabajo y batería en un viaje sonoro ideal para cenas elegantes y eventos corporativos.','https://picsum.photos/seed/trio-cover/800/500','https://picsum.photos/seed/trio-avatar/200/200',array['talento','nuevas']::text[],array['Jueves','Viernes','Sábado']::text[])
on conflict (id) do nothing;

insert into public.packages (id,band_id,label,hours,perks,popular,sort_order) values
  ('sm-p1','son-de-mexico','Serenata',2,array['2 horas de show en vivo','1 cambio de vestuario','Hasta 15 canciones a solicitud']::text[],false,0),
  ('sm-p2','son-de-mexico','Gala',3,array['3 horas de show en vivo','2 cambios de vestuario','Hasta 25 canciones a solicitud','Equipo de sonido incluido']::text[],true,1),
  ('sm-p3','son-de-mexico','Fiesta Completa',5,array['5 horas de show en vivo','3 cambios de vestuario','Repertorio ilimitado','Sesión de fotos con el grupo']::text[],false,2),
  ('lc-p1','los-cometas','Perronazo',2,array['2 horas de show en vivo','Acordeón y bajo sexto','Hasta 18 canciones']::text[],false,0),
  ('lc-p2','los-cometas','Rodeo',3,array['3 horas de show en vivo','Hasta 30 canciones','Equipo de sonido incluido','Paradas de bailes tradicionales']::text[],true,1),
  ('lc-p3','los-cometas','Maratón',5,array['5 horas de show en vivo','Repertorio ilimitado','2 equipos de sonido','Animación entre sets']::text[],false,2),
  ('vo-p1','vortice','Set Acústico',2,array['2 horas de show','Formación acústica (trío)','Hasta 20 canciones']::text[],false,0),
  ('vo-p2','vortice','Show Completo',3,array['3 horas de show con banda completa','Luces LED incluidas','Hasta 32 canciones','Equipo de sonido profesional']::text[],true,1),
  ('vo-p3','vortice','Festival',5,array['5 horas de show','2 sets + after party','Escenario y luces','Técnico de sonido incluido']::text[],false,2),
  ('vi-p1','las-vibras','Tarde de Sol',2,array['2 horas de show','Sonido y luces básicas','Hasta 20 canciones']::text[],false,0),
  ('vi-p2','las-vibras','Noche Vibrante',3,array['3 horas de show','Iluminación LED','Hasta 30 canciones','Hora feliz con dedicatorias']::text[],true,1),
  ('vi-p3','las-vibras','Maratón Sonidera',5,array['5 horas de show','Repertorio ilimitado','Animación y juegos','2 equipos de sonido']::text[],false,2),
  ('np-p1','neon-palido','Coctel',2,array['2 horas de show','Formación dúo o trío','Ambiente íntimo garantizado']::text[],false,0),
  ('np-p2','neon-palido','Atardecer',3,array['3 horas de show','Banda completa (4 integrantes)','Hasta 28 canciones','Luz ambiental incluida']::text[],true,1),
  ('np-p3','neon-palido','Gala Nocturna',5,array['5 horas de show','2 sets completos','Set acústico de regalo','Equipo de sonido profesional']::text[],false,2),
  ('ta-p1','trio-azul','Cena',2,array['2 horas de música de fondo','Formación trío','Repertorio estándar de jazz']::text[],false,0),
  ('ta-p2','trio-azul','After Dark',3,array['3 horas de show','Hasta 24 piezas','Set bailable de fusión','Micrófono para brindis']::text[],true,1),
  ('ta-p3','trio-azul','Noche de Gala',5,array['5 horas de show','Cuarteto con teclado','Repertorio a tu medida','Técnico de audio incluido']::text[],false,2)
on conflict (id) do nothing;

insert into public.songs (id,band_id,title,duration,plays,price,sort_order) values
  ('sm-s1','son-de-mexico','El Son de la Negra','3:12','128K',20,0),
  ('sm-s2','son-de-mexico','Cielito Lindo','2:45','96K',20,1),
  ('sm-s3','son-de-mexico','Amor Eterno','4:05','210K',20,2),
  ('sm-s4','son-de-mexico','La Bikina','3:28','74K',20,3),
  ('lc-s1','los-cometas','El Corrido del Tamal','3:04','88K',20,0),
  ('lc-s2','los-cometas','Peso Completo','2:51','142K',20,1),
  ('lc-s3','los-cometas','Nací Pa'' Cantar','3:33','67K',20,2),
  ('lc-s4','los-cometas','Tacos de Canasta','2:47','105K',20,3),
  ('vo-s1','vortice','Frecuencia Azul','3:48','203K',20,0),
  ('vo-s2','vortice','Cristal','4:12','156K',20,1),
  ('vo-s3','vortice','Gravedad Cero','3:21','98K',20,2),
  ('vo-s4','vortice','Motor','3:55','81K',20,3),
  ('vi-s1','las-vibras','La Cumbia del Río','3:18','76K',20,0),
  ('vi-s2','las-vibras','Pura Sabrosura','2:58','112K',20,1),
  ('vi-s3','las-vibras','Noche de Luna','3:41','59K',20,2),
  ('vi-s4','las-vibras','Sonido Caliente','3:09','84K',20,3),
  ('np-s1','neon-palido','Atardecer Sintético','3:26','187K',20,0),
  ('np-s2','neon-palido','Polaroid','3:02','134K',20,1),
  ('np-s3','neon-palido','Cintas de Colores','3:37','92K',20,2),
  ('np-s4','neon-palido','Vuelo Nocturno','4:01','77K',20,3),
  ('ta-s1','trio-azul','Medianoche en la Ciudad','5:12','64K',20,0),
  ('ta-s2','trio-azul','Saxo y Café','4:36','48K',20,1),
  ('ta-s3','trio-azul','Olas','4:58','39K',20,2),
  ('ta-s4','trio-azul','Blues del Centro','5:24','52K',20,3)
on conflict (id) do nothing;

commit;
