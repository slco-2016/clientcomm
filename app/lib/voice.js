const Promise = require('bluebird');
const querystring = require('querystring');

const credentials = require('../../credentials');

// Twilio tools
const smsService = require('./sms-service');

const sms = require('./sms');
const analyticsService = require('./analytics-service');
const resourceRequire = require('./resourceRequire');

const Communications = resourceRequire('models', 'Communications');
const Conversations = resourceRequire('models', 'Conversations');
const Messages = resourceRequire('models', 'Messages');
const OutboundVoiceMessages = resourceRequire('models', 'OutboundVoiceMessages');
const Recordings = resourceRequire('models', 'Recordings');
const Departments = resourceRequire('models', 'Departments');
const PhoneNumbers = resourceRequire('models', 'PhoneNumbers');
const Users = resourceRequire('models', 'Users');

module.exports = {

  // Makes the call from Twilio to get the case manager to record a voice
  // message for a client to be sent at a later date (as a notification)
  recordVoiceMessage(user, commId, clientId, deliveryDate, phoneNumber, domain) {
    // Concat parameters so that callback goes to recording endpoint with all
    // data needed to know where to save that recording at
    const params = querystring.stringify({
      userId: user.cmid,
      commId: commId,
      deliveryDate: deliveryDate.getTime(),
      clientId: clientId,
      type: 'ovm',
    });

    // TODO: The callback URL is set in credentials
    // Problem: This requires the credentials.js file to be custom set for
    // every deployment with regards to the Twilio address. Is there a way
    // to programmatically grab the domain?
    if (!domain) {
      domain = credentials.twilio.outboundCallbackUrl;
    }

    return new Promise((fulfill, reject) => {
      // find the right 'from' phone number, via the department
      Departments.findOneByAttribute('department_id', user.department)
        .then(department => {
          return PhoneNumbers.findById(department.phone_number);
        })
        .then(departmentPhoneNumber => {
          const sentFromValue = departmentPhoneNumber.value;
          const url = `${domain}/webhook/voice/record/?${params}`;
          const opts = {
            from: sentFromValue,
            to: phoneNumber,
            url,
          };

          smsService.createCall(opts)
            .then(call => {
              // Response is (so far) not used, we leave it to the user to
              // click "Go to notifications" to proceed
              fulfill(call);
            }).catch(err => { reject(err); })
        }).catch(reject);
      }).catch(reject);
  },

  addInboundRecordingAndMessage(communication, recordingKey, recordingSid, toNumber, req, locals) {
    return new Promise((fulfill, reject) => {
      let recording, conversations, clients;

      return Recordings.create({
        comm_id: communication.commid,
        recording_key: recordingKey,
        RecordingSid: recordingSid,
        call_to: toNumber,
      }).then((resp) => {
        recording = resp;

        return sms.retrieveClients(recording.call_to, communication);
      }).then((resp) => {
        clients = resp;

        return Conversations.retrieveByClientsAndCommunication(clients, communication);
      }).then((resp) => {
        conversations = resp;

        // track the message
        conversations.forEach(conversation => {
          const methodExisted = (conversation.client) ? true : false;
          analyticsService.track(null, 'message_receive', req, locals, {
            ccc_id: conversation.client,
            message_medium: 'voice',
            contact_method_description: communication.description,
            contact_method_existed: methodExisted,
          });
        });

        const conversationIds = conversations.map(conversation => conversation.convid);

        return Messages.insertIntoManyConversations(
          conversationIds,
          communication.commid,
          'Untranscribed inbound voice message',
          recordingSid,
          'received',
          toNumber, {
            recordingId: recording.id,
          }
        );
      }).then((resp) => {
        fulfill();
      }).catch(reject);
    });
  },

  addOutboundRecordingAndMessage(commId, recordingKey, recordingSid, clientId, userId, status) {
    return new Promise((fulfill, reject) => {
      // Reference variables
      let conversation,
        recording;

      return Recordings.create({
        comm_id: commId,
        recording_key: recordingKey,
        RecordingSid: recordingSid,
        call_to: null, // this is only used with inbound messages/calls/etc.
      }).then((resp) => {
        recording = resp;

        // Create a new conversation
        const subject = 'Outbound Voice Call';
        const open = true;
        return Conversations.create(userId, clientId, subject, open);
      }).then((resp) => {
        conversation = resp;

        return Messages.insertIntoManyConversations(
          [conversation.convid, ],
          commId,
          'Untranscribed outbound voice message', // Default content for message
          recordingSid,
          status,
          null, // This is the "toNumber" or "call_to" which is only used on inbound (see above)
          { recordingId: recording.id } // Fkey pointing Recordings table
        );
      }).then(() => {
        fulfill();
      }).catch(reject);
    });
  },

  processPendingOutboundVoiceMessages(ovm, fromUser, domain) {
    domain = domain || credentials.twilio.outboundCallbackUrl;
    let sentFromValue;
    return new Promise((fulfill, reject) => {
      // don't create the call if we're testing
      if (credentials.CCENV === 'testing') {
        return fulfill();
      }

      // get the right 'from' phone number
      Departments.findOneByAttribute('department_id', fromUser.department)
        .then(department => {
          return PhoneNumbers.findById(department.phone_number);
        })
        .then(departmentPhoneNumber => {
          sentFromValue = departmentPhoneNumber.value;
          // get the right 'to' phone number
          return Communications.findById(ovm.commid);
        })
        .then(comm => {
          const opts = {
            from: sentFromValue,
            machineDetection: 'DetectMessageEnd',
            machineDetectionTimeout: '3',
            statusCallback: `${domain}/webhook/voice/status`,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed',],
            to: comm.value,
            url: `${domain}/webhook/voice/play-message/?ovmId=${ovm.id}`,
          };
          // create the call
          smsService.createCall(opts)
            .then(call => {
              // Update the OVM table row with the sid of the call
              // (the SID of the "voicemail delivery call")
              ovm
                .update({ call_sid: call.sid })
                .then(ovm => {
                  fulfill(ovm);
                }).catch(reject);
            }).catch(err => { reject(err); })
        }).catch(reject);
    });
  },

};
