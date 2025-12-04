// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, euint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title PrivateYieldPredictorFHE
/// @notice Minimal code style comments only
contract PrivateYieldPredictorFHE is SepoliaConfig {
    // Storage layout hint
    uint256 public sensorUploadCount;

    // Encrypted sensor data bundle
    struct EncryptedSensorData {
        uint256 id;
        address uploader;
        euint64 encryptedSoilMoisture;
        euint64 encryptedSoilPh;
        euint64 encryptedTemperature;
        euint64 encryptedHumidity;
        uint256 timestamp;
    }

    // Encrypted model update produced by a participant
    struct EncryptedModelUpdate {
        uint256 id;
        address contributor;
        euint32 encryptedWeightsHash; // opaque representation
        uint256 timestamp;
    }

    // Decrypted suggestion revealed after authorized decryption
    struct DecryptedSuggestion {
        string advice;
        bool applied;
    }

    mapping(uint256 => EncryptedSensorData) public sensorData;
    mapping(uint256 => EncryptedModelUpdate) public modelUpdates;
    mapping(address => DecryptedSuggestion) public suggestions;

    uint256 public modelUpdateCount;

    // Auxiliary mappings for FHE decryption request tracking
    mapping(uint256 => uint256) private requestToEntityId;
    mapping(uint256 => bytes32) private requestToContext;

    // Events for off-chain monitoring
    event SensorDataSubmitted(uint256 indexed id, address indexed uploader, uint256 timestamp);
    event ModelUpdateSubmitted(uint256 indexed id, address indexed contributor, uint256 timestamp);
    event AggregationDecryptionRequested(uint256 indexed reqId, uint256 indexed aggId);
    event AggregationDecrypted(uint256 indexed aggId);
    event SuggestionDecryptionRequested(uint256 indexed reqId, address indexed beneficiary);
    event SuggestionDecrypted(address indexed beneficiary);

    // Placeholder access control modifier
    modifier onlyUploader(uint256 dataId) {
        // Access checks to be implemented by integrators
        _;
    }

    modifier onlyContributor(uint256 updateId) {
        // Access checks to be implemented by integrators
        _;
    }

    /// @notice Submit encrypted sensor readings
    function submitEncryptedSensorData(
        euint64 encryptedSoilMoisture,
        euint64 encryptedSoilPh,
        euint64 encryptedTemperature,
        euint64 encryptedHumidity
    ) external {
        sensorUploadCount += 1;
        uint256 newId = sensorUploadCount;

        sensorData[newId] = EncryptedSensorData({
            id: newId,
            uploader: msg.sender,
            encryptedSoilMoisture: encryptedSoilMoisture,
            encryptedSoilPh: encryptedSoilPh,
            encryptedTemperature: encryptedTemperature,
            encryptedHumidity: encryptedHumidity,
            timestamp: block.timestamp
        });

        emit SensorDataSubmitted(newId, msg.sender, block.timestamp);
    }

    /// @notice Submit an encrypted model update (opaque blob)
    function submitEncryptedModelUpdate(euint32 encryptedWeightsHash) external {
        modelUpdateCount += 1;
        uint256 newId = modelUpdateCount;

        modelUpdates[newId] = EncryptedModelUpdate({
            id: newId,
            contributor: msg.sender,
            encryptedWeightsHash: encryptedWeightsHash,
            timestamp: block.timestamp
        });

        emit ModelUpdateSubmitted(newId, msg.sender, block.timestamp);
    }

    /// @notice Request aggregation decryption
    /// @dev This prepares a decryption request for an off-chain aggregator
    function requestAggregationDecryption(uint256[] calldata updateIds, bytes32 context) external {
        // Collect ciphertexts for aggregation
        uint256 len = updateIds.length;
        require(len > 0, "empty");

        bytes32[] memory ciphertexts = new bytes32[](len);
        for (uint256 i = 0; i < len; i++) {
            EncryptedModelUpdate storage u = modelUpdates[updateIds[i]];
            ciphertexts[i] = FHE.toBytes32(u.encryptedWeightsHash);
        }

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAggregatedModel.selector);
        // store mapping for callback resolution
        requestToEntityId[reqId] = 0; // reserved id for aggregated model
        requestToContext[reqId] = context;

        emit AggregationDecryptionRequested(reqId, 0);
    }

    /// @notice Callback for aggregated model decryption
    function decryptAggregatedModel(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        // Validate request
        bytes32 context = requestToContext[requestId];
        require(context != bytes32(0), "invalid");

        // Verify proof
        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode aggregated model summary (opaque string array)
        string[] memory results = abi.decode(cleartexts, (string[]));
        // results[0] could be an identifier, results[1] could be metadata
        // Emit an event to notify off-chain systems
        emit AggregationDecrypted(0);
    }

    /// @notice Request personalized suggestion decryption for a farm
    function requestSuggestionDecryption(address beneficiary, euint32 encryptedSuggestion) external {
        // Prepare ciphertext array
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(encryptedSuggestion);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptSuggestion.selector);
        requestToEntityId[reqId] = uint256(uint160(beneficiary));
        requestToContext[reqId] = bytes32(0);

        emit SuggestionDecryptionRequested(reqId, beneficiary);
    }

    /// @notice Callback for suggestion decryption
    function decryptSuggestion(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        uint256 beneficiaryKey = requestToEntityId[requestId];
        require(beneficiaryKey != 0, "invalid");

        // Verify the decryption proof
        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode suggestion text
        string[] memory results = abi.decode(cleartexts, (string[]));
        string memory advice = results.length > 0 ? results[0] : "";

        address beneficiary = address(uint160(beneficiaryKey));
        suggestions[beneficiary] = DecryptedSuggestion({ advice: advice, applied: false });

        emit SuggestionDecrypted(beneficiary);
    }

    /// @notice Read decrypted suggestion
    function getSuggestion(address beneficiary) external view returns (string memory advice, bool applied) {
        DecryptedSuggestion storage s = suggestions[beneficiary];
        return (s.advice, s.applied);
    }

    // Utility helpers

    function bytes32ToUint(bytes32 b) internal pure returns (uint256) {
        return uint256(b);
    }

    function uintToAddressUint256(uint256 v) internal pure returns (uint256) {
        return v;
    }
}
