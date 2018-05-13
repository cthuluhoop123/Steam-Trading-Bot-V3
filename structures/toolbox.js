const fs = require('fs')
const toolbox = module.exports

toolbox.savePrices = function (pricesObj) {
  fs.writeFileSync('./prices.json', JSON.stringify(pricesObj))
}