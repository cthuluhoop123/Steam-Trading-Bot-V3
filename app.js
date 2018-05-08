const config = require('./config.js')
const logOnOptions = {
  accountName: config.username,
  password: config.password,
  identitySecret: config.identitySecret,
  sharedSecret: config.sharedSecret,
  backpacktfToken: config.backpacktfToken,
  backpacktfKey: config.backpacktfKey
}

const tradingbot = require('./structures/tradingBot.js')
let something = new tradingbot(logOnOptions)

something.on("loggedOn", () => {
  console.log("logged on")
  something.startTrading()
})

something.on('debug', console.log)

something.logOn()