'use strict';

var util = require('util');
var fs = require('fs');
var mongo = require('mongodb');
var crypto = require('crypto');

// constructor
exports.jotto = function(io) {
  return new Jotto(io);
};

function Jotto(io) {
  this.io = io;

  this.clients = {};
  this.hashes = {};

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

Jotto.prototype.loginHash = function(client, name, password) {
  var plaintext = name + ' salt value 04809fdasjdkanlknknfqnlknsad,mNvc;jn  nbqhfq ' + password;

  var shasum = crypto.createHash('sha1');
  shasum.update(plaintext);
  var hash = shasum.digest('hex');

  this.hashes[hash] = client;
  return hash;
};


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
    if (data.hash) {
      if (jotto.hashes[data.hash]) {
        var c = jotto.hashes[data.hash];
        self.name = c.name;
        self.displayName = c.displayName;
        jotto.hashes[data.hash] = self;
        self.send('loginResp', { hash: data.hash });
      } else {
        self.send('loginResp', { error: 'Bad login hash' });
      }
      return;
    }

    // Look up the user in the DB and check the password.
    Jotto.db.collection('users', function(err, users) {
      if (err) {
        self.send('loginResp', { error: 'Internal server error: Could not load user database.' });
        return;
      }

      users.find({ name: data.name, password: data.password }).toArray(function(err, items) {
        if (err) {
          self.send('loginResp', { error: 'Bad username and password.' });
          return;
        }

        if (!items || items.length == 0) {
          self.send('loginResp', { error: 'Bad username and password.' });
          return;
        } else if (items.length > 1) {
          self.send('loginResp', { error: 'Can\'t happen! Found multiple matches.' });
          return;
        }

        // Successful login.
        var user = items[0];
        self.displayName = user.displayName;
        self.name = data.name;

        var hash = jotto.loginHash(self, self.name, data.password);

        console.log(hash);
        self.send('loginResp', { hash: hash });
      });
    });
  };

  handlers['register'] = function(data) {
    if (!data.name || !data.displayName || !data.email || !data.password) {
      self.send('registerResp', { error: 'You must provide a username, display name, email address and password.' });
      return;
    }

    Jotto.db.collection('users', function(err, users) {
      if (err) {
        self.send('registerResp', { error: 'Error loading users table: ' + err });
        return;
      }

      users.find({ name: data.name }).count(function(err, count) {
        if (err) {
          self.send('registerResp', { error: 'Error checking for duplicated usernames' });
          return;
        }
        if (count > 0) {
          self.send('registerResp', { error: 'A user with that name already exists.' });
          return;
        }

        users.save({
          name: data.name,
          displayName: data.displayName,
          password: data.password,
          email: data.email
        });

        // Consider myself logged in now.
        self.name = data.name;
        self.displayName = data.displayName;

        var hash = jotto.loginHash(self, self.name, data.password);

        self.send('registerResp', { hash: hash });
      });
    });
  };


  handlers['lobby'] = function(data) {
    if (!self.name) {
      self.send('lobby', { error: 'Not logged in.' });
      return;
    }

    // Fetch the live games for this person.
    Jotto.db.collection('games', function(err, games) {
      if (err) {
        self.send('lobby', { error: 'Could not retrieve list of games.' });
        return;
      }

      games.find({ 'players.name': self.name, status: { $ne: 'over' } }).toArray(function(err, items) {
        if (err) {
          self.send('lobby', { error: 'Problem fetching games: ' + err });
          return;
        }

        console.log('!!!! FOUND GAMES: ', items);

        var requests = [];
        var live = [];

        items.forEach(function(g) {
          var opponent;
          var myTurn;
          for (var i = 0; i < g.players.length; i++) {
            if (g.players[i].name != self.name) {
              opponent = {
                name: g.players[i].name,
                displayName: g.players[i].displayName
              };
              myTurn = g.turn != i;
            }
          }

          if (g.status == 'request') {
            // Don't show my outgoing game requests, for now, only my incoming ones.
            if (myTurn) {
              requests.push({
                id: g._id,
                opponent: opponent
              });
            }
          } else if (g.status == 'live') {
            live.push({
              id: g._id,
              opponent: opponent,
              myTurn: myTurn
            });
          }
        });

        // Now we have the payload pieces, so send the response:
        self.send('lobby', {
          liveGames: live,
          requests: requests
        });
      });
    });
  };

  handlers['create'] = function(data) {
    if (!self.name) {
      self.send('createResp', { error: 'Not logged in.' });
      return;
    }

    if (!data.word) {
      self.send('createResp', { error: 'You must provide a 5-letter word.' });
      return;
    }
    if (data.word.length != 5) {
      self.send('createResp', { error: 'Your secret word must be 5 letters.' });
      return;
    }

    if (data.opponent == self.name) {
      self.send('createResp', { error: 'No playing with yourself.' });
      return;
    }


    Jotto.db.collection('users', function(err, users) {
      if (err) {
        self.send('createResp', { error: 'Error retrieving users table' });
        return;
      }

      users.find({ name: data.opponent }).nextObject(function(err, item) {
        if (err) {
          self.send('createResp', { error: 'Error looking up users: ' + err });
          return;
        }
        if (!item) {
          self.send('createResp', { error: 'No user \'' + data.opponent + '\' found.' });
          return;
        }

        // We have our user.
        // Now look up games between these two, to make sure we don't duplicate.
        Jotto.db.collection('games', function(err, games) {
          if (err) {
            self.send('createResp', { error: 'Error retrieving games table: ' + err });
            return;
          }

          games.find({ 'players.name': { $all: [ self.name, data.opponent ] }, status: { $ne: 'over' } }).toArray(function(err, items) {
            if (err) {
              self.send('createResp', { error: 'Error retrieving relevant games: ' + err });
              return;
            }

            if (items && items.length) {
              self.send('createResp', { error: 'A game between you and ' + data.opponent + ' already exists.' });
            } else {
              games.insert({ 
                status: 'request',
                players: [{
                  name: self.name,
                  displayName: self.displayName,
                  word: data.word.toUpperCase(),
                }, {
                  name: data.opponent,
                  displayName: item.displayName,
                }],
                turn: 1 // The opponent's turn to accept the request.
              });

              self.send('createResp', {});
            }
          });
        });
      });
    });
  }; // end handlers['create']


  handlers['accept'] = function(data) {
    if (!self.name) {
      self.send('acceptResp', { error: 'Not logged in.' });
      return;
    }

    if (!data.id || !data.word || data.word.length != 5) {
      self.send('acceptResp', { error: 'You must provide a 5-letter secret word.' });
      return;
    }

    Jotto.db.collection('games', function(err, games) {
      if (err) {
        self.send('acceptResp', { error: 'Error retrieving the games table: ' + err });
        return;
      }

      games.find({ _id: new mongo.ObjectID(data.id) }).limit(1).nextObject(function(err, game) {
        if (err) {
          self.send('acceptResp', { error: 'Error retrieving game: ' + err });
          return;
        }

        // Since I'm accepting this game I'll be the players[1].
        game.players[1].word = data.word.toUpperCase();
        game.status = 'live';
        game.turn = Math.floor(Math.random() * 2); // Randomize whose turn it is.

        games.save(game);
        self.send('acceptResp', {});
      });
    });
  };

  handlers['game'] = function(data) {
    if (!self.name) {
      self.send('game', { error: 'Not logged in.' });
      return;
    }

    if (!data.id) {
      self.send('game', { error: 'No game ID given.' });
      return;
    }

    Jotto.db.collection('games', function(err, games) {
      if (err) {
        self.send('game', { error: 'Error retrieving games table: ' + err });
        return;
      }

      games.findOne({_id: new mongo.ObjectID(data.id) }, function(err, g) {
        var me, them, myTurn;
        for (var i = 0; i < g.players.length; i++) {
          if (g.players[i].name == self.name) {
            me = g.players[i];
            myTurn = i == g.turn;
          } else {
            them = g.players[i];
          }
        }
        if (!me || !them) {
          self.send('game', { error: 'Error: Broken game without two players.' });
          return;
        }

        if (!me.alphabet) {
          me.alphabet = {};
        }
        if (!me.notes) {
          me.notes = '';
        }
        if (!me.guesses) {
          me.guesses = [];
        }

        var out = {
          id: g._id,
          me: me,
          them: {
            name: them.name,
            displayName: them.displayName,
            guesses: them.guesses || []
          },
          myTurn: myTurn,
          over: g.status == 'over'
        };
        self.send('game', out);
      });
    });
  };

  handlers['update'] = function(data) {
    if (!self.name) {
      self.send('updateResp', { error: 'Not logged in.' });
      return;
    }

    if (!data.id) {
      self.send('updateResp', { error: 'No game ID supplied.' });
      return;
    }
    if (data.guess && data.guess.length != 5) {
      self.send('updateResp', { error: 'Guesses must be 5 letters.' });
      return;
    }
    if ( !(data.guess || data.notes || data.alphabet)) {
      return; // Nothing to update.
    }

    Jotto.db.collection('games', function(err, games) {
      if (err) {
        self.send('updateResp', { error: 'Error opening games table: ' + err });
        return;
      }

      games.findOne({ _id: new mongo.ObjectID(data.id) }, function(err, g) {
        if (err) {
          self.send('updateResp', { error: 'Error loading game: ' + err });
          return;
        }
        if (!g) {
          self.send('updateResp', { error: 'No such game found.' });
          return;
        }
        if (g.status == 'over') {
          self.send('updateResp', { error: 'This game is over.'});
          return;
        }
        if (g.status == 'request') {
          self.send('updateResp', { error: 'This game has not started yet.' });
          return;
        }

        var ixMe = g.players[0].name == self.name ? 0 : 1;
        var ixThem = 1 - ixMe;
        var correct;

        // Modify g as necessary.
        if (data.guess) {
          data.guess = data.guess.toUpperCase();
          if (data.guess == g.players[ixThem].word) {
            g.status = 'over';
            g.turn = ixMe; // I win.
            correct = 5;
            g.players[ixMe].guesses.push({
              word: data.guess,
              correct: 5
            });
          } else {
            var letters = {};
            var word = g.players[ixThem].word;
            for (var i = 0; i < word.length; i++) {
              letters[word.charAt(i)] = true;
            }

            correct = 0;
            for (var i = 0; i < data.guess.length; i++) {
              if (letters[data.guess.charAt(i)]) {
                correct++;
              }
            }

            if (!g.players[ixMe].guesses) {
              g.players[ixMe].guesses = [];
            }
            g.players[ixMe].guesses.push({
              word: data.guess,
              correct: correct
            });

            // Switch the player whose turn it is.
            g.turn = 1 - g.turn;
          }
        }

        if (data.alphabet) {
          g.players[ixMe].alphabet = data.alphabet;
        }

        if (data.notes) {
          g.players[ixMe].notes = data.notes;
        }

        // Then store it.
        // TODO: Send an immediate game update to both players.
        games.save(g);
        self.send('updateResp', typeof correct == 'undefined' ? {} : { correct: correct });
      });
    });
  };
}

