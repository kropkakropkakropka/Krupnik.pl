const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../config/db');
const { generateToken } = require('../config/jwt');
const { authenticateUser } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
    }
    
    db.query(
      'SELECT * FROM uzytkownicy WHERE email = ? OR nazwa_uzytkownika = ?',
      [email, username],
      async (err, results) => {
        if (err) {
          console.error('Błąd zapytania:', err);
          return res.status(500).json({ message: 'Błąd serwera' });
        }
        
        if (results.length > 0) {
          return res.status(400).json({ 
            message: 'Użytkownik z tym emailem lub nazwą już istnieje' 
          });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        db.query(
          'INSERT INTO uzytkownicy (nazwa_uzytkownika, email, hash_hasla, punkty) VALUES (?, ?, ?, 1000)',
          [username, email, hashedPassword],
          (err, result) => {
            if (err) {
              console.error('Błąd rejestracji:', err);
              return res.status(500).json({ message: 'Błąd rejestracji' });
            }
            
            const token = generateToken(
              result.insertId,
              username,
              'uzytkownik' 
            );
            
            res.status(201).json({ 
              message: 'Użytkownik zarejestrowany pomyślnie',
              token,
              user: {
                id: result.insertId,
                username,
                email,
                points: 1000,
                role: 'uzytkownik'
              }
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('Błąd rejestracji:', error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email i hasło są wymagane' });
    }
    
    db.query(
      'SELECT * FROM uzytkownicy WHERE email = ?',
      [email],
      async (err, results) => {
        if (err) {
          console.error('Błąd zapytania:', err);
          return res.status(500).json({ message: 'Błąd serwera' });
        }
        
        if (results.length === 0) {
          return res.status(401).json({ message: 'Nieprawidłowy email lub hasło' });
        }
        
        const user = results[0];
        
        const isMatch = await bcrypt.compare(password, user.hash_hasla);
        
        if (!isMatch) {
          return res.status(401).json({ message: 'Nieprawidłowy email lub hasło' });
        }
        
        db.query(
          'UPDATE uzytkownicy SET ostatnie_logowanie = NOW() WHERE id_uzytkownika = ?',
          [user.id_uzytkownika]
        );
        
        const token = generateToken(
          user.id_uzytkownika,
          user.nazwa_uzytkownika,
          user.rola
        );
        
        res.json({
          message: 'Zalogowano pomyślnie',
          token,
          user: {
            id: user.id_uzytkownika,
            username: user.nazwa_uzytkownika,
            email: user.email,
            points: user.punkty,
            role: user.rola
          }
        });
      }
    );
  } catch (error) {
    console.error('Błąd logowania:', error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

router.get('/verify', authenticateUser, (req, res) => {
  res.status(200).json({
    message: 'Token jest ważny',
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role
    }
  });
});

// pobieranie danych użytkownika
router.get('/me', authenticateUser, (req, res) => {
  db.query(
    'SELECT id_uzytkownika, nazwa_uzytkownika, email, punkty, rola FROM uzytkownicy WHERE id_uzytkownika = ?',
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error('Błąd zapytania:', err);
        return res.status(500).json({ message: 'Błąd serwera' });
      }
      
      if (results.length === 0) {
        return res.status(404).json({ message: 'Użytkownik nie istnieje' });
      }
      
      const user = results[0];
      
      res.json({
        user: {
          id: user.id_uzytkownika,
          username: user.nazwa_uzytkownika,
          email: user.email,
          points: user.punkty,
          role: user.rola
        }
      });
    }
  );
});

module.exports = router;