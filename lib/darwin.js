'use strict';

/**
 * @external Schedule
 * @desc Schedule data class
 * @see {@link https://github.com/CarbonCollins/openraildata-common-nodejs/blob/HEAD/docs/schedule.md|Schedule}
 */
/**
 * @external Association
 * @desc Association data class
 * @see {@link https://github.com/CarbonCollins/openraildata-common-nodejs/blob/HEAD/docs/association.md|Association}
 */
/**
 * @external TrainOrder
 * @desc TrainOrder data class
 * @see {@link https://github.com/CarbonCollins/openraildata-common-nodejs/blob/HEAD/docs/trainOrder.md|TrainOrder}
 */
/**
 * @external StationMessage
 * @desc StationMessage data class
 * @see {@link https://github.com/CarbonCollins/openraildata-common-nodejs/blob/HEAD/docs/stationMessage.md|StationMessage}
 */
/**
 * @external TrainStatus
 * @desc TrainStatus data class
 * @see {@link https://github.com/CarbonCollins/openraildata-common-nodejs/blob/HEAD/docs/trainStatus.md|TrainStatus}
 */

const common = require('openraildata-common');

const stompit = require('stompit');
const zlib = require('zlib');
const xml2json = require('xml2json');
const EventEmitter = require('events');

const server1 = {
  host: process.env.NATIONAL_RAIL_FEED_URL || 'datafeeds.nationalrail.co.uk',
  port: 61613,
  connectHeaders: {
    host: '/',
    login: 'd3user',
    passcode: 'd3password',
    'heart-beat': '5000,5000'
  }
};

