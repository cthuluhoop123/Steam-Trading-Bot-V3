const apiRouter = require('../rest/apiRouter.js')
const request = require('superagent')

class backpack {
  constructor(tradingBot, apiToken, apiKey) {
    this.api = apiRouter('https://backpack.tf/api/', apiToken, apiKey)
    this.tradingBot = tradingBot
  }

  bumpListings() {
    return new Promise((resolve, reject) => {
      this.getMyListings()
        .then(listings => {
          let sellListings = listings.listings.filter(listing => listing.intent == 1)
          let buyListings = listings.listings.filter(listing => listing.intent == 0)
          let listingsArray = []
          for (let listing of sellListings) {
            let newPrice = this.scrapToRef(this.tradingBot.prices[listing.item.name].sell)
            listingsArray.push({
              "intent": '1',
              "id": listing.item.id,
              "currencies": { metal: newPrice },
              "details": listing.details
            })
          }
          for (let listing of buyListings) {
            let newPrice = this.scrapToRef(this.tradingBot.prices[listing.item.name].buy)
            listingsArray.push({
              "intent": '0',
              "item": {
                "quality": listing.item.quality,
                "item_name": listing.item.defindex
              },
              "currencies": { metal: newPrice },
              "details": listing.details
            })
          }
          this.api.classifieds.list.v1.post({
            listings: listingsArray
          })
            .then(res => {
              this.tradingBot.emit('debug', 'Bumped all listings and updated prices.')
              return resolve(res)
            })
        })
        .catch(err => {
          return reject(err)
        })
    })
  }

  createBuyListing(listing) {
    return new Promise((resolve, reject) => {
      this.api.classifieds.list.v1.post({
        listings: [
          {
            "intent": '0',
            "item": {
              "quality": listing.item.quality,
              "item_name": listing.item.defindex
            },
            "currencies": listing.currencies,
            "details": listing.details
          }
        ]
      })
    })
  }

  createSellListing(id, price, details = '⚡27/7 AUTO ACCEPTING!⚡') {
    return new Promise((resolve, reject) => {
      this.api.classifieds.list.v1.post({
        listings: [
          {
            "intent": '1',
            "id": id,
            "currencies": {
              "metal": price
            },
            "details": details
          }
        ]
      })
        .then(res => {
          return resolve(res.body)
        })
        .catch(err => {
          return reject(err)
        })
    })
  }

  getItemListings(enforceRateLimit, item, quality) {
    return new Promise((resolve, reject) => {
      this.api.classifieds.search.v1.get({
        item_names: true,
        fold: 0,
        item: item,
        quality: quality
      })
        .then(res => {
          if (!enforceRateLimit) {
            return resolve({
              buy: res.body.buy.listings,
              sell: res.body.sell.listings
            })
          } else {
            setTimeout(() => {
              return resolve({
                buy: res.body.buy.listings,
                sell: res.body.sell.listings
              })
            }, 1000 * 10)
          }
        })
        .catch(err => {
          return reject(err)
        })
    })
  }

  getMyListings() {
    return new Promise((resolve, reject) => {
      this.api.classifieds.listings.v1.get({ item_names: true })
        .then(res => {
          return resolve(res.body)
        })
        .catch(err => {
          return reject(err)
        })
    })
  }

  loadBptfInventory() {
    return new Promise((resolve, reject) => {
      request
        .get('https://backpack.tf/profiles/76561198364117183')
        .end((err, res) => {
          if (err) {
            return reject(err)
          }
          return resolve(res.body)
        })
    })
  }

  refToScrap(ref) {
    return Math.floor(Number(ref) / 0.1110943396226415)
  }

  scrapToRef(scrap) {
    return (Math.floor(Number(scrap) / 9 * 100) / 100)
  }

  sendHeartbeat() {
    return new Promise((resolve, reject) => {
      this.api.aux.heartbeat.v1.post({ automatic: 'all' })
        .then(res => {
          return resolve(res.body)
        })
        .catch(err => {
          return reject(err)
        })
    })
  }

  startAutobump() {
    this.bumpListings()
      .then(() => {
        setTimeout(this.bumpListings.bind(this), 1000 * 60 * 31)
      })
  }

  startHeartbeat() {
    this.sendHeartbeat()
    setTimeout(this.sendHeartbeat.bind(this), 1000 * 91)
  }
}

module.exports = backpack