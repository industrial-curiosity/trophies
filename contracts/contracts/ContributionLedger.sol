// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ContributionLedger
/// @notice Append-only ledger of signed contribution attestations.
///         The chain does not decide truth: it only records that an
///         authorized company wallet attested to a contribution, with a
///         hash pointing at private off-chain evidence.
contract ContributionLedger {
    struct Contribution {
        bytes32 employeeId; // keccak256 of employee identifier (email, wallet, ...)
        bytes32 companyId; // keccak256 of company identifier
        string contributionType; // e.g. "code", "design", "incident-response"
        bytes32 proofHash; // hash of private Jira/Git/internal evidence
        uint64 timestamp; // block timestamp at issuance
        address issuer; // company wallet that signed the attestation
    }

    address public immutable admin;
    mapping(address => bool) public authorizedCompanies;

    Contribution[] private contributions;
    mapping(bytes32 => uint256[]) private employeeContributionIds;

    event CompanyAuthorizationChanged(address indexed company, bool authorized);
    event ContributionIssued(
        uint256 indexed id,
        bytes32 indexed employeeId,
        bytes32 indexed companyId,
        address issuer
    );

    error NotAdmin();
    error NotAuthorizedCompany();
    error UnknownContribution();

    constructor() {
        admin = msg.sender;
    }

    /// @notice Admin grants or revokes a company wallet's right to issue.
    ///         Revocation does not touch already-issued records: they were
    ///         valid when signed, and the ledger is append-only.
    function setCompanyAuthorization(address company, bool authorized) external {
        if (msg.sender != admin) revert NotAdmin();
        authorizedCompanies[company] = authorized;
        emit CompanyAuthorizationChanged(company, authorized);
    }

    /// @notice Issue an immutable contribution record. No update or delete exists.
    function issueContribution(
        bytes32 employeeId,
        bytes32 companyId,
        string calldata contributionType,
        bytes32 proofHash
    ) external returns (uint256 id) {
        if (!authorizedCompanies[msg.sender]) revert NotAuthorizedCompany();
        id = contributions.length;
        contributions.push(
            Contribution({
                employeeId: employeeId,
                companyId: companyId,
                contributionType: contributionType,
                proofHash: proofHash,
                timestamp: uint64(block.timestamp),
                issuer: msg.sender
            })
        );
        employeeContributionIds[employeeId].push(id);
        emit ContributionIssued(id, employeeId, companyId, msg.sender);
    }

    function getContribution(uint256 id) public view returns (Contribution memory) {
        if (id >= contributions.length) revert UnknownContribution();
        return contributions[id];
    }

    function getEmployeeContributionIds(bytes32 employeeId) external view returns (uint256[] memory) {
        return employeeContributionIds[employeeId];
    }

    function totalContributions() external view returns (uint256) {
        return contributions.length;
    }

    /// @notice Public verification: the record exists (issuance already proved
    ///         the issuer was authorized at signing time), plus whether the
    ///         issuer is still an authorized company today.
    function verifyContribution(uint256 id)
        external
        view
        returns (bool exists, bool issuerCurrentlyAuthorized, Contribution memory contribution)
    {
        if (id >= contributions.length) {
            return (false, false, contribution);
        }
        contribution = contributions[id];
        return (true, authorizedCompanies[contribution.issuer], contribution);
    }
}
