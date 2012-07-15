'use strict';


// Declare app level module which depends on filters, and services
var jotto = angular.module('jotto', []);
jotto.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/home', {templateUrl: 'partials/home.html', controller: Home});
  $routeProvider.when('/lobby', {templateUrl: 'partials/lobby.html', controller: Lobby});
  $routeProvider.when('/play/:gameId', {templateUrl: 'partials/play.html', controller: Play});
  $routeProvider.when('/create', {templateUrl: 'partials/create.html', controller: Create});
  $routeProvider.when('/help', {templateUrl: 'partials/help.html', controller: Help});
  $routeProvider.otherwise({redirectTo: '/home'});
}]);

// Define the socket.io service.
jotto.factory('socket', ['$rootScope', function($rootScope) {
  var handlers = {};

  var socket = io.connect('http://localhost');
  socket.on('connect', function() {
    socket.on('msg', function(data) {
      if (!data.type || !data.payload) return;

      var h = handlers[data.type];
      if (h) {
        h(data.payload);
        $rootScope.$apply();
      }
    });
  });

  // Return the service object with its various methods.
  return {
    // Sets the handler function for a given type of incoming message from the server.
    setHandler: function(type, fn) {
      handlers[type] = fn;
    },

    // Deletes a handler.
    clearHandler: function(type) {
      delete handlers[type];
    },

    // Sends a message of a given type to the server.
    send: function(type, msg, handler) {
      if (handler) {
        handlers[type] = handler;
      }
      socket.emit('msg', { type: type, payload: msg });
    }
  };
}]);

