/**
 * Web3 · Conexión de SoundOra con los smart contracts en Base Sepolia.
 * Requiere: ethers v6 (CDN) y js/config.js (bloque WEB3).
 *
 * Archivos que lee (carpeta abi/ en la raíz del repo):
 *  - addresses.json      direcciones de los contratos y red
 *  - *.json              ABIs de BookingEscrow, WorkRegistry y AccessToken
 *  - demo-data.json      bandas registradas en la cadena (lo genera SeedDemo.s.sol)
 *
 * Si una banda no está registrada en la cadena, las funciones devuelven null
 * y la app sigue funcionando solo con Supabase.
 */
(function () {
  const cfg = (window.SONORA_CONFIG && window.SONORA_CONFIG.WEB3) || {};
  const ABI_PATH = cfg.ABI_PATH || "../abi/";
  const WEI_PER_MXN = BigInt(cfg.WEI_PER_MXN || "10000000000"); // 1 MXN = 0.00000001 ETH (tasa simbólica de testnet)

  let loading = null;
  let signerOverride = null;
  let readProvider = null;

  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();

  // ------------------------------------------------------------------
  // Carga de direcciones, ABIs y bandas registradas en la cadena
  // ------------------------------------------------------------------
  function load() {
    if (loading) return loading;
    loading = (async () => {
      const get = async (file) => {
        const res = await fetch(ABI_PATH + file, { cache: "no-store" });
        if (!res.ok) throw new Error("No se encontró " + ABI_PATH + file);
        return res.json();
      };
      const [addr, BookingEscrow, WorkRegistry, AccessToken] = await Promise.all([
        get("addresses.json"),
        get("BookingEscrow.json"),
        get("WorkRegistry.json"),
        get("AccessToken.json"),
      ]);
      const bands = {};
      try {
        const demo = await get("demo-data.json");
        for (const b of Object.values(demo.bands || {})) {
          bands[norm(b.name)] = { bandId: Number(b.band_id), workId: Number(b.work_id) };
        }
      } catch (_) {
        console.warn("[web3] Sin demo-data.json: ninguna banda está registrada en la cadena.");
      }
      if (!readProvider) readProvider = new ethers.JsonRpcProvider(addr.rpcUrl);
      return { addr, abis: { BookingEscrow, WorkRegistry, AccessToken }, bands };
    })();
    loading.catch(() => (loading = null));
    return loading;
  }

  async function contract(name, runner) {
    const { addr, abis } = await load();
    return new ethers.Contract(addr[name], abis[name], runner || readProvider);
  }

  async function bandInfo(bandName) {
    const { bands } = await load();
    return bands[norm(bandName)] || null;
  }

  // ------------------------------------------------------------------
  // Wallet (MetaMask)
  // ------------------------------------------------------------------
  async function ensureChain() {
    const { addr } = await load();
    const chainId = "0x" + Number(addr.chainId).toString(16);
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (e) {
      const code = e.code ?? e?.data?.originalError?.code;
      if (code !== 4902) throw e;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId,
            chainName: "Base Sepolia",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [addr.rpcUrl],
            blockExplorerUrls: [addr.explorer],
          },
        ],
      });
    }
  }

  async function getSigner() {
    if (signerOverride) return signerOverride;
    if (!window.ethereum) throw new Error("Instala MetaMask para pagar con blockchain.");
    await window.ethereum.request({ method: "eth_requestAccounts" });
    await ensureChain();
    const provider = new ethers.BrowserProvider(window.ethereum);
    return provider.getSigner();
  }

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  function parseEvent(c, receipt, name) {
    for (const log of receipt?.logs || []) {
      try {
        const parsed = c.interface.parseLog(log);
        if (parsed && parsed.name === name) return parsed;
      } catch (_) {}
    }
    return null;
  }

  const REVERTS = {
    TooEarly: "El evento aún no ha iniciado: el pago se libera después del evento.",
    TooLate: "El plazo para esta acción ya terminó.",
    WrongStatus: "Esta reserva ya fue liberada, cancelada o está en disputa.",
    NotClient: "Solo quien hizo la reserva puede liberar el pago.",
    EventInPast: "La fecha del evento ya pasó.",
    AlreadyOwned: "Ya tienes esta canción.",
    NotForSale: "Esta canción no está a la venta.",
    WrongPrice: "El precio de la canción cambió. Intenta de nuevo.",
    BandNotFound: "La banda no está registrada en la cadena.",
  };

  /** Nombre del error personalizado del contrato (ethers no siempre lo decodifica al enviar) */
  function revertName(e, c) {
    if (e?.revert?.name) return e.revert.name;
    const data = [e?.data, e?.info?.error?.data, e?.error?.data].find((d) => typeof d === "string" && d.length >= 10);
    if (!data || !c) return null;
    try {
      return c.interface.parseError(data)?.name || null;
    } catch (_) {
      return null;
    }
  }

  function friendly(e, c) {
    if (e?.code === "ACTION_REJECTED" || e?.code === 4001) return new Error("Cancelaste el pago en la wallet.");
    if (e?.code === "INSUFFICIENT_FUNDS")
      return new Error("Tu wallet no tiene ETH de prueba suficiente en Base Sepolia.");
    const name = revertName(e, c);
    if (name && REVERTS[name]) return new Error(REVERTS[name]);
    return new Error(e?.shortMessage || e?.reason || e?.message || "Error en la transacción.");
  }

  async function txUrl(hash) {
    const { addr } = await load();
    return addr.explorer + "/tx/" + hash;
  }

  // ------------------------------------------------------------------
  // Acciones
  // ------------------------------------------------------------------

  /** ¿La banda está registrada en la cadena? */
  async function available(bandName) {
    try {
      return !!(await bandInfo(bandName));
    } catch (_) {
      return false;
    }
  }

  /**
   * Reserva y paga: el dinero queda bloqueado en BookingEscrow hasta el evento.
   * @returns {txHash, url, bookingId} o null si la banda no está en la cadena
   */
  async function reservar({ bandName, eventDate, time, totalMXN }) {
    const band = await bandInfo(bandName);
    if (!band) return null;
    let escrow = null;
    try {
      const signer = await getSigner();
      escrow = await contract("BookingEscrow", signer);
      const eventTs = Math.floor(new Date(`${eventDate}T${time}:00`).getTime() / 1000);
      const value = BigInt(Math.round(Number(totalMXN))) * WEI_PER_MXN;
      const tx = await escrow.book(band.bandId, eventTs, { value });
      const receipt = await tx.wait();
      const ev = parseEvent(escrow, receipt, "Booked");
      return { txHash: tx.hash, url: await txUrl(tx.hash), bookingId: ev ? Number(ev.args.bookingId) : null };
    } catch (e) {
      throw friendly(e, escrow);
    }
  }

  /**
   * Compra una canción: paga las regalías a los autores y entrega la licencia.
   * Solo cobra en la cadena si el título coincide con la obra registrada de esa banda.
   * @returns {txHash, url} o null si la canción no está en la cadena
   */
  async function comprar({ bandName, songTitle }) {
    const band = await bandInfo(bandName);
    if (!band || !band.workId) return null;
    const registry = await contract("WorkRegistry");
    const work = await registry.getWork(band.workId);
    if (songTitle && norm(work.title) !== norm(songTitle)) return null;
    let token = null;
    try {
      const signer = await getSigner();
      token = await contract("AccessToken", signer);
      const tx = await token.buy(band.workId, { value: work.price });
      await tx.wait();
      return { txHash: tx.hash, url: await txUrl(tx.hash) };
    } catch (e) {
      throw friendly(e, token);
    }
  }

  /** Libera el pago de una reserva a partir del hash de la transacción en que se pagó. */
  async function confirmarPorTx(txHash) {
    const escrow = await contract("BookingEscrow");
    const receipt = await readProvider.getTransactionReceipt(txHash);
    const ev = parseEvent(escrow, receipt, "Booked");
    if (!ev) throw new Error("No se encontró la reserva en la cadena.");
    return confirmar(Number(ev.args.bookingId));
  }

  /** Libera el pago de una reserva por su número en el contrato (reparte a los integrantes). */
  async function confirmar(bookingId) {
    let escrow = null;
    try {
      const signer = await getSigner();
      escrow = await contract("BookingEscrow", signer);
      const tx = await escrow.confirm(bookingId);
      await tx.wait();
      return { txHash: tx.hash, url: await txUrl(tx.hash) };
    } catch (e) {
      throw friendly(e, escrow);
    }
  }

  window.SonoraWeb3 = {
    enabled: cfg.ENABLED !== false && typeof window.ethers !== "undefined",
    load,
    available,
    reservar,
    comprar,
    confirmar,
    confirmarPorTx,
    txUrl,
    // Para pruebas automatizadas
    _setSigner: (s) => (signerOverride = s),
    _setReadProvider: (p) => (readProvider = p),
  };
})();
