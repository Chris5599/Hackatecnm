/**
 * API del Panel de Artistas. Todas las llamadas a Supabase viven aquí.
 * Si js/config.js no está configurado, funciona en MODO DEMO (localStorage).
 */
(function () {
  const CFG = window.SONORA_CONFIG;
  const SHARE = CFG.ARTIST_SHARE ?? 0.95;
  const configured =
    CFG.SUPABASE_URL.startsWith("https://") &&
    !CFG.SUPABASE_URL.includes("TU-PROYECTO") &&
    !CFG.SUPABASE_ANON_KEY.startsWith("TU-");

  // ---------- Conversión fila BD → objeto de la UI ----------
  const mapBand = (r) => ({
    id: r.id,
    name: r.name,
    genre: r.genre,
    hourlyRate: r.hourly_rate,
    bio: r.bio || "",
    availability: r.availability || [],
    rating: Number(r.rating || 0),
  });
  const mapMember = (r) => ({
    id: r.id,
    name: r.name,
    role: r.role || "",
    share: Number(r.share),
    wallet: r.wallet || "",
  });
  const mapSong = (r) => ({
    id: r.id,
    title: r.title,
    duration: r.duration || "",
    price: r.price,
    audioUrl: r.audio_url || "",
    published: r.published !== false,
    createdOrder: r.sort_order ?? 0,
  });
  const mapBooking = (r) => ({
    id: r.id,
    kind: "booking",
    eventDate: r.event_date,
    time: r.event_time,
    hours: r.hours,
    address: r.address,
    total: r.total,
    artist: r.artist_amount,
    coop: r.coop_amount,
    status: r.status,
    txHash: r.tx_hash || "",
    createdAt: r.created_at,
  });
  const mapSale = (r) => ({
    id: r.user_id + ":" + r.song_id,
    kind: "sale",
    songId: r.song_id,
    songTitle: r.songs?.title ?? "",
    total: r.price,
    artist: r.artist_amount,
    coop: r.coop_amount,
    status: "confirmada",
    txHash: r.tx_hash || "",
    createdAt: r.created_at,
  });

  function friendly(error) {
    const m = (error?.message || "").toLowerCase();
    if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
    if (m.includes("user already registered")) return "Ya existe una cuenta con ese correo. Inicia sesión.";
    if (m.includes("email not confirmed")) return "Confirma tu correo antes de iniciar sesión.";
    if (m.includes("band_members_wallet_check")) return "Una dirección de cobro no es válida (debe ser 0x seguida de 40 caracteres).";
    if (m.includes("band_members_name_check")) return "Cada integrante necesita un nombre de al menos 2 letras.";
    if (m.includes("band_members_share_check")) return "Cada porcentaje debe ser mayor a 0 y máximo 100.";
    if (m.includes("bands_pkey") || m.includes("duplicate key")) return "Ese registro ya existe.";
    if (m.includes("payload too large") || m.includes("exceeded the maximum")) return "El archivo es demasiado grande.";
    if (m.includes("failed to fetch")) return "No hay conexión con el servidor.";
    return error?.message || "Ocurrió un error inesperado.";
  }
  async function run(p) {
    const { data, error } = await p;
    if (error) throw new Error(friendly(error));
    return data;
  }

  // ===================================================================
  // MODO DEMO
  // ===================================================================
  if (!configured) {
    const KEY = "sonora_artist_demo";
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const load = () => {
      try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
    };
    const save = () => {
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
    };
    const hex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    const hash = () => "0x" + hex(64);
    const wallet = () => "0x" + hex(40);
    // Fecha a "offset" días, movida al siguiente día en que la banda toca (Mi, V, S)
    const iso = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      while (![3, 5, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const stamp = (offset) => new Date(Date.now() + offset * 86400000).toISOString();
    const split = (t) => {
      const coop = Math.round(t * (1 - SHARE));
      return { artist_amount: t - coop, coop_amount: coop };
    };

    function seed() {
      const band = {
        id: "demo-vortice", name: "Vórtice", genre: "Rock Alternativo", hourly_rate: 1500, rating: 4.8,
        bio: "Rock alternativo con energía de estadio. Originales y covers de los 90 y 2000.",
        availability: ["Miércoles", "Viernes", "Sábado"],
      };
      const members = [
        { id: "m1", name: "Andrea Ruiz", role: "Voz", share: 40, wallet: wallet() },
        { id: "m2", name: "Diego Mora", role: "Guitarra", share: 30, wallet: wallet() },
        { id: "m3", name: "Sofía Lara", role: "Batería", share: 30, wallet: null },
      ];
      const songs = [
        ["vx-s1", "Gravedad Cero", "3:51"],
        ["vx-s2", "Luces de Neón", "4:12"],
        ["vx-s3", "Eco", "3:33"],
        ["vx-s4", "Tormenta Eléctrica", "4:40"],
      ].map(([id, title, duration], i) => ({ id, title, duration, price: 20, audio_url: null, published: true, sort_order: i }));
      const bk = (dayOffset, created, time, hours, address, status, tx) => {
        const total = hours * band.hourly_rate;
        return {
          id: "bk-" + hex(8), event_date: iso(dayOffset), event_time: time, hours, address, total,
          ...split(total), status, tx_hash: tx ? hash() : null, created_at: stamp(created),
        };
      };
      const bookings = [
        bk(-40, -60, "20:00", 3, "Salón Los Arcos, Col. Centro", "confirmada", true),
        bk(-21, -35, "18:00", 2, "Jardín Las Palmas, Col. San Felipe", "confirmada", true),
        bk(-9, -20, "21:00", 2, "Bar El Faro, Av. Juárez 410", "confirmada", true),
        bk(-3, -14, "16:00", 3, "Calle Aldama 88, Col. Obrera", "cancelada", true),
        bk(5, -6, "20:00", 3, "Terraza Altavista, Col. Campestre", "confirmada", true),
        bk(12, -1, "18:00", 4, "Hacienda San Marcos, km 12", "confirmada", false),
      ];
      const sales = [];
      const plan = [["vx-s1", 6], ["vx-s2", 4], ["vx-s3", 2], ["vx-s4", 1]];
      let n = 0;
      plan.forEach(([sid, count]) => {
        for (let i = 0; i < count; i++) {
          n++;
          sales.push({
            user_id: "u" + n, song_id: sid, price: 20, ...split(20),
            tx_hash: n > 11 ? null : hash(), created_at: stamp(-50 + n * 3.7),
          });
        }
      });
      return { band, members, songs, bookings, sales };
    }

    let db = load() || seed();
    delete db.session; // versiones anteriores tenían sesión propia

    // La sesión es la misma que la de la app de clientes (login único)
    const AUTH_KEY = "sonora_demo";
    const readAuth = () => {
      try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || {}; } catch { return {}; }
    };

    window.API = {
      demo: true,
      async getSession() { return readAuth().session || null; },
      onAuthChange(cb) { setTimeout(() => cb(readAuth().session || null), 0); },
      async signOut() {
        const a = readAuth();
        a.session = null;
        try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); } catch {}
      },

      async getMyBand() { await wait(250); return db.band ? mapBand(db.band) : null; },
      async saveBand(b) {
        await wait(400);
        db.band = {
          ...(db.band || { id: "demo-" + hex(6), rating: 0 }),
          name: b.name, genre: b.genre, hourly_rate: b.hourlyRate, bio: b.bio, availability: b.availability,
        };
        save();
        return mapBand(db.band);
      },

      async getMembers() { return db.members.map(mapMember); },
      async saveMembers(_bandId, members) {
        await wait(500);
        const total = members.reduce((s, m) => s + Number(m.share), 0);
        if (Math.round(total * 100) !== 10000) throw new Error(`Los porcentajes deben sumar 100%; ahora suman ${total} %.`);
        db.members = members.map((m, i) => ({ id: "m" + i + hex(4), ...m, wallet: m.wallet || null }));
        save();
        return db.members.map(mapMember);
      },

      async getSongs() { return db.songs.map(mapSong); },
      async uploadSong({ title, price, duration, file }) {
        await wait(1200);
        const row = {
          id: "s-" + hex(10), title, duration, price, published: true, sort_order: db.songs.length,
          // En demo el audio solo vive en esta sesión del navegador
          audio_url: file ? URL.createObjectURL(file) : null,
        };
        db.songs.push(row);
        save();
        return mapSong(row);
      },
      async setSongPublished(id, published) {
        const s = db.songs.find((x) => x.id === id);
        if (s) s.published = published;
        save();
      },

      async getBookings() { return db.bookings.map(mapBooking); },
      async getSales() {
        return db.sales.map((r) => mapSale({ ...r, songs: { title: db.songs.find((s) => s.id === r.song_id)?.title } }));
      },
    };
    return;
  }

  // ===================================================================
  // SUPABASE
  // ===================================================================
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const slug = (t) =>
    t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "banda";

  window.API = {
    demo: false,

    // El inicio de sesión se hace en la app de clientes; aquí solo se lee la sesión compartida
    async getSession() { return (await sb.auth.getSession()).data.session; },
    onAuthChange(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s)); },
    async signOut() { await sb.auth.signOut(); },

    // ---------- Banda ----------
    async getMyBand() {
      const { data: u } = await sb.auth.getUser();
      const row = await run(sb.from("bands").select("*").eq("owner_id", u.user.id).limit(1).maybeSingle());
      return row ? mapBand(row) : null;
    },
    async saveBand(b, existingId) {
      const fields = { name: b.name, genre: b.genre, hourly_rate: b.hourlyRate, bio: b.bio, availability: b.availability };
      if (existingId) {
        return mapBand(await run(sb.from("bands").update(fields).eq("id", existingId).select().single()));
      }
      const { data: u } = await sb.auth.getUser();
      const id = `${slug(b.name)}-${Math.random().toString(36).slice(2, 6)}`;
      return mapBand(await run(sb.from("bands").insert({ id, owner_id: u.user.id, ...fields }).select().single()));
    },

    // ---------- Integrantes ----------
    async getMembers(bandId) {
      const rows = await run(sb.from("band_members").select("*").eq("band_id", bandId).order("sort_order"));
      return rows.map(mapMember);
    },
    async saveMembers(bandId, members) {
      const rows = await run(sb.rpc("save_band_members", { p_band_id: bandId, p_members: members }));
      return rows.map(mapMember);
    },

    // ---------- Canciones ----------
    async getSongs(bandId) {
      const rows = await run(sb.from("songs").select("*").eq("band_id", bandId).order("sort_order"));
      return rows.map(mapSong);
    },
    async uploadSong({ bandId, title, price, duration, file, order }) {
      const ext = (file.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${bandId}/${Date.now()}-${slug(title)}.${ext}`;
      await run(sb.storage.from("songs").upload(path, file, { contentType: file.type || "audio/mpeg", upsert: false }));
      const { data: pub } = sb.storage.from("songs").getPublicUrl(path);
      const row = await run(
        sb.from("songs")
          .insert({ band_id: bandId, title, price, duration, audio_url: pub.publicUrl, sort_order: order })
          .select().single()
      );
      return mapSong(row);
    },
    async setSongPublished(id, published) {
      await run(sb.from("songs").update({ published }).eq("id", id));
    },

    // ---------- Ingresos y trazabilidad ----------
    async getBookings(bandId) {
      const rows = await run(
        sb.from("bookings")
          .select("id, event_date, event_time, hours, address, total, artist_amount, coop_amount, status, tx_hash, created_at")
          .eq("band_id", bandId)
          .order("created_at", { ascending: false })
      );
      return rows.map(mapBooking);
    },
    async getSales(bandId) {
      const rows = await run(
        sb.from("song_purchases")
          .select("user_id, song_id, price, artist_amount, coop_amount, tx_hash, created_at, songs!inner(title, band_id)")
          .eq("songs.band_id", bandId)
          .order("created_at", { ascending: false })
      );
      return rows.map(mapSale);
    },
  };
})();
