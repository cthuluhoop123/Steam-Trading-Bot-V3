const request = require('superagent')

function buildRoute(baseURL, apiToken, apiKey) {
  let handler = {
    get: function (me, prop) {
      if (prop == 'get') {
        return function (param) {
          return new Promise((resolve, reject) => {
            let route = me.route.join('/')
            me.route = []
            request
              .get(baseURL + route)
              .query(Object.assign(param, {
                token: me.token,
                key: me.key
              }))
              .end((err, res) => {
                if (err) {
                  return reject(err)
                } else {
                  return resolve(res)
                }
              })
          })
        }
      }
      if (prop == 'post') {
        return function (param) {
          return new Promise((resolve, reject) => {
            let route = me.route.join('/')
            me.route = []
            request
              .post(baseURL + route)
              .send(Object.assign(param, { 
                token: me.token,
                key: me.key 
              }))
              .end((err, res) => {
                if (err) {
                  return reject(err)
                } else {
                  return resolve(res)
                }
              })
          })
        }
      }
      let obj2 = Object.assign(me, { route: [...me.route, prop] })
      return new Proxy(obj2, handler)
    }
  }
  return new Proxy({ route: [], token: apiToken, key: apiKey }, handler)
}

module.exports = buildRoute