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

  var socket = io.connect('/');
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

// And define my login service.
jotto.factory('auth', ['$rootScope', '$window', '$location', 'socket', function($rootScope, $window, $location, socket) {
  // Calls the given callback on a successful login. If no login data exists, or the login fails, redirects to /home.
  return function(callback) {
    if ($rootScope.loggedIn) {
      callback();
      return;
    }

    // Retrieve the login data.
    var loginHash = $window.localStorage.getItem('loginHash');
    if (!loginHash) {
      $location.path('/home');
      return;
    }

    socket.setHandler('loginResp', function(data) {
      if (data.error) {
        $location.path('/home');
      } else {
        socket.clearHandler('loginResp');
        $rootScope.loggedIn = true;
        callback();
      }
    });
    socket.send('login', { hash: loginHash });
  };
}]);

// Define the timer service.
jotto.factory('timers', ['$rootScope', '$window', function($rootScope, $window) {
  var timers = {};
  var intervals = {};

  $rootScope.$on('$routeChangeStart', function() {
    for (var t in timers) {
      $window.clearTimeout(timers[t]);
    }
    for (var i in intervals) {
      $window.clearInterval(intervals[i]);
    }
    timers = {};
    intervals = {};
  });

  return {
    setTimeout: function(name, fn, time) {
      // If one already exists, remove it and overwrite.
      if (timers[name]) {
        $window.clearTimeout(timers[name]);
      }
      timers[name] = $window.setTimeout(function() {
        delete timers[name];
        fn();
      }, time);
    },

    clearTimeout: function(name) {
      if (timers[name]) {
        $window.clearTimeout(timers[name]);
        delete timers[name];
      }
    },

    setInterval: function(name, fn, time) {
      // If one already exists, remove it and overwrite.
      if (intervals[name]) {
        $window.clearInterval(intervals[name]);
      }
      intervals[name] = $window.setInterval(fn, time);
    },

    clearInterval: function(name) {
      if (intervals[name]) {
        $window.clearInterval(intervals[name]);
        delete intervals[name];
      }
    }
  };
}]);


