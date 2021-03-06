var pg = require('pg');
var config = require('../knexfile.js')
var env = process.env.NODE_ENV || 'production';
var knex = require('knex')(config[env]);


"use strict";
knex.migrate.latest([config[env]]);


/**
  @params: sessionUid = (string) Session
  return: throws 401 if no session
*/
knex.authenticate = (token) => {
  if(process.env.TEST_AUTH) return Promise.resolve();
    // console.log("token in auth", token)
  return knex('auth').where('token', token).returning('user_uid')
    .then((userUid) => {
      // console.log("user:", userUid)
      if(userUid.length) {
        return Promise.resolve(userUid[0]);
      } else {
        return Promise.reject("401 Unauthorized, please make sure you are logged in");
      }
    }).catch((err) => {throw new Error("Unable to authenticate user, "+ err)}) // throw error if something went horribly wrong
}

knex.addToken = (userToken, userUid) => {
  // console.log("user and token", userUid, " ", userToken)
  return knex('auth').where('user_uid', userUid).returning('user_uid')
    .then((uid) => {
      if(uid.length) 
        return knex('auth').where({user_uid: userUid}).update("token", userToken).returning('*')
          .then((authData) => authData[0])
          .catch((err) => {console.log("err:",err); throw new Error("Unable to add token, "+ err)}); // throw error if something went horribly wrong
      else 
        return knex('auth').insert({user_uid: userUid, token: userToken}).returning('*')
          .then((authData) => authData[0])
          .catch((err) => {console.log("err:",err); throw new Error("Unable to add token, "+ err)});// throw error if something went horribly wrong
    }).catch((err) => {console.log("err2:",err); throw new Error("Unable to find token, "+ err)}) // throw error if something went horribly wrong
}
/**
  @params: group = {
    'name': (string)name,
    'groupId': (int)mksId
  }
  return: 'added student to group' or error
*/
knex.addGroups = (groups) => {
  return getGroupIds()
    .then((dbGroupIds) => {
      for(var i = 0, groupArray = [], oldGroups =[]; i < groups.length; i++){
        if(!dbGroupIds.includes(groups[i].uid))  // if group doesnt exist in database
          groupArray.push({name: groups[i].name, mks_id: groups[i].uid}); // need to add to database
        else oldGroups.push({name: groups[i].name, mks_id: groups[i].uid}); // if it does
      }
      if(groupArray.length){ // if there something to add to database
        return knex.batchInsert('groups', groupArray, groupArray.length).returning('*')
          .then((groups) =>  groups.concat(oldGroups)) // return all the groups that were added and old once
          .catch((err) => {throw new Error("unable to add to group due to: "+ err)}) // throw error if something went horribly wrong
      } else return Promise.resolve(oldGroups); // else return old groups
    }).catch((err) => {throw new Error("Unable to add to groups, "+ err)}) // throw error if something went horribly wrong
}

/**
  @params: pairData = ({
    'pairs': (array)[(user1_uid, user2_uid), (user1_uid, user2_uid), ...],
    'genTitle': (string)title,
    'groupSize': (integer)groupSize
  }, (string)groupName)
  return: 201 or error
*/
knex.addPairs = (pairData, groupUid) => {
  return knex.getGroup({mks_id: groupUid}) // returns group_id
  .then((group) => group.id ) // sets the gId for generations and pairs tables in database
  .catch((err) => {throw new Error("Unable to to access groups, "+ err)})
  .then((gId) => {
    return addGeneration({groupId: gId, genTitle: pairData.genTitle, groupSize: pairData.groupSize}) //adds or finds generation for group
    .then((genId) => {
      for(var i = 0, rows = []; i < pairData.pairs.length; i++) // creates an object for the database 
        rows.push({
          user1_uid: pairData.pairs[i][0], // user 1
          user2_uid: pairData.pairs[i][1], // user 2
          group_id: gId, // group id in our database
          gen_table_id: genId // generation id on database
        });
      
      return knex.batchInsert('pairs', rows, pairData.pairs.length) 
        .then((e) => ('pairs added')) // returns string for client that pair is added
        .catch((err) => {throw new Error("Batch Inrest Failed due to: "+ err)}) // throw error if something went horribly wrong
    }).catch((err) => {throw new Error("Unable to create generation, "+ err)}) // throw error if something went horribly wrong
  }).catch((err) => {throw new Error("Unable to find the group in database, "+ err)}) // throw error if something went horribly wrong
}

