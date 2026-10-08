# Sonora

Dos sitios en HTML, CSS y JavaScript puro que comparten **una sola base de datos en Supabase**.

```
cliente/     App para quien contrata: buscar bandas, recomendaciones, reservar y comprar música
artista/     Panel de la banda: integrantes, canciones, ingresos y trazabilidad
supabase/    schema.sql (tablas, reglas y permisos) y seed.sql (bandas de ejemplo)
```

## Una sola cuenta

Clientes y artistas entran por **el mismo login** (`index.html` → `cliente/`):

- Arriba del login siempre se ve **¿Cómo quieres usar Sonora?**: *Quiero contratar* o *Soy artista o banda*. Lo elegido decide a dónde entras (también con Google).
- Si eliges *Soy artista* con una cuenta que no lo era, se marca como artista (`role` en los datos del usuario) y entras al panel; si eliges *Quiero contratar*, entras a la app de clientes aunque tengas banda.
- El modo invitado solo está disponible para clientes.
- Un cliente puede volverse artista desde **Perfil → ¿Tienes una banda?**, sin crear otra cuenta.
- Desde el panel, **Vista de cliente** abre la app de clientes; en su Perfil aparece **Mi panel de artista** para volver.
- Si alguien abre `artista/` sin sesión (o como invitado), se le manda al login.

El rol solo decide a qué app entra cada quien; lo que cada usuario puede ver o editar lo controlan las reglas RLS de Supabase.

Sin configurar nada, todo funciona en **modo demo**: abre `index.html`, crea una cuenta con cualquier correo y elige el tipo de cuenta. Los datos se guardan en el navegador.

## Canciones: solo se escuchan después de comprarlas

- **Bazar Digital:** las canciones no compradas muestran un candado; al tocarlo se abre la compra. Después de comprar aparece el botón de reproducir.
- **Perfil → Mis canciones:** lista de las canciones compradas, con su banda, para escucharlas en cualquier momento.
- **Backend (`supabase/canciones.sql`):** oculta la columna `songs.audio_url` para que el catálogo siga siendo público sin exponer el audio. La dirección del audio solo se entrega con la función `song_audio_url()`, a quien compró la canción o al dueño de la banda. El panel del artista obtiene los audios de su banda con `band_songs_audio()`.

Para activarlo: Supabase → SQL Editor → ejecuta `supabase/canciones.sql`. Sin ese paso, la app igual bloquea la reproducción, pero el audio sigue siendo visible en la API. Si se agregan columnas nuevas a `songs`, vuelve a ejecutarlo.

## Precios

La tarifa por hora de cada banda está en `bands.hourly_rate` y el total de cada reserva lo calcula Supabase (horas × tarifa). La base es de ~$400 por integrante por hora, más un extra para grupos con metales o tuba y para el mariachi de gala (de $1,200/h el trío sierreño a $3,200/h la banda sinaloense).

Para aplicar los precios en una base de datos que ya tiene las bandas: Supabase → SQL Editor → ejecuta `supabase/precios.sql`. También actualiza `bandas.tarifa_hora` si la banda está registrada con el mismo nombre. Las reservas que ya existen conservan su total.

## Reseñas

Quien contrató una banda o compró una canción puede calificarla de 1 a 5 estrellas y dejar su opinión (opcional, hasta 500 caracteres).

- **Bandas:** en *Mis Reservas* cada reserva tiene el botón **Califica a la banda**. Hay una reseña por reserva y se puede editar.
- **Canciones:** en el *Bazar Digital*, las canciones compradas muestran **Calificar**. Hay una reseña por canción y usuario.
- **Perfil de banda:** nueva pestaña **Reseñas** con el promedio, la distribución de estrellas y todas las opiniones (eventos y canciones). Las canciones muestran su promedio en el bazar.
- La calificación de la banda (`bands.rating` y `bands.reviews`) se recalcula sola con las reseñas de reservas.
- El servidor valida todo: no se puede reseñar una reserva ajena o cancelada, ni una canción que no compraste. Solo se muestra el primer nombre del autor.

**Tablas:** no se crean tablas ni hay que ejecutar SQL. Las reseñas de bandas usan las tablas existentes del equipo:

