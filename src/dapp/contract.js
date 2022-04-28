import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import FlightSuretyData from '../../build/contracts/FlightSuretyData.json';
import Config from './config.json';
import data from './data.json';
import Web3 from 'web3';
import DOM from './dom';

export default class Contract {

    constructor(network, callback) {
        let config = Config[network];
        this.web3 = new Web3(new Web3.providers.HttpProvider(config.url));
        this.flightSuretyApp = new this.web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);
        this.flightSuretyData = new this.web3.eth.Contract(FlightSuretyData.abi, config.dataAddress);
        this.owner = null;

        this.accounts = [];
        this.airlines = [];
        this.passengers = [];
        this.flights = [];

        this.testPassenger = null;
        this.initialize(callback);
    }

    addFlightInfoToUI(flight, airlineAddress, flightDate) {

        let displayDiv = DOM.elid("Airline-Info");
        let section = DOM.section();
        section.appendChild(DOM.h5("Flight: " + flight));
        section.appendChild(DOM.h5("Airline Address: " + airlineAddress));
        section.appendChild(DOM.h5("Date: " + flightDate));
        displayDiv.append(section);
    }

    // Check if Smart Contract is Operational
    isOperational(callback) {
        let self = this;
        self.flightSuretyApp.methods
            .isOperational()
            .call({ from: self.owner}, (error, result) => { 
                callback(error, result);
            });
    }

    // Initialize DAPP Front End and Load Data
    initialize(callback) {
        this.web3.eth.getAccounts((error, accts) => {
            
            this.owner = accts[0];

            // Track Accounts from Block Chain - Will be used later for Airline/passengers
            for(let counter = 1; counter <= 11; counter++) {
                this.accounts[counter-1] = accts[counter];
            }

            // Setup Passenger Information
            let passengers = data["passengers"];
            this.passengers[0] = { address: this.accounts[4], name: passengers[0].name};
            this.passengers[1] = { address: this.accounts[5], name: passengers[1].name};
            this.passengers[2] = { address: this.accounts[6], name: passengers[2].name};
            this.passengers[3] = { address: this.accounts[7], name: passengers[3].name};
            this.passengers[4] = { address: this.accounts[8], name: passengers[4].name};

            // Setup Test Passenger
            this.testPassenger =  this.passengers[0];

            this.checkAuthorizeContracts(callback);
        });
    }
    
    // Check to See if DAPP App Contract needs to be authorized to call Data Contract
    checkAuthorizeContracts(callback) {

        var self = this;
        const appAddress = this.flightSuretyApp._address;

        // Check to see if App Contract is Authorized to Call Data Contract
        self.flightSuretyData.methods
            .isAuthorizedCaller(appAddress)
            .call({ from: self.owner}, (error, result) => {
                if (error) {
                    callback(error, result);
                } else {
                    callback(error, result);

                    if (result === false) {
                        self.authorizeContracts(callback);
                    } else {
                        self.setupAirlines(callback);
                    }
                }

            });
    }

    // Authorize App Contract to Accesss Data Contract 
    authorizeContracts(callback) {
        var self = this;

        const appAddress = this.flightSuretyApp._address;

        let contractParameters = { from: self.owner, "gas": 4712388, "gasPrice": 100000000000};
           
        self.flightSuretyData.methods
            .addAuthorizedCaller(appAddress)
            .send(contractParameters, (error, result) => {
                callback(error, result);

                // Setup Airlines 
                self.setupAirlines(callback);
            });
    }

    // Setup Airline Data and Flight Data 
    async setupAirlines(callback) {

        var self = this;

        let airlineNames = data["airlines"];
        self.airlines[0] = { address: self.accounts[0], name: airlineNames[0].name}; // Setup First Airline
        self.airlines[1] = { address: self.accounts[1], name: airlineNames[1].name}; // Setup Second Airline
        self.airlines[2] = { address: self.accounts[2], name: airlineNames[2].name}; // Setup Third Airline
        self.airlines[3] = { address: self.accounts[3], name: airlineNames[3].name}; // Setup Fourth Airline

        callback("No Error", "Airline Init");
        await this.registerAirlines(callback);

        this.setupFlights(callback);
    }

    // Setup Flight Data 
    setupFlights(callback) { 

        var self = this;

        let flightInfo = data["flights"];

        self.flights = [
            {
                airlineAddress: self.airlines[0].address,
                flight: flightInfo[0].flight,
                timestamp: Date.parse(flightInfo[0].timestamp)
            },
            {
                airlineAddress: self.airlines[0].address,
                flight: flightInfo[1].flight,
                timestamp: Date.parse(flightInfo[1].timestamp)
            },
            {
                airlineAddress: self.airlines[1].address,
                flight: flightInfo[2].flight,
                timestamp: Date.parse(flightInfo[2].timestamp)
            }
        ];
     
        // Register Flights for DAPP -- Defaults to 5
        for(let counter = 0; counter <= 2; counter++) {

            let payload = {
                airline: self.flights[counter].airlineAddress,
                flight: self.flights[counter].flight,
                flightDate: self.flights[counter].timestamp,
                timestamp: Math.floor(self.flights[counter].timestamp / 1000)
            } 

            // Setup Parameters for calling App Contract
            let contractParameters = { from:  payload.airline, "gas": 4712388, "gasPrice": 100000000000};

            self.flightSuretyApp.methods
                .registerFlight(payload.flight, payload.timestamp)
                .send(contractParameters, (error, result) => {
                    if (error) {
                        callback(error, payload);
                    } 
                    self.addFlightInfoToUI(payload.flight, payload.airline, payload.flightDate);
                });
        }   
    }

    // Register Airlines 
    async registerAirlines(callback) {
        var self = this;

        // Setup Parameters for calling App Contract
        let firstAirlineAddress = self.airlines[0].address;
        const contractParameters = { from: firstAirlineAddress, "gas": 4712388, "gasPrice": 100000000000};

       // Register Airlines for DAPP -- Defaults to 4
        for(let counter = 1; counter <= 3; counter++) {
        
            let payload = {
                airlineAddress: self.airlines[counter].address,
                airlineName: self.airlines[counter].name
            } 

            self.flightSuretyApp.methods
                .registerAirline(payload.airlineAddress, payload.airlineName)
                .send(contractParameters, (error, result) => {
                    if (error) {
                        callback(error, payload);
                    } 

                    self.fundAirline(payload.airlineAddress, callback);
                });
        }
    }

    // Setup Airlines to Fund Smart Contract 
    async fundAirline(airline, callback) {
        let self = this;
        let fee = this.web3.utils.toWei("10", "ether");

        let alreadyFunded = await self.flightSuretyApp.methods.isAirlineFunded(airline).call();
        if (alreadyFunded === false) {
            self.flightSuretyApp.methods
            .fund()
            .send({ from: airline, value: fee }, 
                (error, result) => {
                    if (error)
                        callback(error, airline);
                    else 
                        callback(result);
                });
        }
    }

    // Look Up Flight Info 
    findFlightInfo(flight) {
        let self = this;
        let flightInfo = null;

        for(let counter = 0; counter < self.flights.length; counter++) {
            if (flight === self.flights[counter].flight) {
                flightInfo = self.flights[counter];
            }
        }

        return flightInfo;
    }

    // Purchase Flight Insurance
    purchaseInsurance(flight, callback) {

        let self = this;
        let amount = 1;
        let ether = this.web3.utils.toWei(amount.toString(), "ether");

        let flightInfo = self.findFlightInfo(flight);
        if (flightInfo === null) {
            callback("Flight Information Missing", flight);
            return;
        }

        let payload = {
            airline: flightInfo.airlineAddress,
            flight: flightInfo.flight,
            timestamp: Math.floor(flightInfo.timestamp / 1000),
            passengerAddress: this.testPassenger.address,
            passengerName: this.testPassenger.name,
        } 

        const contractParameters = { from: payload.passengerAddress, value: ether, "gas": 4712388, "gasPrice": 100000000000};

        self.flightSuretyApp.methods
            .buy(payload.airline, payload.passengerAddress, payload.passengerName, payload.flight, payload.timestamp)
            .send(contractParameters, (error, result) => {
                self.flightSuretyData.methods
                    .getPassengerCreditBalance(this.testPassenger.address)
                    .call({ from: self.owner}, (error, result) => {
                        callback(error, payload);
                });
            });
    }

    // Call Oracle to get updated flight status
    fetchFlightStatus(flight, callback) {
        let self = this;

        let flightInfo = self.findFlightInfo(flight);
        if (flightInfo === null) {
            callback("Flight Information Missing", flight);
            return;
        }

        let payload = {
            airline: flightInfo.airlineAddress,
            flight: flightInfo.flight,
            timestamp: Math.floor(flightInfo.timestamp / 1000)
        } 

        self.flightSuretyApp.methods
            .fetchFlightStatus(payload.airline, payload.flight, payload.timestamp)
            .send({ from: self.owner}, (error, result) => {
                callback(error, payload);
            });
    }
    
    // Check Credit Balance for Passenger 
    getInurancePayout(callback) {
        let self = this;

        self.flightSuretyData.methods
            .getPassengerCreditBalance(this.testPassenger.address)
            .call({ from: self.owner}, (error, result) => {
                if (error) {
                    console.log(`getPassengerCreditBalance_error - ${error}`);
                } else {
                    console.log(`getPassengerCreditBalance_result - ${result}`);
                }

                callback(error, result);
            });
    }
}