/**
  @params: pairData = ({
    'pairs': (array)[(user1_uid, user2_uid), (user1_uid, user2_uid), ...],
    'genTitle': (string)title,
    'groupSize': (integer)groupSize
  }, (string)groupName)
  return: 201 or error
*/
knex.addBadPairs = (pairData, groupUid) => {
  return knex.getGroup({mks_id: groupUid}) // returns group_id
  .then((gId) => {
    console.log('gId: ', gId.id)
    for(var i = 0, rows = []; i < pairData.pairs.length; i++) // creates an object for the database 
          rows.push({
            user1_uid: pairData.pairs[i][0], // user 1
            user2_uid: pairData.pairs[i][1], // user 2
            group_id: gId.id, // group id in our database
          });
    return knex.batchInsert('bad_pairs', rows, pairData.pairs.length)
      .then((e) => ('bad pairs added')) // returns string for client that pair is added
      .catch((err) => {throw new Error("Unable to add bad pairs, "+ err)}) // throw error if something went horribly wrong
  })
}

/**
  @params: groupId = {
            groupId: (integer)id,
            genTitle: (string)genTitle,
            groupSize: (integer)groupSize
          }

  return: return id 
*/
knex.deleteGeneration = (groupId, genTableId) => {
  return knex('generations').where({id: genTableId}).del()
  .then((e) => knex('pairs').where({gen_table_id: genTableId, group_id: groupId}).del()
    .then((e) => "deleted generation and pairs related to genId " +genTableId
    ).catch((err) => {throw new Error("Unable to delete pairs for gen from DataBase, "+ err)}) // throw error if something went horribly wrong
  ).catch((err) => {throw new Error("Unable to delete generation and pairs from DataBase, "+ err)}) // throw error if something went horribly wrong
}

/**
  @params: genData = {
            groupId: (integer)id,
            genTitle: (string)genTitle,
            groupSize: (integer)groupSize
          }

  return: return id 
*/
function addGeneration(genData) {
  return knex('generations').where({group_id: genData.groupId, title: genData.genTitle, group_size: genData.groupSize}).returning("*")
  .then((exist) => {
    if(!exist.length){ // if array is empty  
      return knex('generations').where({group_id:genData.groupId}).returning("gen_id")
      .then((next) => {
        for(var i=0, max =0; i<next.length;i++) if(next[i].gen_id > max) max = next[i].gen_id;
        return knex('generations').insert({
          group_id:   genData.groupId, // adds the group
          title:      genData.genTitle,// adds the title
          gen_id:     max+1,     // adds the generation by finding how many generation were before
          group_size: genData.groupSize// group size for better history 
        }).returning('id').then((id) => id[0])// returns the id
      }).catch((err) => {throw new Error("unable to create new generation,"+ err)}) // throw error if something went horribly wrong
    }else return (exist[0].id) // if exist it will just return old generation id
  }).catch((err) => {throw new Error("parems aren't correct when calling addGeneration, "+ err)}) // throw error if something went horribly wrong
}

