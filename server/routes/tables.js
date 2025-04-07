const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateUser } = require('../middleware/auth');


router.get('/poker', (req, res) => {
  db.query(
    `SELECT p.*, 
     (SELECT COUNT(*) FROM gracze_poker WHERE id_stolu = p.id_stolu) as current_players 
     FROM stoly_poker p`,
    (err, results) => {
      if (err) {
        console.error('Błąd zapytania:', err);
        return res.status(500).json({ message: 'Błąd serwera' });
      }
      
      res.json(results);
    }
  );
});
router.post('/poker', authenticateUser, (req, res) => {
  const { 
    nazwa, 
    max_graczy, 
    min_punkty, 
    max_punkty, 
    maly_blind, 
    duzy_blind,
    czy_prywatny,
    haslo 
  } = req.body;
  

  const utworzony_przez = req.user.id;
  
  
  if (!nazwa || !max_graczy || !min_punkty || !max_punkty || !maly_blind || !duzy_blind) {
    return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
  }
  
  if (czy_prywatny && !haslo) {
    return res.status(400).json({ message: 'Dla prywatnego stołu wymagane jest hasło' });
  }
  
  if (parseInt(min_punkty) > parseInt(max_punkty)) {
    return res.status(400).json({ message: 'Minimalna liczba punktów nie może być większa od maksymalnej' });
  }
  
  if (parseInt(maly_blind) > parseInt(duzy_blind)) {
    return res.status(400).json({ message: 'Mały blind nie może być większy od dużego' });
  }
  
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
      
      // Tworzy stół
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


router.post('/poker/join', authenticateUser, (req, res) => {
  const { id_stolu } = req.body;

  const id_uzytkownika = req.user.id;
  
  if (!id_stolu) {
    return res.status(400).json({ message: 'ID stołu jest wymagane' });
  }
  
  // Sprawdza, czy stół istnieje i jest aktywny
  db.query(
    'SELECT * FROM stoly_poker WHERE id_stolu = ? AND czy_aktywny = TRUE',
    [id_stolu],
    (err, results) => {
      if (err) {
        console.error('Błąd zapytania:', err);
        return res.status(500).json({ message: 'Błąd serwera' });
      }
      
      if (results.length === 0) {
        return res.status(404).json({ message: 'Stół nie istnieje lub nie jest aktywny' });
      }
      
      const table = results[0];
      
      // Sprawdza, czy użytkownik ma wystarczającą liczbę punktów
      db.query(
        'SELECT punkty FROM uzytkownicy WHERE id_uzytkownika = ?',
        [id_uzytkownika],
        (err, userResults) => {
          if (err) {
            console.error('Błąd zapytania:', err);
            return res.status(500).json({ message: 'Błąd serwera' });
          }
          
          if (userResults.length === 0) {
            return res.status(404).json({ message: 'Użytkownik nie istnieje' });
          }
          
          const user = userResults[0];
          
          if (user.punkty < table.min_punkty) {
            return res.status(400).json({ 
              message: 'Nie masz wystarczającej liczby punktów, aby dołączyć do tego stołu' 
            });
          }
          
          // Sprawdza, czy użytkownik nie jest już przy stole
          db.query(
            'SELECT * FROM gracze_poker WHERE id_stolu = ? AND id_uzytkownika = ?',
            [id_stolu, id_uzytkownika],
            (err, existingResults) => {
              if (err) {
                console.error('Błąd zapytania:', err);
                return res.status(500).json({ message: 'Błąd serwera' });
              }
              
              if (existingResults.length > 0) {
                return res.status(400).json({ message: 'Jesteś już przy tym stole' });
              }
              
              // Sprawdza liczbę graczy przy stole
              db.query(
                'SELECT COUNT(*) as count FROM gracze_poker WHERE id_stolu = ? AND czy_aktywny = TRUE',
                [id_stolu],
                (err, countResults) => {
                  if (err) {
                    console.error('Błąd zapytania:', err);
                    return res.status(500).json({ message: 'Błąd serwera' });
                  }
                  
                  const currentPlayers = countResults[0].count;
                  
                  if (currentPlayers >= table.max_graczy) {
                    return res.status(400).json({ message: 'Stół jest pełny' });
                  }
                  
                  // Znajduje wolne miejsce przy stole
                  db.query(
                    `SELECT position_number FROM 
                     (SELECT @row := @row + 1 as position_number FROM 
                      (SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
                       UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 
                       UNION SELECT 9) t, 
                      (SELECT @row := 0) r 
                      LIMIT ?) as available_positions
                     WHERE position_number NOT IN 
                     (SELECT pozycja_siedzenia FROM gracze_poker WHERE id_stolu = ? AND czy_aktywny = TRUE)
                     LIMIT 1`,
                    [table.max_graczy, id_stolu],
                    (err, positionResults) => {
                      if (err) {
                        console.error('Błąd zapytania:', err);
                        return res.status(500).json({ message: 'Błąd serwera' });
                      }
                      
                      if (positionResults.length === 0) {
                        return res.status(400).json({ message: 'Brak wolnych miejsc przy stole' });
                      }
                      
                      const position = positionResults[0].position_number;
                      
                      // Dodaj gracza do stołu
                      db.query(
                        `INSERT INTO gracze_poker 
                         (id_stolu, id_uzytkownika, pozycja_siedzenia, czas_dolaczenia, czy_aktywny) 
                         VALUES (?, ?, ?, NOW(), TRUE)`,
                        [id_stolu, id_uzytkownika, position],
                        (err, result) => {
                          if (err) {
                            console.error('Błąd dołączania do stołu:', err);
                            return res.status(500).json({ message: 'Błąd podczas dołączania do stołu' });
                          }
                          
                          res.status(200).json({ 
                            message: 'Dołączono do stołu pomyślnie',
                            position: position
                          });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});

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
// Endpoint zwracający liczbę graczy przy stole
router.get('/poker/:id/players-count', (req, res) => {
  const tableId = req.params.id;
  
  db.query(
    'SELECT COUNT(*) as count FROM gracze_poker WHERE id_stolu = ? AND czy_aktywny = TRUE',
    [tableId],
    (err, results) => {
      if (err) {
        console.error('Błąd zapytania:', err);
        return res.status(500).json({ message: 'Błąd serwera' });
      }
      
      res.json({ count: results[0].count });
    }
  );
});
module.exports = router;