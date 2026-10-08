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
    const db = Object.assign({ session: null, users: {}, bookings: [], purchases: [] }, load());
    const listeners = [];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const uid = () => db.session?.user?.id;

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
      async buySong(songId, txHash) {
        await wait(900);
        if (db.purchases.some((p) => p.user_id === uid() && p.song_id === songId)) {
          throw new Error("Ya tienes esta canción.");
        }
        db.purchases.push({ user_id: uid(), song_id: songId });
        save(db);
      },
    };
    return;
  }

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
          .select("*, packages(*), songs(*)")
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
    async buySong(songId, txHash) {
      const row = { song_id: songId };
      if (txHash) row.tx_hash = txHash;
      await run(sb.from("song_purchases").insert(row));
    },
  };
})();
