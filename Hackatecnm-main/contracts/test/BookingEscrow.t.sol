// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BookingEscrow} from "../src/BookingEscrow.sol";

contract BookingEscrowTest is Test {
    BookingEscrow escrow;

    address treasury = makeAddr("treasury");
    address admin = makeAddr("admin"); // también es integrante
    address guitarra = makeAddr("guitarra");
    address bajo = makeAddr("bajo");
    address bateria = makeAddr("bateria");
    address cliente = makeAddr("cliente");
    address extrano = makeAddr("extrano");

    uint64 constant RELEASE_DELAY = 2 days;
    uint64 constant LATE_WINDOW = 2 days;
    uint256 bandId;

    function setUp() public {
        escrow = new BookingEscrow(treasury, 100, RELEASE_DELAY, LATE_WINDOW); // 1% de comisión

        address[] memory m = new address[](4);
        m[0] = admin;
        m[1] = guitarra;
        m[2] = bajo;
        m[3] = bateria;
        uint16[] memory s = new uint16[](4);
        s[0] = 2500;
        s[1] = 2500;
        s[2] = 2500;
        s[3] = 2500;

        vm.prank(admin);
        bandId = escrow.createBand("Los Toquines", m, s);

        vm.deal(cliente, 100 ether);
    }

    function _book(uint256 amount, uint64 inSeconds) internal returns (uint256 id) {
        vm.prank(cliente);
        id = escrow.book{value: amount}(bandId, uint64(block.timestamp) + inSeconds);
    }

    // --- Flujo feliz ---------------------------------------------------

    function test_ConfirmSplitsPaymentAndFee() public {
        uint256 id = _book(1 ether, 10 days);
        assertEq(address(escrow).balance, 1 ether);

        vm.warp(block.timestamp + 10 days);
        vm.prank(cliente);
        escrow.confirm(id);

        assertEq(treasury.balance, 0.01 ether);
        assertEq(guitarra.balance, 0.2475 ether);
        assertEq(bajo.balance, 0.2475 ether);
        assertEq(bateria.balance, 0.2475 ether);
        assertEq(admin.balance, 0.2475 ether);
        assertEq(address(escrow).balance, 0);
        (,,,, BookingEscrow.Status st) = escrow.bookings(id);
        assertEq(uint8(st), uint8(BookingEscrow.Status.Released));
    }

    function test_RoundingRemainderGoesToFirstMember() public {
        uint256 id = _book(1001, 10 days); // monto que no divide exacto
        vm.warp(block.timestamp + 10 days);
        vm.prank(cliente);
        escrow.confirm(id);
        uint256 total = treasury.balance + admin.balance + guitarra.balance + bajo.balance + bateria.balance;
        assertEq(total, 1001);
        assertEq(address(escrow).balance, 0);
    }

    function test_AutoReleaseAfterDelay() public {
        uint256 id = _book(1 ether, 10 days);
        vm.warp(block.timestamp + 10 days + RELEASE_DELAY);
        vm.prank(extrano); // cualquiera puede liberarlo
        escrow.release(id);
        assertEq(bajo.balance, 0.2475 ether);
    }

    function test_RevertWhen_ReleaseTooEarly() public {
        uint256 id = _book(1 ether, 10 days);
        vm.warp(block.timestamp + 10 days + RELEASE_DELAY - 1);
        vm.expectRevert(BookingEscrow.TooEarly.selector);
        escrow.release(id);
    }

    function test_RevertWhen_ConfirmBeforeEvent() public {
        uint256 id = _book(1 ether, 10 days);
        vm.prank(cliente);
        vm.expectRevert(BookingEscrow.TooEarly.selector);
        escrow.confirm(id);
    }

    function test_RevertWhen_NonClientConfirms() public {
        uint256 id = _book(1 ether, 10 days);
        vm.warp(block.timestamp + 10 days);
        vm.prank(extrano);
        vm.expectRevert(BookingEscrow.NotClient.selector);
        escrow.confirm(id);
    }

    function test_RevertWhen_DoubleRelease() public {
        uint256 id = _book(1 ether, 10 days);
        vm.warp(block.timestamp + 10 days);
        vm.prank(cliente);
        escrow.confirm(id);
        vm.expectRevert(BookingEscrow.WrongStatus.selector);
        escrow.release(id);
    }

    // --- Cancelaciones -------------------------------------------------

    function test_EarlyCancelFullRefund() public {
        uint256 id = _book(1 ether, 10 days);
        uint256 before = cliente.balance;
        vm.prank(cliente);
        escrow.cancelByClient(id);
        assertEq(cliente.balance, before + 1 ether);
        assertEq(bajo.balance, 0);
    }

    function test_LateCancelPaysPenaltyToBand() public {
        uint256 id = _book(1 ether, 10 days);
        vm.warp(block.timestamp + 9 days); // falta 1 día (< ventana de 2 días)
        uint256 before = cliente.balance;
        vm.prank(cliente);
        escrow.cancelByClient(id);
        assertEq(cliente.balance, before + 0.5 ether);
        assertEq(treasury.balance, 0.005 ether); // 1% de la parte de la banda
        assertEq(bajo.balance, 0.12375 ether);
        assertEq(address(escrow).balance, 0);
    }

    function test_BandCancelFullRefund() public {
        uint256 id = _book(1 ether, 10 days);
        uint256 before = cliente.balance;
        vm.prank(admin);
        escrow.cancelByBand(id);
        assertEq(cliente.balance, before + 1 ether);
    }

    function test_RevertWhen_NonAdminCancelsForBand() public {
        uint256 id = _book(1 ether, 10 days);
        vm.prank(guitarra);
        vm.expectRevert(BookingEscrow.NotBandAdmin.selector);
        escrow.cancelByBand(id);
    }

    // --- Disputas ------------------------------------------------------

    function test_DisputeBlocksReleaseAndArbiterSplits() public {
        uint256 id = _book(1 ether, 10 days);
        vm.warp(block.timestamp + 10 days + 1 hours);
        vm.prank(cliente);
        escrow.dispute(id);

        vm.warp(block.timestamp + RELEASE_DELAY);
        vm.expectRevert(BookingEscrow.WrongStatus.selector);
        escrow.release(id);

        uint256 before = cliente.balance;
        escrow.resolveDispute(id, 7000); // 70% banda, 30% cliente (este test es el owner)
        assertEq(cliente.balance, before + 0.3 ether);
        assertEq(treasury.balance, 0.007 ether);
        assertEq(address(escrow).balance, 0);
    }

    function test_RevertWhen_DisputeAfterWindow() public {
        uint256 id = _book(1 ether, 10 days);
        vm.warp(block.timestamp + 10 days + RELEASE_DELAY);
        vm.prank(cliente);
        vm.expectRevert(BookingEscrow.TooLate.selector);
        escrow.dispute(id);
    }

    function test_RevertWhen_NonOwnerResolves() public {
        uint256 id = _book(1 ether, 10 days);
        vm.warp(block.timestamp + 10 days);
        vm.prank(cliente);
        escrow.dispute(id);
        vm.prank(extrano);
        vm.expectRevert();
        escrow.resolveDispute(id, 5000);
    }

    // --- Validaciones ---------------------------------------------------

    function test_RevertWhen_SplitDoesNotSum100() public {
        address[] memory m = new address[](2);
        m[0] = guitarra;
        m[1] = bajo;
        uint16[] memory s = new uint16[](2);
        s[0] = 5000;
        s[1] = 4000;
        vm.expectRevert(BookingEscrow.InvalidSplit.selector);
        escrow.createBand("Mal", m, s);
    }

    function test_RevertWhen_EventInPast() public {
        vm.prank(cliente);
        vm.expectRevert(BookingEscrow.EventInPast.selector);
        escrow.book{value: 1 ether}(bandId, uint64(block.timestamp));
    }

    function test_RevertWhen_FeeAboveMax() public {
        vm.expectRevert(BookingEscrow.FeeTooHigh.selector);
        escrow.setFeeBps(501);
    }

    function test_UpdateSplit() public {
        address[] memory m = new address[](2);
        m[0] = admin;
        m[1] = guitarra;
        uint16[] memory s = new uint16[](2);
        s[0] = 6000;
        s[1] = 4000;
        vm.prank(admin);
        escrow.updateSplit(bandId, m, s);
        (,, address[] memory members, uint16[] memory shares) = escrow.getBand(bandId);
        assertEq(members.length, 2);
        assertEq(shares[0], 6000);
    }

    function testFuzz_NoFundsStuck(uint96 amount, uint16 bandBps) public {
        vm.assume(amount > 0);
        bandBps = uint16(bound(bandBps, 0, 10_000));
        vm.deal(cliente, amount);
        uint256 id = _book(amount, 1 days);
        vm.warp(block.timestamp + 1 days);
        vm.prank(cliente);
        escrow.dispute(id);
        escrow.resolveDispute(id, bandBps);
        assertEq(address(escrow).balance, 0);
    }
}
