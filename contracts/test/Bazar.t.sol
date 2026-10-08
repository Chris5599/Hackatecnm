// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WorkRegistry} from "../src/WorkRegistry.sol";
import {AccessToken} from "../src/AccessToken.sol";
import {SimpleVote} from "../src/SimpleVote.sol";

/// @notice Tests del Bazar digital: registro de obras, compra con regalías,
///         licencias intransferibles, membresía y votación.
contract BazarTest is Test {
    WorkRegistry registry;
    AccessToken token;
    SimpleVote voting;

    address treasury = makeAddr("treasury");
    address banda = makeAddr("banda"); // admin que registra
    address compositor = makeAddr("compositor");
    address interprete = makeAddr("interprete");
    address fan = makeAddr("fan");
    address fan2 = makeAddr("fan2");
    address pirata = makeAddr("pirata");

    bytes32 constant HASH = keccak256("cancion.mp3"); // en la app es el SHA-256 del archivo
    uint256 constant PRICE = 0.01 ether;

    function setUp() public {
        registry = new WorkRegistry();
        token = new AccessToken(registry, treasury, 100, ""); // 1% de comisión
        voting = new SimpleVote(token);
        vm.deal(fan, 1 ether);
        vm.deal(fan2, 1 ether);
    }

    function _register(bytes32 h, uint256 price) internal returns (uint256 id) {
        address[] memory a = new address[](2);
        a[0] = compositor;
        a[1] = interprete;
        uint16[] memory s = new uint16[](2);
        s[0] = 6000;
        s[1] = 4000;
        vm.prank(banda);
        id = registry.registerWork(h, "Corrido del Hackatec", "ipfs://demo", a, s, price);
    }

    // --- WorkRegistry ---------------------------------------------------

    function test_RegisterStoresProofOfAuthorship() public {
        vm.warp(1_760_000_000);
        uint256 id = _register(HASH, PRICE);
        WorkRegistry.Work memory w = registry.getWork(id);
        assertEq(w.contentHash, HASH);
        assertEq(w.registrant, banda);
        assertEq(w.registeredAt, 1_760_000_000);
        assertEq(registry.workIdByHash(HASH), id);

        (uint256 vid, address who, uint64 when) = registry.verify(HASH);
        assertEq(vid, id);
        assertEq(who, banda);
        assertEq(when, 1_760_000_000);
    }

    function test_RevertWhen_SameFileRegisteredTwice() public {
        uint256 id = _register(HASH, PRICE);
        address[] memory a = new address[](1);
        a[0] = pirata;
        uint16[] memory s = new uint16[](1);
        s[0] = 10_000;
        vm.prank(pirata);
        vm.expectRevert(abi.encodeWithSelector(WorkRegistry.AlreadyRegistered.selector, id));
        registry.registerWork(HASH, "Robada", "", a, s, PRICE);
    }

    function test_VerifyUnknownFileReturnsZero() public view {
        (uint256 id,,) = registry.verify(keccak256("otra.mp3"));
        assertEq(id, 0);
    }

    function test_RevertWhen_SplitInvalid() public {
        address[] memory a = new address[](2);
        a[0] = compositor;
        a[1] = interprete;
        uint16[] memory s = new uint16[](2);
        s[0] = 6000;
        s[1] = 3000;
        vm.expectRevert(WorkRegistry.InvalidSplit.selector);
        registry.registerWork(HASH, "x", "", a, s, PRICE);
    }

    function test_OnlyRegistrantSetsPrice() public {
        uint256 id = _register(HASH, PRICE);
        vm.prank(pirata);
        vm.expectRevert(WorkRegistry.NotRegistrant.selector);
        registry.setPrice(id, 0);
        vm.prank(banda);
        registry.setPrice(id, 0.02 ether);
        assertEq(registry.getWork(id).price, 0.02 ether);
    }

    // --- Compra y regalías ----------------------------------------------

    function test_BuyMintsLicenseAndPaysRoyalties() public {
        uint256 id = _register(HASH, PRICE);
        vm.prank(fan);
        token.buy{value: PRICE}(id);

        assertTrue(token.hasAccess(fan, id));
        assertFalse(token.hasAccess(fan2, id));
        assertEq(treasury.balance, 0.0001 ether);
        assertEq(compositor.balance, 0.00594 ether);
        assertEq(interprete.balance, 0.00396 ether);
        assertEq(address(token).balance, 0);
    }

    function test_RevertWhen_WrongPrice() public {
        uint256 id = _register(HASH, PRICE);
        vm.prank(fan);
        vm.expectRevert(AccessToken.WrongPrice.selector);
        token.buy{value: PRICE - 1}(id);
    }

    function test_RevertWhen_NotForSale() public {
        uint256 id = _register(HASH, 0);
        vm.prank(fan);
        vm.expectRevert(AccessToken.NotForSale.selector);
        token.buy{value: 0}(id);
    }

    function test_RevertWhen_BuyTwice() public {
        uint256 id = _register(HASH, PRICE);
        vm.startPrank(fan);
        token.buy{value: PRICE}(id);
        vm.expectRevert(AccessToken.AlreadyOwned.selector);
        token.buy{value: PRICE}(id);
        vm.stopPrank();
    }

    function test_RevertWhen_LicenseTransferred() public {
        uint256 id = _register(HASH, PRICE);
        vm.prank(fan);
        token.buy{value: PRICE}(id);
        vm.prank(fan);
        vm.expectRevert(AccessToken.NonTransferable.selector);
        token.safeTransferFrom(fan, pirata, id, 1, "");
    }

    function testFuzz_NoFundsStuckOnPurchase(uint96 price) public {
        vm.assume(price > 0);
        uint256 id = _register(HASH, price);
        vm.deal(fan, price);
        vm.prank(fan);
        token.buy{value: price}(id);
        assertEq(address(token).balance, 0);
        assertEq(treasury.balance + compositor.balance + interprete.balance, price);
    }

    // --- Membresía y votación -------------------------------------------

    function test_MembershipIsOwnerOnlyAndNonTransferable() public {
        vm.prank(pirata);
        vm.expectRevert();
        token.grantMembership(pirata);

        token.grantMembership(banda);
        assertTrue(token.isMember(banda));
        assertEq(token.memberCount(), 1);

        vm.prank(banda);
        vm.expectRevert(AccessToken.NonTransferable.selector);
        token.safeTransferFrom(banda, pirata, 0, 1, "");

        vm.expectRevert(AccessToken.AlreadyMember.selector);
        token.grantMembership(banda);

        token.revokeMembership(banda);
        assertFalse(token.isMember(banda));
        assertEq(token.memberCount(), 0);
    }

    function test_VotingOneVotePerMember() public {
        token.grantMembership(banda);
        token.grantMembership(compositor);
        token.grantMembership(interprete);

        vm.prank(banda);
        uint256 pid = voting.createProposal("Bajar la comision a 0.5%", 1 days);

        vm.prank(banda);
        voting.vote(pid, true);
        vm.prank(compositor);
        voting.vote(pid, true);
        vm.prank(interprete);
        voting.vote(pid, false);

        vm.prank(banda);
        vm.expectRevert(SimpleVote.AlreadyVoted.selector);
        voting.vote(pid, false);

        (bool open, bool passed, uint32 yes, uint32 no) = voting.result(pid);
        assertTrue(open);
        assertTrue(passed);
        assertEq(yes, 2);
        assertEq(no, 1);

        vm.warp(block.timestamp + 1 days);
        (open,,,) = voting.result(pid);
        assertFalse(open);
        vm.prank(compositor);
        vm.expectRevert(SimpleVote.VotingClosed.selector);
        voting.vote(pid, false);
    }

    function test_RevertWhen_NonMemberVotesOrProposes() public {
        token.grantMembership(banda);
        vm.prank(banda);
        uint256 pid = voting.createProposal("Coleccion destacada: Sierreno", 1 days);

        vm.prank(pirata);
        vm.expectRevert(SimpleVote.NotMember.selector);
        voting.vote(pid, true);

        vm.prank(pirata);
        vm.expectRevert(SimpleVote.NotMember.selector);
        voting.createProposal("Spam", 1 days);
    }
}
