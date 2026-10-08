// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BookingEscrow} from "../src/BookingEscrow.sol";
import {WorkRegistry} from "../src/WorkRegistry.sol";
import {AccessToken} from "../src/AccessToken.sol";
import {SimpleVote} from "../src/SimpleVote.sol";

/// @notice Carga en los contratos desplegados las bandas de data/bands.json:
///         crea cada banda con sus integrantes y porcentajes, registra su canción
///         con los autores y regalías, da membresía al primer integrante, hace
///         2 reservas, 2 compras y 1 votación. Escribe web/src/abi/demo-data.json
///         con los IDs de la cadena y las wallets de cada integrante.
/// @dev    Montos: tasa simbólica de testnet, 1 MXN = 0.00000001 ETH (1e10 wei).
///         La wallet del .env queda como admin de todas las bandas y como cliente.
///         Las wallets de los integrantes se derivan del índice de banda e integrante:
///         solo reciben pagos, no firman nada.
contract SeedDemo is Script {
    uint256 constant WEI_PER_MXN = 1e10;
    string constant BANDS_FILE = "../data/bands.json";
    string constant ABI_DIR = "../abi/";

    BookingEscrow escrow;
    WorkRegistry registry;
    AccessToken token;
    SimpleVote voting;
    string data;

    uint256[] bandIds;
    uint256[] workIds;
    string bandsJson;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);

        string memory addrs = vm.readFile(string.concat(ABI_DIR, "addresses.json"));
        escrow = BookingEscrow(vm.parseJsonAddress(addrs, ".BookingEscrow"));
        registry = WorkRegistry(vm.parseJsonAddress(addrs, ".WorkRegistry"));
        token = AccessToken(vm.parseJsonAddress(addrs, ".AccessToken"));
        voting = SimpleVote(vm.parseJsonAddress(addrs, ".SimpleVote"));
        data = vm.readFile(BANDS_FILE);

        uint256 n;
        while (vm.keyExistsJson(data, _p(n, ""))) n++;

        vm.startBroadcast(pk);
        for (uint256 i; i < n; ++i) {
            _loadBand(i);
        }
        (uint256 bookingSoon, uint256 bookingLater, uint256 proposalId) = _activity(me);
        vm.stopBroadcast();

        _writeOutput(me, bookingSoon, bookingLater, proposalId);

        console.log("Bandas cargadas:", n);
        console.log("Reserva que termina en 2 min:", bookingSoon);
        console.log("Reserva a 30 dias:", bookingLater);
        console.log("Votacion:", proposalId);
        console.log("Escrito web/src/abi/demo-data.json");
    }

    function _loadBand(uint256 i) private {
        (uint256 bandId, address[] memory wallets) = _createBand(i);
        (uint256 workId, bytes32 hash) = _registerSong(i, wallets);
        if (!token.isMember(wallets[0])) token.grantMembership(wallets[0]);
        bandIds.push(bandId);
        workIds.push(workId);
        bandsJson = _bandJson(i, bandId, workId, hash, wallets);
    }

    /// @dev Reserva de la banda 1 que termina en 2 minutos (para confirmar en vivo),
    ///      reserva de la banda 2 a 30 días, compras de las canciones 1 y 3, y una votación.
    function _activity(address me) private returns (uint256 bookingSoon, uint256 bookingLater, uint256 proposalId) {
        bookingSoon = escrow.book{value: _feeWei(0)}(bandIds[0], uint64(block.timestamp + 2 minutes));
        bookingLater = escrow.book{value: _feeWei(1)}(bandIds[1], uint64(block.timestamp + 30 days));
        _buy(me, workIds[0]);
        _buy(me, workIds[2]);
        proposalId = voting.createProposal(unicode"Colección destacada de la semana: Sierreño de Chihuahua", 3 days);
        voting.vote(proposalId, true);
    }

    function _writeOutput(address me, uint256 bookingSoon, uint256 bookingLater, uint256 proposalId) private {
        string memory root = "demo";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "operator", me);
        vm.serializeString(root, "rate", "1 MXN = 0.00000001 ETH");
        vm.serializeUint(root, "bookingEndingSoon", bookingSoon);
        vm.serializeUint(root, "bookingFuture", bookingLater);
        vm.serializeUint(root, "proposalId", proposalId);
        string memory out = vm.serializeString(root, "bands", bandsJson);
        vm.writeJson(out, string.concat(ABI_DIR, "demo-data.json"));
    }

    // ------------------------------------------------------------------

    function _createBand(uint256 i) private returns (uint256 bandId, address[] memory wallets) {
        string memory name = vm.parseJsonString(data, _p(i, ".name"));
        uint256[] memory sharesU = vm.parseJsonUintArray(data, _p(i, ".member_shares_bps"));
        wallets = new address[](sharesU.length);
        uint16[] memory shares = new uint16[](sharesU.length);
        for (uint256 j; j < sharesU.length; ++j) {
            wallets[j] = vm.addr(uint256(keccak256(abi.encodePacked("toquindapp-demo-member", i, j))));
            shares[j] = uint16(sharesU[j]);
        }
        bandId = escrow.createBand(name, wallets, shares);
    }

    function _registerSong(uint256 i, address[] memory wallets) private returns (uint256 workId, bytes32 hash) {
        hash = _hash(i);
        workId = registry.workIdByHash(hash);
        if (workId != 0) return (workId, hash);
        workId = _register(i, hash, wallets);
    }

    function _register(uint256 i, bytes32 hash, address[] memory wallets) private returns (uint256) {
        (address[] memory authors, uint16[] memory shares) = _authors(i, wallets);
        string memory title = vm.parseJsonString(data, _p(i, ".song_title"));
        string memory uri = string.concat("audio://", vm.parseJsonString(data, _p(i, ".audio_file")));
        return registry.registerWork(hash, title, uri, authors, shares, _priceWei(i));
    }

    function _priceWei(uint256 i) private view returns (uint256) {
        return vm.parseJsonUint(data, _p(i, ".song_price_mxn_cents")) * WEI_PER_MXN / 100;
    }

    /// @dev Usa content_hash si viene en bands.json; si no, un hash de ejemplo a partir del título.
    function _hash(uint256 i) private view returns (bytes32) {
        string memory hashStr = vm.parseJsonString(data, _p(i, ".content_hash"));
        if (bytes(hashStr).length == 66) return vm.parseBytes32(hashStr);
        return sha256(abi.encodePacked("toquindapp-demo:", vm.parseJsonString(data, _p(i, ".song_title"))));
    }

    function _authors(uint256 i, address[] memory wallets)
        private
        view
        returns (address[] memory authors, uint16[] memory shares)
    {
        uint256[] memory idx = vm.parseJsonUintArray(data, _p(i, ".author_indexes"));
        uint256[] memory sh = vm.parseJsonUintArray(data, _p(i, ".author_shares_bps"));
        authors = new address[](idx.length);
        shares = new uint16[](idx.length);
        for (uint256 j; j < idx.length; ++j) {
            authors[j] = wallets[idx[j]];
            shares[j] = uint16(sh[j]);
        }
    }

    function _buy(address me, uint256 workId) private {
        if (token.hasAccess(me, workId)) return;
        (uint256 price,,) = registry.getSaleInfo(workId);
        token.buy{value: price}(workId);
    }

    function _feeWei(uint256 i) private view returns (uint256) {
        return vm.parseJsonUint(data, _p(i, ".fee_mxn")) * WEI_PER_MXN;
    }

    function _p(uint256 i, string memory field) private pure returns (string memory) {
        return string.concat(".bands[", vm.toString(i), "]", field);
    }

    function _bandJson(uint256 i, uint256 bandId, uint256 workId, bytes32 hash, address[] memory wallets)
        private
        returns (string memory)
    {
        string memory key = string.concat("band", vm.toString(i));
        vm.serializeUint(key, "index_in_bands_json", i);
        vm.serializeUint(key, "band_id", bandId);
        vm.serializeString(key, "name", vm.parseJsonString(data, _p(i, ".name")));
        vm.serializeAddress(key, "member_wallets", wallets);
        vm.serializeUint(key, "work_id", workId);
        string memory obj = vm.serializeBytes32(key, "content_hash", hash);
        return vm.serializeString("bandsObj", vm.toString(bandId), obj);
    }
}
