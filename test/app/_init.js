var config = require('../../knexfile');
var knex = require("knex")(config['testing']);

require("colors")
// process.on('warning', e => console.warn(e.stack));

before(function(done) {
  this.timeout(6000)
  knex.seed.run().then(() => done()).catch((err) => {
    done(err)
  })
})