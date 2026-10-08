// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BookingEscrow} from "../src/BookingEscrow.sol";

/// @notice Despliega BookingEscrow.
///         Para la demo los plazos son cortos (minutos) y así se puede mostrar
///         la liberación automática en vivo. En producción serían 48 horas.
contract DeployEscrow is Script {
    function run() external returns (BookingEscrow escrow) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address treasury = vm.envOr("TREASURY", deployer);
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(100))); // 1%
        uint64 releaseDelay = uint64(vm.envOr("RELEASE_DELAY", uint256(5 minutes)));
        uint64 lateCancelWindow = uint64(vm.envOr("LATE_CANCEL_WINDOW", uint256(5 minutes)));

        vm.startBroadcast(pk);
        escrow = new BookingEscrow(treasury, feeBps, releaseDelay, lateCancelWindow);
        vm.stopBroadcast();

        console.log("BookingEscrow:", address(escrow));
        console.log("Treasury:", treasury);
    }
}
