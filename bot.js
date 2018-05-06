const SteamUser = require('steam-user')
const client = new SteamUser()
const SteamCommunity = require('steamcommunity')
const TradeOfferManager = require('steam-tradeoffer-manager')
const SteamTotp = require('steam-totp')
const TeamFortress2 = require('tf2')
const tf2 = new TeamFortress2(client)

const EventEmitter = require('events')

const clientEventHandler = require('./eventHandlers/clientEventHandler.js')

class tradingBot extends EventEmitter {
  constructor(logOnOptions) {
    super()
    this.client = client
    this.community = new SteamCommunity()
    this.logOnOptions = logOnOptions
    this.logOnOptions.twoFactorCode = SteamTotp.generateAuthCode(this.logOnOptions.sharedSecret)
    this.manager = new TradeOfferManager({
      steam: client,
      community: this.community,
      language: 'en'
    })
    this._clientEventHandler = new clientEventHandler(this, this.client)
  }

  _cacheInventory() {
    let self = this
    return new Promise((resolve, reject) => {
      self.manager.getInventoryContents(440, 2, true, (err, inventory) => {
        if (err) return reject(err)
        self._inventory = inventory
        setTimeout(self._cacheInventory.bind(self), 1000*60*30)
        self.emit('debug', 'Cached Inventory')
        return resolve(true)
      })
    })
  }

  evaluateOffer(offer) {
    let receiving = offer.itemsToReceive.map(item => item.market_hash_name)
    let giving = offer.itemsToGive.map(item => item.market_hash_name)
    let receivingValue = receiving.reduce((accumulator, currentValue) => {
      return accumulator + this.prices[currentValue].buy
    })
    let givingValue = giving.reduce((accumulator, currentValue) => {
      return accumulator + this.prices[currentValue].sell
    })
    return Number(receivingValue - givingValue)
  }

  evaluateStock(offer) {
    
  }

  logOn() {
    let self = this
    return new Promise((resolve, reject) => {
      self.client.logOn(self.logOnOptions)
      self.client.on('webSession', (sessionID, cookies) => {
        self.manager.setCookies(cookies, (err) => {
          if (err) {
            return reject(err)
          }
          self._cacheInventory()
          self.emit('debug', "Got API key: " + self.manager.apiKey)
        })
        self.community.setCookies(cookies)
      })
      self.community.on('sessionExpired', () => {
        self.client.webLogOn()
      })
      self.client.loggedOn = true
      return resolve(true)
    })
  }

  get prices() {
    if (require.cache[require.resolve('./prices.json')]) {
      delete require.cache[require.resolve('./prices.json')]
    }
    return require('./prices.json')
  }

  startTrading() {
    let self = this
    return new Promise((resolve, reject) => {
      if (!self.client.loggedOn) return reject('Client must be logged on.')
      self.manager.on('newOffer', async offer => {
        self.evaluateOffer(offer)
      })
      return resolve(true)
    })
  }
}

module.exports = tradingBot