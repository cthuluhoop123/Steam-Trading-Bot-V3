const PushBullet = require('pushbullet')

class pushBullet {
  constructor(apiKey, email) {
    this.pusher = new PushBullet(apiKey)
    this.email = email
  }

  note(title, text) {
    return new Promise((resolve, reject) => {
      this.pusher.note(this.email, title, text, (error, response) => {
        if (error) return reject(error)
        resolve(response)
      }) 
    })
  }
}

module.exports = pushBullet

