const SteamUser = require('steam-user')
const client = new SteamUser()
const SteamCommunity = require('steamcommunity')
const TradeOfferManager = require('steam-tradeoffer-manager')
const SteamTotp = require('steam-totp')
const TeamFortress2 = require('tf2')
const tf2 = new TeamFortress2(client)

const EventEmitter = require('events')

const backpack = require('./backpack.js')
const clientEventHandler = require('../eventHandlers/clientEventHandler.js')
const toolbox = require('./toolbox.js')

class tradingBot extends EventEmitter {
  constructor(logOnOptions) {
    super()
    this.logOnOptions = logOnOptions

    this.backpack = new backpack(this, this.logOnOptions.backpacktfToken, this.logOnOptions.backpacktfKey)
    this.client = client
    this.community = new SteamCommunity()
    this.logOnOptions.twoFactorCode = SteamTotp.generateAuthCode(this.logOnOptions.sharedSecret)
    this.manager = new TradeOfferManager({
      steam: client,
      community: this.community,
      language: 'en'
    })
    this.toolbox = toolbox
    this._clientEventHandler = new clientEventHandler(this, this.client)
  }

  _craftable(item) {
    let descriptionLength = item.descriptions.length;
    for (let i = 0; i < descriptionLength; i++) {
      if (item.descriptions[i].value === "( Not Usable in Crafting )") {
        return false
      }
    }
    return true
  }

  _startTradingCallback(offer) {
    this.processOffer(offer)
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
            return resolve(true)
          })
        }
      })
    })
  }

  declineOffer(offer, reason) {
    return new Promise((resolve, reject) => {
      offer.decline(err => {
        if (err) {
          return reject(err)
        } else {
          return resolve(true)
        }
      })
    })
  }

  evaluateOfferProfit(offer) {
    let receivingFull = offer.itemsToReceive
    let givingFull = offer.itemsToGive
    let receiving = offer.itemsToReceive.map(item => item.market_hash_name)
    let giving = offer.itemsToGive.map(item => item.market_hash_name)
    let receivingValue = receiving.reduce((accumulator, currentValue, i) => {
      if (this.prices[currentValue] && this.prices[currentValue].craftable == this._craftable(receivingFull[i])) {
        return accumulator + this.prices[currentValue].buy
      } else {
        return accumulator
      }
    })
    let givingValue = giving.reduce((accumulator, currentValue, i) => {
      if (this.prices[currentValue] && this.prices[currentValue].craftable == this._craftable(givingFull[i])) {
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
      this.client.loggedOn = true
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
          return resolve(true)
        })
      })
    })
  }

  processOffer(offer) {
    this.emit('debug', 'Processing trade offer')
    if (this.evaluateOfferProfit(offer) > 0) {
      this.emit('debug', 'Trade offer gives a profit of more than 0')
      if (this.evaluateStock(offer)) {
        this.emit('debug', 'No receiving items is not overstocked. Attempting to accept offer')
        this.acceptOffer(offer)
          .then(() => {
            offer.getReceivedItems((err, items) => {
              this.emit('debug', 'Accepted trade offer')
              //should do error handling here.
              for (let item of items) {
                if (this.prices[item.market_hash_name]) {
                  if (!this.prices[item.market_hash_name].isCurrency) {
                    this.backpack.loadBptfInventory()
                      .then(() => {
                        this.emit('debug', 'Attempting to list the item')
                        this.backpack.createSellListing(item.id, this.prices[item.market_hash_name].sell)
                      })
                  }
                }
              }
            })
          })
          .catch(err => {
            this.emit('debug', err)
          })
      } else {
        this.declineOffer(offer)
        this.emit('debug', 'Rejected due to overstock.')
      }
    } else {
      this.declineOffer(offer)
      this.emit('debug', 'Rejected because trader didnt offer enough or took an item bot wasnt selling.')
    }
  }

  get prices() {
    if (require.cache[require.resolve('../prices.json')]) {
      delete require.cache[require.resolve('../prices.json')]
    }
    return require('../prices.json')
  }

  startTrading() {
    if (!this.client.loggedOn) {
      console.log('Client must be logged on.')
      return
    }
    this.manager.on('newOffer', this._startTradingCallback.bind(this))
    this.emit('debug', 'Started Trading')
    this.backpack.startHeartbeat()
    this.emit('debug', 'Started sending heartbeats to bptf')
    this.backpack.startAutobump()
    this.emit('debug', 'Started bptf auto bump')
    this.undercutBptf()
    this._undercutTimeout = setTimeout(this.undercutBptf.bind(this), 1000 * 60 * 15)
    this.emit('debug', 'Started bptf undercutting')
  }

  stopTrading() {
    this.manager.removeListener('newOffer', this._startTradingCallback)
    this.emit('debug', 'Stopped Trading')
    clearTimeout(this._undercutTimeout)
    this.emit('debug', 'Stopped auto undercutting')
    clearTimeout(this._cacheInventoryTimeout)
    this.emit('debug', 'Stopped auto inventory cache')
  }

  undercutBptf() {
    this.emit('debug', 'Attempting to undercut.')
    this.backpack.getMyListings()
      .then(async listings => {
        let currentPricesDB = this.prices
        for (let listing of listings.listings) {
          // this.backpack.getItemListings(listing.item.name, listing.item.quality)
          //   .then(listings => {
          //     let automaticBuyListings = listings.buy.filter(listing => listing.automatic == 1).map(listing => listing.currencies.metal)
          //     let automaticSellListings = listings.sell.filter(listing => listing.automatic == 1).map(listing => listing.currencies.metal)
          //     //undercutting starts here. ideally, undercut to sell for a scrap higher than lowest buyer
          //     let currentPricesDB = this.prices
          //     if (automaticBuyListings[0] < automaticSellListings[0]) {
          //       if (this.backpack.refToScrap(automaticBuyListings[0]) < this.prices[listing.item.name].buy) {
          //         currentPricesDB[listing.item.name].buy = this.backpack.refToScrap(automaticBuyListings[0])
          //       }
          //       if (this.backpack.refToScrap(automaticSellListings) > this.prices[listing.item.name].sell) {
          //         currentPricesDB[listing.item.name].buy = this.backpack.refToScrap(automaticBuyListings[0])
          //       }
          //       this.toolbox.savePrices(currentPricesDB)
          //     }
          //   })
          let listings = await this.backpack.getItemListings(listing.item.name, listing.item.quality)
          let automaticBuyListings = listings.buy.filter(listing => listing.automatic == 1).map(listing => listing.currencies.metal)
          console.log(automaticBuyListings)
          let automaticSellListings = listings.sell.filter(listing => listing.automatic == 1).map(listing => listing.currencies.metal)
          console.log(automaticSellListings)
          //undercutting starts here. ideally, undercut to sell for a scrap higher than lowest buyer
          if (automaticBuyListings[0] < automaticSellListings[0]) {
            if (this.backpack.refToScrap(automaticBuyListings[0]) < this.prices[listing.item.name].buy) {
              currentPricesDB[listing.item.name].buy = this.backpack.refToScrap(automaticBuyListings[0])
            }
            if (this.backpack.refToScrap(automaticSellListings[0]) > this.prices[listing.item.name].sell) {
              currentPricesDB[listing.item.name].sell = this.backpack.refToScrap(automaticSellListings[0])
            }
          }
        }
        this.toolbox.savePrices(currentPricesDB)
      })
  }
}

module.exports = tradingBot