/*
games: {
  status: {string} Either 'live', 'request' or 'over'.
  players: {Array.<Object>} Much of the data here is blank/missing on a requested game {
    name: {string} user names
    displayName: {string} display name
    // Everything below this line is absent for non-live games.
    word: {string} This user's secret word.
    guesses: {Array.<Object>} In chronological order [{
      word: {string}
      correct: {number}
    }]
    alphabet: {Object.<string,string>} maps (capital) letters to states/colours. // TODO Decide on the meaning of this in the client.
    notes: {string} Arbitrary notes field.
  }
  turn: {number} index into players for whose turn it is. For 'over' games, points at the winner. For 'request' games, points at the person who is receiving the request.
}
game (C->S) Requests the state of a particular game {
  id: {string} Hex ID of the game in question.
}
game (S->C) Returns the state of a particular game {
  error: {string} An error message. If this is set, no other data is included.
  id: {string} Hex ID of this game.
  me/them: two similarly structured player objects {
    name: {string} user name
    displayName: {string} display name
    guesses: {Array.<Object>} In chronological order [{
      word: {string}
      correct: {number}
    }]
    // The below are only present for the user's player (me), and missing for the opponent (them).
    word: {string} This user's secret word.
    alphabet: {Object.<string,string>} maps (capital) letters to states/colours. // TODO Decide on the meaning of this in the client.
    notes: {string} Arbitrary notes field.
  }
  myTurn: {boolean} 
}
*/


Client.prototype.send = function(type, data) {
  this.socket.emit('msg', { type: type, payload: data });
};


