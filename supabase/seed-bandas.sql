-- =====================================================================
--  SONORA · Las 10 bandas recopiladas (Chihuahua)
--  Ejecutar en Supabase → SQL Editor, DESPUÉS de schema.sql.
--  Se puede correr más de una vez: no duplica (on conflict do nothing).
--
--  Supuestos:
--   - hourly_rate = tarifa de referencia por evento / 4 (evento típico de 4 h).
--   - rating, reviews, successful_events y years_active quedan en 0
--     (no se recopilaron; llénenlos solo con datos reales).
--   - availability vacío = la banda acepta cualquier día.
--   - Las wallets de integrantes son las mismas que usa contracts/script/SeedDemo.s.sol.
-- =====================================================================
begin;

insert into public.bands (id,name,genre,rating,reviews,hourly_rate,successful_events,years_active,bio,cover,avatar,sections,availability) values
  ('conjunto-rio-sacramento','Conjunto Río Sacramento','Norteño-Sax',0,0,4500,0,0,'Agrupación tradicional que mantiene vivo el clásico estilo chihuahuense del acordeón y el saxofón, ideales para polkas y huapangos. Ideal para: bodas, xv años, ferias patronales, charreadas.','https://picsum.photos/seed/conjunto-rio-sacramento-cover/800/500','https://picsum.photos/seed/conjunto-rio-sacramento-avatar/200/200',array['talento','tradiciones']::text[],'{}'::text[]),
  ('los-plebes-del-cerro-grande','Los Plebes del Cerro Grande','Sierreño Campirano',0,0,2100,0,0,'Trío sierreño con guitarras campiranas y requinto, especializados en corridos y baladas románticas para un ambiente más íntimo. Ideal para: fiestas privadas, reuniones de patio, bares, cantinas.','https://picsum.photos/seed/los-plebes-del-cerro-grande-cover/800/500','https://picsum.photos/seed/los-plebes-del-cerro-grande-avatar/200/200',array['talento','tradiciones']::text[],'{}'::text[]),
  ('banda-la-calicanto','Banda La Calicanto','Banda Estilo Sinaloense',0,0,8750,0,0,'Banda grande y estruendosa adaptada al gusto chihuahuense, con un repertorio que mezcla cumbias, corridos y sones tradicionales. Ideal para: bailes masivos, rodeos, clausuras, mayordomías.','https://picsum.photos/seed/banda-la-calicanto-cover/800/500','https://picsum.photos/seed/banda-la-calicanto-avatar/200/200',array['talento','tradiciones']::text[],'{}'::text[]),
  ('los-reyes-de-la-20','Los Reyes de la 20','Cumbia Norteña',0,0,3500,0,0,'Reyes indiscutibles de las pistas de baile de la ciudad, fusionando el sabor de la cumbia con la instrumentación del norteño. Ideal para: salones de baile, aniversarios, fiestas de colonias.','https://picsum.photos/seed/los-reyes-de-la-20-cover/800/500','https://picsum.photos/seed/los-reyes-de-la-20-avatar/200/200',array['talento']::text[],'{}'::text[]),
  ('rodeo-614','Rodeo 614','Country / Norteño',0,0,4000,0,0,'Agrupación que captura la esencia vaquera de Chihuahua, tocando versiones en español de country clásico y huapangos norteños. Ideal para: festivales country, rodeos, bares temáticos, bodas campestres.','https://picsum.photos/seed/rodeo-614-cover/800/500','https://picsum.photos/seed/rodeo-614-avatar/200/200',array['talento','tradiciones','nuevas']::text[],'{}'::text[]),
  ('escuadron-del-desierto','Escuadrón del Desierto','Norteño-Banda',0,0,5500,0,0,'El híbrido perfecto entre la fuerza de la tuba y la agilidad del acordeón, enfocados en corridos modernos y música bélica. Ideal para: palenques, fiestas privadas, eventos vip, antros.','https://picsum.photos/seed/escuadron-del-desierto-cover/800/500','https://picsum.photos/seed/escuadron-del-desierto-avatar/200/200',array['talento','tradiciones']::text[],'{}'::text[]),
  ('mariachi-los-dorados','Mariachi Los Dorados','Mariachi Tradicional',0,0,3000,0,0,'Mariachi de gala con arreglos sobrios y potentes, infaltable para las serenatas en las frías noches de la capital. Ideal para: serenatas, misas, bodas formales, eventos corporativos.','https://picsum.photos/seed/mariachi-los-dorados-cover/800/500','https://picsum.photos/seed/mariachi-los-dorados-avatar/200/200',array['talento','tradiciones']::text[],'{}'::text[]),
  ('los-de-la-cantera','Los de la Cantera','Sierreño con Tuba',0,0,2900,0,0,'Innovadores del género sierreño al sustituir el bajo acústico por una tuba, dándole un peso profundo a sus canciones románticas. Ideal para: fiestas universitarias, tocadas en terrazas, bares de moda.','https://picsum.photos/seed/los-de-la-cantera-cover/800/500','https://picsum.photos/seed/los-de-la-cantera-avatar/200/200',array['talento','tradiciones','nuevas']::text[],'{}'::text[]),
  ('los-cardenales-del-chuviscar','Los Cardenales del Chuviscar','Norteño Tradicional',0,0,2250,0,0,'Apegados a la vieja escuela, tocan norteño puro con acordeón de botones, bajo sexto, bajo y batería. Especialistas en música de cantina. Ideal para: cantinas tradicionales, fiestas familiares, domingos de carne asada.','https://picsum.photos/seed/los-cardenales-del-chuviscar-cover/800/500','https://picsum.photos/seed/los-cardenales-del-chuviscar-avatar/200/200',array['talento','tradiciones']::text[],'{}'::text[]),
  ('grupo-alianza-614','Grupo Alianza 614','Norteño Versátil',0,0,4900,0,0,'Banda que domina el norteño y tejano, pero con capacidad para tocar pop y rock en inglés cuando la fiesta lo exige. Ideal para: graduaciones, bodas de gala, eventos empresariales, salones de eventos.','https://picsum.photos/seed/grupo-alianza-614-cover/800/500','https://picsum.photos/seed/grupo-alianza-614-avatar/200/200',array['talento','tradiciones','nuevas']::text[],'{}'::text[])
