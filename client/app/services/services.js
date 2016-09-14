angular.module('PU.factory', [])

.factory('APICalls',function($http){
  var loginMakerPass = function(){
    return $http({
      method: 'GET',
      url: '/auth/makerpass'
    })

    }
  return {
    loginMakerPass: loginMakerPass
  }
})




