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
    return new Promise((resolve, reject) => {
      this.manager.getInventoryContents(440, 2, true, (err, inventory) => {
        if (err) return reject(err)
        this._inventory = inventory
        this._cacheInventoryTimeout = setTimeout(this._cacheInventory.bind(this), 1000 * 60 * 30)
        this.emit('debug', 'Cached Inventory')
        return resolve(true)
      })
    })
  }

  acceptOffer(offer) {
    return new Promise((resolve, reject) => {
      offer.accept((err, status) => {
        if (err) {
          return reject(err)
        } else {
          this.community.acceptConfirmationForObject(this.logOnOptions.identitySecret, offer.id, err => {
            if (err) {
              return reject(err)
            }
            return resolve(status)
          })
        }
      })
    })
  }

  evaluateOffer(offer) {
    let receiving = offer.itemsToReceive.map(item => item.market_hash_name)
    let giving = offer.itemsToGive.map(item => item.market_hash_name)
    let receivingValue = receiving.reduce((accumulator, currentValue) => {
      if (this.prices[currentValue]) {
        return accumulator + this.prices[currentValue].buy
      } else {
        return accumulator
      }
    })
    let givingValue = giving.reduce((accumulator, currentValue) => {
      if (this.prices[currentValue]) {
        return accumulator + this.prices[currentValue].sell
      } else {
        return accumulator + 9999
      }
    })
    return Number(receivingValue - givingValue)
  }

  evaluateStock(offer) {
    //falsy if an item is overstocked
    let receiving = offer.itemsToReceive.map(item => item.market_hash_name)
    
    for (let item of receiving) {
      let amountOfItemOffered = receiving.reduce((accumulator, currentValue) => {
        if (currentValue == item) {
          return accumulator + 1
        } else {
          return accumulator
        }
      })
      let amountOfItemInInventory = this._inventory.filter(item => item.market_hash_name == item).length
      if (amountOfItemInInventory + amountOfItemOffered > this.prices[item].stock) {
        return false
      }
    }
    return true
  }

  logOn() {
    return new Promise((resolve, reject) => {
      this.client.logOn(this.logOnOptions)
      this.client.on('webSession', (sessionID, cookies) => {
        this.community.setCookies(cookies)

        this.community.on('sessionExpired', () => {
          this.client.webLogOn()
        })
        
        this.manager.setCookies(cookies, (err) => {
          if (err) {
            return reject(err)
          }
          this._cacheInventory()
          this.emit('debug', 'Got API key: ' + this.manager.apiKey)
          this.client.loggedOn = true
          return resolve(true)
        })
      })
    })
  }

  get prices() {
    if (require.cache[require.resolve('./prices.json')]) {
      delete require.cache[require.resolve('./prices.json')]
    }
    return require('./prices.json')
  }

  startTrading() {
    if (!this.client.loggedOn) return console.log('Client must be logged on.')
    this.manager.on('newOffer', async offer => {
      this.evaluateOffer(offer)
    })
    this.emit('debug', 'Started Trading')
  }

  stopTrading() {
    this.manager.removeListener('newOffer', async offer => {
      this.evaluateOffer(offer)
    })
    this.emit('debug', 'Stopped Trading')
  }
}

module.exports = tradingBot