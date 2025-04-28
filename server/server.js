const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const websocketServer = require('./websocket')
// Import tras
const authRoutes = require('./routes/auth');
const tablesRoutes = require('./routes/tables');

// Inicjalizacja Express
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

// Używanie tras
app.use('/api/auth', authRoutes);
app.use('/api/tables', tablesRoutes);

// Prosty endpoint informacyjny
app.get('/api/info', (req, res) => {
  res.json({ message: 'API działa poprawnie' });
});

// Obsługa routingu dla aplikacji Single Page Application
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Uruchomienie serwera
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});