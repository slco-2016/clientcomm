

// DEPENDENCIES
const db = require('../app/db');
const assert = require('chai').assert;
const creds = require('../credentials');


module.exports = {

  createOrganization(req, cb) {
    req.post('/orgs')
      .field('name', 'Example Organization')
      .field('phone', '18008008000')
      .field('email', 'fooorg@foo.com')
      .field('expiration', '2020-01-01')
      .field('allotment', '10000')
      .expect(302, cb);
  },

  createSupervisor(req, cb) {
    req.post('/orgs/1')
      .field('orgid', '1')
      .field('first', 'Jim')
      .field('middle', 'M')
      .field('last', 'Surie')
      .field('email', 'jim@foo.com')
      .field('password', '123')
      .field('position', 'Supervisor')
      .field('department', 'Pretrial')
      .field('admin', 'true')
      .expect(302, cb);
  },

  testuserLogin(req, cb) {
    req.post('/login')
      .field('email', 'jim@foo.com')
      .field('pass', '123')
      .expect(302, cb);
  },

  logout(req, cb) {
    req.get('/logout')
        .expect(302, cb);
  },

};