on conflict (id) do nothing;

insert into public.packages (id,band_id,label,hours,perks,popular,sort_order) values
  ('conjunto-rio-sacramento-p1','conjunto-rio-sacramento','Esencial',2,array['2 horas de show en vivo','5 integrantes en escena','Repertorio a solicitud']::text[],false,0),
  ('conjunto-rio-sacramento-p2','conjunto-rio-sacramento','Fiesta',3,array['3 horas de show en vivo','Equipo de sonido incluido','Ideal para bodas']::text[],true,1),
  ('conjunto-rio-sacramento-p3','conjunto-rio-sacramento','Completo',5,array['5 horas de show en vivo','Repertorio ilimitado','Equipo de sonido incluido','Ideal para xv años']::text[],false,2),
  ('los-plebes-del-cerro-grande-p1','los-plebes-del-cerro-grande','Esencial',2,array['2 horas de show en vivo','3 integrantes en escena','Repertorio a solicitud']::text[],false,0),
  ('los-plebes-del-cerro-grande-p2','los-plebes-del-cerro-grande','Fiesta',3,array['3 horas de show en vivo','Equipo de sonido incluido','Ideal para fiestas privadas']::text[],true,1),
  ('los-plebes-del-cerro-grande-p3','los-plebes-del-cerro-grande','Completo',5,array['5 horas de show en vivo','Repertorio ilimitado','Equipo de sonido incluido','Ideal para reuniones de patio']::text[],false,2),
  ('banda-la-calicanto-p1','banda-la-calicanto','Esencial',2,array['2 horas de show en vivo','5 integrantes en escena','Repertorio a solicitud']::text[],false,0),
  ('banda-la-calicanto-p2','banda-la-calicanto','Fiesta',3,array['3 horas de show en vivo','Equipo de sonido incluido','Ideal para bailes masivos']::text[],true,1),
  ('banda-la-calicanto-p3','banda-la-calicanto','Completo',5,array['5 horas de show en vivo','Repertorio ilimitado','Equipo de sonido incluido','Ideal para rodeos']::text[],false,2),
  ('los-reyes-de-la-20-p1','los-reyes-de-la-20','Esencial',2,array['2 horas de show en vivo','5 integrantes en escena','Repertorio a solicitud']::text[],false,0),
  ('los-reyes-de-la-20-p2','los-reyes-de-la-20','Fiesta',3,array['3 horas de show en vivo','Equipo de sonido incluido','Ideal para salones de baile']::text[],true,1),
  ('los-reyes-de-la-20-p3','los-reyes-de-la-20','Completo',5,array['5 horas de show en vivo','Repertorio ilimitado','Equipo de sonido incluido','Ideal para aniversarios']::text[],false,2),
  ('rodeo-614-p1','rodeo-614','Esencial',2,array['2 horas de show en vivo','4 integrantes en escena','Repertorio a solicitud']::text[],false,0),
  ('rodeo-614-p2','rodeo-614','Fiesta',3,array['3 horas de show en vivo','Equipo de sonido incluido','Ideal para festivales country']::text[],true,1),
  ('rodeo-614-p3','rodeo-614','Completo',5,array['5 horas de show en vivo','Repertorio ilimitado','Equipo de sonido incluido','Ideal para rodeos']::text[],false,2),
  ('escuadron-del-desierto-p1','escuadron-del-desierto','Esencial',2,array['2 horas de show en vivo','6 integrantes en escena','Repertorio a solicitud']::text[],false,0),
  ('escuadron-del-desierto-p2','escuadron-del-desierto','Fiesta',3,array['3 horas de show en vivo','Equipo de sonido incluido','Ideal para palenques']::text[],true,1),
  ('escuadron-del-desierto-p3','escuadron-del-desierto','Completo',5,array['5 horas de show en vivo','Repertorio ilimitado','Equipo de sonido incluido','Ideal para fiestas privadas']::text[],false,2),
  ('mariachi-los-dorados-p1','mariachi-los-dorados','Esencial',2,array['2 horas de show en vivo','6 integrantes en escena','Repertorio a solicitud']::text[],false,0),
  ('mariachi-los-dorados-p2','mariachi-los-dorados','Fiesta',3,array['3 horas de show en vivo','Equipo de sonido incluido','Ideal para serenatas']::text[],true,1),
  ('mariachi-los-dorados-p3','mariachi-los-dorados','Completo',5,array['5 horas de show en vivo','Repertorio ilimitado','Equipo de sonido incluido','Ideal para misas']::text[],false,2),
  ('los-de-la-cantera-p1','los-de-la-cantera','Esencial',2,array['2 horas de show en vivo','4 integrantes en escena','Repertorio a solicitud']::text[],false,0),
  ('los-de-la-cantera-p2','los-de-la-cantera','Fiesta',3,array['3 horas de show en vivo','Equipo de sonido incluido','Ideal para fiestas universitarias']::text[],true,1),
  ('los-de-la-cantera-p3','los-de-la-cantera','Completo',5,array['5 horas de show en vivo','Repertorio ilimitado','Equipo de sonido incluido','Ideal para tocadas en terrazas']::text[],false,2),
  ('los-cardenales-del-chuviscar-p1','los-cardenales-del-chuviscar','Esencial',2,array['2 horas de show en vivo','4 integrantes en escena','Repertorio a solicitud']::text[],false,0),
  ('los-cardenales-del-chuviscar-p2','los-cardenales-del-chuviscar','Fiesta',3,array['3 horas de show en vivo','Equipo de sonido incluido','Ideal para cantinas tradicionales']::text[],true,1),
  ('los-cardenales-del-chuviscar-p3','los-cardenales-del-chuviscar','Completo',5,array['5 horas de show en vivo','Repertorio ilimitado','Equipo de sonido incluido','Ideal para fiestas familiares']::text[],false,2),
  ('grupo-alianza-614-p1','grupo-alianza-614','Esencial',2,array['2 horas de show en vivo','5 integrantes en escena','Repertorio a solicitud']::text[],false,0),
  ('grupo-alianza-614-p2','grupo-alianza-614','Fiesta',3,array['3 horas de show en vivo','Equipo de sonido incluido','Ideal para graduaciones']::text[],true,1),
  ('grupo-alianza-614-p3','grupo-alianza-614','Completo',5,array['5 horas de show en vivo','Repertorio ilimitado','Equipo de sonido incluido','Ideal para bodas de gala']::text[],false,2)
