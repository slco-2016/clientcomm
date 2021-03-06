

// Libraries
const db = require('../../app/db');
const Promise = require('bluebird');
const BaseModel = require('../lib/models').BaseModel;

class Conversations extends BaseModel {

  constructor(data) {
    super({
      data,
      columns: [
        'convid',
        'cm',
        'client',
        'subject',
        'open',
        'accepted',
        'updated',
        'created',
      ],
    });
  }

  static closeAll(cmid, clid) {
    return new Promise((fulfill, reject) => {
      db('convos')
        .where('client', clid)
        .andWhere('cm', cmid)
        .andWhere('convos.open', true)
        .pluck('convid')
        .then((convos) => {
          db('convos').whereIn('convid', convos)
            .update({
              open: false,
            }).then((success) => {
              fulfill(success);
            })
            .catch(reject);
        })
        .catch(reject);
    });
  }

  static closeAllBetweenClientAndUser(userID, clientID) {
    return new Promise((fulfill, reject) => {
      db('convos')
        .where('client', clientID)
        .andWhere('cm', userID)
        .andWhere('open', true)
        .update({ open: false })
      .then(() => {
        fulfill();
      }).catch(reject);
    });
  }

  static closeAllCapturedWithCertainCommunication(communication) {
    const value = communication.value;
    return new Promise((fulfill, reject) => {
      Conversations.findByCommunicationValue(value)
      .then((conversations) => {
        conversations = conversations.filter((conversation) => {
          const notAccepted = conversation.accepted === false;
          const stillOpen = conversation.open === true;
          return stillOpen && notAccepted;
        });
        const conversationIds = conversations.map(conversation => conversation.convid);

        return db('convos')
          .whereIn('convid', conversationIds)
          .update({
            accepted: false,
            open: false,
          })
          .returning('*');
      }).then((conversations) => {
        this._getMultiResponse(conversations, fulfill);
      }).catch(reject);
    });
  }

  static closeAllWithClient(clientId) {
    return new Promise((fulfill, reject) => {
      db('convos')
        .where('client', clientId)
        .update({ open: false })
      .then(() => {
        fulfill();
      }).catch(reject);
    });
  }

  static closeAllWithClientExcept(clientId, conversationId) {
    return new Promise((fulfill, reject) => {
      db('convos')
        .where('client', clientId)
        .andWhere('open', true)
        .and.whereNot('convid', conversationId)
        .update({ open: false })
      .then(() => {
        fulfill();
      }).catch(reject);
    });
  }

  static create(userId, clientId, subject, open) {
    if (typeof subject === 'undefined') {
      subject = 'Automatically created conversation';
    }
    if (typeof open === 'undefined') {
      open = true;
    }
    return new Promise((fulfill, reject) => {
      Conversations.closeAllBetweenClientAndUser(userId, clientId)
      .then(() => db('convos')
          .insert({
            cm: userId,
            client: clientId,
            subject,
            open,
            accepted: true,
          })
          .returning('*')).then((conversations) => {
            this._getSingleResponse(conversations, fulfill);
          }).catch(reject);
    });
  }

  static createOrAttachToExistingCaptureBoardConversation(communication) {
    const commId = communication.commid;
    return new Promise((fulfill, reject) => {
      db('convos')
        .join('msgs', 'msgs.convo', 'convos.convid')
        .where('convos.cm', null)
        .andWhere('convos.client', null)
        .andWhere('convos.open', true)
        .andWhere('convos.accepted', false)
        .andWhere('msgs.comm', commId)
      .then((conversations) => {
        if (conversations.length) {
          const conversationIds = conversations.map(conversation => conversation.convid);
          return db('convos')
            .whereIn('convid', conversationIds);
        }
        return db('convos')
            .insert({
              cm: null,
              client: null,
              subject: 'New Conversation Originally From Unknown Contact',
              open: true,
              accepted: false,
            })
            .returning('*');
      }).then((conversations) => {
        this._getMultiResponse(conversations, fulfill);
      }).catch(reject);
    });
  }

