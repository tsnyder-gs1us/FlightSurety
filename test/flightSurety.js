
var Test = require('../config/testConfig.js');
var BigNumber = require('bignumber.js');

contract('Flight Surety Tests', async (accounts) => {

  var config;
  before('setup contract', async () => {
    config = await Test.Config(accounts);
    await config.flightSuretyData.authorizeCaller(config.flightSuretyApp.address);
  });

  /****************************************************************************************/
  /* Operations and Settings                                                              */
  /****************************************************************************************/

  it(`(multiparty) has correct initial isOperational() value`, async function () {
    // Get operating status
    let status = await config.flightSuretyData.isOperational.call();
    assert.equal(status, true, "Incorrect initial operating status value");

  });

  it(`Verify first airline is registered by default`, async function () {
    // Check to see if first airline is registered
    let status = await config.flightSuretyData.isAirline.call(config.firstAirline);
    let numberOfAirlines = await config.flightSuretyData.numberOfRegisteredAirlines.call();
    assert.equal(status, true, "First Airline is Registered");
    assert.equal(numberOfAirlines, 1, "Only one airline should be registered after deployment.");

  });

  it(`(multiparty) can block access to setOperatingStatus() for non-Contract Owner account`, async function () {

      // Ensure that access is denied for non-Contract Owner account
      let accessDenied = false;
      try 
      {
          await config.flightSuretyData.setOperatingStatus(false, { from: config.testAddresses[2] });
      }
      catch(e) {
          accessDenied = true;
      }
      assert.equal(accessDenied, true, "Access not restricted to Contract Owner");
            
  });

  it(`(multiparty) can allow access to setOperatingStatus() for Contract Owner account`, async function () {

      // Ensure that access is allowed for Contract Owner account
      let accessDenied = false;
      try 
      {
          await config.flightSuretyData.setOperatingStatus(false);
      }
      catch(e) {
          accessDenied = true;
      }
      assert.equal(accessDenied, false, "Access not restricted to Contract Owner");
      
  });

  it(`(multiparty) can block access to functions using requireIsOperational when operating status is false`, async function () {

      await config.flightSuretyData.setOperatingStatus(false);

      let reverted = false;
      try 
      {
          await config.flightSurety.setTestingMode(true);
      }
      catch(e) {
          reverted = true;
      }
      assert.equal(reverted, true, "Access not blocked for requireIsOperational");      

      // Set it back for other tests to work
      await config.flightSuretyData.setOperatingStatus(true);

  });

  it('(first airline) can register an Airline using registerAirline() once its funded', async () => {
    
    // ARRANGE
    let newAirline = accounts[2];
    let funds = await config.flightSuretyData.AIRLINE_MINIMUM_FUNDS.call();

    // ACT
    try {
        await config.flightSuretyApp.fund({from: config.firstAirline, value: funds});
        await config.flightSuretyApp.registerAirline(newAirline, "Airline 2", {from: config.firstAirline});
    }
    catch(e) {
      console.log(e);
    }

    let result = await config.flightSuretyData.isAirline.call(newAirline);
    let airlinesCount = await config.flightSuretyData.numberOfRegisteredAirlines.call(); 
    assert.equal(result, true, "First Airline can register another airline once its funded");
    assert.equal(airlinesCount, 2, "2 airlines should now be registered");

  }); 

  it('Multiparty Consensus First Four Airlines do not require consensus vote', async () => {
    
    // Test Note: 
    //  First Airline is registered on contract creation
    //  Second Airline is registred in previous test

    // Ensure two airlines are registered prior to running tests 
    let airlinesCount = await config.flightSuretyData.numberOfRegisteredAirlines.call(); 
    assert.equal(airlinesCount, 2, "2 airlines should now be registered");

    // ACT
    try {
        await config.flightSuretyApp.registerAirline(accounts[3], "Airline 3", {from: config.firstAirline});
        await config.flightSuretyApp.registerAirline(accounts[4], "Airline 4", {from: config.firstAirline});
      }
    catch(e) {

    }

    // Newly added airline should be registered 
    let result = await config.flightSuretyData.isAirline.call(accounts[4]);
    airlinesCount = await config.flightSuretyData.numberOfRegisteredAirlines.call(); 

    // ASSERT
    assert.equal(result, true, "Up to 4 airlines should register automatically");
    assert.equal(airlinesCount, 4, "4 airlines should now be registered");
  });

  it('Multiparty Consensus New Airline require consensus vote', async () => {
    
    // Test Note: 
    //  First Airline is registered on contract creation
    //  Second. Thrid and Fourth Airlines are registred in previous tests

    // Ensure two airlines are registered prior to running tests 
    let airlinesCount = await config.flightSuretyData.numberOfRegisteredAirlines.call(); 
    assert.equal(airlinesCount, 4, "4 airlines should now be registered");

    // ACT
    try {
        await config.flightSuretyApp.registerAirline(accounts[5], "Airline 5", {from: config.firstAirline});
      }
    catch(e) {

    }

    // Newly added airline should be not registered 
    let result = await config.flightSuretyData.isAirline.call(accounts[5]);
    let airlinesConsensus = await config.flightSuretyData.airlineHasReachedConsensus.call(accounts[5]); 

    // ASSERT
    assert.equal(result, false, "Before Consensus is reached newly added airline should not be registered");
    assert.equal(airlinesConsensus, false, "Consensus has not be reached");
  });

  it('Multiparty Consensus Pending Airline passes consensus vote once 50% agree', async () => {

    let secondAirline = accounts[2];
    
    let funds = await config.flightSuretyData.AIRLINE_MINIMUM_FUNDS.call();
    await config.flightSuretyApp.fund({from: secondAirline, value: funds});

    // ACT
    try {
        await config.flightSuretyApp.registerAirline(accounts[6], "Airline 6", {from: config.firstAirline});
        await config.flightSuretyApp.registerAirline(accounts[6], "Airline 6", {from: secondAirline});
      }
    catch(e) {

    }

    // Newly added airline should be not registered 
    let result = await config.flightSuretyData.isAirline.call(accounts[6]);
    let airlinesConsensus = await config.flightSuretyData.airlineHasReachedConsensus.call(accounts[6]); 

    // ASSERT
    assert.equal(result, true, "When Consensus is reached newly added airline should be registered");
    assert.equal(airlinesConsensus, true, "Consensus has been reached");
  });

  
  it('Newly registered airline can not register airlines if it not funded the contract', async () => {
    
    // ARRANGE
    let airlineRegistered = accounts[3];

    // ACT
    try {
        // Diable Test to Fund for Now
        await config.flightSuretyApp.registerAirline(accounts[7], "Airline 7", {from: airlineRegistered});
    }
    catch(e) {

    }

    let result = await config.flightSuretyData.isAirline.call(accounts[7]);
    assert.equal(result, false, "Unfunded airline can not register another airline");

  }); 

  // Test Related to Managing Flights and Passengers  

  it('Verify Airline can register flight', async () => {
    
    // ARRANGE
    let flight = "TS1273"
    let flightTimestamp = config.testTimeStamp; 

    // ACT
    try {
        await config.flightSuretyApp.registerFlight(flight, flightTimestamp, {from: config.firstAirline});
    }
    catch(e) {
      // Log error to comsole 
      console.log(e);
    }

   // ASSERT
   let isFlightRegistered = await config.flightSuretyApp.isFlightRegistered(config.firstAirline, flight, flightTimestamp)
   assert.equal(isFlightRegistered, true,  "The flight was registered");
 });
 
 it('Allow Passenger to purchase insurance up to 1 ether', async () => {

  // ARRANGE
  let flight = "TS1273";
  let passengerName = "Test Passenger";
  let insuranceAmount = await config.flightSuretyData.PASSENGER_INSURANCE_LIMIT.call();
  let passengerAddress = accounts[8];

  // ACT
  try {
      await config.flightSuretyApp.buy(config.firstAirline, passengerAddress, passengerName, flight, config.testTimeStamp,  {from: passengerAddress, value: insuranceAmount});
    }
  catch(e) {
    // Log error to comsole 
    console.log(e);
  }

  // ASSERT
  let insuraneAquiredAmount = await config.flightSuretyData.getPassengerInsuranceAmount(passengerAddress, flight);
  let t = insuraneAquiredAmount.toNumber();
  assert.equal(insuraneAquiredAmount > 0, true,  "The Passenger was able to purchase insurance");
});

it('Passenger recieves credit if flight is delayed', async () => {

  // ARRANGE
  let flight = "TS1273";
  let insuranceAmount = await config.flightSuretyData.PASSENGER_INSURANCE_LIMIT.call();
  let expectedCredit = insuranceAmount * 1.5; 

  let passengerAddress = accounts[8];

  let creditBalance = await config.flightSuretyData.getPassengerCreditBalance(passengerAddress);
  let t = creditBalance.toNumber();
  assert.equal(creditBalance == 0, true,  "The Passenger should have no balance");

  // ACT
  try {
      await config.flightSuretyApp.processFlightStatusFromTest(config.firstAirline, flight, config.testTimeStamp, 20);
  }
  catch(e) {
    // Log error to comsole 
    console.log(e);
  }

  // ASSERT
  creditBalance = await config.flightSuretyData.getPassengerCreditBalance(passengerAddress);
  let creditBalanceValue = creditBalance.toNumber();
  let isExpectedCredit = creditBalanceValue === expectedCredit;
  
  assert.equal(isExpectedCredit, true,  "After delayed flight passenger should have credit");

});

it('Passenger does not recieve credit directly in their wallet', async () => {

  // ARRANGE
  let flight = "TS1273";
  let passengerName = "Test Passenger";
  let insuranceAmount = await config.flightSuretyData.PASSENGER_INSURANCE_LIMIT.call();
  let passengerAddress = accounts[9];
  let passengerBalanceBeforeFlight = 0;

  // ACT
  try {
    await config.flightSuretyApp.buy(config.firstAirline, passengerAddress, passengerName, flight, config.testTimeStamp,  {from: passengerAddress, value: insuranceAmount});
    passengerBalanceBeforeFlight = await web3.eth.getBalance(passengerAddress);
    await config.flightSuretyApp.processFlightStatusFromTest(config.firstAirline, flight, config.testTimeStamp, 20);
  }
  catch(e) {
    // Log error to comsole 
    console.log(e);
  }

  // ASSERT
  let creditBalance = await config.flightSuretyData.getPassengerCreditBalance(passengerAddress);
  let passengerBalanceAfterFlight = await web3.eth.getBalance(passengerAddress);

  let balanceDifference = passengerBalanceAfterFlight - passengerBalanceBeforeFlight;
  
  assert.equal(creditBalance > 0, true,  "After delayed flight passenger should have credit");
  assert.equal(balanceDifference === 0, true,  "After delayed flight passenger wallet should not have changed");

});

it('Passenger can transfer any pending credit to their wallet', async () => {

  // ARRANGE
  let passengerAddress = accounts[9];
  let passengerBalanceBeforeCredit = await web3.eth.getBalance(passengerAddress);
  let balanceContractBefore = await web3.eth.getBalance(config.flightSuretyData.address);

  // ACT
  try {
    await config.flightSuretyApp.pay({from: passengerAddress, gas: 4712388, gasPrice: 100000000000});
  }
  catch(e) {
    // Log error to comsole 
    console.log(e);
  }

  // ASSERT
  let passengerBalanceAfterCredit = await web3.eth.getBalance(passengerAddress);
  let balanceContractAfter = await web3.eth.getBalance(config.flightSuretyData.address);

  let balanceDifferenceContract = balanceContractBefore - balanceContractAfter;
  let passengerBalance = passengerBalanceAfterCredit - passengerBalanceBeforeCredit;

  let checkTransfer = balanceDifferenceContract === passengerBalance;

  //assert.equal(checkTransfer, true,  "Expected funds were not transfered");
  assert.equal(passengerBalance > 0, true,  "Passenger did not recieved transfer funds");

});

});
