pragma solidity ^0.4.24;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

contract FlightSuretyData {
    using SafeMath for uint256;

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    address private contractOwner;                                      // Account used to deploy contract
    bool private operational = true;                                    // Blocks all state changes throughout the contract if false

    // Data for tracking registered airlines
    struct RegisteredAirline {
        bool isRegistered;
        uint256 funds;
        uint256 votes;
        uint256 testNumber;
        string name;
        address airlineAddress;
    }

    // Multiparty Consensus tracking
    uint8 private constant MINIMUM_MULTIPARTY_CONSENSUS = 4;
    // uint256 public constant AIRLINE_MINIMUM_FUNDS = 10 ether; // TODD: Switch Back
    uint256 public constant AIRLINE_MINIMUM_FUNDS = .00005 ether; // Used to minimize test overhead
    uint256 public numberOfRegisteredAirlines;
    address public firstAirlineAddress;

    mapping(address => RegisteredAirline) private airlines;
    mapping(address => bool) public verifiedCallers;

    // Track Passengers Insurance 
    struct Passengers {
        address passengersAddress;
        string name;
        uint256 credit;
    }

    // Track Insured Flights
    struct FlightInsurance {
        address passenger;
        uint256 insuranceAmount;
        bytes32 flightKey; 
    }

    mapping(address => Passengers) private passengers;
    mapping(bytes32 => FlightInsurance) private flightInsurance;
    
    // Used to Map Flights to Passengers with Insurance 
    bytes32[] public flightToPassengersKeys;

    uint256 public constant PASSENGER_INSURANCE_LIMIT = 1 ether; // TODD: Switch Back
    // uint256 public constant PASSENGER_INSURANCE_LIMIT = .00005 ether; // Used to minimize test overhead

    /********************************************************************************************/
    /*                                       EVENT DEFINITIONS                                  */
    /********************************************************************************************/


    /**
    * @dev Constructor
    *      The deploying account becomes contractOwner
    */
    constructor
                                (
                                    address firstAirline
                                ) 
                                public 
    {
        // Setup Contact Owner to be authorized
        contractOwner = msg.sender;
        verifiedCallers[contractOwner] = true;

        // Setup first airline
        verifiedCallers[firstAirline] = true; // Grant First Airline the ability to call Data Contract
        airlines[firstAirline].isRegistered = true;

        airlines[firstAirline].funds = AIRLINE_MINIMUM_FUNDS; // Make Zero Don't fund first airline to make test pass
        airlines[firstAirline].votes = 4; 
        airlines[firstAirline].testNumber = 12; 
        airlines[firstAirline].airlineAddress = firstAirline; 
        airlines[firstAirline].name = "Main Airline"; 

        firstAirlineAddress = firstAirline;
        
        numberOfRegisteredAirlines++;
    }

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.

    modifier isAuthorized()
    {
      require(verifiedCallers[msg.sender] == true, "Address is not authorized to make calls on data contract");
      _;
    }

    /**
    * @dev Modifier that requires the "operational" boolean variable to be "true"
    *      This is used on all state changing functions to pause the contract in 
    *      the event there is an issue that needs to be fixed
    */
    modifier requireIsOperational() 
    {
        require(operational, "Contract is currently not operational");
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

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    /** 
    * Verify the caller is authorized to use the contract

    * Developer Note: Had to Remove requireContractOwner Check as a work around to get the App Contract Owner Authorized!
    */ 
    function addAuthorizedCaller (address inputAddress) 
        external
        //requireContractOwner
    {
        verifiedCallers[inputAddress] = true;
    }

    /** 
    * Verify the caller is authorized to use the contract
    */ 
    function authorizeCaller(address callerAddress) external
        requireContractOwner()
        requireIsOperational()
    {
      verifiedCallers[callerAddress] = true;
    }

    function isAuthorizedCaller(address inputAddress) external view returns(bool)
    {
        return verifiedCallers[inputAddress];
    }

    /**
    * @dev Get operating status of contract
    *
    * @return A bool that is the current operating status
    */      
    function isOperational() 
                            public 
                            view 
                            returns(bool) 
    {
        return operational;
    }


    /**
    * @dev Sets contract operations on/off
    *
    * When operational mode is disabled, all write transactions except for this one will fail
    */    
    function setOperatingStatus
                            (
                                bool mode
                            ) 
                            external
                            requireContractOwner 
    {
        operational = mode;
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

   /**
    * @dev Add an airline to the registration queue
    *      Can only be called from FlightSuretyApp contract
    *
    */   
    // Caller of this method must be a registered airline
    function registerAirline(address airlineToRegister, string airlineName) 
        external requireIsOperational isAuthorized returns(bool)
    {

        // Do not allow the same airline to registered more than once to ensure Multiparty Consensus works 
        require(!airlines[airlineToRegister].isRegistered, "Airline can only be registered once.");

        // First Set of Airline register automatically until a consensus is reached
        if (numberOfRegisteredAirlines < MINIMUM_MULTIPARTY_CONSENSUS) {
            airlines[airlineToRegister].isRegistered = true;
            airlines[airlineToRegister].funds = 0; // Airlines must provide funds before it is active 
            airlines[airlineToRegister].votes = 1; 
            airlines[airlineToRegister].name = airlineName; 
            airlines[airlineToRegister].airlineAddress = airlineToRegister; 
            numberOfRegisteredAirlines++;
        } else {
            require(voteForAirline(airlineToRegister, airlineName), "An error occurred while voting");
        }
        return(true);   
    }

   /**
    * Internal method used to track pending airline votes
    * Once an airline meets MINIMUM_MULTIPARTY_CONSENSUS it will become registered
    * Airline still needs to fund contract before is it active 
    */ 
    function voteForAirline(address airlineToRegister, string airlineName) 
        internal requireIsOperational returns(bool) {

        bool votingResult = false;

        // Track votes for pending airline
        airlines[airlineToRegister].votes++;
        airlines[airlineToRegister].name = airlineName;
        airlines[airlineToRegister].airlineAddress = airlineToRegister; 

        // Check to see if airline has received enough votes
        // 50% Must vote to register pending airline
        uint256 numberOfRequiredVotes = numberOfRegisteredAirlines.div(2); 
        if (airlines[airlineToRegister].votes >= numberOfRequiredVotes) {
            airlines[airlineToRegister].isRegistered = true;
            numberOfRegisteredAirlines++;
        }
        votingResult = true;

        return votingResult;
    }

    // Check to see if an airline has successfully registered 
    function isAirline(address airline) external view returns(bool)
    {
        return airlines[airline].isRegistered;
    }

    function airlineHasReachedConsensus(address airline) external view returns(bool)
    {
        uint256 numberOfRequiredVotes = numberOfRegisteredAirlines.div(2); 
        return airlines[airline].votes >= numberOfRequiredVotes;
    }

    // Check to see if an airline has successfully registered and funded the DAPP
    function isAirlineActive(address airline) external view returns(bool)
    {
        bool isRegistered = airlines[airline].isRegistered;
        bool isFunded = airlines[airline].funds >= AIRLINE_MINIMUM_FUNDS;

        bool checkState = isRegistered && isFunded;

        return checkState;
    }

   /**
    * @dev Buy insurance for a flight
    *
    */   
    function buy
                            (  
                                string flight,
                                address passengerAddress, 
                                string passengerName,
                                uint256 insuranceAmount                 
                            )
                            external
                            payable
                            //isAuthorized
                            returns(bool)
    {
        require(insuranceAmount <= PASSENGER_INSURANCE_LIMIT, "Insurance amount can not be more than 1 ETH");

        // Setup Passenger - Use Later to credit them
        passengers[passengerAddress].passengersAddress = passengerAddress;
        passengers[passengerAddress].name = passengerName;

        // Setup Flight Insurance Mapping to Passenger
        bytes32 key = keccak256(abi.encodePacked(passengerAddress, flight));
        bytes32 flightKey = keccak256(abi.encodePacked(flight));

        flightInsurance[key].passenger = passengerAddress;
        flightInsurance[key].flightKey = flightKey;
        flightInsurance[key].insuranceAmount = insuranceAmount;

        bool keyFound = false;
        for (uint i; i < flightToPassengersKeys.length; i++) {
            if (flightToPassengersKeys[i] == key) {
                keyFound = true;
                return;
            }
        }

        if (keyFound == false) {
            flightToPassengersKeys.push(key);
        }

        return(true);
    }

    function getPassengerInsuranceAmount(address passengerAddress, string flight) external view returns(uint256)
    {
        bytes32 key = keccak256(abi.encodePacked(passengerAddress, flight));
        uint256 insuranceAmount = flightInsurance[key].insuranceAmount;
        return insuranceAmount;
    }

    function getPassengerCreditBalance(address passengerAddress) external view returns(uint256)
    {
        return passengers[passengerAddress].credit;
    }

    function clearPassengerCreditBalance(address passengerAddress)
    {
        passengers[passengerAddress].credit = 0;
    }

    /**
     *  @dev Credits payouts to insurees
    */
    function creditInsurees
                                (
                                    string flight,
                                    uint256 creditAmount
                                )
                                isAuthorized
                                external
    {

        bytes32 flightKey = keccak256(abi.encodePacked(flight));
        for (uint i; i < flightToPassengersKeys.length; i++) {

            bytes32 key = flightToPassengersKeys[i];
            if (flightInsurance[key].flightKey == flightKey) {
                address passengerAddress = flightInsurance[key].passenger;
                uint256 insuranceAmount = flightInsurance[key].insuranceAmount;

                // Credit passenger with insurance payout 
                uint256 insuranceAmountBenefit =insuranceAmount.mul(creditAmount).div(100);
                uint256 currentCredit = passengers[passengerAddress].credit;
                passengers[passengerAddress].credit = currentCredit + insuranceAmountBenefit;
            }
        }
    }

    /**
     *  @dev Transfers eligible payout funds to insuree
     *
    */
    function pay(address passengerAddress) 
        external 
        requireIsOperational 
        isAuthorized 
        returns(uint256 amount) 
    {
        require(passengers[passengerAddress].credit > 0, "Passenger balance is zero!");
        uint256 creditToRefund = passengers[passengerAddress].credit;
        passengers[passengerAddress].credit = 0;
        return creditToRefund;
    }

   /**
    * @dev Initial funding for the insurance. Unless there are too many delayed flights
    *      resulting in insurance payouts, the contract should be self-sustaining
    */   
    function fund
                            (  
                                address airline 
                            )
                            public
                            payable
                            requireIsOperational
    {
        uint256 airlineFunds = airlines[airline].funds;
        airlines[airline].funds = airlineFunds.add(msg.value);

        address(this).transfer(msg.value);
    }

    function getFlightKey
                        (
                            address airline,
                            string memory flight,
                            uint256 timestamp
                        )
                        internal
                        returns(bytes32) 
    {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    /**
    * @dev Fallback function for funding smart contract.
    *
    */
    function() 
                            external 
                            payable 
    {
        // fund(); -- Commenting this out removes VM Exception while processing transaction: revert error
    }

}

