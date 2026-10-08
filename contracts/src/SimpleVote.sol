// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessToken} from "./AccessToken.sol";

/// @title SimpleVote - Votaciones de la cooperativa digital
/// @notice Un voto por banda verificada (quien tiene el token de membresía).
///         Sirve para decidir la comisión, las colecciones destacadas, etc.
contract SimpleVote {
    struct Proposal {
        address proposer;
        uint64 deadline;
        uint32 yes;
        uint32 no;
        string description;
    }

    AccessToken public immutable token;
    uint256 public nextProposalId = 1;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string description, uint64 deadline);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support);

    error NotMember();
    error InvalidDuration();
    error ProposalNotFound();
    error VotingClosed();
    error AlreadyVoted();

    constructor(AccessToken _token) {
        token = _token;
    }

    modifier onlyMember() {
        if (!token.isMember(msg.sender)) revert NotMember();
        _;
    }

    function createProposal(string calldata description, uint64 duration)
        external
        onlyMember
        returns (uint256 proposalId)
    {
        if (duration == 0 || duration > 30 days) revert InvalidDuration();
        proposalId = nextProposalId++;
        uint64 deadline = uint64(block.timestamp) + duration;
        proposals[proposalId] =
            Proposal({proposer: msg.sender, deadline: deadline, yes: 0, no: 0, description: description});
        emit ProposalCreated(proposalId, msg.sender, description, deadline);
    }

    function vote(uint256 proposalId, bool support) external onlyMember {
        Proposal storage p = proposals[proposalId];
        if (p.proposer == address(0)) revert ProposalNotFound();
        if (block.timestamp >= p.deadline) revert VotingClosed();
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted();
        hasVoted[proposalId][msg.sender] = true;
        if (support) p.yes++;
        else p.no++;
        emit Voted(proposalId, msg.sender, support);
    }

    /// @return open si la votación sigue abierta; passed si hay más votos a favor que en contra
    function result(uint256 proposalId) external view returns (bool open, bool passed, uint32 yes, uint32 no) {
        Proposal storage p = proposals[proposalId];
        if (p.proposer == address(0)) revert ProposalNotFound();
        return (block.timestamp < p.deadline, p.yes > p.no, p.yes, p.no);
    }
}
