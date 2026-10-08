/**
 * SONORA · Panel de Artistas
 * Ingresos · Integrantes y porcentajes · Canciones · Trazabilidad
 */
(function () {
  "use strict";

  // =====================================================================
  // Utilidades
  // =====================================================================
  const CFG = window.SONORA_CONFIG;
  const SHARE = CFG.ARTIST_SHARE ?? 0.95;
  const COOP = CFG.COOP_NAME || "Cooperación Sonora";
  const CHAIN = CFG.BLOCKCHAIN || { name: "blockchain", txUrl: "", addressUrl: "" };
  const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const DAY_SHORT = ["L", "M", "Mi", "J", "V", "S", "D"];
  const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
  const MAX_FILE_MB = 25;

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const fmt0 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  const fmt2 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const mxn = (n) => (Number.isInteger(Math.round((n || 0) * 100) / 100) ? fmt0 : fmt2).format(n || 0);
  const pct = (n) => `${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 })} %`;
  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const dateFromISO = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const fmtDay = (iso) =>
    cap(dateFromISO(iso).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(/\./g, ""));
  const fmtStamp = (ts) =>
    new Date(ts).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(/\./g, "");
  const shortHash = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "");
  const plural = (n, a, b) => (n === 1 ? a : b);

  let toastTimer;
  function toast(msg, err = false) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.className = "toast" + (err ? " err" : "");
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 3500);
  }

  // =====================================================================
  // Estado
  // =====================================================================
  const S = {
    booting: true,
    session: null,
    loadedUser: null,
    loading: false,
    band: null,
    members: [],
    songs: [],
    bookings: [],
    sales: [],
    tab: "ingresos",
    editingBand: false,
    bandSaving: false,
    bandError: "",
    draft: [], // integrantes en edición
    draftDirty: false,
    membersSaving: false,
    membersError: "",
    upload: { busy: false, error: "", file: null, duration: "" },
    traceFilter: "todas",
    openTx: null,
    playing: null,
  };
  const app = $("#app");
  let audio = null;

  // =====================================================================
  // Cálculos
  // =====================================================================
  const active = () => S.bookings.filter((b) => b.status !== "cancelada");
  const isPast = (b) => b.eventDate < todayISO();

  function earnings() {
    const bk = active();
    const released = bk.filter(isPast).reduce((s, b) => s + b.artist, 0) + S.sales.reduce((s, x) => s + x.artist, 0);
    const vault = bk.filter((b) => !isPast(b)).reduce((s, b) => s + b.artist, 0);
    return {
      total: released + vault,
      released,
      vault,
      events: bk.reduce((s, b) => s + b.artist, 0),
      eventsCount: bk.length,
      music: S.sales.reduce((s, x) => s + x.artist, 0),
      musicCount: S.sales.length,
    };
  }
  const memberAmount = (amount, share) => Math.round(amount * share) / 100;

  // =====================================================================
  // Render raíz
  // =====================================================================
  function render() {
    if (S.booting || (S.session && S.loading)) {
      app.innerHTML = `<div class="boot">${icon("loader", 28, "spin")}</div>`;
      return;
    }
    if (!S.session) return;
    if (!S.band || S.editingBand) return renderBandForm();

    app.innerHTML = `
      ${demoBanner()}
      <header class="top">
        <div class="top-inner">
          <div class="brand">${icon("music", 18)}<span>sonora</span><small>artistas</small></div>
          <div class="top-band">
            <div class="top-band-text">
              <b class="truncate">${esc(S.band.name)}</b>
              <span class="truncate">${esc(S.band.genre)} · ${mxn(S.band.hourlyRate)}/hora</span>
            </div>
            <button class="btn-ghost" data-action="edit-band">${icon("pencil", 15)}<span class="hide-sm">Editar banda</span></button>
            <button class="btn-ghost" data-action="view-client" title="Ver la app de clientes">${icon("eye", 15)}<span class="hide-sm">Vista de cliente</span></button>
            <button class="btn-icon" data-action="logout" aria-label="Cerrar sesión" title="Cerrar sesión">${icon("log-out", 17)}</button>
          </div>
        </div>
        <nav class="tabs" aria-label="Secciones">
          ${[
            ["ingresos", "Ingresos", "banknote"],
            ["integrantes", "Integrantes", "users"],
            ["canciones", "Canciones", "disc"],
            ["trazabilidad", "Trazabilidad", "link"],
          ]
            .map(
              ([k, l, i]) =>
                `<button class="tab ${S.tab === k ? "active" : ""}" data-action="tab" data-tab="${k}" aria-current="${S.tab === k ? "page" : "false"}">${icon(i, 16)}<span>${l}</span></button>`
            )
            .join("")}
        </nav>
      </header>
      <main class="main" id="main">${screenHTML()}</main>`;
  }

  function renderMain() {
    const m = $("#main");
    if (m) m.innerHTML = screenHTML();
    else render();
  }

  function screenHTML() {
    if (S.tab === "integrantes") return membersHTML();
    if (S.tab === "canciones") return songsHTML();
    if (S.tab === "trazabilidad") return traceHTML();
    return incomeHTML();
  }

  const demoBanner = () =>
    API.demo
      ? `<div class="demo-bar">${icon("alert", 15)} Modo demo: datos de ejemplo guardados en este navegador. Los hashes son ficticios, así que el explorador no los encontrará.</div>`
      : "";

  // =====================================================================
  // Acceso: login único en la app de clientes
  // =====================================================================
  const LOGIN_URL = "../cliente/index.html";
  function goToLogin() {
    S.booting = true;
    render();
    location.replace(LOGIN_URL);
  }
  function viewAsClient() {
    try { sessionStorage.setItem("sonora_vista_cliente", "1"); } catch {}
    location.href = LOGIN_URL;
  }
  async function logout() {
    try { sessionStorage.removeItem("sonora_vista_cliente"); } catch {}
    await API.signOut();
    goToLogin();
  }

  // =====================================================================
  // Datos de la banda (alta y edición)
  // =====================================================================
  function renderBandForm() {
    const b = S.band || { name: "", genre: "", hourlyRate: 1000, bio: "", availability: ["Viernes", "Sábado"] };
    const isNew = !S.band;
    app.innerHTML = `
    ${demoBanner()}
    <div class="setup">
      <div class="setup-box">
        <div class="brand">${icon("music", 18)}<span>sonora</span><small>artistas</small></div>
        <h1>${isNew ? "Da de alta a tu banda" : "Datos de la banda"}</h1>
        <p class="muted">${isNew ? "Así te verán los clientes en Sonora. Puedes cambiarlo después." : "Los cambios se reflejan de inmediato en la app de clientes."}</p>
        <form id="band-form" class="form" novalidate>
          <label class="field"><span>Nombre de la banda</span><input name="name" class="input" maxlength="60" value="${esc(b.name)}" required></label>
          <div class="row-2">
            <label class="field"><span>Género</span><input name="genre" class="input" maxlength="40" placeholder="Norteño, Rock, Jazz…" value="${esc(b.genre)}"></label>
            <label class="field"><span>Tarifa por hora (MXN)</span><input name="rate" class="input" type="number" min="100" max="100000" step="50" value="${b.hourlyRate}"></label>
          </div>
          <label class="field"><span>Descripción</span><textarea name="bio" class="input" rows="3" maxlength="400" placeholder="Qué tocan, para qué eventos, cuántos años llevan…">${esc(b.bio)}</textarea></label>
          <fieldset class="field">
            <legend>Días en que se presentan</legend>
            <div class="days">
              ${DAYS.map(
                (d, i) => `<label class="day-toggle" title="${d}">
                  <input type="checkbox" name="days" value="${d}" ${b.availability.includes(d) ? "checked" : ""}>
                  <span>${DAY_SHORT[i]}</span></label>`
              ).join("")}
            </div>
            <small class="muted">Los clientes solo podrán reservar en estos días.</small>
          </fieldset>
          ${S.bandError ? `<p class="error" role="alert">${esc(S.bandError)}</p>` : ""}
          <div class="actions-row">
            ${isNew ? `<button type="button" class="btn-ghost" data-action="logout">Salir</button>` : `<button type="button" class="btn-ghost" data-action="cancel-band">Cancelar</button>`}
            <button type="submit" class="btn-primary auto" ${S.bandSaving ? "disabled" : ""}>
              ${S.bandSaving ? icon("loader", 17, "spin") : ""}${isNew ? "Crear banda" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>`;
  }

  async function submitBand(form) {
    const f = new FormData(form);
    const data = {
      name: String(f.get("name") || "").trim(),
      genre: String(f.get("genre") || "").trim(),
      hourlyRate: Number(f.get("rate")),
      bio: String(f.get("bio") || "").trim(),
      availability: f.getAll("days"),
    };
    S.bandError = "";
    if (data.name.length < 2) S.bandError = "Escribe el nombre de la banda.";
    else if (data.genre.length < 2) S.bandError = "Escribe el género musical.";
    else if (!(data.hourlyRate >= 100)) S.bandError = "La tarifa por hora debe ser de al menos $100.";
    else if (!data.availability.length) S.bandError = "Elige al menos un día en que se presentan.";
    if (S.bandError) return renderBandForm();

    S.bandSaving = true;
    renderBandForm();
    try {
      const isNew = !S.band;
      S.band = await API.saveBand(data, S.band?.id);
      S.editingBand = false;
      if (isNew) {
        S.tab = "integrantes";
        S.draft = [];
        await loadBandData();
      }
      toast(isNew ? "Banda creada. Ahora registra a los integrantes." : "Datos guardados.");
    } catch (e) {
      S.bandError = e.message;
    }
    S.bandSaving = false;
    render();
  }

  // =====================================================================
  // INGRESOS
  // =====================================================================
  function incomeHTML() {
    const e = earnings();
    const upcoming = active()
      .filter((b) => !isPast(b))
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

    return `
    <section class="page">
      <div class="page-head">
        <h1>Ingresos</h1>
        <p class="muted">De cada pago, el ${pct(SHARE * 100)} es para la banda y el ${pct((1 - SHARE) * 100)} para ${esc(COOP)}. Aquí ves solo la parte de la banda.</p>
      </div>

      <div class="kpis">
        <div class="kpi kpi-main">
          <span>Total para la banda</span>
          <b>${mxn(e.total)}</b>
        </div>
        <div class="kpi">
          <span>${icon("check-circle", 14)} Liberado</span>
          <b>${mxn(e.released)}</b>
          <small>Eventos realizados y ventas de música</small>
        </div>
        <div class="kpi">
          <span>${icon("shield", 14)} En bóveda</span>
          <b>${mxn(e.vault)}</b>
          <small>Se libera al terminar cada evento</small>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h2>Por origen</h2>
          <div class="line"><span>${icon("calendar", 15)} Eventos <small>${e.eventsCount} ${plural(e.eventsCount, "reserva", "reservas")}</small></span><b>${mxn(e.events)}</b></div>
          <div class="line"><span>${icon("disc", 15)} Música <small>${e.musicCount} ${plural(e.musicCount, "venta", "ventas")}</small></span><b>${mxn(e.music)}</b></div>
          ${barHTML(e.events, e.music)}
        </div>

        <div class="card">
          <h2>Reparto entre integrantes</h2>
          ${
            S.members.length
              ? `<div class="table">
                  <div class="tr th"><span>Integrante</span><span>%</span><span>Total</span><span>Liberado</span></div>
                  ${S.members
                    .map(
                      (m) => `<div class="tr">
                        <span><b>${esc(m.name)}</b>${m.role ? `<small>${esc(m.role)}</small>` : ""}</span>
                        <span>${pct(m.share)}</span>
                        <span>${mxn(memberAmount(e.total, m.share))}</span>
                        <span>${mxn(memberAmount(e.released, m.share))}</span>
                      </div>`
                    )
                    .join("")}
                </div>`
              : `<div class="empty-small">Registra a los integrantes y sus porcentajes para ver cuánto le toca a cada uno.
                  <button class="link" data-action="tab" data-tab="integrantes">Registrar integrantes</button></div>`
          }
        </div>
      </div>

      <div class="card">
        <h2>Próximos eventos</h2>
        ${
          upcoming.length
            ? upcoming
                .map(
                  (b) => `<div class="event">
                    <div class="event-date"><b>${dateFromISO(b.eventDate).getDate()}</b><span>${dateFromISO(b.eventDate).toLocaleDateString("es-MX", { month: "short" }).replace(".", "")}</span></div>
                    <div class="event-info">
                      <b>${esc(fmtDay(b.eventDate))} · ${esc(b.time)} h · ${b.hours} ${plural(b.hours, "hora", "horas")}</b>
                      <span class="truncate">${icon("map-pin", 13)} ${esc(b.address)}</span>
                    </div>
                    <b class="event-amt">${mxn(b.artist)}</b>
                  </div>`
                )
                .join("")
            : `<p class="muted small">No hay eventos próximos.</p>`
        }
      </div>
    </section>`;
  }

  function barHTML(a, b) {
    const t = a + b;
    if (!t) return "";
    return `<div class="bar" aria-hidden="true"><span style="width:${(a / t) * 100}%"></span></div>
      <div class="legend"><span><i class="dot d1"></i>Eventos ${Math.round((a / t) * 100)} %</span><span><i class="dot d2"></i>Música ${Math.round((b / t) * 100)} %</span></div>`;
  }

  // =====================================================================
  // INTEGRANTES
  // =====================================================================
  const draftTotal = () => Math.round(S.draft.reduce((s, m) => s + (Number(m.share) || 0), 0) * 100) / 100;

  function draftProblem() {
    if (!S.draft.length) return "Agrega al menos un integrante.";
    for (const m of S.draft) {
      if (m.name.trim().length < 2) return "Cada integrante necesita un nombre.";
      const sh = Number(m.share);
      if (!(sh > 0 && sh <= 100)) return "Cada porcentaje debe ser mayor a 0.";
      if (m.wallet.trim() && !WALLET_RE.test(m.wallet.trim())) return `La dirección de cobro de ${m.name || "un integrante"} no es válida.`;
    }
    const t = draftTotal();
    if (t !== 100) return `Los porcentajes suman ${pct(t)}; deben sumar 100 %.`;
    return "";
  }

  function membersHTML() {
    const total = draftTotal();
    const problem = draftProblem();
    return `
    <section class="page">
      <div class="page-head">
        <h1>Integrantes</h1>
        <p class="muted">El ${pct(SHARE * 100)} de cada pago se reparte entre los integrantes según su porcentaje. La dirección de cobro es la cuenta donde cada quien recibe su parte.</p>
      </div>

      <div class="card">
        <div class="members">
          <div class="mrow mhead"><span>Nombre</span><span>Rol</span><span>%</span><span>Dirección de cobro</span><span></span></div>
          ${S.draft
            .map(
              (m, i) => `
            <div class="mrow">
              <input class="input" data-mi="${i}" data-mf="name" value="${esc(m.name)}" placeholder="Nombre" aria-label="Nombre">
              <input class="input" data-mi="${i}" data-mf="role" value="${esc(m.role)}" placeholder="Voz, guitarra…" aria-label="Rol (opcional)">
              <div class="pct-input"><input class="input" data-mi="${i}" data-mf="share" type="number" min="0" max="100" step="0.5" value="${esc(m.share)}" aria-label="Porcentaje"><span>%</span></div>
              <input class="input mono ${m.wallet && !WALLET_RE.test(m.wallet.trim()) ? "invalid" : ""}" data-mi="${i}" data-mf="wallet" value="${esc(m.wallet)}" placeholder="0x… (opcional)" aria-label="Dirección de cobro (opcional)" spellcheck="false">
              <button class="btn-icon danger" data-action="del-member" data-i="${i}" aria-label="Quitar a ${esc(m.name || "integrante")}">${icon("trash", 16)}</button>
            </div>`
            )
            .join("")}
        </div>

        <div class="members-foot">
          <div class="foot-left">
            <button class="btn-ghost" data-action="add-member">${icon("plus", 15)} Agregar integrante</button>
            ${S.draft.length > 1 ? `<button class="btn-ghost" data-action="equal-split">Partes iguales</button>` : ""}
          </div>
          <div class="foot-right">
            <span id="m-total" class="total-badge ${total === 100 ? "ok" : "bad"}">Total ${pct(total)}</span>
            <button id="m-save" class="btn-primary auto" data-action="save-members" ${problem || !S.draftDirty || S.membersSaving ? "disabled" : ""}>
              ${S.membersSaving ? icon("loader", 16, "spin") : ""}Guardar
            </button>
          </div>
        </div>
        <p id="m-problem" class="${S.membersError ? "error" : "muted"} small">${esc(S.membersError || (S.draftDirty ? problem : ""))}</p>
      </div>

      ${S.members.length ? examplePayout() : ""}
    </section>`;
  }

  function examplePayout() {
    const sample = 10000;
    const band = sample - Math.round(sample * (1 - SHARE));
    return `
    <div class="card">
      <h2>Ejemplo con un pago de ${mxn(sample)}</h2>
      <div class="line"><span>${esc(COOP)} (${pct((1 - SHARE) * 100)})</span><b>${mxn(sample - band)}</b></div>
      ${S.members.map((m) => `<div class="line"><span>${esc(m.name)} (${pct(m.share)} de ${mxn(band)})</span><b>${mxn(memberAmount(band, m.share))}</b></div>`).join("")}
    </div>`;
  }

  function updateMembersFooter() {
    const total = draftTotal();
    const problem = draftProblem();
    const badge = $("#m-total");
    if (!badge) return;
    badge.textContent = `Total ${pct(total)}`;
    badge.className = `total-badge ${total === 100 ? "ok" : "bad"}`;
    $("#m-save").disabled = !!problem || !S.draftDirty || S.membersSaving;
    const p = $("#m-problem");
    p.className = "muted small";
    p.textContent = problem;
  }

  async function saveMembers() {
    if (draftProblem()) return;
    S.membersSaving = true;
    S.membersError = "";
    renderMain();
    try {
      const payload = S.draft.map((m) => ({
        name: m.name.trim(),
        role: m.role.trim(),
        share: Number(m.share),
        wallet: m.wallet.trim(),
      }));
      S.members = await API.saveMembers(S.band.id, payload);
      S.draft = S.members.map((m) => ({ ...m }));
      S.draftDirty = false;
      toast("Integrantes guardados.");
    } catch (e) {
      S.membersError = e.message;
    }
    S.membersSaving = false;
    renderMain();
  }

  // =====================================================================
  // CANCIONES
  // =====================================================================
  function songsHTML() {
    const u = S.upload;
    const salesBy = {};
    S.sales.forEach((s) => {
      salesBy[s.songId] = salesBy[s.songId] || { n: 0, amt: 0 };
      salesBy[s.songId].n++;
      salesBy[s.songId].amt += s.artist;
    });

    return `
    <section class="page">
      <div class="page-head">
        <h1>Canciones</h1>
        <p class="muted">Las canciones publicadas aparecen en el Bazar Digital de la app de clientes.</p>
      </div>

      <form id="upload-form" class="card upload" novalidate>
        <h2>Subir canción</h2>
        <div class="upload-grid">
          <label class="field"><span>Título</span><input name="title" class="input" maxlength="80" placeholder="Nombre de la canción" ${u.busy ? "disabled" : ""}></label>
          <label class="field"><span>Precio (MXN)</span><input name="price" class="input" type="number" min="5" max="500" step="1" value="20" ${u.busy ? "disabled" : ""}></label>
        </div>
        <label class="drop ${u.file ? "has-file" : ""}">
          <input id="song-file" type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/ogg" ${u.busy ? "disabled" : ""}>
          ${icon(u.file ? "file-audio" : "upload", 20)}
          <span id="file-label">${u.file ? `<b>${esc(u.file.name)}</b> · ${esc(u.duration || "…")} · ${(u.file.size / 1048576).toFixed(1)} MB` : `Elige un archivo de audio (MP3, WAV, M4A · máx. ${MAX_FILE_MB} MB)`}</span>
        </label>
        <p class="small muted">De cada venta: ${pct(SHARE * 100)} para la banda y ${pct((1 - SHARE) * 100)} para ${esc(COOP)}.</p>
        ${u.error ? `<p class="error" role="alert">${esc(u.error)}</p>` : ""}
        <button type="submit" class="btn-primary auto" ${u.busy ? "disabled" : ""}>${u.busy ? icon("loader", 16, "spin") + "Subiendo…" : icon("upload", 16) + "Subir canción"}</button>
      </form>

      <div class="card">
        <h2>Tus canciones <small>${S.songs.length}</small></h2>
        ${
          S.songs.length
            ? S.songs
                .map((s) => {
                  const st = salesBy[s.id] || { n: 0, amt: 0 };
                  const playing = S.playing === s.id;
                  return `
            <div class="song ${s.published ? "" : "hidden-song"}">
              <button class="play ${playing ? "on" : ""}" data-action="play" data-id="${esc(s.id)}" aria-label="${playing ? "Pausar" : "Escuchar"} ${esc(s.title)}">
                ${icon(playing ? "pause" : "play", 15, "fill")}
              </button>
              <div class="song-main">
                <b class="truncate">${esc(s.title)}</b>
                <span>${esc(s.duration || "—")} · ${mxn(s.price)}</span>
              </div>
              <div class="song-stats">
                <b>${st.n} ${plural(st.n, "venta", "ventas")}</b>
                <span>${mxn(st.amt)} para la banda</span>
              </div>
              <button class="pill ${s.published ? "on" : ""}" data-action="toggle-song" data-id="${esc(s.id)}"
                title="${s.published ? "Ocultar del Bazar" : "Publicar en el Bazar"}">
                ${icon(s.published ? "eye" : "eye-off", 14)} ${s.published ? "Publicada" : "Oculta"}
              </button>
            </div>`;
                })
                .join("")
            : `<p class="muted small">Aún no has subido canciones.</p>`
        }
      </div>
    </section>`;
  }

  function readDuration(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => {
        const s = Math.round(a.duration || 0);
        URL.revokeObjectURL(url);
        resolve(s ? `${Math.floor(s / 60)}:${pad(s % 60)}` : "");
      };
      a.onerror = () => {
        URL.revokeObjectURL(url);
        resolve("");
      };
      a.src = url;
    });
  }

  async function pickFile(input) {
    const file = input.files[0];
    S.upload.error = "";
    if (!file) {
      S.upload.file = null;
      return renderMain();
    }
    if (!file.type.startsWith("audio/")) {
      S.upload.file = null;
      S.upload.error = "El archivo debe ser de audio.";
      return renderMain();
    }
    if (file.size > MAX_FILE_MB * 1048576) {
      S.upload.file = null;
      S.upload.error = `El archivo pesa más de ${MAX_FILE_MB} MB.`;
      return renderMain();
    }
    S.upload.file = file;
    S.upload.duration = "";
    const keep = keepUploadFields();
    renderMain();
    keep();
    S.upload.duration = await readDuration(file);
    const label = $("#file-label");
    if (label && S.upload.file === file) {
      label.innerHTML = `<b>${esc(file.name)}</b> · ${esc(S.upload.duration || "duración desconocida")} · ${(file.size / 1048576).toFixed(1)} MB`;
    }
  }

  /** Conserva título y precio escritos al volver a pintar el formulario */
  function keepUploadFields() {
    const f = $("#upload-form");
    const title = f?.title.value ?? "";
    const price = f?.price.value ?? "20";
    return () => {
      const n = $("#upload-form");
      if (n) {
        n.title.value = title;
        n.price.value = price;
      }
    };
  }

  async function submitUpload(form) {
    const u = S.upload;
    const title = form.title.value.trim();
    const price = Number(form.price.value);
    u.error = "";
    if (title.length < 2) u.error = "Escribe el título de la canción.";
    else if (!(price >= 5 && price <= 500)) u.error = "El precio debe estar entre $5 y $500.";
    else if (!u.file) u.error = "Elige el archivo de audio.";
    else if (S.songs.some((s) => s.title.toLowerCase() === title.toLowerCase())) u.error = "Ya tienes una canción con ese título.";
    const keep = keepUploadFields();
    if (u.error) {
      renderMain();
      return keep();
    }

    u.busy = true;
    renderMain();
    keep();
    try {
      const song = await API.uploadSong({
        bandId: S.band.id,
        title,
        price: Math.round(price),
        duration: u.duration,
        file: u.file,
        order: S.songs.length,
      });
      S.songs.push(song);
      S.upload = { busy: false, error: "", file: null, duration: "" };
      toast(`“${song.title}” ya está en el Bazar Digital.`);
      renderMain();
    } catch (e) {
      u.busy = false;
      u.error = "No se pudo subir: " + e.message;
      renderMain();
      keep();
    }
  }

  async function toggleSong(id) {
    const s = S.songs.find((x) => x.id === id);
    if (!s) return;
    const next = !s.published;
    s.published = next;
    renderMain();
    try {
      await API.setSongPublished(id, next);
      toast(next ? "Canción publicada en el Bazar." : "Canción oculta del Bazar. Sus ventas se conservan.");
    } catch (e) {
      s.published = !next;
      renderMain();
      toast(e.message, true);
    }
  }

  function play(id) {
    const s = S.songs.find((x) => x.id === id);
    if (!s) return;
    if (audio) {
      audio.pause();
      audio = null;
    }
    if (S.playing === id) {
      S.playing = null;
      return renderMain();
    }
    if (!s.audioUrl) {
      S.playing = null;
      renderMain();
      return toast(API.demo ? "En modo demo solo se escuchan las canciones subidas en esta sesión." : "Esta canción no tiene archivo de audio.");
    }
    audio = new Audio(s.audioUrl);
    audio.onended = () => {
      S.playing = null;
      renderMain();
    };
    audio.play().catch(() => toast("No se pudo reproducir el audio.", true));
    S.playing = id;
    renderMain();
  }

  // =====================================================================
  // TRAZABILIDAD
  // =====================================================================
  function txList() {
    const songTitle = (id) => S.songs.find((s) => s.id === id)?.title;
    const all = [
      ...S.bookings.map((b) => ({ ...b, title: `Reserva · ${fmtDay(b.eventDate)}`, sub: `${b.hours} ${plural(b.hours, "hora", "horas")} · ${b.address}` })),
      ...S.sales.map((s) => ({ ...s, title: `Venta · ${s.songTitle || songTitle(s.songId) || "Canción"}`, sub: "Bazar Digital" })),
    ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    const f = S.traceFilter;
    if (f === "reservas") return all.filter((t) => t.kind === "booking");
    if (f === "musica") return all.filter((t) => t.kind === "sale");
    if (f === "pendientes") return all.filter((t) => !t.txHash && t.status !== "cancelada");
    return all;
  }

  function txStatus(t) {
    if (t.status === "cancelada") return ["Cancelada", "st-cancel"];
    if (t.txHash) return ["Registrada", "st-ok"];
    return ["Pendiente", "st-wait"];
  }

  function traceHTML() {
    const all = [...S.bookings, ...S.sales];
    const registered = all.filter((t) => t.txHash).length;
    const pending = all.filter((t) => !t.txHash && t.status !== "cancelada").length;
    const list = txList();
    const filters = [
      ["todas", "Todas"],
      ["reservas", "Reservas"],
      ["musica", "Música"],
      ["pendientes", `Pendientes (${pending})`],
    ];

    return `
    <section class="page">
      <div class="page-head">
        <h1>Trazabilidad</h1>
        <p class="muted">Cada pago se registra en ${esc(CHAIN.name)}. Abre el hash en el explorador de bloques para verificar el monto y el reparto.</p>
      </div>

      <div class="trace-stats">
        <div><b>${all.length}</b><span>Movimientos</span></div>
        <div><b>${registered}</b><span>Registrados</span></div>
        <div><b>${pending}</b><span>Pendientes de registro</span></div>
      </div>

      <div class="chips" role="tablist">
        ${filters.map(([k, l]) => `<button class="chip ${S.traceFilter === k ? "on" : ""}" data-action="filter" data-f="${k}" role="tab" aria-selected="${S.traceFilter === k}">${l}</button>`).join("")}
      </div>

      <div class="card tx-list">
        ${list.length ? list.map(txHTML).join("") : `<p class="muted small">No hay movimientos con este filtro.</p>`}
      </div>
    </section>`;
  }

  function txHTML(t) {
    const [label, cls] = txStatus(t);
    const open = S.openTx === t.id;
    const hashCell = t.txHash
      ? `<a class="hash" href="${esc(CHAIN.txUrl + t.txHash)}" target="_blank" rel="noopener noreferrer" title="Ver en el explorador de bloques">${esc(shortHash(t.txHash))} ${icon("external", 13)}</a>`
      : `<span class="hash none">Sin hash todavía</span>`;

    return `
    <div class="tx ${open ? "open" : ""} ${t.status === "cancelada" ? "cancelled" : ""}">
      <button class="tx-row" data-action="open-tx" data-id="${esc(t.id)}" aria-expanded="${open}">
        <span class="tx-ic ${t.kind}">${icon(t.kind === "booking" ? "calendar" : "disc", 16)}</span>
        <span class="tx-main">
          <b class="truncate">${esc(t.title)}</b>
          <small class="truncate">${esc(fmtStamp(t.createdAt))}</small>
        </span>
        <span class="status ${cls}">${label}</span>
        <span class="tx-amt">${mxn(t.total)}</span>
        ${icon("chevron-down", 16, "chev")}
      </button>
      <div class="tx-hash-line">${hashCell}</div>
      ${open ? txDetailHTML(t) : ""}
    </div>`;
  }

  function txDetailHTML(t) {
    return `
    <div class="tx-detail">
      <p class="small muted">${esc(t.sub)}</p>
      <div class="line"><span>Pago total</span><b>${mxn(t.total)}</b></div>
      <div class="line"><span>${esc(COOP)} (${pct((1 - SHARE) * 100)})</span><b>${mxn(t.coop)}</b></div>
      <div class="line strong"><span>Para la banda (${pct(SHARE * 100)})</span><b>${mxn(t.artist)}</b></div>
      ${
        S.members.length
          ? `<div class="payouts">
              ${S.members
                .map(
                  (m) => `<div class="payout">
                    <span><b>${esc(m.name)}</b> · ${pct(m.share)}</span>
                    ${
                      m.wallet
                        ? `<a class="hash" href="${esc(CHAIN.addressUrl + m.wallet)}" target="_blank" rel="noopener noreferrer" title="Ver cuenta en el explorador">${icon("wallet", 13)} ${esc(shortHash(m.wallet))} ${icon("external", 12)}</a>`
                        : `<span class="hash none">${icon("wallet", 13)} Sin dirección de cobro</span>`
                    }
                    <b>${mxn(memberAmount(t.artist, m.share))}</b>
                  </div>`
                )
                .join("")}
            </div>
            <p class="small muted">Reparto calculado con los porcentajes actuales de los integrantes.</p>`
          : ""
      }
      ${t.status === "cancelada" ? `<p class="small error">Reserva cancelada: el pago no se libera a la banda.</p>` : ""}
      ${!t.txHash && t.status !== "cancelada" ? `<p class="small muted">${icon("clock", 13)} El pago está recibido y se registrará en ${esc(CHAIN.name)} en breve.</p>` : ""}
    </div>`;
  }

  // =====================================================================
  // Carga de datos
  // =====================================================================
  async function loadBandData() {
    const id = S.band.id;
    const [members, songs, bookings, sales] = await Promise.all([
      API.getMembers(id),
      API.getSongs(id),
      API.getBookings(id),
      API.getSales(id),
    ]);
    Object.assign(S, { members, songs, bookings, sales });
    S.draft = members.map((m) => ({ ...m }));
    S.draftDirty = false;
  }

  async function loadAll() {
    S.loading = true;
    render();
    try {
      S.band = await API.getMyBand();
      if (S.band) await loadBandData();
    } catch (e) {
      toast("No se pudieron cargar tus datos: " + e.message, true);
    }
    S.loading = false;
    render();
  }

  function reset() {
    if (audio) audio.pause();
    audio = null;
    Object.assign(S, {
      loadedUser: null, band: null, members: [], songs: [], bookings: [], sales: [], tab: "ingresos",
      editingBand: false, draft: [], draftDirty: false, membersError: "", playing: null, openTx: null,
      upload: { busy: false, error: "", file: null, duration: "" },
    });
  }

  // =====================================================================
  // Eventos
  // =====================================================================
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const { action, id } = el.dataset;
    switch (action) {
      case "logout":
        logout();
        break;
      case "view-client":
        viewAsClient();
        break;
      case "tab":
        if (S.tab === "integrantes" && S.draftDirty && el.dataset.tab !== "integrantes" &&
            !confirm("Tienes cambios sin guardar en los integrantes. ¿Salir sin guardar?")) return;
        if (el.dataset.tab !== "integrantes" && S.draftDirty) {
          S.draft = S.members.map((m) => ({ ...m }));
          S.draftDirty = false;
        }
        S.tab = el.dataset.tab;
        S.membersError = "";
        render();
        window.scrollTo(0, 0);
        break;
      case "edit-band":
        S.editingBand = true;
        S.bandError = "";
        render();
        break;
      case "cancel-band":
        S.editingBand = false;
        render();
        break;
      case "add-member":
        S.draft.push({ name: "", role: "", share: S.draft.length ? 0 : 100, wallet: "" });
        S.draftDirty = true;
        renderMain();
        document.querySelectorAll('[data-mf="name"]')[S.draft.length - 1]?.focus();
        break;
      case "del-member":
        S.draft.splice(Number(el.dataset.i), 1);
        S.draftDirty = true;
        renderMain();
        break;
      case "equal-split": {
        const n = S.draft.length;
        const base = Math.floor((100 / n) * 100) / 100;
        S.draft.forEach((m, i) => (m.share = i === 0 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base));
        S.draftDirty = true;
        renderMain();
        break;
      }
      case "save-members":
        saveMembers();
        break;
      case "play":
        play(id);
        break;
      case "toggle-song":
        toggleSong(id);
        break;
      case "filter":
        S.traceFilter = el.dataset.f;
        S.openTx = null;
        renderMain();
        break;
      case "open-tx":
        S.openTx = S.openTx === id ? null : id;
        renderMain();
        break;
    }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.mf) {
      const m = S.draft[Number(t.dataset.mi)];
      m[t.dataset.mf] = t.dataset.mf === "share" ? t.value : t.value;
      if (t.dataset.mf === "wallet") t.classList.toggle("invalid", !!t.value.trim() && !WALLET_RE.test(t.value.trim()));
      S.draftDirty = true;
      S.membersError = "";
      updateMembersFooter();
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "song-file") pickFile(e.target);
  });

  document.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === "band-form") submitBand(f);
    else if (f.id === "upload-form") submitUpload(f);
  });

  window.addEventListener("beforeunload", (e) => {
    if (S.draftDirty || S.upload.busy) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // =====================================================================
  // Arranque
  // =====================================================================
  API.onAuthChange((session) => {
    const uid = session?.user?.id ?? null;
    S.booting = false;
    if (uid && uid === S.loadedUser) {
      S.session = session;
      return;
    }
    // Sin sesión, o cuenta de invitado: al login único
    if (!session || session.user?.is_anonymous) {
      reset();
      S.session = null;
      goToLogin();
      return;
    }
    S.session = session;
    S.loadedUser = uid;
    setTimeout(loadAll, 0);
  });

  render();
})();