  static createNewIfOlderThanSetHours(conversations, hourThreshold) {
    if (!hourThreshold || isNaN(hourThreshold)) {
      hourThreshold = 24; // default to 1 day threshold
    }

    return new Promise((fulfill, reject) => {
      if (conversations.length) {
        return new Promise((fulfill, reject) => {
          fulfill(conversations);
        }).map((conversation) => {
          const d1 = new Date().getTime();
          const d2 = new Date(conversation.updated).getTime();
          const timeLapsed = Math.round((d2 - d1) / (3600 * 1000)); // in hours
          const recentlyActive = timeLapsed < Number(hourThreshold); // active conversations are less than a day olf

          if (recentlyActive) {
            fulfill([conversation]);
          } else {
            const userId = conversation.cm;
            const clientId = conversation.client;
            const subject = 'Automatically created';
            const open = true;
            return Conversations.create(userId, clientId, subject, open);
          }
        }).then((conversations) => {
          fulfill(conversations);
        });
      }
      fulfill([]);
    });
  }

  static createNewNotAcceptedConversationsForAllClients(clients) {
    return new Promise((fulfill, reject) => {
      if (clients.length) {
        const insertList = [];
        clients.forEach((client) => {
          insertList.push({
            cm: client.cm,
            client: client.clid,
            subject: 'Automatically created',
            open: true,
            accepted: false,
          });
        });

        db('convos')
          .insert(insertList)
          .returning('*')
        .then((conversations) => {
          this._getMultiResponse(conversations, fulfill);
        }).catch(reject);
      } else {
        fulfill([]);
      }
    });
  }

  static findByCommunicationValue(communicationValue) {
    return new Promise((fulfill, reject) => {
      const Communications = require('./communications');
      Communications.findByValue(communicationValue)
      .then((communication) => {
        if (communication) {
          const communicationId = communication.commid;
          return db('convos')
            .join('msgs', 'msgs.convo', 'convos.convid')
            .where('msgs.comm', communicationId);
        }
        fulfill([]);
      }).then((conversations) => {
        const conversationIds = conversations.map(conversationId => conversationId.convid);
        return db('convos')
          .whereIn('convid', conversationIds)
          .andWhere('open', true);
      }).then((conversations) => {
        this._getMultiResponse(conversations, fulfill);
      }).catch(reject);
    });
  }

  static findByIdsIncludeMessages(conversationIds) {
    if (!Array.isArray(conversationIds)) conversationIds = [conversationIds,];
    return new Promise((fulfill, reject) => {
      let conversations;
      db('convos')
        .whereIn('convid', conversationIds)
      .then((convos) => {
        conversations = convos;

        // Did this because can't require Messages b/c Messages requires Conversations...
        return db('msgs')
          .select('msgs.*',
                  'sentiment.sentiment',
                  'commconns.client',
                  'commconns.name as commconn_name',
                  'comms.value as comm_value',
                  'comms.type as comm_type')
          .leftJoin('comms', 'comms.commid', 'msgs.comm')
          .leftJoin('convos', 'convos.convid', 'msgs.convo')
          .leftJoin('commconns', function () {
            this
                .on('commconns.comm', 'msgs.comm')
                .andOn('commconns.client', 'convos.client');
          })
          .leftJoin('ibm_sentiment_analysis as sentiment', 'sentiment.tw_sid', 'msgs.tw_sid')
          .whereIn('convo', conversationIds)
          .orderBy('created', 'asc');
      }).then((messages) => {
        conversations = conversations.map((conversation) => {
          conversation.messages = [];
          messages.forEach((message) => {
            if (message.convo == conversation.convid) {
              conversation.messages.push(message);
            }
          });
          return conversation;
        });

        fulfill(conversations);
      }).catch(reject);
    });
  }

  static findByClientAndUserInvolvingSpecificComm(clients, communication) {
    // clients is an array of client objects
    // communication is an object representing a single communication row
    const clientIds = clients.map(client => client.clid);
    const userIds = clients.map(client => client.cm);
    const commId = communication.commid;
    let conversations;

    return new Promise((fulfill, reject) => {
      db('convos')
        .whereIn('client', clientIds)
        .and.whereIn('cm', userIds)
        .andWhere('open', true)
      .then((resp) => {
        conversations = resp;
        // We need to remove situations where a client was communication
        // not with their current case manager
        conversations = conversations.filter((conversation) => {
          // Find the related client
          const clientsThatAreInThisConversation = clients.filter(client => client.clid == conversation.client);
          const relatedClient = clientsThatAreInThisConversation[0];

          const conversationClient = conversation.client;
          const conversationUser = conversations.cm;
          const relatedClientCaseManager = relatedClient.cm;
          return conversationUser == relatedClientCaseManager;
        });

        // Get conversation Ids
        const conversationIds = conversations.map(conversation => conversation.convid);

        // Get messages associated with each conversation that use that commid
        return db('msgs')
          .whereIn('convo', conversationIds)
          .andWhere('comm', commId);
      }).then((messages) => {
        // get list of conversationIds from the resulting messages
        const conversationIds = messages.map(message => message.convo);

        // Filter out conversations not in conversationIds
        conversations.filter(conversation => conversationIds.indexOf(conversation.convid) > -1);

        // Final list is good to send off
        this._getMultiResponse(conversations, fulfill);
      }).catch(reject);
    });
  }

