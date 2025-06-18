const { createServer } = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const SOCKET_IO_PORT = process.env.SOCKET_IO_PORT;

let waitingPlayer = null;
const allUsers = {};
const rematchRequests = {};
const rooms = {};

const BOARD_SIZE = 30;

function createDefaultGameState() {
  return Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from({ length: BOARD_SIZE }, (_, col) => row * BOARD_SIZE + col + 1)
  );
}

function checkWinner(gameState) {
  const size = gameState.length;
  const WIN_LENGTH = 5;
  const getSign = (r, c) => gameState[r]?.[c];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = getSign(r, c);
      if (cell !== "circle" && cell !== "cross") continue;

      const dirs = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ];
      for (const [dr, dc] of dirs) {
        let win = true;
        let winArray = [];
        for (let k = 0; k < WIN_LENGTH; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (
            nr < 0 ||
            nc < 0 ||
            nr >= size ||
            nc >= size ||
            getSign(nr, nc) !== cell
          ) {
            win = false;
            break;
          }
          winArray.push(nr * size + nc);
        }
        if (win) {
          return { winner: cell, winArray };
        }
      }
    }
  }
  const isDraw = gameState.flat().every((e) => e === "circle" || e === "cross");
  if (isDraw) return { winner: "draw", winArray: [] };
  return null;
}

function cleanupRoom(roomName) {
  if (rooms[roomName]) {
    Object.keys(rooms[roomName].players).forEach((sid) => {
      allUsers[sid]?.socket?.leave(roomName);
      delete allUsers[sid]?.roomName;
    });
    delete rooms[roomName];
    if (rematchRequests[roomName]) delete rematchRequests[roomName];
  }
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

    const row = Math.floor(id / BOARD_SIZE);
    const col = id % BOARD_SIZE;
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
      if (!room.cleanupTimeout) {
        room.cleanupTimeout = setTimeout(() => cleanupRoom(roomName), 5 * 1000);
      }
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

        if (rooms[roomName].cleanupTimeout) {
          clearTimeout(rooms[roomName].cleanupTimeout);
          delete rooms[roomName].cleanupTimeout;
        }
      }
      io.to(roomName).emit("rematch_accepted");
      delete rematchRequests[roomName];
    } else {
      io.to(roomName).except(socket.id).emit("rematch_requested");
    }
  });

  socket.on("rematch_declined", ({ roomName }) => {
    if (rooms[roomName]?.cleanupTimeout) {
      clearTimeout(rooms[roomName].cleanupTimeout);
      delete rooms[roomName].cleanupTimeout;
    }
    socket.to(roomName).emit("rematch_declined_by_opponent");

    cleanupRoom(roomName);
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

      if (Object.keys(rooms[roomName].players).length <= 1) {
        if (rooms[roomName].cleanupTimeout) {
          clearTimeout(rooms[roomName].cleanupTimeout);
          delete rooms[roomName].cleanupTimeout;
        }
        cleanupRoom(roomName);
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

httpServer.listen(SOCKET_IO_PORT, () => {
  console.log(`Socket.IO server running on port ${SOCKET_IO_PORT}`);
});
