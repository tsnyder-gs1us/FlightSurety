var HDWalletProvider = require("truffle-hdwallet-provider");
var mnemonic = "";

module.exports = {
  networks: {
    development: {
      // Removed to get Truffle Test to pass for Oracles 
      // provider: function() {
      //   return new HDWalletProvider(mnemonic, "http://127.0.0.1:8545/", 0, 50);
      // },
      host: "127.0.0.1",
      port: 8545,
      network_id: '*',
      gas: 6721975 // 9999999
    }
  },
  compilers: {
    solc: {
      version: "^0.4.24"
    }
  }
};