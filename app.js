const config = require('./config.js')
const logOnOptions = {
  accountName: config.username,
  password: config.password,
  identitySecret: config.identitySecret,
  sharedSecret: config.sharedSecret
}

const tradingbot = require('./bot.js')
let something = new tradingbot(logOnOptions)

something.on("loggedOn", () => {
  console.log("logged on")
})

something.on('debug', console.log)

something.logOn()