1. `usuarios`: se busca al cliente por `correo`; si no existe se registra (`nombre`, `correo`, `rol = cliente`).
2. `bandas`: se busca la banda por `nombre_banda`; si no existe se registra (`nombre_banda`, `tarifa_hora`, `descripcion`).
3. `contrataciones`: se busca o se crea la contratación equivalente a la reserva de la app (mismo cliente, banda y `fecha_evento`).
4. `resenas`: se guarda la reseña con ese `contratacion_id` (entero), `calificacion`, `comentario` y `fecha_publicacion`.

Las reseñas de **canciones** se guardan en el navegador (`localStorage`), porque `resenas` solo admite contrataciones.

## Recomendaciones "Para ti"

En el inicio de la app de clientes hay una sección de matches estilo Tinder (sin deslizar): cada banda de la base de datos (tabla `bands`) aparece como una tarjeta con dos botones, ✓ *Me gusta* o ✗ *No me interesa*.

- Las aceptadas quedan en **Tus matches** (avatar circular con insignia) y abren el perfil de la banda al tocarlas.
- Las rechazadas no se repiten; el orden del mazo es estable por usuario.
- Al revisarlas todas puedes **ver las recomendaciones de nuevo** (reinicia tus decisiones).
- No requiere tablas nuevas: las decisiones se guardan en el `localStorage` del navegador, separadas por id de usuario.

## Conectar con Supabase

1. En **SQL Editor** ejecuta `supabase/schema.sql` y luego `supabase/seed.sql`.
   `schema.sql` se puede volver a ejecutar cuando quieras: actualiza sin borrar datos.
2. Pon tu *Project URL* y tu *anon key* en **los dos** `js/config.js` (`cliente/` y `artista/`).
3. En **Authentication → Providers** activa Email; para el cliente también *Anonymous* (invitado) y, si quieres, Google.
4. En **Authentication → URL Configuration** agrega las URLs donde sirves los sitios.
5. Sírvelos con un servidor estático **desde la carpeta `sonora`** (por ejemplo `npx serve .`), para que `cliente/` y `artista/` estén en el mismo dominio y compartan la sesión.

## Panel del artista

| Sección | Qué hace |
| --- | --- |
| **Ingresos** | Total para la banda (95 %), lo ya liberado y lo que sigue en bóveda; ingresos por eventos y por música; cuánto le toca a cada integrante; próximos eventos. |
| **Integrantes** | Nombre, rol, porcentaje y dirección de cobro (wallet `0x…`, opcional). Los porcentajes deben sumar 100 % (se valida también en el servidor con `save_band_members`). |
| **Canciones** | Subir audio (MP3/WAV/M4A, máx. 25 MB) al bucket `songs` de Supabase Storage con título y precio. Publicar u ocultar del Bazar; no se borran para conservar su historial de ventas. |
| **Trazabilidad** | Todas las reservas y ventas con su hash de transacción y enlace al explorador de bloques, el reparto 95/5 y lo que corresponde a cada integrante (con enlace a su wallet). Filtros: reservas, música y pendientes. |

La primera vez que un artista entra, da de alta su banda (nombre, género, tarifa, descripción y días disponibles). Se crean automáticamente tres paquetes de horas para que los clientes puedan reservarla de inmediato y aparece como “Nueva” en la app de clientes.

### Explorador de bloques

Se configura en `artista/js/config.js`:

```js
BLOCKCHAIN: {
  name: "Polygon Amoy",
  txUrl: "https://amoy.polygonscan.com/tx/",
  addressUrl: "https://amoy.polygonscan.com/address/",
}
```

Cámbialo por la red que uses (por ejemplo Polygon `https://polygonscan.com/tx/`).

**Importante:** este frontend no escribe en la blockchain. Las columnas `bookings.tx_hash` y `song_purchases.tx_hash` las debe llenar tu servicio de pagos o contrato (con la *service role key*) cuando registre cada transacción. Mientras estén vacías, el panel las muestra como “Pendiente de registro”. Desde el navegador nadie puede escribir ni alterar un hash (lo impide un trigger).

## Permisos (RLS)

- El artista solo ve y edita **su** banda, sus integrantes y sus canciones, y solo puede subir audio a la carpeta de su banda.
- El artista ve las reservas y ventas de su banda; el cliente solo las suyas.
- Calificación, reseñas y eventos realizados no los puede modificar el artista.
- El total, el reparto 95/5 y las reglas de agenda (días disponibles, fecha ocupada, horario hasta las 23:00) se calculan y validan en el servidor.
