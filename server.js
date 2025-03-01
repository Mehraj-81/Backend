const express = require("express");
const axios = require("axios");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Configure CORS options
const corsOptions = {
  origin: "http://localhost:3000", // Allow only your frontend origin
  methods: ["GET", "POST"],        // Allow specific HTTP methods
  credentials: true,               // Allow cookies and authentication headers
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Handle preflight requests

// Middleware to parse JSON
app.use(express.json());

// Socket.IO with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000", // Allow only your frontend origin
    methods: ["GET", "POST"],
  },
});

// In-memory data store
let liveData = {
  matches: [],
  odds: {},
};

// Fetch ongoing matches every second
const fetchOngoingMatches = async () => {
  try {
    const response = await axios.post(
      "https://api.btx99.com/v1/sports/matchList",
      {},
      {
        headers: {
          Authorization: "Bearer YOUR_TOKEN_HERE",
          Accept: "application/json",
          Origin: "https://btx99.com",
        },
      }
    );

    if (!response.data || !response.data.data) {
      throw new Error("Invalid response from matchList API");
    }

    liveData.matches = response.data.data.map((match) => ({
      eventId: match.eventId,
      matchName: match.matchName,
      matchDate: match.matchDate,
      marketId: match.marketId,
      scoreIframe: match.scoreIframe,
    }));

    io.emit("updateMatches", liveData.matches);
  } catch (error) {
    console.error("Error fetching ongoing matches:", error.message);
  }
};

// Fetch odds data every second
const fetchOdds = async () => {
  try {
    const marketIds = liveData.matches.map((match) => match.marketId);
    if (marketIds.length === 0) return;

    for (const marketId of marketIds) {
      const response = await axios.get(
        `https://oddsapi.winx777.com/v2/api/oddsData?market_id=${marketId}`
      );

      console.log(`Odds response for market ${marketId}:`, JSON.stringify(response.data, null, 2));

      if (response.data.result) {
        const matchData = liveData.matches.find((match) => match.marketId === marketId);
        const matchName = matchData ? matchData.matchName : `Market ${marketId}`;

        liveData.odds[marketId] = {
          matchName, // ✅ Store match name
          matchOdds: response.data.result.team_data || [], // ✅ Match Odds (Lagai/Khai)
          fancyMarkets: response.data.result.session || [],
          commissionFancy: response.data.result.commission_fancy_data || [],
          noCommissionFancy: response.data.result.no_commission_fancy_data || [],
        };
      }
    }

    io.emit("updateOdds", liveData.odds);
  } catch (error) {
    console.error("Error fetching odds:", error.message);
  }
};

// Run functions every second
setInterval(fetchOngoingMatches, 1000);
setInterval(fetchOdds, 1000);

// API Route: Fetch odds from backend cache
app.get("/api/odds", (req, res) => {
  const { market_id } = req.query;
  if (!market_id || !liveData.odds[market_id]) {
    return res.status(404).json({ error: "No odds available" });
  }
  res.json(liveData.odds[market_id]);
});

// WebSocket: Live Score & Odds Updates
io.on("connection", (socket) => {
  console.log("Client connected");
  socket.emit("updateMatches", liveData.matches);
  socket.emit("updateOdds", liveData.odds);

  socket.on("disconnect", () => console.log("Client disconnected"));
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
