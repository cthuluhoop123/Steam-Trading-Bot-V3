class clientEventHandler {
  constructor(tradingBot, steamClient) {
    steamClient.on('loggedOnNoCache', (details, parental) => {
      tradingBot.emit('loggedOnNoCache', details, parental)
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