const net = require("net");
const fs = require("fs");

const server = net.createServer((socket) => {
  console.log("Client connected");

  // Load any test image
  const img = fs.readFileSync("test.jpg");

  // Send header (8 bytes)
  const header = String(img.length).padStart(8, "0");

  socket.write(header);
  socket.write(img);

  socket.end();
});

server.listen(8324, () => {
  console.log("Mock STM running on port 8324");
});