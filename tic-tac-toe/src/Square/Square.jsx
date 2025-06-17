import React from "react";
import "./Square.css";

const circleSvg = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
      stroke="#ffffff"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const crossSvg = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M19 5L5 19M5 5L19 19"
      stroke="#fff"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Square = ({
  gameState,
  socket,
  playingAs,
  currentElement,
  finishedArrayState,
  finishedState,
  id,
  currentPlayer,
  roomName,
}) => {
  const handleClick = () => {
    if (finishedState) return; // Đã kết thúc game, không cho click
    if (currentPlayer !== playingAs) return; // Không phải lượt mình
    const rowIndex = Math.floor(id / 3);
    const colIndex = id % 3;
    if (
      gameState[rowIndex][colIndex] === "circle" ||
      gameState[rowIndex][colIndex] === "cross"
    ) {
      return; // Ô đã có người đánh rồi
    }
    socket.emit("player_move", { id, roomName, sign: playingAs });
    // Không làm gì thêm! Chỉ gửi lên server
  };

  let icon = null;
  if (currentElement === "circle") icon = circleSvg;
  if (currentElement === "cross") icon = crossSvg;

  return (
    <div
      onClick={handleClick}
      className={`square 
        ${finishedState ? "not-allowed" : ""}
        ${currentPlayer !== playingAs ? "not-allowed" : ""}
        ${finishedArrayState.includes(id) ? finishedState + "-won" : ""}
        ${finishedState && finishedState !== playingAs ? "grey-background" : ""}
      `}
    >
      {icon}
    </div>
  );
};

export default Square;
