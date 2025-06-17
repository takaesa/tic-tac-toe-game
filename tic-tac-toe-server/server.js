const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3001",
  },
});

let waitingPlayer = null;
const allUsers = {};
const rematchRequests = {};
const rooms = {};

function createDefaultGameState() {
  return [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];
}

function checkWinner(gameState) {
  for (let row = 0; row < 3; row++) {
    if (
      gameState[row][0] === gameState[row][1] &&
      gameState[row][1] === gameState[row][2]
    ) {
      return {
        winner: gameState[row][0],
        winArray: [row * 3 + 0, row * 3 + 1, row * 3 + 2],
      };
    }
  }
  for (let col = 0; col < 3; col++) {
    if (
      gameState[0][col] === gameState[1][col] &&
      gameState[1][col] === gameState[2][col]
    ) {
      return {
        winner: gameState[0][col],
        winArray: [0 * 3 + col, 1 * 3 + col, 2 * 3 + col],
      };
    }
  }
  if (
    gameState[0][0] === gameState[1][1] &&
    gameState[1][1] === gameState[2][2]
  ) {
    return { winner: gameState[0][0], winArray: [0, 4, 8] };
  }
  if (
    gameState[0][2] === gameState[1][1] &&
    gameState[1][1] === gameState[2][0]
  ) {
    return { winner: gameState[0][2], winArray: [2, 4, 6] };
  }
  const isDraw = gameState.flat().every((e) => e === "circle" || e === "cross");
  if (isDraw) return { winner: "draw", winArray: [] };
  return null;
}

io.on("connection", (socket) => {
  allUsers[socket.id] = {
    socket,
    online: true,
    playing: false,
  };

  // RANDOM MODE
  socket.on("request_to_play", (data) => {
    const currentUser = allUsers[socket.id];
    currentUser.playerName = data.playerName;

    if (waitingPlayer && waitingPlayer.socket.id !== socket.id) {
      const opponentPlayer = waitingPlayer;
      waitingPlayer = null;

      const roomName = `room-${opponentPlayer.socket.id}-${socket.id}`;

      currentUser.playing = true;
      opponentPlayer.playing = true;

      currentUser.socket.join(roomName);
      opponentPlayer.socket.join(roomName);

      currentUser.roomName = roomName;
      opponentPlayer.roomName = roomName;

      rooms[roomName] = {
        gameState: createDefaultGameState(),
        currentTurn: "circle",
        players: {
          [currentUser.socket.id]: {
            sign: "cross",
            playerName: currentUser.playerName,
          },
          [opponentPlayer.socket.id]: {
            sign: "circle",
            playerName: opponentPlayer.playerName,
          },
        },
        finished: false,
      };

      currentUser.socket.emit("OpponentFound", {
        opponentName: opponentPlayer.playerName,
        playingAs: "cross",
        roomName,
      });
      opponentPlayer.socket.emit("OpponentFound", {
        opponentName: currentUser.playerName,
        playingAs: "circle",
        roomName,
      });
    } else {
      waitingPlayer = currentUser;
      socket.emit("OpponentNotFound");
    }
  });

  socket.on("check_room_exists", ({ roomName }, callback) => {
    if (rooms[roomName]) {
      callback({ exists: true });
    } else {
      callback({ exists: false });
    }
  });

  // FRIEND ROOM MODE
  socket.on("join_room_by_id", ({ playerName, roomName, password, create }) => {
    if (create) {
      if (!rooms[roomName]) {
        rooms[roomName] = {
          players: {
            [socket.id]: { playerName, sign: "circle" },
          },
          gameState: createDefaultGameState(),
          currentTurn: "circle",
          finished: false,
          password,
        };
        socket.join(roomName);
        socket.roomName = roomName;
        socket.playingAs = "circle";
        socket.emit("OpponentNotFound", { roomName });
      } else if (Object.keys(rooms[roomName].players).length >= 2) {
        socket.emit("roomFull");
      } else {
        socket.emit("roomAlreadyExists");
      }
    } else {
      if (!rooms[roomName]) {
        socket.emit("roomNotFound");
        return;
      }
      if (rooms[roomName].password !== password) {
        socket.emit("wrongRoomPassword");
        return;
      }
      if (Object.keys(rooms[roomName].players).length === 1) {
        const firstSocketId = Object.keys(rooms[roomName].players)[0];
        rooms[roomName].players[socket.id] = { playerName, sign: "cross" };
        socket.join(roomName);
        socket.roomName = roomName;
        socket.playingAs = "cross";
        const opponent = rooms[roomName].players[firstSocketId];
        socket.emit("OpponentFound", {
          opponentName: opponent.playerName,
          playingAs: "cross",
          roomName,
        });
        allUsers[firstSocketId]?.socket?.emit("OpponentFound", {
          opponentName: playerName,
          playingAs: "circle",
          roomName,
        });
      } else {
        socket.emit("roomFull");
      }
    }
  });

  // GAME LOGIC
  socket.on("player_move", ({ id, roomName, sign }) => {
    if (!rooms[roomName]) return;
    const room = rooms[roomName];
    if (room.finished) return;

    if (room.currentTurn !== sign) return;
    if (!room.players[socket.id] || room.players[socket.id].sign !== sign)
      return;

    const row = Math.floor(id / 3);
    const col = id % 3;
    if (
      room.gameState[row][col] === "circle" ||
      room.gameState[row][col] === "cross"
    ) {
      return;
    }

    room.gameState[row][col] = sign;

    const check = checkWinner(room.gameState);
    if (check) {
      room.finished = true;
      io.to(roomName).emit("playerMoveFromServer", {
        state: { id, sign },
        finished: true,
        winner: check.winner,
        winArray: check.winArray,
      });
      return;
    }

    room.currentTurn = sign === "circle" ? "cross" : "circle";
    io.to(roomName).emit("playerMoveFromServer", {
      state: { id, sign },
      finished: false,
    });
  });

  // REMATCH
  socket.on("request_rematch", ({ roomName }) => {
    if (!rematchRequests[roomName]) rematchRequests[roomName] = new Set();
    rematchRequests[roomName].add(socket.id);

    if (rematchRequests[roomName].size === 2) {
      if (rooms[roomName]) {
        rooms[roomName].gameState = createDefaultGameState();
        rooms[roomName].currentTurn = "circle";
        rooms[roomName].finished = false;
      }
      io.to(roomName).emit("rematch_accepted");
      delete rematchRequests[roomName];
    } else {
      io.to(roomName).except(socket.id).emit("rematch_requested");
    }
  });

  socket.on("rematch_declined", ({ roomName }) => {
    socket.to(roomName).emit("rematch_declined_by_opponent");
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    const currentUser = allUsers[socket.id];
    const roomName = currentUser?.roomName;

    if (waitingPlayer?.socket.id === socket.id) {
      waitingPlayer = null;
    }

    if (roomName && rooms[roomName]) {
      socket.to(roomName).emit("opponentLeftMatch");
      if (rooms[roomName].players[socket.id]) {
        delete rooms[roomName].players[socket.id];
      }
      if (Object.keys(rooms[roomName].players).length === 0) {
        delete rooms[roomName];
      }
    }

    if (roomName && rematchRequests[roomName]) {
      rematchRequests[roomName].delete(socket.id);
      if (rematchRequests[roomName].size === 0) {
        delete rematchRequests[roomName];
      }
    }

    delete allUsers[socket.id];
    socket.removeAllListeners();
  });
});

httpServer.listen(3000, () => {
  console.log("Socket.IO server running on port 3000");
});