on conflict (id) do nothing;

insert into public.songs (id,band_id,title,duration,plays,price,audio_url,sort_order) values
  ('conjunto-rio-sacramento-s1','conjunto-rio-sacramento','Polka del Sacramento',null,null,15,null,0),
  ('los-plebes-del-cerro-grande-s1','los-plebes-del-cerro-grande','Corrido del 46',null,null,12,null,0),
  ('banda-la-calicanto-s1','banda-la-calicanto','Cumbia de la Cantera',null,null,18,null,0),
  ('los-reyes-de-la-20-s1','los-reyes-de-la-20','Bailando en el Palomar',null,null,15,null,0),
  ('rodeo-614-s1','rodeo-614','Cabalgata al Atardecer',null,null,19,null,0),
  ('escuadron-del-desierto-s1','escuadron-del-desierto','Rutas de Polvo',null,null,20,null,0),
  ('mariachi-los-dorados-s1','mariachi-los-dorados','El Son de Santa Rita',null,null,10,null,0),
  ('los-de-la-cantera-s1','los-de-la-cantera','El Patrón del Norte',null,null,15,null,0),
  ('los-cardenales-del-chuviscar-s1','los-cardenales-del-chuviscar','Dos Cartas Viejas',null,null,9,null,0),
  ('grupo-alianza-614-s1','grupo-alianza-614','Popurrí 614 (Norteño-Tejano)',null,null,25,null,0)
