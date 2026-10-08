// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BookingEscrow - Contrataciones de bandas con pago bloqueado y reparto automático
/// @notice El cliente paga al reservar; el dinero queda en el contrato hasta que el evento
///         se confirma (o pasa el plazo sin disputa). Al liberarse se reparte entre los
///         integrantes según sus porcentajes, menos una comisión mínima para la cooperativa.
contract BookingEscrow is Ownable, ReentrancyGuard {
    // ------------------------------------------------------------------
    // Tipos
    // ------------------------------------------------------------------

    enum Status {
        None,
        Funded, // pagado y bloqueado
        Released, // repartido a la banda
        Refunded, // devuelto al cliente (cancelación de la banda o temprana del cliente)
        CancelledLate, // cancelación tardía del cliente: penalización a la banda
        Disputed, // el cliente abrió disputa
        Resolved // el árbitro resolvió la disputa
    }

    struct Band {
        address admin; // quien administra el perfil de la banda
        string name;
        address[] members; // wallets de los integrantes
        uint16[] sharesBps; // porcentaje de cada integrante en puntos base (10000 = 100%)
    }

    struct Booking {
        uint256 bandId;
        address client;
        uint256 amount; // monto total pagado (wei)
        uint64 eventTime; // inicio del evento (timestamp)
        Status status;
    }

    // ------------------------------------------------------------------
    // Parámetros
    // ------------------------------------------------------------------

    uint16 public constant MAX_FEE_BPS = 500; // la comisión nunca puede pasar del 5%
    uint16 public constant LATE_CANCEL_PENALTY_BPS = 5000; // 50% para la banda si cancelan tarde

    uint16 public feeBps; // comisión de la cooperativa (100 = 1%)
    address public treasury; // fondo de mantenimiento de la cooperativa
    uint64 public immutable releaseDelay; // tiempo tras el evento para disputar
    uint64 public immutable lateCancelWindow; // cancelar dentro de esta ventana = cancelación tardía

    uint256 public nextBandId = 1;
    uint256 public nextBookingId = 1;

    mapping(uint256 => Band) private _bands;
    mapping(uint256 => Booking) public bookings;

    // ------------------------------------------------------------------
    // Eventos (el frontend los usa para la vista de trazabilidad)
    // ------------------------------------------------------------------

    event BandCreated(uint256 indexed bandId, address indexed admin, string name);
    event BandSplitUpdated(uint256 indexed bandId);
    event Booked(uint256 indexed bookingId, uint256 indexed bandId, address indexed client, uint256 amount, uint64 eventTime);
    event Paid(uint256 indexed bookingId, address indexed payee, uint256 amount);
    event FeeCollected(uint256 indexed bookingId, uint256 amount);
    event Released(uint256 indexed bookingId, uint256 bandTotal);
    event Refunded(uint256 indexed bookingId, address indexed client, uint256 amount);
    event CancelledLate(uint256 indexed bookingId, uint256 toBand, uint256 toClient);
    event Disputed(uint256 indexed bookingId);
    event Resolved(uint256 indexed bookingId, uint16 bandBps, uint256 toBand, uint256 toClient);
    event FeeUpdated(uint16 feeBps);
    event TreasuryUpdated(address treasury);

    // ------------------------------------------------------------------
    // Errores
    // ------------------------------------------------------------------

    error InvalidSplit();
    error NotBandAdmin();
    error BandNotFound();
    error InvalidAmount();
    error EventInPast();
    error WrongStatus();
    error NotClient();
    error TooEarly();
    error TooLate();
    error FeeTooHigh();
    error ZeroAddress();
    error TransferFailed();

    constructor(address _treasury, uint16 _feeBps, uint64 _releaseDelay, uint64 _lateCancelWindow)
        Ownable(msg.sender)
    {
        if (_treasury == address(0)) revert ZeroAddress();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        treasury = _treasury;
        feeBps = _feeBps;
        releaseDelay = _releaseDelay;
        lateCancelWindow = _lateCancelWindow;
    }

    // ------------------------------------------------------------------
    // Bandas (micro-cooperativa: reparto interno)
    // ------------------------------------------------------------------

    function createBand(string calldata name, address[] calldata members, uint16[] calldata sharesBps)
        external
        returns (uint256 bandId)
    {
        _validateSplit(members, sharesBps);
        bandId = nextBandId++;
        Band storage b = _bands[bandId];
        b.admin = msg.sender;
        b.name = name;
        b.members = members;
        b.sharesBps = sharesBps;
        emit BandCreated(bandId, msg.sender, name);
    }

    function updateSplit(uint256 bandId, address[] calldata members, uint16[] calldata sharesBps) external {
        Band storage b = _bands[bandId];
        if (b.admin == address(0)) revert BandNotFound();
        if (msg.sender != b.admin) revert NotBandAdmin();
        _validateSplit(members, sharesBps);
        b.members = members;
        b.sharesBps = sharesBps;
        emit BandSplitUpdated(bandId);
    }

    function getBand(uint256 bandId)
        external
        view
        returns (address admin, string memory name, address[] memory members, uint16[] memory sharesBps)
    {
        Band storage b = _bands[bandId];
        if (b.admin == address(0)) revert BandNotFound();
        return (b.admin, b.name, b.members, b.sharesBps);
    }

    // ------------------------------------------------------------------
    // Reservas
    // ------------------------------------------------------------------

    /// @notice El cliente reserva y paga. El dinero queda bloqueado en el contrato.
    function book(uint256 bandId, uint64 eventTime) external payable returns (uint256 bookingId) {
        if (_bands[bandId].admin == address(0)) revert BandNotFound();
        if (msg.value == 0) revert InvalidAmount();
        if (eventTime <= block.timestamp) revert EventInPast();

        bookingId = nextBookingId++;
        bookings[bookingId] = Booking({
            bandId: bandId,
            client: msg.sender,
            amount: msg.value,
            eventTime: eventTime,
            status: Status.Funded
        });
        emit Booked(bookingId, bandId, msg.sender, msg.value, eventTime);
    }

    /// @notice El cliente confirma que el evento se realizó; se reparte de inmediato.
    function confirm(uint256 bookingId) external nonReentrant {
        Booking storage bk = bookings[bookingId];
        if (bk.status != Status.Funded) revert WrongStatus();
        if (msg.sender != bk.client) revert NotClient();
        if (block.timestamp < bk.eventTime) revert TooEarly();
        bk.status = Status.Released;
        _payBand(bookingId, bk.bandId, bk.amount);
    }

    /// @notice Cualquiera puede liberar el pago si pasó el plazo sin disputa.
    ///         Evita que un cliente retenga el dinero simplemente no confirmando.
    function release(uint256 bookingId) external nonReentrant {
        Booking storage bk = bookings[bookingId];
        if (bk.status != Status.Funded) revert WrongStatus();
        if (block.timestamp < uint256(bk.eventTime) + releaseDelay) revert TooEarly();
        bk.status = Status.Released;
        _payBand(bookingId, bk.bandId, bk.amount);
    }

    /// @notice El cliente cancela antes del evento. Con anticipación: reembolso total.
    ///         Dentro de la ventana tardía: 50% para la banda, 50% de regreso.
    function cancelByClient(uint256 bookingId) external nonReentrant {
        Booking storage bk = bookings[bookingId];
        if (bk.status != Status.Funded) revert WrongStatus();
        if (msg.sender != bk.client) revert NotClient();
        if (block.timestamp >= bk.eventTime) revert TooLate();

        if (block.timestamp + lateCancelWindow < bk.eventTime) {
            bk.status = Status.Refunded;
            _send(bk.client, bk.amount);
            emit Refunded(bookingId, bk.client, bk.amount);
        } else {
            bk.status = Status.CancelledLate;
            uint256 toBand = (bk.amount * LATE_CANCEL_PENALTY_BPS) / 10_000;
            uint256 toClient = bk.amount - toBand;
            _payBand(bookingId, bk.bandId, toBand);
            _send(bk.client, toClient);
            emit CancelledLate(bookingId, toBand, toClient);
        }
    }

    /// @notice La banda cancela: reembolso total al cliente.
    function cancelByBand(uint256 bookingId) external nonReentrant {
        Booking storage bk = bookings[bookingId];
        if (bk.status != Status.Funded) revert WrongStatus();
        if (msg.sender != _bands[bk.bandId].admin) revert NotBandAdmin();
        bk.status = Status.Refunded;
        _send(bk.client, bk.amount);
        emit Refunded(bookingId, bk.client, bk.amount);
    }

    /// @notice El cliente abre disputa entre el inicio del evento y el fin del plazo.
    function dispute(uint256 bookingId) external {
        Booking storage bk = bookings[bookingId];
        if (bk.status != Status.Funded) revert WrongStatus();
        if (msg.sender != bk.client) revert NotClient();
        if (block.timestamp < bk.eventTime) revert TooEarly();
        if (block.timestamp >= uint256(bk.eventTime) + releaseDelay) revert TooLate();
        bk.status = Status.Disputed;
        emit Disputed(bookingId);
    }

    /// @notice El árbitro (owner; en producción, la votación de la cooperativa) decide el reparto.
    /// @param bandBps porcentaje para la banda en puntos base (10000 = todo para la banda)
    function resolveDispute(uint256 bookingId, uint16 bandBps) external onlyOwner nonReentrant {
        Booking storage bk = bookings[bookingId];
        if (bk.status != Status.Disputed) revert WrongStatus();
        if (bandBps > 10_000) revert InvalidSplit();
        bk.status = Status.Resolved;
        uint256 toBand = (bk.amount * bandBps) / 10_000;
        uint256 toClient = bk.amount - toBand;
        if (toBand > 0) _payBand(bookingId, bk.bandId, toBand);
        if (toClient > 0) _send(bk.client, toClient);
        emit Resolved(bookingId, bandBps, toBand, toClient);
    }

    // ------------------------------------------------------------------
    // Administración de la cooperativa
    // ------------------------------------------------------------------

    function setFeeBps(uint16 _feeBps) external onlyOwner {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = _feeBps;
        emit FeeUpdated(_feeBps);
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    // ------------------------------------------------------------------
    // Internas
    // ------------------------------------------------------------------

    function _validateSplit(address[] calldata members, uint16[] calldata sharesBps) private pure {
        uint256 n = members.length;
        if (n == 0 || n > 20 || n != sharesBps.length) revert InvalidSplit();
        uint256 total;
        for (uint256 i; i < n; ++i) {
            if (members[i] == address(0) || sharesBps[i] == 0) revert InvalidSplit();
            total += sharesBps[i];
        }
        if (total != 10_000) revert InvalidSplit();
    }

    /// @dev Cobra la comisión y reparte el resto entre los integrantes.
    ///      El residuo por redondeo se le da al primer integrante para no dejar wei atrapados.
    function _payBand(uint256 bookingId, uint256 bandId, uint256 gross) private {
        Band storage b = _bands[bandId];
        uint256 fee = (gross * feeBps) / 10_000;
        uint256 net = gross - fee;

        uint256 n = b.members.length;
        uint256[] memory amounts = new uint256[](n);
        uint256 distributed;
        for (uint256 i; i < n; ++i) {
            amounts[i] = (net * b.sharesBps[i]) / 10_000;
            distributed += amounts[i];
        }
        amounts[0] += net - distributed;

        if (fee > 0) {
            _send(treasury, fee);
            emit FeeCollected(bookingId, fee);
        }
        for (uint256 i; i < n; ++i) {
            _send(b.members[i], amounts[i]);
            emit Paid(bookingId, b.members[i], amounts[i]);
        }
        emit Released(bookingId, net);
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
