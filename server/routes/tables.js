const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Pobieranie wszystkich aktywnych stołów pokerowych
router.get('/poker', (req, res) => {
  db.query(
    'SELECT * FROM stoly_poker WHERE czy_aktywny = TRUE',
    (err, results) => {
      if (err) {
        console.error('Błąd zapytania:', err);
        return res.status(500).json({ message: 'Błąd serwera' });
      }
      
      res.json(results);
    }
  );
});

// Tworzenie nowego stołu pokerowego
router.post('/poker', (req, res) => {
  const { 
    nazwa, 
    max_graczy, 
    min_punkty, 
    max_punkty, 
    maly_blind, 
    duzy_blind, 
    utworzony_przez,
    czy_prywatny,
    haslo 
  } = req.body;
  
  // Podstawowa walidacja
  if (!nazwa || !max_graczy || !min_punkty || !max_punkty || !maly_blind || !duzy_blind || !utworzony_przez) {
    return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
  }
  
  // Jeśli stół jest prywatny, to hasło jest wymagane
  if (czy_prywatny && !haslo) {
    return res.status(400).json({ message: 'Dla prywatnego stołu wymagane jest hasło' });
  }
  
  // Dodatkowa walidacja
  if (parseInt(min_punkty) > parseInt(max_punkty)) {
    return res.status(400).json({ message: 'Minimalna liczba punktów nie może być większa od maksymalnej' });
  }
  
  if (parseInt(maly_blind) > parseInt(duzy_blind)) {
    return res.status(400).json({ message: 'Mały blind nie może być większy od dużego' });
  }
  
  // Sprawdź, czy użytkownik ma wystarczającą liczbę punktów
  db.query(
    'SELECT punkty FROM uzytkownicy WHERE id_uzytkownika = ?',
    [utworzony_przez],
    (err, results) => {
      if (err) {
        console.error('Błąd zapytania:', err);
        return res.status(500).json({ message: 'Błąd serwera' });
      }
      
      if (results.length === 0) {
        return res.status(404).json({ message: 'Użytkownik nie istnieje' });
      }
      
      const user = results[0];
      
      if (user.punkty < min_punkty) {
        return res.status(400).json({ 
          message: 'Nie masz wystarczającej liczby punktów aby utworzyć ten stół' 
        });
      }
      
      // Utwórz stół
      db.query(
        `INSERT INTO stoly_poker 
         (nazwa, max_graczy, min_punkty, max_punkty, maly_blind, duzy_blind, utworzony_przez, czy_prywatny, haslo) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nazwa, max_graczy, min_punkty, max_punkty, maly_blind, duzy_blind, utworzony_przez, czy_prywatny ? 1 : 0, haslo || null],
        (err, result) => {
          if (err) {
            console.error('Błąd tworzenia stołu:', err);
            return res.status(500).json({ message: 'Błąd podczas tworzenia stołu' });
          }
          
          res.status(201).json({ 
            message: 'Stół został utworzony pomyślnie',
            id_stolu: result.insertId 
          });
        }
      );
    }
  );
});

// Pobieranie wszystkich aktywnych stołów blackjack
router.get('/blackjack', (req, res) => {
  db.query(
    'SELECT * FROM stoly_blackjack WHERE czy_aktywny = TRUE',
    (err, results) => {
      if (err) {
        console.error('Błąd zapytania:', err);
        return res.status(500).json({ message: 'Błąd serwera' });
      }
      
      res.json(results);
    }
  );
});

// Pobieranie wszystkich aktywnych stołów ruletki
router.get('/roulette', (req, res) => {
  db.query(
    'SELECT * FROM stoly_ruletka WHERE czy_aktywny = TRUE',
    (err, results) => {
      if (err) {
        console.error('Błąd zapytania:', err);
        return res.status(500).json({ message: 'Błąd serwera' });
      }
      
      res.json(results);
    }
  );
});

module.exports = router;