on conflict (id) do nothing;

-- Integrantes con su porcentaje y wallet (solo si la banda aún no tiene integrantes)
insert into public.band_members (band_id,name,role,share,wallet,sort_order)
select v.band_id,v.name,v.role,v.share,v.wallet,v.sort_order from (values
  ('conjunto-rio-sacramento','Carlos "El Charly" Mendoza','Primera voz y Bajo Sexto',25.00,'0xCA3F30412bD6E646fc9730f4b69495AD99A5cD5B',0),
  ('conjunto-rio-sacramento','Luis Rivas','Acordeón',25.00,'0x30d9244A9Ac44Bb88fA7Df380E799C5De4241D1b',1),
  ('conjunto-rio-sacramento','Martín Valles','Saxofón',20.00,'0x7101ceC8a8deD78d85452E32810e1fDE81f6e085',2),
  ('conjunto-rio-sacramento','José Álvarez','Bajo Eléctrico',15.00,'0x34577614Fa49DEd64780f88346717520BDcfE0c8',3),
  ('conjunto-rio-sacramento','Raúl Sotelo','Batería',15.00,'0xB64dAc400703Ac2F13D924777c51Bf33C3BfA0C1',4),
  ('los-plebes-del-cerro-grande','Saúl "El Zurdo" Reyes','Requinto y Segunda Voz',34.00,'0xDB503D634995c6feA17E4C192fE021E2C9a23F36',0),
  ('los-plebes-del-cerro-grande','Fernando Castro','Primera Voz y Guitarra Armonía',33.00,'0x74032B2C4043F08EDe8356249c4e537c5745Df1b',1),
  ('los-plebes-del-cerro-grande','Diego "El Tío" Gómez','Bajo Acústico (Tololoche)',33.00,'0xf4C3BB09E7c69209d3280a25DA949F677f2Fd414',2),
  ('banda-la-calicanto','Roberto "Beto" Llanos','Vocalista Principal',30.00,'0x3852c9f0aD57dAE1772F487A02FCa13575D08Fb8',0),
  ('banda-la-calicanto','Arturo Vega','Tuba',20.00,'0x5EF537b7b24D84438B7f7C43829903A4A920dd0C',1),
  ('banda-la-calicanto','Miguel Soto','Clarinete Primero',20.00,'0x22af7f3b6d27A1D8Aa8BbfB68FCd732dABd1Eb2A',2),
  ('banda-la-calicanto','Óscar Ponce','Trompeta',15.00,'0x2368f86cc47824E32031536c377Dd33ab09cf344',3),
  ('banda-la-calicanto','Manuel Díaz','Tarola y Tambora',15.00,'0x1938e89Fa0E6be81C8A6f466a27F55dC79F73436',4),
  ('los-reyes-de-la-20','Javier "Javi" Montes','Voz Principal',20.00,'0xAF512f95Ef564AaC920b0B76FCD2ac609aD8493F',0),
  ('los-reyes-de-la-20','Hugo Cárdenas','Teclados',20.00,'0x4Fc136114168ce12C9373938505F8c266a1A328c',1),
  ('los-reyes-de-la-20','Sergio "Checo" Ruiz','Bajo Sexto',20.00,'0x2b8Ce26F38A57E69e78e69f80ffa357aC189E783',2),
  ('los-reyes-de-la-20','Tomás Salgado','Bajo Eléctrico',20.00,'0x0A1057C9c2DB33503C3a944aF81ff33addc1c55D',3),
  ('los-reyes-de-la-20','Iván Torres','Güiro y Percusiones',20.00,'0x3909bE5c5a453FdDC36480826572F3A1999E5352',4),
  ('rodeo-614','David "El Vaquero" Luján','Voz y Guitarra Acústica',30.00,'0xced9C25AF4070BF42c8553073f3FF59513d6c89c',0),
  ('rodeo-614','Esteban Mora','Fiddle (Violín)',30.00,'0x7923B070EcebbCbe8bdd7b461E73f89BD713a56C',1),
  ('rodeo-614','Ramón Domínguez','Steel Guitar',20.00,'0x5BCA0dbf278E58912DB47b1f572272D1bfCaF6cB',2),
  ('rodeo-614','Julio Ortega','Batería',20.00,'0x7e2faC449c2AdbA8Cc759047842189d40e464287',3),
  ('escuadron-del-desierto','Víctor Salas','Primera Voz',20.00,'0xC007a94EE1Ed2Fd1a372Eb999F8B0dc7c2579b1b',0),
  ('escuadron-del-desierto','Eduardo "Lalo" Treviño','Acordeón',20.00,'0xA0FeA6F5926389EBF2497E4262401c19AC9D5920',1),
  ('escuadron-del-desierto','Héctor "El Compa" Macías','Tuba',15.00,'0x92e3c9a03f1c6C40aC2076887908d252CA0e9022',2),
  ('escuadron-del-desierto','Alejandro Perea','Bajo Sexto',15.00,'0xC51580AedAb94E8D5BCB5f6E237B62F9567FE87C',3),
  ('escuadron-del-desierto','Simón Valdés','Tarolas',15.00,'0x652dAA2076ce937741fde568Bb3cE880C0740432',4),
  ('escuadron-del-desierto','Mario Silva','Animador y Percusiones',15.00,'0xd5d91FEd7520Ba66c910771Aa336F179b53B2451',5),
  ('mariachi-los-dorados','Gerardo "Gerry" Quintana','Voz y Guitarrón',25.00,'0x059CEd17004A9b31552C214521aB99223529Ce15',0),
  ('mariachi-los-dorados','Roberto Flores','Vihuela',15.00,'0xF242Bc73272A36e9BF7A386242410CC0b99dEaA2',1),
  ('mariachi-los-dorados','Luis "Lucho" Parra','Guitarra',15.00,'0x05d43738f262bbEFB848bFaE0b689226a1f9fE1C',2),
  ('mariachi-los-dorados','Francisco Márquez','Trompeta 1',15.00,'0x3c57DC7A34D7241497DAa4E9c0Ba6b536EAea696',3),
  ('mariachi-los-dorados','Daniel Ceballos','Trompeta 2',15.00,'0xE477b6Dfd62e0bB338e9B7cFeacbCfBe77F2d10f',4),
  ('mariachi-los-dorados','Pedro Ávila','Violín',15.00,'0xe4990565c46f867B1691fc1d1965c8DA7fE58053',5),
  ('los-de-la-cantera','Andrés Solís','Primera Voz y Requinto',30.00,'0x4A3017ABb2808593c147Ca9edD838d3413313864',0),
  ('los-de-la-cantera','Marcos "El Chino" Leyva','Tuba',25.00,'0xC52423bb3DDa5F8E018bFd393A17bA1692701509',1),
  ('los-de-la-cantera','Guillermo Ríos','Armonía (Guitarra de 12 cuerdas)',25.00,'0x84e8d20F73162D89B2f6Ee8372eb4FAAB5747CF4',2),
  ('los-de-la-cantera','Paco Zúñiga','Segunda Voz',20.00,'0x78E121d3498F9c391503b1e74Ff49E84DD732617',3),
  ('los-cardenales-del-chuviscar','Rubén "Ramiro" Santos','Voz y Acordeón',25.00,'0x4c5a5a00e8c6d3fBe9c2184F190502E9839bD0aE',0),
  ('los-cardenales-del-chuviscar','Felipe "Pipe" Nájera','Bajo Sexto y Segunda Voz',25.00,'0x7B374C7a88CB6E7727C41a728DA976af03dA81EB',1),
  ('los-cardenales-del-chuviscar','Ernesto Castillo','Bajo Eléctrico',25.00,'0x7Fa4EFE32c736718Bbc38aC7Cd829DBE3EBCA35d',2),
  ('los-cardenales-del-chuviscar','Samuel "Sammy" Rocha','Batería',25.00,'0x966b014F09bB834bEcb1a3AbfAC58B001f77eb9c',3),
  ('grupo-alianza-614','Brenda "La Chispa" Delgado','Voz Principal Femenina',25.00,'0x8efc1dFAAD7aa04B7710048ccF0a5d2Ae4398f55',0),
  ('grupo-alianza-614','Omar Fuentes','Voz Principal Masculina y Bajo Sexto',25.00,'0xb18FC2C968186472e4590E370Bb968007859af31',1),
  ('grupo-alianza-614','Alan Gutiérrez','Teclados y Acordeón',20.00,'0x3618A5Bf3c7d9E3cD0a35774739666cee245e2e9',2),
  ('grupo-alianza-614','Ricardo Pineda','Bajo Eléctrico',15.00,'0x1008CfC355A0ba8c1DB2503134Cd532DBb6b38aF',3),
  ('grupo-alianza-614','Cristian Mora','Batería y Secuencias',15.00,'0x7EE2275359870C4C7ce2a356Eeb412B44FcE3143',4)
) as v(band_id,name,role,share,wallet,sort_order)
where not exists (select 1 from public.band_members m where m.band_id = v.band_id);

commit;
