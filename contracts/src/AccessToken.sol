// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {WorkRegistry} from "./WorkRegistry.sol";

/// @title AccessToken - Licencias de compra y membresía de la cooperativa (ERC-1155)
/// @notice - id 0: membresía de la cooperativa (una por banda verificada; da derecho a voto).
///         - id N (N >= 1): licencia de la obra N del WorkRegistry. Quien la tiene puede
///           descargar la canción; el backend lo comprueba con hasAccess().
///         Todos los tokens son intransferibles: la licencia es personal y la membresía
///         no se puede vender ni acumular.
contract AccessToken is ERC1155, Ownable, ReentrancyGuard {
    uint256 public constant MEMBERSHIP_ID = 0;
    uint16 public constant MAX_FEE_BPS = 500;

    WorkRegistry public immutable registry;
    address public treasury;
    uint16 public feeBps;
    uint256 public memberCount;

    event Purchased(uint256 indexed workId, address indexed buyer, uint256 price);
    event RoyaltyPaid(uint256 indexed workId, address indexed author, uint256 amount);
    event FeeCollected(uint256 indexed workId, uint256 amount);
    event MembershipGranted(address indexed member);
    event MembershipRevoked(address indexed member);
    event FeeUpdated(uint16 feeBps);
    event TreasuryUpdated(address treasury);

    error NotForSale();
    error WrongPrice();
    error AlreadyOwned();
    error AlreadyMember();
    error NotMember();
    error NonTransferable();
    error FeeTooHigh();
    error ZeroAddress();
    error TransferFailed();

    constructor(WorkRegistry _registry, address _treasury, uint16 _feeBps, string memory _uri)
        ERC1155(_uri)
        Ownable(msg.sender)
    {
        if (_treasury == address(0) || address(_registry) == address(0)) revert ZeroAddress();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        registry = _registry;
        treasury = _treasury;
        feeBps = _feeBps;
    }

    // ------------------------------------------------------------------
    // Compra de obras
    // ------------------------------------------------------------------

    /// @notice El fan paga el precio exacto, recibe la licencia y las regalías se reparten al instante.
    function buy(uint256 workId) external payable nonReentrant {
        (uint256 price, address[] memory authors, uint16[] memory sharesBps) = registry.getSaleInfo(workId);
        if (price == 0) revert NotForSale();
        if (msg.value != price) revert WrongPrice();
        if (balanceOf(msg.sender, workId) > 0) revert AlreadyOwned();

        _mint(msg.sender, workId, 1, "");
        emit Purchased(workId, msg.sender, price);

        uint256 fee = (price * feeBps) / 10_000;
        uint256 net = price - fee;
        uint256 n = authors.length;
        uint256[] memory amounts = new uint256[](n);
        uint256 distributed;
        for (uint256 i; i < n; ++i) {
            amounts[i] = (net * sharesBps[i]) / 10_000;
            distributed += amounts[i];
        }
        amounts[0] += net - distributed; // residuo por redondeo

        if (fee > 0) {
            _send(treasury, fee);
            emit FeeCollected(workId, fee);
        }
        for (uint256 i; i < n; ++i) {
            _send(authors[i], amounts[i]);
            emit RoyaltyPaid(workId, authors[i], amounts[i]);
        }
    }

    /// @notice Lo usa el backend antes de entregar el enlace de descarga.
    function hasAccess(address user, uint256 workId) external view returns (bool) {
        return balanceOf(user, workId) > 0;
    }

    // ------------------------------------------------------------------
    // Membresía de la cooperativa
    // ------------------------------------------------------------------

    /// @notice Se otorga al verificar a una banda (en producción, por votación de la cooperativa).
    function grantMembership(address member) external onlyOwner {
        if (member == address(0)) revert ZeroAddress();
        if (balanceOf(member, MEMBERSHIP_ID) > 0) revert AlreadyMember();
        memberCount++;
        _mint(member, MEMBERSHIP_ID, 1, "");
        emit MembershipGranted(member);
    }

    function revokeMembership(address member) external onlyOwner {
        if (balanceOf(member, MEMBERSHIP_ID) == 0) revert NotMember();
        memberCount--;
        _burn(member, MEMBERSHIP_ID, 1);
        emit MembershipRevoked(member);
    }

    function isMember(address account) external view returns (bool) {
        return balanceOf(account, MEMBERSHIP_ID) > 0;
    }

    // ------------------------------------------------------------------
    // Administración
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

    /// @dev Bloquea transferencias entre cuentas; solo se permite crear (mint) y quemar (burn).
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) revert NonTransferable();
        super._update(from, to, ids, values);
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
