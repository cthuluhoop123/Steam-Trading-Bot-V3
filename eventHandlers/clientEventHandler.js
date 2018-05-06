function forwardEvent(event, ...args) {
  this.emit(event, ...args);
}

class clientEventHandler {
  constructor(tradingBot, steamClient) {
    steamClient.on('loggedOn', ...args => forwardEvent.bind(tradingBot, 'loggedOn', ...args))
    steamClient.on('steamGuard', ...args => forwardEvent.bind(tradingBot, 'steamGuard', ...args))
    steamClient.on('error', ...args => forwardEvent.bind(tradingBot, 'error', ...args))
    steamClient.on('webSession', ...args => forwardEvent.bind(tradingBot, 'webSession', ...args))
  }
}

module.exports = clientEventHandler