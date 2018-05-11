const SteamUser = require('steam-user')
const SteamID = require('steamid')
const client = new SteamUser()
const SteamCommunity = require('steamcommunity')
const TradeOfferManager = require('steam-tradeoffer-manager')
const SteamTotp = require('steam-totp')
const TeamFortress2 = require('tf2')
const tf2 = new TeamFortress2(client)

const EventEmitter = require('events')

const backpack = require('./backpack.js')
const clientEventHandler = require('../eventHandlers/clientEventHandler.js')
const PushBullet = require('./pushbullet.js')
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
    this.pushBullet = new PushBullet(this.logOnOptions.pushBulletToken, this.logOnOptions.pushBulletEmail)
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
    if (!this._inventory) {
      this.emit('debug', 'No inventory cache. Caching...')
      this.once('cachedInventory', () => {
        this.processOffer(offer)
      })
      return
    }
    this.processOffer(offer)
  }
  _cacheInventory() {
    return new Promise((resolve, reject) => {
      this.manager.getInventoryContents(440, 2, true, (err, inventory) => {
        if (err) return reject(err)
        this._inventory = inventory
        this._cacheInventoryTimeout = setTimeout(this._cacheInventory.bind(this), 1000 * 60 * 10)
        this.emit('debug', 'Cached Inventory')
        this.emit('cachedInventory')
        return resolve(true)
      })
    })
  }

  acceptOffer(offer) {
    return new Promise((resolve, reject) => {
      offer.accept((err, status) => {
        if (err) {
          if (err.message == 'Not Logged In') {
            this.once('managerCookies', () => {
              this.acceptOffer(offer)
            })
            return
          }
          return reject(err)
        }
        this.manager.once('receivedOfferChanged', (offer, oldState) => {
          if (offer.state == 3) {
            pushBullet.note('Trade Offer Accepted:', `Giving: \n${offer.itemsToGive.map(item => item.market_hash_name).join('\n')} \nReceiving: \n${offer.itemsToReceive.map(item => item.market_hash_name).join('\n')}`)
            offer.getReceivedItems((err, items) => {
              this.emit('debug', 'Accepted trade offer')
              this.emit('debug', 'Updating inventory cache')
              this.backpack.loadBptfInventory()
                .then(() => {
                  this.emit('debug', 'Loaded BPTF inventory')
                  for (let item of items) {
                    if (this.prices[item.market_hash_name]) {
                      if (!this.prices[item.market_hash_name].isCurrency) {
                        this.emit('debug', 'Attempting to list the item')
                        this.backpack.createSellListing(item.id, this.backpack.scrapToRef(this.prices[item.market_hash_name].sell))
                          .then(res => {
                            if (res.listings[item.id].created == 1) {
                              this.emit('debug', 'Created Listing')
                            } else {
                              this.emit('debug', 'Error creating listing')
                            }
                          })
                          .catch(err => {
                            this.emit('debug', err)
                          })
                      }
                    }
                  }
                })
                .catch(err => {
                  this.emit('debug', 'Error loading my bptf Inventory...')
                  this.emit('debug', err)
                })
              //should do error handling here.
            })
            return resolve(true)
          }
        })
        this.community.acceptConfirmationForObject(this.logOnOptions.identitySecret, offer.id, err => {
          if (err) {
            return reject(err)
          }
        })
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
    let receivingValue = 0
    let givingValue = 0
    if (receiving.length == 1) {
      receivingValue = (this.prices[receiving[0]] && this.prices[receiving[0]].craftable == this._craftable(receivingFull[0]))
        ? this.prices[receiving[0]].buy
        : 0
    } else {
      receivingValue = receiving.reduce((accumulator, currentValue, i) => {
        if (this.prices[currentValue] && this.prices[currentValue].craftable == this._craftable(receivingFull[i])) {
          return accumulator + this.prices[currentValue].buy
        } else {
          return accumulator
        }
      }, 0)
    }
    if (giving.length == 1) {
      givingValue = (this.prices[giving[0]] && this.prices[giving[0]].craftable == this._craftable(givingFull[0]))
        ? this.prices[giving[0]].sell
        : 0
    } else {
      givingValue = giving.reduce((accumulator, currentValue, i) => {
        if (this.prices[currentValue] && this.prices[currentValue].craftable == this._craftable(givingFull[i])) {
          return accumulator + this.prices[currentValue].sell
        } else {
          return accumulator + 9999
        }
      }, 0)
    }
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
      this.manager.on('newOffer', this._startTradingCallback.bind(this))
      this.client.logOn(this.logOnOptions)
      this.client.loggedOn = true
      this.client.on('webSession', (sessionID, cookies) => {
        let sid = SteamID.fromIndividualAccountID(this.client.steamID.accountid)
        this.client.steamID64 = sid.getSteamID64()
        this.community.setCookies(cookies)

        this.community.on('sessionExpired', () => {
          this.emit('debug', 'web session expired')
          this.client.webLogOn()
        })

        this.manager.setCookies(cookies, (err) => {
          if (err) {
            return reject(err)
          }
          this.emit('managerCookies')
          this._cacheInventory()
            .then(() => {
              this.emit("loggedOn")
            })
            .catch((err) => {
              this.emit('debug', 'Error Caching Inventory...')
              this.emit('debug', err)
            })
          this.emit('debug', 'Got API key: ' + this.manager.apiKey)
          return resolve(true)
        })
      })
    })
  }

  processOffer(offer) {
    this.emit('debug', 'Processing trade offer')
    if (this.evaluateOfferProfit(offer) >= 0) {
      this.emit('debug', 'Trade offer gives a profit of more than 0')
      if (this.evaluateStock(offer)) {
        this.emit('debug', 'No receiving items is not overstocked. Attempting to accept offer')
        this.acceptOffer(offer)
          .catch(err => {
            if (err.message == "Not Logged In") {
              this.once('managerCookies', () => {
                this.processOffer(offer)
                return
              })
            }
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
    this.emit('debug', 'Started Trading')
    this.backpack.startHeartbeat()
    this.emit('debug', 'Started sending heartbeats to bptf')
    this.backpack.startAutobump()
    this.emit('debug', 'Started bptf auto bump')
    this.undercutBptf()
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
    this.backpack.getMyListings(0)
      .then(async listings => {
        let currentPricesDB = this.prices
        let noDupllicateListings = listings.listings.filter((obj, pos, arr) => {
          return arr.map(mapObj => mapObj.item.name).indexOf(obj.item.name) === pos
        })
        for (let listing of noDupllicateListings) {
          let listings = await this.backpack.getItemListings(true, listing.item.name.replace(/The /g, ''), listing.item.quality)
          let automaticBuyListings = listings.buy.filter(newListing => newListing.automatic == 1 && newListing.steamid != this.client.steamID64 && newListing.item.name == listing.item.name).map(listing => listing.currencies.metal)
          let automaticSellListings = listings.sell.filter(newListing => newListing.automatic == 1 && newListing.steamid != this.client.steamID64 && newListing.item.name == listing.item.name).map(listing => listing.currencies.metal)
          automaticBuyListings.sort(function (a, b) { return b - a })
          automaticSellListings.sort(function (a, b) { return a - b })
          //undercutting starts here. ideally, undercut to sell for a scrap higher than lowest buyer
          if (automaticBuyListings[0] <= automaticSellListings[0]) {
            if (this.backpack.refToScrap(automaticBuyListings[0]) != this.prices[listing.item.name].buy) {
              if (!currentPricesDB[listing.item.name]) continue
              currentPricesDB[listing.item.name].buy = this.backpack.refToScrap(automaticBuyListings[0])
              this.emit('debug', `Set the BUY price of ${listing.item.name} to ${automaticBuyListings[0]} ref/${this.backpack.refToScrap(automaticBuyListings[0])} scrap`)
            }
            if (this.backpack.refToScrap(automaticSellListings[0]) != this.prices[listing.item.name].sell) {
              if (!currentPricesDB[listing.item.name]) continue
              currentPricesDB[listing.item.name].sell = this.backpack.refToScrap(automaticSellListings[0])
              this.emit('debug', `Set the SELL price of ${listing.item.name} to ${automaticSellListings[0]} ref/${this.backpack.refToScrap(automaticSellListings[0])} scrap`)
            }
          }
        }
        this.toolbox.savePrices(currentPricesDB)
        this._undercutTimeout = setTimeout(this.undercutBptf.bind(this), 1000 * 60 * 15)
      })
      .catch(err => {
        this.emit('debug', 'Error getting my bptf listings')
        this.emit(err)
      })
  }
}

module.exports = tradingBot
