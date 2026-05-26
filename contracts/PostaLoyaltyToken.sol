// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract PostaLoyaltyToken is ERC20Burnable, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    mapping(bytes32 => address) public registry;
    mapping(bytes32 => bool) public processedEvent;
    mapping(uint256 => uint256) public mintedPerDay;

    uint256 public maxMintPerTx;
    uint256 public dailyMintCap;
    uint256 public totalMinted;
    uint256 public totalBurned;
    uint256 public constant MAX_SUPPLY = 21_000_000 * 1e18;

    uint8 public constant MINT_CHECK_OK = 0;
    uint8 public constant MINT_CHECK_PAUSED = 1;
    uint8 public constant MINT_CHECK_ZERO_USER = 2;
    uint8 public constant MINT_CHECK_INVALID_AMOUNT = 3;
    uint8 public constant MINT_CHECK_EVENT_PROCESSED = 4;
    uint8 public constant MINT_CHECK_PER_TX_CAP = 5;
    uint8 public constant MINT_CHECK_MAX_SUPPLY = 6;
    uint8 public constant MINT_CHECK_REGISTRY_MISMATCH = 7;
    uint8 public constant MINT_CHECK_DAILY_CAP = 8;

    event UserRegistered(bytes32 indexed rutHash, address indexed wallet);
    event UserUnregistered(bytes32 indexed rutHash, address indexed previousWallet);
    event PointsMinted(address indexed user, uint256 amount, bytes32 indexed eventId, bytes32 rutHash);
    event MintCapsUpdated(uint256 maxMintPerTx, uint256 dailyMintCap);
    event PointsBurned(address indexed from, uint256 amount);

    error EventAlreadyProcessed(bytes32 eventId);
    error MintTooLarge(uint256 requested, uint256 maxAllowed);
    error DailyCapExceeded(uint256 requested, uint256 mintedToday, uint256 dailyCap);
    error ZeroAddress();
    error InvalidCapConfiguration();
    error RegistryMismatch(bytes32 rutHash, address expectedWallet, address requestedWallet);
    error RegistryNotFound(bytes32 rutHash);
    error InvalidAmount();
    error CriticalRoleRenounceForbidden(bytes32 role, address account);
    error MaxSupplyExceeded(uint256 requestedMint, uint256 currentSupply, uint256 maxSupply);

    constructor(address admin, address minter, uint256 _maxMintPerTx, uint256 _dailyMintCap) ERC20("PostaPoints", "POSTA") {
        if (admin == address(0) || minter == address(0)) revert ZeroAddress();
        _validateCaps(_maxMintPerTx, _dailyMintCap);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);

        maxMintPerTx = _maxMintPerTx;
        dailyMintCap = _dailyMintCap;
    }

    function registerUser(bytes32 rutHash, address wallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        registry[rutHash] = wallet;
        emit UserRegistered(rutHash, wallet);
    }

    function unregisterUser(bytes32 rutHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address previousWallet = registry[rutHash];
        delete registry[rutHash];
        emit UserUnregistered(rutHash, previousWallet);
    }

    function setMintCaps(uint256 _maxMintPerTx, uint256 _dailyMintCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _validateCaps(_maxMintPerTx, _dailyMintCap);
        maxMintPerTx = _maxMintPerTx;
        dailyMintCap = _dailyMintCap;
        emit MintCapsUpdated(_maxMintPerTx, _dailyMintCap);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function mintPoints(address user, uint256 amount, bytes32 eventId, bytes32 rutHash) external onlyRole(MINTER_ROLE) whenNotPaused {
        _mintWithChecks(user, amount, eventId, rutHash, true);
    }

    function mintPointsToRegisteredUser(bytes32 rutHash, uint256 amount, bytes32 eventId) external onlyRole(MINTER_ROLE) whenNotPaused {
        address registeredWallet = registry[rutHash];
        if (registeredWallet == address(0)) revert RegistryNotFound(rutHash);
        _mintWithChecks(registeredWallet, amount, eventId, rutHash, false);
    }

    function currentDay() external view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function remainingDailyCapacity() external view returns (uint256) {
        uint256 day = block.timestamp / 1 days;
        uint256 mintedToday = mintedPerDay[day];
        return mintedToday >= dailyMintCap ? 0 : dailyMintCap - mintedToday;
    }

    function outstandingLiability() external view returns (uint256) {
        return totalMinted - totalBurned;
    }


    function mintCheck(address user, uint256 amount, bytes32 eventId, bytes32 rutHash, bool enforceRegistryIfExists)
        external
        view
        returns (uint8 code, uint256 remainingDailyCapacityValue, uint256 remainingSupply)
    {
        if (paused()) return (MINT_CHECK_PAUSED, _remainingDailyCapacityView(), MAX_SUPPLY - totalSupply());
        if (user == address(0)) return (MINT_CHECK_ZERO_USER, _remainingDailyCapacityView(), MAX_SUPPLY - totalSupply());
        if (amount == 0) return (MINT_CHECK_INVALID_AMOUNT, _remainingDailyCapacityView(), MAX_SUPPLY - totalSupply());
        if (processedEvent[eventId]) return (MINT_CHECK_EVENT_PROCESSED, _remainingDailyCapacityView(), MAX_SUPPLY - totalSupply());
        if (amount > maxMintPerTx) return (MINT_CHECK_PER_TX_CAP, _remainingDailyCapacityView(), MAX_SUPPLY - totalSupply());
        if (totalSupply() + amount > MAX_SUPPLY) return (MINT_CHECK_MAX_SUPPLY, _remainingDailyCapacityView(), MAX_SUPPLY - totalSupply());

        address registeredWallet = registry[rutHash];
        if (enforceRegistryIfExists && registeredWallet != address(0) && registeredWallet != user) {
            return (MINT_CHECK_REGISTRY_MISMATCH, _remainingDailyCapacityView(), MAX_SUPPLY - totalSupply());
        }

        uint256 day = block.timestamp / 1 days;
        uint256 mintedToday = mintedPerDay[day];
        if (mintedToday + amount > dailyMintCap) return (MINT_CHECK_DAILY_CAP, _remainingDailyCapacityView(), MAX_SUPPLY - totalSupply());

        return (MINT_CHECK_OK, _remainingDailyCapacityView(), MAX_SUPPLY - totalSupply());
    }

    function renounceRole(bytes32 role, address account) public override {
        if ((role == DEFAULT_ADMIN_ROLE || role == MINTER_ROLE || role == PAUSER_ROLE) && account == _msgSender()) {
            revert CriticalRoleRenounceForbidden(role, account);
        }
        super.renounceRole(role, account);
    }

    function _mintWithChecks(address user, uint256 amount, bytes32 eventId, bytes32 rutHash, bool enforceRegistryIfExists) internal {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (processedEvent[eventId]) revert EventAlreadyProcessed(eventId);
        if (amount > maxMintPerTx) revert MintTooLarge(amount, maxMintPerTx);
        if (totalSupply() + amount > MAX_SUPPLY) revert MaxSupplyExceeded(amount, totalSupply(), MAX_SUPPLY);

        address registeredWallet = registry[rutHash];
        if (enforceRegistryIfExists && registeredWallet != address(0) && registeredWallet != user) {
            revert RegistryMismatch(rutHash, registeredWallet, user);
        }

        uint256 day = block.timestamp / 1 days;
        uint256 mintedToday = mintedPerDay[day];
        if (mintedToday + amount > dailyMintCap) {
            revert DailyCapExceeded(amount, mintedToday, dailyMintCap);
        }

        processedEvent[eventId] = true;
        mintedPerDay[day] = mintedToday + amount;

        _mint(user, amount);
        totalMinted += amount;
        emit PointsMinted(user, amount, eventId, rutHash);
    }

    function _validateCaps(uint256 _maxMintPerTx, uint256 _dailyMintCap) internal pure {
        if (_maxMintPerTx == 0 || _dailyMintCap == 0 || _maxMintPerTx > _dailyMintCap) {
            revert InvalidCapConfiguration();
        }
    }

    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        super._update(from, to, value);
        if (to == address(0) && from != address(0) && value > 0) {
            totalBurned += value;
            emit PointsBurned(from, value);
        }
    }
}