  static findByUserAndClient(userID, clientID) {
    return new Promise((fulfill, reject) => {
      db('convos')
        .where('cm', userID)
        .andWhere('client', clientID)
        .orderBy('updated', 'desc')
      .then((conversations) => {
        fulfill(conversations);
      }).catch(reject);
    });
  }

  static findByUser(userID) {
    return new Promise((fulfill, reject) => {
      db('convos')
        .where('cm', userID)
        .orderBy('updated', 'desc')
      .then((conversations) => {
        fulfill(conversations);
      }).catch(reject);
    });
  }

  static getconversationMessages(conversationID) {
    return new Promise((fulfill, reject) => {
      db('msgs')
        .where('convo', conversationID)
        .orderBy('created', 'asc')
      .then((messages) => {
        fulfill(messages);
      }).catch(reject);
    });
  }

  static getMostRecentConversation(userID, clientID) {
    return new Promise((fulfill, reject) => {
      db('convos')
        .where('cm', userID)
        .andWhere('client', clientID)
        .orderBy('updated', 'desc')
        .limit(1)
      .then((convos) => {
        this._getSingleResponse(convos, fulfill);
      }).catch(reject);
    });
  }

  static logActivity(conversationID) {
    return new Promise((fulfill, reject) => {
      db('convos')
        .where('convid', conversationID)
        .update({ updated: db.fn.now() })
      .then(() => {
        fulfill();
      }).catch(reject);
    });
  }

  static makeClaimDecision(conversationId, userId, clientId, accepted) {
    if (typeof accepted === 'undefined') {
      accepted = true;
    }
    accepted = accepted === true;

    return new Promise((fulfill, reject) => {
      db('convos')
        .update({ open: false })
        .where('client', clientId)
        .andWhere('cm', userId)
      .then(() => db('convos')
        .update({
          cm: userId,
          client: clientId,
          open: accepted,
          accepted,
        })
        .where('convid', conversationId)
        .returning('*')).then((conversations) => {
          fulfill(conversations[0]);
        }).catch(reject);
    });
  }

  static retrieveByClientsAndCommunication(clients, communication) {
    return new Promise((fulfill, reject) => {
      let conversations;
      // Get the conversations that are possible candidates
      this.findByClientAndUserInvolvingSpecificComm(
        clients, communication
      ).then((resp) => {
        conversations = resp;

        // TODO: Move this into a utility
        return this.createNewIfOlderThanSetHours(conversations, 24);
      }).then((resp) => {
        conversations = resp;

        // We can add this message to existing conversations if they exist
        if (conversations.length) {
          return new Promise((fulfill, reject) => {
            fulfill(conversations);
          });
        } else if (clients.length) {
          if (clients.length == 1) {
            const client = clients[0];
            const subject = 'Automatically created conversation';
            const open = true;
            return this.create(client.cm, client.clid, subject, open);
          }
          return this.createNewNotAcceptedConversationsForAllClients(clients);
        }
        return this.createOrAttachToExistingCaptureBoardConversation(communication);
      }).then((conversations) => {
        if (!Array.isArray(conversations)) {
          conversations = [conversations,];
        }
        fulfill(conversations);
      }).catch(reject);
    });
  }

  static transferUserReference(client, fromUser, toUser) {
    return new Promise((fulfill, reject) => {
      db('convos')
        .where('cm', fromUser)
        .andWhere('client', client)
        .update('cm', toUser)
      .then(() => {
        fulfill();
      }).catch(reject);
    });
  }
}

Conversations.primaryId = 'convid';
Conversations.tableName = 'convos';
module.exports = Conversations;
