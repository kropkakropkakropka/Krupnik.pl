const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const { verifyToken } = require('./config/jwt');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Przechowujemy połączenia i informacje o grach
const tables = new Map(); // Mapa stołów: tableId -> Table
const clients = new Map(); // Mapa klientów: ws -> Client

// Struktura danych dla stołu
class Table {
  constructor(id) {
    this.id = id;
    this.players = new Map(); // Mapa graczy: position -> Player
    this.gameState = {
      pot: 0,
      communityCards: [],
      currentAction: null,
      smallBlind: 5,
      bigBlind: 10,
      dealerPosition: 1,
      currentTurn: null,
      gamePhase: 'waiting' // waiting, preflop, flop, turn, river, showdown
    };
    this.deck = null; // Talia kart
  }
  
  addPlayer(player) {
    this.players.set(player.position, player);
    this.broadcastGameState();
  }
  
  removePlayer(position) {
    this.players.delete(position);
    this.broadcastGameState();
    
    // Jeśli został tylko jeden gracz, zakończ grę
    if (this.players.size <= 1) {
      this.resetGame();
    }
  }
  
  startGame() {
    if (this.players.size < 2) return; // Potrzeba min. 2 graczy
    if (this.gameState.gamePhase !== 'waiting') return; // Gra już trwa
    
    // Rozdaj karty
    this.dealCards();
    
    // Ustaw blindy
    this.setUpBlinds();
    
    // Przejdź do fazy preflop
    this.gameState.gamePhase = 'preflop';
    
    // Ustal, kto zaczyna licytację (następny po big blindzie)
    this.setNextPlayerTurn();
    
    // Wyślij aktualizację stanu gry
    this.broadcastGameState();
  }
  
  dealCards() {
    // Stwórz talię kart
    this.deck = this.createDeck();
    this.deck = this.shuffleDeck(this.deck);
    
    // Rozdaj po 2 karty każdemu graczowi
    this.players.forEach(player => {
      player.cards = [this.deck.pop(), this.deck.pop()];
      player.folded = false;
      player.bet = 0;
      
      // Wyślij karty tylko do danego gracza
      this.sendPlayerCards(player);
    });
  }
  
  createDeck() {
    const suits = ['h', 'd', 'c', 's']; // hearts, diamonds, clubs, spades
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    
    for (const suit of suits) {
      for (const value of values) {
        deck.push(value + suit);
      }
    }
    
    return deck;
  }
  
  shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
  }
  
  setUpBlinds() {
    const positions = Array.from(this.players.keys()).sort((a, b) => a - b);
    
    // Ustal dealer position, small blind i big blind
    const dealerPos = this.gameState.dealerPosition;
    
    // Znajdź indeks dealera w posortowanej tablicy pozycji
    const dealerIndex = positions.indexOf(dealerPos) !== -1 ? positions.indexOf(dealerPos) : 0;
    
    // Small blind to następny gracz po dealerze
    const sbIndex = (dealerIndex + 1) % positions.length;
    const sbPosition = positions[sbIndex];
    
    // Big blind to następny gracz po small blindzie
    const bbIndex = (sbIndex + 1) % positions.length;
    const bbPosition = positions[bbIndex];
    
    // Ustaw blindy
    const sbPlayer = this.players.get(sbPosition);
    const bbPlayer = this.players.get(bbPosition);
    
    sbPlayer.bet = this.gameState.smallBlind;
    sbPlayer.stack -= this.gameState.smallBlind;
    
    bbPlayer.bet = this.gameState.bigBlind;
    bbPlayer.stack -= this.gameState.bigBlind;
    
    // Aktualizuj pulę
    this.gameState.pot = this.gameState.smallBlind + this.gameState.bigBlind;
    
    // Wyślij wiadomość do chatu
    this.broadcastChatMessage({
      system: true,
      text: `${sbPlayer.name} wpłaca mały blind: ${this.gameState.smallBlind}`
    });
    
    this.broadcastChatMessage({
      system: true,
      text: `${bbPlayer.name} wpłaca duży blind: ${this.gameState.bigBlind}`
    });
  }
  
  setNextPlayerTurn() {
    const positions = Array.from(this.players.keys()).sort((a, b) => a - b);
    
    // Jeśli nie ma aktualnego gracza, zacznij od następnego po big blindzie
    if (!this.gameState.currentTurn) {
      // Znajdź indeks big blinda (następny po small blindzie, który jest następny po dealerze)
      const dealerIndex = positions.indexOf(this.gameState.dealerPosition) !== -1 ? positions.indexOf(this.gameState.dealerPosition) : 0;
      const sbIndex = (dealerIndex + 1) % positions.length;
      const bbIndex = (sbIndex + 1) % positions.length;
      
      // Następny po big blindzie
      const nextIndex = (bbIndex + 1) % positions.length;
      this.gameState.currentTurn = positions[nextIndex];
    } else {
      // Znajdź indeks aktualnego gracza
      const currentIndex = positions.indexOf(this.gameState.currentTurn);
      
      // Następny gracz
      const nextIndex = (currentIndex + 1) % positions.length;
      this.gameState.currentTurn = positions[nextIndex];
    }
    
    // Sprawdź, czy wszyscy złożyli takie same zakłady (runda licytacji się kończy)
    const allEqualBets = this.checkAllEqualBets();
    
    if (allEqualBets) {
      this.moveToNextPhase();
    } else {
      // Powiadom gracza o jego turze
      this.notifyPlayerTurn();
    }
  }
  
  checkAllEqualBets() {
    // Pobierz najwyższy zakład
    let highestBet = 0;
    
    this.players.forEach(player => {
      if (player.bet > highestBet && !player.folded) {
        highestBet = player.bet;
      }
    });
    
    // Sprawdź, czy wszyscy gracze złożyli równe zakłady lub spasowali
    let allEqual = true;
    
    this.players.forEach(player => {
      if (!player.folded && player.bet !== highestBet) {
        allEqual = false;
      }
    });
    
    return allEqual;
  }
  
  moveToNextPhase() {
    switch (this.gameState.gamePhase) {
      case 'preflop':
        // Rozdaj flop (3 karty)
        this.gameState.communityCards = [
          this.deck.pop(),
          this.deck.pop(),
          this.deck.pop()
        ];
        this.gameState.gamePhase = 'flop';
        break;
        
      case 'flop':
        // Rozdaj turn (1 karta)
        this.gameState.communityCards.push(this.deck.pop());
        this.gameState.gamePhase = 'turn';
        break;
        
      case 'turn':
        // Rozdaj river (1 karta)
        this.gameState.communityCards.push(this.deck.pop());
        this.gameState.gamePhase = 'river';
        break;
        
      case 'river':
        // Sprawdź wyniki
        this.showdown();
        return;
    }
    
    // Resetuj zakłady graczy
    this.players.forEach(player => {
      player.bet = 0;
    });
    
    // Rozpocznij nową rundę licytacji od pierwszego gracza po dealerze
    const positions = Array.from(this.players.keys()).sort((a, b) => a - b);
    const dealerIndex = positions.indexOf(this.gameState.dealerPosition) !== -1 ? positions.indexOf(this.gameState.dealerPosition) : 0;
    const nextIndex = (dealerIndex + 1) % positions.length;
    this.gameState.currentTurn = positions[nextIndex];
    
    // Wyślij wiadomość do chatu
    this.broadcastChatMessage({
      system: true,
      text: `Nowa faza: ${this.gameState.gamePhase}`
    });
    
    // Wyślij aktualizację stanu gry
    this.broadcastGameState();
    
    // Powiadom gracza o jego turze
    this.notifyPlayerTurn();
  }
  
  showdown() {
    this.gameState.gamePhase = 'showdown';
    
    // Tutaj powinna być logika sprawdzania wartości rąk i wyłaniania zwycięzcy
    // Na potrzeby przykładu, wybieramy losowego zwycięzcę
    const activePlayers = Array.from(this.players.values()).filter(player => !player.folded);
    
    if (activePlayers.length === 0) {
      this.resetGame();
      return;
    }
    
    const winner = activePlayers[Math.floor(Math.random() * activePlayers.length)];
    winner.stack += this.gameState.pot;
    
    // Przygotuj dane o wynikach
    const results = activePlayers.map(player => ({
      name: player.name,
      handName: 'Przykładowy układ', // W rzeczywistości trzeba obliczyć wartość ręki
      winner: player.position === winner.position,
      winAmount: player.position === winner.position ? this.gameState.pot : 0
    }));
    
    // Wyślij wyniki do wszystkich graczy
    this.broadcast({
      type: 'handResult',
      payload: {
        players: results
      }
    });
    
    // Wyślij wiadomość do chatu
    this.broadcastChatMessage({
      system: true,
      text: `${winner.name} wygrywa pulę: ${this.gameState.pot}!`
    });
    
    // Po krótkiej pauzie resetuj grę
    setTimeout(() => {
      this.resetGame();
    }, 5000);
  }
  
  resetGame() {
    // Przesuń dealera na następnego gracza
    const positions = Array.from(this.players.keys()).sort((a, b) => a - b);
    
    if (positions.length > 0) {
      const dealerIndex = positions.indexOf(this.gameState.dealerPosition) !== -1 ? positions.indexOf(this.gameState.dealerPosition) : 0;
      const nextDealerIndex = (dealerIndex + 1) % positions.length;
      this.gameState.dealerPosition = positions[nextDealerIndex];
    }
    
    // Resetuj stan gry
    this.gameState.pot = 0;
    this.gameState.communityCards = [];
    this.gameState.currentTurn = null;
    this.gameState.gamePhase = 'waiting';
    
    // Resetuj stan graczy
    this.players.forEach(player => {
      player.cards = [];
      player.bet = 0;
      player.folded = false;
    });
    
    // Wyślij aktualizację stanu gry
    this.broadcastGameState();
    
    // Automatycznie rozpocznij nową grę, jeśli jest co najmniej 2 graczy
    if (this.players.size >= 2) {
      setTimeout(() => {
        this.startGame();
      }, 3000);
    }
  }
  
  notifyPlayerTurn() {
    const player = this.players.get(this.gameState.currentTurn);
    
    if (!player || player.folded) {
      // Jeśli gracz spasował, przejdź do następnego
      this.setNextPlayerTurn();
      return;
    }
    
    // Znajdź najwyższy zakład
    let highestBet = 0;
    
    this.players.forEach(p => {
      if (p.bet > highestBet) {
        highestBet = p.bet;
      }
    });
    
    // Określ dozwolone akcje
    const actions = ['fold'];
    
    if (player.bet === highestBet) {
      actions.push('check');
    } else {
      actions.push('call');
    }
    
    // Zawsze można podbić, jeśli ma się żetony
    if (player.stack > 0) {
      actions.push('raise');
    }
    
    // Wyślij informację o turze do gracza
    const client = Array.from(clients.entries())
      .find(([_, c]) => c.userId === player.userId && c.tableId === this.id && c.position === player.position);
    
    if (client) {
      const ws = client[0];
      
      ws.send(JSON.stringify({
        type: 'playerTurn',
        payload: {
          isMyTurn: true,
          actions,
          callAmount: highestBet - player.bet,
          minRaise: highestBet + this.gameState.bigBlind,
          maxRaise: player.stack
        }
      }));
    }
    
    // Wyślij wiadomość do chatu
    this.broadcastChatMessage({
      system: true,
      text: `Teraz gra: ${player.name}`
    });
  }
  
  handlePlayerAction(player, action, amount = null) {
    // Sprawdź, czy to tura tego gracza
    if (this.gameState.currentTurn !== player.position) {
      return false;
    }
    
    // Znajdź najwyższy zakład
    let highestBet = 0;
    
    this.players.forEach(p => {
      if (p.bet > highestBet) {
        highestBet = p.bet;
      }
    });
    
    switch (action) {
      case 'fold':
        player.folded = true;
        this.broadcastChatMessage({
          system: true,
          text: `${player.name} pasuje`
        });
        break;
        
      case 'check':
        // Check jest możliwy tylko gdy bet gracza = highestBet
        if (player.bet !== highestBet) return false;
        
        this.broadcastChatMessage({
          system: true,
          text: `${player.name} sprawdza`
        });
        break;
        
      case 'call':
        // Call do wysokości najwyższego zakładu
        const callAmount = highestBet - player.bet;
        
        if (callAmount <= 0 || callAmount > player.stack) return false;
        
        player.stack -= callAmount;
        player.bet += callAmount;
        this.gameState.pot += callAmount;
        
        this.broadcastChatMessage({
          system: true,
          text: `${player.name} sprawdza za ${callAmount}`
        });
        break;
        
      case 'raise':
        // Raise musi być co najmniej o wartość big blinda większy od najwyższego zakładu
        if (!amount || amount <= highestBet || amount - player.bet > player.stack) return false;
        
        const raiseAmount = amount - player.bet;
        player.stack -= raiseAmount;
        player.bet = amount;
        this.gameState.pot += raiseAmount;
        
        this.broadcastChatMessage({
          system: true,
          text: `${player.name} podbija do ${amount}`
        });
        break;
    }
    
    // Sprawdź, czy został tylko jeden aktywny gracz
    const activePlayers = Array.from(this.players.values()).filter(p => !p.folded);
    
    if (activePlayers.length === 1) {
      // Jeden gracz wygrał przez fold innych
      const winner = activePlayers[0];
      winner.stack += this.gameState.pot;
      
      this.broadcastChatMessage({
        system: true,
        text: `${winner.name} wygrywa pulę: ${this.gameState.pot}!`
      });
      
      // Wyślij wyniki
      this.broadcast({
        type: 'handResult',
        payload: {
          players: [{
            name: winner.name,
            handName: 'Zwycięstwo przez fold',
            winner: true,
            winAmount: this.gameState.pot
          }]
        }
      });
      
      // Po krótkiej pauzie resetuj grę
      setTimeout(() => {
        this.resetGame();
      }, 3000);
      
      return true;
    }
    
    // Przejdź do następnego gracza
    this.setNextPlayerTurn();
    
    // Wyślij aktualizację stanu gry
    this.broadcastGameState();
    
    return true;
  }
  
  sendPlayerCards(player) {
    // Znajdź websocket klienta
    const client = Array.from(clients.entries())
      .find(([_, c]) => c.userId === player.userId && c.tableId === this.id && c.position === player.position);
    
    if (client) {
      const ws = client[0];
      
      ws.send(JSON.stringify({
        type: 'playerCards',
        payload: {
          cards: player.cards
        }
      }));
    }
  }
  
  broadcastGameState() {
    // Przygotuj dane stanu gry do wysyłki
    const gameStateData = {
      ...this.gameState,
      players: Array.from(this.players.values()).map(player => ({
        position: player.position,
        name: player.name,
        stack: player.stack,
        bet: player.bet,
        folded: player.folded,
        active: player.position === this.gameState.currentTurn
      }))
    };
    
    // Wyślij stan gry do wszystkich graczy przy stole
    this.broadcast({
      type: 'gameState',
      payload: gameStateData
    });
  }
  
  broadcastChatMessage(message) {
    this.broadcast({
      type: 'chat',
      payload: message
    });
  }
  
  broadcast(data) {
    clients.forEach((client, ws) => {
      if (client.tableId === this.id && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    });
  }
}

