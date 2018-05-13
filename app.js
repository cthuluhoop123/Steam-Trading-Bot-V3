const config = require('./config.js')
const logOnOptions = {
  accountName: config.username,
  password: config.password,
  identitySecret: config.identitySecret,
  sharedSecret: config.sharedSecret,
  backpacktfToken: config.backpacktfToken,
  backpacktfKey: config.backpacktfKey,
  pushBulletToken: config.pushBulletToken,
  pushBulletEmail: config.pushBulletEmail
}

const tradingbot = require('./structures/tradingBot.js')
let something = new tradingbot(logOnOptions)

something.on("loggedOn", () => {
  console.log("logged on")
  something.client.setPersona(1)
  something.startTrading()
})

something.on('debug', console.log)

something.logOn()