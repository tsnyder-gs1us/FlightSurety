/*
 Server Implementation for handling oracles requests and responds
*/

import FlightSuretyApp from '../../build/contracts/FlightSuretyApp.json';
import Config from './config.json';
import Web3 from 'web3';
import express from 'express';
import "babel-polyfill";

// Setup Web 3 Configuration
let config = Config['localhost'];
let web3 = new Web3(new Web3.providers.WebsocketProvider(config.url.replace('http', 'ws')));
web3.eth.defaultAccount = web3.eth.accounts[0];
let flightSuretyApp = new web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);

// Server Data to Track
let oracles = [];
let accounts = [];
let owner = null;

/*
  Oracle Server Flight Return Status
  
  STATUS_CODE_UNKNOWN = 0;
  STATUS_CODE_ON_TIME = 10;
  STATUS_CODE_LATE_AIRLINE = 20;
  STATUS_CODE_LATE_WEATHER = 30;
  STATUS_CODE_LATE_TECHNICAL = 40;
  STATUS_CODE_LATE_OTHER = 50;
  
*/
const statusCodes = [0, 10, 20, 30, 40, 50];

// Oracle Configuration 
const NUMBER_OF_ORACLES = 20;
const ORACLES_START_INDEX = 10;
const accontIndexForOracles = NUMBER_OF_ORACLES + ORACLES_START_INDEX;
const ORACLE_ETH_COST = web3.utils.toWei("1", 'ether');
const ORACLE_ETH_GAS = 4712388;
const RETURN_DEBUG_STATUS = true;

// Randomly Generate Response from Oracle
function generatetFlightStatusCode() {
  const random = Math.floor(Math.random() * statusCodes.length);

  let statusCode = statusCodes[random];

  // For Debugging Override to be STATUS_CODE_LATE_AIRLINE
  if (RETURN_DEBUG_STATUS) {
    statusCode = statusCodes[2];
  }

  console.log(random, statusCode);
  return statusCode
}

// Watch for Oracle Requests from the Smart Control 
// Note Use 'latest' to ensure server only handles new requests
const handleOracleRequests = async () => {

  console.log("Start listening for Oracle Requests");

  flightSuretyApp.events.OracleRequest({
    fromBlock: 'latest'
  }, function (error, event) {

    if (error)  {
      console.log("OracleRequest_error: ")
      console.log(error)
    } else {
      console.log("OracleRequest_event: ")
      console.log(event)
    }

    // Track Request Data
    let index = event.returnValues.index;
    let airline = event.returnValues.airline;
    let flight = event.returnValues.flight;
    let timestamp = event.returnValues.timestamp;

    oracles.forEach( oracle => {
        if (oracle.indexes.includes(index)) {

          // Output Data For Debugging 
          console.log(` index ${index}`);
          console.log(` oracle indexes: ${oracle.indexes}`);
          console.log(` oracles address - ${oracle.address} - returning status.`);

          // Call Smart Contract with status code 
          flightSuretyApp.methods
            .submitOracleResponse(index, airline, flight, timestamp, generatetFlightStatusCode())
            .send({from: oracle.address, "gas": 4712388}, (error, result) => {    
                  if (error) {
                    console.log(`OracleRespone_Error: ${error}`);
                  } else {
                    console.log(`OracleRespone_Result: - ${result}`);
                  }
              });
        }
    });
});
}

// Setup Oracles with the Smart Contract
const setupOracles = async () => {
  oracles.forEach( oracle => {
    registerSmartContractOracle(oracle);
  }); 

  // Ensure Accounts are loaded Before Handling Events
  handleOracleRequests();
};

// Register Oracles with the Smart Contract
const registerSmartContractOracle = async (oracle) => {
  await flightSuretyApp.methods.registerOracle().send({
    from: oracle.address,
    value: ORACLE_ETH_COST,
    gas: ORACLE_ETH_GAS,
  }, async (err, result) => {

      let oracleIndexes = await flightSuretyApp.methods
        .getMyIndexes()
        .call({"from": oracle.address, "gas": 4712388});

      oracle.indexes = oracleIndexes;
      console.log('Oracle address:', oracle.address, 'indexes:', oracle.indexes);
  });
};

// Get Accounts from Local Ganache Blockchain
web3.eth.getAccounts((error, acct) => {
  accounts = acct;
  owner = acct[0];

  for (let i = ORACLES_START_INDEX; i < accontIndexForOracles; i++) {
    let oracle = {
      address: accounts[i],
    };
    oracles.push(oracle);
  }
  
  setupOracles();
});

const app = express();
app.get('/api', (req, res) => {
    res.send({
      message: 'An API for use with your Dapp!'
    })
})

export default app;