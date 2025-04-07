const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../config/db');

// Endpoint rejestracji
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Sprawdź, czy pola są wypełnione
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
    }
    
    // Sprawdź, czy użytkownik już istnieje
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
        
        // Hashowanie hasła
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Dodanie użytkownika do bazy
        db.query(
          'INSERT INTO uzytkownicy (nazwa_uzytkownika, email, hash_hasla, punkty) VALUES (?, ?, ?, 1000)',
          [username, email, hashedPassword],
          (err, result) => {
            if (err) {
              console.error('Błąd rejestracji:', err);
              return res.status(500).json({ message: 'Błąd rejestracji' });
            }
            
            res.status(201).json({ 
              message: 'Użytkownik zarejestrowany pomyślnie',
              userId: result.insertId 
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

// Endpoint logowania
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Sprawdź, czy pola są wypełnione
    if (!email || !password) {
      return res.status(400).json({ message: 'Email i hasło są wymagane' });
    }
    
    // Znajdź użytkownika
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
        
        // Porównaj hasła
        const isMatch = await bcrypt.compare(password, user.hash_hasla);
        
        if (!isMatch) {
          return res.status(401).json({ message: 'Nieprawidłowy email lub hasło' });
        }
        
        // Aktualizuj czas ostatniego logowania
        db.query(
          'UPDATE uzytkownicy SET ostatnie_logowanie = NOW() WHERE id_uzytkownika = ?',
          [user.id_uzytkownika]
        );
        
        // Wyślij dane użytkownika (bez hasła)
        res.json({
          message: 'Zalogowano pomyślnie',
          user: {
            id: user.id_uzytkownika,
            username: user.nazwa_uzytkownika,
            email: user.email,
            points: user.punkty
          }
        });
      }
    );
  } catch (error) {
    console.error('Błąd logowania:', error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

module.exports = router;