
angular.module('PU.main', ['PU.factories', angularDragula(angular)])

.controller('MainController', function ($scope, MakerPass, $location, $route, $http, StateSaver, DB, dragulaService, CurrentUser) {
  document.getElementById("bodyclass").className = "";

  $scope.currentUser = {} //Information for the current user
  $scope.classes = []; //all classes the user is a part of
  $scope.students = []; //students in the current class
  $scope.instructors = []; //the current instructors
  $scope.fellows = []; //the current fellows
  $scope.currentClass; //the current class
  $scope.groups = [];//the current assigned groups
  $scope.noPair = []; //the current students that are removed from pairings
  $scope.loadingGroups = false; //true if the partners are being grouped
  $scope.loadingList = false; //true if the list of users are being loaded
  $scope.initialized = false; //loading state, only changed on initial load
  $scope.partnerUp = false; //True if groups are assigned
  $scope.stuView = false;
  $scope.roles = ["instructor", "fellow", "student"]; //The possible roles
  $scope.genTitle;

  $scope.selectedForSwap = null; //The student object that has been selected to swap
  $scope.selectedForSwapIndex;  //The index of the student object to swap, as a tuple (2d Array Index)


  $scope.creatingGroup = false; //A boolean that determines if the create group modal should show
  $scope.modalUserList = []; //The list of users being added to the new group

  /*
  $scope.pastPairs contains the pairing history of the current students. This object has a key 
  for each student uid with the corresponding value being another object. This value object contains keys
  for the other students, with a value of true if they have been previously paired
  */
  $scope.pastPairs = {};
  $scope.finalized = true; //Set to true if the grouping has been finalized and stored; false after a new grouping is generated
  $scope.clashes = []; //Clashing groups (groups with repeats)
  var timeoutCounter = 0;
  var timeoutThreshold = 5000; //number of iterations to run before we assume we're in an infinite loop

  $scope.lockedGroups = []; //The groups that have been locked in
  $scope.lockedStus = {}; //Hash table of student uids to boolean values


  $scope.seeHistory = function(){
    if($scope.currentClass){
      StateSaver.saveState({ //save the state to restore later
        groups: $scope.groups,
        currentClass: $scope.currentClass,
        lockedGroups: $scope.lockedGroups,
        lockedStus: $scope.lockedStus,
        pastPairs: $scope.pastPairs,
        students: $scope.students,
        classes: $scope.classes,
        fellows: $scope.fellows,
        instructors: $scope.instructors,
        partnerUp: $scope.partnerUp,
        finalized: $scope.finalized,
        noPair: $scope.noPair,
        stuView: $scope.stuView,
        genTitle: $scope.genTitle
      })
      $location.path(`/${$scope.currentClass.mks_id}/history`);
    }
  }

  /**
  * signOut makes a get request to '/signout,' destroying the current session
  */

  $scope.signOut = function(){
    CurrentUser.destroy();
    document.cookie = 'token=;expires=Thu, 01 Jan 1970 00:00:01 GMT;'; //delete the token cookie
    return $http({
      method: 'GET',
      url: '/signout'
    }).then(function(){
      $location.path('/signin');
    })
    .catch(function(err){
      console.error("Logout failed: ", err);
    })
  }
  
  /**
  * ResetClass empties all the variables related to the current class
  * Acts as a helper function for changeClass to get ready for the new class
  */
  
  var resetClass = function(){
    $scope.students = [];
    $scope.instructors = [];
    $scope.fellows = [];
    $scope.groups = [];
    $scope.creatingGroup = false;
    $scope.selectedForSwap = null;
    $scope.selectedForSwapIndex = undefined;
    $scope.lockedGroups = [];
    $scope.lockedStus = [];
    $scope.finalized = true;
    $scope.partnerUp = false;
    $scope.noPair = [];
    $scope.loadingGroups = false;
    $scope.stuView = false;
  }

  /**
  * ChangeClass is called when the current class needs to change
  * ChangeClass updates the lists of people with a call to the database
  * @param cls : The new class object to switch to
  */

  $scope.changeClass = function(){
    resetClass();
    console.log("$scope.currentClass: ", $scope.currentClass);
    if($scope.currentClass === null){
      return; //do nothing if the default option is selected
    }
    $scope.loadingList = true;
    
    return DB.getMemberships($scope.currentClass.mks_id)
    .then(function(members){
      console.log("Members: ", members);
      // $scope.students = members.filter(m => m.role === 'student');
      // $scope.fellows = members.filter(m => m.role === 'fellow');
      // $scope.instructors = members.filter(m => m.role === 'instructor');
      var isStu = false;
      for(var i = 0; i < members.length; i++){
        if(members[i].role === 'student'){
          $scope.students.push(members[i]);
          if(members[i].user.name === $scope.currentUser.name){
            isStu = true;
          }
        }else if(members[i].role === 'fellow'){
          $scope.fellows.push(members[i]);
        }else if(members[i].role === 'instructor'){
          $scope.instructors.push(members[i]);
        }
      }
      $scope.stuView = isStu; //set to student view if current user is a student
      if(!$scope.stuView){
        return DB.getPairs($scope.currentClass.mks_id)
          .then(function(pairs){
            console.log("Pairs: ", pairs);
            for(var i = 0; i < pairs.length; i++){
              if(!$scope.pastPairs[pairs[i].user1_uid]){
                $scope.pastPairs[pairs[i].user1_uid] = {};
              }
              $scope.pastPairs[pairs[i].user1_uid][pairs[i].user2_uid] = true;
              if(!$scope.pastPairs[pairs[i].user2_uid]){
                $scope.pastPairs[pairs[i].user2_uid] = {};
              }
              $scope.pastPairs[pairs[i].user2_uid][pairs[i].user1_uid] = true;
            }
            console.log("Scope pastPairs: ", $scope.pastPairs);
            $scope.loadingList = false;
          })
      }else{ //if he's a student, get recent pairs instead
        return DB.getRecentPairs($scope.currentClass.mks_id)
        .then(function(pairs){
          console.log("Recent pairs: ", pairs);
          $scope.genTitle = pairs[1].title;
          pairs = pairs[0];
          var stuMap = {};
          for(var stu = 0; stu < $scope.students.length; stu++){
            stuMap[$scope.students[stu].user.uid] = $scope.students[stu]; //creates map of student uids to actual student objects
          }
          var seen = {}; //users we've already seen as user2s; don't double show
          var groupsByUser1 = {};
          for(var i = 0; i < pairs.length; i++){
            var user1 = pairs[i].user1_uid;
            var user2 = pairs[i].user2_uid;
            if(!seen[user1]){
              if(!groupsByUser1[user1]){
                groupsByUser1[user1] = [stuMap[user1]];
              }
              groupsByUser1[user1].push(stuMap[user2]);
              seen[user2] = true;
            }
          }
          for(var grp in groupsByUser1){
            $scope.groups.push(groupsByUser1[grp]);
          }
          $scope.groupSize = $scope.groups[0].length;
          $scope.loadingList = false;
        })
        .catch(function(err){
          console.error("Error fetching recent pairs: " + err);
          $scope.loadingList = false;
        })
      }
    })
  }

  /**
  * Takes a number and generates an array that contains indexes from 0 to that number
  * (Used to ng-repeat for a specific number)
  * @param num : The size of the array
  * @return An array of size num; each cell contains its index as a number
  */
  $scope.getIndexArray = function(num){
    var arr = [];
    for(var i = 0; i < num; i++){
      arr[i] = i;
    }
    return arr;
  }

  /**
  * trueRandomize generates a completely random grouping of the current students, disregarding pair history
  * trueRandomize is called if our loop threshold is reached before we are able to resolve clashes
  * @param groupSize : The size of the groups to generate
  * @return $scope.groups, after it has been updated
  */

  $scope.trueRandomize = function(groupSize){
    $scope.groups = [];
    var stus = $scope.students.filter(function(stu){
      return !$scope.lockedStus[stu.user.uid]; //don't shuffle the locked students
    })

    var shuffled = [];
    for(var i = 0; i < stus.length % groupSize; i++){
      stus.push({user: {name: "Code Monkey", uid: "-" + i, avatar_url:'https://s-media-cache-ak0.pinimg.com/564x/7e/e7/fe/7ee7fe7d2753c6c47715a95c8508533d.jpg'}}); //give them decrementing ids
    }

    while(stus.length){
      var randInd = Math.floor(Math.random() * stus.length);
      shuffled.push(stus.splice(randInd, 1)[0]);
    }

    var clashIndexes = [];
    var tempGroups = [];
    var strandedIndexes = [];
    for(var i = 0; i < shuffled.length; i += groupSize){
      var group = shuffled.slice(i, i+groupSize);
      $scope.groups.push(group);
    }
    for(var i = 0; i < $scope.lockedGroups.length; i++){
      $scope.groups.splice($scope.lockedGroups[i][1], 0, $scope.lockedGroups[i][0])
    }
    checkClashes();
    $scope.partnerUp = true;
    $scope.finalized = false;
    $scope.loadingGroups = false;
    return $scope.groups;
  }

  /**
  * Randomize generates a grouping of the current students, attempting to avoid clashes
  * Recursively calls itself if we were unable to make non-repeating groups; if this recursion occurs
  * too many times, the user is alerted, and trueRandomize is called instead
  * @param groupSize : The size of the groups to generate
  * @return $scope.groups, after it has been updated
  */

  $scope.randomize = function(groupSize){
    $scope.genTitle = "";
    $scope.loadingGroups = true;
    if(!groupSize){
      groupSize = 2; //default group size to 2
    }
    groupSize = Number(groupSize);
    timeoutCounter += 1;

    if(!$scope.noRepeats){
      return $scope.trueRandomize(groupSize);
    }

    if(timeoutCounter > timeoutThreshold){
      alert(`Uh oh! We were unable to generate a list without repeating pairs; this is likely because ` +
      `most of the possible pairs, if not all of them, have already occurred. Here's a random list anyway. Sorry!`);
      timeoutCounter = 0;
      return $scope.trueRandomize(groupSize);
    }
    $scope.groups = [];
    var stus = $scope.students.filter(function(stu){
      return !$scope.lockedStus[stu.user.uid]; //don't shuffle the locked students
    })

    var shuffled = [];
    for(var i = 0; i < stus.length % groupSize; i++){
      stus.push({user: {name: "Code Monkey", uid: "-" + i, avatar_url:'https://s-media-cache-ak0.pinimg.com/564x/7e/e7/fe/7ee7fe7d2753c6c47715a95c8508533d.jpg'}});
    }

    while(stus.length){
      var randInd = Math.floor(Math.random() * stus.length);
      shuffled.push(stus.splice(randInd, 1)[0]);
    }

    while(shuffled.length){
      var first = shuffled[0];
      var group = [first];
      for(var j = 1; j < shuffled.length; j++){
        var failed = true;
        var noClashes = true;
        for(var k = 0; k < group.length; k++){
          if($scope.pastPairs[group[k].user.uid]){
            if($scope.pastPairs[group[k].user.uid][shuffled[j].user.uid]){
              noClashes = false;
              break;
            }
          }
        }
        if(noClashes){
          group.push(shuffled[j]);          
          shuffled.splice(j, 1);
          j--;
        }else{
          continue;
        }
        if(group.length === groupSize){
          $scope.groups.push(group);
          shuffled.splice(0, 1);
          failed = false;
          break;
        }
      }
      if(failed){
        return $scope.randomize(groupSize);
      }
    }
    for(var i = 0; i < $scope.lockedGroups.length; i++){
      $scope.groups.splice($scope.lockedGroups[i][1], 0, $scope.lockedGroups[i][0])
    }
    $scope.partnerUp = true;
    $scope.finalized = false;
    checkClashes();
    timeoutCounter = 0;
    $scope.loadingGroups = false;
    return $scope.groups;
  }

  $scope.filterGroupsByName = function(group){
    if(!$scope.groupSearch) return true;
    var search = $scope.groupSearch.toLowerCase();
    return group.filter(stu => stu.user.name.toLowerCase().includes(search)).length;
  }

  /**
  * CheckClashes checks the current groups for any groups in which students have previously worked together
  * Any clashing groups will be pushed to $scope.groups
  */

  var checkClashes = function(){
    $scope.clashes = [];
    for(var i = 0; i < $scope.groups.length; i++){
      var group = $scope.groups[i];
      for(var j = 0; j < group.length; j++){
        var pushed = false;
        for(var k = j; k < group.length; k++){
          if($scope.pastPairs[group[j].user.uid]){            
            if($scope.pastPairs[group[j].user.uid][group[k].user.uid]){
              $scope.clashes.push(group);
              pushed = true;
              break;
            }
          }
        }
        if(pushed){
          break;
        }
      }
    }
  }

  /**
  * Finalize takes the current pairings and records them into the "past pairs" object
  */

  $scope.finalize = function(){
    if($scope.genTitle && $scope.genTitle.length){      
      var newPairs = [];
      for(var i = 0; i < $scope.groups.length; i++){
        for(var j = 0; j < $scope.groups[i].length; j++){
          for(var k = j+1; k < $scope.groups[i].length; k++){
            if(!$scope.pastPairs[$scope.groups[i][j].user.uid]){
              $scope.pastPairs[$scope.groups[i][j].user.uid] = {};
            }
            $scope.pastPairs[$scope.groups[i][j].user.uid][$scope.groups[i][k].user.uid] = true;
            newPairs.push([$scope.groups[i][j].user.uid, $scope.groups[i][k].user.uid]); //new pairs to save in DB
            if(!$scope.pastPairs[$scope.groups[i][k].user.uid]){
              $scope.pastPairs[$scope.groups[i][k].user.uid] = {};
            }
            $scope.pastPairs[$scope.groups[i][k].user.uid][$scope.groups[i][j].user.uid] = true; 
          }
        }
      }
      DB.addPairs($scope.currentClass.mks_id, newPairs, $scope.genTitle, $scope.groupSizeSelect);
      $scope.finalized = true;
      //$scope.genTitle = "";
    }else{
      alert("Please enter a title for this class list");
    }
  }

  /**
  * removeFromStudent takes in a student object and removes it from the students list
  * Removed students are stored in the noPair array
  * @param student The student object to remove
  */

  $scope.removeFromStudent = function(student){
     var index = $scope.students.indexOf(student);
     $scope.noPair.push($scope.students.splice(index, 1)[0]);
  }

  /**
  * addStudentBackIn takes in a student object from the noPair array and removes it
  * The student object is then placed into the students array
  * @param nopair The student object to place back into the students array
  */

  $scope.addStudentBackIn = function(nopair){
    var index = $scope.noPair.indexOf(nopair);
    $scope.students.push($scope.noPair.splice(index,1)[0]);
  }

  $scope.getClasses = function(){
      return DB.getClasses()
      .then(function(classes){
        var already = {};
        for(var i = 0; i < $scope.classes.length; i++){
          already[$scope.classes[i]] = true;
        }
        for(var j = 0; j < classes.length; j++){
          console.log("classes: ", classes[j]);
          if(!already[classes[j]]){
            $scope.classes.push(classes[j]);
          }
        }
        $scope.loading = false;
      })
  }

  //Functions for rearranging students

  /**
  * selectForSwap takes in a student object from groups. If another student is currently selected, they will be swapped
  * If no other student is currently selected, the passed in student will be selected
  * If the student passed in is the same as the currently selected student, they will be unselected
  * Students that have been locked in place cannot be selected
  * @param student The student object that has been selected
  */

  $scope.selectForSwap = function(student){
    if($scope.stuView){
      return;
    }
    if($scope.lockedStus[student.user.uid]){
      alert("This student has been locked into a group; please unlock them before moving them around");
      return;
    }
    var selectedIndex = searchForSelected(student);
    if($scope.selectedForSwap === student){
      $scope.selectedForSwap = null;
      $scope.selectedForSwapIndex = null;
    }else if($scope.selectedForSwap === null){
      $scope.selectedForSwap = student;
      $scope.selectedForSwapIndex = selectedIndex; 
    }else{
      swapStus(selectedIndex, $scope.selectedForSwapIndex);
      $scope.selectedForSwap = null;
      $scope.selectedForSwapIndex = null;
      if($scope.finalized){
        alert("Note: the groups have already been finalized; any manual edits will not be recorded")
      }
    }
    checkClashes();
  }

  /**
  * searchForSelected is a helper function for selectForSwap
  * searchForSelected takes in a student object and searches the groups for its index
  * @param student The student object to search for
  * @return The index tuple for the student's location in groups; if the student is not found, returns undefined
  */

  var searchForSelected = function(student){
    for(var i = 0; i < $scope.groups.length; i++){
      for(var j = 0; j < $scope.groups[i].length; j++){
        if($scope.groups[i][j] === student){
          return [i, j];
        }
      }
    }
  }

  /**
  * swapStus is a helper function for selectForSwap
  * swapStus takes in 2 index tuples from $scope.groups and swaps the students in those locations
  * @param indexTuple1 The index of the first student selected to swap
  * @param indexTuple2 The index of the second student selected to swap
  */

  var swapStus = function(indexTuple1, indexTuple2){
    var tmp = $scope.groups[indexTuple1[0]][indexTuple1[1]];
    $scope.groups[indexTuple1[0]][indexTuple1[1]] = $scope.groups[indexTuple2[0]][indexTuple2[1]]
    $scope.groups[indexTuple2[0]][indexTuple2[1]] = tmp;
  }

  /**
  * toggleLockGroup takes in a group array from $scope.groups and either locks or unlocks the group
  * Locked groups will not be shuffled when randomized is called
  * The locked groups are stored in $scope.lockedGroups as a tuple, with their index from groups at index 1
  * @param group The group array to lock or unlock
  * @return "unlocked" if the group has been unlocked, "locked" if it has been locked
  */

  $scope.toggleLockGroup = function(group){
    for(var i = 0; i < $scope.lockedGroups.length; i++){
      if($scope.lockedGroups[i][0] === group){ //found the group in the locked groups
        var unlocked = $scope.lockedGroups.splice(i, 1)[0][0];
        for(var j = 0; j < unlocked.length; j++){
          $scope.lockedStus[unlocked[j].user.uid] = false; //unlock the students in the group
        }      
        return "unlocked";
      }
    }

    var index = $scope.groups.indexOf(group);
    $scope.lockedGroups.push([group, index]); //track the pair
    for(var j = 0; j < group.length; j++){
      if($scope.selectedForSwap === group[j]){
        $scope.selectedForSwap = null;
        $scope.selectedForSwapIndex = null; //deselect them if they're selected
      }
      $scope.lockedStus[group[j].user.uid] = true; //make sure the students don't get reshuffled
    }
    return "locked";
  }

  /**
  * searchLockedGroups searches $scope.lockedGroups for a specific group and returns true if it has been found
  * @param group The group array to search for
  * @return True if the group is found, false if it is not
  */

  $scope.searchLockedGroups = function(group){
    for(var i = 0; i < $scope.lockedGroups.length; i++){
      if($scope.lockedGroups[i][0] === group){ //found the group in the locked groups
        return true;
      }
    }
    return false;    
  }

  //Functions for the createGroup Modal below

  $scope.modalAdmins = [];
  $scope.modalStudents = [];
  $scope.modalCohorts = [];
  $scope.modalAddedAdmins = [];
  $scope.modalAddedStus = [];
  $scope.selectedCohort;
  $scope.loadingModalUsers=false;
  $scope.modalAddedUids = [];

  /**
  * openCreateModal resets the information in the create group modal and shows it on the page
  */

  $scope.openCreateModal = function(){
    $scope.modalAddedAdmins = [];
    $scope.modalAddedStus = [];
    $scope.creatingGroup = true;
  }

  /**
  * closeCreateModal hides the create group modal
  */

  $scope.closeCreateModal = function(){
    $scope.creatingGroup = false;
  }

  $scope.changeModalCohort = function(){
    console.log("Changing cohort to: ", $scope.selectedCohort);
    $scope.modalStudents = [];
    $scope.modalAdmins = [];
    $scope.loadingModalUsers = true;
    return MakerPass.getMemberships($scope.selectedCohort)
    .then(function(members){
      for(var i = 0; i < members.length; i++){
        if(members[i].role === "student"){
          $scope.modalStudents.push(members[i]);
        }else{
          $scope.modalAdmins.push(members[i]);
        }
      }
      $scope.loadingModalUsers = false;
    })
    .catch(function(err){
      $scope.loadingModalUsers = false;
      console.error("Error loading users: ", err);
    })
  }

  $scope.addModalStu = function(stu){
    $scope.modalStudents.splice($scope.modalStudents.indexOf(stu), 1);
    $scope.modalAddedStus.push(stu);
    $scope.modalAddedUids.push(stu.user.uid);
  }

  $scope.addModalAdmin = function(ad){
    $scope.modalAdmins.splice($scope.modalAdmins.indexOf(ad), 1);
    $scope.modalAddedAdmins.push(ad);
    $scope.modalAddedUids.push(ad.user.uid);
  }

  $scope.removeModalAdmin = function(ad){
    $scope.modalAddedAdmins.splice($scope.modalAddedAdmins.indexOf(ad), 1);
    $scope.modalAddedUids.splice($scope.modalAddedUids.indexOf(ad.user.uid), 1);
    $scope.modalAdmins.push(ad);
  }

  $scope.removeModalStu = function(stu){
    $scope.modalAddedStus.splice($scope.modalAddedStus.indexOf(stu), 1);
    $scope.modalAddedUids.splice($scope.modalAddedUids.indexOf(stu.user.uid), 1);
    $scope.modalStudents.push(stu);
  }

  /**
  * TODO: make this function make database calls to create new classes
  */

  $scope.createClass = function(){
    return DB.createClass()//TODO: find out how we want to send shit)
    $scope.closeCreateModal();
  }
//***********************dragula under here ***********************************************
//   dragulaService.options($scope, 'bag-one', {
        
//         invalid: function (el, target) { // prevent buttons and anchor tags from starting a drag
//             return  el.tagName === 'IMG';
//         },

//          moves: function (el, source, handle, sibling) {
//     return el.tagName !== 'IMG';
//   // elements are always draggable by default
//   }
//         ,
//           direction: 'vertical', // Y axis is considered when determining where an element would be dropped
//           // mirrorContainer: $scope.groups,
          
//     });
  

//   $scope.$on('bag-one.drop-model', function (e, el, target, source) {
//     console.log(el);
// //    $scope.groups.length = 0; 
// //    console.log('I GOT HERE WOAH')//clears the array
// // groups.forEach(function(item) {
// //   $scope.groups.push(item);
// // })
// })
//**************************dragula above here (no touchie!!!!)*******************************
  var init = (function(){ //function that runs on load; it'll call all the fns to set up the page
    $scope.loading = true;
    new Clipboard('.clipyclip');
    // var cookies = document.cookie;
    // console.log("Cookies: ", cookies);
    // cookies = cookies.slice(cookies.indexOf('session') + 8)
    // var session = cookies;
    // console.log("session: ", session);
    // $http({ //Check the current user; redirect if we aren't logged in
    //   method: "GET",
    //   url: "/currentUser",
    //   headers: {
    //     'token': session
    //   }
    // })
    // .then(function(resp){
     // console.log("resp", resp)
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
            $scope.getClasses(),
            MakerPass.getCohorts()
          ])
          .then(function(resolveData){
            console.log("Promises resolved");
            $scope.modalCohorts = resolveData[1];
            $scope.initialized = true;
            console.log("Current scope: ", $scope);
            $scope.$apply();
          })
        }
     })
     .catch(function(err){
      $location.path('/signin');
      $scope.$apply();
     })
    //})
  }())

})

