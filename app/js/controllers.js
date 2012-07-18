'use strict';

function Home($scope, $window, $rootScope, $location, socket) {
  $scope.login = function() {
    socket.setHandler('loginResp', function(data) {
      if (data.error) {
        $scope.errorMessage = 'Login error: ' + data.error;
      } else {
        socket.clearHandler('loginResp');
        $rootScope.loggedIn = true;
        $window.localStorage.setItem('loginHash', data.hash);
        $location.path('/lobby');
      }
    });

    socket.send('login', {
      name: $scope.username,
      password: $scope.password
    });
  };

  $scope.register = function() {
    socket.setHandler('registerResp', function(data) {
      if (data.error) {
        $scope.errorMessage = 'Registration error: ' + data.error;
      } else {
        socket.clearHandler('registerResp');
        $rootScope.loggedIn = true;
        $window.localStorage.setItem('loginHash', data.hash);
        $location.path('/lobby');
      }
    });

    socket.send('register', {
      name: $scope.regUsername,
      displayName: $scope.regDisplayName,
      password: $scope.regPassword,
      email: $scope.regEmail
    });
  };
}


function Lobby($scope, $rootScope, $location, socket, auth) {
  auth(function() {
    $scope.refresh = function() {
      socket.setHandler('lobby', function(data) {
        $scope.lobby = data;
        socket.clearHandler('lobby');
      });
      socket.send('lobby', {});
    };
    // Send a refresh when the client lands here.
    $scope.refresh();

    // Called to go to a game.
    $scope.toGame = function(id) {
      $location.path('/play/' + id);
    };

    // Called when the user clicks on an incoming invite.
    $scope.showAccept = function(index) {
      $scope.lobby.requests[index].accepting = true;
    };

    // Called when the user submits an Accept form with a secret word.
    $scope.accept = function(index, id, word) {
      if (id && word && word.length == 5) {
        socket.setHandler('acceptResp', function(data) {
          if (data.error) {
            $scope.lobby.requests[index].error = 'Error accepting: ' + data.error;
          } else {
            socket.clearHandler('acceptResp');
            $scope.toGame(id);
          }
        });

        socket.send('accept', {
          id: id,
          word: word
        });
      } else {
        $scope.lobby.requests[index].error = 'Invalid word.';
      }
    };
  });
}


function Create($scope, $rootScope, $location, socket, auth) {
  auth(function() {
    $scope.create = function() {
      if ($scope.opponent && $scope.word && $scope.word.length == 5) {
        socket.setHandler('createResp', function(data) {
          if (data.error) {
            $scope.error = data.error;
          } else {
            $rootScope.message = 'Invite sent.';
            socket.clearHandler('createResp');
            $location.path('/lobby');
          }
        });

        socket.send('create', {
          opponent: $scope.opponent,
          word: $scope.word
        });
      } else {
        $scope.error = 'Invalid form.';
      }
    };
  });
}

function Play($scope, $rootScope, $location, socket, $routeParams, $window, auth) {
  auth(function() {
    if (!$routeParams.gameId) {
      $location.path('/lobby');
      return;
    }

    $scope.letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    $scope.colorClasses = {
      1: 'red',
      2: 'green',
      3: 'blue'
    };

    socket.setHandler('game', function(data) {
      if (data.error) {
        $scope.error = 'Error loading game: ' + data.error;
        return;
      } else {
        var oldLetters, oldNotes;
        if ($scope.lettersDirty) {
          oldLetters = $scope.game.me.alphabet;
        }
        if ($scope.notesDirty) {
          oldNotes = $scope.game.me.notes;
        }

        $scope.game = data;
        $scope.tables = [
          { id: 'meTable', title: 'You', table: data.me },
          { id: 'themTable', title: data.them.displayName, table: data.them }
        ];

        if ($scope.lettersDirty) {
          $scope.game.me.alphabet = oldLetters;
        }
        if ($scope.notesDirty) {
          $scope.game.me.notes = oldNotes;
        }
      }
    });

    $scope.refresh = function() {
      if (!$routeParams.gameId) {
        $window.clearInterval(refreshInterval);
        return;
      }
      socket.send('game', { id: $routeParams.gameId });
    };
    // Immediately send a refresh on loading.
    $scope.refresh();
    // And then set up refreshes every 10 seconds.
    var GAME_INTERVAL = 10000; // TODO Lower the frequency to every 20 or 30 seconds once the server will send push updates on guesses.
    var refreshInterval = $window.setInterval($scope.refresh, GAME_INTERVAL);

    $scope.clickLetter = function(letter) {
      $scope.lettersDirty = true;
      $scope.handleDirty();

      var newNumber = $scope.game.me.alphabet[letter];
      newNumber = newNumber ? (newNumber + 1) % 4 : 1;
      $scope.game.me.alphabet[letter] = newNumber;
    };

    $scope.notesChanged = function() {
      $scope.notesDirty = true;
      $scope.handleDirty();
    };

    var timer;
    var UPDATE_PERIOD = 2000; // 2 seconds from last edit to saving.
    $scope.handleDirty = function() {
      if (timer) {
        $window.clearTimeout(timer);
        timer = 0;
      }

      timer = $window.setTimeout($scope.sendUpdate, UPDATE_PERIOD);
    };

    $scope.doGuess = function() {
      if ($scope.guess && $scope.guess.length == 5) {
        $scope.sendUpdate($scope.guess);
        $scope.guess = '';
      } else {
        $scope.error = 'Invalid guess word';
      }
    };

    $scope.sendUpdate = function(opt_guess) {
      if (timer) {
        $window.clearTimeout(timer);
        timer = 0;
      }

      var payload = {
        id: $routeParams.gameId
      };

      if (opt_guess) {
        payload.guess = opt_guess;
      }
      if ($scope.lettersDirty) {
        payload.alphabet = $scope.game.me.alphabet;
      }
      if ($scope.notesDirty) {
        payload.notes = $scope.game.me.notes;
      }

      socket.setHandler('updateResp', function(data) {
        if (data.error) {
          $scope.error = data.error;
        } else {
          $scope.notesDirty = false;
          $scope.lettersDirty = false;
        }
      });
      socket.send('update', payload);
    };

    $scope.winner = function() {
      return $scope.game && $scope.game.myTurn ? 'You' : 'They';
    };

  });
}


function Help() {}
