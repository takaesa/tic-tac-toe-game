import React from "react";
import "./Square.css";

// SVG icon cho dấu 'O' (circle)
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

// SVG icon cho dấu 'X' (cross)
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
  gameState, // Toàn bộ trạng thái bàn cờ
  socket, // Đối tượng socket để gửi sự kiện
  playingAs, // Người chơi hiện tại đang chơi là 'circle' hay 'cross'
  currentElement, // Giá trị hiện tại của ô (số, 'circle' hoặc 'cross')
  finishedArrayState, // Mảng các ô chiến thắng (để highlight)
  finishedState, // Trạng thái kết thúc game
  id, // ID duy nhất của ô
  currentPlayer, // Lượt chơi hiện tại (tổng thể của game)
  roomName, // Tên phòng
  BOARD_SIZE, // Kích thước của bàn cờ (để tính toán vị trí)
}) => {
  // Hàm xử lý khi một ô cờ được click
  const handleClick = () => {
    // Ngăn không cho click nếu game đã kết thúc
    if (finishedState) return;
    // Ngăn không cho click nếu không phải lượt của người chơi hiện tại
    if (currentPlayer !== playingAs) return;

    // Tính toán hàng và cột từ ID của ô
    const rowIndex = Math.floor(id / BOARD_SIZE);
    const colIndex = id % BOARD_SIZE;

    // Ngăn không cho click nếu ô đã được đánh dấu ('circle' hoặc 'cross')
    if (
      gameState[rowIndex][colIndex] === "circle" ||
      gameState[rowIndex][colIndex] === "cross"
    ) {
      return;
    }

    // Gửi sự kiện 'player_move' tới server với ID của ô, tên phòng và dấu của người chơi
    socket.emit("player_move", { id, roomName, sign: playingAs });
  };

  // Xác định icon sẽ hiển thị trong ô (O hoặc X)
  let icon = null;
  if (currentElement === "circle") icon = circleSvg;
  if (currentElement === "cross") icon = crossSvg;

  return (
    <div
      onClick={handleClick} // Gắn hàm xử lý click
      className={`square
        ${finishedState ? "not-allowed" : ""} /* Thêm class nếu game kết thúc */
        ${currentPlayer !== playingAs ? "not-allowed" : ""} /* Thêm class nếu không phải lượt */
        ${finishedArrayState.includes(id) ? finishedState + "-won" : ""} /* Highlight ô thắng */
        ${finishedState && finishedState !== playingAs ? "grey-background" : ""} /* Làm mờ các ô không thuộc về người thắng */
      `}
    >
      {icon} {/* Hiển thị icon O hoặc X */}
    </div>
  );
};

export default Square;