function replaceKeys(jsonObj) {
  let jsonString = JSON.stringify(jsonObj);
  jsonString = jsonString.replace(/"ns3:Location"/g, '"locations"').replace(/"ns\d:/g, '"');
  return JSON.parse(jsonString);
}

function getMessage(type, messageJSON) {
  if (type === 'TRAINSTATUS,') {
    /**
     * @event Darwin#trainStatus
     * @type {object}
     * @property {string} ts a timestamp of when the event was issued
     * @property {TrainStatus} trainStatus a train status class
     * @property {string} origin where the event originated from
     */
    return ['trainStatus', {
      ts: messageJSON.Pport.ts,
      trainStatus: new common.TrainStatus(messageJSON.Pport.uR.TS),
      origin: messageJSON.Pport.uR.updateOrigin
    }];
  }

  if (type === 'SCHEDULE,') {
    /**
     * @event Darwin#schedule
     * @type {object}
     * @property {string} id an id for the event
     * @property {string} ts a timestamp of when the event was issued
     * @property {Schedule} schedule a schedule class
     * @property {string} origin where the event originated from
     * @property {string} source which source did the vent originate from
     */
    return ['schedule', {
      id: messageJSON.Pport.uR.requestID,
      ts: messageJSON.Pport.ts,
      schedule: new common.Schedule(messageJSON.Pport.uR.schedule),
      origin: messageJSON.Pport.uR.updateOrigin,
      source: messageJSON.Pport.uR.requestSource
    }];
  }

  if (type === 'ASSOCIATION,') {
    /**
     * @event Darwin#association
     * @type {object}
     * @property {string} id an id for the event
     * @property {string} ts a timestamp of when the event was issued
     * @property {Association} association a association class
     * @property {string} origin where the event originated from
     * @property {string} source which source did the vent originate from
     */
    return ['association', {
      id: messageJSON.Pport.uR.requestID,
      ts: messageJSON.Pport.ts,
      association: new common.Association(messageJSON.Pport.uR.association),
      origin: messageJSON.Pport.uR.updateOrigin,
      source: messageJSON.Pport.uR.requestSource
    }];
  }

  if (type === 'TRAINORDER,') {
    /**
     * @event Darwin#trainOrder
     * @type {object}
     * @property {string} id an id for the event
     * @property {string} ts a timestamp of when the event was issued
     * @property {TrainOrder} trainOrder a TrainOrder class
     * @property {string} origin where the event originated from
     * @property {string} source which source did the vent originate from
     */
    return ['trainOrder', {
      id: messageJSON.Pport.uR.requestID,
      ts: messageJSON.Pport.ts,
      trainOrder: new common.TrainOrder(messageJSON.Pport.uR.trainOrder),
      origin: messageJSON.Pport.uR.updateOrigin,
      source: messageJSON.Pport.uR.requestSource
    }];
  }

  if (type === 'STATIONMESSAGE,') {
    /**
     * @event Darwin#stationMessage
     * @type {object}
     * @property {string} ts a timestamp of when the event was issued
     * @property {StationMessage} stationMessage a StationMessage class
     * @property {string} origin where the event originated from
     */
    return ['stationMessage', {
      ts: messageJSON.Pport.ts,
      stationMessage: new common.StationMessage(messageJSON.Pport.uR.OW),
      origin: messageJSON.Pport.uR.updateOrigin
    }];
  }

  return ['unhandledMessage', messageJSON];
}

/**
 * @class
 * @classdesc a service for connecting and communicating with the National Rail Darwin PushPort server
 */
class Darwin extends EventEmitter {
  /**
   * @constructor
   */
  constructor() {
    super();
    this._channel = null;
  }

  /**
   * @method Darwin~connect
   * @desc connects to the Darwin server and subscribes to a specified queue
   * @param {string} queue the queue to subscribe to
   * @fires Darwin#trainStatus
   * @fires Darwin#schedule
   * @fires Darwin#association
   * @fires Darwin#trainOrder
   * @fires Darwin#stationMessage
   *
   * @fires Darwin#idle
   * @fires Darwin#error
   * @fires Darwin#connecting
   * @fires Darwin#connect
   */
  connect(queue) {
    const reconnectOptions = {
      initialReconnectDelay: 10,
      maxReconnectDelay: 30000,
      useExponentialBackOff: true,
      maxReconnects: 30,
      randomize: false
    };

    const servers = new stompit.ConnectFailover([server1], reconnectOptions);

    this._channel = new stompit.Channel(servers, { alwaysConnected: true });

    /**
     * @event Darwin#idle
     * @desc fired when the connection to darwin becomes idle
     */
    this._channel.on('idle', () => {
      this.emit('idle');
    });
    /**
     * @event Darwin#error
     * @desc fired when the connection to darwin throws an error
     * @type {object}
     * @property {Error} err the error that has been reported
     * @property {string} server the server in which the error applies too
     */
    this._channel.on('error', (err, server) => {
      this.emit('error', err, server);
    });
    /**
     * @event Darwin#connecting
     * @desc fired when the stomp client is connecting to a server
     */
    this._channel.on('connecting', () => {
      this.emit('connecting');
    });
    /**
     * @event Darwin#connect
     * @desc fired when the stomp client is connected to the server
     */
    this._channel.on('connect', () => {
      this.emit('connect');
    });

    this._channel.subscribe(queue, (err, message) => {
      if (err) {
        this.emit('error', err);

        return;
      }

      const type = message.headers.FilterHeaderLevel;

      message.on('readable', () => {
        const buffer = [];
        const messageStream = zlib.createGunzip();
        messageStream.setEncoding('utf8');

        messageStream.on('error', (error) => {
          if (buffer.length > 0) {
            this.emit('error', error, message.headers);
          }
        });

        messageStream.on('data', (data) => {
          buffer.push(data);
        });

        messageStream.on('end', () => {
          const messageXML = buffer.join('');
          const messageJSON = replaceKeys(xml2json.toJson(messageXML, {
              object: true,
              coerce: {
                trainId: value => String(value)
              },
              reversible: false
          }));

          try {
            this.emit(...getMessage(type, messageJSON));
          }
          catch (messageErr) {
            this.emit('messageErr', messageErr.stack, JSON.stringify(messageJSON));
          }

        });

        message.pipe(messageStream);
      });
    });
  }
}

module.exports = Darwin;
