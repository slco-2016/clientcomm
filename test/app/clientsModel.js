const assert = require('assert');
const Clients = require('../../app/models/clients');
const CommConns = require('../../app/models/commConns');
const should = require('should');
require('colors');

let phoneId;
const phone = '12345678906';
describe('Clients model', () => {
  it('Should be able to create client', (done) => {
    Clients.create(2, 'Joe', 'F', 'Someone', '1988-04-02', 12321, 1234567)
    .then((client) => {
      client.cm.should.be.exactly(2);
      client.first.should.be.exactly('Joe');
      done();
    }).catch(done);
  });

  it(`Should not find clients with the same name when there aren't any`, (done) => {
    Clients.findOneByAttribute('last', 'Someone')
      .then(client => Clients.findBySameName(client))
      .then(clients => {
        clients.length.should.be.exactly(1);
        done();
      }).catch(done);
  });

  it('Should find a client with the same name when there is one', (done) => {
    Clients.create(2, 'Joe', 'P', 'Someone', '1988-05-02', 12421, 1234561)
      .then(client => Clients.findBySameName(client))
      .then(clients => {
        clients.length.should.be.exactly(2);
        done();
      }).catch(done);
  });

  it('clients should be able to be found by attribute type, single query', (done) => {
    Clients.findOneByAttribute('clid', 1, baseDbCall => baseDbCall.where('active', true))
    .then((client) => {
      client.clid.should.be.exactly(1);
      done();
    }).catch(done);
  });

  it('with findOneByAttribute, should return null if none found', (done) => {
    Clients.findOneByAttribute('clid', 99999999, baseDbCall => baseDbCall.where('active', true))
    .then((client) => {
      should(client).not.be.ok();
      done();
    }).catch(done);
  });

  it('clients should be able to be found by attribute type, multi query', (done) => {
    Clients.findManyByAttribute('cm', 2, baseDbCall => baseDbCall.where('active', true))
    .then((clients) => {
      clients.length.should.be.greaterThan(0);
      done();
    }).catch(done);
  });

  it('with find by many attr multi query, array even if no results, just length 0', (done) => {
    Clients.findManyByAttribute('cm', 9999, baseDbCall => baseDbCall.where('active', true))
    .then((clients) => {
      clients.length.should.be.exactly(0);
      done();
    }).catch(done);
  });

  it('Should be able to find clients by the commid created', (done) => {
    Clients.findByCommId(1)
    .then((clients) => {
      CommConns.findManyByAttribute('comm', 1, dbCall => dbCall
          .andWhere('retired', null))
      .then((commConns) => {
        clients.length.should.be.exactly(commConns.length);
        done();
      }).catch(done);
    }).catch(done);
  });

  it('finds active clients in a department', (done) => {
    Clients.findManyByDepartmentAndStatus(1, true)
    .then((clients) => {
      // TODO: there are three active clients in department one in the seed
      // data plus the two added in the test above, and two added in tests
      // run prior to this one.
      clients.length.should.be.exactly(7);
      done();
    }).catch(done);
  });

  it('finds archived clients in a department', (done) => {
    Clients.findManyByDepartmentAndStatus(1, false)
    .then((clients) => {
      // there is one archived client in department one in the seed data
      clients.length.should.be.exactly(1);
      done();
    }).catch(done);
  });

  it('Should be able to update client from BaseModel method', (done) => {
    Clients.findById(1)
    .then(client => client.update({ first: 'joe' })).then((client) => {
      should.equal(client.first, 'joe');
      done();
    }).catch(done);
  });

  it('Should be able to find clients by organization ID for org 2', (done) => {
    // only test org 2, which has 1 client, and isn't messed with by other tests
    Clients.findByOrg(2, true)
    .then((clients) => {
      clients.length.should.be.exactly(1);
      done();
    }).catch(done);
  });

  it('does not return active clients when status = false', (done) => {
    Clients.findByOrg(2, false)
    .then((clients) => {
      clients.length.should.be.exactly(0);
      done();
    }).catch(done);
  });
});
