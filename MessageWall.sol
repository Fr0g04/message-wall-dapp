// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MessageWall
 * @notice A public guestbook whose messages live on the blockchain.
 *         Anyone can post; only the deployer can clear the wall.
 *
 * Concepts demonstrated (see "W3 to 4 Solidity and DAPP Programming" slides 52-58):
 *   - state variables, struct types, dynamic arrays, mappings
 *   - constructor + `immutable` owner
 *   - a custom modifier (`onlyOwner`)
 *   - custom errors + `revert`
 *   - events
 */
contract MessageWall {
    /// @notice One entry on the wall.
    struct Message {
        address author;
        string text;
        uint256 timestamp;
    }

    /// @notice Longest message the wall accepts, in bytes.
    uint256 public constant MAX_TEXT_LENGTH = 200;

    /// @notice Account that deployed the contract (the only one who may clear the wall).
    address public immutable owner;

    Message[] private wall;

    /// @notice How many messages each address has posted.
    mapping(address => uint256) public postCount;

    event MessagePosted(uint256 indexed id, address indexed author, string text, uint256 timestamp);
    event WallCleared(address indexed by, uint256 messagesRemoved);

    error EmptyMessage();
    error MessageTooLong(uint256 length, uint256 maxLength);
    error NotOwner();
    error IndexOutOfRange(uint256 index, uint256 total);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Append a new message to the wall.
    function post(string calldata text) external {
        uint256 length = bytes(text).length;
        if (length == 0) revert EmptyMessage();
        if (length > MAX_TEXT_LENGTH) revert MessageTooLong(length, MAX_TEXT_LENGTH);

        wall.push(Message({author: msg.sender, text: text, timestamp: block.timestamp}));
        postCount[msg.sender] += 1;

        emit MessagePosted(wall.length - 1, msg.sender, text, block.timestamp);
    }

    /// @notice Total number of messages ever posted (unless the wall was cleared).
    function total() external view returns (uint256) {
        return wall.length;
    }

    /// @notice Read a single message by index.
    function readOne(uint256 index)
        external
        view
        returns (address author, string memory text, uint256 timestamp)
    {
        if (index >= wall.length) revert IndexOutOfRange(index, wall.length);
        Message storage item = wall[index];
        return (item.author, item.text, item.timestamp);
    }

    /// @notice The `count` newest messages, newest first. Returns fewer if the wall is short.
    function recent(uint256 count) external view returns (Message[] memory result) {
        uint256 size = wall.length;
        if (count > size) count = size;

        result = new Message[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = wall[size - 1 - i];
        }
    }

    /// @notice Remove every message. Owner only.
    function clear() external onlyOwner {
        uint256 removed = wall.length;
        delete wall;
        emit WallCleared(msg.sender, removed);
    }
}
