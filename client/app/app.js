angular.module('PU', [
  'PU.auth'
  ])
.config(function($routeProvider, $httpProvider) {
  $routeProvider
  .when('/', {
    templateUrl: 'auth/signin.html',
    controller: 'AuthController'
  })
})

.run();