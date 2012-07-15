'use strict';

function Home($scope, $location, socket) {
  $scope.login = function() {
    socket.setHandler('loginResp', function(data) {
      if (data.error) {
        $scope.errorMessage = 'Login error: ' + data.error;
      } else {
        socket.clearHandler('loginResp');
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


function Lobby() {}
function Play() {}
function Help() {}
