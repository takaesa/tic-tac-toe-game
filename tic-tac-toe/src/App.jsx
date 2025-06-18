import React, { useState, useEffect } from "react";
import "./App.css";
import Square from "./Square/Square";
import Swal from "sweetalert2";
import useSocket from "./hooks/useSocket";

const BOARD_SIZE = 30;

const defaultGameState = Array.from({ length: BOARD_SIZE }, (_, row) =>
  Array.from({ length: BOARD_SIZE }, (_, col) => row * BOARD_SIZE + col + 1)
);

const App = () => {
  const [gameState, setGameState] = useState(defaultGameState);
  const [currentPlayer, setCurrentPlayer] = useState("circle");
  const [finishedState, setFinishetState] = useState(false);
  const [finishedArrayState, setFinishedArrayState] = useState([]);
  const [playOnline, setPlayOnline] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [opponentName, setOpponentName] = useState(null);
  const [playingAs, setPlayingAs] = useState(null);
  const [roomName, setRoomName] = useState(null);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [rematchRequestReceived, setRematchRequestReceived] = useState(false);
  const [mode, setMode] = useState(null); // "random" | "friend"

  const socket_host = process.env.REACT_APP_SOCKET_IO_HOST;
  const { socket } = useSocket(socket_host);

  const resetGame = () => {
    setGameState(defaultGameState.map((row) => [...row]));
    setCurrentPlayer("circle");
    setFinishetState(false);
    setFinishedArrayState([]);
    setRematchRequested(false);
  };

  const takePlayerName = async () => {
    const result = await Swal.fire({
      title: "Enter your name",
      input: "text",
      showCancelButton: true,
      inputValidator: (value) =>
        !value ? "You need to write something!" : null,
    });
    return result;
  };

  // ---- Popup for Finished game ----
  useEffect(() => {
    if (finishedState && finishedState !== "opponentLeftMatch") {
      Swal.fire({
        title:
          finishedState === "draw"
            ? "It's a Draw"
            : finishedState === playingAs
            ? "You Won!"
            : `${finishedState} won the game`,
        icon: finishedState === "draw" ? "info" : "success",
        showDenyButton: true,
        confirmButtonText: "Rematch",
        denyButtonText: "Close",
      }).then((result) => {
        if (result.isConfirmed) {
          if (roomName) {
            socket.emit("request_rematch", { roomName });
            setRematchRequested(true);
            Swal.fire({
              title: "Waiting for opponent...",
              html: "Waiting for opponent to accept the rematch.",
              allowOutsideClick: false,
              allowEscapeKey: false,
              didOpen: () => {
                Swal.showLoading();
              },
            });
          }
        }
        if (result.isDenied) {
          if (roomName) {
            socket.emit("rematch_declined", { roomName });
          }
          setPlayOnline(false);
          setOpponentName(null);
          setPlayingAs(null);
          setRoomName(null);
          setFinishedArrayState([]);
          setFinishetState(false);
          setGameState(defaultGameState.map((row) => [...row]));
          setRematchRequested(false);
          setRematchRequestReceived(false);
        }
      });
    }
  }, [finishedState, playingAs, roomName, socket]);

  // popup for player left the game
  useEffect(() => {
    if (finishedState === "opponentLeftMatch") {
      Swal.fire({
        title: "You won!",
        text: "Opponent has left the match.",
        icon: "info",
        confirmButtonText: "Back to menu",
      }).then(() => {
        setPlayOnline(false);
        setOpponentName(null);
        setPlayingAs(null);
        setRoomName(null);
        setFinishedArrayState([]);
        setFinishetState(false);
        setGameState(defaultGameState.map((row) => [...row]));
        setRematchRequested(false);
        setRematchRequestReceived(false);
      });
    }
  }, [finishedState]);
  // ---- Popup for Opponent requests rematch ----
  useEffect(() => {
    if (rematchRequestReceived) {
      Swal.fire({
        title: "Opponent wants a rematch!",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Accept Rematch",
        cancelButtonText: "Decline",
      }).then((result) => {
        if (result.isConfirmed) {
          if (roomName) socket.emit("request_rematch", { roomName });
          setRematchRequestReceived(false);
        } else {
          setRematchRequestReceived(false);
        }
      });
    }
  }, [rematchRequestReceived, roomName, socket]);

  // ---- Handle Socket Events ----
  useEffect(() => {
    if (!socket) return;

    const handleOpponentLeftMatch = () => setFinishetState("opponentLeftMatch");

    const handlePlayerMoveFromServer = (data) => {
      const id = data.state.id;
      const sign = data.state.sign;
      setGameState((prevState) => {
        let newState = prevState.map((row) => [...row]);
        const rowIndex = Math.floor(id / BOARD_SIZE);
        const colIndex = id % BOARD_SIZE;
        newState[rowIndex][colIndex] = sign;
        return newState;
      });
      setCurrentPlayer(sign === "circle" ? "cross" : "circle");

      if (data.finished && data.winner) {
        setFinishetState(data.winner);
        setFinishedArrayState(data.winArray || []);
      } else {
        setFinishetState(false);
        setFinishedArrayState([]);
      }
    };

    const handleOpponentNotFound = (data) => {
      setOpponentName(false);
      if (data && data.roomName) setRoomName(data.roomName);
      setPlayOnline(true);
    };

    const handleOpponentFound = (data) => {
      setPlayingAs(data.playingAs);
      setOpponentName(data.opponentName);
      setRoomName(data.roomName);
      setPlayOnline(true);
    };

    const handleRematchRequested = () => {
      setRematchRequestReceived(true);
      setRematchRequested(true);
    };

    const handleRematchAccepted = () => {
      Swal.close();
      resetGame();
    };

    const handleRematchDeclinedByOpponent = () => {
      Swal.fire({
        title: "Rematch Declined",
        text: "Your opponent declined the rematch or left the game.",
        icon: "info",
        confirmButtonText: "OK",
      }).then(() => {
        setPlayOnline(false);
        setOpponentName(null);
        setPlayingAs(null);
        setRoomName(null);
        setFinishedArrayState([]);
        setFinishetState(false);
        setGameState(
          Array.from({ length: BOARD_SIZE }, (_, row) =>
            Array.from(
              { length: BOARD_SIZE },
              (_, col) => row * BOARD_SIZE + col + 1
            )
          )
        );
        setRematchRequested(false);
        setRematchRequestReceived(false);
      });
    };
    const wrongPasswordHandler = async () => {
      await Swal.fire({
        icon: "error",
        title: "Incorrect password!",
        text: "Please re-enter the room password.",
        confirmButtonText: "Try Again",
      });
      if (mode === "friend" && roomName) {
        const passwordResult = await Swal.fire({
          title: "Enter Room Password",
          input: "password",
          showCancelButton: true,
          inputValidator: (value) =>
            !value ? "You need to enter a password!" : null,
        });
        if (passwordResult.isConfirmed) {
          socket.emit("join_room_by_id", {
            playerName,
            roomName,
            password: passwordResult.value,
            create: false,
          });
        } else {
          setPlayOnline(false);
          setOpponentName(null);
          setPlayingAs(null);
          setRoomName(null);
          setFinishedArrayState([]);
          setFinishetState(false);
          setGameState(defaultGameState.map((row) => [...row]));
          setRematchRequested(false);
          setRematchRequestReceived(false);
        }
      }
    };

    socket.on("opponentLeftMatch", handleOpponentLeftMatch);
    socket.on("playerMoveFromServer", handlePlayerMoveFromServer);
    socket.on("OpponentNotFound", handleOpponentNotFound);
    socket.on("OpponentFound", handleOpponentFound);
    socket.on("rematch_requested", handleRematchRequested);
    socket.on("rematch_accepted", handleRematchAccepted);
    socket.on("rematch_declined_by_opponent", handleRematchDeclinedByOpponent);

    socket.on("roomAlreadyExists", async () => {
      await Swal.fire({
        icon: "error",
        title: "Room already exists!",
        text: "Please choose a different Room ID.",
        confirmButtonText: "Try Again",
      });
      joinWithFriendsSmart();
    });

    socket.on("roomInUse", async () => {
      await Swal.fire({
        icon: "error",
        title: "Room is currently in use",
        text: "This Room ID is already used for another game. Please choose a different Room ID.",
        confirmButtonText: "OK",
      });
      joinWithFriendsSmart();
    });
    socket.on("roomFull", async () => {
      setPlayOnline(false);
      setOpponentName(null);
      setPlayingAs(null);
      setRoomName(null);
      setFinishedArrayState([]);
      setFinishetState(false);
      setGameState(defaultGameState.map((row) => [...row]));
      setRematchRequested(false);
      setRematchRequestReceived(false);

      await Swal.fire({
        icon: "error",
        title: "Room is full",
        text: "This Room ID already has 2 players. Please choose another Room ID.",
        confirmButtonText: "Try Another Room",
      });
      joinWithFriendsSmart(); // Mở lại UI nhập phòng
    });

    socket.on("roomNotFound", () => {
      Swal.fire("Room not found!", "", "error");
      setPlayOnline(false);
    });
    socket.on("wrongRoomPassword", wrongPasswordHandler);

    return () => {
      socket.off("opponentLeftMatch", handleOpponentLeftMatch);
      socket.off("playerMoveFromServer", handlePlayerMoveFromServer);
      socket.off("OpponentNotFound", handleOpponentNotFound);
      socket.off("OpponentFound", handleOpponentFound);
      socket.off("rematch_requested", handleRematchRequested);
      socket.off("rematch_accepted", handleRematchAccepted);
      socket.off(
        "rematch_declined_by_opponent",
        handleRematchDeclinedByOpponent
      );
      socket.off("roomAlreadyExists");
      socket.off("roomInUse");
      socket.off("roomFull");
      socket.off("roomNotFound");
      socket.off("wrongRoomPassword");
      socket.off("wrongRoomPassword", wrongPasswordHandler);
    };
  }, [socket, mode, roomName, playerName]);

  // ---- Play Online with Randoms ----
  async function playOnlineClick() {
    const result = await takePlayerName();
    if (!result.isConfirmed) return;
    const username = result.value;
    setPlayerName(username);
    socket.emit("request_to_play", { playerName: username });
    setMode("random");
    setPlayOnline(true);
  }

  // ---- Single Smart handler for create/join friend room ----
  async function joinWithFriendsSmart() {
    const nameResult = await takePlayerName();
    if (!nameResult.isConfirmed) return;
    const username = nameResult.value;

    const roomResult = await Swal.fire({
      title: "Enter Room ID",
      input: "text",
      showCancelButton: true,
      inputValidator: (value) =>
        !value ? "You need to write a Room ID!" : null,
    });
    if (!roomResult.isConfirmed) return;
    const roomID = roomResult.value;

    socket.emit("check_room_exists", { roomName: roomID }, async (resp) => {
      const passwordResult = await Swal.fire({
        title: resp.exists
          ? "Enter Room Password"
          : "Create a Password for Room",
        input: "password",
        showCancelButton: true,
        inputValidator: (value) =>
          !value ? "You need to enter a password!" : null,
      });
      if (!passwordResult.isConfirmed) return;

      setPlayerName(username);
      setMode("friend");
      setRoomName(roomID);
      // KHÔNG setPlayOnline ở đây
      socket.emit("join_room_by_id", {
        playerName: username,
        roomName: roomID,
        password: passwordResult.value,
        create: !resp.exists,
      });
      // KHÔNG setPlayOnline(true) ở đây
    });
  }

  if (!playOnline) {
    return (
      <div>
        <h1
          className="game-heading water-background"
          style={{ marginTop: "20vh" }}
        >
          Let's have fun with Tic Tac Toe
        </h1>
        <div className="main-div">
          <div className="randoms-container">
            <h2>Join with Randoms</h2>
            <button
              onClick={playOnlineClick}
              className="playOnline"
              style={{ justifySelf: "flex-end" }}
            >
              Play Now
            </button>
          </div>
          <div style={{ textAlign: "center", margin: "8px 0" }}>
            <hr
              style={{
                width: "80px",
                display: "inline-block",
                border: "1px solid #ccc",
              }}
            />
            <span
              style={{
                margin: "0 12px",
                color: "#888",
                fontWeight: "bold",
                fontSize: "40px",
              }}
            >
              OR
            </span>
            <hr
              style={{
                width: "80px",
                display: "inline-block",
                border: "1px solid #ccc",
              }}
            />
          </div>
          <div className="friends-container">
            <h2>Join with Friends</h2>
            <button onClick={joinWithFriendsSmart} className="playOnline">
              Let's go
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (playOnline && !opponentName) {
    return (
      <div className="waiting">
        <p>Waiting for opponent</p>
        {mode === "friend" && (
          <div>
            <p>
              Room ID: <strong>{roomName}</strong>
            </p>
            <p>Send this Room ID to your friend so they can join!</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="game-heading water-background">Tic Tac Toe</h1>
      <div className="main-div">
        <div></div>
        <div>
          <div className="move-detection">
            <div
              className={`left ${
                currentPlayer === playingAs
                  ? "current-move-" + currentPlayer
                  : ""
              }`}
            >
              {playerName}
            </div>
            <div
              className={`right ${
                currentPlayer !== playingAs
                  ? "current-move-" + currentPlayer
                  : ""
              }`}
            >
              {opponentName}
            </div>
          </div>
          {!finishedState && (
            <h2 className="turn-message">
              {currentPlayer === playingAs
                ? " Your Turn"
                : " Waiting for Opponent..."}
            </h2>
          )}
          <div className="square-wrapper">
            {gameState.map((arr, rowIndex) =>
              arr.map((e, colIndex) => (
                <Square
                  BOARD_SIZE={BOARD_SIZE}
                  roomName={roomName}
                  socket={socket}
                  playingAs={playingAs}
                  gameState={gameState}
                  finishedArrayState={finishedArrayState}
                  finishedState={finishedState}
                  currentPlayer={currentPlayer}
                  id={rowIndex * BOARD_SIZE + colIndex}
                  key={rowIndex * BOARD_SIZE + colIndex}
                  currentElement={e}
                />
              ))
            )}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {!finishedState && opponentName && (
          <h2>You are playing against {opponentName}</h2>
        )}

        <h3>Room ID: {roomName}</h3>
      </div>
    </div>
  );
};

export default App;
