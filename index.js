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

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

/****USER DATA STORAGE****/
// stores all rooms currently open
//    Room: {
//      roomName: name,
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
     users: [],
     state: "init"
    };
    console.log(`ROOM ${data[0]} CREATED`);
    rooms[data[0]].users.push(users[data[1]]);
    console.log(`USER ${data[1]} JOINED ROOM ${rooms[data[0]].roomName}`);
    io.to(socket.id).emit("join room", rooms[data[0]]);
  });

  // user joins a room, and can start the game if both players are logged in
  socket.on("join room", (data) => {
    rooms[data[0]].users.push(users[data[1]]);
    io.to(data[1]).emit("join room", data[0]);
    console.log(`USER ${data[1]} JOINED ROOM ${rooms[data[0]].roomName}`);

    // if two players are in a room, then start the game
      rooms[data[0]].state = "player1Decide";
      // call method to generate a round's data
      // give id of player 1
      let round = createRound(rooms[data[0]].users[0]);
      console.log(rooms[data[0]].users, rooms[data[0]].users.length);
      rooms[data[0]].users.forEach(e => {
        // send all round data generated
        console.log(`Game start SENT TO ${e.id}`)
        io.to(e.id).emit("player1 decide", round);
      });
    
  });
  
});

function createRound(id) {
  return {
    decider: id,
    track1: Math.round(Math.random() * 5),
    track2: Math.round(Math.random() * 5)
  }
}

  // //add user to array of users when recieved by server
  // socket.on("add user", (data) => {
  //   if (data.userType === "DM") {
  //     dm = data;
  //     users["DM"] = data;
  //     socket.username = data.username; //adds username to socket
  //     console.log(`USER ADDED  :  ${socket.username}\n`);
  //   } else {
  //     if (users[data.username]) {
  //       io.to(data.userID).emit("retry username");
  //     } else {
  //       users[data.username] = data;
  //       socket.username = data.username; //adds username to socket
  //       console.log(`USER ADDED  :  ${socket.username}\n`);
  //     }
  //   }
  // });


  // EXAMPLES: 

  // //takes chat messages
  // socket.on("chat message", (data) => {
  //   socket.broadcast.emit("chat message", data);
  // });

  // //takes private messages
  // socket.on("private message", (data) => {
  //   //fix bug with usernames
  //   if (data.note.recipient in users) {
  //     //data.note.username = users[data.note.sender].username;
  //     io.to(users[data.note.recipient].userID).emit("private message", data);
  //     if (
  //       data.note.senderID != dm.userID && data.note.recipient != "DM"
  //     ) {
  //       io.to(users["DM"].userID).emit("private message", data);
  //     }
  //   } else if (dm != undefined && dm != null) {
  //     io.to(users["DM"].userID).emit("private message", data);
  //   }
  // });