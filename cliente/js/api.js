/**
 * API · Todas las llamadas a Supabase viven aquí.
 * Requiere: supabase-js v2 (CDN) y js/config.js
 */
(function () {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.SONORA_CONFIG;

  const configured =
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("TU-PROYECTO") &&
    !SUPABASE_ANON_KEY.startsWith("TU-");

  const sb = configured
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

  /** Convierte la fila de la BD al formato que usa la UI (igual al JSON original) */
  function mapBand(row) {
    return {
      id: row.id,
      name: row.name,
      genre: row.genre,
      rating: Number(row.rating),
      reviews: row.reviews,
      hourlyRate: row.hourly_rate,
      successfulEvents: row.successful_events,
      yearsActive: row.years_active,
      bio: row.bio || "",
      cover: row.cover,
      avatar: row.avatar,
      sections: row.sections || [],
      availability: row.availability || [],
      packages: (row.packages || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((p) => ({ id: p.id, label: p.label, hours: p.hours, perks: p.perks || [], popular: p.popular })),
      songs: (row.songs || [])
        .filter((s) => s.published !== false) // las ocultas por el artista no se muestran
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({ id: s.id, title: s.title, duration: s.duration, plays: s.plays, price: s.price, audioUrl: s.audio_url })),
    };
  }

  function mapBooking(row) {
    return {
      id: row.id,
      bandId: row.band_id,
      bandName: row.bands?.name ?? "",
      bandAvatar: row.bands?.avatar ?? "",
      eventDate: row.event_date,
      time: row.event_time,
      hours: row.hours,
      address: row.address,
      total: row.total,
      status: row.status,
      txHash: row.tx_hash || null,
    };
  }

  // Columnas públicas de una canción (audio_url no: solo se entrega a quien la compró)
  const SONG_COLS = "id, band_id, title, duration, plays, price, sort_order, published";

  /** Compra (con datos de la canción y la banda) → objeto de la app */
  function mapPurchase(row) {
    const s = row.songs || {};
    return {
      songId: row.song_id,
      title: s.title || "Canción",
      duration: s.duration || "",
      bandId: s.band_id || "",
      bandName: s.bands?.name || "",
      bandAvatar: s.bands?.avatar || "",
      price: row.price ?? s.price ?? 0,
      purchasedAt: row.created_at || "",
    };
  }

  /** Fecha de Postgres sin zona horaria (timestamp) → ISO en UTC */
  function isoUTC(v) {
    if (!v) return "";
    const t = String(v).replace(" ", "T");
    return /[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + "Z";
  }

  /** Fila de la tabla resenas (o del modo demo) → objeto de la app */
  function mapReview(row) {
    const date = isoUTC(row.fecha_publicacion || row.updated_at || row.created_at);
    return {
      id: row.id,
      bookingId: row.reserva_id || row.booking_id || null,
      bandId: row.banda_id || row.band_id || null,
      songId: row.cancion_id || row.song_id || null,
      songTitle: row.songs?.title || row.song_title || "",
      rating: Number(row.calificacion ?? row.rating),
      comment: row.comentario ?? row.comment ?? "",
      author: row.autor || row.author_name || "Cliente",
      createdAt: date,
      updatedAt: date,
    };
  }

  /** Traduce errores comunes de Supabase a mensajes claros */
  function friendly(error) {
    const m = (error?.message || "").toLowerCase();
    if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
    if (m.includes("user already registered")) return "Ya existe una cuenta con ese correo. Inicia sesión.";
    if (m.includes("email not confirmed")) return "Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.";
    if (m.includes("anonymous sign-ins are disabled")) return "El acceso como invitado no está activado en Supabase (Authentication → Providers → Anonymous).";
    if (m.includes("provider is not enabled")) return "El inicio con Google no está activado en Supabase (Authentication → Providers → Google).";
    if (m.includes("rate limit")) return "Demasiados intentos. Espera un momento y vuelve a intentar.";
    if (m.includes("failed to fetch")) return "No hay conexión con el servidor. Revisa tu internet.";
    if (/resenas|contrataciones|usuarios|bandas/.test(m) && (m.includes("could not find") || m.includes("does not exist")))
      return `Supabase no encontró una tabla o columna de reseñas (usuarios, bandas, contrataciones o resenas). Detalle: ${error.message}`;
    if (m.includes("duplicate key") && m.includes("resenas")) return "Ya dejaste una reseña aquí.";
    if (m.includes("duplicate key")) return "Ya tienes esta canción.";
    return error?.message || "Ocurrió un error inesperado.";
  }

  async function run(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(friendly(error));
    return data;
  }

  const SHARE = window.SONORA_CONFIG.ARTIST_SHARE ?? 0.95;
  const DAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const norm = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  /** Reglas de agenda (las mismas que valida Supabase). Devuelve "" si todo está bien. */
  function validateBooking(band, eventDate, time, hours, address) {
    if (!band) return "Banda no encontrada.";
    const [y, m, d] = eventDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return "La fecha del evento no puede ser en el pasado.";
    const avail = (band.availability || []).map(norm);
    if (avail.length && !avail.includes(DAYS[date.getDay()])) {
      return `${band.name} no se presenta ese día. Disponible: ${band.availability.join(", ")}.`;
    }
    const h = Number(time.split(":")[0]);
    if (h < 12 || h > 21) return "El horario de inicio debe ser entre 12:00 y 21:00.";
    if (date.getTime() === today.getTime() && h < new Date().getHours() + 2) {
      return "Para hoy, reserva con al menos 2 horas de anticipación.";
    }
    if (hours < 1 || hours > 8) return "La duración debe ser de 1 a 8 horas.";
    if (h + hours > 23) return "El evento debe terminar a más tardar a las 23:00.";
    if (address.trim().length < 5) return "Escribe la dirección completa del evento.";
    return "";
  }

  // ===================================================================
  // RESEÑAS EN EL NAVEGADOR (respaldo cuando la tabla "resenas" no tiene
  // las columnas de la app). Se guardan en localStorage, compartidas por
  // todas las cuentas que usen este mismo navegador.
  // ===================================================================
  function makeLocalReviews(getUser) {
    const KEY = "sonora_resenas";
    const loadAll = () => {
      try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
    };
    const saveAll = (rows) => {
      try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch {}
    };
    const firstName = (n) => String(n || "").trim().split(" ")[0] || "Cliente";

    async function upsert(match, base, { rating, comment }) {
      const user = await getUser();
      if (!user.id) throw new Error("Inicia sesión para dejar una reseña.");
      if (!(rating >= 1 && rating <= 5)) throw new Error("Elige de 1 a 5 estrellas.");
      const rows = loadAll();
      let row = rows.find((r) => r.usuario_id === user.id && match(r));
      if (!row) {
        row = { id: "local-" + Date.now(), usuario_id: user.id, ...base };
        rows.push(row);
      }
      Object.assign(row, {
        calificacion: rating,
        comentario: String(comment || "").trim().slice(0, 500),
        autor: firstName(user.name),
        fecha_publicacion: new Date().toISOString(),
      });
      saveAll(rows);
      return mapReview(row);
    }

    return {
      async getMyReviews() {
        const { id } = await getUser();
        const rows = loadAll().filter((r) => r.usuario_id === id).map(mapReview);
        return { bookings: rows.filter((r) => r.bookingId), songs: rows.filter((r) => r.songId) };
      },
      async getBandReviews(bandId) {
        return loadAll()
          .filter((r) => r.banda_id === bandId)
          .map(mapReview)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async saveBookingReview({ bookingId, bandId, ...v }) {
        return upsert((r) => r.reserva_id === bookingId, { reserva_id: bookingId, banda_id: bandId }, v);
      },
      async saveSongReview({ songId, bandId, songTitle, ...v }) {
        return upsert((r) => r.cancion_id === songId, { cancion_id: songId, banda_id: bandId, song_title: songTitle }, v);
      },
    };
  }

  // ===================================================================
  // RECOMENDACIONES "PARA TI": decisiones (match / skip) por usuario.
  // No usan tabla en Supabase: se guardan en el localStorage de este
  // navegador, separadas por id de usuario. Las bandas sí vienen de la BD.
  // ===================================================================
  function makeRecsStore(getUid) {
    const REC_KEY = "sonora_recs";
    const loadAll = () => {
      try { return JSON.parse(localStorage.getItem(REC_KEY)) || {}; } catch { return {}; }
    };
    const saveAll = (all) => {
      try { localStorage.setItem(REC_KEY, JSON.stringify(all)); } catch {}
    };
    const key = async () => (await getUid()) || "invitado";
    return {
      async getBandDecisions() {
        const mine = loadAll()[await key()] || {};
        return Object.entries(mine).map(([band_id, status]) => ({ band_id, status }));
      },
      async respondToBand(bandId, status) {
        if (status !== "match" && status !== "skip") throw new Error("Respuesta no válida.");
        const all = loadAll();
        const k = await key();
        all[k] = Object.assign({}, all[k], { [bandId]: status });
        saveAll(all);
        return { band_id: bandId, status };
      },
      async resetBandDecisions() {
        const all = loadAll();
        delete all[await key()];
        saveAll(all);
      },
    };
  }

  // ===================================================================
  // MODO DEMO: si no hay Supabase configurado, todo funciona en local
  // (los datos se guardan en localStorage de este navegador).
  // ===================================================================
  if (!configured) {
    const KEY = "sonora_demo";
    const load = () => {
      try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
    };
    const save = (db) => {
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
    };
    const db = Object.assign({ session: null, users: {}, bookings: [], purchases: [], band_reviews: [], song_reviews: [] }, load());
    const listeners = [];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const uid = () => db.session?.user?.id;
    const demoAuthor = () =>
      String(db.session?.user?.user_metadata?.full_name || "").trim().split(" ")[0] || "Cliente";

    function setSession(user) {
      db.session = user ? { user } : null;
      save(db);
      setTimeout(() => listeners.forEach((cb) => cb(db.session)), 0);
      return db.session;
    }
    // db.users[email] = { name, role }  (versiones anteriores guardaban solo el nombre)
    const userInfo = (email) => {
      const u = db.users[email.toLowerCase()];
      return typeof u === "string" ? { name: u, role: "cliente" } : u || {};
    };
    const userFromEmail = (email, name, role) => ({
      id: "demo-" + email.toLowerCase(),
      email,
      is_anonymous: false,
      user_metadata: {
        full_name: name || userInfo(email).name || "",
        role: role || userInfo(email).role || "cliente",
      },
    });

    window.API = {
      configured: true,
      demo: true,
      client: null,

      async getSession() { return db.session; },
      onAuthChange(cb) {
        listeners.push(cb);
        setTimeout(() => cb(db.session), 0);
      },
      async signUp(name, email, password, role = "cliente") {
        await wait(900);
        db.users[email.toLowerCase()] = { name, role };
        return { session: setSession(userFromEmail(email, name, role)) };
      },
      async becomeArtist() {
        const email = db.session?.user?.email;
        if (!email) throw new Error("Necesitas una cuenta con correo para registrar una banda.");
        db.users[email.toLowerCase()] = { ...userInfo(email), role: "artista" };
        db.session.user.user_metadata.role = "artista";
        save(db);
      },
      async signIn(email, password) {
        await wait(700);
        return { session: setSession(userFromEmail(email)) };
      },
      async signInWithGoogle() {
        await wait(900);
        return { session: setSession(userFromEmail("ana@gmail.com", "Ana")) };
      },
      async signInAsGuest() {
        await wait(600);
        return { session: setSession({ id: "demo-guest", is_anonymous: true, user_metadata: {} }) };
      },
      async signOut() { setSession(null); },

      async getProfile() { return null; },

      async getBands() {
        await wait(300);
        return window.DEMO_BANDS.map(mapBand);
      },

      async getBookings() {
        return db.bookings
          .filter((b) => b.user_id === uid() && b.status !== "cancelada")
          .sort((a, b) => a.event_date.localeCompare(b.event_date))
          .map(mapBooking);
      },
      async getBookedDates(bandId) {
        return db.bookings
          .filter((b) => b.band_id === bandId && b.status === "confirmada")
          .map((b) => b.event_date);
      },
      async createBooking({ bandId, eventDate, time, hours, address }) {
        await wait(1200);
        const band = window.DEMO_BANDS.find((b) => b.id === bandId);
        // Mismas reglas que el trigger de Supabase
        const err = validateBooking(band, eventDate, time, hours, address);
        if (err) throw new Error(err);
        if (db.bookings.some((b) => b.band_id === bandId && b.event_date === eventDate && b.status === "confirmada")) {
          throw new Error("La banda ya tiene un evento ese día. Elige otra fecha.");
        }
        const total = hours * band.hourly_rate;
        const row = {
          id: "bk-" + Date.now(),
          user_id: uid(),
          band_id: bandId,
          event_date: eventDate,
          event_time: time,
          hours,
          address,
          total,
          coop_amount: Math.round(total * (1 - SHARE)),
          artist_amount: total - Math.round(total * (1 - SHARE)),
          status: "confirmada",
          bands: { name: band.name, avatar: band.avatar },
        };
        db.bookings.push(row);
        save(db);
        return mapBooking(row);
      },
      async setBookingTx(id, txHash) {
        const b = db.bookings.find((x) => x.id === id);
        if (b) b.tx_hash = txHash;
        save(db);
      },
      async cancelBooking(id) {
        const b = db.bookings.find((x) => x.id === id && x.user_id === uid());
        if (b) b.status = "cancelada";
        save(db);
      },

      async getPurchasedSongIds() {
        return db.purchases.filter((p) => p.user_id === uid()).map((p) => p.song_id);
      },
      async getMyPurchases() {
        return db.purchases
          .filter((p) => p.user_id === uid())
          .map((p) => {
            const band = window.DEMO_BANDS.find((b) => (b.songs || []).some((x) => x.id === p.song_id));
            const song = band?.songs.find((x) => x.id === p.song_id) || {};
            return mapPurchase({
              song_id: p.song_id,
              price: song.price,
              created_at: p.created_at,
              songs: { ...song, band_id: band?.id, bands: band && { name: band.name, avatar: band.avatar } },
            });
          })
          .reverse();
      },
      async getSongAudio(songId) {
        if (!db.purchases.some((p) => p.user_id === uid() && p.song_id === songId)) return null;
        for (const b of window.DEMO_BANDS) {
          const song = (b.songs || []).find((x) => x.id === songId);
          if (song) return song.audio_url || null;
        }
        return null;
      },
      async buySong(songId, txHash) {
        await wait(900);
        if (db.purchases.some((p) => p.user_id === uid() && p.song_id === songId)) {
          throw new Error("Ya tienes esta canción.");
        }
        db.purchases.push({ user_id: uid(), song_id: songId, created_at: new Date().toISOString() });
        save(db);
      },

      // ---------- Reseñas ----------
      async getMyReviews() {
        return {
          bookings: db.band_reviews.filter((r) => r.user_id === uid()).map(mapReview),
          songs: db.song_reviews.filter((r) => r.user_id === uid()).map(mapReview),
        };
      },
      async getBandReviews(bandId) {
        const band = window.DEMO_BANDS.find((b) => b.id === bandId);
        const titles = Object.fromEntries((band?.songs || []).map((s) => [s.id, s.title]));
        const songs = db.song_reviews
          .filter((r) => titles[r.song_id])
          .map((r) => mapReview({ ...r, song_title: titles[r.song_id], band_id: bandId }));
        const events = db.band_reviews.filter((r) => r.band_id === bandId).map(mapReview);
        return [...events, ...songs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async saveBookingReview({ bookingId, rating, comment }) {
        await wait(500);
        const bk = db.bookings.find((b) => b.id === bookingId && b.user_id === uid());
        if (!bk) throw new Error("Solo puedes reseñar bandas que hayas contratado.");
        if (bk.status === "cancelada") throw new Error("No puedes reseñar una reserva cancelada.");
        const now = new Date().toISOString();
        let row = db.band_reviews.find((r) => r.booking_id === bookingId);
        if (!row) {
          row = { id: "rv-" + Date.now(), booking_id: bookingId, band_id: bk.band_id, user_id: uid(), created_at: now };
          db.band_reviews.push(row);
        }
        Object.assign(row, { rating, comment: String(comment || "").trim(), author_name: demoAuthor(), updated_at: now });
        save(db);
        return mapReview(row);
      },
      async saveSongReview({ songId, rating, comment }) {
        await wait(500);
        if (!db.purchases.some((p) => p.user_id === uid() && p.song_id === songId)) {
          throw new Error("Primero compra la canción para poder reseñarla.");
        }
        const now = new Date().toISOString();
        let row = db.song_reviews.find((r) => r.song_id === songId && r.user_id === uid());
        if (!row) {
          row = { user_id: uid(), song_id: songId, created_at: now };
          db.song_reviews.push(row);
        }
        Object.assign(row, { rating, comment: String(comment || "").trim(), author_name: demoAuthor(), updated_at: now });
        save(db);
        return mapReview(row);
      },

      // ---------- Recomendaciones "Para ti" ----------
      ...makeRecsStore(async () => uid()),
    };
    return;
  }

  // ===================================================================
  // RESEÑAS CON LAS TABLAS EXISTENTES
  //   usuarios(id, nombre, correo, rol, fecha_registro)
  //   bandas(id, nombre_banda, tarifa_hora, descripcion, ...)
  //   contrataciones(id, cliente_id → usuarios, banda_id → bandas,
  //                  fecha_evento, horas_contratadas, total_pago, estado_pago)
  //   resenas(id, contratacion_id → contrataciones, calificacion,
  //           comentario, fecha_publicacion)
  // La app guarda sus reservas en "bookings" (id uuid); al reseñar se busca
  // o se crea la fila equivalente en "contrataciones" para obtener su id entero.
  // ===================================================================
  const songReviewsLocal = makeLocalReviews(async () => {
    const { data } = await sb.auth.getSession();
    const u = data.session?.user;
    return { id: u?.id, name: u?.user_metadata?.full_name || u?.user_metadata?.name || "" };
  });

  const Resenas = (() => {
    const firstName = (n) => String(n || "").trim().split(" ")[0] || "Cliente";
    const sameName = (a, b) => norm(a || "") === norm(b || "");

    /** Inserta y devuelve el id; si la columna id no se genera sola, usa el siguiente número */
    async function insertRow(table, row) {
      let { data, error } = await sb.from(table).insert(row).select("id").single();
      if (error && /null value in column "id"/i.test(error.message)) {
        const last = await run(sb.from(table).select("id").order("id", { ascending: false }).limit(1));
        ({ data, error } = await sb
          .from(table)
          .insert({ id: (last[0]?.id || 0) + 1, ...row })
          .select("id")
          .single());
      }
      if (error) throw new Error(friendly(error));
      return data.id;
    }

    async function currentUser() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) throw new Error("Inicia sesión para dejar una reseña.");
      const correo = (u.email || `invitado-${u.id}@sonora.local`).toLowerCase();
      const nombre = u.user_metadata?.full_name || u.user_metadata?.name || correo.split("@")[0];
      return { correo, nombre };
    }

    /** id entero del usuario en "usuarios" (null si no existe y create = false) */
    async function usuarioId(create) {
      const { correo, nombre } = await currentUser();
      const found = await run(sb.from("usuarios").select("id").eq("correo", correo).limit(1));
      if (found.length) return found[0].id;
      if (!create) return null;
      return insertRow("usuarios", { nombre, correo, rol: "cliente", fecha_registro: new Date().toISOString() });
    }

    /** ids enteros en "bandas" que corresponden a la banda de la app (por nombre) */
    async function bandaIds(name) {
      const rows = await run(sb.from("bandas").select("id, nombre_banda").ilike("nombre_banda", String(name).trim()));
      return rows.filter((r) => sameName(r.nombre_banda, name)).map((r) => r.id);
    }

    async function bandaId(band) {
      const ids = await bandaIds(band.name);
      if (ids.length) return ids[0];
      return insertRow("bandas", {
        nombre_banda: band.name,
        tarifa_hora: band.hourly_rate,
        descripcion: band.bio || null,
      });
    }

    /** Busca o crea la contratación equivalente a una reserva de la app */
    async function contratacionId(booking, clienteId) {
      const banda = await bandaId(booking.bands);
      const found = await run(
        sb
          .from("contrataciones")
          .select("id")
          .eq("cliente_id", clienteId)
          .eq("banda_id", banda)
          .eq("fecha_evento", booking.event_date)
          .limit(1)
      );
      if (found.length) return found[0].id;
      const row = {
        cliente_id: clienteId,
        banda_id: banda,
        fecha_evento: booking.event_date,
        horas_contratadas: booking.hours,
        total_pago: booking.total,
        estado_pago: booking.tx_hash ? "pagado" : "simulado_pagado",
      };
      try {
        return await insertRow("contrataciones", row);
      } catch (err) {
        if (row.estado_pago === "simulado_pagado") throw err;
        return insertRow("contrataciones", { ...row, estado_pago: "simulado_pagado" });
      }
    }

    return {
      /** Reseñas del usuario, ligadas a sus reservas de la app */
      async mine() {
        const clienteId = await usuarioId(false);
        if (!clienteId) return [];
        const [{ nombre }, contratos, bookings] = await Promise.all([
          currentUser(),
          run(
            sb
              .from("contrataciones")
              .select("id, fecha_evento, bandas(nombre_banda), resenas(id, calificacion, comentario, fecha_publicacion)")
              .eq("cliente_id", clienteId)
          ),
          run(sb.from("bookings").select("id, band_id, event_date, bands(name)").neq("status", "cancelada")),
        ]);
        const out = [];
        for (const c of contratos) {
          const r = (c.resenas || [])[0];
          if (!r) continue;
          const bk = bookings.find(
            (b) => b.event_date === c.fecha_evento && sameName(b.bands?.name, c.bandas?.nombre_banda)
          );
          if (bk) out.push(mapReview({ ...r, reserva_id: bk.id, banda_id: bk.band_id, autor: firstName(nombre) }));
        }
        return out;
      },

      /** Reseñas de contrataciones de una banda (para la pestaña "Reseñas") */
      async ofBand(bandId) {
        const band = await run(sb.from("bands").select("name").eq("id", bandId).maybeSingle());
        if (!band) return [];
        const ids = await bandaIds(band.name);
        if (!ids.length) return [];
        const rows = await run(
          sb
            .from("resenas")
            .select("id, calificacion, comentario, fecha_publicacion, contrataciones!inner(id, banda_id, usuarios(nombre))")
            .in("contrataciones.banda_id", ids)
            .order("fecha_publicacion", { ascending: false })
        );
        return rows.map((r) =>
          mapReview({
            ...r,
            reserva_id: "contratacion-" + r.contrataciones.id,
            banda_id: bandId,
            autor: firstName(r.contrataciones.usuarios?.nombre),
          })
        );
      },

      /** Crea o actualiza la reseña de una reserva */
      async save(bookingId, rating, comment) {
        if (!(rating >= 1 && rating <= 5)) throw new Error("Elige de 1 a 5 estrellas.");
        const booking = await run(
          sb.from("bookings").select("*, bands(name, hourly_rate, bio)").eq("id", bookingId).maybeSingle()
        );
        if (!booking) throw new Error("Solo puedes reseñar bandas que hayas contratado.");
        if (booking.status === "cancelada") throw new Error("No puedes reseñar una reserva cancelada.");

        const clienteId = await usuarioId(true);
        const contratacion = await contratacionId(booking, clienteId);
        const values = {
          calificacion: rating,
          comentario: String(comment || "").trim().slice(0, 500),
          fecha_publicacion: new Date().toISOString(),
        };
        const existing = await run(sb.from("resenas").select("id").eq("contratacion_id", contratacion).limit(1));
        let id;
        if (existing.length) {
          id = existing[0].id;
          await run(sb.from("resenas").update(values).eq("id", id));
        } else {
          id = await insertRow("resenas", { contratacion_id: contratacion, ...values });
        }
        const { nombre } = await currentUser();
        return mapReview({ id, reserva_id: bookingId, banda_id: booking.band_id, autor: firstName(nombre), ...values });
      },
    };
  })();

  window.API = {
    configured,
    demo: false,
    client: sb,

    // ---------- Autenticación ----------
    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    onAuthChange(cb) {
      return sb.auth.onAuthStateChange((_event, session) => cb(session));
    },
    async signUp(name, email, password, role = "cliente") {
      return run(
        sb.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name, role },
            emailRedirectTo: location.origin + location.pathname,
          },
        })
      );
    },
    async signIn(email, password) {
      return run(sb.auth.signInWithPassword({ email, password }));
    },
    /** Marca la cuenta como artista (solo decide a qué app entra; los permisos reales los da RLS) */
    async becomeArtist() {
      return run(sb.auth.updateUser({ data: { role: "artista" } }));
    },
    async signInWithGoogle() {
      return run(
        sb.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: location.origin + location.pathname },
        })
      );
    },
    async signInAsGuest() {
      return run(sb.auth.signInAnonymously());
    },
    async signOut() {
      await sb.auth.signOut();
    },

    // ---------- Perfil ----------
    async getProfile(userId) {
      const data = await run(
        sb.from("profiles").select("full_name").eq("id", userId).maybeSingle()
      );
      return data;
    },

    // ---------- Catálogo ----------
    async getBands() {
      const data = await run(
        sb
          .from("bands")
          .select(`*, packages(*), songs(${SONG_COLS})`)
          .order("rating", { ascending: false })
      );
      return data.map(mapBand);
    },

    // ---------- Reservas ----------
    async getBookings() {
      const data = await run(
        sb
          .from("bookings")
          .select("*, bands(name, avatar)")
          .neq("status", "cancelada")
          .order("event_date", { ascending: true })
      );
      return data.map(mapBooking);
    },
    async getBookedDates(bandId) {
      const data = await run(sb.rpc("band_booked_dates", { p_band_id: bandId }));
      return (data || []).map((r) => (typeof r === "string" ? r : r.band_booked_dates || r.event_date));
    },
    async createBooking({ bandId, eventDate, time, hours, address }) {
      const data = await run(
        sb
          .from("bookings")
          .insert({ band_id: bandId, event_date: eventDate, event_time: time, hours, address })
          .select("*, bands(name, avatar)")
          .single()
      );
      return mapBooking(data);
    },
    /** Guarda el hash del pago en blockchain (función set_booking_tx de Supabase) */
    async setBookingTx(id, txHash) {
      await run(sb.rpc("set_booking_tx", { p_booking_id: id, p_tx_hash: txHash }));
    },
    async cancelBooking(id) {
      await run(sb.from("bookings").update({ status: "cancelada" }).eq("id", id));
    },

    // ---------- Bazar digital ----------
    async getPurchasedSongIds() {
      const data = await run(sb.from("song_purchases").select("song_id"));
      return data.map((r) => r.song_id);
    },
    /** Canciones compradas, con su banda (para "Mis canciones" del perfil) */
    async getMyPurchases() {
      const rows = await run(
        sb
          .from("song_purchases")
          .select(`song_id, price, created_at, songs(${SONG_COLS}, bands(name, avatar))`)
          .order("created_at", { ascending: false })
      );
      return rows.map(mapPurchase);
    },
    /** Dirección del audio: Supabase solo la entrega si compraste la canción */
    async getSongAudio(songId) {
      const { data, error } = await sb.rpc("song_audio_url", { p_song_id: songId });
      if (!error) return data || null;
      // Sin supabase/canciones.sql la función no existe: se lee la columna directamente
      if (!/song_audio_url|function|schema cache/i.test(error.message)) throw new Error(friendly(error));
      const row = await run(sb.from("songs").select("audio_url").eq("id", songId).maybeSingle());
      return row?.audio_url || null;
    },
    async buySong(songId, txHash) {
      const row = { song_id: songId };
      if (txHash) row.tx_hash = txHash;
      await run(sb.from("song_purchases").insert(row));
    },

    // ---------- Reseñas ----------
    // Bandas contratadas → tablas existentes usuarios / bandas / contrataciones / resenas
    // Canciones compradas → se guardan en el navegador (resenas solo admite contrataciones)
    async getMyReviews() {
      const local = await songReviewsLocal.getMyReviews();
      let bookings = [];
      try {
        bookings = await Resenas.mine();
      } catch (err) {
        console.warn("[reseñas] No se pudieron leer tus reseñas:", err.message);
      }
      return { bookings, songs: local.songs };
    },
    async getBandReviews(bandId) {
      const [events, songs] = await Promise.all([Resenas.ofBand(bandId), songReviewsLocal.getBandReviews(bandId)]);
      return [...events, ...songs].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },
    async saveBookingReview({ bookingId, rating, comment }) {
      return Resenas.save(bookingId, rating, comment);
    },
    saveSongReview: (args) => songReviewsLocal.saveSongReview(args),

    // ---------- Recomendaciones "Para ti" ----------
    ...makeRecsStore(async () => {
      const { data } = await sb.auth.getSession();
      return data.session?.user?.id;
    }),
  };
})();