/* 
  params: 
    group = {
    'name': (string)name 
    } 
      OR
    group = {
    'mksId': (string)mksId
    } 
      OR
    group = {
    'id': (int)ID
    }
  return: Object with group information
*/
knex.getGroup = (group) => {
  if(typeof group.name == "string") // checks if givin a name
    return knex('groups').where('name', group.name).returning('*')
      .then((groupData) => groupData[0] || {id: -1})
      .catch((err) => {throw new Error("incorrect format, "+ err)}) // throw error if something went horribly wrong
  if(typeof group.id == 'integer') // checks if givin a non mks id
    return knex('groups').where('id', group.id).returning('*')
      .then((groupData) => groupData[0] || {id: -1}) 
      .catch((err) => {throw new Error("incorrect format, "+ err)})
  //else just assumes that its mks_id and checks for that 
  return knex('groups').where({mks_id: group.mks_id}).returning('*') // throw error if something went horribly wrong
    .then((groupData) => groupData[0] || {id: -1}) 
    .catch((err) => {throw new Error("incorrect format, "+ err)})  // throw error if something went horribly wrong 
}

knex.getTables = () => {
  return knex('auth').returning('*')
}
knex.getTables2 = () => {
  return knex('bad_pairs').returning('*')
}

/**
  @params: groupId = (string) group uid
  return: array of pairs of the group
*/
knex.getPairsForGroup = (groupId) => {
  return knex('pairs').where({'group_id': groupId}).returning('*')
    .then((pairsWithId) => pairsWithId)// returns all pairs for id
    .catch((err) => {throw new Error("database off-line, "+ err)}) // throw error if something went horribly wrong
}

/**
  @params: groupId = (string) group uid
  return: array of bad pairs of the group
*/
knex.getBadPairsForGroup = (groupId) => {
  return knex('bad_pairs').where({'group_id': groupId}).returning('*')
    .then((pairsWithId) => pairsWithId)// returns all pairs for id
    .catch((err) => {throw new Error("database off-line, "+ err)}) // throw error if something went horribly wrong
}

/**
  @params: groupId = (int) generation table id
  return: return {
    genId: (int) gen_id,
    groupSize: (int) group_size,
    groupTitle: (string) group_title 
  }
*/
knex.getGenerationsByGroup = (groupId) => {
  return knex('generations').where('group_id', groupId).returning("*")
  .then((gen) => gen) // returns all gens for id
  .catch((err) => {throw new Error("database off-line, "+ err)}) // throw error if something went horribly wrong
}

/**
  returns an array of uids of all the groups 
*/
function getGroupIds() {
  return knex('groups').select('mks_id')
    .then((ids) => {
      for(var i=0, mergeIds = []; i<ids.length; i++) mergeIds.push(ids[i].mks_id); // only leave uids 
      return mergeIds; // return the uid array 
    })
    .catch((err) => {throw new Error("database off-line, "+ err)}) // throw error if something went horribly wrong
}

knex.getNewGen = (groupId) =>{
  return knex('generations').where('group_id', groupId).returning("*")
  .then((next) => {
    for(var i=0, max =0; i<next.length;i++) if(next[i].gen_id > max) max = i;
    console.log('max:',max, "group id:", groupId)
    return knex('pairs').where({gen_table_id: next[max].id, group_id: groupId}).returning("*")
    .then((pairs) => [pairs, next[max]])
  })
  .catch((err) => {throw new Error("cannot find gen_id, "+ err)}) // throw error if something went horribly wrong

}

/**
  @params: groupId = (int) group_id
  return: 'Pairs have been reset'
*/
knex.resetPairs = (groupId) => {
  return knex('pairs')
    .where('group_id', groupId)
    .del()
    .then(() => {
      return knex('generations')
        .where('group_id', groupId)
        .del()
        .then(() => 'Pairs have been reset')
        .catch((err) => {throw new Error("Could not reset pairs in generations table, "+ err)}) // throw error if something went horribly wrong
    }).catch((err) => {throw new Error("Could not reset pairs in pairs table, "+ err)}) // throw error if something went horribly wrong
}

/**
  @params: groupId = (int) group_id
  return: 'Bad pairs have been reset'
*/
knex.resetBadPairs = (groupId) => {
  return knex('bad_pairs')
    .where('group_id', groupId)
    .del()
    .then(() => 'Pairs have been reset')
    .catch((err) => {throw new Error("Could not reset pairs in pairs table, "+ err)}) // throw error if something went horribly wrong
}
module.exports = knex;