// Klasa dla klienta (połączenie WebSocket)
class Client {
  constructor(userId, username, tableId, position) {
    this.userId = userId;
    this.username = username;
    this.tableId = tableId;
    this.position = position;
  }
}

// Obsługa połączeń WebSocket
wss.on('connection', (ws, req) => {
  const params = url.parse(req.url, true).query;
  const { tableId, position, token } = params;
  
  // Weryfikuj token
  const decoded = verifyToken(token);
  
  if (!decoded) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  
  const userId = decoded.id;
  const username = decoded.username;
  
  // Stwórz klienta
  const client = new Client(userId, username, tableId, parseInt(position));
  clients.set(ws, client);
  
  // Pobierz lub stwórz stół
  let table = tables.get(tableId);
  
  if (!table) {
    table = new Table(tableId);
    tables.set(tableId, table);
  }
  
  // Dodaj gracza do stołu
  const player = {
    userId,
    name: username,
    position: parseInt(position),
    stack: 1000, // Początkowy stack
    bet: 0,
    cards: [],
    folded: false
  };
  
  table.addPlayer(player);
  
  // Wyślij wiadomość o dołączeniu gracza
  table.broadcastChatMessage({
    system: true,
    text: `${username} dołączył do stołu`
  });
  
  // Automatycznie rozpocznij grę, jeśli jest co najmniej 2 graczy
  if (table.players.size >= 2 && table.gameState.gamePhase === 'waiting') {
    setTimeout(() => {
      table.startGame();
    }, 2000);
  }
  
  // Obsługa wiadomości od klienta
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'action':
          // Obsługa akcji gracza (fold, check, call, raise)
          if (table && table.players.has(parseInt(position))) {
            table.handlePlayerAction(
              table.players.get(parseInt(position)),
              data.payload.action,
              data.payload.amount
            );
          }
          break;
          
        case 'chat':
          // Obsługa wiadomości czatu
          if (table) {
            table.broadcastChatMessage({
              sender: username,
              text: data.payload.text
            });
          }
          break;
      }
    } catch (error) {
      console.error('Błąd przetwarzania wiadomości:', error);
    }
  });
  
  // Obsługa rozłączenia
  ws.on('close', () => {
    const client = clients.get(ws);
    
    if (client) {
      const table = tables.get(client.tableId);
      
      if (table) {
        // Usuń gracza ze stołu
        table.removePlayer(client.position);
        
        // Wyślij wiadomość o wyjściu gracza
        table.broadcastChatMessage({
          system: true,
          text: `${client.username} opuścił stół`
        });
      }
      
      clients.delete(ws);
    }
  });
});

// Uruchom serwer WebSocket
const PORT = process.env.WS_PORT || 5001;
server.listen(PORT, () => {
  console.log(`Serwer WebSocket uruchomiony na porcie ${PORT}`);
});

module.exports = server;