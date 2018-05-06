class communityEventHandler {
  constructor(tradingBot, community) {
    community.on('sessionExpired', () => {
      tradingBot.emit('sessionExpired')
    })
  }
}

module.exports = communityEventHandler