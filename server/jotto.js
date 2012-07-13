'use strict';

var util = require('util');
var fs = require('fs');
var mongo = require('mongodb');

// constructor
exports.jotto = function(io) {
  return new Jotto(io);
};

function Jotto(io) {
  this.io = io;

  this.clients = {};

  // Get connected to the MongoDB.
  var server = new mongo.Server('localhost', 27017, { auto_reconnect: true });
  Jotto.db = new mongo.Db('jottodb', server);
  Jotto.db.open(function(err, db) {
    if (err) {
      console.error("Error opening database: " + err);
      process.exit();
    }

    db.createCollection('players', function(err, collection) {});
    db.createCollection('games', function(err, collection) {});
  });

  var self = this;
  io.sockets.on('connection', function(socket) {
    self.clients[socket.id] = new Client(self, socket);
  });
}


function Client(jotto, socket) {
  var self = this;
  this.socket = socket;

  var handlers = {};

  socket.on('msg', function(data) {
    console.log(util.inspect(data));
    if (!data.type) return;
    if (handlers[data.type]) {
      handlers[data.type](data.payload);
    }
  });

  handlers['login'] = function(data) {
    self.name = data.name;
    self.state = 'lobby';
    self.send('lobby', bb.lobbyData());

    // Look up all the relevant teams and cache their names.
    BloodBowl.db.collection('teams', function(err, collection) {
      collection.find({owner: self.name}).toArray(function(err, items) {
        self.teams = items.map(function(t) {
          return t.name;
        });
        bb.updateLobby();
      });
    });
  };

  handlers['lobby'] = function(data) {
    bb.updateLobby();
  };


