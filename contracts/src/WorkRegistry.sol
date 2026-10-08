// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WorkRegistry - Registro de obras musicales con huella digital
/// @notice Cada canción se registra con el hash SHA-256 de su archivo, sus autores y
///         porcentajes. El primer registro de un hash queda como prueba de anterioridad:
///         nadie puede volver a registrar ese mismo archivo después.
contract WorkRegistry {
    struct Work {
        bytes32 contentHash; // SHA-256 del archivo de audio
        address registrant; // quien lo registró (normalmente el admin de la banda)
        uint64 registeredAt; // fecha del registro (prueba de anterioridad)
        uint256 price; // precio de compra en wei (0 = no está a la venta)
        string title;
        string uri; // dónde está el archivo o sus metadatos (IPFS, Supabase, etc.)
        address[] authors;
        uint16[] sharesBps; // porcentaje de regalías por autor (10000 = 100%)
    }

    uint256 public nextWorkId = 1;
    mapping(uint256 => Work) private _works;
    mapping(bytes32 => uint256) public workIdByHash;

    event WorkRegistered(
        uint256 indexed workId, bytes32 indexed contentHash, address indexed registrant, string title, uint256 price
    );
    event PriceUpdated(uint256 indexed workId, uint256 price);

    error AlreadyRegistered(uint256 workId);
    error InvalidSplit();
    error EmptyHash();
    error WorkNotFound();
    error NotRegistrant();

    function registerWork(
        bytes32 contentHash,
        string calldata title,
        string calldata uri,
        address[] calldata authors,
        uint16[] calldata sharesBps,
        uint256 price
    ) external returns (uint256 workId) {
        if (contentHash == bytes32(0)) revert EmptyHash();
        uint256 existing = workIdByHash[contentHash];
        if (existing != 0) revert AlreadyRegistered(existing);
        _validateSplit(authors, sharesBps);

        workId = nextWorkId++;
        Work storage w = _works[workId];
        w.contentHash = contentHash;
        w.registrant = msg.sender;
        w.registeredAt = uint64(block.timestamp);
        w.price = price;
        w.title = title;
        w.uri = uri;
        w.authors = authors;
        w.sharesBps = sharesBps;
        workIdByHash[contentHash] = workId;

        emit WorkRegistered(workId, contentHash, msg.sender, title, price);
    }

    function setPrice(uint256 workId, uint256 price) external {
        Work storage w = _works[workId];
        if (w.registrant == address(0)) revert WorkNotFound();
        if (msg.sender != w.registrant) revert NotRegistrant();
        w.price = price;
        emit PriceUpdated(workId, price);
    }

    function getWork(uint256 workId) external view returns (Work memory) {
        Work storage w = _works[workId];
        if (w.registrant == address(0)) revert WorkNotFound();
        return w;
    }

    /// @notice Versión ligera para otros contratos: precio, autores y porcentajes.
    function getSaleInfo(uint256 workId)
        external
        view
        returns (uint256 price, address[] memory authors, uint16[] memory sharesBps)
    {
        Work storage w = _works[workId];
        if (w.registrant == address(0)) revert WorkNotFound();
        return (w.price, w.authors, w.sharesBps);
    }

    /// @notice Verifica un archivo: si su hash está registrado, devuelve la obra y su fecha.
    function verify(bytes32 contentHash) external view returns (uint256 workId, address registrant, uint64 registeredAt) {
        workId = workIdByHash[contentHash];
        if (workId != 0) {
            Work storage w = _works[workId];
            registrant = w.registrant;
            registeredAt = w.registeredAt;
        }
    }

    function _validateSplit(address[] calldata authors, uint16[] calldata sharesBps) private pure {
        uint256 n = authors.length;
        if (n == 0 || n > 20 || n != sharesBps.length) revert InvalidSplit();
        uint256 total;
        for (uint256 i; i < n; ++i) {
            if (authors[i] == address(0) || sharesBps[i] == 0) revert InvalidSplit();
            total += sharesBps[i];
        }
        if (total != 10_000) revert InvalidSplit();
    }
}
