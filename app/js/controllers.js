'use strict';

function Home($scope, $rootScope, $location, socket) {
  $scope.login = function() {
    socket.setHandler('loginResp', function(data) {
      if (data.error) {
        $scope.errorMessage = 'Login error: ' + data.error;
      } else {
        socket.clearHandler('loginResp');
        $rootScope.loggedIn = true;
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


function Lobby($scope, $rootScope, $location, socket) {
  if (!$rootScope.loggedIn) {
    $location.path('/home');
    return;
  }

  $scope.refresh = function() {
    socket.setHandler('lobby', function(data) {
      $scope.lobby = data;
      socket.clearHandler('lobby');
    });
    socket.send('lobby', {});
  };
  // Send a refresh when the client lands here.
  $scope.refresh();

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
          $location.path('/play/' + id);
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

}


function Create() {}
function Play() {}
function Help() {}
