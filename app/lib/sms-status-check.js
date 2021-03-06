const db = require('../db');
const smsService = require('./sms-service');

// Email tools
const emNotify = require('./em-notify');
const notifyUserFailedSend = emNotify.notifyUserFailedSend;


module.exports = {

  checkSMSstatus() {
    db.select('*')
    .from('msgs')
    .leftJoin('comms', 'comms.commid', 'msgs.comm')
    .whereNot('msgs.status_cleared', true)
    .and.whereNotNull('tw_sid')
    .then((msgs) => {
      console.log(`Running status check for ${msgs.length} messages.`);

      // Iterate through list, checking to see if any have changes status
      for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        if (msg.tw_sid) checkMsgAgainstTwilio(msg);
      }
    }).catch((err) => { console.log(err); });
  },

  checkMsgAgainstTwilio(msg) {
    // Get the message status from the Twilio API
    smsService.getMessageInfo(msg.tw_sid)
    .then(msg_info => {
      if (msg_info.direction == 'inbound') {
        // If no change occured over msg prior status
        if (msg.tw_status == msg_info.status) {
          // We can close out cleared messages
          if (msg_info.status == 'received') {
            db('msgs')
            .where('msgid', msg.msgid)
            .update({ status_cleared: true })
            .then((success) => {
              console.log(`Cleared msg ${msg.msgid}`);
            }).catch((err) => { console.log(err); });
          }

        // There was a change
        } else {
          // The message changed to a value we accept as closed
          if (msg_info.status == 'received') {
            db('msgs')
            .where('msgid', msg.msgid)
            .update({ status_cleared: true })
            .then((success) => {
              console.log(`Cleared msg ${msg.msgid}`);
            }).catch((err) => { console.log(err); });
          }
        }

      // Handling for messages sent from case manager to Twilio
      } else {
        // If no change occured over msg prior status
        if (msg.tw_status == msg_info.status) {
          // We can close out cleared messages
          if (msg_info.status == 'sent' || msg_info.status == 'delivered' || msg_info.status == 'failed') {
            db('msgs')
            .where('msgid', msg.msgid)
            .update({ status_cleared: true })
            .then((success) => {
              console.log(`Cleared msg ${msg.msgid}`);
            }).catch((err) => { console.log(err); });

          // Check that message is not stuck in queue
          } else {
            const created = new Date(msg.created);
            const now = new Date();
            const hrDiff = Math.floor((now - created) / 36e5); // this is one hour difference

            // It has been queued for too long (over 1 hour)
            // Report this to the case manager
            if (hrDiff > 1) {
              db('msgs')
              .where('msgid', msg.msgid)
              .update({ status_cleared: true })
              .then((success) => {
                console.log(`Cleared msg ${msg.msgid}, but it failed to send.`);

                // Send an email to the case manager
                db('convos')
                .select(
                  'cms.first AS cm_first',
                  'cms.last AS cm_last',
                  'cms.email AS cm_email',
                  'clients.first AS client_first',
                  'clients.last AS client_last')
                .join('cms', 'cms.cmid', 'convos.cm')
                .join('clients', 'convos.client', 'clients.clid')
                .where('convos.convid', msg.convo)
                .then((rslts) => {
                  // Only send if we found a cm and client
                  if (rslts.length > 0) {
                    const rcrd = rslts[0];
                    const cm = {first: rcrd.cm_first, last: rcrd.cm_last, email: rcrd.cm_email};
                    const client = {first: rcrd.client_first, last: rcrd.client_last};
                    notifyUserFailedSend(cm, client, msg);
                  }
                }).catch((err) => { console.log(err); });
              }).catch((err) => { console.log(err); });
            }
          }

        // There was a change
        } else {
          // Results indicate msg can also be closed
          if (msg_info.status == 'sent' || msg_info.status == 'failed') {
            db('msgs')
            .where('msgid', msg.msgid)
            .update({ tw_status: msg_info.status, status_cleared: true })
            .then((success) => {
              console.log(`Cleared msg ${msg.msgid}`);
            }).catch((err) => { console.log(err); });

          // Update status but do not close out
          } else {
            db('msgs')
            .where('msgid', msg.msgid)
            .update({ tw_status: msg_info.status })
            .then((success) => {
              console.log(`Cleared msg ${msg.msgid}`);
            }).catch((err) => { console.log(err); });
          }
        }
      }
    }).catch(err => {
      console.log('Twilio error: ');
      console.log(err);
      console.log('-- \n');
    });
  },

};
