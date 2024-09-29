// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt'); // For password hashing
const jwt = require('jsonwebtoken'); // For generating tokens
const userRoutes = require('./routes/users'); // Import user routes
const mqtt = require('mqtt'); // Import MQTT
const WebSocket = require('ws'); // Import WebSocket

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json()); // Middleware to parse JSON
app.use('/api/users', userRoutes); // Mount user routes

// Create a MySQL connection using environment variables
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect((err) => {
  if (err) {
    console.error('MySQL connection error:', err);
    return;
  }
  console.log('MySQL connected');
});

// Set up MQTT client
let sensorData = null; // Variable to store sensor data

const mqttClient = mqtt.connect(`mqtt://${process.env.MQTT_BROKER_ADDRESS}:${process.env.MQTT_PORT}`);

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
  mqttClient.subscribe(process.env.MQTT_TOPIC, (err) => {
    if (!err) {
      console.log('Subscribed to the topic successfully');
    } else {
      console.error('Subscription error:', err);
    }
  });
});

mqttClient.on('message', (topic, message) => {
  sensorData = message.toString(); // Store the received message in a variable
  console.log('Received data:', sensorData);

  // Broadcast data to all connected WebSocket clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(sensorData);
    }
  });
});

// WebSocket server setup
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
    console.log('WebSocket connection established');
  
    if (sensorData) {
      ws.send(sensorData);
    }
  
    ws.on('message', (message) => {
      console.log('Received message from client:', message);
    });
  
    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });
  
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

// API endpoint to get the latest sensor data (for testing purposes)
app.get('/sensor-data', (req, res) => {
  res.json({ temperature: sensorData });
});

// Example route for token generation
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  // Query to find the user
  db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });

    if (results.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = results[0];

    // Compare password with hashed password
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) return res.status(500).json({ message: 'Error comparing passwords' });

      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

      res.json({ token });
    });
  });
});

// Example route for token verification
app.get('/profile', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ userId: decoded.id });
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
