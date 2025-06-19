import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import Square from "./Square/Square"; // Giả định component Square tồn tại và được style
import Swal from "sweetalert2"; // Đã được style hóa để phù hợp với giao diện mới
import useSocket from "./hooks/useSocket"; // Giả định hook useSocket tồn tại

const BOARD_SIZE = 20; // Hoặc 10 tùy theo yêu cầu
document.documentElement.style.setProperty("--board-size", BOARD_SIZE);

// Khởi tạo trạng thái bàn cờ mặc định với các số thứ tự ô
const defaultGameState = Array.from({ length: BOARD_SIZE }, (_, row) =>
  Array.from({ length: BOARD_SIZE }, (_, col) => row * BOARD_SIZE + col + 1)
);

const App = () => {
  const [gameState, setGameState] = useState(defaultGameState); // Trạng thái hiện tại của bàn cờ
  const [currentPlayer, setCurrentPlayer] = useState("circle"); // Lượt chơi hiện tại: 'circle' (O) hoặc 'cross' (X)
  const [finishedState, setFinishedState] = useState(false); // Trạng thái kết thúc game: 'draw', 'circle', 'cross', 'opponentLeftMatch'
  const [finishedArrayState, setFinishedArrayState] = useState([]); // Mảng các ô chiến thắng (để highlight)
  const [playOnline, setPlayOnline] = useState(false); // Trạng thái: đang chơi online hay đang ở menu
  const [playerName, setPlayerName] = useState(""); // Tên của người chơi hiện tại
  const [opponentName, setOpponentName] = useState(null); // Tên của đối thủ
  const [playingAs, setPlayingAs] = useState(null); // Người chơi hiện tại đang chơi là 'circle' hay 'cross'
  const [roomName, setRoomName] = useState(null); // Tên phòng hiện tại
  const [rematchRequested, setRematchRequested] = useState(false); // Cờ báo hiệu đã gửi yêu cầu chơi lại
  const [rematchRequestReceived, setRematchRequestReceived] = useState(false); // Cờ báo hiệu đã nhận yêu cầu chơi lại
  const [mode, setMode] = useState(null); // Chế độ chơi: "random" (ngẫu nhiên) hoặc "friend" (bạn bè)
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light"); // Trạng thái Dark/Light Mode

  // Lấy host của socket từ biến môi trường (ví dụ: .env)
  const socket_host = process.env.REACT_APP_SOCKET_IO_HOST;
  const { socket } = useSocket(socket_host); // Sử dụng hook useSocket để kết nối

  // Tham chiếu đến phần tử bàn cờ để có thể cuộn tới
  const boardRef = useRef(null);

  // Cập nhật theme vào localStorage và thay đổi lớp body khi chế độ thay đổi
  useEffect(() => {
    // Lưu chế độ vào localStorage
    localStorage.setItem("theme", theme);
    // Thêm hoặc xóa lớp light/dark mode trên body
    document.body.classList.remove("light-mode", "dark-mode");
    document.body.classList.add(`${theme}-mode`);
  }, [theme]);

  const toggleTheme = () => {
    // Chuyển đổi giữa chế độ sáng và tối 
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  // Hàm để đặt lại trò chơi về trạng thái ban đầu
  const resetGame = () => {
    setGameState(defaultGameState.map((row) => [...row])); // Tạo bản sao sâu của trạng thái mặc định
    setCurrentPlayer("circle"); // Lượt đầu tiên luôn là 'circle'
    setFinishedState(false); // Đặt lại trạng thái kết thúc
    setFinishedArrayState([]); // Xóa các ô highlight chiến thắng
    setRematchRequested(false); // Đặt lại cờ yêu cầu chơi lại
    setRematchRequestReceived(false); // Đặt lại cờ nhận yêu cầu chơi lại
  };

  // Hàm hiển thị popup yêu cầu nhập tên người chơi
  const takePlayerName = async () => {
    const result = await Swal.fire({
      title: "Nhập tên của bạn",
      input: "text",
      showCancelButton: true,
      confirmButtonText: "Xác nhận",
      cancelButtonText: "Hủy",
      inputValidator: (value) => (!value ? "Bạn cần nhập tên để chơi!" : null), // Yêu cầu nhập tên
      customClass: {
        // Áp dụng các class CSS tùy chỉnh cho popup
        popup: "modern-swal-popup",
        title: "modern-swal-title",
        input: "modern-swal-input",
        confirmButton: "modern-swal-confirm-button",
        cancelButton: "modern-swal-cancel-button",
      },
      buttonsStyling: false, // Tắt styling mặc định của Swal để dùng customClass
    });
    return result;
  };


  // useEffect để xử lý popup khi trò chơi kết thúc (thắng/thua/hòa)
  useEffect(() => {
    if (finishedState && finishedState !== "opponentLeftMatch") {
      let winnerName = ""; // Biến để lưu tên người thắng
      if (finishedState === "draw") {
        winnerName = "Hòa!";
      } else {
        winnerName =
          finishedState === playingAs
            ? "Bạn đã thắng!"
            : `${opponentName} đã thắng!`; // Thay "X" hoặc "O" bằng tên đối thủ
      }

      Swal.fire({
        title: winnerName,
        icon: finishedState === "draw" ? "info" : "success",
        showDenyButton: true,
        confirmButtonText: "Chơi lại",
        denyButtonText: "Thoát",
        customClass: {
          popup: "modern-swal-popup",
          title: "modern-swal-title",
          htmlContainer: "modern-swal-text",
          confirmButton: "modern-swal-confirm-button",
          denyButton: "modern-swal-deny-button",
        },
        buttonsStyling: false,
      }).then((result) => {
        if (result.isConfirmed) {
          if (roomName && socket) {
            socket.emit("request_rematch", { roomName });
            setRematchRequested(true);
            Swal.fire({
              title: "Đang đợi đối thủ...",
              html: "Vui lòng chờ đối thủ chấp nhận chơi lại.",
              allowOutsideClick: false,
              allowEscapeKey: false,
              didOpen: () => {
                Swal.showLoading();
              },
              customClass: {
                popup: "modern-swal-popup",
                title: "modern-swal-title",
                htmlContainer: "modern-swal-text",
              },
            });
          }
        }
        if (result.isDenied) {
          if (roomName && socket) {
            socket.emit("rematch_declined", { roomName });
          }
          setPlayOnline(false);
          setOpponentName(null);
          setPlayingAs(null);
          setRoomName(null);
          resetGame();
        }
      });
    }
  }, [finishedState, playingAs, roomName, socket, opponentName]);

  // useEffect để xử lý popup khi đối thủ rời trận đấu
  useEffect(() => {
    if (finishedState === "opponentLeftMatch") {
      Swal.fire({
        title: "Bạn đã thắng!",
        text: "Đối thủ đã rời trận đấu.",
        icon: "info",
        confirmButtonText: "Quay lại menu",
        customClass: {
          popup: "modern-swal-popup",
          title: "modern-swal-title",
          htmlContainer: "modern-swal-text",
          confirmButton: "modern-swal-confirm-button",
        },
        buttonsStyling: false,
      }).then(() => {
        // Đặt lại tất cả trạng thái và quay về menu chính
        setPlayOnline(false);
        setOpponentName(null);
        setPlayingAs(null);
        setRoomName(null);
        resetGame(); // Sử dụng hàm resetGame để đặt lại bàn cờ
      });
    }
  }, [finishedState]); // Dependencies: chỉ khi finishedState chuyển sang "opponentLeftMatch"

  // useEffect để xử lý popup khi nhận được yêu cầu chơi lại từ đối thủ
  useEffect(() => {
    if (rematchRequestReceived) {
      Swal.fire({
        title: "Đối thủ muốn chơi lại!",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Chấp nhận",
        cancelButtonText: "Từ chối",
        customClass: {
          popup: "modern-swal-popup",
          title: "modern-swal-title",
          confirmButton: "modern-swal-confirm-button",
          cancelButton: "modern-swal-cancel-button",
        },
        buttonsStyling: false,
      }).then((result) => {
        if (result.isConfirmed) {
          // Nếu chấp nhận chơi lại
          if (roomName && socket) socket.emit("request_rematch", { roomName }); // Gửi tín hiệu chấp nhận chơi lại
          setRematchRequestReceived(false); // Reset cờ nhận yêu cầu
        } else {
          // Nếu từ chối chơi lại
          if (roomName && socket) socket.emit("rematch_declined", { roomName }); // Gửi tín hiệu từ chối
          setRematchRequestReceived(false); // Reset cờ nhận yêu cầu
        }
      });
    }
  }, [rematchRequestReceived, roomName, socket]); // Dependencies: khi nhận yêu cầu, có phòng hoặc socket thay đổi

  // useEffect quan trọng để lắng nghe các sự kiện từ Socket.IO server
  useEffect(() => {
    if (!socket) return; // Đảm bảo socket đã được khởi tạo

    // Hàm xử lý khi đối thủ rời trận
    const handleOpponentLeftMatch = () => setFinishedState("opponentLeftMatch");

    // Hàm xử lý khi nhận được nước đi từ server
    const handlePlayerMoveFromServer = (data) => {
      const id = data.state.id; // ID của ô cờ
      const sign = data.state.sign; // Dấu của ô cờ ('circle' hoặc 'cross')
      setGameState((prevState) => {
        let newState = prevState.map((row) => [...row]); // Tạo bản sao mới của trạng thái bàn cờ
        const rowIndex = Math.floor(id / BOARD_SIZE); // Tính hàng
        const colIndex = id % BOARD_SIZE; // Tính cột
        newState[rowIndex][colIndex] = sign; // Cập nhật ô cờ
        return newState;
      });
      setCurrentPlayer(sign === "circle" ? "cross" : "circle"); // Chuyển lượt chơi

      if (data.finished && data.winner) {
        // Nếu game đã kết thúc và có người thắng
        setFinishedState(data.winner); // Đặt trạng thái kết thúc
        setFinishedArrayState(data.winArray || []); // Lưu mảng các ô thắng cuộc
      } else {
        // Nếu game chưa kết thúc
        setFinishedState(false);
        setFinishedArrayState([]);
      }
    };

    // Hàm xử lý khi không tìm thấy đối thủ (chế độ ngẫu nhiên)
    const handleOpponentNotFound = (data) => {
      setOpponentName(false); // Đặt opponentName về false để hiển thị "Đang đợi đối thủ"
      if (data && data.roomName) setRoomName(data.roomName);
    };

    // Hàm xử lý khi tìm thấy đối thủ
    const handleOpponentFound = (data) => {
      setPlayingAs(data.playingAs); // Lưu dấu mà người chơi hiện tại đang chơi
      setOpponentName(data.opponentName); // Lưu tên đối thủ
      setRoomName(data.roomName); // Lưu tên phòng
      // Cuộn đến bàn cờ khi tìm thấy đối thủ để người chơi bắt đầu game
      if (boardRef.current) {
        boardRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    };

    // Hàm xử lý khi đối thủ yêu cầu chơi lại
    const handleRematchRequested = () => {
      setRematchRequestReceived(true); // Đặt cờ đã nhận yêu cầu chơi lại
    };

    // Hàm xử lý khi đối thủ chấp nhận chơi lại
    const handleRematchAccepted = () => {
      Swal.close(); // Đóng popup "Đang đợi đối thủ"
      resetGame(); // Đặt lại trò chơi
    };

    // Hàm xử lý khi đối thủ từ chối chơi lại
    const handleRematchDeclinedByOpponent = () => {
      Swal.fire({
        title: "Đối thủ từ chối",
        text: "Đối thủ của bạn đã từ chối chơi lại hoặc rời khỏi trò chơi.",
        icon: "info",
        confirmButtonText: "OK",
        customClass: {
          popup: "modern-swal-popup",
          title: "modern-swal-title",
          htmlContainer: "modern-swal-text",
          confirmButton: "modern-swal-confirm-button",
        },
        buttonsStyling: false,
      }).then(() => {
        // Đặt lại trạng thái và quay về menu chính
        setPlayOnline(false);
        setOpponentName(null);
        setPlayingAs(null);
        setRoomName(null);
        resetGame(); // Sử dụng hàm resetGame
      });
    };

    // Hàm xử lý khi phòng đã tồn tại (khi cố gắng tạo phòng mới với ID đã có)
    const handleRoomAlreadyExists = async () => {
      await Swal.fire({
        icon: "error",
        title: "Phòng đã tồn tại!",
        text: "Vui lòng chọn một mã phòng khác.",
        confirmButtonText: "Thử lại",
        customClass: {
          popup: "modern-swal-popup",
          title: "modern-swal-title",
          htmlContainer: "modern-swal-text",
          confirmButton: "modern-swal-confirm-button",
        },
        buttonsStyling: false,
      });
      joinWithFriendsSmart(); // Gọi lại hàm để người dùng nhập lại thông tin phòng
    };

    // Hàm xử lý khi phòng đang được sử dụng (có game khác đang diễn ra)
    const handleRoomInUse = async () => {
      await Swal.fire({
        icon: "error",
        title: "Phòng đang được sử dụng",
        text: "Mã phòng này đang được sử dụng cho một trò chơi khác. Vui lòng chọn một mã phòng khác.",
        confirmButtonText: "OK",
        customClass: {
          popup: "modern-swal-popup",
          title: "modern-swal-title",
          htmlContainer: "modern-swal-text",
          confirmButton: "modern-swal-confirm-button",
        },
        buttonsStyling: false,
      });
      joinWithFriendsSmart(); // Gọi lại hàm để người dùng nhập lại thông tin phòng
    };

    // Hàm xử lý khi phòng đã đầy (2 người chơi)
    const handleRoomFull = async () => {
      // Đặt lại tất cả trạng thái trước khi hiển thị cảnh báo
      setPlayOnline(false);
      setOpponentName(null);
      setPlayingAs(null);
      setRoomName(null);
      resetGame(); // Sử dụng hàm resetGame

      await Swal.fire({
        icon: "error",
        title: "Phòng đã đầy",
        text: "Mã phòng này đã có 2 người chơi. Vui lòng chọn mã phòng khác.",
        confirmButtonText: "Thử phòng khác",
        customClass: {
          popup: "modern-swal-popup",
          title: "modern-swal-title",
          htmlContainer: "modern-swal-text",
          confirmButton: "modern-swal-confirm-button",
        },
        buttonsStyling: false,
      });
      joinWithFriendsSmart(); // Gọi lại hàm để người dùng nhập lại thông tin phòng
    };

    // Hàm xử lý khi không tìm thấy phòng (khi cố gắng tham gia một phòng không tồn tại)
    const handleRoomNotFound = () => {
      Swal.fire({
        title: "Không tìm thấy phòng!",
        icon: "error",
        confirmButtonText: "OK",
        customClass: {
          popup: "modern-swal-popup",
          title: "modern-swal-title",
          confirmButton: "modern-swal-confirm-button",
        },
        buttonsStyling: false,
      });
      setPlayOnline(false); // Quay lại màn hình chọn chế độ chơi
    };

    // Hàm xử lý khi nhập sai mật khẩu phòng
    const handleWrongRoomPassword = () => {
      Swal.fire({
        title: "Sai mật khẩu phòng!",
        icon: "error",
        confirmButtonText: "OK",
        customClass: {
          popup: "modern-swal-popup",
          title: "modern-swal-title",
          confirmButton: "modern-swal-confirm-button",
        },
        buttonsStyling: false,
      });
      setPlayOnline(false); // Quay lại màn hình chọn chế độ chơi
    };

    // Đăng ký các sự kiện socket
    socket.on("opponentLeftMatch", handleOpponentLeftMatch);
    socket.on("playerMoveFromServer", handlePlayerMoveFromServer);
    socket.on("OpponentNotFound", handleOpponentNotFound);
    socket.on("OpponentFound", handleOpponentFound);
    socket.on("rematch_requested", handleRematchRequested);
    socket.on("rematch_accepted", handleRematchAccepted);
    socket.on("rematch_declined_by_opponent", handleRematchDeclinedByOpponent);
    socket.on("roomAlreadyExists", handleRoomAlreadyExists);
    socket.on("roomInUse", handleRoomInUse);
    socket.on("roomFull", handleRoomFull);
    socket.on("roomNotFound", handleRoomNotFound);
    socket.on("wrongRoomPassword", handleWrongRoomPassword);

    // Dọn dẹp sự kiện khi component unmount để tránh rò rỉ bộ nhớ
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
      socket.off("roomAlreadyExists", handleRoomAlreadyExists);
      socket.off("roomInUse", handleRoomInUse);
      socket.off("roomFull", handleRoomFull);
      socket.off("roomNotFound", handleRoomNotFound);
      socket.off("wrongRoomPassword", handleWrongRoomPassword);
    };
  }, [socket]); // Dependency array: Effect chỉ chạy lại khi đối tượng socket thay đổi

  // Hàm xử lý khi click "Chơi ngay" (chơi với người ngẫu nhiên)
  async function playOnlineClick() {
    const result = await takePlayerName(); // Yêu cầu nhập tên
    if (!result.isConfirmed) return; // Nếu người dùng hủy, thoát
    const username = result.value;
    setPlayerName(username);
    if (socket) {
      socket.emit("request_to_play", { playerName: username }); // Gửi yêu cầu tìm đối thủ ngẫu nhiên
    }
    setMode("random"); // Đặt chế độ chơi
    setPlayOnline(true); // Chuyển sang màn hình chờ đối thủ
  }

  // Hàm xử lý tạo/tham gia phòng bạn bè một cách thông minh
  async function joinWithFriendsSmart() {
    const nameResult = await takePlayerName(); // Yêu cầu nhập tên
    if (!nameResult.isConfirmed) return;
    const username = nameResult.value;

    const roomResult = await Swal.fire({
      // Yêu cầu nhập mã phòng
      title: "Nhập mã phòng",
      input: "text",
      showCancelButton: true,
      confirmButtonText: "Tiếp tục",
      cancelButtonText: "Hủy",
      inputValidator: (value) => (!value ? "Bạn cần nhập mã phòng!" : null),
      customClass: {
        popup: "modern-swal-popup",
        title: "modern-swal-title",
        input: "modern-swal-input",
        confirmButton: "modern-swal-confirm-button",
        cancelButton: "modern-swal-cancel-button",
      },
      buttonsStyling: false,
    });
    if (!roomResult.isConfirmed) return;
    const roomID = roomResult.value;

    if (socket) {
      // Kiểm tra xem phòng đã tồn tại chưa
      socket.emit("check_room_exists", { roomName: roomID }, async (resp) => {
        const passwordResult = await Swal.fire({
          // Yêu cầu nhập/tạo mật khẩu
          title: resp.exists
            ? "Nhập mật khẩu phòng" // Nếu phòng tồn tại, yêu cầu nhập
            : "Tạo mật khẩu cho phòng", // Nếu phòng chưa, yêu cầu tạo
          input: "password",
          showCancelButton: true,
          confirmButtonText: resp.exists ? "Tham gia" : "Tạo phòng",
          cancelButtonText: "Hủy",
          inputValidator: (value) => (!value ? "Bạn cần nhập mật khẩu!" : null),
          customClass: {
            popup: "modern-swal-popup",
            title: "modern-swal-title",
            input: "modern-swal-input",
            confirmButton: "modern-swal-confirm-button",
            cancelButton: "modern-swal-cancel-button",
          },
          buttonsStyling: false,
        });
        if (!passwordResult.isConfirmed) return;

        setPlayerName(username);
        setMode("friend"); // Đặt chế độ chơi
        setPlayOnline(true); // Chuyển sang màn hình chờ đối thủ
        socket.emit("join_room_by_id", {
          // Gửi yêu cầu tham gia/tạo phòng
          playerName: username,
          roomName: roomID,
          password: passwordResult.value,
          create: !resp.exists, // Cờ báo hiệu có tạo phòng mới hay không
        });
      });
    }
  }

  // Render giao diện tùy thuộc vào trạng thái `playOnline`
  if (!playOnline) {
    return (
      <div className="main-container">
        <h1 className="game-heading"> Game Cờ Caro</h1>
        <div className="menu-section">
          <div className="menu-option-container">
            <h2>Chơi với người ngẫu nhiên</h2>
            <button onClick={playOnlineClick} className="play-button">
              Chơi ngay
            </button>
          </div>
          <div className="separator">
            <hr />
            <span>HOẶC</span>
            <hr />
          </div>
          <div className="menu-option-container">
            <h2>Chơi với bạn bè</h2>
            <button onClick={joinWithFriendsSmart} className="play-button">
              Bắt đầu
            </button>
          </div>
        </div>
        <button onClick={toggleTheme} className="toggle-theme-button">
          Chuyển sang {theme === "light" ? "Dark" : "Light"} Mode
          </button>
      </div>
    );
  }

  // Render màn hình chờ đối thủ nếu đang chơi online nhưng chưa tìm thấy đối thủ
  if (playOnline && !opponentName) {
    return (
      <div className="waiting-screen">
        <p>Đang chờ đối thủ...</p>
        {mode === "friend" &&
          roomName && ( // Hiển thị mã phòng nếu là chế độ bạn bè
            <div>
              <p>
                Mã phòng: <strong>{roomName}</strong>
              </p>
              <p>Gửi mã phòng này cho bạn bè của bạn để họ có thể tham gia!</p>
            </div>
          )}
      </div>
    );
  }

  // Render giao diện game khi đã vào trận đấu
  return (
    <div className="main-container">
      <h1 className="game-heading">Cờ Caro</h1>
      <div className="game-area">
        <div className="player-info-container">
          {/* Thẻ hiển thị thông tin người chơi hiện tại */}
          <div
            className={`player-card ${
              currentPlayer === playingAs ? "current-move-" + currentPlayer : ""
            }`}
          >
            {playerName}
            <br />({playingAs === "circle" ? "O" : "X"}){" "}
            {/* Hiển thị ký hiệu đang chơi */}
          </div>
          {/* Thẻ hiển thị thông tin đối thủ */}
          <div
            className={`player-card ${
              currentPlayer !== playingAs ? "current-move-" + currentPlayer : ""
            }`}
          >
            {opponentName || "Đối thủ"}
            <br />({playingAs === "circle" ? "X" : "O"}){" "}
            {/* Ký hiệu của đối thủ là ngược lại */}
          </div>
        </div>
        {/* Hiển thị thông báo lượt chơi nếu game chưa kết thúc */}
        {!finishedState && (
          <h2 className="turn-message">
            {currentPlayer === playingAs
              ? "Đến lượt bạn!"
              : "Đang chờ đối thủ..."}
          </h2>
        )}

        {/* Vùng chứa bàn cờ */}
        <div className="square-wrapper" ref={boardRef}>
          {gameState.map((arr, rowIndex) =>
            arr.map((e, colIndex) => (
              <Square
                BOARD_SIZE={BOARD_SIZE} // Truyền kích thước bảng xuống Square để tính toán kích thước ô
                roomName={roomName}
                socket={socket}
                playingAs={playingAs}
                gameState={gameState}
                finishedArrayState={finishedArrayState}
                finishedState={finishedState}
                currentPlayer={currentPlayer}
                id={rowIndex * BOARD_SIZE + colIndex} // ID duy nhất cho mỗi ô (0 đến BOARD_SIZE*BOARD_SIZE - 1)
                key={rowIndex * BOARD_SIZE + colIndex} // Key cho React rendering
                currentElement={e} // Giá trị hiện tại của ô (số thứ tự, 'circle' hoặc 'cross')
              />
            ))
          )}
        </div>
        <div className="game-details">
          {opponentName && <h2>Bạn đang chơi với {opponentName}</h2>}
        </div>
      </div>
    </div>
  );
};

export default App;
