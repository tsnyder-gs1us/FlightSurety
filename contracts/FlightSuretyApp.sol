pragma solidity ^0.4.24;

// It's important to avoid vulnerabilities due to numeric overflow bugs
// OpenZeppelin's SafeMath library, when used correctly, protects agains such bugs
// More info: https://www.nccgroup.trust/us/about-us/newsroom-and-events/blog/2018/november/smart-contract-insecurity-bad-arithmetic/

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

/************************************************** */
/* FlightSurety Smart Contract                      */
/************************************************** */
contract FlightSuretyApp {
    using SafeMath for uint256; // Allow SafeMath functions to be called for all uint256 types (similar to "prototype" in Javascript)

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    // Flight status codes
    uint8 private constant STATUS_CODE_UNKNOWN = 0;
    uint8 private constant STATUS_CODE_ON_TIME = 10;
    uint8 private constant STATUS_CODE_LATE_AIRLINE = 20;
    uint8 private constant STATUS_CODE_LATE_WEATHER = 30;
    uint8 private constant STATUS_CODE_LATE_TECHNICAL = 40;
    uint8 private constant STATUS_CODE_LATE_OTHER = 50;

    // Credit value
    uint8 private constant PASSENGER_CREDIT_VALUE = 150;

    // Data Contract Address (Used for Linking App & Data Contracts)
    FlightSuretyData flightSuretyData;

    address private contractOwner;          // Account used to deploy contract

    struct Flight {
        bool isRegistered;
        uint8 statusCode;
        uint256 updatedTimestamp;        
        address airline;
        string flight;
    }
    mapping(bytes32 => Flight) private flights;
 
    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.

    /**
    * @dev Modifier that requires the "operational" boolean variable to be "true"
    *      This is used on all state changing functions to pause the contract in 
    *      the event there is an issue that needs to be fixed
    */
    modifier requireIsOperational() 
    {
         // Modify to call data contract's status
        require(isOperational(), "Contract is currently not operational");  
        _;  // All modifiers require an "_" which indicates where the function body will be added
    }

    /**
    * @dev Modifier that requires the "ContractOwner" account to be the function caller
    */
    modifier requireContractOwner()
    {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    modifier requireActiveAirline()
    {
        require(flightSuretyData.isAirlineActive(msg.sender), "This airline is not registered or provided enough funds for the DAPP.");
        _;
    }

    /********************************************************************************************/
    /*                                       CONSTRUCTOR                                        */
    /********************************************************************************************/

    /**
    * @dev Contract constructor
    *
    */
    constructor
                                (
                                    address dataContract
                                ) 
                                public 
    {
        contractOwner = msg.sender;
        flightSuretyData = FlightSuretyData(dataContract);
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    function isOperational() 
                            public 
                            returns(bool) 
    {
        return flightSuretyData.isOperational();
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    event AirlineRegistered(string airlineName);
    event TestEvent(string airlineName);
  
   /**
    * @dev Add an airline to the registration queue
    *
    */   
    function registerAirline
                            ( 
                                address airlineToRegister,
                                string airlineName
                            )
                            external
                            requireIsOperational
                            requireActiveAirline
                            returns(bool success, uint256 votes)
    {

        if (flightSuretyData.isAirline(airlineToRegister) == false) {
            bool checkResult = flightSuretyData.registerAirline(airlineToRegister, airlineName);

            emit AirlineRegistered(airlineName);
            return (checkResult, 0);
        } else {
            return (true, 0);
        }
    }

    function isAirlineFunded(address airline) external view returns(bool) {
        return flightSuretyData.isAirlineActive(airline);
    }

    function getFlightKey
                        (
                            address airline,
                            string memory flight,
                            uint256 timestamp
                        )
                        internal
                        pure
                        returns(bytes32)
    {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    function fund
                            (   
                            )
                            public
                            payable
                            requireIsOperational
    {
        if (flightSuretyData.isAirlineActive(msg.sender) == false) {
            flightSuretyData.fund.value(msg.value)(msg.sender);
        }
    }


   /**
    * @dev Register a future flight for insuring.
    *
    */  
    function registerFlight
                                (
                                    string flight,                        
                                    uint256 timestamp        
                                )
                                external
                                requireIsOperational
                                requireActiveAirline
    {
        address airlineAddress = msg.sender;
        bytes32 generatedFlightKey = getFlightKey(airlineAddress, flight, timestamp);
        flights[generatedFlightKey].airline = airlineAddress; 
        flights[generatedFlightKey].flight = flight; 
        flights[generatedFlightKey].updatedTimestamp = timestamp; 
        flights[generatedFlightKey].statusCode = STATUS_CODE_UNKNOWN; 
        flights[generatedFlightKey].isRegistered = true; 
    }

    // Get the current flight status
    function getFlightStatus
                            (
                                address airline,
                                string flight,                        
                                uint256 timestamp     
                            )
                            external
                            view
                            returns(uint8)
    {
        bytes32 generatedFlightKey = getFlightKey(airline, flight, timestamp);
        return flights[generatedFlightKey].statusCode;
    }

    // Check if a flight is Registered
    function isFlightRegistered
                            (
                                address airline,
                                string flight,                        
                                uint256 timestamp     
                            )
                            external
                            view
                            returns(bool)
    {
        return _isFlightRegistered(airline, flight, timestamp);
    }

    function _isFlightRegistered
                            (
                                address airline,
                                string flight,                        
                                uint256 timestamp     
                            )
                            internal
                            view
                            returns(bool)
    {
        bytes32 generatedFlightKey = getFlightKey(airline, flight, timestamp);
        return flights[generatedFlightKey].isRegistered;
    }
    
   /**
    * @dev Called after oracle has updated flight status
    * Note: Marked External so method can be called from test
    */  
    function processFlightStatus
                                (
                                    address airline,
                                    string memory flight,
                                    uint256 timestamp,
                                    uint8 statusCode
                                )
                                internal 
    {
        // Update Flight Status
        bytes32 generatedFlightKey = getFlightKey(airline, flight, timestamp);
        flights[generatedFlightKey].statusCode = statusCode;

        // When flight is delayed credit passengers with insurance 
        if (statusCode == STATUS_CODE_LATE_AIRLINE) {
            flightSuretyData.creditInsurees(flight, PASSENGER_CREDIT_VALUE);
        }
        
        emit FlightStatusInfo(airline, flight, timestamp, statusCode);
    }

    /**
    * @dev Expose process flight status for unit tests
    * Note: Marked External so method can be called from test
    */  
    function processFlightStatusFromTest
                                (
                                    address airline,
                                    string flight,
                                    uint256 timestamp,
                                    uint8 statusCode
                                )
                                external 
    {
        processFlightStatus(airline, flight, timestamp, statusCode);
    }

    function testFlightStatus
                        (
                            address airline,
                            string flight,
                            uint256 timestamp                            
                        )
                        external
                        returns(string)
    {
        return flight;
    }


    // Generate a request for oracles to fetch flight information
    function fetchFlightStatus
                        (
                            address airline,
                            string flight,
                            uint256 timestamp                            
                        )
                        external
    {
        uint8 index = getRandomIndex(msg.sender);

        // Generate a unique key for storing the request
        bytes32 key = keccak256(abi.encodePacked(index, airline, flight, timestamp));
        oracleResponses[key] = ResponseInfo({
                                                requester: msg.sender,
                                                isOpen: true
                                            });

        emit OracleRequest(index, airline, flight, timestamp);
    } 

   /**
    * @dev Buy insurance for a flight
    *
    */   
    function buy
                            (
                                address airline,
                                address passengerAddress,
                                string passengerName, 
                                string flight,
                                uint256 timestamp
                            )
                            external
                            payable
                            returns(bool)
    {
        require(flightSuretyData.isAirline(airline), "Airline must be funded before flight can be insured");
        require(_isFlightRegistered(airline, flight, timestamp), "Flight must be register before insurance can be purchased");
        
        // address passengerAddress = msg.sender;
        uint256 insuranceAmount = msg.value; 

        bool success = flightSuretyData.buy(flight, passengerAddress, passengerName, insuranceAmount);
        return success;
    }

    /**
     *  @dev Transfers eligible payout funds to insuree
     *
    */
    function pay()
            external
            payable
            requireIsOperational
    {
        address passengerAddress = msg.sender;
        uint256 creditToRefund = flightSuretyData.pay(passengerAddress);
       // payable(msg.sender).transfer(creditToRefund);
        passengerAddress.transfer(creditToRefund);
    }


// region ORACLE MANAGEMENT

    // Incremented to add pseudo-randomness at various points
    uint8 private nonce = 0;    

    // Fee to be paid when registering oracle
    uint256 public constant REGISTRATION_FEE = 1 ether;

    // Number of oracles that must respond for valid status
    uint256 private constant MIN_RESPONSES = 3;


    struct Oracle {
        bool isRegistered;
        uint8[3] indexes;        
    }

    // Track all registered oracles
    mapping(address => Oracle) private oracles;

    // Model for responses from oracles
    struct ResponseInfo {
        address requester;                              // Account that requested status
        bool isOpen;                                    // If open, oracle responses are accepted
        mapping(uint8 => address[]) responses;          // Mapping key is the status code reported
                                                        // This lets us group responses and identify
                                                        // the response that majority of the oracles
    }

    // Track all oracle responses
    // Key = hash(index, flight, timestamp)
    mapping(bytes32 => ResponseInfo) private oracleResponses;

    // Event fired each time an oracle submits a response
    event FlightStatusInfo(address airline, string flight, uint256 timestamp, uint8 status);

    event OracleReport(address airline, string flight, uint256 timestamp, uint8 status);

    // Event fired when flight status request is submitted
    // Oracles track this and if they have a matching index
    // they fetch data and submit a response
    event OracleRequest(uint8 index, address airline, string flight, uint256 timestamp);


    // Register an oracle with the contract
    function registerOracle
                            (
                            )
                            external
                            payable
    {
        // Require registration fee
        require(msg.value >= REGISTRATION_FEE, "Registration fee is required");

        uint8[3] memory indexes = generateIndexes(msg.sender);

        oracles[msg.sender] = Oracle({
                                        isRegistered: true,
                                        indexes: indexes
                                    });
    }

    function getMyIndexes
                            (
                            )
                            view
                            external
                            returns(uint8[3])
    {
        require(oracles[msg.sender].isRegistered, "Not registered as an oracle");

        return oracles[msg.sender].indexes;
    }




    // Called by oracle when a response is available to an outstanding request
    // For the response to be accepted, there must be a pending request that is open
    // and matches one of the three Indexes randomly assigned to the oracle at the
    // time of registration (i.e. uninvited oracles are not welcome)
    function submitOracleResponse
                        (
                            uint8 index,
                            address airline,
                            string flight,
                            uint256 timestamp,
                            uint8 statusCode
                        )
                        external
    {
        require((oracles[msg.sender].indexes[0] == index) || (oracles[msg.sender].indexes[1] == index) || (oracles[msg.sender].indexes[2] == index), "Index does not match oracle request");


        bytes32 key = keccak256(abi.encodePacked(index, airline, flight, timestamp)); 
        require(oracleResponses[key].isOpen, "Flight or timestamp do not match oracle request");

        oracleResponses[key].responses[statusCode].push(msg.sender);

        // Information isn't considered verified until at least MIN_RESPONSES
        // oracles respond with the *** same *** information
        emit OracleReport(airline, flight, timestamp, statusCode);
        if (oracleResponses[key].responses[statusCode].length >= MIN_RESPONSES) {

            emit FlightStatusInfo(airline, flight, timestamp, statusCode);

            // Handle flight status as appropriate
            processFlightStatus(airline, flight, timestamp, statusCode);
        }
    }

    // Returns array of three non-duplicating integers from 0-9
    function generateIndexes
                            (                       
                                address account         
                            )
                            internal
                            returns(uint8[3])
    {
        uint8[3] memory indexes;
        indexes[0] = getRandomIndex(account);
        
        indexes[1] = indexes[0];
        while(indexes[1] == indexes[0]) {
            indexes[1] = getRandomIndex(account);
        }

        indexes[2] = indexes[1];
        while((indexes[2] == indexes[0]) || (indexes[2] == indexes[1])) {
            indexes[2] = getRandomIndex(account);
        }

        return indexes;
    }

    // Returns array of three non-duplicating integers from 0-9
    function getRandomIndex
                            (
                                address account
                            )
                            internal
                            returns (uint8)
    {
        uint8 maxValue = 10;

        // Pseudo random number...the incrementing nonce adds variation
        uint8 random = uint8(uint256(keccak256(abi.encodePacked(blockhash(block.number - nonce++), account))) % maxValue);

        if (nonce > 250) {
            nonce = 0;  // Can only fetch blockhashes for last 256 blocks so we adapt
        }

        return random;
    }

// endregion

}   

contract FlightSuretyData {
    function authorizeCaller(address callerAddress) external;
    function isOperational() public view returns(bool);
    function setOperatingStatus() external;
    function registerAirline(address airlineToRegister, string airlineName) external returns(bool);
    function isAirline(address airline) external view returns(bool);
    function isAirlineActive(address airline) external view returns(bool);
    function buy(string flight, address passengerAddress, string passengerName, uint256 insuranceAmount) external payable returns(bool);
    function creditInsurees(string flight, uint256 creditAmount) external;
    function pay(address passengerAddress) external returns(uint256 amount);
    function fund(address airline ) public payable;
    function getPassengerCreditBalance(address passengerAddress) external view returns(uint256);
}
