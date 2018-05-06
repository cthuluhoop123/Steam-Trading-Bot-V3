class something {
  constructor() {
    this.test = 'foo'
  }

  some() {
    let self = this
    return new Promise((resolve, reject) => {
      console.log(this.test)
      setTimeout(this.some.bind(self), 1000)
    })
  }
}

let h = new something()

h.some()