// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {WorkRegistry} from "../src/WorkRegistry.sol";
import {AccessToken} from "../src/AccessToken.sol";
import {SimpleVote} from "../src/SimpleVote.sol";

/// @notice Despliega WorkRegistry, AccessToken y SimpleVote, y le da membresía
///         a la wallet que despliega para que la demo de votación funcione de inmediato.
contract DeployBazar is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address treasury = vm.envOr("TREASURY", deployer);
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(100))); // 1%

        vm.startBroadcast(pk);
        WorkRegistry registry = new WorkRegistry();
        AccessToken token = new AccessToken(registry, treasury, feeBps, "");
        SimpleVote voting = new SimpleVote(token);
        token.grantMembership(deployer);
        vm.stopBroadcast();

        console.log("WorkRegistry:", address(registry));
        console.log("AccessToken:", address(token));
        console.log("SimpleVote:", address(voting));
    }
}
