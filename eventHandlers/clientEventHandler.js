class clientEventHandler {
  constructor(tradingBot, steamClient) {
    steamClient.on('loggedOn', (details, parental) => {
      tradingBot.emit('loggedOn', details, parental)
    })
    steamClient.on('steamGuard', (domain, callback, lastCodeWrong) => {
      tradingBot.emit('steamGuard', domain, callback, lastCodeWrong)
    })
    steamClient.on('error', error => {
      tradingBot.emit('error', error)
    })
    steamClient.on('webSession', (sessionID, cookies) => {
      tradingBot.emit('webSession', sessionID, cookies)
    })
  }
}

module.exports = clientEventHandler