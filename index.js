// Setup basic express server
const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

server.listen(process.env.PORT || 3000, () => {
  console.log("listening on *:3000");
});
// server.listen(3000, () => {
//   console.log("listening on *:3000");
// });

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

/****USER DATA STORAGE****/
// stores all rooms currently open
//    Room: {
//      roomName: name,
//      roundNum: number,
//      roomID: id,
//      users: user,
//      state: state
//    }
const rooms = {};
// holds all users
//    User: {
//      name: username
//    }
const users = {};

/****SERVER REQUEST RESOLUTION SETUP****/
io.on("connection", (socket) => {
  //server alert message
  console.log("****USER CONNECTED****");
  // adds user to list of connected players
  // currently has no data or name on init
  users[socket.id] = {
    name: "",
    id: socket.id,
    state: "start" // holds whether a state is finished, so both players start rounds at the same time
  };
  // send generated id to the user
  io.to(socket.id).emit("save id", socket.id);

  //remove user once disconnected
  socket.on("disconnect", () => {
    delete users[socket.id];
    console.log(`${socket.id} disconnected\n****USER DISCONNECTED****\n`);
  });

  // user creates a room
  socket.on("create room", (data) => {
    rooms[data[0]] = {
      roomName: data[0],
      roomID: rooms.length,
      roundNum: 0,
      users: [],
      kills: [0, 0],
      round: {},
      state: "init"
    };
    console.log(`ROOM ${data[0]} CREATED`);
    rooms[data[0]].users.push(users[data[1]]);
    console.log(`USER ${data[1]} JOINED ROOM ${rooms[data[0]].roomName}`);
  });

  // upon changing the trolley direction, tell the other player
  /**
   * data[0] - direction of the lever
   * data[1] - the roomID
   */
  socket.on("direction changed", (data) => {
    rooms[data[1]].users.forEach(e => {
      // if the id of the current user isn't the decider,
      //    send the update
      if (e.id != rooms[data[1]].round.decider.id) {
        io.to(e.id).emit("direction changed", data[0]);
      }
    });
  });

  /**
   * data: 0 - role of player
   *       1 - room id
   *       2 - player id
   *       3 - OPTIONAL (tells how many people were killed)
   */
  socket.on("game ended", (data) => {
    // if there is a kill count
    if (data[3] != -1) {
      // if the first player was the decider
      if (rooms[data[1]].users[0].id === rooms[data[1]].round.decider.id) {
        // incriment the kill count
        // select the right track according to data passed in
        if (data[3] == 0) {
          rooms[data[1]].kills[0] += rooms[data[1]].round.track1;
        } else {
          rooms[data[1]].kills[0] += rooms[data[1]].round.track2;
        }
      } else {
        // else incriment the other player's kill count
        // select the right track according to data passed in
        if (data[3] == 0) {
          rooms[data[1]].kills[1] += rooms[data[1]].round.track1;
        } else {
          rooms[data[1]].kills[1] += rooms[data[1]].round.track2;
        }
      }
    }

    // set user id, and then check if everyone is ready for the next round
    rooms[data[1]].users.forEach(e => {
      if (e.id === data[2]) {
        e.state = "ready for another game";
      }
    });

    // check how many users are ready rn
    let readied = 0;
    rooms[data[1]].users.forEach(e => {
      if (e.state === "ready for another game") {
        readied++;
      }
    });

    // if both are ready, then make a new round
    //    as long as 5 rounds haven't passed
    if (readied >= 2 && rooms[data[1]].roundNum <= 4) {
      // create a new round using the opposite player
      let newRound;
      // choose the opposite player from what the previous round was
      if (rooms[data[1]].roundNum % 2 === 0) {
        newRound = createRound(rooms[data[1]].users[1], rooms[data[1]].roomName)
      } else {
        newRound = createRound(rooms[data[1]].users[0], rooms[data[1]].roomName)
      }
      // send out new round data
      rooms[data[1]].users.forEach(e => {
        io.to(e.id).emit("start round", newRound);
        e.state = "start";
      })
      // set the room's new round
      rooms[data[1]].round = newRound;
      rooms[data[1]].roundNum++;
    } else if (rooms[data[1]].roundNum > 4) { // send out a end of game count
      rooms[data[1]].users.forEach(e => {
        let killNum;
        if (e.id === rooms[data[1]].users[0].id) {
          killNum = 0;
        } else {
          killNum = 1;
        }
        // send an event that states how many kills everyone got
        io.to(e.id).emit("end game", [killNum, rooms[data[1]].kills]);
      });
    }
  })

  // checks if a room exists before creating
  /**
   * data: 0 - player id
   *       1 - room name
   */
  socket.on("try create room", data => {
    if (!rooms[data[1]]) {
      io.to(data[0]).emit("create room", data[1]);
    }
  });

  // checks if a room exists before joining
  /**
   * data: 0 - player id
   *       1 - room name
   */
  socket.on("try join room", data => {
    if (rooms[data[1]] && rooms[data[1]].users.length < 2) {
      io.to(data[0]).emit("join room", data[1]);
    }
  })

  // user joins a room, and can start the game if both players are logged in
  socket.on("join room", (data) => {
    rooms[data[0]].users.push(users[data[1]]);
    io.to(data[1]).emit("join room", data[0]);
    console.log(`USER ${data[1]} JOINED ROOM ${rooms[data[0]].roomName}`);

    // if two players are in a room, then start the game
    rooms[data[0]].state = "player1Decide";
    // call method to generate a round's data
    // give id of player 1
    let round = createRound(rooms[data[0]].users[0], rooms[data[0]].roomName);
    rooms[data[0]].round = round;
    rooms[data[0]].users.forEach(e => {
      // send all round data generated
      console.log(`Game start SENT TO ${e.id}`);
      io.to(e.id).emit("player1 decide", round);
    });

  });

});

function createRound(id, room) {
  let time = 15000 + Math.round(((9 - rooms[room].roundNum) * 3000));
  return {
    decider: id,
    roomID: room,
    time: time,
    track1: Math.round(Math.random() * 5),
    track2: Math.round(Math.random() * 5)
  }
}