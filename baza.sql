-- Tabela użytkowników
CREATE TABLE uzytkownicy (
    id_uzytkownika INT AUTO_INCREMENT PRIMARY KEY,
    nazwa_uzytkownika VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    hash_hasla VARCHAR(255) NOT NULL,
    punkty INT DEFAULT 1000 NOT NULL,
    url_awatara VARCHAR(255),
    data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP,
    ostatnie_logowanie DATETIME,
    czy_aktywny BOOLEAN DEFAULT TRUE,
    rola ENUM('uzytkownik', 'admin', 'moderator') DEFAULT 'uzytkownik'
);

-- Tabela historii zmian punktów
CREATE TABLE transakcje_punktow (
    id_transakcji INT AUTO_INCREMENT PRIMARY KEY,
    id_uzytkownika INT NOT NULL,
    kwota INT NOT NULL,
    typ_transakcji ENUM('wygrana', 'przegrana', 'bonus_dzienny', 'korekta_admina') NOT NULL,
    typ_gry ENUM('poker', 'blackjack', 'ruletka') NULL,
    data_transakcji DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_uzytkownika) REFERENCES uzytkownicy(id_uzytkownika)
);

-- Tabela stołów pokerowych (Texas Hold'em)
CREATE TABLE stoly_poker (
    id_stolu INT AUTO_INCREMENT PRIMARY KEY,
    nazwa VARCHAR(100) NOT NULL,
    max_graczy INT NOT NULL DEFAULT 9,
    min_punkty INT DEFAULT 0,
    max_punkty INT DEFAULT 9999999,
    maly_blind INT NOT NULL,
    duzy_blind INT NOT NULL,
    utworzony_przez INT NOT NULL,
    data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP,
    czy_aktywny BOOLEAN DEFAULT TRUE,
    czy_prywatny BOOLEAN DEFAULT FALSE,
    haslo VARCHAR(255) NULL,
    FOREIGN KEY (utworzony_przez) REFERENCES uzytkownicy(id_uzytkownika)
);

-- Tabela stołów blackjack
CREATE TABLE stoly_blackjack (
    id_stolu INT AUTO_INCREMENT PRIMARY KEY,
    nazwa VARCHAR(100) NOT NULL,
    max_graczy INT NOT NULL DEFAULT 7,
    min_zaklad INT NOT NULL,
    max_zaklad INT NOT NULL,
    utworzony_przez INT NOT NULL,
    data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP,
    czy_aktywny BOOLEAN DEFAULT TRUE,
    czy_prywatny BOOLEAN DEFAULT FALSE,
    haslo VARCHAR(255) NULL,
    FOREIGN KEY (utworzony_przez) REFERENCES uzytkownicy(id_uzytkownika)
);

-- Tabela stołów ruletki
CREATE TABLE stoly_ruletka (
    id_stolu INT AUTO_INCREMENT PRIMARY KEY,
    nazwa VARCHAR(100) NOT NULL,
    min_zaklad INT NOT NULL,
    max_zaklad INT NOT NULL,
    utworzony_przez INT NOT NULL,
    data_utworzenia DATETIME DEFAULT CURRENT_TIMESTAMP,
    czy_aktywny BOOLEAN DEFAULT TRUE,
    czy_prywatny BOOLEAN DEFAULT FALSE,
    haslo VARCHAR(255) NULL,
    FOREIGN KEY (utworzony_przez) REFERENCES uzytkownicy(id_uzytkownika)
);

-- Tabela graczy w pokerze (przypisanie użytkowników do stołów)
CREATE TABLE gracze_poker (
    id_gracza INT AUTO_INCREMENT PRIMARY KEY,
    id_stolu INT NOT NULL,
    id_uzytkownika INT NOT NULL,
    pozycja_siedzenia INT NOT NULL,
    czas_dolaczenia DATETIME DEFAULT CURRENT_TIMESTAMP,
    czy_aktywny BOOLEAN DEFAULT TRUE,
    nieaktywny_od DATETIME NULL,
    FOREIGN KEY (id_stolu) REFERENCES stoly_poker(id_stolu),
    FOREIGN KEY (id_uzytkownika) REFERENCES uzytkownicy(id_uzytkownika),
    UNIQUE KEY unikalne_miejsce (id_stolu, pozycja_siedzenia),
    UNIQUE KEY jeden_gracz_jeden_stol (id_uzytkownika, id_stolu)
);

-- Tabela graczy w blackjacku (przypisanie użytkowników do stołów)
CREATE TABLE gracze_blackjack (
    id_gracza INT AUTO_INCREMENT PRIMARY KEY,
    id_stolu INT NOT NULL,
    id_uzytkownika INT NOT NULL,
    pozycja_siedzenia INT NOT NULL,
    czas_dolaczenia DATETIME DEFAULT CURRENT_TIMESTAMP,
    czy_aktywny BOOLEAN DEFAULT TRUE,
    nieaktywny_od DATETIME NULL,
    FOREIGN KEY (id_stolu) REFERENCES stoly_blackjack(id_stolu),
    FOREIGN KEY (id_uzytkownika) REFERENCES uzytkownicy(id_uzytkownika),
    UNIQUE KEY unikalne_miejsce (id_stolu, pozycja_siedzenia),
    UNIQUE KEY jeden_gracz_jeden_stol (id_uzytkownika, id_stolu)
);

-- Tabela graczy w ruletce (przypisanie użytkowników do stołów)
CREATE TABLE gracze_ruletka (
    id_gracza INT AUTO_INCREMENT PRIMARY KEY,
    id_stolu INT NOT NULL,
    id_uzytkownika INT NOT NULL,
    czas_dolaczenia DATETIME DEFAULT CURRENT_TIMESTAMP,
    czy_aktywny BOOLEAN DEFAULT TRUE,
    nieaktywny_od DATETIME NULL,
    FOREIGN KEY (id_stolu) REFERENCES stoly_ruletka(id_stolu),
    FOREIGN KEY (id_uzytkownika) REFERENCES uzytkownicy(id_uzytkownika),
    UNIQUE KEY jeden_gracz_jeden_stol (id_uzytkownika, id_stolu)
);

-- Indeksy dla optymalizacji zapytań
CREATE INDEX idx_transakcje_id_uzytkownika ON transakcje_punktow(id_uzytkownika);
CREATE INDEX idx_gracze_poker_id_stolu ON gracze_poker(id_stolu);
CREATE INDEX idx_gracze_poker_id_uzytkownika ON gracze_poker(id_uzytkownika);
CREATE INDEX idx_gracze_blackjack_id_stolu ON gracze_blackjack(id_stolu);
CREATE INDEX idx_gracze_blackjack_id_uzytkownika ON gracze_blackjack(id_uzytkownika);
CREATE INDEX idx_gracze_ruletka_id_stolu ON gracze_ruletka(id_stolu);
CREATE INDEX idx_gracze_ruletka_id_uzytkownika ON gracze_ruletka(id_uzytkownika);