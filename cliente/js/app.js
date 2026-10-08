/**
 * SONORA · App cliente (HTML + CSS + JS puro, datos en Supabase)
 * Equivalente a app/page.tsx + components/*.tsx del proyecto Next.js original.
 */
(function () {
  "use strict";

  // =====================================================================
  // Utilidades
  // =====================================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const TIME_SLOTS = ["12:00", "14:00", "16:00", "18:00", "20:00", "21:00"];
  const SECTIONS = [
    { key: "talento", title: "Impulsando el Talento Local" },
    { key: "tradiciones", title: "Rescate de Tradiciones" },
    { key: "nuevas", title: "Nuevas Voces" },
  ];

  const mxnFmt = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
  const mxn = (n) => mxnFmt.format(n || 0);

  /** Escapa texto para insertarlo en HTML (evita XSS con datos de la BD) */
  const esc = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const plural = (n) => (n === 1 ? "hora" : "horas");
  const pad = (n) => String(n).padStart(2, "0");
  const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const short = (d, opt) => d.toLocaleDateString("es-MX", opt).replace(".", "");

  function dayLabel(iso) {
    const d = parseISO(iso);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    const wd = diff === 0 ? "Hoy" : diff === 1 ? "Mañana" : short(d, { weekday: "short" });
    return `${wd} ${d.getDate()} ${short(d, { month: "short" })}`;
  }

  function nextDays(n = 14) {
    return Array.from({ length: n }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return {
        key: isoLocal(d),
        dow: d.getDay(),
        weekday: i === 0 ? "Hoy" : i === 1 ? "Mañana" : short(d, { weekday: "short" }),
        day: d.getDate(),
        month: short(d, { month: "short" }),
      };
    });
  }

  // ---------- Reparto del dinero ----------
  const SHARE = window.SONORA_CONFIG.ARTIST_SHARE ?? 0.95;
  const COOP_NAME = window.SONORA_CONFIG.COOP_NAME || "Cooperación Sonora";
  const pct = (x) => Math.round(x * 100) + "%";
  /** Divide un monto: 95 % para la banda y 5 % para la cooperación */
  function split(amount) {
    const coop = Math.round(amount * (1 - SHARE));
    return { artist: amount - coop, coop };
  }
  function splitRowsHTML(amount, bandName) {
    const { artist, coop } = split(amount);
    return `
      <div class="split">
        <p class="split-title">¿A dónde va tu dinero?</p>
        <div class="split-bar" aria-hidden="true"><span style="width:${SHARE * 100}%"></span></div>
        <div class="sum-row"><span class="lab"><i class="dot dot-artist"></i>Para ${esc(bandName)} (${pct(SHARE)})</span><b>${mxn(artist)}</b></div>
        <div class="sum-row"><span class="lab"><i class="dot dot-coop"></i>${esc(COOP_NAME)} (${pct(1 - SHARE)})</span><b>${mxn(coop)}</b></div>
      </div>`;
  }

  // ---------- Reglas de agenda ----------
  const DAY_NAMES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const norm = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const CLOSING_HOUR = 23; // los eventos deben terminar a más tardar a las 23:00
  const MIN_LEAD_HOURS = 2; // anticipación mínima para reservar el mismo día
  const hourOf = (t) => Number(t.split(":")[0]);

  /** ¿La banda trabaja ese día de la semana? (sin lista = todos los días) */
  function worksOn(band, dow) {
    if (!band.availability.length) return true;
    return band.availability.map(norm).includes(DAY_NAMES[dow]);
  }
  /** ¿El horario todavía se puede reservar en esa fecha? */
  function slotOpen(dayKey, slot) {
    if (dayKey !== isoLocal(new Date())) return true;
    return hourOf(slot) >= new Date().getHours() + MIN_LEAD_HOURS;
  }
  const maxHoursFor = (slot) => Math.max(1, Math.min(8, CLOSING_HOUR - hourOf(slot)));

  /** Motivo por el que un día no se puede elegir ("" si está disponible) */
  function dayBlockReason(band, d, booked) {
    if (!worksOn(band, d.dow)) return "No trabaja";
    if (booked.has(d.key)) return "Ocupado";
    if (!TIME_SLOTS.some((t) => slotOpen(d.key, t))) return "Sin horario";
    return "";
  }
  function availabilityText(band) {
    const a = band.availability;
    if (!a.length) return "todos los días";
    return a.length === 1 ? a[0] : a.slice(0, -1).join(", ") + " y " + a[a.length - 1];
  }

  const isUpcoming = (b) => b.status !== "completada" && b.eventDate >= isoLocal(new Date());

  let toastTimer;
  function toast(msg, isError = false) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.className = "toast" + (isError ? " err" : "");
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 3200);
  }

  /** Re-renderiza un contenedor conservando el scroll de un hijo */
  function keepScroll(container, scrollSel, renderFn) {
    const prev = container.querySelector(scrollSel);
    const top = prev ? prev.scrollTop : 0;
    renderFn();
    const next = container.querySelector(scrollSel);
    if (next) next.scrollTop = top;
  }

  const GOOGLE_SVG = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 18.9 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>`;

  // =====================================================================
  // Estado global
  // =====================================================================
  const S = {
    booting: true,
    session: null,
    loadedUserId: null,
    userName: "",
    userEmail: "",
    isGuest: false,

    tab: "inicio",
    query: "",

    bands: [],
    bandsStatus: "idle", // idle | loading | ok | error
    bandsError: "",

    bookings: [],
    purchased: new Set(),
    myPurchases: [], // canciones compradas con su banda (Perfil → Mis canciones)
    buyingSongId: null,
    playingSongId: null,
    loadingSongId: null, // pidiendo el audio de una canción comprada
    cancelingId: null,
    releasingId: null,

    decisions: new Map(), // bandId -> "match" | "skip" (sección "Para ti")
    recsBusy: false, // procesando una respuesta de recomendación

    myReviews: { bookings: new Map(), songs: new Map() }, // reseñas propias: bookingId / songId -> reseña
    bandReviews: {}, // bandId -> { status: loading | ok | error, list, error }
    reviewSheet: null, // { kind: booking | song, targetId, bandId, title, subtitle, img, rating, comment, existing, step, error }

    selectedBandId: null,
    bandTab: "contratar",
    packageId: null,

    sheet: null, // { bandId, dayKey, time, hours, address, step, error, result }
    songSheet: null, // { songId, step: confirm | processing, error }

    auth: { mode: "login", loading: null, error: "", notice: "", name: "", email: "", password: "", showPw: false, role: "cliente" },
  };

  // ---------- Una sola cuenta para clientes y artistas ----------
  const ARTIST_URL = "../artista/index.html";
  const VIEW_AS_CLIENT = "sonora_vista_cliente"; // el artista eligió ver la app de clientes
  const isArtist = (session) => session?.user?.user_metadata?.role === "artista";
  function goToArtistPanel() {
    try { sessionStorage.removeItem(VIEW_AS_CLIENT); } catch {}
    S.booting = true;
    render();
    location.href = ARTIST_URL;
  }
  const CHOSEN_ROLE = "sonora_rol_elegido";
  function rememberRole(role) {
    try { sessionStorage.setItem(CHOSEN_ROLE, role); } catch {}
  }
  function takeChosenRole() {
    try {
      const r = sessionStorage.getItem(CHOSEN_ROLE);
      sessionStorage.removeItem(CHOSEN_ROLE);
      return r;
    } catch { return null; }
  }
  function wantsClientView() {
    try { return sessionStorage.getItem(VIEW_AS_CLIENT) === "1"; } catch { return false; }
  }

  const app = document.getElementById("app");
  const bandById = (id) => S.bands.find((b) => b.id === id);
  let audio = null;

  // ---------- Recomendaciones "Para ti" ----------
  /** Hash estable de una cadena (para un orden de recomendación "personalizado") */
  function strHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  /** Cola de recomendaciones: las bandas de la BD que aún no has revisado */
  function recQueue() {
    const seed = strHash(S.loadedUserId || "invitado");
    return [...S.bands]
      .sort((a, b) => ((strHash(a.id) + seed) % 997) - ((strHash(b.id) + seed) % 997))
      .filter((b) => !S.decisions.has(b.id));
  }
  /** Las bandas que aceptaste (tus matches) */
  function matchesList() {
    return [...S.decisions.entries()]
      .filter(([, st]) => st === "match")
      .map(([id]) => bandById(id))
      .filter(Boolean);
  }

  // =====================================================================
  // Render raíz
  // =====================================================================
  function render() {
    if (S.booting) {
      app.innerHTML = `<div class="boot">${icon("loader", 28, "spin")}</div>`;
      return;
    }
    if (!S.session) {
      renderOnboarding();
      return;
    }
    if (!$("#screen")) {
      app.innerHTML = `
        <div id="nav"></div>
        <main id="screen"></main>
        <div id="band-layer"></div>
        <div id="sheet-layer"></div>
        <div id="song-layer"></div>
        <div id="review-layer"></div>
        <div id="tabbar"></div>`;
    }
    renderNav();
    renderScreen();
    renderBand();
    renderSheet();
    renderSongSheet();
    renderReviewSheet();
  }

  // =====================================================================
  // 1. ONBOARDING
  // =====================================================================
  function captureAuthFields() {
    const a = S.auth;
    const n = $("#f-name"), e = $("#f-email"), p = $("#f-password");
    if (n) a.name = n.value;
    if (e) a.email = e.value;
    if (p) a.password = p.value;
  }

  function wordmark(light = false) {
    return `<div class="wordmark ${light ? "light" : ""}">${icon("music", 20)}<span>sonora</span></div>`;
  }

  function renderOnboarding() {
    const a = S.auth;
    const signup = a.mode === "signup";
    const busy = a.loading !== null || !API.configured;

    app.innerHTML = `
    <div class="auth">
      <aside class="auth-aside">
        ${wordmark(true)}
        <p class="auth-claim">La música de tu evento, directo con las bandas locales.</p>
      </aside>

      <section class="auth-main">
        <div class="auth-box">
          <div class="auth-logo">${wordmark()}</div>

          ${
            API.demo
              ? `<div class="demo-note">${icon("alert", 18)}<div><b>Modo demo:</b> puedes entrar con cualquier correo y contraseña. Los datos se guardan solo en este navegador. Para usar tu base de datos, configura <code>js/config.js</code>.</div></div>`
              : ""
          }

          <p class="role-q">¿Cómo quieres usar Sonora?</p>
          <div class="role-pick" role="radiogroup" aria-label="¿Cómo quieres usar Sonora?">
                    <button type="button" class="role-opt ${a.role === "cliente" ? "on" : ""}" data-action="pick-role" data-role="cliente" role="radio" aria-checked="${a.role === "cliente"}">
                      ${icon("calendar-days", 18)}<b>Quiero contratar</b><small>Reservar bandas y comprar música</small>
                    </button>
                    <button type="button" class="role-opt ${a.role === "artista" ? "on" : ""}" data-action="pick-role" data-role="artista" role="radio" aria-checked="${a.role === "artista"}">
                      ${icon("music", 18)}<b>Soy artista o banda</b><small>Gestionar mi música e ingresos</small>
                    </button>
          </div>

          <h1 class="auth-title">${signup ? "Crea tu cuenta" : "Inicia sesión"}${a.role === "artista" ? " de artista" : ""}</h1>

          <form id="auth-form" class="form" novalidate>
            ${
              signup
                ? `<div>
                    <label for="f-name" class="label">Nombre</label>
                    <input id="f-name" class="input" type="text" autocomplete="name" placeholder="Ana" value="${esc(a.name)}">
                  </div>`
                : ""
            }
            <div>
              <label for="f-email" class="label">Correo</label>
              <input id="f-email" class="input" type="email" autocomplete="email" placeholder="tu@correo.com" value="${esc(a.email)}">
            </div>
            <div>
              <label for="f-password" class="label">Contraseña</label>
              <div class="pw-wrap">
                <input id="f-password" class="input" type="${a.showPw ? "text" : "password"}"
                  autocomplete="${signup ? "new-password" : "current-password"}"
                  placeholder="Mínimo 6 caracteres" value="${esc(a.password)}">
                <button type="button" class="pw-toggle" data-action="toggle-pw"
                  aria-label="${a.showPw ? "Ocultar contraseña" : "Mostrar contraseña"}">
                  ${icon(a.showPw ? "eye-off" : "eye", 17)}
                </button>
              </div>
            </div>

            ${a.error ? `<p role="alert" class="alert">${esc(a.error)}</p>` : ""}
            ${a.notice ? `<p role="status" class="notice">${esc(a.notice)}</p>` : ""}

            <button type="submit" class="btn-primary" ${busy ? "disabled" : ""}>
              ${
                a.loading === "email"
                  ? `${icon("loader", 17, "spin")} ${signup ? "Creando tu cuenta segura…" : "Entrando…"}`
                  : signup ? "Crear cuenta" : "Iniciar sesión"
              }
            </button>
          </form>

          <div class="divider">o</div>

          <button type="button" class="btn-google" data-action="google" ${busy ? "disabled" : ""}>
            ${a.loading === "google" ? icon("loader", 18, "spin") : GOOGLE_SVG}
            Continuar con Google
          </button>

          <div class="auth-links">
            <p class="muted">
              ${signup ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"}
              <button type="button" class="link-strong" data-action="switch-mode">${signup ? "Inicia sesión" : "Crea una"}</button>
            </p>
            ${
              a.role === "cliente"
                ? `<button type="button" class="link-muted" data-action="guest" ${busy ? "disabled" : ""}>
                    ${a.loading === "guest" ? "Entrando…" : "Continuar como invitado"}
                  </button>`
                : ""
            }
          </div>

          <p class="legal">Al continuar aceptas los Términos de uso y la Política de privacidad.</p>
        </div>
      </section>
    </div>`;
  }

  async function handleAuthSubmit() {
    captureAuthFields();
    const a = S.auth;
    const signup = a.mode === "signup";
    a.error = "";
    a.notice = "";

    if (signup && a.name.trim().length < 2) return setAuthError("Escribe tu nombre.");
    if (!/^\S+@\S+\.\S+$/.test(a.email.trim())) return setAuthError("Ingresa un correo válido.");
    if (a.password.length < 6) return setAuthError("La contraseña debe tener al menos 6 caracteres.");

    a.loading = "email";
    rememberRole(a.role);
    renderOnboarding();
    try {
      if (signup) {
        const data = await API.signUp(a.name.trim(), a.email.trim(), a.password, a.role);
        if (!data.session) {
          // Supabase tiene activada la confirmación por correo
          a.mode = "login";
          a.password = "";
          a.notice = "Te enviamos un correo para confirmar tu cuenta. Después inicia sesión.";
        }
      } else {
        await API.signIn(a.email.trim(), a.password);
      }
    } catch (err) {
      a.error = err.message;
    } finally {
      a.loading = null;
      if (!S.session) renderOnboarding();
    }
  }

  function setAuthError(msg) {
    S.auth.error = msg;
    renderOnboarding();
  }

  async function startAuth(kind) {
    if (S.auth.loading || !API.configured) return;
    captureAuthFields();
    S.auth.error = "";
    S.auth.notice = "";
    S.auth.loading = kind;
    rememberRole(kind === "guest" ? "cliente" : S.auth.role);
    renderOnboarding();
    try {
      if (kind === "google") await API.signInWithGoogle(); // redirige a Google
      else await API.signInAsGuest();
    } catch (err) {
      S.auth.loading = null;
      S.auth.error = err.message;
      renderOnboarding();
    }
  }

  // =====================================================================
  // Navegación (desktop + tab bar móvil)
  // =====================================================================
  const TABS = [
    { key: "inicio", label: "Inicio", icon: "home" },
    { key: "reservas", label: "Mis Reservas", icon: "calendar-days" },
    { key: "perfil", label: "Perfil", icon: "user" },
  ];

  function upcomingCount() {
    return S.bookings.filter(isUpcoming).length;
  }

  function renderNav() {
    const count = upcomingCount();
    const initial = S.userName.trim().charAt(0).toUpperCase() || "S";

    $("#nav").innerHTML = `
    <header class="desk-nav">
      <div class="desk-nav-inner">
        <div class="brand-mark">
          <span class="brand-badge">${icon("music", 18, "fill-white")}</span>
          <span class="brand-name">sonora</span>
        </div>
        <nav class="pill-tabs" aria-label="Secciones">
          ${TABS.map(
            (t) => `
            <button class="pill-tab ${S.tab === t.key ? "active" : ""}" data-action="tab" data-tab="${t.key}">
              ${icon(t.icon, 15)} ${t.label}
              ${t.key === "reservas" && count > 0 ? `<span class="pill-count">${count}</span>` : ""}
            </button>`
          ).join("")}
        </nav>
        <div class="user-area">
          <span class="avatar-circle">${esc(initial)}</span>
          <button class="icon-btn" data-action="logout" aria-label="Cerrar sesión">${icon("log-out", 17)}</button>
        </div>
      </div>
    </header>`;

    $("#tabbar").innerHTML = `
    <nav class="tab-bar" aria-label="Secciones">
      <div class="tab-bar-grid">
        ${TABS.map(
          (t) => `
          <button class="tab-btn ${S.tab === t.key ? "active" : ""}" data-action="tab" data-tab="${t.key}">
            <span class="tab-icon">
              ${icon(t.icon, 22)}
              ${t.key === "reservas" && count > 0 ? `<span class="badge">${count}</span>` : ""}
            </span>
            <span class="tab-label">${t.label}</span>
          </button>`
        ).join("")}
      </div>
    </nav>`;
  }

  function renderScreen() {
    const el = $("#screen");
    if (S.tab === "inicio") el.innerHTML = homeHTML();
    else if (S.tab === "reservas") el.innerHTML = reservasHTML();
    else el.innerHTML = perfilHTML();
  }

  // =====================================================================
  // 2. HOME
  // =====================================================================
  function homeHTML() {
    const first = S.userName.split(" ")[0] || S.userName;
    return `
    <div class="screen-pad">
      <header class="home-header">
        <h1 class="h1">Hola, ${esc(first)}</h1>
        <label class="search">
          ${icon("search", 18)}
          <input id="search" type="search" placeholder="Buscar bandas o géneros" aria-label="Buscar bandas" value="${esc(S.query)}">
        </label>
      </header>
      <div id="home-results">${homeResultsHTML()}</div>
    </div>`;
  }

  function homeResultsHTML() {
    if (S.bandsStatus === "loading" || S.bandsStatus === "idle") {
      const sk = `<div class="sk-card"><div class="skeleton sk-img"></div><div class="skeleton sk-line" style="width:70%"></div><div class="skeleton sk-line" style="width:45%"></div></div>`;
      return [1, 2].map(() => `
        <section class="section">
          <div class="px"><div class="skeleton sk-line" style="width:12rem;height:1rem;margin:0"></div></div>
          <div class="carousel no-scrollbar px">${sk.repeat(4)}</div>
        </section>`).join("");
    }
    if (S.bandsStatus === "error") {
      return `<div class="error-box">${esc(S.bandsError)}<br><button data-action="reload-bands">Reintentar</button></div>`;
    }

    const q = S.query.trim().toLowerCase();
    const visible = q
      ? S.bands.filter((b) => `${b.name} ${b.genre}`.toLowerCase().includes(q))
      : S.bands;

    if (S.bands.length === 0) {
      return `<p class="empty-search">Todavía no hay bandas registradas. Ejecuta <b>supabase/seed.sql</b> para cargar las de ejemplo.</p>`;
    }

    const recs = recsHTML();
    if (visible.length === 0) {
      return recs + `<p class="empty-search">No encontramos bandas para “${esc(S.query)}”.</p>`;
    }

    return (
      recs +
      SECTIONS.map(({ key, title }) => {
        const list = visible.filter((b) => b.sections.includes(key));
        if (!list.length) return "";
        return `
        <section class="section">
          <h2 class="section-title px">${title}</h2>
          <div class="carousel no-scrollbar px">
            ${list.map(bandCardHTML).join("")}
          </div>
        </section>`;
      }).join("")
    );
  }

  function bandCardHTML(b) {
    return `
    <button class="band-card" data-action="open-band" data-id="${esc(b.id)}">
      <img src="${esc(b.cover)}" alt="Portada de ${esc(b.name)}" loading="lazy">
      <h3 class="truncate">${esc(b.name)}</h3>
      <p class="genre truncate">${esc(b.genre)}</p>
      <p class="meta">
        ${b.reviews ? `${icon("star", 12, "fill-brand")} <b>${b.rating.toFixed(1)}</b>` : `<b class="brand">Nueva</b>`}
        <span class="muted">· ${mxn(b.hourlyRate)} / hora</span>
      </p>
    </button>`;
  }

  // =====================================================================
  // 2.1 RECOMENDACIONES "PARA TI" (aceptar o rechazar, estilo match)
  // =====================================================================
  function recsHTML() {
    const queue = recQueue();
    const matches = matchesList();
    if (!S.bands.length) return "";

    let html = `
    <section class="section">
      <h2 class="section-title px">Para ti</h2>
      <p class="section-sub px">Recomendaciones para tu evento</p>`;

    if (queue.length) {
      const band = queue[0];
      const busy = S.recsBusy;
      html += `
      <div class="rec-frame">
        ${deckHTML(band)}
        <div class="rec-actions">
          <button class="rec-btn no" data-action="rec-no" aria-label="No me interesa ${esc(band.name)}" ${busy ? "disabled" : ""}>
            ${icon("x", 22)}
          </button>
          <button class="rec-btn yes" data-action="rec-yes" aria-label="Me gusta ${esc(band.name)}" ${busy ? "disabled" : ""}>
            ${icon("check", 22)}
          </button>
        </div>
        <p class="rec-count">${busy ? "Guardando…" : `${S.bands.length - S.decisions.size} bandas por revisar`}</p>
      </div>`;
    } else {
      const busy = S.recsBusy;
      html += `
      <div class="rec-done">
        <div class="empty-ring">${icon("check", 30)}</div>
        <h2 class="rec-done-title">¡Ya revisaste todas las recomendaciones!</h2>
        <p>Cuando quieras puedes volver a ver las bandas.</p>
        <button class="btn-secondary auto" data-action="reset-recs" ${busy ? "disabled" : ""}>
          ${busy ? `${icon("loader", 15, "spin")} Reiniciando…` : "Ver recomendaciones de nuevo"}
        </button>
      </div>`;
    }

    html += `</section>`;

    if (matches.length) {
      html += `
      <section class="section">
        <h2 class="section-title px">Tus matches</h2>
        <div class="carousel no-scrollbar px">
          ${matches.map(matchCardHTML).join("")}
        </div>
      </section>`;
    }

    return html;
  }

  /** Tarjeta de recomendación (la del mazo; se muestra una a la vez) */
  function deckHTML(b) {
    const chips = (b.availability.length
      ? b.availability
      : ["Todos los días"]
    )
      .map((d) => `<span class="chip">${icon("calendar-days", 12)} ${esc(d)}</span>`)
      .join("");
    return `
    <article class="rec-card">
      <img src="${esc(b.cover)}" alt="Portada de ${esc(b.name)}" loading="lazy">
      <div class="rec-grad" aria-hidden="true"></div>
      <div class="rec-body">
        <h3>${esc(b.name)}</h3>
        <p class="rec-genre">${esc(b.genre)} · ${b.yearsActive} años · ${b.successfulEvents} eventos</p>
        <p class="rec-meta">
          ${b.reviews ? `${icon("star", 13, "fill-white")} <b>${b.rating.toFixed(1)}</b> (${b.reviews})` : `<b class="rec-new">Nueva en Sonora</b>`}
          <span class="rec-dot">·</span>
          <span>${mxn(b.hourlyRate)} / hora</span>
        </p>
        <p class="rec-bio">${esc(b.bio)}</p>
        <div class="chips">${chips}</div>
      </div>
    </article>`;
  }

  function matchCardHTML(b) {
    return `
    <button class="match-card" data-action="open-band" data-id="${esc(b.id)}">
      <span class="match-avatar">
        <img src="${esc(b.avatar)}" alt="Foto de ${esc(b.name)}" loading="lazy">
        <span class="match-badge" aria-hidden="true">${icon("check", 12, "fill-white")}</span>
      </span>
      <h3 class="truncate">${esc(b.name)}</h3>
      <p>${esc(b.genre)}</p>
    </button>`;
  }

  /** Acepta o rechaza la recomendación actual y pasa a la siguiente */
  async function respondToRec(status) {
    const band = recQueue()[0];
    if (!band || S.recsBusy) return;
    S.recsBusy = true;
    refreshHome();
    try {
      await API.respondToBand(band.id, status);
      S.decisions.set(band.id, status);
      if (status === "match") toast(`¡Match con ${band.name}!`);
    } catch (err) {
      toast(err.message, true);
    } finally {
      S.recsBusy = false;
      refreshHome();
    }
  }

  /** Reinicia las recomendaciones (vuelves a ver todas las bandas) */
  async function resetRecs() {
    if (S.recsBusy) return;
    if (!confirm("Esto reinicia tus recomendaciones: volverás a ver todas las bandas.")) return;
    S.recsBusy = true;
    refreshHome();
    try {
      await API.resetBandDecisions();
      S.decisions.clear();
      toast("Recomendaciones reiniciadas.");
    } catch (err) {
      toast(err.message, true);
    } finally {
      S.recsBusy = false;
      refreshHome();
    }
  }

  /** Re-renderiza solo los resultados del inicio (conserva la búsqueda) */
  function refreshHome() {
    if (S.tab === "inicio" && $("#home-results")) $("#home-results").innerHTML = homeResultsHTML();
  }

  // =====================================================================
  // 3. PERFIL DE BANDA
  // =====================================================================
  function starsHTML(rating, size, reviews) {
    const full = Math.round(rating);
    return `
    <div class="stars">
      <div class="stars-row">
        ${Array.from({ length: 5 }, (_, i) => icon("star", size, i < full ? "fill-brand" : "fill-sand")).join("")}
      </div>
      <span class="stars-val">${rating.toFixed(1)}${reviews !== undefined ? ` <span>(${reviews})</span>` : ""}</span>
    </div>`;
  }

  function renderBand() {
    const layer = $("#band-layer");
    const band = S.selectedBandId && bandById(S.selectedBandId);
    document.body.style.overflow = band || S.sheet ? "hidden" : "";
    if (!band) {
      layer.innerHTML = "";
      return;
    }

    keepScroll(layer, ".band-scroll", () => {
      const pkg = band.packages.find((p) => p.id === S.packageId) || band.packages[0];

      layer.innerHTML = `
      <div class="overlay" role="dialog" aria-modal="true" aria-label="${esc(band.name)}">
        <div class="band-panel">
          <div class="band-scroll no-scrollbar">
            <div class="cover">
              <img src="${esc(band.cover)}" alt="Portada de ${esc(band.name)}">
              <button class="glass-btn" data-action="close-band" aria-label="Volver">${icon("arrow-left", 20)}</button>
            </div>

            <div class="band-info">
              <h1 class="h1">${esc(band.name)}</h1>
              <p class="sub">${esc(band.genre)} · ${band.yearsActive} años · ${band.successfulEvents} eventos</p>
              ${band.reviews ? starsHTML(band.rating, 13, band.reviews) : `<p class="sub brand" style="font-weight:600">Nueva en Sonora</p>`}
              <p class="bio">${esc(band.bio)}</p>
            </div>

            <div class="seg cols-3" role="tablist">
              <button class="seg-btn ${S.bandTab === "contratar" ? "active" : ""}" data-action="band-tab" data-tab="contratar" role="tab">
                ${icon("calendar-check", 15)} Contratar
              </button>
              <button class="seg-btn ${S.bandTab === "bazar" ? "active" : ""}" data-action="band-tab" data-tab="bazar" role="tab">
                ${icon("disc", 15)} Bazar Digital
              </button>
              <button class="seg-btn ${S.bandTab === "resenas" ? "active" : ""}" data-action="band-tab" data-tab="resenas" role="tab">
                ${icon("star", 15)} Reseñas${band.reviews ? ` <span class="seg-count">${band.reviews}</span>` : ""}
              </button>
            </div>

            ${S.bandTab === "contratar" ? contratarHTML(band) : S.bandTab === "bazar" ? bazarHTML(band) : reviewsTabHTML(band)}
          </div>

          ${
            S.bandTab === "contratar" && pkg
              ? `<div class="sticky-cta">
                  <p class="lbl">Paquete ${esc(pkg.label)}</p>
                  <p class="val">${pkg.hours} ${plural(pkg.hours)} · ${mxn(pkg.hours * band.hourlyRate)}</p>
                  <button class="btn-primary" data-action="open-sheet">${icon("lock", 16)} Reservar banda</button>
                </div>`
              : ""
          }
        </div>
      </div>`;
    });
  }

  function contratarHTML(band) {
    const pkgs = band.packages
      .map((p) => {
        const sel = p.id === S.packageId;
        return `
        <button class="pkg ${sel ? "selected" : ""}" data-action="pick-package" data-id="${esc(p.id)}" aria-pressed="${sel}">
          ${p.popular ? `<span class="pkg-tag">Más pedido</span>` : ""}
          <div class="pkg-head">
            <div>
              <h3>${esc(p.label)}</h3>
              <p class="small">${p.hours} ${plural(p.hours)} de show</p>
            </div>
            <div class="pkg-price">
              <p class="big">${mxn(p.hours * band.hourlyRate)}</p>
              <p class="tiny">${mxn(band.hourlyRate)}/h</p>
            </div>
          </div>
          <ul class="perks">
            ${p.perks.map((perk) => `<li>${icon("check", 13)} ${esc(perk)}</li>`).join("")}
          </ul>
        </button>`;
      })
      .join("");

    return `
    <div class="block">
      <h2 class="block-title">Paquetes de horas</h2>
      <div class="grid-2">${pkgs || `<p class="hint">Esta banda aún no tiene paquetes.</p>`}</div>
    </div>
    <div class="block">
      <h2 class="block-title">Disponibilidad</h2>
      <div class="chips">
        ${band.availability.map((d) => `<span class="chip">${icon("calendar-days", 12)} ${esc(d)}</span>`).join("")}
      </div>
      <p class="hint">Horarios de 12:00 a 23:00</p>
    </div>`;
  }

  function bazarHTML(band) {
    const songs = band.songs
      .map((s) => {
        const owned = S.purchased.has(s.id);
        const buying = S.buyingSongId === s.id;
        const playing = S.playingSongId === s.id;
        let action;
        if (owned) {
          const mine = S.myReviews.songs.get(s.id);
          action = `<div class="song-actions">
                      <span class="song-tag owned">${icon("check", 12)} Comprado</span>
                      <button class="song-rate" data-action="review-song" data-id="${esc(s.id)}">
                        ${mine ? `${miniStars(mine.rating, 11)} Editar` : `${icon("star", 12)} Calificar`}
                      </button>
                    </div>`;
        }
        else if (buying) action = `<span class="song-tag">${icon("loader", 12, "spin")} Comprando…</span>`;
        else
          action = `<button class="song-tag" data-action="buy-song" data-id="${esc(s.id)}" ${S.buyingSongId ? "disabled" : ""}>
                      ${icon("shopping-bag", 12)} Comprar ${mxn(s.price)}
                    </button>`;
        return `
        <div class="song">
          ${playButtonHTML(s, owned)}
          <div class="song-info">
            <p class="truncate">${esc(s.title)}</p>
            <p>${esc(s.duration)} · ${esc(s.plays)} reproducciones${songRatingText(band.id, s.id)}</p>
          </div>
          ${action}
        </div>`;
      })
      .join("");

    return `
    <div class="block">
      <p class="hint" style="margin-top:0">Obras originales de la banda. ${icon("lock", 11)} Cómpralas para escucharlas completas cuando quieras.</p>
      <div class="grid-2" style="margin-top:1rem">${songs || `<p class="hint">Aún no hay canciones publicadas.</p>`}</div>
    </div>`;
  }

  // =====================================================================
  // 4. RESERVA Y PAGO
  // =====================================================================
  function openSheet() {
    const band = bandById(S.selectedBandId);
    if (!band) return;
    const pkg = band.packages.find((p) => p.id === S.packageId);
    S.sheet = {
      bandId: band.id,
      days: nextDays(14),
      booked: new Set(),
      dayKey: null,
      time: "18:00",
      wantedHours: pkg ? pkg.hours : 3,
      hours: pkg ? Math.min(8, pkg.hours) : 3,
      address: "",
      step: "form", // form | processing | success
      error: "",
      result: null,
    };
    fixSheetSelection();
    renderSheet();

    // Fechas ya ocupadas de la banda (por cualquier cliente)
    API.getBookedDates(band.id)
      .then((dates) => {
        if (!S.sheet || S.sheet.bandId !== band.id) return;
        S.sheet.booked = new Set(dates);
        fixSheetSelection();
        if (S.sheet.step === "form") renderSheet();
      })
      .catch(() => {});
  }

  /**
   * Corrige la selección para que siempre sea válida:
   * día que la banda trabaja, no ocupado, horario abierto y que termine antes de las 23:00.
   */
  function fixSheetSelection() {
    const sh = S.sheet;
    const band = bandById(sh.bandId);
    const ok = (d) => !dayBlockReason(band, d, sh.booked);

    const current = sh.days.find((d) => d.key === sh.dayKey);
    if (!current || !ok(current)) sh.dayKey = (sh.days.find(ok) || {}).key || null;
    if (!sh.dayKey) return;

    if (!slotOpen(sh.dayKey, sh.time)) {
      sh.time = TIME_SLOTS.find((t) => slotOpen(sh.dayKey, t)) || sh.time;
    }
    sh.hours = Math.min(sh.wantedHours, maxHoursFor(sh.time));
  }

  function renderSheet() {
    const layer = $("#sheet-layer");
    const sh = S.sheet;
    document.body.style.overflow = S.selectedBandId || sh ? "hidden" : "";
    if (!sh) {
      layer.innerHTML = "";
      return;
    }
    const band = bandById(sh.bandId);
    keepScroll(layer, ".sheet", () => {
      layer.innerHTML = `
      <div class="sheet-wrap" role="dialog" aria-modal="true" aria-label="Reservar ${esc(band.name)}">
        ${sh.step === "form" ? `<button class="backdrop" data-action="close-sheet" aria-label="Cerrar"></button>` : ""}
        <div class="sheet no-scrollbar">
          <div class="grabber"></div>
          ${sh.step === "success" ? successHTML(sh) : sheetFormHTML(band, sh)}
        </div>
      </div>`;
    });
  }

  function sheetFormHTML(band, sh) {
    const total = sh.hours * band.hourlyRate;
    const processing = sh.step === "processing";
    const noDates = !sh.dayKey;
    const canPay = !noDates && sh.address.trim().length >= 5 && sh.step === "form";
    const maxH = maxHoursFor(sh.time);

    return `
    <div class="sheet-body">
      <div class="sheet-head">
        <img src="${esc(band.avatar)}" alt="${esc(band.name)}">
        <div style="min-width:0;flex:1">
          <h2 class="truncate">${esc(band.name)}</h2>
          <p>${icon("star", 11, "fill-brand")} ${band.rating.toFixed(1)} · ${mxn(band.hourlyRate)}/hora</p>
        </div>
        <button class="close-btn" data-action="close-sheet" aria-label="Cerrar" ${processing ? "disabled" : ""}>${icon("x", 18)}</button>
      </div>

      <h3 class="q first">¿Cuándo?</h3>
      <p class="q-hint">${icon("calendar-days", 12)} ${esc(band.name)} se presenta: ${esc(availabilityText(band))}</p>
      <div class="days no-scrollbar">
        ${sh.days
          .map((d) => {
            const reason = dayBlockReason(band, d, sh.booked);
            const sel = d.key === sh.dayKey;
            return `
          <button class="day ${sel ? "selected" : ""}" data-action="pick-day" data-key="${d.key}"
            aria-pressed="${sel}" ${reason ? `disabled title="${reason}" aria-label="${d.weekday} ${d.day}: ${reason}"` : ""}>
            <span class="wd">${d.weekday}</span>
            <span class="dn">${d.day}</span>
            <span class="mo">${reason ? reason : d.month}</span>
          </button>`;
          })
          .join("")}
      </div>
      ${noDates ? `<p class="pay-hint err" style="text-align:left">No hay fechas disponibles en las próximas 2 semanas.</p>` : ""}

      <h3 class="q">¿A qué hora?</h3>
      <div class="slots">
        ${TIME_SLOTS.map((t) => {
          const open = sh.dayKey && slotOpen(sh.dayKey, t);
          return `<button class="slot ${t === sh.time ? "selected" : ""}" data-action="pick-time" data-time="${t}"
            aria-pressed="${t === sh.time}" ${open ? "" : `disabled title="Horario no disponible"`}>${t}</button>`;
        }).join("")}
      </div>

      <h3 class="q">¿Cuántas horas?</h3>
      <div class="stepper">
        <button class="step-btn" data-action="hours" data-delta="-1" aria-label="Menos horas" ${sh.hours <= 1 ? "disabled" : ""}>${icon("minus", 18)}</button>
        <div class="stepper-val">
          <p>${sh.hours} ${plural(sh.hours)}</p>
          <p>${mxn(band.hourlyRate)} por hora · termina ${pad(hourOf(sh.time) + sh.hours)}:00</p>
        </div>
        <button class="step-btn" data-action="hours" data-delta="1" aria-label="Más horas" ${sh.hours >= maxH ? "disabled" : ""}>${icon("plus", 18)}</button>
      </div>
      ${
        sh.wantedHours > sh.hours
          ? `<p class="q-hint warn">${icon("alert", 12)} Iniciando a las ${sh.time} el máximo es ${maxH} ${plural(maxH)}: los eventos terminan a más tardar a las ${CLOSING_HOUR}:00.</p>`
          : ""
      }

      <h3 class="q">¿Dónde es el evento?</h3>
      <label class="addr">
        ${icon("map-pin", 18)}
        <input id="addr" type="text" placeholder="Calle, colonia, ciudad…" value="${esc(sh.address)}" autocomplete="street-address" aria-label="Dirección del evento">
      </label>

      <div class="summary">
        <div class="sum-row">
          <span class="lab">${sh.hours} ${plural(sh.hours)} × ${mxn(band.hourlyRate)}</span>
          <b>${mxn(total)}</b>
        </div>
        <div class="sum-sep"></div>
        <div class="sum-total"><b>Total a pagar</b><span>${mxn(total)}</span></div>
        <p class="sum-note">Tu pago queda protegido y se libera a la banda al finalizar el evento.</p>
        ${splitRowsHTML(total, band.name)}
      </div>

      <button id="pay-btn" class="btn-primary pay-btn" data-action="pay" ${canPay ? "" : "disabled"}>
        ${processing ? `${icon("loader", 17, "spin")} Procesando pago seguro…` : `${icon("lock", 16)} Pagar ${mxn(total)}`}
      </button>
      <p id="pay-hint" class="pay-hint ${sh.error ? "err" : ""}">
        ${sh.error ? esc(sh.error) : !canPay && !processing && !noDates ? "Ingresa la dirección del evento para continuar" : ""}
      </p>
    </div>`;
  }

  function successHTML(sh) {
    const r = sh.result;
    return `
    <div class="success">
      <div class="success-icon">${icon("check", 38)}</div>
      <h2>¡Reserva confirmada!</h2>
      <p>Tu pago de ${mxn(r.total)} quedó protegido en la bóveda y solo se liberará al grupo cuando finalice el evento.</p>
      <div class="detail-box">
        <div class="detail-row">${icon("calendar-days", 15)}<span class="k">Fecha</span><span class="v truncate" style="text-transform:capitalize">${esc(dayLabel(r.eventDate))}</span></div>
        <div class="detail-row">${icon("clock", 15)}<span class="k">Horario</span><span class="v">${esc(r.time)} · ${r.hours} ${plural(r.hours)}</span></div>
        <div class="detail-row">${icon("map-pin", 15)}<span class="k">Lugar</span><span class="v truncate">${esc(r.address)}</span></div>
      </div>
      <div class="detail-box">
        <div class="sum-row"><span class="lab">Total del evento</span><b>${mxn(r.total)}</b></div>
        ${splitRowsHTML(r.total, r.bandName)}
      </div>
      ${
        r.txUrl
          ? `<p class="sum-note" style="text-align:center">${icon("shield-check", 13)} Pago registrado en blockchain ·
              <a class="link-strong" href="${esc(r.txUrl)}" target="_blank" rel="noopener">Ver en Basescan</a></p>`
          : ""
      }
      <div class="actions">
        <button class="btn-primary" data-action="view-reservas">Ver mis reservas</button>
        <button class="btn-secondary" data-action="close-sheet-home">Volver al inicio</button>
      </div>
    </div>`;
  }

  /** Actualiza solo el botón de pago mientras se escribe la dirección (sin perder el foco) */
  function updatePayButton() {
    const sh = S.sheet;
    const btn = $("#pay-btn"), hint = $("#pay-hint");
    if (!sh || !btn) return;
    const ok = !!sh.dayKey && sh.address.trim().length >= 5 && sh.step === "form";
    btn.disabled = !ok;
    if (!sh.error) hint.textContent = ok ? "" : "Ingresa la dirección del evento para continuar";
  }

  async function pay() {
    const sh = S.sheet;
    if (!sh || sh.step !== "form" || sh.address.trim().length < 5) return;
    const band = bandById(sh.bandId);
    const day = sh.days.find((d) => d.key === sh.dayKey);
    const reason = day ? dayBlockReason(band, day, sh.booked) : "Sin fecha";
    if (reason || !slotOpen(sh.dayKey, sh.time) || hourOf(sh.time) + sh.hours > CLOSING_HOUR) {
      fixSheetSelection();
      sh.error = "La fecha u horario ya no está disponible. Revisa tu selección.";
      renderSheet();
      return;
    }
    sh.step = "processing";
    sh.error = "";
    renderSheet();
    try {
      const booking = await API.createBooking({
        bandId: sh.bandId,
        eventDate: sh.dayKey,
        time: sh.time,
        hours: sh.hours,
        address: sh.address.trim(),
      });
      // Pago en blockchain: el dinero queda bloqueado en el contrato BookingEscrow
      if (window.SonoraWeb3?.enabled && (await SonoraWeb3.available(band.name))) {
        try {
          const chain = await SonoraWeb3.reservar({
            bandName: band.name,
            eventDate: booking.eventDate,
            time: booking.time,
            totalMXN: booking.total,
          });
          await API.setBookingTx(booking.id, chain.txHash);
          booking.txHash = chain.txHash;
          booking.txUrl = chain.url;
        } catch (chainErr) {
          // Si el pago no se completó, la reserva no se queda apartada
          await API.cancelBooking(booking.id).catch(() => {});
          throw chainErr;
        }
      }
      S.bookings = [...S.bookings, booking].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
      sh.result = booking;
      sh.step = "success";
      renderNav();
      if (S.tab !== "inicio") renderScreen();
    } catch (err) {
      sh.step = "form";
      sh.error = "No se pudo completar la reserva: " + err.message;
      API.getBookedDates(sh.bandId)
        .then((dates) => {
          if (!S.sheet) return;
          S.sheet.booked = new Set(dates);
          fixSheetSelection();
          renderSheet();
        })
        .catch(() => {});
    }
    renderSheet();
  }

  // =====================================================================
  // MIS RESERVAS
  // =====================================================================
  function reservasHTML() {
    const list = S.bookings;
    if (!list.length) {
      return `
      <div class="page w-2xl screen-pad">
        <header class="page-head">
          <h1 class="h1">Mis Reservas</h1>
          <p>Tus próximos eventos y su estado de pago.</p>
        </header>
        <div class="empty">
          <div class="empty-ring">${icon("calendar-days", 36)}</div>
          <h2>Aún no tienes reservas</h2>
          <p>Explora bandas locales y asegura tu fecha en solo unos toques.</p>
          <button class="btn-primary auto" data-action="tab" data-tab="inicio">Explorar bandas</button>
        </div>
      </div>`;
    }

    return `
    <div class="page w-2xl screen-pad">
      <header class="page-head">
        <h1 class="h1">Mis Reservas</h1>
        <p>Tus próximos eventos y su estado de pago.</p>
      </header>
      <div class="bookings">
        ${list
          .map((b) => {
            const up = isUpcoming(b);
            return `
          <article class="bk">
            <div class="bk-head">
              <img src="${esc(b.bandAvatar)}" alt="${esc(b.bandName)}">
              <div style="min-width:0;flex:1">
                <h3 class="truncate">${esc(b.bandName)}</h3>
                <p>${esc(dayLabel(b.eventDate))} · ${esc(b.time)} h</p>
              </div>
              <span class="status ${up ? "upcoming" : "done"}">${up ? "Próximamente" : "Completada"}</span>
            </div>
            <div class="bk-mid">
              <p>${icon("clock", 13)} ${b.hours} ${plural(b.hours)} de show</p>
              <p>${icon("map-pin", 13)} <span class="truncate">${esc(b.address)}</span></p>
            </div>
            <div class="bk-foot">
              <div>
                <p class="k">Total del evento</p>
                <p class="safe">${icon("shield-check", 11)} Pago protegido</p>
              </div>
              <p class="total">${mxn(b.total)}</p>
            </div>
            <p class="bk-split">${mxn(split(b.total).artist)} para la banda · ${mxn(split(b.total).coop)} ${esc(COOP_NAME)}</p>
            ${
              b.txHash
                ? `<p class="bk-split">${icon("shield-check", 11)} En bóveda blockchain ·
                    <a class="link-strong" href="${esc(chainTxUrl(b.txHash))}" target="_blank" rel="noopener">Ver pago</a></p>
                  <button class="cancel-btn" data-action="release-booking" data-id="${esc(b.id)}" ${S.releasingId === b.id ? "disabled" : ""}>
                    ${S.releasingId === b.id ? icon("loader", 13, "spin") + " Liberando…" : icon("check", 13) + " El evento terminó: liberar pago a la banda"}
                  </button>`
                : ""
            }
            ${bookingReviewHTML(b)}
            ${
              up
                ? `<button class="cancel-btn" data-action="cancel-booking" data-id="${esc(b.id)}" ${S.cancelingId === b.id ? "disabled" : ""}>
                    ${S.cancelingId === b.id ? icon("loader", 13, "spin") + " Cancelando…" : icon("trash", 13) + " Cancelar reserva"}
                  </button>`
                : ""
            }
          </article>`;
          })
          .join("")}
      </div>
    </div>`;
  }

  // =====================================================================
  // 4.5 RESEÑAS (bandas contratadas y canciones compradas)
  // =====================================================================
  const RATING_WORDS = ["Toca una estrella para calificar", "Mala", "Regular", "Buena", "Muy buena", "¡Excelente!"];
  const REVIEW_MAX = 500;

  const avgRating = (list) => (list.length ? list.reduce((sum, r) => sum + r.rating, 0) / list.length : 0);

  function miniStars(rating, size = 12) {
    const full = Math.round(rating);
    return `<span class="mini-stars" aria-label="${full} de 5 estrellas">${Array.from({ length: 5 }, (_, i) =>
      icon("star", size, i < full ? "fill-brand" : "fill-sand")
    ).join("")}</span>`;
  }

  function reviewDate(iso) {
    try {
      return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return "";
    }
  }

  /** " · ★ 4.5 (2)" junto a cada canción del bazar */
  function songRatingText(bandId, songId) {
    const list = (S.bandReviews[bandId]?.list || []).filter((r) => r.songId === songId);
    if (!list.length) return "";
    return ` · <span class="song-score">${icon("star", 10, "fill-brand")} ${avgRating(list).toFixed(1)} (${list.length})</span>`;
  }

  /** Bloque de reseña dentro de cada tarjeta de "Mis Reservas" */
  function bookingReviewHTML(b) {
    const r = S.myReviews.bookings.get(b.id);
    if (!r) {
      return `<button class="review-btn" data-action="review-booking" data-id="${esc(b.id)}">
                ${icon("star", 14)} Califica a ${esc(b.bandName)}
              </button>`;
    }
    return `
    <div class="my-review">
      <div class="my-review-top">
        ${miniStars(r.rating, 13)}
        <span>Tu reseña</span>
        <button class="link-strong my-review-edit" data-action="review-booking" data-id="${esc(b.id)}">${icon("pencil", 12)} Editar</button>
      </div>
      ${r.comment ? `<p>“${esc(r.comment)}”</p>` : ""}
    </div>`;
  }

  function reviewItemHTML(r) {
    const initial = (r.author || "C").charAt(0).toUpperCase();
    return `
    <article class="review">
      <div class="review-top">
        <span class="review-avatar">${esc(initial)}</span>
        <div style="min-width:0;flex:1">
          <p class="review-author">${esc(r.author)}</p>
          <p class="review-meta">${miniStars(r.rating, 11)} · ${esc(reviewDate(r.updatedAt))}</p>
        </div>
        <span class="review-kind">${r.songId ? `${icon("disc", 11)} ${esc(r.songTitle || "Canción")}` : `${icon("calendar-check", 11)} Evento`}</span>
      </div>
      ${r.comment ? `<p class="review-body">${esc(r.comment)}</p>` : ""}
    </article>`;
  }

  /** Pestaña "Reseñas" del perfil de banda */
  function reviewsTabHTML(band) {
    const st = S.bandReviews[band.id];
    if (!st || (st.status === "loading" && !st.list.length)) {
      return `<div class="block"><p class="hint" style="margin-top:0">${icon("loader", 14, "spin")} Cargando reseñas…</p></div>`;
    }
    if (st.status === "error" && !st.list.length) {
      return `
      <div class="block">
        <p class="hint" style="margin-top:0">${esc(st.error)}</p>
        <button class="btn-secondary auto" data-action="reload-reviews" data-id="${esc(band.id)}">Reintentar</button>
      </div>`;
    }

    const events = st.list.filter((r) => r.bookingId);
    const songs = st.list.filter((r) => r.songId);
    const pending = S.bookings.filter((b) => b.bandId === band.id && !S.myReviews.bookings.has(b.id));

    const dist = [5, 4, 3, 2, 1]
      .map((n) => {
        const count = events.filter((r) => r.rating === n).length;
        const pct = events.length ? Math.round((count / events.length) * 100) : 0;
        return `<div class="dist-row"><span>${n}</span>${icon("star", 10, "fill-brand")}
                  <div class="dist-bar"><i style="width:${pct}%"></i></div><b>${count}</b></div>`;
      })
      .join("");

    return `
    <div class="block">
      <div class="review-summary">
        <div class="review-score">
          <p class="big">${events.length ? avgRating(events).toFixed(1) : "–"}</p>
          ${miniStars(avgRating(events), 14)}
          <p class="tiny">${events.length} ${events.length === 1 ? "reseña" : "reseñas"} de eventos</p>
        </div>
        <div class="review-dist">${dist}</div>
      </div>
      ${
        songs.length
          ? `<p class="hint">${icon("disc", 12)} Sus canciones tienen ${avgRating(songs).toFixed(1)} de 5 en ${songs.length} ${songs.length === 1 ? "reseña" : "reseñas"}.</p>`
          : ""
      }
      ${pending
        .map(
          (b) => `<button class="review-btn" data-action="review-booking" data-id="${esc(b.id)}">
                    ${icon("star", 14)} Califica tu evento del ${esc(dayLabel(b.eventDate))}
                  </button>`
        )
        .join("")}
      <p class="hint">Solo pueden opinar quienes contrataron a la banda o compraron sus canciones.</p>
    </div>
    <div class="block reviews-list">
      ${
        st.list.length
          ? st.list.map(reviewItemHTML).join("")
          : `<p class="hint" style="margin-top:0">Aún no hay reseñas. ¡Contrata a la banda o compra una canción y sé el primero en opinar!</p>`
      }
    </div>`;
  }

  async function loadBandReviews(bandId) {
    if (!bandId || !API.getBandReviews) return;
    const prev = S.bandReviews[bandId];
    S.bandReviews[bandId] = { status: "loading", list: prev?.list || [], error: "" };
    if (!prev && S.selectedBandId === bandId && S.bandTab === "resenas") renderBand();
    try {
      const list = await API.getBandReviews(bandId);
      S.bandReviews[bandId] = { status: "ok", list, error: "" };
      // La calificación de la banda sale solo de las reseñas de eventos
      const band = bandById(bandId);
      const events = list.filter((r) => r.bookingId);
      if (band) {
        band.reviews = events.length;
        band.rating = events.length ? Math.round(avgRating(events) * 10) / 10 : 0;
      }
    } catch (err) {
      S.bandReviews[bandId] = { status: "error", list: prev?.list || [], error: err.message };
    }
    if (S.selectedBandId === bandId) renderBand();
    refreshHome();
  }

  function openReview(kind, id) {
    let rs;
    if (kind === "booking") {
      const b = S.bookings.find((x) => x.id === id);
      if (!b) return;
      const mine = S.myReviews.bookings.get(id);
      rs = {
        kind, targetId: id, bandId: b.bandId, title: b.bandName, img: b.bandAvatar,
        subtitle: `Evento del ${dayLabel(b.eventDate)} · ${b.time} h`,
        rating: mine?.rating || 0, comment: mine?.comment || "", existing: !!mine,
      };
    } else {
      const band = S.bands.find((x) => x.songs.some((s) => s.id === id));
      const song = band?.songs.find((s) => s.id === id);
      if (!song) return;
      if (!S.purchased.has(id)) return toast("Primero compra la canción para poder reseñarla.", true);
      const mine = S.myReviews.songs.get(id);
      rs = {
        kind, targetId: id, bandId: band.id, title: song.title, img: null,
        subtitle: `${band.name} · ${song.duration || ""}`,
        rating: mine?.rating || 0, comment: mine?.comment || "", existing: !!mine,
      };
    }
    S.reviewSheet = Object.assign(rs, { step: "form", error: "" });
    renderReviewSheet();
  }

  function renderReviewSheet() {
    const layer = $("#review-layer");
    if (!layer) return;
    const rs = S.reviewSheet;
    if (!rs) {
      layer.innerHTML = "";
      return;
    }
    const what = rs.kind === "booking" ? "a la banda" : "esta canción";
    layer.innerHTML = `
    <div class="sheet-wrap" role="dialog" aria-modal="true" aria-label="Reseña de ${esc(rs.title)}">
      <button class="backdrop" data-action="close-review" aria-label="Cerrar"></button>
      <div class="sheet no-scrollbar">
        <div class="grabber"></div>
        <div class="sheet-body">
          <div class="sheet-head">
            ${rs.img ? `<img src="${esc(rs.img)}" alt="">` : `<div class="song-cover">${icon("disc", 22)}</div>`}
            <div style="min-width:0;flex:1">
              <h2 class="truncate">${esc(rs.title)}</h2>
              <p class="truncate">${esc(rs.subtitle)}</p>
            </div>
            <button class="close-btn" data-action="close-review" aria-label="Cerrar">${icon("x", 18)}</button>
          </div>

          <h3 class="q first">¿Cómo calificarías ${what}?</h3>
          <div class="rate-input" role="radiogroup" aria-label="Calificación">
            ${[1, 2, 3, 4, 5]
              .map(
                (n) => `<button class="rate-star" data-action="rate" data-value="${n}" role="radio" aria-label="${n} ${n === 1 ? "estrella" : "estrellas"}"></button>`
              )
              .join("")}
          </div>
          <p class="rate-word"></p>

          <h3 class="q">Tu opinión <span class="q-opt">(opcional)</span></h3>
          <textarea id="review-comment" class="review-text" maxlength="${REVIEW_MAX}" rows="4"
            placeholder="${rs.kind === "booking" ? "¿Qué tal estuvo el show, la puntualidad, el repertorio…?" : "¿Qué te pareció la canción?"}">${esc(rs.comment)}</textarea>
          <p class="review-count"><span id="review-count">${rs.comment.length}</span>/${REVIEW_MAX}</p>

          <button class="btn-primary pay-btn" data-action="submit-review"></button>
          <p class="pay-hint err" id="review-error"></p>
        </div>
      </div>
    </div>`;
    updateReviewSheet();
  }

  /** Actualiza estrellas, botón y error sin volver a animar la hoja */
  function updateReviewSheet() {
    const rs = S.reviewSheet;
    if (!rs) return;
    const busy = rs.step === "saving";
    document.querySelectorAll("#review-layer .rate-star").forEach((btn) => {
      const n = Number(btn.dataset.value);
      btn.innerHTML = icon("star", 34, n <= rs.rating ? "fill-brand" : "fill-sand");
      btn.classList.toggle("on", n <= rs.rating);
      btn.setAttribute("aria-checked", String(n === rs.rating));
      btn.disabled = busy;
    });
    const word = $("#review-layer .rate-word");
    if (word) word.textContent = RATING_WORDS[rs.rating] || RATING_WORDS[0];
    const ta = $("#review-comment");
    if (ta) ta.disabled = busy;
    const btn = $('#review-layer [data-action="submit-review"]');
    if (btn) {
      btn.disabled = busy || !rs.rating;
      btn.innerHTML = busy
        ? `${icon("loader", 17, "spin")} Guardando…`
        : `${icon("check", 16)} ${rs.existing ? "Actualizar reseña" : "Publicar reseña"}`;
    }
    const err = $("#review-error");
    if (err) err.textContent = rs.error || "";
  }

  async function submitReview() {
    const rs = S.reviewSheet;
    if (!rs || rs.step !== "form") return;
    if (!rs.rating) {
      rs.error = "Elige de 1 a 5 estrellas.";
      return updateReviewSheet();
    }
    rs.step = "saving";
    rs.error = "";
    updateReviewSheet();
    try {
      const payload = { rating: rs.rating, comment: rs.comment.trim(), existing: rs.existing };
      if (rs.kind === "booking") {
        const saved = await API.saveBookingReview({ bookingId: rs.targetId, bandId: rs.bandId, ...payload });
        S.myReviews.bookings.set(rs.targetId, saved);
      } else {
        const saved = await API.saveSongReview({ songId: rs.targetId, bandId: rs.bandId, songTitle: rs.title, ...payload });
        S.myReviews.songs.set(rs.targetId, saved);
      }
      S.reviewSheet = null;
      renderReviewSheet();
      toast(rs.existing ? "Reseña actualizada." : "¡Gracias por tu reseña!");
      if (S.tab === "reservas") renderScreen();
      await loadBandReviews(rs.bandId);
    } catch (err) {
      if (S.reviewSheet !== rs) return;
      rs.step = "form";
      rs.error = err.message;
      updateReviewSheet();
    }
  }

  function closeReview() {
    if (!S.reviewSheet || S.reviewSheet.step === "saving") return;
    S.reviewSheet = null;
    renderReviewSheet();
  }


  /** URL del explorador de bloques para un hash (coincide con abi/addresses.json) */
  function chainTxUrl(hash) {
    return "https://sepolia.basescan.org/tx/" + hash;
  }

  async function releaseBooking(id) {
    const b = S.bookings.find((x) => x.id === id);
    if (!b || !b.txHash || S.releasingId || !window.SonoraWeb3?.enabled) return;
    if (!confirm(`¿Confirmas que ${b.bandName} ya se presentó? El pago se repartirá a sus integrantes.`)) return;
    S.releasingId = id;
    renderScreen();
    try {
      const r = await SonoraWeb3.confirmarPorTx(b.txHash);
      toast("¡Pago liberado y repartido a los integrantes!");
      window.open(r.url, "_blank", "noopener");
    } catch (err) {
      toast(err.message, true);
    } finally {
      S.releasingId = null;
      renderScreen();
    }
  }

  async function cancelBooking(id) {
    const b = S.bookings.find((x) => x.id === id);
    if (!b || S.cancelingId) return;
    if (!confirm(`¿Cancelar la reserva con ${b.bandName}?`)) return;
    S.cancelingId = id;
    renderScreen();
    try {
      await API.cancelBooking(id);
      S.bookings = S.bookings.filter((x) => x.id !== id);
      toast("Reserva cancelada.");
    } catch (err) {
      toast(err.message, true);
    } finally {
      S.cancelingId = null;
      renderNav();
      renderScreen();
    }
  }

  // =====================================================================
  // PERFIL
  // =====================================================================
  /** Botón de reproducir: solo para canciones compradas; si no, candado que lleva a comprar */
  function playButtonHTML(s, owned) {
    if (!owned) {
      return `<button class="play-btn locked" data-action="buy-song" data-id="${esc(s.id)}"
                aria-label="Compra ${esc(s.title)} para escucharla" title="Compra la canción para escucharla">
                ${icon("lock", 15)}
              </button>`;
    }
    const playing = S.playingSongId === s.id;
    const loading = S.loadingSongId === s.id;
    return `<button class="play-btn ${playing ? "playing" : ""}" data-action="play-song" data-id="${esc(s.id)}"
              aria-label="${playing ? "Pausar" : "Escuchar"} ${esc(s.title)}">
              ${loading ? icon("loader", 16, "spin") : icon(playing ? "pause" : "play", 16, "fill-current")}
            </button>`;
  }

  /** Perfil → Mis canciones */
  function mySongsHTML() {
    const list = S.myPurchases;
    return `
    <section class="my-songs">
      <div class="my-songs-head">
        <h2>${icon("disc", 16)} Mis canciones</h2>
        ${list.length ? `<span class="my-songs-count">${list.length}</span>` : ""}
      </div>
      ${
        list.length
          ? `<div class="my-songs-list">
              ${list
                .map(
                  (p) => `
                <div class="song mine">
                  ${playButtonHTML({ id: p.songId, title: p.title }, true)}
                  <div class="song-info">
                    <p class="truncate">${esc(p.title)}</p>
                    <p class="truncate">${esc(p.bandName)}${p.duration ? ` · ${esc(p.duration)}` : ""}</p>
                  </div>
                  ${
                    p.bandId && bandById(p.bandId)
                      ? `<button class="song-band" data-action="open-band" data-id="${esc(p.bandId)}" aria-label="Ver ${esc(p.bandName)}">
                          ${p.bandAvatar ? `<img src="${esc(p.bandAvatar)}" alt="">` : ""}${icon("chevron-right", 14)}
                        </button>`
                      : ""
                  }
                </div>`
                )
                .join("")}
            </div>`
          : `<div class="my-songs-empty">
              <p>Aún no tienes canciones. Cómpralas en el <b>Bazar Digital</b> de cada banda y escúchalas aquí cuando quieras.</p>
              <button class="btn-secondary auto" data-action="tab" data-tab="inicio">Explorar bandas</button>
            </div>`
      }
    </section>`;
  }

  function perfilHTML() {
    const initial = S.userName.trim().charAt(0).toUpperCase() || "S";
    const vault = S.bookings.filter(isUpcoming).reduce((sum, b) => sum + b.total, 0);
    const menu = [
      { icon: "credit-card", label: "Métodos de pago" },
      { icon: "bell", label: "Notificaciones" },
      { icon: "life-buoy", label: "Ayuda y soporte" },
      { icon: "file-text", label: "Términos y privacidad" },
    ];
    return `
    <div class="page w-xl screen-pad">
      <header class="profile-head">
        <div class="profile-avatar">${esc(initial)}</div>
        <div style="min-width:0">
          <h1 class="truncate">${esc(S.userName)}</h1>
          <p class="truncate">${S.isGuest ? "Cuenta de invitado" : esc(S.userEmail)}</p>
        </div>
      </header>

      <div class="vault">
        <div class="vault-top">
          <div class="vault-id">
            <div class="vault-ic">${icon("shield-check", 22)}</div>
            <div><b>Bóveda segura</b><small>Tu dinero protegido</small></div>
          </div>
          <p class="vault-amt">${mxn(vault)}</p>
        </div>
        <p>Los pagos de tus reservas se guardan aquí hasta que cada evento finalice.</p>
      </div>

      ${mySongsHTML()}

      ${
        isArtist(S.session)
          ? `<button class="artist-link" data-action="go-artist">
              <span class="mi">${icon("music", 18)}</span>
              <span class="mi-label"><b>Mi panel de artista</b><small>Integrantes, canciones e ingresos</small></span>
              ${icon("chevron-right", 16)}
            </button>`
          : !S.isGuest
          ? `<button class="artist-link" data-action="become-artist">
              <span class="mi">${icon("music", 18)}</span>
              <span class="mi-label"><b>¿Tienes una banda?</b><small>Regístrala con esta misma cuenta</small></span>
              ${icon("chevron-right", 16)}
            </button>`
          : ""
      }

      <div class="menu">
        ${menu
          .map(
            (m) => `
          <button class="menu-item" data-action="soon">
            <span class="mi">${icon(m.icon, 16)}</span>
            <span class="mi-label">${m.label}</span>
            ${icon("chevron-right", 16)}
          </button>`
          )
          .join("")}
      </div>

      <button class="logout" data-action="logout">${icon("log-out", 16)} Cerrar sesión</button>
    </div>`;
  }

  async function becomeArtist() {
    if (!confirm("¿Registrar una banda con esta cuenta? Entrarás al panel de artista y podrás volver a la app de clientes cuando quieras.")) return;
    try {
      await API.becomeArtist();
      goToArtistPanel();
    } catch (err) {
      toast(err.message, true);
    }
  }

  // =====================================================================
  // Acciones del Bazar
  // =====================================================================
  function openSongSheet(songId) {
    if (S.buyingSongId) return;
    S.songSheet = { songId, step: "confirm", error: "" };
    renderSongSheet();
  }

  function renderSongSheet() {
    const layer = $("#song-layer");
    if (!layer) return;
    const ss = S.songSheet;
    const band = bandById(S.selectedBandId);
    const song = ss && band?.songs.find((x) => x.id === ss.songId);
    if (!song) {
      layer.innerHTML = "";
      return;
    }
    const busy = ss.step === "processing";
    layer.innerHTML = `
    <div class="sheet-wrap" role="dialog" aria-modal="true" aria-label="Comprar ${esc(song.title)}">
      ${busy ? "" : `<button class="backdrop" data-action="close-song" aria-label="Cerrar"></button>`}
      <div class="sheet no-scrollbar">
        <div class="grabber"></div>
        <div class="sheet-body">
          <div class="sheet-head">
            <div class="song-cover">${icon("disc", 22)}</div>
            <div style="min-width:0;flex:1">
              <h2 class="truncate">${esc(song.title)}</h2>
              <p>${esc(band.name)} · ${esc(song.duration)}</p>
            </div>
            <button class="close-btn" data-action="close-song" aria-label="Cerrar" ${busy ? "disabled" : ""}>${icon("x", 18)}</button>
          </div>

          <p class="q-hint" style="margin-top:1.25rem">Obra original. Podrás escucharla completa cuando quieras desde tu cuenta.</p>

          <div class="summary">
            <div class="sum-total"><b>Precio de la canción</b><span>${mxn(song.price)}</span></div>
            ${splitRowsHTML(song.price, band.name)}
          </div>

          <button class="btn-primary pay-btn" data-action="confirm-song" ${busy ? "disabled" : ""}>
            ${busy ? `${icon("loader", 17, "spin")} Procesando pago…` : `${icon("lock", 16)} Pagar ${mxn(song.price)}`}
          </button>
          <p class="pay-hint ${ss.error ? "err" : ""}">${esc(ss.error)}</p>
        </div>
      </div>
    </div>`;
  }

  async function buySong() {
    const ss = S.songSheet;
    if (!ss || ss.step !== "confirm") return;
    const songId = ss.songId;
    ss.step = "processing";
    ss.error = "";
    S.buyingSongId = songId;
    renderSongSheet();
    renderBand();
    try {
      let chain = null;
      const band = bandById(S.selectedBandId);
      const song = band?.songs.find((s) => s.id === songId);
      if (window.SonoraWeb3?.enabled && band && song) {
        chain = await SonoraWeb3.comprar({ bandName: band.name, songTitle: song.title });
      }
      await API.buySong(songId, chain?.txHash);
      S.purchased.add(songId);
      API.getMyPurchases()
        .then((list) => {
          S.myPurchases = list;
          if (S.tab === "perfil") renderScreen();
        })
        .catch(() => {});
      S.songSheet = null;
      toast("¡Canción comprada! Ya puedes escucharla; también está en Perfil → Mis canciones.");
      if (chain) window.open(chain.url, "_blank", "noopener");
    } catch (err) {
      ss.step = "confirm";
      ss.error = err.message;
    } finally {
      S.buyingSongId = null;
      renderSongSheet();
      renderBand();
    }
  }

  const audioUrls = new Map(); // songId -> url (ya autorizada)
  let playToken = 0;

  /** Vuelve a pintar todo lo que muestra botones de reproducir */
  function refreshPlayers() {
    renderBand();
    if (S.tab === "perfil") renderScreen();
  }

  async function playSong(songId) {
    if (!S.purchased.has(songId)) {
      // No comprada: en el bazar se abre la compra
      if (S.selectedBandId) openSongSheet(songId);
      else toast("Compra la canción para poder escucharla.");
      return;
    }
    if (S.playingSongId === songId || S.loadingSongId === songId) {
      playToken++;
      stopAudio();
      refreshPlayers();
      return;
    }
    stopAudio();
    const token = ++playToken;
    S.loadingSongId = songId;
    refreshPlayers();

    let url = audioUrls.get(songId);
    if (!url) {
      try {
        url = await API.getSongAudio(songId);
      } catch (err) {
        if (token === playToken) toast(err.message, true);
      }
      if (url) audioUrls.set(songId, url);
    }
    if (token !== playToken) return; // eligió otra canción mientras cargaba
    S.loadingSongId = null;
    if (!url) {
      toast("El audio de esta canción aún no está disponible.");
      refreshPlayers();
      return;
    }
    audio = new Audio(url);
    audio.addEventListener("ended", () => {
      S.playingSongId = null;
      refreshPlayers();
    });
    audio.play().catch(() => toast("No se pudo reproducir el audio.", true));
    S.playingSongId = songId;
    refreshPlayers();
  }

  function stopAudio() {
    if (audio) {
      audio.pause();
      audio = null;
    }
    S.playingSongId = null;
    S.loadingSongId = null;
  }

  // =====================================================================
  // Carga de datos
  // =====================================================================
  async function loadBands() {
    S.bandsStatus = "loading";
    if ($("#home-results")) $("#home-results").innerHTML = homeResultsHTML();
    try {
      S.bands = await API.getBands();
      S.bandsStatus = "ok";
    } catch (err) {
      S.bandsStatus = "error";
      S.bandsError = "No pudimos cargar las bandas. " + err.message;
    }
    if (S.tab === "inicio" && $("#home-results")) $("#home-results").innerHTML = homeResultsHTML();
  }

  async function loadUserData(session) {
    const user = session.user;
    S.isGuest = !!user.is_anonymous;
    S.userEmail = user.email || "";
    const meta = user.user_metadata || {};
    S.userName =
      meta.full_name || meta.name || (user.email ? user.email.split("@")[0] : "") || "Invitado";
    S.userName = S.userName.charAt(0).toUpperCase() + S.userName.slice(1);

    render();
    if (S.bandsStatus !== "ok") loadBands();

    try {
      const [profile, bookings, purchased, decisions, myReviews, myPurchases] = await Promise.all([
        API.getProfile(user.id).catch(() => null),
        API.getBookings(),
        API.getPurchasedSongIds(),
        API.getBandDecisions().catch(() => []),
        API.getMyReviews().catch(() => ({ bookings: [], songs: [] })),
        API.getMyPurchases().catch(() => []),
      ]);
      if (profile?.full_name && !S.isGuest) S.userName = profile.full_name;
      S.bookings = bookings;
      S.purchased = new Set(purchased);
      S.myPurchases = myPurchases;
      S.decisions = new Map((decisions || []).map((d) => [d.band_id, d.status]));
      S.myReviews = {
        bookings: new Map(myReviews.bookings.map((r) => [r.bookingId, r])),
        songs: new Map(myReviews.songs.map((r) => [r.songId, r])),
      };
    } catch (err) {
      toast("No se pudieron cargar tus datos: " + err.message, true);
    }
    renderNav();
    if (S.tab !== "inicio") renderScreen();
    else {
      $(".home-header .h1") && ($(".home-header .h1").textContent = `Hola, ${S.userName.split(" ")[0]}`);
      refreshHome(); // muestra la sección "Para ti" con las decisiones del usuario
    }
  }

  function resetUserState() {
    stopAudio();
    audioUrls.clear();
    Object.assign(S, {
      loadedUserId: null,
      userName: "",
      userEmail: "",
      isGuest: false,
      tab: "inicio",
      query: "",
      bookings: [],
      purchased: new Set(),
      myPurchases: [],
      selectedBandId: null,
      sheet: null,
      songSheet: null,
      buyingSongId: null,
      decisions: new Map(),
      recsBusy: false,
      myReviews: { bookings: new Map(), songs: new Map() },
      reviewSheet: null,
    });
    S.auth = { mode: "login", loading: null, error: "", notice: "", name: "", email: "", password: "", showPw: false };
    document.body.style.overflow = "";
  }

  // =====================================================================
  // Eventos (delegación)
  // =====================================================================
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const { action, id, tab } = el.dataset;

    switch (action) {
      // --- Onboarding ---
      case "toggle-pw": {
        captureAuthFields();
        S.auth.showPw = !S.auth.showPw;
        const input = $("#f-password");
        input.type = S.auth.showPw ? "text" : "password";
        el.innerHTML = icon(S.auth.showPw ? "eye-off" : "eye", 17);
        el.setAttribute("aria-label", S.auth.showPw ? "Ocultar contraseña" : "Mostrar contraseña");
        break;
      }
      case "pick-role":
        captureAuthFields();
        S.auth.role = el.dataset.role;
        renderOnboarding();
        break;
      case "go-artist":
        goToArtistPanel();
        break;
      case "become-artist":
        becomeArtist();
        break;
      case "switch-mode":
        captureAuthFields();
        S.auth.mode = S.auth.mode === "signup" ? "login" : "signup";
        S.auth.error = "";
        S.auth.notice = "";
        renderOnboarding();
        break;
      case "google":
        startAuth("google");
        break;
      case "guest":
        startAuth("guest");
        break;

      // --- Navegación ---
      case "tab":
        S.tab = tab;
        renderNav();
        renderScreen();
        window.scrollTo(0, 0);
        break;
      case "logout":
        try { sessionStorage.removeItem(VIEW_AS_CLIENT); } catch {}
        API.signOut();
        break;
      case "reload-bands":
        loadBands();
        break;

      // --- Recomendaciones "Para ti" ---
      case "rec-yes":
        respondToRec("match");
        break;
      case "rec-no":
        respondToRec("skip");
        break;
      case "reset-recs":
        resetRecs();
        break;

      // --- Banda ---
      case "open-band": {
        const band = bandById(id);
        if (!band) return;
        S.selectedBandId = id;
        S.bandTab = "contratar";
        S.packageId = (band.packages.find((p) => p.popular) || band.packages[0])?.id ?? null;
        renderBand();
        loadBandReviews(id);
        $(".glass-btn")?.focus();
        break;
      }
      case "close-band":
        stopAudio();
        S.songSheet = null;
        renderSongSheet();
        S.selectedBandId = null;
        renderBand();
        break;
      case "band-tab":
        S.bandTab = tab;
        renderBand();
        break;
      case "pick-package":
        S.packageId = id;
        renderBand();
        break;
      case "buy-song":
        openSongSheet(id);
        break;
      case "confirm-song":
        buySong();
        break;
      case "close-song":
        if (S.songSheet?.step === "processing") return;
        S.songSheet = null;
        renderSongSheet();
        break;
      case "play-song":
        playSong(id);
        break;

      // --- Reseñas ---
      case "review-booking":
        openReview("booking", id);
        break;
      case "review-song":
        openReview("song", id);
        break;
      case "rate":
        if (S.reviewSheet && S.reviewSheet.step === "form") {
          S.reviewSheet.rating = Number(el.dataset.value);
          S.reviewSheet.error = "";
          updateReviewSheet();
        }
        break;
      case "submit-review":
        submitReview();
        break;
      case "close-review":
        closeReview();
        break;
      case "reload-reviews":
        loadBandReviews(id);
        break;

      // --- Reserva ---
      case "open-sheet":
        openSheet();
        break;
      case "close-sheet":
        if (S.sheet?.step === "processing") return;
        S.sheet = null;
        renderSheet();
        break;
      case "close-sheet-home":
        S.sheet = null;
        S.selectedBandId = null;
        stopAudio();
        S.tab = "inicio";
        render();
        break;
      case "view-reservas":
        S.sheet = null;
        S.selectedBandId = null;
        stopAudio();
        S.tab = "reservas";
        render();
        window.scrollTo(0, 0);
        break;
      case "pick-day":
        S.sheet.dayKey = el.dataset.key;
        S.sheet.error = "";
        fixSheetSelection();
        renderSheet();
        break;
      case "pick-time":
        S.sheet.time = el.dataset.time;
        S.sheet.error = "";
        fixSheetSelection();
        renderSheet();
        break;
      case "hours": {
        const h = S.sheet.hours + Number(el.dataset.delta);
        S.sheet.hours = Math.min(maxHoursFor(S.sheet.time), Math.max(1, h));
        S.sheet.wantedHours = S.sheet.hours;
        renderSheet();
        break;
      }
      case "pay":
        pay();
        break;

      // --- Reservas / Perfil ---
      case "cancel-booking":
        cancelBooking(id);
        break;
      case "release-booking":
        releaseBooking(id);
        break;
      case "soon":
        toast("Disponible próximamente.");
        break;
    }
  });

  document.addEventListener("submit", (e) => {
    if (e.target.id === "auth-form") {
      e.preventDefault();
      handleAuthSubmit();
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "search") {
      S.query = e.target.value;
      $("#home-results").innerHTML = homeResultsHTML();
    } else if (e.target.id === "review-comment" && S.reviewSheet) {
      S.reviewSheet.comment = e.target.value;
      const c = $("#review-count");
      if (c) c.textContent = e.target.value.length;
    } else if (e.target.id === "addr" && S.sheet) {
      S.sheet.address = e.target.value;
      S.sheet.error = "";
      updatePayButton();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (S.reviewSheet) {
      closeReview();
    } else if (S.songSheet) {
      if (S.songSheet.step === "processing") return;
      S.songSheet = null;
      renderSongSheet();
    } else if (S.sheet && S.sheet.step === "form") {
      S.sheet = null;
      renderSheet();
    } else if (S.selectedBandId && !S.sheet) {
      stopAudio();
      S.selectedBandId = null;
      renderBand();
    }
  });

  // =====================================================================
  // Arranque
  // =====================================================================
  async function init() {
    if (!API.configured) {
      S.booting = false;
      render();
      return;
    }

    API.onAuthChange((session) => {
      const uid = session?.user?.id ?? null;
      if (uid === S.loadedUserId) {
        S.session = session; // refresco de token
        return;
      }
      if (!session) {
        resetUserState();
        S.session = null;
        S.booting = false;
        render();
        return;
      }
      // La opción elegida en el login decide a dónde entra
      const chosen = takeChosenRole();
      if (chosen === "artista" && !session.user.is_anonymous) {
        S.session = session;
        S.booting = true;
        render();
        // Si la cuenta aún no era de artista, se marca como tal
        setTimeout(async () => {
          try {
            if (!isArtist(session)) await API.becomeArtist();
            goToArtistPanel();
          } catch (err) {
            S.booting = false;
            toast(err.message, true);
            S.loadedUserId = uid;
            loadUserData(session);
          }
        }, 0);
        return;
      }
      if (chosen === "cliente") {
        try { sessionStorage.setItem(VIEW_AS_CLIENT, "1"); } catch {}
      }
      // Sin elección (sesión que ya estaba abierta): los artistas van a su panel
      if (isArtist(session) && !wantsClientView()) {
        S.session = session;
        goToArtistPanel();
        return;
      }
      S.session = session;
      S.loadedUserId = uid;
      S.booting = false;
      // setTimeout evita llamadas a Supabase dentro del callback de auth
      setTimeout(() => loadUserData(session), 0);
    });

    try {
      const session = await API.getSession();
      if (!session) {
        S.booting = false;
        render();
      }
    } catch {
      S.booting = false;
      render();
    }
  }

  render();
  init();
})();
