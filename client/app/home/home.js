angular.module('PU.home', ['PU.factories'])

.controller('HomeController', function ($scope, MakerPass, $location, $route, $http, StateSaver, DB, CurrentUser) {
$scope.currentUser = {} //where we store the current user's information 
$scope.pools = []; //where  we store the total amout of pools from the owner
$scope.loading = true;

//******************************************************************************
//This shows all the pools that the user belongs too
//******************************************************************************

$scope.showPools = function(){
 return DB.getClasses()
  .then(function(data){
    console.log('i make its here', data)
    $scope.pools = data.reverse();
    console.log('lALALALALA',$scope.pools)
  })
  .catch(function(err){console.log('showPools err',err);})
}

//******************************************************************************
//This allows you to go to the create pool page
//******************************************************************************

$scope.goToCreatePool = function(){
  $location.path('/createPool')
}

//******************************************************************************
//This makes pools clickable so you can go to their specific pool page
//******************************************************************************

$scope.goToPool = function(pool){
  $location.path(`/pools/${pool.id}`);
}

//******************************************************************************
//This allows you to delete entire pools, only if you are the admin of the pool
//it does give you a warning incase of accidentally clicking.
//******************************************************************************

$scope.deletePool = function(pool){
  if(pool.role === 'fellow' || pool.role === 'instructor' || pool.role === 'memberAdmin' ){
    if(confirm('Do you want to delete this pool, once delete its gone forever?')){
      DB.deletePool(pool.id)
      .then(function(resp){
        $route.reload();
        console.log(resp)
      })
      .catch(function(err){
        console.log(err)
      })
    }
  }
  else{
    alert("you are not an admin, you may not delete this pool")
  }
}

//******************************************************************************
//This initalizes the page and sets the signed in user to the current user. It 
//also calls show pools so all the pools may be displayed on the page.
//******************************************************************************

 var init = (function(){ //function that runs on load; it'll call all the fns to set up the page
    
    new Clipboard('.clipyclip');
    $scope.loading = true;
     CurrentUser.get()
     .then(function(userData){
      console.log("Userdata: ", userData);
        if(!userData){
          $location.path('/signin');
        } 
        else{
          $scope.currentUser = userData;
          var savedState = StateSaver.restoreState(); //if we previously saved state, grab it back
          if(savedState){
            $scope = Object.assign($scope, savedState); //copy the saved state back into scope
            if(savedState.edited){
              $route.reload()
            }
          }
          Promise.all([
            $scope.showPools()
          ])
          .then(function(resolveData){
            console.log("Promises resolved");
            console.log('resolveData', resolveData)
            console.log("Current scope: ", $scope);
            $scope.loading = false;
            $scope.$apply();
          })
        }
     })
     .catch(function(err){
      $location.path('/signin');
      $scope.$apply();
     })
  }())


})